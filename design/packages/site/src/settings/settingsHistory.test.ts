// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import { I18n } from "../i18n/I18n.js";
import { memoryPreferenceStore, setSearchPreferenceStore } from "../search/preferences.js";
import { SettingsStore } from "./store.js";
import type { SettingDefinition } from "./types.js";
import {
    SettingsHistory,
    actionCounts,
    filterHistory,
    localDay,
    recordLabelValues,
} from "./settingsHistory.js";
import { createSettingsHistoryPanel } from "./settingsHistoryPanel.js";
import { installDestructiveGate } from "./confirm.js";

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

const DEFINITIONS: readonly SettingDefinition[] = [
    {
        kind: "toggle",
        id: "demo.compact",
        tab: "general",
        group: "layout",
        labelKey: "demo.compact",
        defaultValue: false,
    },
    {
        kind: "select",
        id: "demo.theme",
        tab: "general",
        group: "layout",
        labelKey: "demo.theme",
        defaultValue: "light",
        options: [
            { value: "light", labelKey: "demo.theme.light" },
            { value: "dark", labelKey: "demo.theme.dark" },
        ],
    },
    {
        kind: "number",
        id: "demo.columns",
        tab: "general",
        group: "layout",
        labelKey: "demo.columns",
        defaultValue: 2,
        min: 1,
        max: 6,
        step: 1,
    },
];

/** A settings store, a history watching it, and a clock the test moves by hand. */
function harness(
    storage: Storage = new MemoryStorage(),
    options: { retention?: number } = {},
): {
    prefs: Preferences;
    store: SettingsStore;
    history: SettingsHistory;
    at: (date: Date) => void;
    stop: () => void;
} {
    const prefs = new Preferences(storage);
    const store = new SettingsStore(prefs);
    store.register(DEFINITIONS);
    let now = new Date(2026, 2, 4, 10, 0, 0);
    const history = new SettingsHistory(prefs, {
        clock: () => now,
        ...(options.retention === undefined ? {} : { retention: options.retention }),
    });
    const stop = history.trackChanges(store);
    return {
        prefs,
        store,
        history,
        at: (date: Date): void => {
            now = date;
        },
        stop,
    };
}

beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    Element.prototype.scrollIntoView = vi.fn();
    setSearchPreferenceStore(memoryPreferenceStore());
});

