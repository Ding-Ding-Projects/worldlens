<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowDownBoldBoxOutline,
    mdiContentCopy,
    mdiDownloadOutline,
    mdiLightbulbOnOutline,
    mdiAlertOutline,
} from "@mdi/js";
import { VBtn, VCheckbox, VChip, VChipGroup, VIcon, VTooltip } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useStickyScroll } from "../scroll/stickyScroll.js";
import type { ConsoleAnnotation } from "./annotations.js";
import {
    CONSOLE_LEVELS,
    LEVEL_TAGS,
    clockText,
    consoleText,
    countByLevel,
    describeSlice,
    selectRows,
    type ConsoleLevel,
    type ConsoleLine,
    type ConsoleRow,
} from "./consoleModel.js";
import { redactConsoleText } from "./consoleHistory.js";
import type { SettingsTarget } from "../world/worldBridge.js";

/**
 * The engine's output, as a console rather than as a disclosure.
 *
 * What this replaces was a collapsible `<pre>` over the last two hundred lines. It was
 * honest and it was unusable: a render of a real world produces thousands of lines, the
 * two hundred kept were whichever two hundred happened to be last, every level looked
 * identical, and there was no way to search any of it. The one line that says why a
 * render failed is usually in the first ten seconds of output, which is exactly the part
 * that had already been thrown away.
 *
 * Four decisions carry most of the value here.
 *
 * **Colour is never the only signal.** Every line prints its level as text in a
 * fixed-width column beside the colour, so the distinction survives a colour-blind
 * reader, a monochrome display, and a copy-paste into a bug report. The colours
 * themselves are declared per theme rather than taken from Vuetify's status palette,
 * because the default warning amber is under 3:1 on a light surface and a warning nobody
 * can read is not a warning.
 *
 * **Following is a checkbox, and scrolling up pauses it without touching that checkbox.**
 * A console that scrolls on every new line cannot be read while it is running: you scroll
 * up to look at an error, the engine prints its next progress tick a second later, and you
 * are back at the bottom. So scrolling away pauses following on its own, the checkbox stays
 * ticked exactly as the reader left it, and a "Newest lines" control appears so getting back
 * is one click rather than a scrollbar drag. `components/scroll/stickyScroll.ts` is the
 * shared mechanism behind this, the backup log's, and the download log's follow behaviour.
 *

 * **The cap is stated.** Ten thousand lines are kept and the count that were dropped is
 * printed under the log. A ring that quietly forgets its own beginning looks exactly like
 * a complete log, which is the worse failure of the two.
 *
 * **Everything is searchable.** The search is the shared field, so it arrives with the
 * anchored regex builder like every other search surface in this app, and it matches this
 * app's advice as well as the engine's line, because a reader who searches for a word
 * they can see on screen and gets nothing concludes the search is broken.
 */
const props = withDefaults(
    defineProps<{
        lines: readonly ConsoleLine[];
        /** Complete retained history for search/export; `lines` stays the visible ring. */
        history?: readonly ConsoleLine[];
        /** Stable render identity carried into structured exports. */
        renderId?: string;
        /** Where the retained stream came from (for example local, CI, or reattached). */
        provenance?: string;
        /** Honest storage/retention status supplied by the history owner. */
        historyWarning?: string;
        /** Persisted completion metadata; null means the owner has not supplied a verdict. */
        historyComplete?: boolean | null;
        /** Persisted retention counters, independent of the bounded live viewport. */
        evictedLines?: number;
        evictedRenders?: number;
        /** Machine-readable persisted warning supplied by the history owner. */
        storageWarning?: "retention-limit" | "storage-limit" | null;
        /** Timestamp of the persisted record supplied by the history owner. */
        historyUpdatedAt?: string | null;
        /** How many lines the cap has dropped off the front of this render. */
        dropped?: number;
        cap: number;
        /** Height of the scrolling area. A caller that has more room can ask for more. */
        height?: string;
    }>(),
    {
        dropped: 0,
        height: "clamp(180px, 34vh, 460px)",
        renderId: "unknown",
        provenance: "console",
        historyWarning: "",
        historyComplete: null,
        evictedLines: 0,
        evictedRenders: 0,
        storageWarning: null,
        historyUpdatedAt: null,
    },
);

const emit = defineEmits<{
    /** Sends somebody to the setting a piece of advice points at. */
    settings: [target: SettingsTarget];
    deleteHistory: [ids: readonly number[]];
}>();

const { t } = useI18n();

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const chosenLevels = ref<ConsoleLevel[]>([]);

