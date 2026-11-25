import { describe, expect, it } from "vitest";
import {
    MAX_NAMED_LAYOUTS,
    applyNamedLayout,
    cleanLayoutName,
    deleteNamedLayout,
    layoutMatchesStrips,
    readDockLayout,
    readNamedLayouts,
    renameNamedLayout,
    saveNamedLayout,
    writeDockLayout,
    writeNamedLayouts,
    type NamedLayout,
} from "./dockLayoutStorage.js";
import { normalizeStrip, type TabRecord, type TabStripState, type TabWorkspaceState } from "./tabModel.js";
import type { TabStorage } from "./tabStorage.js";

function memory(): TabStorage & { cells: Map<string, string> } {
    const cells = new Map<string, string>();
    return {
        cells,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => {
            cells.set(key, value);
        },
    };
}

function tab(id: string, pageId: string, dirty = false): TabRecord {
    return { id, pageId, label: pageId, icon: null, dirty, appearance: null };
}

function strip(id: string, tabs: TabRecord[]): TabStripState {
    return normalizeStrip({
        id,
        label: id,
        windowId: "w",
        windowLabel: "W",
        placement: "left",
        tabs,
        groups: [],
        pinnedOrder: [],
        slots: tabs.map((t) => ({ kind: "tab" as const, tabId: t.id })),
        activeTabId: tabs[0]?.id ?? null,
    });
}

const layoutFor = (ids: string[]) => ({
    grid: { root: { type: "branch", data: [] }, width: 10, height: 10, orientation: "HORIZONTAL" },
    panels: Object.fromEntries(ids.map((id) => [id, { id }])),
});

describe("layoutMatchesStrips", () => {
    it("accepts exactly one panel per strip", () => {
        expect(layoutMatchesStrips(layoutFor(["a", "b"]), ["a", "b"])).toBe(true);
    });

    it("refuses a layout that hides a strip, invents one, or is not an object", () => {
        expect(layoutMatchesStrips(layoutFor(["a"]), ["a", "b"])).toBe(false);
        expect(layoutMatchesStrips(layoutFor(["a", "ghost"]), ["a"])).toBe(false);
        expect(layoutMatchesStrips(layoutFor(["a"]), ["a", "a"])).toBe(false);
        expect(layoutMatchesStrips("text", ["a"])).toBe(false);
        expect(layoutMatchesStrips({ panels: {} }, [])).toBe(false);
    });

    it("refuses a layout that carries a popout window, which is not offered", () => {
        expect(layoutMatchesStrips({ ...layoutFor(["a"]), popoutGroups: [{}] }, ["a"])).toBe(false);
    });
});

describe("the stored arrangement", () => {
    it("round trips under its own key and never touches the workspace key", () => {
        const storage = memory();
        writeDockLayout(layoutFor(["a", "b"]), "b", storage, "k");
        expect([...storage.cells.keys()]).toEqual(["k-dock"]);
        const read = readDockLayout(["a", "b"], storage, "k");
        expect(read?.activeStripId).toBe("b");
    });

    it("reads as nothing when it is damaged, stale or from another version", () => {
        const storage = memory();
        storage.cells.set("k-dock", "{not json");
        expect(readDockLayout(["a"], storage, "k")).toBeNull();
        writeDockLayout(layoutFor(["a", "b"]), null, storage, "k");
        expect(readDockLayout(["a"], storage, "k")).toBeNull();
        storage.cells.set("k-dock", JSON.stringify({ version: 99, layout: layoutFor(["a"]) }));
        expect(readDockLayout(["a"], storage, "k")).toBeNull();
    });

    it("ignores a remembered active strip that no longer exists", () => {
        const storage = memory();
        writeDockLayout(layoutFor(["a"]), "gone", storage, "k");
        expect(readDockLayout(["a"], storage, "k")?.activeStripId).toBeNull();
    });
});

