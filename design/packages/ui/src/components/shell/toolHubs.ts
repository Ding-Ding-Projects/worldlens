/**
 * Two Work tabs that each hold several tools, so the strip stays about maps.
 *
 * The strip had grown to 29 jobs, and a dozen of them have nothing to do with making, viewing
 * or hosting a map: a Base64 encoder, an authenticator, a virtual disk manager. Every one of
 * them is somebody's reason to open the application, so none is deleted. They are gathered
 * instead:
 *
 *  - **Built-in tools** holds the general tools every application in this family carries.
 *  - **Other tools** holds the Minecraft tools that are not about a map (the NBT editor and
 *    the edition converter).
 *
 * A member keeps its job id, its slot in `App.vue`, its command palette row and its label.
 * What changes is where it is drawn: `WorkPane` hands `TabbedNavigation` the hub instead of
 * the member, and renders the member's own slot inside the hub. Asking for a member by id
 * (`revealPage("base64")`) opens the hub with that member picked, so every existing caller
 * keeps working without knowing hubs exist.
 *
 * Minecraft servers stays out on purpose: it is where a map's server lives and the Servers
 * rail destination opens it directly.
 *
 * Design source: `design/design-sources/work-strip-declutter/`.
 */
import { mdiPuzzleOutline, mdiToolboxOutline } from "@mdi/js";
import {
    closeTabs,
    setActiveTab,
    type TabStripState,
    type TabWorkspaceState,
} from "../tabs/index.js";
import { findJob, type JobId } from "./jobRegistry.js";

export type HubId = "toolkit" | "otherTools";

export interface ToolHubDefinition {
    readonly id: HubId;
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly ledeKey: string;
    readonly ledeFallback: string;
    readonly icon: string;
    /** Members in the order the hub lists them. */
    readonly members: readonly JobId[];
}

export const TOOL_HUBS: readonly ToolHubDefinition[] = [
    {
        id: "toolkit",
        labelKey: "tabs.page.toolkit",
        labelFallback: "Built-in tools",
        ledeKey: "toolHub.toolkit.lede",
        ledeFallback:
            "General tools kept together in one tab, so the strip stays about maps. Pick one from the list; it opens beside it.",
        icon: mdiToolboxOutline,
        members: [
            "docs",
            "converter",
            "base64",
            "drawing",
            "authenticator",
            "locks",
            "support",
            "browserExtension",
            "ollama",
            "virtualDisks",
            "memory",
        ],
    },
    {
        id: "otherTools",
        labelKey: "tabs.page.otherTools",
        labelFallback: "Other tools",
        ledeKey: "toolHub.otherTools.lede",
        ledeFallback:
            "Minecraft tools that are not about making, viewing or hosting a map. Pick one from the list; it opens beside it.",
        icon: mdiPuzzleOutline,
        members: ["nbtEditor", "chunker"],
    },
];

export const TOOL_HUB_IDS: readonly HubId[] = TOOL_HUBS.map((hub) => hub.id);

/** The hub that holds this job, or null for a job that stays in the strip. */
export function hubForMember(pageId: string): ToolHubDefinition | null {
    return TOOL_HUBS.find((hub) => (hub.members as readonly string[]).includes(pageId)) ?? null;
}

/** True for a hub's own page id. */
export function isHubId(pageId: string): pageId is HubId {
    return (TOOL_HUB_IDS as readonly string[]).includes(pageId);
}

/** Every job id that lives inside a hub rather than in the strip. */
export const HUB_MEMBER_IDS: ReadonlySet<string> = new Set(
    TOOL_HUBS.flatMap((hub) => hub.members as readonly string[]),
);

/* -------------------------------------------------------------------------- */
/* Which member a hub shows                                                   */
/* -------------------------------------------------------------------------- */

export const HUB_SELECTION_KEY = "worldlens-tool-hubs";

export interface HubSelectionStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStorage(): HubSelectionStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