const scroller = ref<HTMLElement | null>(null);
/**
 * Sticky-scroll following, shared with the backup and download logs via
 * `components/scroll/stickyScroll.ts` - see that module's own doc comment for how a
 * reader's own scroll is told apart from a programmatic one, why the checkbox and "paused"
 * are two different pieces of state, and how a selection is never fought.
 *
 * Following is ON by default for this surface specifically: somebody who opened the render
 * console opened it to watch a render happen, and following the output is what "watch a
 * render happen" means. The backup and download logs default the same way for the same
 * reason - see their own components for why - but each surface keeps its own persisted
 * choice under its own name (`"renderConsole"` here), so turning it off in one never
 * touches another.
 */
const autoScroll = useStickyScroll({
    surface: "renderConsole",
    defaultEnabled: true,
    container: scroller,
    length: () => props.lines.length,
});
/*
 * `autoScroll` itself is a plain object, not `reactive()`, so `autoScroll.enabled` and
 * `autoScroll.paused` in the template would bind the raw `Ref`/`ComputedRef` rather than
 * its value - the template only auto-unwraps a *top-level* setup binding that is itself a
 * ref, not a nested property read off a plain object. Destructuring here gives the template
 * exactly that: two real top-level ref bindings, correctly unwrapped.
 */
const { enabled: autoScrollEnabled, paused: autoScrollPaused } = autoScroll;
const copyState = ref("");
const selectedIds = ref<Set<number>>(new Set());
type ExportFormat = "txt" | "md" | "json" | "jsonl" | "csv" | "tsv" | "html";
const exportFormat = ref<ExportFormat>("txt");
const exportFormats: readonly ExportFormat[] = ["txt", "md", "json", "jsonl", "csv", "tsv", "html"];

/** What each line reads as, with this app's own status lines translated. */
function lineText(line: ConsoleLine): string {
    return line.text === null ? line.message : t(line.text.key, line.text.values, line.text.fallback);
}

function adviceText(annotation: ConsoleAnnotation): string {
    return t(annotation.text.key, annotation.text.values, annotation.text.fallback);
}

const rows = computed<ConsoleRow[]>(() => props.lines.map((line) => ({ line, text: lineText(line) })));
const historyRows = computed<ConsoleRow[]>(() =>
    (props.history ?? props.lines).map((line) => ({ line, text: lineText(line) })),
);

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const levelSet = computed(() => new Set(chosenLevels.value));

const matchingHistory = computed(() => selectRows(historyRows.value, levelSet.value, matcher.value.test, adviceText));
const visibleRing = computed(() => selectRows(rows.value, levelSet.value, matcher.value.test, adviceText));
const searchActive = computed(() => query.value.trim().length > 0);
const filtersActive = computed(() => searchActive.value || chosenLevels.value.length > 0);
/** A search reads the complete retained stream; the unfiltered live view stays bounded. */
const visible = computed(() => (filtersActive.value ? matchingHistory.value : visibleRing.value));
const selected = computed(() => matchingHistory.value.filter((row) => selectedIds.value.has(row.line.id)));
/** Export the complete retained history by default; an explicit selection narrows it. */
const exportRows = computed(() => (selected.value.length > 0 ? selected.value : matchingHistory.value));

const counts = computed(() => countByLevel(props.history ?? props.lines));

const slice = computed(() =>
    describeSlice(matchingHistory.value.length, historyRows.value.length, props.dropped, props.cap),
);

/**
 * The honest "showing X of Y" line under the search field.
 *
 * Always shown rather than only when filtering, because "412 lines" and "412 of 3908
 * lines" answer two different questions and a reader who sees neither has to count.
 */
const summary = computed(() =>
    !filtersActive.value && historyRows.value.length > props.lines.length
        ? t(
              "world.console.showingRecent",
              { shown: props.lines.length, retained: historyRows.value.length },
              "Showing the newest {shown} of {retained} retained lines. Search and filters use the complete history.",
          )
        : slice.value.filtered
        ? t(
              "world.console.showingSome",
              { shown: slice.value.shown, kept: slice.value.kept },
              "Showing {shown} of {kept} lines.",
          )
        : t("world.console.showingAll", { kept: slice.value.kept }, "Showing all {kept} lines."),
);

/** What the console is holding, and what it has already let go of. */
const capLine = computed(() =>
    historyRows.value.length > props.lines.length
        ? t(
              "world.console.capRetained",
              { shown: props.lines.length, retained: historyRows.value.length },
              "The live view keeps the newest {shown} lines. Search, copy, selection, and export use all {retained} retained lines.",
          )
        : props.dropped > 0
        ? t(
              "world.console.capDropped",
              { cap: props.cap, dropped: props.dropped },
              "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped.",
          )
        : t("world.console.capIntact", { cap: props.cap }, "Every line is here. The console keeps up to {cap}."),
);

