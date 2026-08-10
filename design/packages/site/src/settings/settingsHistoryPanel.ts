/**
 * The settings history surface.
 *
 * `settingsHistory.ts` owns the record; this owns the only way a visitor sees it. The
 * panel is a factory rather than a page because the settings page drops it into a group
 * beside every other control, exactly as the scheduled-settings editor is dropped in.
 *
 * Three filters narrow the list, and the interesting design decision is that they
 * compose rather than take turns. Action, date range and text each remove records
 * independently, so a visitor can ask for "every reset in March mentioning theme" in one
 * pass. The alternative — the last filter touched winning — produces a list that still
 * looks plausible and is quietly wrong, which is the failure mode worth engineering
 * against here.
 *
 * Each action carries its count, including the actions with none. A missing row and a
 * row reading zero look nothing alike to a visitor wondering whether a filter works, and
 * only one of them answers the question.
 *
 * Nothing here invents a colour. Every visible surface reuses a class the settings
 * stylesheet already defines, so this panel inherits the generated Material role sheet
 * along with everything around it and has no way to drift from it.
 */

import { clear, el, icon, uniqueId } from "../platform/dom.js";
import { attachRegexBuilder } from "../search/attachBuilder.js";
import { createDateRangePicker } from "../content/dateRangePicker.js";
import { confirmDestructive } from "./confirm.js";
import type { I18n } from "../i18n/I18n.js";
import { fillPhrase, registerStrings, subscribeI18n, t } from "./i18n.js";
import type { StringTable } from "./i18n.js";
import {
    HISTORY_ACTIONS,
    actionCounts,
    filterHistory,
    recordLabelValues,
    type SettingsHistory,
    type SettingsHistoryAction,
    type SettingsHistoryRecord,
} from "./settingsHistory.js";
import type { SettingsStore } from "./store.js";

export interface SettingsHistoryPanelOptions {
    readonly history: SettingsHistory;
    /** Where a restore writes to, and the source of each setting's current declaration. */
    readonly store: SettingsStore;
    /** The site-wide language port, required by the shared date range picker. */
    readonly i18n: I18n;
    readonly notify?: ((message: string, error: boolean) => void) | undefined;
}

export interface SettingsHistoryPanelView {
    readonly element: HTMLElement;
    /** Re-read the records and re-resolve every phrase. Safe to call at any time. */
    refresh(): void;
    destroy(): void;
}