/** Picked member per hub. A missing, junk or stale value falls back to the hub's first member. */
export function readHubSelection(
    storage: HubSelectionStorage | null = defaultStorage(),
): Partial<Record<HubId, string>> {
    if (storage === null) return {};
    try {
        const raw = storage.getItem(HUB_SELECTION_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return {};
        const out: Partial<Record<HubId, string>> = {};
        for (const hub of TOOL_HUBS) {
            const value = (parsed as Record<string, unknown>)[hub.id];
            if (typeof value === "string" && (hub.members as readonly string[]).includes(value)) {
                out[hub.id] = value;
            }
        }
        return out;
    } catch {
        return {};
    }
}

export function writeHubSelection(
    selection: Partial<Record<HubId, string>>,
    storage: HubSelectionStorage | null = defaultStorage(),
): void {
    if (storage === null) return;
    try {
        storage.setItem(HUB_SELECTION_KEY, JSON.stringify(selection));
    } catch {
        // Storage refused (private window, quota). The hub still works for this session.
    }
}

/* -------------------------------------------------------------------------- */
/* Moving a saved workspace onto the hubs                                     */
/* -------------------------------------------------------------------------- */

export interface HubFoldResult {
    readonly workspace: TabWorkspaceState;
    /** For each hub that received a former member tab, the member that should be picked. */
    readonly picked: Partial<Record<HubId, string>>;
    readonly changed: boolean;
}

function foldStrip(
    strip: TabStripState,
    picked: Partial<Record<HubId, string>>,
): { strip: TabStripState; changed: boolean } {
    const memberTabs = strip.tabs.filter((tab) => HUB_MEMBER_IDS.has(tab.pageId));
    if (memberTabs.length === 0) return { strip, changed: false };

    const activeTab = strip.tabs.find((tab) => tab.id === strip.activeTabId) ?? null;
    const activeMember =
        activeTab !== null && HUB_MEMBER_IDS.has(activeTab.pageId) ? activeTab : null;

    let next = strip;
    const closing: string[] = [];
    const hubTabIds = new Map<HubId, string>();
    for (const tab of next.tabs) {
        if (isHubId(tab.pageId)) hubTabIds.set(tab.pageId, tab.id);
    }

    for (const tab of memberTabs) {
        const hub = hubForMember(tab.pageId);
        if (hub === null) continue;
        if (picked[hub.id] === undefined || tab === activeMember) picked[hub.id] = tab.pageId;
        const existing = hubTabIds.get(hub.id);
        if (existing === undefined) {
            // The first former member of this hub becomes the hub, in its place, keeping its
            // group, pin and appearance: the user's arrangement survives the move.
            hubTabIds.set(hub.id, tab.id);
            next = {
                ...next,
                tabs: next.tabs.map((candidate) =>
                    candidate.id === tab.id
                        ? {
                              ...candidate,
                              pageId: hub.id,
                              label: hub.labelFallback,
                              icon: hub.icon,
                          }
                        : candidate,
                ),
            };
        } else {
            closing.push(tab.id);
        }
    }

    const activeHubTab =
        activeMember === null
            ? null
            : (hubTabIds.get(hubForMember(activeMember.pageId)?.id ?? "toolkit") ?? null);
    next = closeTabs(next, closing);
    if (activeHubTab !== null) next = setActiveTab(next, activeHubTab);
    return { strip: next, changed: true };
}

/**
 * Rewrites a workspace saved before the hubs existed.
 *
 * Each hub takes the place of the first tab that showed one of its members; the other member
 * tabs close, and the hub opens on whichever member was in front. Pure, so it is tested
 * without a DOM.
 */
export function foldMembersIntoHubs(workspace: TabWorkspaceState): HubFoldResult {
    const picked: Partial<Record<HubId, string>> = {};
    let changed = false;
    const strips = workspace.strips.map((strip) => {
        const result = foldStrip(strip, picked);
        changed ||= result.changed;
        return result.strip;
    });
    return { workspace: changed ? { ...workspace, strips } : workspace, picked, changed };
}

/** The job definition's label pair for a member, for the hub's list. */
export function memberLabel(id: string): { key: string; fallback: string } | null {
    const job = findJob(id);
    return job === null ? null : { key: job.labelKey, fallback: job.labelFallback };
}