const historyStatus = computed(() => props.historyWarning ?? "");
function persistedCount(value: number | undefined): number {
    return Number.isSafeInteger(value) && (value ?? 0) >= 0 ? (value ?? 0) : 0;
}
const historyMetadata = computed(() => ({
    complete: props.historyComplete ?? null,
    evictedLines: persistedCount(props.evictedLines),
    evictedRenders: persistedCount(props.evictedRenders),
    storageWarning: props.storageWarning ?? null,
    updatedAt: props.historyUpdatedAt ?? null,
}));
const historyFacts = computed(() => {
    const facts = [
        historyMetadata.value.complete === true
            ? t(
                  "world.console.historyComplete",
                  { retained: historyRows.value.length },
                  "Complete history: {retained} retained lines.",
              )
            : historyMetadata.value.complete === false
              ? t(
                    "world.console.historyIncomplete",
                    {
                        retained: historyRows.value.length,
                        reason: t(
                            "world.console.historyIncompleteReason",
                            "The render may still be running or was interrupted.",
                        ),
                    },
                    "Incomplete history: {retained} retained lines. {reason}",
                )
              : t("world.console.historyUnknown", "Persisted completion state is unavailable."),
    ];
    if (historyMetadata.value.evictedLines > 0) {
        facts.push(
            t(
                "world.console.evictedLines",
                { evictedLines: historyMetadata.value.evictedLines },
                "Retention removed {evictedLines} older lines.",
            ),
        );
    }
    if (historyMetadata.value.evictedRenders > 0) {
        facts.push(
            t(
                "world.console.evictedRenders",
                { evictedRenders: historyMetadata.value.evictedRenders },
                "Retention removed {evictedRenders} older render histories.",
            ),
        );
    }
    if (historyMetadata.value.storageWarning !== null) {
        facts.push(
            t(
                "world.console.storageWarningDetail",
                {
                    reason: historyMetadata.value.storageWarning,
                    lastSavedAt: historyMetadata.value.updatedAt ?? "(unknown)",
                },
                "Storage warning: {reason} Last successful save: {lastSavedAt}.",
            ),
        );
    }
    return facts;
});
const selectionLabel = computed(() =>
    selected.value.length > 0
        ? t("world.console.clearSelection", "Clear selection")
        : filtersActive.value
          ? t("world.console.selectMatches", "Select all retained matches")
          : t("world.console.selectRetained", "Select all retained lines"),
);
const selectedAffected = computed(() => {
    const preview = selected.value.slice(0, 8).map((row) => `${row.line.id}: ${redactConsoleText(row.text)}`);
    const remaining = selected.value.length - preview.length;
    if (remaining > 0) {
        preview.push(t("world.console.affectedMore", { count: remaining }, "and {count} more retained lines"));
    }
    return preview;
});
const pruneAffected = computed(() => [
    t(
        "world.console.pruneCount",
        { count: historyRows.value.length },
        "All {count} retained lines for this render",
    ),
]);

/** Real text for the builder to preview against, rather than an invented sample. */
const sample = computed(() =>
    historyRows.value
        .slice(-40)
        .map((row) => row.text)
        .join("\n"),
);

const levelLabels = computed<Readonly<Record<ConsoleLevel, string>>>(() => ({
    error: t("world.console.level.error", "Errors"),
    warning: t("world.console.level.warning", "Warnings"),
    info: t("world.console.level.info", "Information"),
    debug: t("world.console.level.debug", "Debug"),
    signal: t("world.console.level.signal", "This app's own status lines"),
    tip: t("world.console.level.tip", "Tips"),
}));

// The initial position only. Whether a *later* append moves the view again is
// `useStickyScroll`'s own decision, driven by `props.lines.length` above - conflating the
// two would auto-scroll a reader who has not asked for it straight past wherever an
// already-long console happened to mount.
onMounted(() => autoScroll.scrollToBottom());

/* -------------------------------------------------------------------------- */
/* Taking it away                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The header every copy and every export carries.
 *
 * It says which slice this is, because an exported file that covers a tenth of a render
 * and does not say so is worse than no file: the reader draws conclusions from an
 * absence that is an artefact of a filter they cannot see.
 */
