import { clear, el, uniqueId } from "../platform/dom.js";
import type { SettingValue, StoredSetting } from "./types.js";
import { fillPhrase, t } from "./i18n.js";
import {
    MAX_REFRESH_MINUTES,
    MAX_RULE_LABEL_LENGTH,
    MAX_RULE_PRIORITY,
    MIN_REFRESH_MINUTES,
    MIN_RULE_PRIORITY,
    ScheduleRepository,
    ScheduledSettingsController,
    SessionSecretProvider,
    defaultRule,
    describeRepositoryProblem,
    describeRuleProblems,
    describeStatus,
    supportedTimezones,
    type ScheduleSource,
    type ScheduleStatus,
    type ScheduledSettingsRule,
} from "./schedule.js";
import { guidanceText, type GuidanceMessage } from "./scheduleHelp.js";
import type { SettingsStore } from "./store.js";
import { downloadFile, pickFile } from "./dom.js";

export interface SchedulePanelOptions {
    readonly store: SettingsStore;
    readonly repository: ScheduleRepository;
    readonly controller: ScheduledSettingsController;
    readonly secrets: SessionSecretProvider;
    readonly confirmDelete: (message: string) => Promise<boolean>;
    readonly notify?: ((message: string, error: boolean) => void) | undefined;
}

export interface SchedulePanelView {
    readonly rulesElement: HTMLElement;
    readonly sourcesElement: HTMLElement;
    readonly destinations: ReadonlyMap<string, HTMLElement>;
    refresh(): void;
    destroy(): void;
}

type MutableRule = {
    -readonly [Key in keyof ScheduledSettingsRule]: ScheduledSettingsRule[Key];
};

/**
 * Guided editor for the versioned schedule model. Every target comes from the
 * live settings declaration, so a visitor chooses real values instead of typing
 * ids or reverse-engineering an export file.
 */
