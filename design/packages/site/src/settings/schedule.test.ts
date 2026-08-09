// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import {
    ExternalSettingsClient,
    MAX_EXTERNAL_BYTES,
    MAX_REFRESH_MINUTES,
    MAX_RULE_ID_LENGTH,
    MAX_RULE_PRIORITY,
    MAX_SCHEDULE_RULES,
    MIN_REFRESH_MINUTES,
    MIN_RULE_ID_LENGTH,
    MIN_RULE_PRIORITY,
    ScheduleRepository,
    ScheduledSettingsController,
    defaultRule,
    describeRepositoryProblem,
    describeRuleProblems,
    describeStatus,
    ruleMatches,
    suggestRuleId,
    validateExternalUrl,
    validateRule,
    winningRule,
    type ScheduledSettingsRule,
} from "./schedule.js";
import { guidanceText } from "./scheduleHelp.js";
import { SETTINGS } from "./schema.js";
import { SettingsStore } from "./store.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

function setup(): {
    storage: Storage;
    prefs: Preferences;
    store: SettingsStore;
    repository: ScheduleRepository;
} {
    const storage = new MemoryStorage();
    const prefs = new Preferences(storage);
    const store = new SettingsStore(prefs);
    store.register(SETTINGS);
    return { storage, prefs, store, repository: new ScheduleRepository(prefs, store) };
}

function rule(overrides: Partial<ScheduledSettingsRule> = {}): ScheduledSettingsRule {
    return { ...defaultRule(), timezone: "UTC", ...overrides };
}

describe("scheduled settings validation and matching", () => {
    it("accepts HTTPS and loopback HTTP but refuses credentials, fragments, and cleartext hosts", () => {
        expect(validateExternalUrl("https://example.test/settings.json").ok).toBe(true);
        expect(validateExternalUrl("http://127.0.0.1:8123/api").ok).toBe(true);
        expect(validateExternalUrl("http://example.test/api")).toEqual({
            ok: false,
            code: "https-required",
        });
        expect(validateExternalUrl("https://a:b@example.test/")).toEqual({
            ok: false,
            code: "credentials-in-url",
        });
        expect(validateExternalUrl("https://example.test/#secret")).toEqual({
            ok: false,
            code: "fragment",
        });
    });

    it("validates ids, dates, weekdays, values, refresh bounds, and Home Assistant entities", () => {
        const { store } = setup();
        expect(validateRule(rule(), store)).toEqual([]);
        const invalid = rule({
            id: "No spaces allowed",
            startDate: "2026-02-31",
            everyDay: false,
            weekdays: [],
            values: { missing: true },
            source: {
                kind: "home-assistant",
                baseUrl: "http://example.test",
                entityId: "light.kitchen",
                credentialKey: "",
                refreshMinutes: 1,
            },
        });
        expect(validateRule(invalid, store)).toEqual(
            expect.arrayContaining([
                "id",
                "start-date",
                "weekdays-empty",
                "value:missing",
                "ha-url",
                "ha-entity",
                "ha-credential-key",
                "refresh",
            ]),
        );
    });

    it("supports weekday, date, timezone, cross-midnight, and full-day equal endpoints", () => {
        const fridayNight = rule({
            everyDay: false,
            weekdays: [5],
            startDate: "2026-08-07",
            endDate: "2026-08-07",
            startTime: "22:00",
            endTime: "02:00",
        });
        expect(ruleMatches(fridayNight, new Date("2026-08-07T23:00:00Z"))).toBe(true);
        expect(ruleMatches(fridayNight, new Date("2026-08-08T01:30:00Z"))).toBe(true);
        expect(ruleMatches(fridayNight, new Date("2026-08-08T03:00:00Z"))).toBe(false);
        const fullDay = rule({ startTime: "00:00", endTime: "00:00" });
        expect(ruleMatches(fullDay, new Date("2026-08-07T14:19:00Z"))).toBe(true);
        const toronto = rule({ timezone: "America/Toronto", startTime: "09:00", endTime: "10:00" });
        expect(ruleMatches(toronto, new Date("2026-08-07T13:30:00Z"))).toBe(true);
    });

    it("uses higher priority, then the later rule for a stable tie", () => {
        const now = new Date("2026-08-07T12:00:00Z");
        expect(
            winningRule([rule({ id: "one", priority: 10 }), rule({ id: "two", priority: 10 })], now)
                ?.id,
        ).toBe("two");
        expect(
            winningRule([rule({ id: "one", priority: 11 }), rule({ id: "two", priority: 10 })], now)
                ?.id,
        ).toBe("one");
    });
});