function exportHeader(): string {
    const identity = t(
        "world.console.exportIdentityMetadata",
        { renderId: props.renderId, provenance: props.provenance },
        "Render id={renderId}; provenance={provenance}.",
    );
    const filter = t(
        "world.console.exportFilterMetadata",
        {
            query: query.value === "" ? "(none)" : query.value,
            mode: regex.value ? "regex" : "plain text",
            flags: regex.value ? flags.value : "(none)",
            levels: chosenLevels.value.length === 0 ? "(all)" : chosenLevels.value.join(", "),
        },
        "Filter: query={query}; mode={mode}; flags={flags}; levels={levels}.",
    );
    const persisted = t(
        "world.console.exportHistoryMetadata",
        {
            completion:
                historyMetadata.value.complete === true
                    ? "complete"
                    : historyMetadata.value.complete === false
                      ? "incomplete"
                      : "unknown",
            evictedLines: historyMetadata.value.evictedLines,
            evictedRenders: historyMetadata.value.evictedRenders,
            storageWarning: historyMetadata.value.storageWarning ?? "(none)",
            retained: historyRows.value.length,
        },
        "History state={completion}; retained lines={retained}; evicted lines={evictedLines}; evicted renders={evictedRenders}; storage warning={storageWarning}.",
    );
    if (selected.value.length > 0) {
        return `# ${t("world.console.exportTitle", "Worldlens render console")}\n# ${identity}\n# ${persisted}\n# ${t(
            "world.console.exportSelection",
            { shown: selected.value.length, kept: historyRows.value.length },
            "{shown} selected lines from {kept} retained lines.",
        )}\n# ${filter}`;
    }
    const scope = slice.value.filtered
        ? t(
              "world.console.exportFiltered",
              { shown: slice.value.shown, kept: slice.value.kept },
              "{shown} of the {kept} lines held, matching the level filter and search that were on screen.",
          )
        : t("world.console.exportAll", { kept: slice.value.kept }, "All {kept} lines the console was holding.");
    const cut =
        props.dropped > 0 && historyRows.value.length <= props.lines.length
            ? t(
                  "world.console.exportDropped",
                  { dropped: props.dropped, cap: props.cap },
                  " {dropped} earlier lines were already dropped: the console keeps the most recent {cap}.",
              )
            : "";
    return `# ${t("world.console.exportTitle", "Worldlens render console")}\n# ${identity}\n# ${persisted}\n# ${scope}${cut}\n# ${filter}`;
}

function filterMetadata(): Record<string, unknown> {
    return {
        query: query.value,
        mode: regex.value ? "regex" : "plain-text",
        flags: regex.value ? flags.value : "",
        levels: [...chosenLevels.value],
        selected: selected.value.length > 0,
    };
}

function currentText(rowsToWrite = exportRows.value): string {
    return consoleText(
        rowsToWrite.map((row) => ({ ...row, text: redactConsoleText(row.text) })),
        (annotation) => redactConsoleText(adviceText(annotation)),
        exportHeader(),
    );
}

async function copyAll(): Promise<void> {
    try {
        await navigator.clipboard.writeText(currentText());
        copyState.value = t(
            "world.console.copied",
            { shown: exportRows.value.length },
            "Copied {shown} lines, with a header saying which ones.",
        );
    } catch {
        copyState.value = t("world.console.copyFailed", "Could not reach the clipboard.");
    }
}

/**
 * Writes the current slice to a file the reader chooses the home of.
 *
 * Plain text, because the destination is a bug report or a chat message and every one of
 * those wants something that survives being pasted. An object URL is created and given
 * straight back, so nothing is left holding the whole log after the click.
 */
function csvEscape(value: string, separator: "," | "\t"): string {
    const escaped = value.replaceAll('"', '""');
    return escaped.includes(separator) || escaped.includes("\n") || escaped.includes("\r") || escaped.includes('"')
        ? `"${escaped}"`
        : escaped;
}

function annotationMessages(row: ConsoleRow): readonly string[] {
    return row.line.annotations.map((annotation) => redactConsoleText(adviceText(annotation)));
}

function structuredRecord(row: ConsoleRow): Record<string, unknown> {
    return {
        schemaVersion: 1,
        renderId: props.renderId,
        provenance: props.provenance,
        id: row.line.id,
        timestamp: row.line.at,
        level: row.line.level,
        origin: row.line.origin,
        message: redactConsoleText(row.text),
        annotations: row.line.annotations.map((annotation) => ({
            kind: annotation.kind,
            tone: annotation.tone,
            message: redactConsoleText(adviceText(annotation)),
        })),
        persistedHistory: { ...historyMetadata.value },
        filter: filterMetadata(),
    };
}

