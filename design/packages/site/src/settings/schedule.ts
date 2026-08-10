import type { Preferences } from "../platform/Preferences.js";
import type { SettingValue } from "./types.js";
import type { SettingsStore } from "./store.js";
import type { Interpolations } from "./i18n.js";
import type { GuidanceMessage } from "./scheduleHelp.js";

export const SCHEDULE_SCHEMA_VERSION = 1 as const;
export const MAX_SCHEDULE_RULES = 50;
export const MAX_EXTERNAL_BYTES = 64 * 1024;
export const EXTERNAL_TIMEOUT_MS = 8_000;
export const MIN_REFRESH_MINUTES = 5;
export const MAX_REFRESH_MINUTES = 1_440;
/** The only payload version the API source understands. */
export const EXTERNAL_DOCUMENT_VERSION = 1;

/*
 * Every bound below is a constant rather than a literal buried in a regular
 * expression or a comparison, because each one is quoted back to the visitor in
 * the guidance for the field it governs. A bound written in two places is a bound
 * that eventually disagrees with itself, and the half that disagrees is always the
 * sentence — code that is wrong fails a test, prose that is wrong just misleads.
 */
export const MIN_RULE_ID_LENGTH = 1;
export const MAX_RULE_ID_LENGTH = 64;
export const MAX_RULE_LABEL_LENGTH = 80;
export const MIN_RULE_PRIORITY = -1_000;
export const MAX_RULE_PRIORITY = 1_000;
export const MAX_CREDENTIAL_KEY_LENGTH = 128;