describe("scheduled settings guidance", () => {
    /** Every rejected field of a rule, keyed by its machine code, for direct lookup. */
    function problems(rule: ScheduledSettingsRule, store: SettingsStore): Map<string, string> {
        return new Map(
            describeRuleProblems(rule, store).map((problem) => [
                problem.code,
                guidanceText(problem),
            ]),
        );
    }

    it("states the real constraint for every field it refuses, never the field's internal name", () => {
        const { store } = setup();
        const said = problems(
            rule({
                id: "No spaces allowed",
                label: "",
                priority: MAX_RULE_PRIORITY + 1,
                timezone: "Mars/Olympus_Mons",
                startDate: "2026-02-31",
                endDate: "2026-08-01",
                startTime: "25:00",
                endTime: "9am",
                everyDay: false,
                weekdays: [],
                values: { missing: true, "theme.mode": "chartreuse" },
                source: {
                    kind: "api",
                    url: "http://example.test/settings.json",
                    refreshMinutes: 1,
                },
            }),
            store,
        );

        expect(said.get("id")).toContain(`${MIN_RULE_ID_LENGTH} to ${MAX_RULE_ID_LENGTH}`);
        expect(said.get("id")).toContain("no-spaces-allowed");
        expect(said.get("priority")).toContain(`${MIN_RULE_PRIORITY} to ${MAX_RULE_PRIORITY}`);
        expect(said.get("timezone")).toContain("Mars/Olympus_Mons");
        expect(said.get("start-date")).toContain("YYYY-MM-DD");
        expect(said.get("start-time")).toContain("23:59");
        expect(said.get("end-time")).toContain("23:59");
        expect(said.get("weekdays-empty")?.toLowerCase()).toContain("every day");
        expect(said.get("refresh")).toContain(`${MIN_REFRESH_MINUTES} to ${MAX_REFRESH_MINUTES}`);
        // The address was refused for one specific reason, and that reason is what the
        // sentence explains rather than repeating the name of the field it arrived on.
        expect(said.get("api-url")).toContain("https://");
        expect(said.get("api-url")).toContain("127.0.0.1");
        // A setting this build does not have, and a setting that refused the value, are
        // different situations; neither one prints the internal id at the visitor.
        expect(said.get("value:missing")?.toLowerCase()).toContain("does not have");
        expect(said.get("value:missing")).not.toContain("missing");
        expect(said.get("value:theme.mode")).toContain("Theme");
        expect(said.get("value:theme.mode")).toContain("chartreuse");
        expect(said.get("value:theme.mode")).not.toContain("theme.mode");

        // Nothing is left as a bare code, and no key went unregistered.
        for (const problem of describeRuleProblems(rule({ id: "!" }), store)) {
            const text = guidanceText(problem);
            expect(text).not.toBe(problem.messageKey);
            expect(text).not.toBe(problem.code);
            expect(text.length).toBeGreaterThan(20);
        }
    });

    it("explains each way an address can be refused, and every Home Assistant field", () => {
        const { store } = setup();
        const source = (baseUrl: string): ScheduledSettingsRule =>
            rule({
                source: {
                    kind: "home-assistant",
                    baseUrl,
                    entityId: "light.kitchen",
                    credentialKey: "",
                    refreshMinutes: 15,
                },
            });
        expect(problems(source("https://a:b@example.test/"), store).get("ha-url")).toContain(
            "username and password",
        );
        expect(problems(source("https://example.test/#secret"), store).get("ha-url")).toContain(
            "#",
        );
        expect(problems(source("not-a-url"), store).get("ha-url")).toContain(
            "https://example.test/settings.json",
        );
        const said = problems(source("http://example.test"), store);
        expect(said.get("ha-entity")).toContain("input_boolean");
        expect(said.get("ha-entity")).toContain("light.kitchen");
        expect(said.get("ha-credential-key")?.length ?? 0).toBeGreaterThan(20);
        // The advice differs by source even though the constraint does not: a Home
        // Assistant token has a field to go in, and a plain API endpoint does not.
        expect(problems(source("https://a:b@example.test/"), store).get("ha-url")).toContain(
            "session token field",
        );
    });

    it("keeps the machine code beside the sentence, and reports every failure at once", () => {
        const { store } = setup();
        const broken = rule({
            id: "Not An Id",
            label: "",
            priority: 0.5,
            startTime: "nope",
            everyDay: false,
            weekdays: [],
        });
        const described = describeRuleProblems(broken, store);
        expect(described.map((problem) => problem.code)).toEqual(validateRule(broken, store));
        expect(described.map((problem) => problem.code)).toEqual(
            expect.arrayContaining(["id", "label", "priority", "start-time", "weekdays-empty"]),
        );
        expect(described.length).toBeGreaterThanOrEqual(5);
        // Each problem names the control it belongs beside, except the ones that belong
        // to no single control, so the panel can attach guidance rather than list it.
        expect(described.find((problem) => problem.code === "priority")?.field).toBe(
            "schedule.priority",
        );
        expect(described.find((problem) => problem.code === "id")?.field).toBe("");
        expect(validateRule(rule(), store)).toEqual([]);
        expect(describeRuleProblems(rule(), store)).toEqual([]);
    });

    it("suggests an id that would actually be accepted", () => {
        expect(suggestRuleId("Evening Reading")).toBe("evening-reading");
        expect(suggestRuleId("  ✨ Weekend ✨  ")).toBe("weekend");
        expect(suggestRuleId("!!!")).toBe(defaultRule().id);
        expect(suggestRuleId("x".repeat(MAX_RULE_ID_LENGTH + 10))).toHaveLength(MAX_RULE_ID_LENGTH);
        const { store } = setup();
        for (const candidate of ["Evening Reading", "  ✨ Weekend ✨  ", "!!!"]) {
            expect(validateRule(rule({ id: suggestRuleId(candidate) }), store)).toEqual([]);
        }
    });

    it("turns a controller status into a sentence naming the rule the visitor named", () => {
        const named = (id: string): string => (id === "night" ? "Night mode" : "Gone");
        expect(guidanceText(describeStatus({ kind: "idle", message: "" }, named))).toContain(
            "No matching rule",
        );
        expect(
            guidanceText(describeStatus({ kind: "applied", ruleId: "night", ids: ["a"] }, named)),
        ).toContain("Night mode");
        const failed = describeStatus({ kind: "error", ruleId: "night", code: "http-503" }, named);
        expect(failed.code).toBe("http-503");
        expect(guidanceText(failed)).toContain("Night mode");
        expect(guidanceText(failed)).toContain("503");
        expect(guidanceText(failed)).not.toContain("http-503");
        expect(
            guidanceText(
                describeStatus({ kind: "error", ruleId: "night", code: "missing-token" }, named),
            ),
        ).toContain("token");
        // An unrecognised code has no sentence. It is named as a technical code rather
        // than dressed up as an explanation or hidden behind a reassuring guess.
        const strange = guidanceText(
            describeStatus({ kind: "error", ruleId: "night", code: "wat" }, named),
        );
        expect(strange).toContain("technical code");
        expect(strange).toContain("wat");
    });

    it("explains a refused whole-document write, including that nothing was written", () => {
        const { store, repository } = setup();
        const refused = repository.save({
            version: 1,
            rules: Array.from({ length: MAX_SCHEDULE_RULES + 1 }, (_, index) =>
                rule({ id: `rule-${index}` }),
            ),
        });
        expect(refused).toEqual(["document"]);
        const said = guidanceText(describeRepositoryProblem(refused[0] ?? ""));
        expect(said).toContain(String(MAX_SCHEDULE_RULES));
        expect(said.toLowerCase()).toContain("nothing was written");
        expect(guidanceText(describeRepositoryProblem("history")).toLowerCase()).toContain(
            "no longer",
        );
        expect(store.definitions_().length).toBeGreaterThan(0);
    });
});