export function createSchedulePanel(options: SchedulePanelOptions): SchedulePanelView {
    const rulesElement = el("div", { class: "mb-schedule", data: { scheduleSurface: "rules" } });
    const sourcesElement = el("div", {
        class: "mb-schedule mb-schedule--sources",
        data: { scheduleSurface: "sources" },
    });
    const destinations = new Map<string, HTMLElement>([
        ["schedule.rules", rulesElement],
        ["schedule.externalSources", sourcesElement],
    ]);
    const disposers: (() => void)[] = [];
    let selectedId = options.repository.load().rules[0]?.id ?? "";
    let draft: MutableRule | null = null;
    /**
     * Redraws whatever guidance the open editor is currently showing, in the language
     * that is current now. Set by the editor while one exists, cleared when it does
     * not, so a language change never reaches into a form that has been thrown away.
     */
    let repaintValidation: (() => void) | null = null;

    const intro = phrase("schedule.intro", "p", "md-field__help mb-help");
    const rulePicker = el("select", {
        class: "md-field__input",
        attrs: { "aria-label": t("schedule.rule") },
    });
    const addButton = actionButton("schedule.add", "md-button md-button--tonal");
    const editor = el("div", { class: "mb-schedule-editor" });
    const empty = phrase("schedule.empty", "p", "mb-empty");
    const status = el("p", {
        class: "mb-capability-note",
        attrs: { role: "status", "aria-live": "polite" },
    });
    const refreshButton = actionButton("schedule.refreshNow", "md-button md-button--outlined");
    const exportButton = actionButton("schedule.export", "md-button md-button--outlined");
    const importButton = actionButton("schedule.import", "md-button md-button--outlined");
    const clearSessionTokens = actionButton(
        "schedule.clearSessionTokens",
        "md-button md-button--outlined",
    );
    const sourceHelp = phrase("schedule.credentialHelp", "p", "md-field__help mb-help");
    const historyHeading = phrase("schedule.history", "h3", "mb-section-title");
    const historyList = el("div", { class: "mb-schedule-history" });

    rulesElement.append(
        intro,
        el(
            "div",
            { class: "mb-property-row mb-schedule-picker" },
            phrase("schedule.rule", "span", "md-field__label"),
            rulePicker,
            addButton,
        ),
        empty,
        editor,
    );
    sourcesElement.append(
        sourceHelp,
        el(
            "div",
            { class: "mb-button-row" },
            refreshButton,
            exportButton,
            importButton,
            clearSessionTokens,
        ),
        status,
        historyHeading,
        historyList,
    );

    rulePicker.addEventListener("change", () => {
        selectedId = rulePicker.value;
        draft = null;
        render();
    });
    addButton.addEventListener("click", () => {
        const document = options.repository.load();
        const ids = new Set(document.rules.map((rule) => rule.id));
        let index = document.rules.length + 1;
        while (ids.has(`rule-${index}`)) index += 1;
        draft = cloneRule(defaultRule(index));
        selectedId = draft.id;
        render();
        editor.querySelector<HTMLInputElement>("input[type='text']")?.focus();
    });
    refreshButton.addEventListener("click", () => void applyNow());
    exportButton.addEventListener("click", () => {
        downloadFile(
            "worldlens-scheduled-settings.json",
            `${JSON.stringify(options.repository.load(), null, 2)}\n`,
            "application/json;charset=utf-8",
        );
    });
    importButton.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const text = await pickFile("application/json,.json");
            if (text === null) return;
            try {
                const parsed = JSON.parse(text) as Parameters<ScheduleRepository["save"]>[0];
                if (options.repository.save(parsed, "imported").length > 0)
                    throw new Error("document");
                draft = null;
                selectedId = options.repository.load().rules[0]?.id ?? "";
                await applyNow();
                options.notify?.(t("schedule.imported"), false);
                render();
            } catch {
                options.notify?.(t("schedule.importFailed"), true);
            }
        })();
    });
    clearSessionTokens.addEventListener("click", () => {
        options.secrets.clearAll();
        options.notify?.(t("schedule.sessionTokensCleared"), false);
        render();
    });
    disposers.push(options.controller.subscribe(renderStatus));

    function render(): void {
        const document = options.repository.load();
        clear(rulePicker);
        for (const candidate of document.rules) {
            rulePicker.append(
                el("option", { text: candidate.label, attrs: { value: candidate.id } }),
            );
        }
        if (draft === null) {
            const selected =
                document.rules.find((candidate) => candidate.id === selectedId) ??
                document.rules[0];
            draft = selected === undefined ? null : cloneRule(selected);
            selectedId = selected?.id ?? "";
        }
        if (draft !== null && !document.rules.some((candidate) => candidate.id === draft?.id)) {
            rulePicker.append(el("option", { text: draft.label, attrs: { value: draft.id } }));
        }
        rulePicker.value = selectedId;
        rulePicker.disabled = draft === null;
        empty.hidden = draft !== null;
        editor.hidden = draft === null;
        clear(editor);
        repaintValidation = null;
        if (draft !== null) editor.append(buildEditor(draft));
        renderHistory();
        renderStatus(options.controller.status);
        refreshCopy();
    }

    function buildEditor(current: MutableRule): HTMLElement {
        const form = el("form", { class: "mb-schedule-form" });
        /*
         * Which control each field key belongs to, so guidance about a field can be
         * attached to that field rather than merely printed near it. Keys are the
         * control's own i18n label key, which is what `describeRuleProblems` reports,
         * so there is no second mapping table here to fall out of step with the one
         * the validator uses.
         */
        const fields = new Map<string, HTMLElement>();
        const tracked = (
            key: string,
            type: string,
            value: string,
            attrs: Readonly<Record<string, string>> = {},
        ): { element: HTMLElement; input: HTMLInputElement } => {
            const created = inputField(key, type, value, attrs);
            fields.set(key, created.input);
            return created;
        };
        const labelInput = tracked("schedule.label", "text", current.label, {
            maxlength: String(MAX_RULE_LABEL_LENGTH),
        });
        labelInput.input.addEventListener("input", () => {
            current.label = labelInput.input.value;
        });
        const enabled = checkboxField("schedule.enabled", current.enabled);
        enabled.input.addEventListener("change", () => {
            current.enabled = enabled.input.checked;
        });
        const priority = tracked("schedule.priority", "number", String(current.priority), {
            min: String(MIN_RULE_PRIORITY),
            max: String(MAX_RULE_PRIORITY),
            step: "1",
        });
        priority.input.addEventListener("input", () => {
            current.priority = Number(priority.input.value);
        });
        const startDate = tracked("schedule.startDate", "date", current.startDate);
        startDate.input.addEventListener("input", () => {
            current.startDate = startDate.input.value;
        });
        const endDate = tracked("schedule.endDate", "date", current.endDate);
        endDate.input.addEventListener("input", () => {
            current.endDate = endDate.input.value;
        });
        const startTime = tracked("schedule.startTime", "time", current.startTime);
        startTime.input.addEventListener("input", () => {
            current.startTime = startTime.input.value;
        });
        const endTime = tracked("schedule.endTime", "time", current.endTime);
        endTime.input.addEventListener("input", () => {
            current.endTime = endTime.input.value;
        });
        const timezone = selectField(
            "schedule.timezone",
            supportedTimezones().map((value) => ({ value, label: value })),
            current.timezone,
        );
        fields.set("schedule.timezone", timezone.input);
        timezone.input.addEventListener("change", () => {
            current.timezone = timezone.input.value;
        });
        const everyDay = checkboxField("schedule.everyDay", current.everyDay);
        const weekdays = el(
            "fieldset",
            { class: "mb-schedule-weekdays" },
            phrase("schedule.weekdays", "legend", "md-field__label"),
        );
        for (let day = 0; day < 7; day += 1) {
            const checkbox = el("input", { attrs: { type: "checkbox", value: String(day) } });
            checkbox.checked = current.weekdays.includes(day);
            checkbox.disabled = current.everyDay;
            checkbox.addEventListener("change", () => {
                current.weekdays = [
                    ...weekdays.querySelectorAll<HTMLInputElement>("input:checked"),
                ].map((input) => Number(input.value));
            });
            weekdays.append(
                el(
                    "label",
                    { class: "mb-schedule-day" },
                    checkbox,
                    phrase(`schedule.weekday.${day}`, "span"),
                ),
            );
            // Guidance about the weekday set is attached to the first day rather than
            // to the fieldset: the fieldset is not focusable, so a visitor sent there
            // by keyboard would land nowhere and hear nothing.
            if (day === 0) fields.set("schedule.weekdays", checkbox);
        }
        everyDay.input.addEventListener("change", () => {
            current.everyDay = everyDay.input.checked;
            for (const checkbox of weekdays.querySelectorAll<HTMLInputElement>("input"))
                checkbox.disabled = current.everyDay;
        });

        const source = selectField(
            "schedule.source",
            [
                { value: "local", label: t("schedule.source.local") },
                { value: "api", label: t("schedule.source.api") },
                { value: "home-assistant", label: t("schedule.source.ha") },
            ],
            current.source.kind,
        );
        const sourceFields = el("div", { class: "mb-schedule-source-fields" });
        const values = el("div", { class: "mb-schedule-values" });
        const renderSource = (): void => {
            const kind = source.input.value as ScheduleSource["kind"];
            if (kind !== current.source.kind) {
                current.source =
                    kind === "local"
                        ? { kind: "local" }
                        : kind === "api"
                          ? { kind: "api", url: "https://", refreshMinutes: 15 }
                          : {
                                kind: "home-assistant",
                                baseUrl: "https://",
                                entityId: "input_boolean.",
                                credentialKey: `ha-${current.id}`,
                                refreshMinutes: 15,
                            };
            }
            clear(sourceFields);
            // The controls below are rebuilt on every source change, so their entries
            // are dropped first. A key left pointing at a detached input would send a
            // later focus call into a node the visitor cannot see.
            for (const key of [
                "schedule.apiUrl",
                "schedule.haUrl",
                "schedule.haEntity",
                "schedule.refresh",
            ])
                fields.delete(key);
            if (current.source.kind === "api") {
                const url = tracked("schedule.apiUrl", "url", current.source.url, {
                    placeholder: "https://example.test/settings.json",
                });
                const refresh = tracked(
                    "schedule.refresh",
                    "number",
                    String(current.source.refreshMinutes),
                    {
                        min: String(MIN_REFRESH_MINUTES),
                        max: String(MAX_REFRESH_MINUTES),
                        step: "1",
                    },
                );
                url.input.addEventListener("input", () => {
                    if (current.source.kind === "api")
                        current.source = { ...current.source, url: url.input.value };
                });
                refresh.input.addEventListener("input", () => {
                    if (current.source.kind === "api")
                        current.source = {
                            ...current.source,
                            refreshMinutes: Number(refresh.input.value),
                        };
                });
                sourceFields.append(url.element, refresh.element);
            } else if (current.source.kind === "home-assistant") {
                const baseUrl = tracked("schedule.haUrl", "url", current.source.baseUrl, {
                    placeholder: "https://home-assistant.example",
                });
                const entity = tracked("schedule.haEntity", "text", current.source.entityId, {
                    placeholder: "input_boolean.site_theme",
                });
                const credentialKey = current.source.credentialKey;
                const token = inputField("schedule.sessionToken", "password", "", {
                    placeholder: t("schedule.sessionTokenPlaceholder"),
                    autocomplete: "new-password",
                    spellcheck: "false",
                });
                const tokenStatus = phrase(
                    options.secrets.hasToken(credentialKey)
                        ? "schedule.sessionTokenLoaded"
                        : "schedule.sessionTokenMissing",
                    "p",
                    "mb-capability-note mb-session-token-status",
                );
                const useToken = actionButton(
                    "schedule.useSessionToken",
                    "md-button md-button--tonal",
                );
                const clearToken = actionButton(
                    "schedule.clearSessionToken",
                    "md-button md-button--outlined",
                );
                clearToken.disabled = !options.secrets.hasToken(credentialKey);
                const setTokenStatus = (
                    key:
                        | "schedule.sessionTokenLoaded"
                        | "schedule.sessionTokenMissing"
                        | "schedule.sessionTokenEmpty",
                ): void => {
                    tokenStatus.dataset["i18nKey"] = key;
                    fillPhrase(tokenStatus, key);
                };
                useToken.addEventListener("click", () => {
                    if (!options.secrets.setToken(credentialKey, token.input.value)) {
                        setTokenStatus("schedule.sessionTokenEmpty");
                        token.input.focus();
                        return;
                    }
                    token.input.value = "";
                    setTokenStatus("schedule.sessionTokenLoaded");
                    clearToken.disabled = false;
                    options.notify?.(t("schedule.sessionTokenAccepted"), false);
                    void applyNow();
                });
                clearToken.addEventListener("click", () => {
                    options.secrets.clearToken(credentialKey);
                    token.input.value = "";
                    setTokenStatus("schedule.sessionTokenMissing");
                    clearToken.disabled = true;
                    options.notify?.(t("schedule.sessionTokenCleared"), false);
                });
                const refresh = tracked(
                    "schedule.refresh",
                    "number",
                    String(current.source.refreshMinutes),
                    {
                        min: String(MIN_REFRESH_MINUTES),
                        max: String(MAX_REFRESH_MINUTES),
                        step: "1",
                    },
                );
                baseUrl.input.addEventListener("input", () => {
                    if (current.source.kind === "home-assistant")
                        current.source = { ...current.source, baseUrl: baseUrl.input.value };
                });
                entity.input.addEventListener("input", () => {
                    if (current.source.kind === "home-assistant")
                        current.source = { ...current.source, entityId: entity.input.value };
                });
                refresh.input.addEventListener("input", () => {
                    if (current.source.kind === "home-assistant")
                        current.source = {
                            ...current.source,
                            refreshMinutes: Number(refresh.input.value),
                        };
                });
                sourceFields.append(
                    baseUrl.element,
                    entity.element,
                    token.element,
                    tokenStatus,
                    el("div", { class: "mb-button-row" }, useToken, clearToken),
                    refresh.element,
                    phrase("schedule.credentialHelp", "p", "md-field__help mb-help"),
                );
            }
            values.hidden = current.source.kind === "api";
        };
        source.input.addEventListener("change", renderSource);

        const renderValues = (): void => {
            clear(values);
            for (const key of [...fields.keys()]) if (key.startsWith("value:")) fields.delete(key);
            values.append(phrase("schedule.values", "h3", "mb-section-title"));
            const entries = Object.entries(current.values);
            entries.forEach(([id, value]) =>
                values.append(buildValueRow(current, id, value, renderValues, fields)),
            );
            const addValue = actionButton("schedule.addValue", "md-button md-button--text");
            addValue.addEventListener("click", () => {
                const first = options.store
                    .definitions_()
                    .find((definition) => current.values[definition.id] === undefined);
                if (first === undefined) return;
                current.values = { ...current.values, [first.id]: options.store.get(first.id) };
                renderValues();
            });
            addValue.disabled = entries.length >= options.store.definitions_().length;
            /*
             * A disabled control that does not say why reads as broken rather than as
             * blocked, so the reason is both a tooltip and adjacent text: a `title` is
             * never announced on a disabled button, and pointerless visitors are the
             * ones with no other way to find out.
             */
            const allUsed = phrase("scheduleHelp.values.allUsed", "p", "md-field__help mb-help");
            allUsed.id = uniqueId("schedule-values-note");
            allUsed.hidden = !addValue.disabled;
            if (addValue.disabled) {
                addValue.title = t("scheduleHelp.values.allUsed");
                addValue.setAttribute("aria-describedby", allUsed.id);
            }
            // A rule that controls nothing has no row to point at, so its guidance is
            // attached to the button that would create the first one.
            fields.set("schedule.values", addValue);
            values.append(addValue, allUsed);
        };
        renderValues();
        renderSource();

        /*
         * The guidance region is a live `alert` rather than a passive paragraph. A
         * visitor who presses Save and is told nothing has been told the site ignored
         * them; a screen-reader visitor reading a `status` region that only updates on
         * the next focus move has been told the same thing more slowly.
         */
        const validation = el("div", {
            class: "mb-schedule-validation",
            attrs: { role: "alert", tabindex: "-1" },
        });
        validation.hidden = true;
        let shownProblems: readonly GuidanceMessage[] = [];
        const paintProblems = (moveFocus: boolean): void => {
            clear(validation);
            for (const control of fields.values()) {
                control.removeAttribute("aria-invalid");
                control.removeAttribute("aria-describedby");
            }
            validation.hidden = shownProblems.length === 0;
            if (shownProblems.length === 0) return;
            const summaryKey =
                shownProblems.length === 1
                    ? "scheduleHelp.summary.one"
                    : "scheduleHelp.summary.many";
            const summary = el("p", { class: "md-field__help md-field__help--error" });
            fillPhrase(summary, summaryKey, { count: shownProblems.length });
            validation.append(summary);
            let firstControl: HTMLElement | null = null;
            for (const problem of shownProblems) {
                const line = el("p", {
                    class: "md-field__help md-field__help--error",
                    attrs: { id: uniqueId("schedule-problem") },
                    text: guidanceText(problem),
                });
                validation.append(line);
                const control = fields.get(problem.field ?? "");
                // A control that has been replaced since the map was filled is not the
                // control the visitor is looking at, so it gets neither the description
                // nor the focus.
                if (control === undefined || !form.contains(control)) continue;
                control.setAttribute("aria-invalid", "true");
                control.setAttribute("aria-describedby", line.id);
                firstControl ??= control;
            }
            if (!moveFocus) return;
            // Focus goes to the field that has to change, not to the message about it:
            // the field already has the site's focus ring and is the place typing has
            // to happen next. Only a whole-rule problem, which names no field, leaves
            // the message itself as the best available target.
            (firstControl ?? validation).focus();
        };
        /*
         * These lines are rendered text rather than `data-i18n-key` nodes, because each
         * one carries interpolated bounds that the generic copy refresh cannot supply.
         * Repainting them from the messages they came from is what keeps them in the
         * visitor's current language after a language change, instead of stranding an
         * English sentence under a Cantonese form.
         */
        repaintValidation = (): void => paintProblems(false);
        const showProblems = (problems: readonly GuidanceMessage[]): void => {
            shownProblems = problems;
            paintProblems(true);
        };
        const save = actionButton("schedule.save", "md-button md-button--filled");
        const remove = actionButton(
            "schedule.delete",
            "md-button md-button--outlined md-button--danger",
        );
        save.addEventListener("click", () => void saveRule(current, showProblems));
        remove.addEventListener("click", () => void deleteRule(current));
        remove.hidden = !options.repository
            .load()
            .rules.some((candidate) => candidate.id === current.id);

        form.addEventListener("submit", (event) => event.preventDefault());
        form.append(
            el(
                "div",
                { class: "mb-schedule-grid" },
                labelInput.element,
                enabled.element,
                priority.element,
                startDate.element,
                endDate.element,
                startTime.element,
                endTime.element,
                timezone.element,
            ),
            everyDay.element,
            weekdays,
            source.element,
            sourceFields,
            values,
            validation,
            el("div", { class: "mb-button-row" }, save, remove),
        );
        return form;
    }

    function buildValueRow(
        current: MutableRule,
        id: string,
        value: SettingValue,
        rerender: () => void,
        fields: Map<string, HTMLElement>,
    ): HTMLElement {
        const row = el("div", { class: "mb-schedule-value" });
        const available = options.store.definitions_();
        const target = el("select", {
            class: "md-field__input",
            attrs: { "aria-label": t("schedule.values") },
        });
        for (const definition of available) {
            target.append(
                el("option", { text: t(definition.labelKey), attrs: { value: definition.id } }),
            );
        }
        target.value = id;
        // Guidance about this row belongs on the picker: whether the setting is one
        // this build does not have or one that refused the value, the picker is what
        // the visitor changes next.
        fields.set(`value:${id}`, target);
        const valueHost = el("div", { class: "mb-schedule-value-control" });
        valueHost.append(
            valueControl(options.store.definition(id), value, (next) => {
                current.values = { ...current.values, [target.value]: next };
            }),
        );
        target.addEventListener("change", () => {
            const nextId = target.value;
            const nextValues = { ...current.values };
            delete nextValues[id];
            nextValues[nextId] = options.store.get(nextId);
            current.values = nextValues;
            rerender();
        });
        const remove = actionButton("schedule.removeValue", "md-icon-button");
        remove.textContent = "−";
        remove.addEventListener("click", () => {
            const nextValues = { ...current.values };
            delete nextValues[id];
            current.values = nextValues;
            rerender();
        });
        row.append(target, valueHost, remove);
        return row;
    }

    function valueControl(
        definition: StoredSetting | undefined,
        value: SettingValue,
        write: (value: SettingValue) => void,
    ): HTMLElement {
        if (definition === undefined) return el("span", { text: String(value) });
        if (definition.kind === "toggle") {
            const input = el("input", {
                attrs: { type: "checkbox", "aria-label": t(definition.labelKey) },
            });
            input.checked = value === true;
            input.addEventListener("change", () => write(input.checked));
            return input;
        }
        if (definition.kind === "select") {
            const select = el("select", {
                class: "md-field__input",
                attrs: { "aria-label": t(definition.labelKey) },
            });
            for (const option of definition.options)
                select.append(
                    el("option", { text: t(option.labelKey), attrs: { value: option.value } }),
                );
            select.value = String(value);
            select.addEventListener("change", () => write(select.value));
            return select;
        }
        const input = el("input", {
            class: "md-field__input",
            attrs: {
                "aria-label": t(definition.labelKey),
                value: String(value),
                type:
                    definition.kind === "number" || definition.kind === "slider"
                        ? "number"
                        : definition.kind === "color"
                          ? "color"
                          : "text",
            },
        });
        if (definition.kind === "number" || definition.kind === "slider") {
            input.min = String(definition.min);
            input.max = String(definition.max);
            input.step = String(definition.step);
        }
        input.addEventListener("input", () =>
            write(
                definition.kind === "number" || definition.kind === "slider"
                    ? Number(input.value)
                    : input.value,
            ),
        );
        return input;
    }

    async function saveRule(
        current: MutableRule,
        report: (problems: readonly GuidanceMessage[]) => void,
    ): Promise<void> {
        const problems = describeRuleProblems(current, options.store);
        if (problems.length > 0) {
            report(problems);
            return;
        }
        const document = options.repository.load();
        const rules = [...document.rules];
        const index = rules.findIndex((candidate) => candidate.id === current.id);
        if (index < 0) rules.push(cloneRule(current));
        else rules[index] = cloneRule(current);
        const saveErrors = options.repository.save({ version: 1, rules });
        if (saveErrors.length > 0) {
            report(saveErrors.map(describeRepositoryProblem));
            return;
        }
        report([]);
        selectedId = current.id;
        draft = null;
        await applyNow();
        options.notify?.(t("schedule.saved"), false);
        render();
    }

    async function deleteRule(current: MutableRule): Promise<void> {
        if (!(await options.confirmDelete(`${t("schedule.delete")}: ${current.label}`))) return;
        const document = options.repository.load();
        options.repository.save({
            version: 1,
            rules: document.rules.filter((candidate) => candidate.id !== current.id),
        });
        draft = null;
        selectedId = "";
        await applyNow();
        options.notify?.(t("schedule.deleted"), false);
        render();
    }

    async function applyNow(): Promise<void> {
        refreshButton.disabled = true;
        try {
            await options.controller.refresh();
        } finally {
            refreshButton.disabled = false;
        }
    }

    /**
     * The name the visitor gave a rule, not the id the schedule file gave it.
     *
     * An id is generated (`rule-3`) or imported from someone else's file, so it
     * identifies the rule for this code and for nobody else. The fallback covers the
     * one case where no name exists any more — a rule deleted between the refresh and
     * the report — and says exactly that rather than falling back to the id.
     */
    function ruleName(ruleId: string): string {
        const named = options.repository.load().rules.find((rule) => rule.id === ruleId);
        return named?.label ?? t("scheduleHelp.status.unknownRule");
    }

    function renderStatus(next: ScheduleStatus): void {
        status.textContent = guidanceText(describeStatus(next, ruleName));
        if (next.kind === "error") options.notify?.(status.textContent, true);
    }

    function renderHistory(): void {
        clear(historyList);
        const history = options.repository.history().slice().reverse();
        if (history.length === 0) {
            historyList.append(phrase("schedule.historyEmpty", "p", "mb-empty"));
            return;
        }
        for (const entry of history) {
            const restore = actionButton("schedule.restore", "md-button md-button--text");
            restore.addEventListener("click", () => {
                options.repository.restore(entry.id);
                draft = null;
                selectedId = options.repository.load().rules[0]?.id ?? "";
                void applyNow().then(render);
            });
            /*
             * `saved`, `imported` and `reset` are the stored enum values, and a bare
             * count is a number with no noun. Both were being printed as they are held
             * rather than as they read, which leaves a visitor to guess that the third
             * column counts rules and that the second is a past-tense verb.
             */
            const count = entry.document.rules.length;
            const summary = [
                new Date(entry.at).toLocaleString(),
                t(`scheduleHelp.history.action.${entry.action}`),
                count === 1
                    ? t("scheduleHelp.history.count.one")
                    : t("scheduleHelp.history.count.many", { count }),
            ].join(" · ");
            historyList.append(
                el("div", { class: "mb-history-row" }, el("span", { text: summary }), restore),
            );
        }
    }

    function refreshCopy(): void {
        for (const node of [
            ...rulesElement.querySelectorAll<HTMLElement>("[data-i18n-key]"),
            ...sourcesElement.querySelectorAll<HTMLElement>("[data-i18n-key]"),
        ]) {
            const key = node.dataset["i18nKey"];
            if (key !== undefined) fillPhrase(node, key);
        }
        rulePicker.setAttribute("aria-label", t("schedule.rule"));
        // Interpolated copy carries no key to refresh from, so it is redrawn from the
        // messages and the history entries it was built out of.
        repaintValidation?.();
        renderHistory();
        renderStatus(options.controller.status);
    }

    render();
    return {
        rulesElement,
        sourcesElement,
        destinations,
        refresh: refreshCopy,
        destroy(): void {
            options.secrets.clearAll();
            for (const dispose of disposers) dispose();
        },
    };
}