function exportPayload(): { body: string; extension: string; mime: string } {
    const rowsToWrite = exportRows.value;
    if (exportFormat.value === "txt") return { body: currentText(rowsToWrite), extension: "txt", mime: "text/plain" };
    if (exportFormat.value === "md") {
        return {
            body: `${exportHeader()}\n\n${rowsToWrite.map((row) => {
                const annotations = annotationMessages(row).map((message) => `  - Worldlens: ${message}`).join("\n");
                return `- **${LEVEL_TAGS[row.line.level]}** \`${row.line.at}\` ${redactConsoleText(row.text)}${annotations === "" ? "" : `\n${annotations}`}`;
            }).join("\n")}`,
            extension: "md",
            mime: "text/markdown",
        };
    }
    if (exportFormat.value === "json") return { body: JSON.stringify({ schemaVersion: 1, renderId: props.renderId, provenance: props.provenance, persistedHistory: { ...historyMetadata.value }, filter: filterMetadata(), rows: rowsToWrite.map(structuredRecord) }, null, 2), extension: "json", mime: "application/json" };
    if (exportFormat.value === "jsonl") return { body: rowsToWrite.map((row) => JSON.stringify(structuredRecord(row))).join("\n"), extension: "jsonl", mime: "application/x-ndjson" };
    if (exportFormat.value === "html") {
        const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
        return { body: `<!doctype html><meta charset="utf-8"><title>Worldlens render console</title><header><pre>${escape(exportHeader())}</pre></header><ol>${rowsToWrite.map((row) => {
            const annotations = annotationMessages(row).map((message) => `<li>${escape(message)}</li>`).join("");
            return `<li data-level="${escape(row.line.level)}"><time>${escape(row.line.at)}</time> <strong>${escape(LEVEL_TAGS[row.line.level])}</strong> ${escape(redactConsoleText(row.text))}${annotations === "" ? "" : `<ul aria-label="Worldlens annotations">${annotations}</ul>`}</li>`;
        }).join("")}</ol>`, extension: "html", mime: "text/html" };
    }
    const separator = exportFormat.value === "csv" ? "," : "\t";
    const header = ["schemaVersion", "renderId", "provenance", "historyComplete", "historyUpdatedAt", "evictedLines", "evictedRenders", "storageWarning", "id", "timestamp", "level", "origin", "message", "annotations", "query", "mode", "flags", "levels", "selected"].join(separator);
    const body = rowsToWrite.map((row) => {
        const record = structuredRecord(row);
        const filter = filterMetadata();
        return [record.schemaVersion, record.renderId, record.provenance, historyMetadata.value.complete, historyMetadata.value.updatedAt, historyMetadata.value.evictedLines, historyMetadata.value.evictedRenders, historyMetadata.value.storageWarning, record.id, record.timestamp, record.level, record.origin, record.message, JSON.stringify(annotationMessages(row)), filter.query, filter.mode, filter.flags, JSON.stringify(filter.levels), filter.selected].map((value) => csvEscape(String(value ?? ""), separator)).join(separator);
    });
    return { body: [header, ...body].join("\n"), extension: exportFormat.value, mime: exportFormat.value === "csv" ? "text/csv" : "text/tab-separated-values" };
}

function exportAll(): void {
    const url = globalThis.URL;
    const doc = globalThis.document;
    if (url?.createObjectURL === undefined || doc === undefined) {
        copyState.value = t("world.console.exportUnavailable", "This build cannot write a file from here.");
        return;
    }
    const payload = exportPayload();
    const blob = new Blob([payload.body], { type: `${payload.mime};charset=utf-8` });
    const href = url.createObjectURL(blob);
    const anchor = doc.createElement("a");
    anchor.href = href;
    anchor.download = `render-console.${payload.extension}`;
    anchor.click();
    url.revokeObjectURL(href);
    copyState.value = t(
        "world.console.exportedFormat",
        { shown: exportRows.value.length, format: exportFormat.value },
        "Exported {shown} lines as {format}.",
    );
}

function toggleSelection(id: number): void {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
}

function selectRetainedMatches(): void {
    // Lines outside the bounded viewport are still part of the filtered result and must
    // remain selectable, exportable, and deletable.
    selectedIds.value = new Set(matchingHistory.value.map((row) => row.line.id));
}

function clearSelection(): void {
    selectedIds.value = new Set();
}

function deleteSelected(): void {
    const ids = [...selectedIds.value];
    if (ids.length === 0) return;
    emit("deleteHistory", ids);
    clearSelection();
}

function pruneHistory(): void {
    const ids = historyRows.value.map((row) => row.line.id);
    if (ids.length === 0) return;
    emit("deleteHistory", ids);
    clearSelection();
}

function openSetting(target: SettingsTarget): void {
    emit("settings", target);
}
</script>

<template>
    <section class="mb-console" :aria-label="t('world.console.title', 'Render console')">
        <div class="mb-console__controls">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('world.console.search', 'Search the console')"
                :placeholder="t('world.console.searchHint', 'Any word in a line, or in the advice beside it')"
                :sample="sample"
                :summary="summary"
                density="compact"
            />

            <!--
                A fieldset rather than a bare row of chips: the group needs a name a
                screen reader can announce before the six toggles inside it, or the
                first one is read as "error, one" with no context at all.
            -->
            <fieldset class="mb-console__levels">
                <legend>{{ t("world.console.filter", "Show only these levels") }}</legend>
                <v-chip-group v-model="chosenLevels" multiple column selected-class="text-primary">
                    <v-chip
                        v-for="level in CONSOLE_LEVELS"
                        :key="level"
                        :value="level"
                        :aria-label="`${levelLabels[level]}: ${counts[level]}`"
                        size="small"
                        filter
                        variant="outlined"
                    >
                        <span :class="`mb-console__swatch mb-console__swatch--${level}`" aria-hidden="true" />
                        {{ LEVEL_TAGS[level] }}
                        <span class="mb-console__count">{{ counts[level] }}</span>
                    </v-chip>
                </v-chip-group>
                <p v-if="chosenLevels.length === 0" class="mb-console__meta">
                    {{ t("world.console.filterNone", "No level filter: every line is shown.") }}
                </p>
            </fieldset>

            <div class="mb-console__actions">
                <v-checkbox
                    v-model="autoScrollEnabled"
                    class="mb-console__autoScroll"
                    :label="t('world.console.autoScroll', 'Follow new lines')"
                    density="compact"
                    hide-details
                    data-test="console-autoscroll"
                >
                    <v-tooltip
                        activator="parent"
                        location="top"
                        :text="
                            t(
                                'world.console.autoScrollHint',
                                'Keeps the console scrolled to the newest line as the engine prints it. Scrolling up pauses that without turning this off; scroll back down, or use Newest lines, to pick it up again.',
                            )
                        "
                    />
                </v-checkbox>
                <v-btn :prepend-icon="mdiContentCopy" size="small" variant="text" density="comfortable" @click="copyAll">
                    {{ t("world.console.copy", "Copy selected or retained matches") }}
                </v-btn>
                <v-btn size="small" variant="text" density="comfortable" @click="selected.length > 0 ? clearSelection() : selectRetainedMatches()">
                    {{ selectionLabel }}
                </v-btn>
                <ConfigSuperConfirm
                    :title="t('world.console.deleteTitle', 'Delete retained console history')"
                    :action="t('world.console.deleteAction', 'Delete the selected retained console lines. This cannot be undone.')"
                    :affected="selectedAffected"
                    :confirm-label="t('world.console.deleteConfirm', 'Confirm deletion')"
                    :disabled="selected.length === 0"
                    @confirm="deleteSelected"
                >
                    <template #activator="{ props: activatorProps }">
                        <v-btn v-bind="activatorProps" size="small" variant="text" density="comfortable">
                            {{ t("world.console.deleteSelected", "Delete selected") }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
                <ConfigSuperConfirm
                    :title="t('world.console.pruneTitle', 'Prune retained console history')"
                    :action="t('world.console.pruneAction', 'Delete every retained console line for this render. The running render, if any, continues and new lines can still arrive. This cannot be undone.')"
                    :affected="pruneAffected"
                    :confirm-label="t('world.console.pruneConfirm', 'Confirm retained-history pruning')"
                    :disabled="historyRows.length === 0"
                    @confirm="pruneHistory"
                >
                    <template #activator="{ props: activatorProps }">
                        <v-btn v-bind="activatorProps" size="small" variant="text" density="comfortable">
                            {{ t("world.console.prune", "Prune retained history") }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
                <span class="mb-console__format-label" :id="`console-format-label-${props.renderId}`">
                    {{ t("world.console.exportFormat", "Export format") }}
                </span>
                <div class="mb-console__formats" role="group" :aria-labelledby="`console-format-label-${props.renderId}`">
                    <v-btn
                        v-for="format in exportFormats"
                        :key="format"
                        size="x-small"
                        :variant="exportFormat === format ? 'tonal' : 'text'"
                        :aria-pressed="exportFormat === format"
                        :aria-label="`${t('world.console.exportFormat', 'Export format')}: ${format.toUpperCase()}`"
                        @click="exportFormat = format"
                    >
                        {{ format.toUpperCase() }}
                    </v-btn>
                </div>
                <v-btn
                    :prepend-icon="mdiDownloadOutline"
                    size="small"
                    variant="text"
                    density="comfortable"
                    @click="exportAll"
                >
                    {{ t("world.console.export", "Export selected or retained matches") }}
                </v-btn>
            </div>
            <p class="mb-console__meta" role="status" aria-live="polite">{{ copyState }}</p>
            <p v-if="historyStatus" class="mb-console__meta mb-console__meta--warning" role="status" aria-live="polite">
                {{ historyStatus }}
            </p>
            <section
                class="mb-console__history-facts"
                role="status"
                aria-live="polite"
                :aria-label="t('world.console.historyFactsTitle', 'Persisted history details')"
            >
                <ul>
                    <li v-for="fact in historyFacts" :key="fact">{{ fact }}</li>
                </ul>
            </section>
        </div>

        <div class="mb-console__frame">
            <!--
                `role="log"` names what this region is to assistive technology, but it is
                deliberately not left to announce on its own: `role="log"` carries an implicit
                `aria-live="polite"`, and a render prints lines by the thousand, which turns
                into a screen reader narrating every single one as it arrives - the exact
                "actively hostile" failure mode a genuinely live log can fall into. `aria-live`
                is set to "off" here for that reason: the region is still reachable, still
                readable line by line with the keyboard (`tabindex` makes it scrollable without
                a mouse), and a reader chooses when to read it rather than having it read at
                them. The "Newest lines" control below is how a reader who has scrolled away
                gets back, discoverable in the normal tab order rather than announced.
            -->
            <ol
                ref="scroller"
                class="mb-console__scroll"
                :style="{ height: props.height }"
                role="log"
                aria-live="off"
                tabindex="0"
                :aria-label="t('world.console.output', 'The engine\'s output')"
                @scroll="autoScroll.onScroll"
            >
                <li v-for="row in visible" :key="row.line.id" :class="`mb-console__line mb-console__line--${row.line.level}`">
                    <input
                        class="mb-console__select"
                        type="checkbox"
                        :checked="selectedIds.has(row.line.id)"
                        :aria-label="t('world.console.selectLine', { id: row.line.id }, `Select line ${row.line.id}`)"
                        @change="toggleSelection(row.line.id)"
                    />
                    <span class="mb-console__clock">{{ clockText(row.line.at) }}</span>
                    <span class="mb-console__tag" :aria-label="levelLabels[row.line.level]">
                        {{ LEVEL_TAGS[row.line.level] }}
                    </span>
                    <span class="mb-console__text">{{ row.text }}</span>

                    <!--
                        The advice, marked as this app speaking. The engine's line above is
                        never edited: that string is what somebody pastes into a search
                        engine, and an app that improves it has taken away the one thing
                        that was going to help them.
                    -->
                    <div
                        v-for="annotation in row.line.annotations"
                        :key="annotation.kind"
                        :class="`mb-console__advice mb-console__advice--${annotation.tone}`"
                    >
                        <v-icon
                            :icon="annotation.tone === 'tip' ? mdiLightbulbOnOutline : mdiAlertOutline"
                            size="14"
                            aria-hidden="true"
                        />
                        <span class="mb-console__speaker">{{ t("world.console.speaker", "Worldlens") }}</span>
                        <span class="mb-console__adviceText">{{ adviceText(annotation) }}</span>
                        <v-btn
                            v-if="annotation.settings"
                            size="x-small"
                            variant="tonal"
                            density="comfortable"
                            @click="openSetting(annotation.settings)"
                        >
                            {{ t("world.console.openSetting", "Open the setting") }}
                        </v-btn>
                    </div>
                </li>

                <li v-if="visible.length === 0" class="mb-console__empty">
                    {{
                        historyRows.length === 0
                            ? t("world.console.emptyLog", "The engine has not printed anything yet.")
                            : t(
                                  "world.console.emptyMatch",
                                  { kept: historyRows.length },
                                  "None of the {kept} lines match the level filter and the search.",
                              )
                    }}
                </li>
            </ol>

            <!--
                Only while paused: following is on and the view has been scrolled away from
                the bottom. A permanent button would be a button that does nothing for the
                whole of a render somebody is watching from the bottom, and it never appears
                at all with the checkbox off - there is nothing to "get back to following"
                when following was never asked for.
            -->
            <v-btn
                v-if="autoScrollPaused"
                class="mb-console__jump"
                :prepend-icon="mdiArrowDownBoldBoxOutline"
                size="small"
                variant="flat"
                color="primary"
                @click="autoScroll.scrollToBottom"
            >
                {{ t("world.console.toBottom", "Newest lines") }}
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="t('world.console.toBottomHint', 'The console stopped following because you scrolled up. This goes back to the newest line and starts following again.')"
                />
            </v-btn>
        </div>

        <p class="mb-console__meta">{{ capLine }}</p>
    </section>
</template>

<style>
.mb-console {
    margin-block-start: 8px;
}

.mb-console__controls {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-console__levels {
    border: none;
    padding: 0;
    margin: 0;
}

.mb-console__levels legend {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    padding: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-console__swatch {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
    margin-inline-end: 6px;
    background: currentcolor;
}

.mb-console__count {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

.mb-console__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
}

/*
 * `hide-details` still leaves Vuetify's own selection-control padding, which is taller than
 * the small text buttons beside it. Trimmed to the same row height rather than to a fixed
 * pixel value, so it still grows correctly at 200% display scale.
 */
.mb-console__autoScroll {
    flex: 0 0 auto;
}

.mb-console__autoScroll :deep(.v-selection-control) {
    min-height: unset;
}

.mb-console__meta {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-console__frame {
    position: relative;
}

/*
 * The scrolling log.
 *
 * `user-select: text` is stated rather than assumed, because a list inside a card in a
 * component library is exactly the sort of place a `user-select: none` gets inherited
 * from, and a console whose text cannot be selected is a console nobody can quote.
 */
.mb-console__scroll {
    margin: 0;
    padding: 8px 10px;
    list-style: none;
    overflow: auto;
    overscroll-behavior: contain;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.55;
    user-select: text;
}

.mb-console__scroll:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-console__line {
    display: grid;
    grid-template-columns: auto auto auto 1fr;
    gap: 0 8px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.mb-console__history-facts {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), 0.8);
}

.mb-console__history-facts ul {
    margin-block: 4px 8px;
    padding-inline-start: 22px;
}

.mb-console__select {
    inline-size: 18px;
    block-size: 18px;
    margin-block-start: 2px;
    accent-color: rgb(var(--v-theme-primary));
}

.mb-console__format-label {
    align-self: center;
    font-size: 0.78rem;
    color: rgba(var(--v-theme-on-surface), 0.72);
}

.mb-console__formats {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
}

.mb-console__clock {
    color: rgba(var(--v-theme-on-surface), 0.55);
    font-variant-numeric: tabular-nums;
}

/*
 * The level, as text. This is what keeps the colouring from being the only signal: a
 * reader who cannot distinguish the colours, a monochrome display and a copy-paste into
 * a bug report all still carry the level.
 */
.mb-console__tag {
    inline-size: 5ch;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.mb-console__text {
    grid-column: 4;
}

.mb-console__advice {
    grid-column: 4;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin-block: 2px 6px;
    padding: 4px 8px;
    border-inline-start: 3px solid currentcolor;
    border-radius: 0 6px 6px 0;
    background: rgba(var(--v-theme-on-surface), 0.05);
    font-family: Roboto, system-ui, sans-serif;
    white-space: normal;
}

.mb-console__speaker {
    font-weight: 600;
    text-transform: none;
}

.mb-console__adviceText {
    color: rgba(var(--v-theme-on-surface), 0.92);
    flex: 1 1 16ch;
}

.mb-console__empty {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-family: Roboto, system-ui, sans-serif;
}

.mb-console__jump {
    position: absolute;
    inset-block-end: 10px;
    inset-inline-end: 14px;
}

/*
 * The level palette.
 *
 * Declared here rather than taken from Vuetify's status colours because those are tuned
 * for filled chips and buttons: the default warning amber measures under 3:1 as text on
 * a light surface, and a warning that cannot be read is not a warning. Each value below
 * is chosen to clear 4.5:1 against the console's own background in its own theme.
 */
.v-theme--light .mb-console__line--error,
.v-theme--light .mb-console__advice--warning {
    color: #a3231c;
}

.v-theme--light .mb-console__line--warning {
    color: #7a4a00;
}

.v-theme--light .mb-console__line--info,
.v-theme--light .mb-console__line--debug {
    color: #1d1b20;
}

.v-theme--light .mb-console__line--debug {
    opacity: 0.72;
}

.v-theme--light .mb-console__line--tip,
.v-theme--light .mb-console__advice--tip {
    color: #0b57d0;
}

.v-theme--light .mb-console__line--signal {
    color: #45484d;
}

.v-theme--dark .mb-console__line--error,
.v-theme--dark .mb-console__advice--warning {
    color: #f2b8b5;
}

.v-theme--dark .mb-console__line--warning {
    color: #ffb861;
}

.v-theme--dark .mb-console__line--info,
.v-theme--dark .mb-console__line--debug {
    color: #e6e1e5;
}

.v-theme--dark .mb-console__line--debug {
    opacity: 0.72;
}

.v-theme--dark .mb-console__line--tip,
.v-theme--dark .mb-console__advice--tip {
    color: #a8c7fa;
}

.v-theme--dark .mb-console__line--signal {
    color: #b6bac0;
}

/*
 * A console that animates its own scrolling is a console that makes some readers ill.
 * The follow behaviour still works; it simply arrives instantly.
 */
@media (prefers-reduced-motion: reduce) {
    .mb-console__scroll {
        scroll-behavior: auto;
    }
}
</style>