export function createSettingsHistoryPanel(
    options: SettingsHistoryPanelOptions,
): SettingsHistoryPanelView {
    const root = el("div", { class: "mb-schedule", data: { historySurface: "history" } });
    const disposers: (() => void)[] = [];

    const selectedActions = new Set<SettingsHistoryAction>();
    let query = "";
    let matcher: ((text: string) => boolean) | null = null;
    let invalidPattern = false;

    const intro = phrase("history.intro", "p", "md-field__help mb-help");

    const searchId = uniqueId("history-search");
    const searchLabel = el("label", { class: "md-field__label", attrs: { for: searchId } });
    const searchInput = el("input", {
        class: "md-field__input mb-search-input",
        attrs: {
            id: searchId,
            type: "search",
            autocomplete: "off",
            spellcheck: "false",
            "aria-describedby": `${searchId}-hint`,
        },
    });
    const builderSlot = el("span", { class: "mb-search-builder-slot" });
    const searchField = el("div", { class: "mb-search-field" }, searchInput, builderSlot);
    const searchHint = el("p", {
        class: "md-field__help mb-help",
        attrs: { id: `${searchId}-hint` },
    });
    const clearSearch = el("button", { class: "md-icon-button", attrs: { type: "button" } });
    clearSearch.append(icon("close"));

    const datePicker = createDateRangePicker(options.i18n);
    const dateRow = el(
        "div",
        { class: "mb-property-row" },
        phrase("history.dateFilter", "span", "md-field__label"),
        datePicker.element,
    );

    const actionFieldset = el(
        "fieldset",
        { class: "mb-schedule-weekdays", data: { historyPart: "actions" } },
        phrase("history.actionFilter", "legend", "md-field__label"),
    );
    /** One row per action, built once so a re-render cannot move focus off a checkbox. */
    const actionRows = HISTORY_ACTIONS.map((action) => {
        const input = el("input", { attrs: { type: "checkbox", value: action } });
        const name = phrase(`history.action.${action}`, "span");
        const count = el("span", { data: { historyCount: action } });
        input.addEventListener("change", () => {
            if (input.checked) selectedActions.add(action);
            else selectedActions.delete(action);
            renderList();
        });
        actionFieldset.append(el("label", { class: "mb-check-row" }, input, name, count));
        return { action, input, count };
    });

    const summary = el("p", {
        class: "md-field__help mb-help",
        attrs: { role: "status", "aria-live": "polite" },
    });
    const list = el("div", { class: "mb-schedule-history", data: { historyPart: "list" } });

    const pruneButton = actionButton("history.prune", "md-button md-button--outlined");
    const retentionNote = el("p", { class: "mb-capability-note" });

    root.append(
        intro,
        el("div", { class: "mb-search-row" }, searchLabel, searchField, clearSearch),
        searchHint,
        dateRow,
        actionFieldset,
        summary,
        list,
        el("div", { class: "mb-button-row" }, pruneButton),
        retentionNote,
    );

    /**
     * Plain text is the default and regex is an explicit opt-in through the adjacent
     * builder, exactly as every other search field on the site behaves. The builder is
     * anchored to this field alone: attaching it here rather than reaching for a shared
     * one is what stops a pattern built for the history list from being applied to
     * whichever search box happened to be touched last.
     */
    const builder = attachRegexBuilder(searchInput, {
        fieldId: "settings.history",
        fieldLabel: t("history.searchLabel"),
        container: builderSlot,
        sampleProvider: () => options.history.records().map(searchableText).join("\n"),
        onChange: (spec) => {
            if (spec.mode !== "regex") {
                invalidPattern = false;
                matcher = null;
                renderList();
                return;
            }
            if (!spec.valid) {
                // An uncompilable pattern filters nothing away silently. The list keeps
                // showing what it showed, and the summary says the pattern is the reason
                // no narrowing happened.
                invalidPattern = true;
                matcher = null;
                renderList();
                return;
            }
            try {
                const expression = new RegExp(spec.query, spec.flags);
                invalidPattern = false;
                matcher = (text: string): boolean => {
                    // Global and sticky flags make `test` stateful, so the cursor is reset
                    // for every record. Without this the same predicate alternates hits and
                    // misses down a list, which reads as records randomly disappearing.
                    expression.lastIndex = 0;
                    return expression.test(text);
                };
            } catch {
                invalidPattern = true;
                matcher = null;
            }
            renderList();
        },
    });

    searchInput.addEventListener("input", () => {
        query = searchInput.value;
        renderList();
    });
    clearSearch.addEventListener("click", () => {
        searchInput.value = "";
        query = "";
        builder.model.setFieldValue("");
        searchInput.focus();
        renderList();
    });
    pruneButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            /*
             * Pruning is the one action on this panel that cannot be undone by the panel
             * itself. Everything else here — restoring, filtering, searching — is either
             * reversible through the same controls or changes nothing at all, but a pruned
             * record is gone, and the history is the very thing a visitor comes here to rely on
             * when they want something back. So it goes behind the same two-key gate every
             * other irreversible batch in this project stands behind, rather than being the
             * exception because the records are "only" history.
             */
            const confirmed = await confirmDestructive(
                t("history.pruneReady", { overflow: options.history.overflow() }),
            );
            if (!confirmed) return;
            const report = options.history.prune();
            options.notify?.(
                report.removed === 0
                    ? t("history.pruneNothing")
                    : t("history.pruneDone", {
                          removed: report.removed,
                          remaining: report.remaining,
                      }),
                false,
            );
            renderList();
        })();
    });

    disposers.push(datePicker.subscribe(() => renderList()));
    disposers.push(options.history.subscribe(() => renderList()));
    disposers.push(subscribeI18n(() => refresh()));

    /**
     * What a text search sees.
     *
     * The resolved label plus the setting ids. The ids are facts a visitor is likely to
     * search for by name, and they are the same in every language, so leaving them out
     * would make the obvious search — typing the id of the setting you are looking for —
     * the one search that finds nothing.
     */
    function searchableText(record: SettingsHistoryRecord): string {
        return `${t(record.labelKey, recordLabelValues(record))} ${record.settingIds.join(" ")}`;
    }

    function currentMatcher(): ((text: string) => boolean) | undefined {
        if (matcher !== null) return matcher;
        const needle = query.trim().toLowerCase();
        if (needle === "") return undefined;
        return (text: string): boolean => text.toLowerCase().includes(needle);
    }

    /** The list, in the order a visitor reads a history: most recent first. */
    function visibleRecords(): readonly SettingsHistoryRecord[] {
        const range = datePicker.range();
        const filtered = filterHistory(
            options.history.records(),
            {
                actions: [...selectedActions],
                start: range.start,
                end: range.end,
                matches: currentMatcher(),
            },
            searchableText,
        );
        return [...filtered].reverse();
    }

    /**
     * Name every filter that is currently narrowing the list.
     *
     * A blank panel that says only "nothing here" leaves a visitor unable to tell an
     * empty history from a filter they forgot they set, so the empty state states the
     * filters back to them.
     */
    function describeFilters(): string {
        const parts: string[] = [];
        if (selectedActions.size > 0) {
            parts.push(
                t("history.filterPart.actions", {
                    actions: [...selectedActions]
                        .map((action) => t(`history.action.${action}`))
                        .join(", "),
                }),
            );
        }
        const range = datePicker.range();
        if (range.start !== "" || range.end !== "") {
            parts.push(
                t("history.filterPart.dates", {
                    start: range.start === "" ? t("history.anyDate") : range.start,
                    end: range.end === "" ? t("history.anyDate") : range.end,
                }),
            );
        }
        if (query.trim() !== "") parts.push(t("history.filterPart.text", { query: query.trim() }));
        return parts.length === 0 ? t("history.filterPart.none") : parts.join(" · ");
    }

    function renderList(): void {
        const all = options.history.records();
        const counts = actionCounts(all);
        for (const row of actionRows) {
            const count = counts.find((entry) => entry.action === row.action)?.count ?? 0;
            row.count.textContent = ` (${count})`;
            row.input.setAttribute(
                "aria-label",
                t("history.actionWithCount", {
                    action: t(`history.action.${row.action}`),
                    count,
                }),
            );
        }

        const records = visibleRecords();
        summary.textContent = invalidPattern
            ? t("history.invalidPattern")
            : records.length === 1
              ? t("history.resultsOne", { total: all.length })
              : t("history.results", { count: records.length, total: all.length });

        clear(list);
        if (records.length === 0) {
            list.append(
                all.length === 0
                    ? phrase("history.emptyNoRecords", "p", "mb-empty")
                    : el("p", {
                          class: "mb-empty",
                          text: t("history.emptyFiltered", { filters: describeFilters() }),
                      }),
            );
        } else {
            for (const record of records) list.append(recordRow(record));
        }

        const overflow = options.history.overflow();
        pruneButton.disabled = overflow === 0;
        // A disabled control that does not say which condition is unmet reads as broken
        // rather than as inapplicable, so the reason travels with the button itself.
        pruneButton.title =
            overflow === 0
                ? t("history.pruneNotNeeded", { retention: options.history.retention })
                : t("history.pruneReady", { overflow });
        retentionNote.textContent = t("history.retention", {
            kept: all.length,
            retention: options.history.retention,
        });
    }

    function recordRow(record: SettingsHistoryRecord): HTMLElement {
        const label = t(record.labelKey, recordLabelValues(record));
        // The timestamp is a fact and is rendered in the visitor's own zone and locale,
        // never restyled by the funny level.
        const when = new Date(record.at).toLocaleString();
        const restore = actionButton("history.restore", "md-button md-button--text");
        const restorable = record.changes.filter(
            (change) =>
                change.previous !== null && options.store.definition(change.id) !== undefined,
        );
        restore.disabled = restorable.length === 0;
        restore.setAttribute(
            "aria-label",
            restore.disabled
                ? t("history.restoreUnavailableLabel", { label })
                : t("history.restoreLabel", { label }),
        );
        restore.title = restore.disabled
            ? t("history.restoreUnavailable")
            : t("history.restorePreview", {
                  ids: restorable.map((change) => change.id).join(", "),
              });
        restore.addEventListener("click", () => {
            const report = options.history.restore(record.id, options.store);
            options.notify?.(
                report.restored.length === 0
                    ? t("history.restoreNothing")
                    : t("history.restoreDone", {
                          count: report.restored.length,
                          ids: report.restored.join(", "),
                      }),
                report.restored.length === 0,
            );
            renderList();
        });
        return el(
            "div",
            { class: "mb-history-row", data: { historyRecord: record.id } },
            el("span", { text: `${when} · ${label}` }),
            restore,
        );
    }

    function refresh(): void {
        for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-key]")) {
            const key = node.dataset["i18nKey"];
            if (key !== undefined) fillPhrase(node, key);
        }
        fillPhrase(searchLabel, "history.searchLabel");
        fillPhrase(searchHint, "history.searchHint");
        searchInput.placeholder = t("history.searchPlaceholder");
        clearSearch.setAttribute("aria-label", t("history.searchClear"));
        renderList();
    }

    refresh();

    return {
        element: root,
        refresh,
        destroy(): void {
            for (const dispose of disposers) dispose();
            builder.destroy();
            datePicker.destroy();
        },
    };
}

