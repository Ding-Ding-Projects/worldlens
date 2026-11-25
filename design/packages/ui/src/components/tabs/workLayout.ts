/**
 * Pure operations that arrange tabs across several strips.
 *
 * The Work workspace has always been a list of strips in the persisted model, but
 * only the first one was ever drawn. The docking layer in `DockSurface.vue` now
 * draws every strip as its own pane, and the functions here are the whole of what
 * changes in the tab model when a person splits a tab out, moves it to a
 * neighbouring pane, or closes the last tab of a pane.
 *
 * Nothing here knows about dockview. A strip is the unit of arrangement: the
 * docking layer decides where a pane sits, and this module decides which tabs a
 * pane holds. Keeping the two apart is what lets a damaged saved layout be thrown
 * away without touching a single tab.
 */

import {
    closeTabs,
    nextId,
    normalizeStrip,
    setActiveTab,
    type TabRecord,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";

/** The four sides a pane can be split towards. */
export const SPLIT_DIRECTIONS = ["left", "right", "above", "below"] as const;
export type SplitDirection = (typeof SPLIT_DIRECTIONS)[number];

/**
 * Every keyboard-reachable layout command for the pane that holds the chosen tab.
 *
 * These are the keyboard and menu equivalents of the drags: a drag is never the
 * only way to do something.
 */
export const LAYOUT_COMMANDS = [
    "split-left",
    "split-right",
    "split-above",
    "split-below",
    "next-pane",
    "previous-pane",
    "float",
    "dock",
    "maximize",
] as const;
export type LayoutCommand = (typeof LAYOUT_COMMANDS)[number];

export function isLayoutCommand(value: string): value is LayoutCommand {
    return (LAYOUT_COMMANDS as readonly string[]).includes(value);
}

/** The direction a split command points, or null for any other command. */
export function splitDirectionOf(command: LayoutCommand): SplitDirection | null {
    switch (command) {
        case "split-left":
            return "left";
        case "split-right":
            return "right";
        case "split-above":
            return "above";
        case "split-below":
            return "below";
        default:
            return null;
    }
}

function allTabIds(workspace: TabWorkspaceState): string[] {
    return workspace.strips.flatMap((strip) => strip.tabs.map((tab) => tab.id));
}

/** A strip id no strip in the workspace uses. */
export function nextStripId(workspace: TabWorkspaceState): string {
    return nextId(
        workspace.strips.map((strip) => strip.id),
        "strip",
    );
}

/** A tab id that no strip in the workspace uses, so DOM ids and search results never collide. */
export function nextWorkspaceTabId(workspace: TabWorkspaceState): string {
    return nextId(allTabIds(workspace), "tab");
}

/** A group id that no strip in the workspace uses. */
export function nextWorkspaceGroupId(workspace: TabWorkspaceState): string {
    return nextId(
        workspace.strips.flatMap((strip) => strip.groups.map((group) => group.id)),
        "group",
    );
}

function replaceStrip(
    workspace: TabWorkspaceState,
    next: TabStripState,
): TabWorkspaceState {
    return {
        strips: workspace.strips.map((strip) => (strip.id === next.id ? next : strip)),
    };
}

/**
 * Takes a tab out of a strip and returns the record that travels.
 *
 * Returns null when the move would leave the source strip with no tabs and
 * the caller has not asked for that, which is how a pane is never emptied by a
 * move that was meant to rearrange two panes.
 */
function detach(
    strip: TabStripState,
    tabId: string,
): { readonly source: TabStripState; readonly tab: TabRecord } | null {
    const tab = strip.tabs.find((candidate) => candidate.id === tabId);
    if (tab === undefined) return null;
    return { source: closeTabs(strip, [tabId]), tab };
}

/**
 * Moves a tab into a brand-new strip and returns both.
 *
 * Refused (null) when the tab is the only one in its strip: splitting the only
 * tab away would leave an empty pane next to a pane holding the same single
 * tab, which is a rearrangement of nothing.
 */
export function splitTabToNewStrip(
    workspace: TabWorkspaceState,
    stripId: string,
    tabId: string,
    label: string,
): { readonly workspace: TabWorkspaceState; readonly stripId: string } | null {
    const origin = workspace.strips.find((strip) => strip.id === stripId);
    if (origin === undefined || origin.tabs.length < 2) return null;
    const detached = detach(origin, tabId);
    if (detached === null) return null;

    const id = nextStripId(workspace);
    const moved = adoptTab(workspace, detached.tab, origin.id);
    const created: TabStripState = normalizeStrip({
        id,
        label,
        windowId: origin.windowId,
        windowLabel: origin.windowLabel,
        placement: origin.placement,
        tabs: [moved],
        groups: [],
        pinnedOrder: [],
        slots: [{ kind: "tab", tabId: moved.id }],
        activeTabId: moved.id,
    });
    return {
        workspace: { strips: [...replaceStrip(workspace, detached.source).strips, created] },
        stripId: id,
    };
}

/**
 * The tab, given a fresh id only when another strip already uses its id.
 *
 * Ids are only required to be unique inside one strip in the saved model, but the
 * master search, the palette and the DOM all see every strip at once, so a moved
 * tab never keeps an id that would make two rows look like the same tab.
 */
function adoptTab(workspace: TabWorkspaceState, tab: TabRecord, leaving: string): TabRecord {
    const taken = workspace.strips
        .filter((strip) => strip.id !== leaving)
        .some((strip) => strip.tabs.some((candidate) => candidate.id === tab.id));
    return taken ? { ...tab, id: nextWorkspaceTabId(workspace) } : tab;
}

/**
 * Moves a tab from one strip to the end of another strip's ordinary region.
 *
 * The moved tab keeps its label, icon and appearance. When it leaves its source
 * strip empty, that strip is removed (see {@link pruneEmptyStrips}) rather than
 * left as a pane with nothing in it.
 */
export function moveTabToStrip(
    workspace: TabWorkspaceState,
    fromStripId: string,
    tabId: string,
    toStripId: string,
): TabWorkspaceState | null {
    if (fromStripId === toStripId) return null;
    const origin = workspace.strips.find((strip) => strip.id === fromStripId);
    const target = workspace.strips.find((strip) => strip.id === toStripId);
    if (origin === undefined || target === undefined) return null;
    const detached = detach(origin, tabId);
    if (detached === null) return null;

    const tab = adoptTab(workspace, detached.tab, origin.id);
    const received: TabStripState = normalizeStrip({
        ...target,
        tabs: [...target.tabs, tab],
        slots: [...target.slots, { kind: "tab", tabId: tab.id }],
        activeTabId: tab.id,
    });
    return pruneEmptyStrips({
        strips: workspace.strips.map((strip) => {
            if (strip.id === origin.id) return detached.source;
            if (strip.id === target.id) return received;
            return strip;
        }),
    });
}

/**
 * Removes strips that hold no tabs, unless that would remove every strip.
 *
 * The one strip that is left when everything is closed stays, because the host
 * draws its "every tab is closed" state inside it. An emptied pane in a split
 * layout has nothing to say, so it goes.
 */
export function pruneEmptyStrips(workspace: TabWorkspaceState): TabWorkspaceState {
    if (workspace.strips.length < 2) return workspace;
    const kept = workspace.strips.filter((strip) => strip.tabs.length > 0);
    if (kept.length === workspace.strips.length) return workspace;
    if (kept.length === 0) {
        const first = workspace.strips[0];
        return first === undefined ? workspace : { strips: [first] };
    }
    return { strips: kept };
}

/** The strip after (delta 1) or before (delta -1) this one, wrapping, or null when there is one strip. */
export function adjacentStripId(
    workspace: TabWorkspaceState,
    stripId: string,
    delta: 1 | -1,
): string | null {
    const count = workspace.strips.length;
    if (count < 2) return null;
    const index = workspace.strips.findIndex((strip) => strip.id === stripId);
    if (index < 0) return null;
    return workspace.strips[(index + delta + count) % count]?.id ?? null;
}

/** Makes the tab the active one of its strip, leaving every other strip alone. */
export function activateIn(
    workspace: TabWorkspaceState,
    stripId: string,
    tabId: string,
): TabWorkspaceState {
    const strip = workspace.strips.find((candidate) => candidate.id === stripId);
    if (strip === undefined) return workspace;
    return replaceStrip(workspace, setActiveTab(strip, tabId));
}

/** The ids of every strip, which is what a saved layout has to account for exactly. */
export function stripIds(workspace: TabWorkspaceState): string[] {
    return workspace.strips.map((strip) => strip.id);
}
