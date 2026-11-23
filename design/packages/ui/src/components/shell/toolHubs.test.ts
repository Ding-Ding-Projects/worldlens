import { describe, expect, it } from "vitest";
import type { TabStripState, TabWorkspaceState } from "../tabs/index.js";
import { JOB_DEFINITIONS } from "./jobRegistry.js";
import {
    HUB_MEMBER_IDS,
    HUB_SELECTION_KEY,
    TOOL_HUBS,
    foldMembersIntoHubs,
    hubForMember,
    readHubSelection,
    writeHubSelection,
} from "./toolHubs.js";

function strip(
    pageIds: string[],
    activeIndex = 0,
    extra: Partial<TabStripState> = {},
): TabStripState {
    const tabs = pageIds.map((pageId, index) => ({
        id: `t${index}`,
        pageId,
        label: pageId,
        icon: "",
    }));
    return {
        id: "strip-main",
        label: "Main",
        windowId: "w",
        windowLabel: "This window",
        placement: "top",
        tabs,
        groups: [],
        pinnedOrder: [],
        slots: tabs.map((tab) => ({ kind: "tab", tabId: tab.id })),
        activeTabId: tabs[activeIndex]?.id ?? null,
        ...extra,
    } as unknown as TabStripState;
}

function memoryStorage(): {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    data: Map<string, string>;
} {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
    };
}

describe("tool hubs", () => {
    it("names only real jobs, each in exactly one hub", () => {
        const known = new Set(JOB_DEFINITIONS.map((job) => job.id));
        const seen = new Set<string>();
        for (const hub of TOOL_HUBS) {
            for (const member of hub.members) {
                expect(known.has(member)).toBe(true);
                expect(seen.has(member)).toBe(false);
                seen.add(member);
            }
        }
        expect(seen.size).toBe(HUB_MEMBER_IDS.size);
    });

    it("keeps map work and the Servers job out of every hub", () => {
        for (const id of [
            "world",
            "renders",
            "servers",
            "mcservers",
            "pages",
            "coreprotect",
            "screenshots",
        ]) {
            expect(hubForMember(id)).toBeNull();
        }
        expect(hubForMember("base64")?.id).toBe("toolkit");
        expect(hubForMember("nbtEditor")?.id).toBe("otherTools");
    });

    it("turns the first member tab into its hub and closes the rest", () => {
        const before: TabWorkspaceState = {
            strips: [strip(["world", "base64", "renders", "locks", "nbtEditor"], 3)],
        };
        const result = foldMembersIntoHubs(before);
        expect(result.changed).toBe(true);
        const after = result.workspace.strips[0]!;
        expect(after.tabs.map((tab) => tab.pageId)).toEqual([
            "world",
            "toolkit",
            "renders",
            "otherTools",
        ]);
        // The hub took the base64 tab's place and the active locks tab's focus.
        expect(after.activeTabId).toBe("t1");
        expect(result.picked).toEqual({ toolkit: "locks", otherTools: "nbtEditor" });
    });

    it("leaves a workspace with no member tabs untouched", () => {
        const before: TabWorkspaceState = { strips: [strip(["world", "renders"])] };
        const result = foldMembersIntoHubs(before);
        expect(result.changed).toBe(false);
        expect(result.workspace).toBe(before);
    });

    it("merges a member tab into a hub tab that already exists", () => {
        const before: TabWorkspaceState = { strips: [strip(["toolkit", "docs"], 0)] };
        const after = foldMembersIntoHubs(before).workspace.strips[0]!;
        expect(after.tabs.map((tab) => tab.pageId)).toEqual(["toolkit"]);
    });

    it("persists the picked tool and ignores junk or stale values", () => {
        const storage = memoryStorage();
        writeHubSelection({ toolkit: "drawing" }, storage);
        expect(readHubSelection(storage)).toEqual({ toolkit: "drawing" });
        storage.data.set(HUB_SELECTION_KEY, JSON.stringify({ toolkit: "renders", otherTools: 4 }));
        expect(readHubSelection(storage)).toEqual({});
        storage.data.set(HUB_SELECTION_KEY, "{not json");
        expect(readHubSelection(storage)).toEqual({});
    });
});