const RULES_KEY = "scheduled-settings.rules";
const HISTORY_KEY = "scheduled-settings.history";
const RULE_ID = new RegExp(`^[a-z0-9][a-z0-9-]{0,${MAX_RULE_ID_LENGTH - 1}}$`);
const CREDENTIAL_KEY = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${MAX_CREDENTIAL_KEY_LENGTH - 1}}$`);
const ENTITY_ID = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleSource =
    | { readonly kind: "local" }
    | { readonly kind: "api"; readonly url: string; readonly refreshMinutes: number }
    | {
          readonly kind: "home-assistant";
          readonly baseUrl: string;
          readonly entityId: string;
          /** Stable credential-vault key. Never the token itself. */
          readonly credentialKey: string;
          readonly refreshMinutes: number;
      };

export interface ScheduledSettingsRule {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly priority: number;
    readonly timezone: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly everyDay: boolean;
    /** Sunday=0 through Saturday=6. Ignored when everyDay is true. */
    readonly weekdays: readonly number[];
    readonly values: Readonly<Record<string, SettingValue>>;
    readonly source: ScheduleSource;
}

export interface ScheduleDocument {
    readonly version: typeof SCHEDULE_SCHEMA_VERSION;
    readonly rules: readonly ScheduledSettingsRule[];
}

export interface ScheduleHistoryEntry {
    readonly id: string;
    readonly at: string;
    readonly action: "saved" | "imported" | "reset";
    readonly document: ScheduleDocument;
}

export type ScheduleStatus =
    | { readonly kind: "idle"; readonly message: string }
    | { readonly kind: "applied"; readonly ruleId: string; readonly ids: readonly string[] }
    | { readonly kind: "off"; readonly ruleId: string }
    | { readonly kind: "error"; readonly ruleId: string; readonly code: string };

export interface SecretProvider {
    tokenFor(credentialKey: string): Promise<string | null>;
}

/**
 * Browser-safe Home Assistant credentials for the static Pages application.
 *
 * Tokens live only in this JavaScript object. They never enter Preferences,
 * local/session storage, exports, URLs or logs, and a reload necessarily drops
 * them because there is deliberately no persistence layer behind this map.
 */
export class SessionSecretProvider implements SecretProvider {
    private readonly tokens = new Map<string, string>();

    async tokenFor(credentialKey: string): Promise<string | null> {
        return this.tokens.get(credentialKey) ?? null;
    }

    setToken(credentialKey: string, token: string): boolean {
        const value = token.trim();
        if (value === "") return false;
        this.tokens.set(credentialKey, value);
        return true;
    }

    hasToken(credentialKey: string): boolean {
        return this.tokens.has(credentialKey);
    }

    clearToken(credentialKey: string): void {
        this.tokens.delete(credentialKey);
    }

    clearAll(): void {
        this.tokens.clear();
    }
}

export interface ExternalClientOptions {
    readonly fetcher?: typeof fetch;
    readonly secrets?: SecretProvider;
}

export function localTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

export function supportedTimezones(): readonly string[] {
    const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] })
        .supportedValuesOf;
    if (supported === undefined) return [localTimezone(), "UTC"];
    return [...new Set([localTimezone(), "UTC", ...supported("timeZone")])];
}

export function defaultRule(index = 1): ScheduledSettingsRule {
    return {
        id: `rule-${index}`,
        label: `Rule ${index}`,
        enabled: true,
        priority: index,
        timezone: localTimezone(),
        startDate: "",
        endDate: "",
        startTime: "09:00",
        endTime: "17:00",
        everyDay: true,
        weekdays: [],
        values: { "language.mode": "en" },
        source: { kind: "local" },
    };
}

export function validateExternalUrl(
    text: string,
): { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly code: string } {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { ok: false, code: "invalid-url" };
    }
    if (url.username !== "" || url.password !== "")
        return { ok: false, code: "credentials-in-url" };
    if (url.hash !== "") return { ok: false, code: "fragment" };
    if (url.protocol === "https:") return { ok: true, url };
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    return url.protocol === "http:" && loopback
        ? { ok: true, url }
        : { ok: false, code: "https-required" };
}

/**
 * One rejected field, carrying both halves: the code a caller branches on and the
 * sentence a visitor can act on.
 *
 * `field` names the editor control the sentence belongs beside, using the same
 * i18n key the control's own label uses, so the panel can attach the guidance to
 * the field without a second lookup table that would drift out of step. A problem
 * that belongs to no single control — a rule that changes nothing at all, an id
 * that only an imported file could have produced — carries the empty string.
 */
export interface RuleProblem extends GuidanceMessage {
    readonly field: string;
}

/**
 * Everything wrong with a rule, said in full.
 *
 * The checks and their order are identical to what `validateRule` has always
 * reported, because `validateRule` is now this function with the sentences
 * stripped off. Keeping one implementation is the point: two validators, one for
 * saving and one for explaining, is how a visitor ends up reading advice about a
 * field that was never the reason the save failed.
 *
 * Results are deduplicated by code, matching the set `validateRule` has always
 * returned. Where one field can fail two ways at once — a label of eighty-one
 * spaces is both blank and too long — the first sentence wins, and it is the more
 * actionable of the two.
 */
export function describeRuleProblems(
    rule: ScheduledSettingsRule,
    store: SettingsStore,
): readonly RuleProblem[] {
    const problems: RuleProblem[] = [];
    const add = (
        code: string,
        field: string,
        messageKey: string,
        values: Interpolations = {},
        phraseKeys: Readonly<Record<string, string>> = {},
    ): void => {
        problems.push({ code, field, messageKey, values, phraseKeys });
    };

    if (!RULE_ID.test(rule.id)) {
        add("id", "", "scheduleHelp.problem.id", {
            min: MIN_RULE_ID_LENGTH,
            max: MAX_RULE_ID_LENGTH,
            value: rule.id,
            suggestion: suggestRuleId(rule.id),
        });
    }
    if (rule.label.trim().length === 0)
        add("label", "schedule.label", "scheduleHelp.problem.label.empty");
    else if (rule.label.length > MAX_RULE_LABEL_LENGTH) {
        add("label", "schedule.label", "scheduleHelp.problem.label.tooLong", {
            max: MAX_RULE_LABEL_LENGTH,
            length: rule.label.length,
        });
    }
    if (
        !Number.isInteger(rule.priority) ||
        rule.priority < MIN_RULE_PRIORITY ||
        rule.priority > MAX_RULE_PRIORITY
    ) {
        add("priority", "schedule.priority", "scheduleHelp.problem.priority", {
            min: MIN_RULE_PRIORITY,
            max: MAX_RULE_PRIORITY,
        });
    }
    try {
        new Intl.DateTimeFormat("en", { timeZone: rule.timezone }).format(new Date());
    } catch {
        add("timezone", "schedule.timezone", "scheduleHelp.problem.timezone", {
            value: rule.timezone,
        });
    }
    if (rule.startDate !== "" && (!DATE.test(rule.startDate) || !validDate(rule.startDate))) {
        add("start-date", "schedule.startDate", "scheduleHelp.problem.startDate", {
            value: rule.startDate,
        });
    }
    if (rule.endDate !== "" && (!DATE.test(rule.endDate) || !validDate(rule.endDate))) {
        add("end-date", "schedule.endDate", "scheduleHelp.problem.endDate", {
            value: rule.endDate,
        });
    }
    if (rule.startDate !== "" && rule.endDate !== "" && rule.startDate > rule.endDate) {
        add("date-order", "schedule.startDate", "scheduleHelp.problem.dateOrder", {
            start: rule.startDate,
            end: rule.endDate,
        });
    }
    if (!TIME.test(rule.startTime)) {
        add("start-time", "schedule.startTime", "scheduleHelp.problem.startTime", {
            value: rule.startTime,
        });
    }
    if (!TIME.test(rule.endTime)) {
        add("end-time", "schedule.endTime", "scheduleHelp.problem.endTime", {
            value: rule.endTime,
        });
    }
    if (!rule.everyDay && rule.weekdays.length === 0)
        add("weekdays-empty", "schedule.weekdays", "scheduleHelp.problem.weekdaysEmpty");
    if (rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
        add("weekdays", "schedule.weekdays", "scheduleHelp.problem.weekdays");
    if (rule.source.kind !== "api" && Object.keys(rule.values).length === 0)
        add("values-empty", "schedule.values", "scheduleHelp.problem.valuesEmpty");
    for (const [id, value] of Object.entries(rule.values)) {
        if (store.validate(id, value) !== null) continue;
        const definition = store.definition(id);
        // A setting this build does not have and a setting that refused the value
        // are different situations with different next steps, and only one of them
        // has a name the visitor could be shown. Naming the id in either case would
        // put an internal identifier in front of someone who cannot act on it.
        if (definition === undefined)
            add(`value:${id}`, `value:${id}`, "scheduleHelp.problem.unknownSetting");
        else {
            add(
                `value:${id}`,
                `value:${id}`,
                "scheduleHelp.problem.valueRejected",
                { value: String(value) },
                { name: definition.labelKey },
            );
        }
    }
    if (rule.source.kind === "api") {
        const url = validateExternalUrl(rule.source.url);
        if (!url.ok) {
            add(
                "api-url",
                "schedule.apiUrl",
                urlMessageKey(url.code),
                { value: rule.source.url },
                { advice: "scheduleHelp.url.credentials.api" },
            );
        }
        if (!validRefresh(rule.source.refreshMinutes)) addRefreshProblem(add);
    }
    if (rule.source.kind === "home-assistant") {
        const url = validateExternalUrl(rule.source.baseUrl);
        if (!url.ok) {
            add(
                "ha-url",
                "schedule.haUrl",
                urlMessageKey(url.code),
                { value: rule.source.baseUrl },
                { advice: "scheduleHelp.url.credentials.ha" },
            );
        }
        if (!ENTITY_ID.test(rule.source.entityId)) {
            add("ha-entity", "schedule.haEntity", "scheduleHelp.problem.haEntity", {
                value: rule.source.entityId,
            });
        }
        if (!CREDENTIAL_KEY.test(rule.source.credentialKey)) {
            add("ha-credential-key", "", "scheduleHelp.problem.credentialKey", {
                max: MAX_CREDENTIAL_KEY_LENGTH,
            });
        }
        if (!validRefresh(rule.source.refreshMinutes)) addRefreshProblem(add);
    }

    const seen = new Set<string>();
    return problems.filter((problem) => {
        if (seen.has(problem.code)) return false;
        seen.add(problem.code);
        return true;
    });
}

/** The machine codes alone, for callers that only need to know whether a rule is savable. */
export function validateRule(rule: ScheduledSettingsRule, store: SettingsStore): readonly string[] {
    return describeRuleProblems(rule, store).map((problem) => problem.code);
}

/**
 * A rule id a visitor could actually paste back into their export file.
 *
 * Telling someone their id is invalid and stopping there leaves them to work out
 * the alphabet themselves; showing the same name with the spaces turned into
 * hyphens usually ends the problem in one read.
 */
export function suggestRuleId(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .slice(0, MAX_RULE_ID_LENGTH)
        .replace(/-+$/, "");
    return slug === "" ? defaultRule().id : slug;
}

/** The refusal that a rejected address explains, rather than the field name it arrived on. */
function urlMessageKey(code: string): string {
    switch (code) {
        case "credentials-in-url":
            return "scheduleHelp.url.credentials";
        case "fragment":
            return "scheduleHelp.url.fragment";
        case "https-required":
            return "scheduleHelp.url.https";
        default:
            return "scheduleHelp.url.invalid";
    }
}

function addRefreshProblem(
    add: (
        code: string,
        field: string,
        messageKey: string,
        values?: Interpolations,
        phraseKeys?: Readonly<Record<string, string>>,
    ) => void,
): void {
    add("refresh", "schedule.refresh", "scheduleHelp.problem.refresh", {
        min: MIN_REFRESH_MINUTES,
        max: MAX_REFRESH_MINUTES,
    });
}

/**
 * The refusal a whole-document write reports, in words.
 *
 * `save` and `restore` answer with a code apiece rather than a per-field list,
 * because what they reject is the set as a whole: a duplicate id, one rule too
 * many, a version this build cannot read. The visitor still needs to know that
 * nothing was written, which is the part a bare `document` never told them.
 */
export function describeRepositoryProblem(code: string): GuidanceMessage {
    if (code === "history") {
        return {
            code,
            messageKey: "scheduleHelp.problem.history",
            values: {},
            phraseKeys: {},
        };
    }
    return {
        code,
        messageKey: "scheduleHelp.problem.document",
        values: { version: SCHEDULE_SCHEMA_VERSION, max: MAX_SCHEDULE_RULES },
        phraseKeys: {},
    };
}

/**
 * The controller's status, in words, with the rule named the way the visitor named it.
 *
 * The status carries a rule *id*, which is the right thing for it to carry and the
 * wrong thing to print: ids are generated, and an imported set can hold ids that
 * mean nothing to the person reading them. The caller passes a resolver rather
 * than this module reaching for the repository, so the naming stays where the
 * rules are already loaded.
 */
export function describeStatus(
    status: ScheduleStatus,
    ruleName: (ruleId: string) => string,
): GuidanceMessage {
    switch (status.kind) {
        case "idle":
            return {
                code: status.kind,
                messageKey: "schedule.status.idle",
                values: {},
                phraseKeys: {},
            };
        case "applied":
            return {
                code: status.kind,
                messageKey: "schedule.status.applied",
                values: { rule: ruleName(status.ruleId), count: status.ids.length },
                phraseKeys: {},
            };
        case "off":
            return {
                code: status.kind,
                messageKey: "schedule.status.off",
                values: { rule: ruleName(status.ruleId) },
                phraseKeys: {},
            };
        case "error": {
            const reason = externalReason(status.code);
            return {
                code: status.code,
                messageKey: "scheduleHelp.status.error",
                values: { rule: ruleName(status.ruleId), ...reason.values },
                phraseKeys: { reason: reason.key },
            };
        }
    }
}

/**
 * What a thrown external code means to somebody who did not write it.
 *
 * The last branch is deliberate rather than lazy. An unrecognised code has no
 * sentence, and inventing a reassuring one would be a lie; printing it bare would
 * be the original defect again. Naming it as a technical code and saying what it
 * is good for — quoting in a bug report — is the honest middle, because it tells
 * the reader that the string is not addressed to them.
 */
function externalReason(code: string): { key: string; values: Interpolations } {
    const http = /^http-(\d{3})$/.exec(code);
    if (http !== null)
        return { key: "scheduleHelp.reason.http", values: { status: http[1] ?? "" } };
    switch (code) {
        case "redirect":
            return { key: "scheduleHelp.reason.redirect", values: {} };
        case "authentication":
            return { key: "scheduleHelp.reason.authentication", values: {} };
        case "rate-limited":
            return { key: "scheduleHelp.reason.rateLimited", values: {} };
        case "too-large":
            return {
                key: "scheduleHelp.reason.tooLarge",
                values: { kilobytes: Math.floor(MAX_EXTERNAL_BYTES / 1024) },
            };
        case "malformed-json":
            return { key: "scheduleHelp.reason.malformedJson", values: {} };
        case "api-schema":
            return {
                key: "scheduleHelp.reason.apiSchema",
                values: { version: EXTERNAL_DOCUMENT_VERSION },
            };
        case "ha-schema":
            return { key: "scheduleHelp.reason.haSchema", values: {} };
        case "ha-state":
            return { key: "scheduleHelp.reason.haState", values: {} };
        case "missing-token":
            return { key: "scheduleHelp.reason.missingToken", values: {} };
        case "no-allowed-values":
            return { key: "scheduleHelp.reason.noAllowedValues", values: {} };
        case "invalid-url":
        case "credentials-in-url":
        case "fragment":
        case "https-required":
            return { key: "scheduleHelp.reason.url", values: {} };
        default:
            return { key: "scheduleHelp.reason.unknown", values: { code } };
    }
}

export function ruleMatches(rule: ScheduledSettingsRule, now: Date): boolean {
    if (!rule.enabled) return false;
    const current = zonedParts(now, rule.timezone);
    if (current === null) return false;
    const start = minutes(rule.startTime);
    const end = minutes(rule.endTime);
    const minute = minutes(current.time);
    // The early portion of a cross-midnight window belongs to the day on which
    // the rule started. This keeps a Friday 22:00-02:00 rule alive after midnight
    // on Saturday without also treating Saturday as selected.
    const usePreviousDay = start > end && minute < end;
    const parts = usePreviousDay
        ? zonedParts(new Date(now.getTime() - 86_400_000), rule.timezone)
        : current;
    if (parts === null) return false;
    if (rule.startDate !== "" && parts.date < rule.startDate) return false;
    if (rule.endDate !== "" && parts.date > rule.endDate) return false;
    if (!rule.everyDay && !rule.weekdays.includes(parts.weekday)) return false;
    // Equal endpoints mean the full selected day, never an invisible zero-minute window.
    if (start === end) return true;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Higher priority wins; a later rule wins a priority tie. */
export function winningRule(
    rules: readonly ScheduledSettingsRule[],
    now: Date,
): ScheduledSettingsRule | null {
    let winner: { rule: ScheduledSettingsRule; index: number } | null = null;
    for (const [index, rule] of rules.entries()) {
        if (!ruleMatches(rule, now)) continue;
        if (
            winner === null ||
            rule.priority > winner.rule.priority ||
            (rule.priority === winner.rule.priority && index > winner.index)
        ) {
            winner = { rule, index };
        }
    }
    return winner === null ? null : winner.rule;
}

/** Matching rules in the exact order the controller evaluates them. */
export function matchingRules(
    rules: readonly ScheduledSettingsRule[],
    now: Date,
): readonly ScheduledSettingsRule[] {
    return rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => ruleMatches(rule, now))
        .sort((left, right) => right.rule.priority - left.rule.priority || right.index - left.index)
        .map(({ rule }) => rule);
}

export class ScheduleRepository {
    constructor(
        private readonly prefs: Preferences,
        private readonly store: SettingsStore,
    ) {}

    load(): ScheduleDocument {
        return (
            this.prefs.readJson(RULES_KEY, (value) => reviveDocument(value, this.store)) ?? {
                version: SCHEDULE_SCHEMA_VERSION,
                rules: [],
            }
        );
    }

    save(
        document: ScheduleDocument,
        action: ScheduleHistoryEntry["action"] = "saved",
    ): readonly string[] {
        const revived = reviveDocument(document, this.store);
        if (revived === undefined) return ["document"];
        this.prefs.writeJson(RULES_KEY, revived);
        const history = this.history();
        history.push({
            id: `${Date.now()}-${history.length}`,
            at: new Date().toISOString(),
            action,
            document: revived,
        });
        this.prefs.writeJson(HISTORY_KEY, history.slice(-100));
        return [];
    }

    history(): ScheduleHistoryEntry[] {
        return this.prefs.readJson(HISTORY_KEY, reviveHistory) ?? [];
    }

    reset(): void {
        this.save({ version: SCHEDULE_SCHEMA_VERSION, rules: [] }, "reset");
    }

    restore(historyId: string): readonly string[] {
        const entry = this.history().find((candidate) => candidate.id === historyId);
        return entry === undefined ? ["history"] : this.save(entry.document, "imported");
    }
}

export class ExternalSettingsClient {
    private readonly fetcher: typeof fetch;
    private readonly secrets: SecretProvider;

    constructor(options: ExternalClientOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.secrets = options.secrets ?? { tokenFor: async () => null };
    }

    async values(
        rule: ScheduledSettingsRule,
        store: SettingsStore,
        signal: AbortSignal,
    ): Promise<{ values: Readonly<Record<string, SettingValue>>; off: boolean }> {
        if (rule.source.kind === "local") return { values: rule.values, off: false };
        if (rule.source.kind === "api") {
            const checked = validateExternalUrl(rule.source.url);
            if (!checked.ok) throw new Error(checked.code);
            const payload = await this.request(checked.url, {}, signal);
            if (
                !isRecord(payload) ||
                payload["version"] !== EXTERNAL_DOCUMENT_VERSION ||
                !isRecord(payload["values"])
            )
                throw new Error("api-schema");
            return { values: validatedValues(payload["values"], store), off: false };
        }
        const checked = validateExternalUrl(rule.source.baseUrl);
        if (!checked.ok) throw new Error(checked.code);
        const token = await this.secrets.tokenFor(rule.source.credentialKey);
        if (token === null || token === "") throw new Error("missing-token");
        const endpoint = new URL(`/api/states/${rule.source.entityId}`, checked.url);
        const payload = await this.request(endpoint, { Authorization: `Bearer ${token}` }, signal);
        if (!isRecord(payload) || typeof payload["state"] !== "string")
            throw new Error("ha-schema");
        const state = payload["state"];
        if (state === "off") return { values: {}, off: true };
        if (state !== "on") throw new Error("ha-state");
        return { values: rule.values, off: false };
    }

    private async request(
        url: URL,
        headers: Readonly<Record<string, string>>,
        outerSignal: AbortSignal,
    ): Promise<unknown> {
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        outerSignal.addEventListener("abort", abort, { once: true });
        const timeout = globalThis.setTimeout(abort, EXTERNAL_TIMEOUT_MS);
        try {
            const response = await this.fetcher(url, {
                method: "GET",
                headers: { Accept: "application/json", ...headers },
                redirect: "manual",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
            });
            if (
                response.type === "opaqueredirect" ||
                (response.status >= 300 && response.status < 400)
            )
                throw new Error("redirect");
            if (response.status === 401 || response.status === 403)
                throw new Error("authentication");
            if (response.status === 429) throw new Error("rate-limited");
            if (!response.ok) throw new Error(`http-${response.status}`);
            const declared = Number(response.headers.get("content-length") ?? "0");
            if (declared > MAX_EXTERNAL_BYTES) throw new Error("too-large");
            const text = await response.text();
            if (new TextEncoder().encode(text).byteLength > MAX_EXTERNAL_BYTES)
                throw new Error("too-large");
            try {
                return JSON.parse(text) as unknown;
            } catch {
                throw new Error("malformed-json");
            }
        } finally {
            globalThis.clearTimeout(timeout);
            outerSignal.removeEventListener("abort", abort);
        }
    }
}

export class ScheduledSettingsController {
    private generation = 0;
    private abort: AbortController | null = null;
    private timer: number | null = null;
    private statusValue: ScheduleStatus = { kind: "idle", message: "No matching rule." };
    private readonly listeners = new Set<(status: ScheduleStatus) => void>();
    private readonly externalCache = new Map<
        string,
        { at: number; values: Readonly<Record<string, SettingValue>>; off: boolean }
    >();

    constructor(
        private readonly repository: ScheduleRepository,
        private readonly store: SettingsStore,
        private readonly client = new ExternalSettingsClient(),
    ) {}

    get status(): ScheduleStatus {
        return this.statusValue;
    }

    subscribe(listener: (status: ScheduleStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async refresh(now = new Date()): Promise<ScheduleStatus> {
        this.generation += 1;
        const generation = this.generation;
        this.abort?.abort();
        this.abort = new AbortController();
        const candidates = matchingRules(this.repository.load().rules, now);
        if (candidates.length === 0) {
            this.store.replaceScheduledOverrides({});
            return this.setStatus({ kind: "idle", message: "No matching rule." });
        }
        let lastOff: ScheduledSettingsRule | null = null;
        for (const rule of candidates) {
            try {
                const refreshMinutes =
                    rule.source.kind === "local" ? 0 : rule.source.refreshMinutes;
                const cached = this.externalCache.get(rule.id);
                const canReuse =
                    cached !== undefined && now.getTime() - cached.at < refreshMinutes * 60_000;
                const resolved = canReuse
                    ? cached
                    : await this.client.values(rule, this.store, this.abort.signal);
                if (generation !== this.generation) return this.statusValue;
                if (!canReuse && rule.source.kind !== "local") {
                    this.externalCache.set(rule.id, {
                        at: now.getTime(),
                        values: resolved.values,
                        off: resolved.off,
                    });
                }
                // A Home Assistant boolean in `off` means this rule does not match.
                // Keep evaluating lower-priority scheduled rules instead of clearing
                // the whole schedule and hiding a valid fallback.
                if (resolved.off) {
                    lastOff = rule;
                    continue;
                }
                const ids = this.store.replaceScheduledOverrides(resolved.values);
                return this.setStatus({ kind: "applied", ruleId: rule.id, ids });
            } catch (error) {
                if (generation !== this.generation) return this.statusValue;
                // Unavailable or refused external state is not an authoritative `off`.
                // Fail closed to base values and report the exact failing rule rather
                // than silently treating an outage as permission for a fallback rule.
                this.store.replaceScheduledOverrides({});
                return this.setStatus({ kind: "error", ruleId: rule.id, code: errorCode(error) });
            }
        }
        this.store.replaceScheduledOverrides({});
        return this.setStatus({
            kind: "off",
            ruleId: lastOff?.id ?? candidates[0]?.id ?? "unknown",
        });
    }

    start(): void {
        if (this.timer !== null) return;
        void this.refresh();
        this.timer = globalThis.setInterval(() => void this.refresh(), 60_000) as unknown as number;
    }

    destroy(): void {
        this.generation += 1;
        this.abort?.abort();
        if (this.timer !== null) globalThis.clearInterval(this.timer);
        this.timer = null;
        this.store.replaceScheduledOverrides({});
        this.listeners.clear();
    }

    private setStatus(status: ScheduleStatus): ScheduleStatus {
        this.statusValue = status;
        for (const listener of [...this.listeners]) listener(status);
        return status;
    }
}

function reviveDocument(value: unknown, store: SettingsStore): ScheduleDocument | undefined {
    if (
        !isRecord(value) ||
        value["version"] !== SCHEDULE_SCHEMA_VERSION ||
        !Array.isArray(value["rules"])
    )
        return undefined;
    if (value["rules"].length > MAX_SCHEDULE_RULES) return undefined;
    const rules: ScheduledSettingsRule[] = [];
    for (const raw of value["rules"]) {
        const rule = reviveRule(raw);
        if (
            rule === undefined ||
            validateRule(rule, store).length > 0 ||
            rules.some((existing) => existing.id === rule.id)
        )
            return undefined;
        rules.push(rule);
    }
    return { version: SCHEDULE_SCHEMA_VERSION, rules };
}

function reviveRule(value: unknown): ScheduledSettingsRule | undefined {
    if (!isRecord(value) || !isRecord(value["values"]) || !isRecord(value["source"]))
        return undefined;
    const sourceRaw = value["source"];
    let source: ScheduleSource;
    if (sourceRaw["kind"] === "local") source = { kind: "local" };
    else if (
        sourceRaw["kind"] === "api" &&
        typeof sourceRaw["url"] === "string" &&
        typeof sourceRaw["refreshMinutes"] === "number"
    ) {
        source = {
            kind: "api",
            url: sourceRaw["url"],
            refreshMinutes: sourceRaw["refreshMinutes"],
        };
    } else if (
        sourceRaw["kind"] === "home-assistant" &&
        typeof sourceRaw["baseUrl"] === "string" &&
        typeof sourceRaw["entityId"] === "string" &&
        typeof sourceRaw["credentialKey"] === "string" &&
        typeof sourceRaw["refreshMinutes"] === "number"
    ) {
        source = {
            kind: "home-assistant",
            baseUrl: sourceRaw["baseUrl"],
            entityId: sourceRaw["entityId"],
            credentialKey: sourceRaw["credentialKey"],
            refreshMinutes: sourceRaw["refreshMinutes"],
        };
    } else return undefined;
    if (
        typeof value["id"] !== "string" ||
        typeof value["label"] !== "string" ||
        typeof value["enabled"] !== "boolean" ||
        typeof value["priority"] !== "number" ||
        typeof value["timezone"] !== "string" ||
        typeof value["startDate"] !== "string" ||
        typeof value["endDate"] !== "string" ||
        typeof value["startTime"] !== "string" ||
        typeof value["endTime"] !== "string" ||
        typeof value["everyDay"] !== "boolean" ||
        !Array.isArray(value["weekdays"])
    )
        return undefined;
    const values: Record<string, SettingValue> = {};
    for (const [id, raw] of Object.entries(value["values"])) {
        if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean")
            return undefined;
        values[id] = raw;
    }
    return {
        id: value["id"],
        label: value["label"],
        enabled: value["enabled"],
        priority: value["priority"],
        timezone: value["timezone"],
        startDate: value["startDate"],
        endDate: value["endDate"],
        startTime: value["startTime"],
        endTime: value["endTime"],
        everyDay: value["everyDay"],
        weekdays: value["weekdays"].filter((day): day is number => typeof day === "number"),
        values,
        source,
    };
}

function reviveHistory(value: unknown): ScheduleHistoryEntry[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.flatMap((raw) => {
        if (
            !isRecord(raw) ||
            typeof raw["id"] !== "string" ||
            typeof raw["at"] !== "string" ||
            !["saved", "imported", "reset"].includes(String(raw["action"])) ||
            !isRecord(raw["document"])
        )
            return [];
        return [
            {
                id: raw["id"],
                at: raw["at"],
                action: raw["action"] as ScheduleHistoryEntry["action"],
                document: raw["document"] as unknown as ScheduleDocument,
            },
        ];
    });
}

function validatedValues(
    raw: Record<string, unknown>,
    store: SettingsStore,
): Record<string, SettingValue> {
    const values: Record<string, SettingValue> = {};
    for (const [id, candidate] of Object.entries(raw)) {
        if (
            typeof candidate !== "string" &&
            typeof candidate !== "number" &&
            typeof candidate !== "boolean"
        )
            continue;
        const value = store.validate(id, candidate);
        if (value !== null) values[id] = value;
    }
    if (Object.keys(values).length === 0) throw new Error("no-allowed-values");
    return values;
}

function zonedParts(
    date: Date,
    timezone: string,
): { date: string; time: string; weekday: number } | null {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            weekday: "short",
        }).formatToParts(date);
        const read = (type: Intl.DateTimeFormatPartTypes): string =>
            parts.find((part) => part.type === type)?.value ?? "";
        const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
        return {
            date: `${read("year")}-${read("month")}-${read("day")}`,
            time: `${read("hour")}:${read("minute")}`,
            weekday,
        };
    } catch {
        return null;
    }
}

function minutes(time: string): number {
    const [hour = "0", minute = "0"] = time.split(":");
    return Number(hour) * 60 + Number(minute);
}

function validDate(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
    );
}

function validRefresh(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_REFRESH_MINUTES && value <= MAX_REFRESH_MINUTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 80) : "unknown";
}