describe("schedule persistence and recoverability", () => {
    it("persists a versioned document, bounds the rule count, records history, and restores a prior base", () => {
        const { prefs, store, repository } = setup();
        const first = { version: 1 as const, rules: [rule({ label: "Morning" })] };
        expect(repository.save(first)).toEqual([]);
        expect(new ScheduleRepository(prefs, store).load()).toEqual(first);
        expect(
            repository.save({
                version: 1,
                rules: Array.from({ length: MAX_SCHEDULE_RULES + 1 }, (_, index) =>
                    rule({ id: `rule-${index}` }),
                ),
            }),
        ).toEqual(["document"]);
        const historyId = repository.history()[0]?.id;
        repository.reset();
        expect(repository.load().rules).toHaveLength(0);
        expect(historyId).toBeDefined();
        expect(repository.restore(historyId ?? "missing")).toEqual([]);
        expect(repository.load()).toEqual(first);
    });

    it("fails closed on an unknown schema version", () => {
        const { storage, prefs, store } = setup();
        storage.setItem(
            "mbm-site:scheduled-settings.rules",
            JSON.stringify({ version: 99, rules: [rule()] }),
        );
        expect(new ScheduleRepository(prefs, store).load()).toEqual({ version: 1, rules: [] });
    });
});

describe("external rule sources", () => {
    it("allowlists API values and ignores unknown fields", async () => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            version: 1,
                            values: { "theme.mode": "dark", unknown: "nope" },
                            ignored: true,
                        }),
                        { status: 200 },
                    ),
            ) as typeof fetch,
        });
        const result = await client.values(
            rule({
                values: {},
                source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
            }),
            store,
            new AbortController().signal,
        );
        expect(result).toEqual({ values: { "theme.mode": "dark" }, off: false });
    });

    it.each([
        [302, "redirect", ""],
        [401, "authentication", "{}"],
        [429, "rate-limited", "{}"],
        [200, "malformed-json", "not-json"],
    ])("reports HTTP %s as %s", async (status, code, body) => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () =>
                    new Response(body, {
                        status,
                        headers: status === 302 ? { location: "https://elsewhere.test" } : {},
                    }),
            ) as typeof fetch,
        });
        await expect(
            client.values(
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow(code);
    });

    it("refuses an oversized response even when the server omits content-length", async () => {
        const { store } = setup();
        const client = new ExternalSettingsClient({
            fetcher: vi.fn(
                async () => new Response("x".repeat(MAX_EXTERNAL_BYTES + 1), { status: 200 }),
            ) as typeof fetch,
        });
        await expect(
            client.values(
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow("too-large");
    });

    it("reads Home Assistant on/off through an injected secret provider without putting a token in the rule", async () => {
        const { store } = setup();
        const fetcher = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
            expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
                "Bearer kept-out-of-settings",
            );
            return new Response(JSON.stringify({ state: "on" }), { status: 200 });
        }) as typeof fetch;
        const client = new ExternalSettingsClient({
            fetcher,
            secrets: { tokenFor: async () => "kept-out-of-settings" },
        });
        const result = await client.values(
            rule({
                source: {
                    kind: "home-assistant",
                    baseUrl: "https://ha.example.test",
                    entityId: "input_boolean.site_dark",
                    credentialKey: "ha-main",
                    refreshMinutes: 5,
                },
                values: { "theme.mode": "dark" },
            }),
            store,
            new AbortController().signal,
        );
        expect(result).toEqual({ values: { "theme.mode": "dark" }, off: false });
        const missing = new ExternalSettingsClient({
            fetcher,
            secrets: { tokenFor: async () => null },
        });
        await expect(
            missing.values(
                rule({
                    source: {
                        kind: "home-assistant",
                        baseUrl: "https://ha.example.test",
                        entityId: "input_boolean.site_dark",
                        credentialKey: "ha-main",
                        refreshMinutes: 5,
                    },
                }),
                store,
                new AbortController().signal,
            ),
        ).rejects.toThrow("missing-token");
    });
});