function phrase(key: string, tag: keyof HTMLElementTagNameMap = "span", className = ""): HTMLElement {
    const node = el(tag, { class: className, data: { i18nKey: key } });
    fillPhrase(node, key);
    return node;
}

function actionButton(key: string, className: string): HTMLButtonElement {
    return el("button", {
        class: className,
        data: { i18nKey: key },
        text: t(key),
        attrs: { type: "button" },
    });
}

/**
 * Copy for the history surface, in English and Hong Kong Cantonese.
 *
 * The rule the rest of the settings copy follows applies here with more force than
 * usual, because this surface is where a visitor decides whether to undo something: a
 * setting id, a timestamp, a count, and what a restore is about to write are facts and
 * read identically at every funny level. Only the framing around them moves.
 */
export const HISTORY_STRINGS: StringTable = {
    "history.title": {
        en: { 1: "Change history", 3: "Change history", 5: "Change history, receipts included" },
        yue: { 1: "更改記錄", 3: "更改記錄", 5: "更改記錄，有齊單據" },
    },
    "history.intro": {
        en: {
            1: "Every settings change is recorded in this browser. Restoring a value adds a new record; nothing is ever rewritten.",
            3: "Every settings change is recorded in this browser. Restoring adds a new record rather than rewinding, so an undo can itself be undone.",
            5: "Everything you fiddle with lands here. Restoring writes a fresh line instead of scrubbing the old one, so you can undo your undo, and then undo that too.",
        },
        yue: {
            1: "所有設定更改都記錄喺呢個瀏覽器。還原會加一筆新記錄，唔會改舊記錄。",
            3: "所有設定更改都記錄喺呢個瀏覽器。還原係加多一筆，唔係倒帶，所以撤銷都可以再撤銷。",
            5: "你郁過嘅嘢全部落簿。還原係寫多行，唔係擦走舊嗰行，所以撤銷完仲可以再撤銷返。",
        },
    },
    "history.searchLabel": { en: "Search change history", yue: "搜尋更改記錄" },
    "history.searchPlaceholder": { en: "Search records", yue: "搜尋記錄" },
    "history.searchHint": {
        en: "Plain text by default. Open the pattern builder for regular expressions. Search, dates and actions narrow together.",
        yue: "預設係普通文字。要用正則就開圖案建構器。搜尋、日期同動作會一齊收窄。",
    },
    "history.searchClear": { en: "Clear search", yue: "清除搜尋" },
    "history.invalidPattern": {
        en: "That pattern will not compile, so nothing was filtered out.",
        yue: "呢個圖案編譯唔到，所以冇篩走任何嘢。",
    },
    "history.dateFilter": { en: "Date range", yue: "日期範圍" },
    "history.actionFilter": { en: "Filter by action", yue: "按動作篩選" },
    "history.anyDate": { en: "any date", yue: "任何日期" },
    "history.action.changed": { en: "Changed", yue: "改咗" },
    "history.action.reset": { en: "Reset", yue: "重設" },
    "history.action.reset-all": { en: "Reset everything", yue: "全部重設" },
    "history.action.imported": { en: "Imported", yue: "匯入" },
    "history.action.restored": { en: "Restored", yue: "還原" },
    "history.action.scheduled-override": { en: "Scheduled rule", yue: "排程規則" },
    "history.actionWithCount": {
        en: "{action}, {count} records",
        yue: "{action}，{count} 筆記錄",
    },
    "history.label.changed": {
        en: { 1: "Changed {ids}", 3: "Changed {ids}", 5: "Had a go at {ids}" },
        yue: { 1: "改咗 {ids}", 3: "改咗 {ids}", 5: "郁咗 {ids}" },
    },
    "history.label.reset": {
        en: { 1: "Reset {ids} to its default", 3: "Reset {ids} to its default", 5: "Sent {ids} back to its default" },
        yue: { 1: "將 {ids} 還原做預設", 3: "將 {ids} 還原做預設", 5: "打返 {ids} 去預設" },
    },
    "history.label.reset-all": {
        en: {
            1: "Reset every setting ({count})",
            3: "Reset every setting ({count})",
            5: "Cleared the decks: {count} settings back to default",
        },
        yue: {
            1: "重設全部設定（{count} 項）",
            3: "重設全部設定（{count} 項）",
            5: "一次過清枱：{count} 項設定返晒預設",
        },
    },
    "history.label.imported": {
        en: { 1: "Imported {count} settings: {ids}", 3: "Imported {count} settings: {ids}", 5: "Took delivery of {count} settings: {ids}" },
        yue: { 1: "匯入咗 {count} 項設定：{ids}", 3: "匯入咗 {count} 項設定：{ids}", 5: "收貨：{count} 項設定，{ids}" },
    },
    "history.label.restored": {
        en: { 1: "Restored {ids}", 3: "Restored {ids}", 5: "Put {ids} back where it was" },
        yue: { 1: "還原咗 {ids}", 3: "還原咗 {ids}", 5: "將 {ids} 擺返原位" },
    },
    "history.label.scheduled-override": {
        en: {
            1: "Scheduled rule applied to {ids}",
            3: "Scheduled rule applied to {ids}",
            5: "A scheduled rule turned up and took over {ids}",
        },
        yue: {
            1: "排程規則套用咗喺 {ids}",
            3: "排程規則套用咗喺 {ids}",
            5: "排程規則殺到，接管咗 {ids}",
        },
    },
    "history.results": {
        en: "{count} of {total} records match",
        yue: "{total} 筆之中有 {count} 筆合到",
    },
    "history.resultsOne": {
        en: "1 of {total} records matches",
        yue: "{total} 筆之中有 1 筆合到",
    },
    "history.emptyNoRecords": {
        en: {
            1: "Nothing has been changed yet, so there is nothing to restore.",
            3: "Nothing has been changed yet, so there is nothing here to restore.",
            5: "Spotless. Change something and this list will start keeping receipts.",
        },
        yue: {
            1: "仲未改過任何嘢，所以冇嘢可以還原。",
            3: "仲未改過嘢，所以呢度冇嘢可以還原。",
            5: "乾淨到閃。改啲嘢，呢度就會開始記低。",
        },
    },
    "history.emptyFiltered": {
        en: "No record matches. Filters in effect: {filters}.",
        yue: "冇記錄合到。目前篩選：{filters}。",
    },
    "history.filterPart.actions": { en: "actions {actions}", yue: "動作 {actions}" },
    "history.filterPart.dates": { en: "dates {start} to {end}", yue: "日期 {start} 至 {end}" },
    "history.filterPart.text": { en: "search “{query}”", yue: "搜尋「{query}」" },
    "history.filterPart.none": { en: "none", yue: "冇" },
    "history.restore": { en: "Restore", yue: "還原" },
    "history.restoreLabel": { en: "Restore: {label}", yue: "還原：{label}" },
    "history.restoreUnavailableLabel": {
        en: "Cannot restore: {label}",
        yue: "還原唔到：{label}",
    },
    "history.restorePreview": {
        en: "Writes the earlier value back to {ids}, and records the restore as a new entry.",
        yue: "會將之前嘅值寫返落 {ids}，並且記錄呢次還原做新一筆。",
    },
    "history.restoreUnavailable": {
        en: "This record has no earlier value that this build still recognises.",
        yue: "呢筆記錄冇呢個版本仲識得嘅舊值。",
    },
    "history.restoreDone": {
        en: "Restored {count} settings: {ids}",
        yue: "已還原 {count} 項設定：{ids}",
    },
    "history.restoreNothing": {
        en: "Nothing changed: those values already match.",
        yue: "冇嘢變到：啲值本身已經一樣。",
    },
    "history.prune": { en: "Prune old records", yue: "清走舊記錄" },
    "history.pruneReady": {
        en: "Removes the {overflow} oldest records. Everything newer is kept.",
        yue: "會移除最舊嘅 {overflow} 筆記錄，新啲嘅全部保留。",
    },
    "history.pruneNotNeeded": {
        en: "Nothing to prune: the history is within its {retention}-record limit.",
        yue: "冇嘢好清：記錄仲喺 {retention} 筆上限之內。",
    },
    "history.pruneDone": {
        en: "Pruned {removed} records, {remaining} kept.",
        yue: "清走咗 {removed} 筆，仲有 {remaining} 筆。",
    },
    "history.pruneNothing": {
        en: "Nothing was pruned.",
        yue: "冇清走任何嘢。",
    },
    "history.retention": {
        en: "{kept} records kept, out of a {retention}-record limit.",
        yue: "保留咗 {kept} 筆，上限係 {retention} 筆。",
    },
};

/*
 * Registered here rather than by the settings page.
 *
 * A caller that forgets leaves this panel rendering raw keys, and the panel is reachable
 * on its own: the factory can be mounted by anything that owns a settings group. The
 * i18n port imports only a type from this module's neighbours, so registering at module
 * scope creates no runtime cycle.
 */
registerStrings("history", HISTORY_STRINGS);