function cloneRule(rule: ScheduledSettingsRule): MutableRule {
    return {
        ...rule,
        weekdays: [...rule.weekdays],
        values: { ...rule.values },
        source: { ...rule.source },
    };
}

function phrase(
    key: string,
    tag: keyof HTMLElementTagNameMap = "span",
    className = "",
): HTMLElement {
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

function inputField(
    key: string,
    type: string,
    value: string,
    attrs: Readonly<Record<string, string>> = {},
): { element: HTMLElement; input: HTMLInputElement } {
    const id = uniqueId("schedule-field");
    const input = el("input", { class: "md-field__input", attrs: { id, type, value, ...attrs } });
    const label = phrase(key, "label", "md-field__label");
    label.setAttribute("for", id);
    return { element: el("div", { class: "md-field mb-schedule-field" }, label, input), input };
}

function checkboxField(
    key: string,
    checked: boolean,
): { element: HTMLElement; input: HTMLInputElement } {
    const input = el("input", { attrs: { type: "checkbox" } });
    input.checked = checked;
    return { element: el("label", { class: "mb-check-row" }, input, phrase(key)), input };
}

function selectField(
    key: string,
    options: readonly { value: string; label: string }[],
    value: string,
): { element: HTMLElement; input: HTMLSelectElement } {
    const id = uniqueId("schedule-select");
    const input = el("select", { class: "md-field__input", attrs: { id } });
    for (const option of options)
        input.append(el("option", { text: option.label, attrs: { value: option.value } }));
    input.value = value;
    const label = phrase(key, "label", "md-field__label");
    label.setAttribute("for", id);
    return { element: el("div", { class: "md-field mb-schedule-field" }, label, input), input };
}
