import { describe, expect, it } from "vitest";
import {
    adjacentStripId,
    mergeStripsIntoFirst,
    moveTabToStrip,
    nextWorkspaceTabId,
    pruneEmptyStrips,
    splitDirectionOf,
    splitTabToNewStrip,
    isLayoutCommand,
} from "./workLayout.js";
import { normalizeStrip, type TabRecord, type TabStripState, type TabWorkspaceState } from "./tabModel.js";

function tab(id: string, pageId = id): TabRecord {
    return { id, pageId, label: pageId, icon: null, dirty: false, appearance: null };
}

function strip(id: string, tabs: TabRecord[], extra: Partial<TabStripState> = {}): TabStripState {
    return normalizeStrip({
        id,
        label: id,
        windowId: "w",
        windowLabel: "W",
        placement: "top",
        tabs,
        groups: [],
        pinnedOrder: [],
        slots: tabs.map((t) => ({ kind: "tab" as const, tabId: t.id })),
        activeTabId: tabs[0]?.id ?? null,
        ...extra,
    });
}

const three: TabWorkspaceState = { strips: [strip("strip-main", [tab("tab-1", "map"), tab("tab-2", "world"), tab("tab-3", "servers")])] };

describe("splitTabToNewStrip", () => {
    it("moves one tab into a new strip and keeps the others where they were", () => {
        const result = splitTabToNewStrip(three, "strip-main", "tab-2", "Pane 2");
        expect(result).not.toBeNull();
        const strips = result?.workspace.strips ?? [];
        expect(strips).toHaveLength(2);
        expect(strips[0]?.tabs.map((t) => t.id)).toEqual(["tab-1", "tab-3"]);
        expect(strips[1]?.tabs.map((t) => t.pageId)).toEqual(["world"]);
        expect(strips[1]?.id).toBe(result?.stripId);
        expect(strips[1]?.placement).toBe("top");
    });

    it("refuses to split the only tab of a pane away from itself", () => {
        const lone: TabWorkspaceState = { strips: [strip("strip-main", [tab("tab-1")])] };
        expect(splitTabToNewStrip(lone, "strip-main", "tab-1", "Pane 2")).toBeNull();
    });

    it("can relocate a lone tab out of another pane, which removes the emptied pane", () => {
        const two: TabWorkspaceState = {
            strips: [strip("a", [tab("tab-1", "map"), tab("tab-2", "world")]), strip("b", [tab("tab-3", "servers")])],
        };
        const result = splitTabToNewStrip(two, "b", "tab-3", "Pane 3", true);
        expect(result?.workspace.strips.map((s) => s.id)).toEqual(["a", result?.stripId]);
    });

    it("gives the moved tab a fresh id when another pane already uses it", () => {
        const clash: TabWorkspaceState = {
            strips: [strip("a", [tab("tab-1", "map"), tab("tab-2", "world")]), strip("b", [tab("tab-2", "servers"), tab("tab-9", "x")])],
        };
        const result = splitTabToNewStrip(clash, "b", "tab-2", "Pane 3");
        const ids = result?.workspace.strips.flatMap((s) => s.tabs.map((t) => t.id)) ?? [];
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("moveTabToStrip", () => {
    it("moves a tab, makes it active there, and removes a pane it leaves empty", () => {
        const two: TabWorkspaceState = {
            strips: [strip("a", [tab("tab-1", "map")]), strip("b", [tab("tab-2", "world")])],
        };
        const moved = moveTabToStrip(two, "a", "tab-1", "b");
        expect(moved?.strips.map((s) => s.id)).toEqual(["b"]);
        expect(moved?.strips[0]?.tabs.map((t) => t.pageId)).toEqual(["world", "map"]);
        expect(moved?.strips[0]?.activeTabId).toBe("tab-1");
    });

    it("does nothing for the same pane or an unknown tab", () => {
        expect(moveTabToStrip(three, "strip-main", "tab-1", "strip-main")).toBeNull();
        expect(moveTabToStrip(three, "strip-main", "nope", "other")).toBeNull();
    });
});

describe("pinned tabs", () => {
    const pinnedWs: TabWorkspaceState = {
        strips: [
            strip("a", [tab("tab-1", "map"), tab("tab-2", "world"), tab("tab-3", "servers")], {
                pinnedOrder: ["tab-1"],
                slots: [
                    { kind: "tab", tabId: "tab-2" },
                    { kind: "tab", tabId: "tab-3" },
                ],
            }),
        ],
    };

    it("stays pinned when it is split into a new pane", () => {
        const result = splitTabToNewStrip(pinnedWs, "a", "tab-1", "Pane 2");
        const created = result?.workspace.strips[1];
        expect(created?.pinnedOrder).toEqual(["tab-1"]);
        expect(created?.slots).toEqual([]);
        expect(result?.workspace.strips[0]?.pinnedOrder).toEqual([]);
    });

    it("stays pinned when it is moved to another pane, and an unpinned tab stays unpinned", () => {
        const split = splitTabToNewStrip(pinnedWs, "a", "tab-3", "Pane 2");
        const two = split?.workspace as TabWorkspaceState;
        const moved = moveTabToStrip(two, "a", "tab-1", split?.stripId ?? "");
        const target = moved?.strips.find((s) => s.id === split?.stripId);
        expect(target?.pinnedOrder).toEqual(["tab-1"]);
        expect(target?.tabs.map((t) => t.id)).toContain("tab-3");
        expect(target?.pinnedOrder).not.toContain("tab-3");
    });

    it("merging panes keeps the pin too", () => {
        const split = splitTabToNewStrip(pinnedWs, "a", "tab-1", "Pane 2");
        const merged = mergeStripsIntoFirst(split?.workspace as TabWorkspaceState);
        expect(merged.strips[0]?.pinnedOrder).toHaveLength(1);
    });
});

describe("pruneEmptyStrips and adjacentStripId", () => {
    it("never removes the only strip, even when it is empty", () => {
        const empty: TabWorkspaceState = { strips: [strip("a", [])] };
        expect(pruneEmptyStrips(empty).strips).toHaveLength(1);
    });

    it("removes empty strips next to populated ones", () => {
        const mixed: TabWorkspaceState = { strips: [strip("a", [tab("t")]), strip("b", [])] };
        expect(pruneEmptyStrips(mixed).strips.map((s) => s.id)).toEqual(["a"]);
    });

    it("wraps around, and has no neighbour when there is one pane", () => {
        const two: TabWorkspaceState = { strips: [strip("a", [tab("t1")]), strip("b", [tab("t2")])] };
        expect(adjacentStripId(two, "a", 1)).toBe("b");
        expect(adjacentStripId(two, "a", -1)).toBe("b");
        expect(adjacentStripId(three, "strip-main", 1)).toBeNull();
    });
});

describe("mergeStripsIntoFirst", () => {
    it("keeps every tab, pin and group, renaming only colliding ids", () => {
        const a = strip("a", [tab("tab-1", "map"), tab("tab-2", "world")], {
            pinnedOrder: ["tab-1"],
        });
        const b = strip("b", [tab("tab-1", "servers"), tab("tab-5", "x")], {
            pinnedOrder: ["tab-1"],
            groups: [{ id: "group-1", name: "G", color: "primary", collapsed: true, tabIds: ["tab-5"], appearance: null }],
        });
        const merged = mergeStripsIntoFirst({ strips: [a, b] });
        expect(merged.strips).toHaveLength(1);
        const only = merged.strips[0];
        expect(only?.tabs.map((t) => t.pageId).sort()).toEqual(["map", "servers", "world", "x"]);
        expect(new Set(only?.tabs.map((t) => t.id)).size).toBe(4);
        expect(only?.pinnedOrder).toHaveLength(2);
        const group = only?.groups[0];
        expect(group?.name).toBe("G");
        expect(group?.collapsed).toBe(true);
        const member = only?.tabs.find((t) => t.id === group?.tabIds[0]);
        expect(member?.pageId).toBe("x");
    });

    it("leaves a single strip alone", () => {
        expect(mergeStripsIntoFirst(three)).toBe(three);
    });
});

describe("small helpers", () => {
    it("maps split commands to directions and recognises only real commands", () => {
        expect(splitDirectionOf("split-above")).toBe("above");
        expect(splitDirectionOf("float")).toBeNull();
        expect(isLayoutCommand("maximize")).toBe(true);
        expect(isLayoutCommand("explode")).toBe(false);
    });

    it("hands out tab ids unused anywhere in the workspace", () => {
        expect(nextWorkspaceTabId(three)).toBe("tab-4");
    });
});