describe("settings history model", () => {
    it("records what a change replaced, and reads back from a fresh model over the same storage", () => {
        const storage = new MemoryStorage();
        const first = harness(storage);
        first.store.set("demo.theme", "dark");
        first.store.set("demo.columns", 4);

        const recorded = first.history.records();
        expect(recorded).toHaveLength(2);
        expect(recorded[0]?.action).toBe("changed");
        expect(recorded[0]?.settingIds).toEqual(["demo.theme"]);
        expect(recorded[0]?.changes[0]).toMatchObject({ previous: "light", next: "dark" });
        expect(recorded[1]?.changes[0]).toMatchObject({ previous: 2, next: 4 });

        // A second model over the same Preferences is what a reload looks like.
        const reloaded = new SettingsHistory(new Preferences(storage));
        expect(reloaded.records().map((record) => record.id)).toEqual(
            recorded.map((record) => record.id),
        );
        expect(reloaded.records()[1]?.changes[0]?.previous).toBe(2);
    });

    it("classifies a reset, a reset-all and an import by what caused them", () => {
        const { store, history } = harness();
        store.set("demo.theme", "dark");
        history.withAction("reset", () => store.reset("demo.theme"));
        store.set("demo.compact", true);
        store.set("demo.columns", 5);
        history.withAction("reset-all", () => store.resetAll());
        history.withAction("imported", () => store.import({ values: { "demo.columns": 6 } }));

        expect(history.records().map((record) => record.action)).toEqual([
            "changed",
            "reset",
            "changed",
            "changed",
            "reset-all",
            "imported",
        ]);
        // resetAll emits every id at once, so the one record covers everything it moved.
        const resetAll = history.records()[4];
        expect([...(resetAll?.settingIds ?? [])].sort()).toEqual(["demo.columns", "demo.compact"]);
    });

    it("keeps a scheduled override apart from a change the visitor made", () => {
        const { store, history } = harness();
        history.withAction("scheduled-override", () =>
            store.replaceScheduledOverrides({ "demo.theme": "dark" }),
        );
        expect(history.records()[0]?.action).toBe("scheduled-override");
        expect(history.records()[0]?.labelKey).toBe("history.label.scheduled-override");
    });

    it("holds an asynchronous classification until the promise settles", async () => {
        const { store, history } = harness();
        await history.withAction("scheduled-override", async () => {
            await Promise.resolve();
            store.set("demo.theme", "dark");
        });
        store.set("demo.columns", 3);
        expect(history.records().map((record) => record.action)).toEqual([
            "scheduled-override",
            "changed",
        ]);
    });

    it("appends a restore rather than rewriting the record it restored from", () => {
        const { store, history } = harness();
        store.set("demo.theme", "dark");
        const original = history.records()[0];
        expect(original).toBeDefined();
        const originalSnapshot = JSON.stringify(original);

        const report = history.restore(original?.id ?? "", store);
        expect(report.restored).toEqual(["demo.theme"]);
        expect(store.get("demo.theme")).toBe("light");

        const after = history.records();
        expect(after).toHaveLength(2);
        // The record that was restored from is byte-for-byte what it was.
        expect(JSON.stringify(after[0])).toBe(originalSnapshot);
        expect(after[1]?.action).toBe("restored");
        expect(after[1]?.changes[0]).toMatchObject({ previous: "dark", next: "light" });

        // An undo must itself be undoable: restoring the restore returns the newer value.
        history.restore(after[1]?.id ?? "", store);
        expect(store.get("demo.theme")).toBe("dark");
        expect(history.records()).toHaveLength(3);
        expect(history.records()[2]?.action).toBe("restored");
    });

    it("reports what a restore could not do instead of pretending it did", () => {
        const { store, history } = harness();
        store.set("demo.theme", "dark");
        const record = history.records()[0];
        history.restore(record?.id ?? "", store);
        // Restoring the same record twice: the value already matches, so nothing moves.
        const second = history.restore(record?.id ?? "", store);
        expect(second.restored).toEqual([]);
        expect(second.skipped).toEqual([{ id: "demo.theme", reason: "unchanged" }]);
        expect(history.restore("no-such-record", store).skipped[0]?.reason).toBe("unknown-record");
    });

    it("counts every action, including the ones nothing has produced", () => {
        const { store, history } = harness();
        store.set("demo.theme", "dark");
        store.set("demo.columns", 3);
        history.withAction("reset", () => store.reset("demo.theme"));

        const counts = actionCounts(history.records());
        expect(counts.map((entry) => entry.action)).toEqual([
            "changed",
            "reset",
            "reset-all",
            "imported",
            "restored",
            "scheduled-override",
        ]);
        expect(counts.find((entry) => entry.action === "changed")?.count).toBe(2);
        expect(counts.find((entry) => entry.action === "reset")?.count).toBe(1);
        expect(counts.find((entry) => entry.action === "imported")?.count).toBe(0);
        expect(counts.find((entry) => entry.action === "restored")?.count).toBe(0);
    });

    it("includes both edges of a date range and excludes the days either side", () => {
        const { store, history, at } = harness();
        at(new Date(2026, 2, 2, 23, 30, 0));
        store.set("demo.theme", "dark");
        at(new Date(2026, 2, 3, 0, 1, 0));
        store.set("demo.columns", 3);
        at(new Date(2026, 2, 5, 23, 59, 0));
        store.set("demo.compact", true);
        at(new Date(2026, 2, 6, 0, 0, 0));
        store.set("demo.columns", 4);

        const records = history.records();
        expect(records.map((record) => localDay(record.at))).toEqual([
            "2026-03-02",
            "2026-03-03",
            "2026-03-05",
            "2026-03-06",
        ]);

        const inRange = filterHistory(
            records,
            { start: "2026-03-03", end: "2026-03-05" },
            (record) => record.settingIds.join(" "),
        );
        expect(inRange.map((record) => localDay(record.at))).toEqual(["2026-03-03", "2026-03-05"]);

        // An open end still bounds the other side.
        expect(
            filterHistory(records, { start: "2026-03-05" }, () => "").map((record) =>
                localDay(record.at),
            ),
        ).toEqual(["2026-03-05", "2026-03-06"]);
        expect(
            filterHistory(records, { end: "2026-03-02" }, () => "").map((record) =>
                localDay(record.at),
            ),
        ).toEqual(["2026-03-02"]);
    });

    it("narrows by action, date and text together rather than letting one win", () => {
        const { store, history, at } = harness();
        at(new Date(2026, 2, 3, 9, 0, 0));
        store.set("demo.theme", "dark");
        at(new Date(2026, 2, 3, 10, 0, 0));
        store.set("demo.columns", 3);
        at(new Date(2026, 2, 8, 9, 0, 0));
        history.withAction("reset", () => store.reset("demo.theme"));

        const text = (record: { settingIds: readonly string[] }): string =>
            record.settingIds.join(" ");
        const records = history.records();

        expect(filterHistory(records, { actions: ["changed"] }, text)).toHaveLength(2);
        expect(filterHistory(records, { start: "2026-03-03", end: "2026-03-03" }, text)).toHaveLength(2);
        expect(
            filterHistory(records, { matches: (value) => value.includes("demo.theme") }, text),
        ).toHaveLength(2);

        // All three at once keeps only the record that satisfies all three.
        expect(
            filterHistory(
                records,
                {
                    actions: ["changed"],
                    start: "2026-03-03",
                    end: "2026-03-03",
                    matches: (value) => value.includes("demo.theme"),
                },
                text,
            ).map((record) => record.settingIds),
        ).toEqual([["demo.theme"]]);

        // A date range that excludes everything is not overridden by a matching action.
        expect(
            filterHistory(
                records,
                { actions: ["changed"], start: "2026-04-01", end: "2026-04-30" },
                text,
            ),
        ).toHaveLength(0);
    });

    it("falls back rather than throwing when the persisted blob has been hand-edited", () => {
        const storage = new MemoryStorage();
        const prefs = new Preferences(storage);

        prefs.write("settings.history", "{ this is not json");
        expect(new SettingsHistory(prefs).records()).toEqual([]);

        prefs.write("settings.history", JSON.stringify({ version: 99, records: [] }));
        expect(new SettingsHistory(prefs).records()).toEqual([]);

        // A document of the right version keeps its readable records and drops the rest,
        // so one mangled line does not cost the visitor everything else they had.
        prefs.write(
            "settings.history",
            JSON.stringify({
                version: 1,
                records: [
                    {
                        id: "good",
                        at: "2026-03-04T10:00:00.000Z",
                        action: "changed",
                        settingIds: ["demo.theme"],
                        changes: [{ id: "demo.theme", previous: "light", next: "dark" }],
                        labelKey: "history.label.changed",
                    },
                    { id: "bad", action: "exploded", changes: "nope" },
                    {
                        id: "also-bad",
                        at: "2026-03-04T11:00:00.000Z",
                        action: "changed",
                        changes: [{ id: "demo.theme", previous: { nested: true }, next: "dark" }],
                        labelKey: "history.label.changed",
                    },
                ],
            }),
        );
        const survived = new SettingsHistory(prefs).records();
        expect(survived.map((record) => record.id)).toEqual(["good"]);
        expect(recordLabelValues(survived[0] as never)).toEqual({
            ids: "demo.theme",
            count: 1,
        });
    });

    it("never trims silently, and reports exactly what pruning removed", () => {
        const { store, history } = harness(new MemoryStorage(), { retention: 3 });
        for (const value of [1, 2, 3, 4, 5]) store.set("demo.columns", value);

        // Five records for five changes: appending past the bound keeps everything.
        expect(history.records()).toHaveLength(5);
        expect(history.overflow()).toBe(2);

        const report = history.prune();
        expect(report).toEqual({ removed: 2, remaining: 3 });
        expect(history.records().map((record) => record.changes[0]?.next)).toEqual([3, 4, 5]);
        expect(history.prune()).toEqual({ removed: 0, remaining: 3 });
    });

    it("keeps a settings change working when the history cannot be written", () => {
        const { store, history, prefs } = harness();
        const failing = vi.spyOn(prefs, "writeJson").mockImplementation(() => {
            throw new Error("storage refused");
        });

        expect(() => store.set("demo.theme", "dark")).not.toThrow();
        expect(store.get("demo.theme")).toBe("dark");
        failing.mockRestore();

        // The recorder is still live once storage recovers.
        store.set("demo.columns", 3);
        expect(history.records().at(-1)?.changes[0]?.next).toBe(3);
    });
});