describe("named layouts", () => {
    const workspace: TabWorkspaceState = { strips: [strip("a", [tab("t1", "map"), tab("t2", "world")])] };

    it("saves, replaces by name regardless of case, renames and deletes", () => {
        const first = saveNamedLayout([], "  Review   desk ", workspace, null);
        expect(first.ok && first.layouts[0]?.name).toBe("Review desk");
        if (!first.ok) throw new Error("save failed");
        const again = saveNamedLayout(first.layouts, "review DESK", workspace, layoutFor(["a"]));
        expect(again.ok && again.replaced).toBe(true);
        if (!again.ok) throw new Error("save failed");
        expect(again.layouts).toHaveLength(1);
        const id = again.layouts[0]?.id ?? "";
        expect(renameNamedLayout(again.layouts, id, "Other")?.[0]?.name).toBe("Other");
        expect(renameNamedLayout(again.layouts, id, "   ")).toBeNull();
        expect(deleteNamedLayout(again.layouts, id)).toHaveLength(0);
    });

    it("refuses an empty name and a full list", () => {
        expect(saveNamedLayout([], "   ", workspace, null)).toEqual({ ok: false, reason: "empty-name" });
        let layouts: readonly NamedLayout[] = [];
        for (let n = 0; n < MAX_NAMED_LAYOUTS; n++) {
            const result = saveNamedLayout(layouts, `L${n}`, workspace, null);
            if (!result.ok) throw new Error("unexpected");
            layouts = result.layouts;
        }
        expect(saveNamedLayout(layouts, "one too many", workspace, null)).toEqual({ ok: false, reason: "full" });
    });

    it("persists, and drops stored entries that are not usable", () => {
        const storage = memory();
        const saved = saveNamedLayout([], "Keep", workspace, null);
        if (!saved.ok) throw new Error("save failed");
        writeNamedLayouts(saved.layouts, storage, "k");
        expect(readNamedLayouts(storage, "k").map((l) => l.name)).toEqual(["Keep"]);
        storage.cells.set("k-layouts", JSON.stringify({ version: 1, layouts: [{ id: "x", name: "No strips", strips: [] }, 4, null] }));
        expect(readNamedLayouts(storage, "k")).toEqual([]);
        storage.cells.set("k-layouts", "garbage");
        expect(readNamedLayouts(storage, "k")).toEqual([]);
    });

    it("cleans names", () => {
        expect(cleanLayoutName("a\n\t b")).toBe("a b");
        expect(cleanLayoutName("x".repeat(200))).toHaveLength(60);
    });

    it("applies a layout without closing open tabs or losing unsaved marks", () => {
        const saved = saveNamedLayout([], "Two", { strips: [strip("a", [tab("t1", "map")]), strip("b", [tab("t2", "world"), tab("t3", "gone-page")])] }, layoutFor(["a", "b"]));
        if (!saved.ok) throw new Error("save failed");
        const current: TabWorkspaceState = { strips: [strip("only", [tab("c1", "map", true), tab("c2", "servers")])] };
        const applied = applyNamedLayout(saved.layouts[0] as NamedLayout, current, new Set(["map", "world", "servers"]));
        expect(applied).not.toBeNull();
        expect(applied?.droppedPageIds).toEqual(["gone-page"]);
        expect(applied?.keptPageIds).toEqual(["servers"]);
        const tabs = applied?.workspace.strips.flatMap((s) => s.tabs) ?? [];
        expect(tabs.map((t) => t.pageId).sort()).toEqual(["map", "servers", "world"]);
        expect(tabs.find((t) => t.pageId === "map")?.dirty).toBe(true);
        expect(applied?.dock).not.toBeNull();
    });

    it("applies nothing when no saved tab survives", () => {
        const saved = saveNamedLayout([], "Gone", { strips: [strip("a", [tab("t1", "old-page")])] }, null);
        if (!saved.ok) throw new Error("save failed");
        const current: TabWorkspaceState = { strips: [strip("only", [tab("c1", "map")])] };
        expect(applyNamedLayout(saved.layouts[0] as NamedLayout, current, new Set(["map"]))).toBeNull();
    });
});