describe("scheduled override controller", () => {
    it("applies an effective layer and restores the untouched base when no rule matches", async () => {
        const { store, repository } = setup();
        store.set("theme.mode", "light");
        repository.save({ version: 1, rules: [rule({ values: { "theme.mode": "dark" } })] });
        const controller = new ScheduledSettingsController(repository, store);
        await controller.refresh(new Date("2026-08-07T12:00:00Z"));
        expect(store.getString("theme.mode")).toBe("dark");
        expect(store.provenance("theme.mode")).toBe("scheduled-override");
        expect(store.snapshot()["theme.mode"]).toBe("light");
        await controller.refresh(new Date("2026-08-07T20:00:00Z"));
        expect(store.getString("theme.mode")).toBe("light");
    });

    it("ignores a superseded external generation", async () => {
        const { store, repository } = setup();
        repository.save({
            version: 1,
            rules: [
                rule({
                    values: {},
                    source: { kind: "api", url: "https://example.test/rule", refreshMinutes: 5 },
                }),
            ],
        });
        let resolveFirst: ((value: Response) => void) | undefined;
        const fetcher = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFirst = resolve;
                    }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ version: 1, values: { "theme.mode": "light" } }), {
                    status: 200,
                }),
            ) as typeof fetch;
        const controller = new ScheduledSettingsController(
            repository,
            store,
            new ExternalSettingsClient({ fetcher }),
        );
        const stale = controller.refresh(new Date("2026-08-07T12:00:00Z"));
        const current = controller.refresh(new Date("2026-08-07T12:06:00Z"));
        await current;
        resolveFirst?.(
            new Response(JSON.stringify({ version: 1, values: { "theme.mode": "dark" } }), {
                status: 200,
            }),
        );
        await stale;
        expect(store.getString("theme.mode")).toBe("light");
    });
});