describe("settings history panel", () => {
    function mount(options: { retention?: number } = {}): {
        store: SettingsStore;
        history: SettingsHistory;
        at: (date: Date) => void;
        view: ReturnType<typeof createSettingsHistoryPanel>;
    } {
        const built = harness(new MemoryStorage(), options);
        const view = createSettingsHistoryPanel({
            history: built.history,
            store: built.store,
            i18n: new I18n(built.prefs),
        });
        document.body.append(view.element);
        return { store: built.store, history: built.history, at: built.at, view };
    }

    function actionCheckbox(root: HTMLElement, action: string): HTMLInputElement {
        const input = root.querySelector<HTMLInputElement>(`input[type='checkbox'][value='${action}']`);
        if (input === null) throw new Error(`No checkbox for ${action}`);
        return input;
    }

    function rows(root: HTMLElement): HTMLElement[] {
        return [...root.querySelectorAll<HTMLElement>("[data-history-record]")];
    }

    it("shows a count beside every action, including a zero for one nothing produced", () => {
        const { store, view } = mount();
        store.set("demo.theme", "dark");
        store.set("demo.columns", 3);

        expect(
            view.element.querySelector("[data-history-count='changed']")?.textContent,
        ).toContain("2");
        expect(
            view.element.querySelector("[data-history-count='imported']")?.textContent,
        ).toContain("0");
        expect(actionCheckbox(view.element, "imported").getAttribute("aria-label")).toContain("0");
        view.destroy();
    });

    it("reports the result count in a live region and narrows on every filter at once", () => {
        const { store, history, at, view } = mount();
        at(new Date(2026, 2, 3, 9, 0, 0));
        store.set("demo.theme", "dark");
        at(new Date(2026, 2, 3, 9, 30, 0));
        store.set("demo.columns", 3);
        at(new Date(2026, 2, 9, 9, 0, 0));
        history.withAction("reset", () => store.reset("demo.theme"));

        const summary = view.element.querySelector("[role='status']");
        expect(summary?.getAttribute("aria-live")).toBe("polite");
        expect(rows(view.element)).toHaveLength(3);
        expect(summary?.textContent).toContain("3");

        actionCheckbox(view.element, "changed").click();
        expect(rows(view.element)).toHaveLength(2);

        const search = view.element.querySelector<HTMLInputElement>("input[type='search']");
        if (search === null) throw new Error("No search field");
        search.value = "demo.theme";
        search.dispatchEvent(new Event("input"));
        expect(rows(view.element)).toHaveLength(1);
        expect(summary?.textContent).toContain("1");

        // Clearing the text widens again without disturbing the action filter.
        search.value = "";
        search.dispatchEvent(new Event("input"));
        expect(rows(view.element)).toHaveLength(2);
        view.destroy();
    });

    it("carries its own anchored regex builder rather than borrowing another field's", () => {
        const { view } = mount();
        const builder = view.element.querySelector<HTMLButtonElement>(".mbm-search__builder");
        expect(builder).not.toBeNull();
        expect(view.element.querySelector(".mb-search-field")?.contains(builder)).toBe(true);
        expect(builder?.getAttribute("aria-label") ?? "").not.toBe("");
        view.destroy();
    });

    it("says what filtered the list empty instead of showing a blank panel", () => {
        const { store, view } = mount();
        store.set("demo.theme", "dark");

        const search = view.element.querySelector<HTMLInputElement>("input[type='search']");
        if (search === null) throw new Error("No search field");
        search.value = "nothing-matches-this";
        search.dispatchEvent(new Event("input"));

        const empty = view.element.querySelector(".mb-empty");
        expect(rows(view.element)).toHaveLength(0);
        expect(empty?.textContent).toContain("nothing-matches-this");
        expect(empty?.textContent).toMatch(/No record matches/);
        view.destroy();
    });

    it("distinguishes an empty history from a filtered-empty one", () => {
        const { view } = mount();
        expect(view.element.querySelector(".mb-empty")?.textContent ?? "").toMatch(
            /Nothing has been changed yet/,
        );
        view.destroy();
    });

    it("restores from a row and records the restore as a new row", () => {
        const { store, view } = mount();
        store.set("demo.theme", "dark");

        const restore = rows(view.element)[0]?.querySelector<HTMLButtonElement>("button");
        expect(restore?.disabled).toBe(false);
        expect(restore?.getAttribute("aria-label") ?? "").toContain("demo.theme");
        restore?.click();

        expect(store.get("demo.theme")).toBe("light");
        expect(rows(view.element)).toHaveLength(2);
        view.destroy();
    });

    /*
     * Pruning now stands behind the destructive gate, because a pruned record is the one thing
     * on this panel a visitor cannot get back through the panel. That makes the click
     * asynchronous, so the assertion has to wait for the gate's promise rather than reading the
     * DOM on the next line — and the gate is stubbed here rather than driven, because what this
     * test is about is the button's enabled state and the pruning arithmetic, not the two-key
     * slider, which `confirm.test.ts` exercises in full.
     */
    it("only offers pruning when there is something to prune, and says why when there is not", async () => {
        installDestructiveGate(() => Promise.resolve(true));
        try {
            const { store, view } = mount({ retention: 2 });
            const prune = view.element.querySelector<HTMLButtonElement>(
                "button[data-i18n-key='history.prune']",
            );
            expect(prune?.disabled).toBe(true);
            expect(prune?.title ?? "").toMatch(/Nothing to prune/);

            for (const value of [1, 2, 3, 4]) store.set("demo.columns", value);
            expect(prune?.disabled).toBe(false);
            prune?.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(rows(view.element)).toHaveLength(2);
            expect(prune?.disabled).toBe(true);
            view.destroy();
        } finally {
            installDestructiveGate(null);
        }
    });

    it("prunes nothing when the destructive gate is declined", async () => {
        installDestructiveGate(() => Promise.resolve(false));
        try {
            const { store, view } = mount({ retention: 2 });
            for (const value of [1, 2, 3, 4]) store.set("demo.columns", value);
            const prune = view.element.querySelector<HTMLButtonElement>(
                "button[data-i18n-key='history.prune']",
            );
            prune?.click();
            await Promise.resolve();
            await Promise.resolve();
            expect(rows(view.element)).toHaveLength(4);
            view.destroy();
        } finally {
            installDestructiveGate(null);
        }
    });
});
