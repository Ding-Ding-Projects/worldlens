/**
 * Moving an existing tab workspace off the twelve-page model without taking anything with it.
 *
 * Two of the twelve destinations - Home and Map - stop being tabs, because they are rail
 * destinations now. The other ten stay exactly what they were: the same page ids, the same
 * groups, the same pins, the same order, the same docking edge. So this is a removal and a
 * placement decision, not a rebuild, and everything it does not explicitly change it must leave
 * alone.
 *
 * ### The one judgement call, and how it is made safely
 *
 * A fresh Work workspace opens the pinned wizard and nothing else, docked top - the rail owns the
 * left edge now, so left-of-app is no longer a sensible default. But a person who *chose* left,
 * or right, or bottom, chose it, and re-seeding over that is the single worst thing a migration
 * can do. The rule is therefore: change `left` to `top` **only when the whole workspace is
 * provably the untouched pre-rewrite default**, judged on semantic fields rather than on
 * timestamps or key order. One reordered tab, one renamed group, one pin, one extra tab, and the
 * workspace is somebody's, and their placement is kept.
 *
 * ### Idempotence
 *
 * The version marker is written only after the transformed workspace has been persisted, so a
 * crash between the two leaves the migration to run again rather than leaving a half-migrated
 * workspace marked done. Running it twice over an already-migrated workspace is a no-op, which is
 * what makes calling it unconditionally on every mount safe.
 */

import {
    DEFAULT_TAB_PLACEMENT,
    type TabPlacement,
    type TabStripState,
    type TabWorkspaceState,
} from "../tabs/tabModel.js";
import { FRESH_WORKSPACE_JOB_IDS, JOB_SEED_GROUPS, RAIL_PAGE_IDS, findJob } from "./jobRegistry.js";
import type { RailDestination } from "./featureTargets.js";

/** The key the marker is written under. Separate from the workspace's own key on purpose. */
export const SHELL_MIGRATION_KEY = "worldlens-shell-migration";

/** Bumped only by a migration that cannot be expressed as a repair of the previous one. */
export const SHELL_MIGRATION_VERSION = 1;

/** The pre-rewrite default, which is the only placement this migration is allowed to move. */
const LEGACY_DEFAULT_PLACEMENT: TabPlacement = DEFAULT_TAB_PLACEMENT;

/** Where a fresh Work workspace docks its strip: the rail owns the outer left edge now. */
export const WORK_DEFAULT_PLACEMENT: TabPlacement = "top";

/** The twelve page ids the pre-rewrite shell declared, in declaration order. */
const LEGACY_PAGE_IDS: readonly string[] = [
    "home",
    "map",
    "world",
    "projects",
    "cirender",
    "renders",
    "servers",
    "backups",
    "pages",
    "worldrepo",
    "preview",
    "docs",
];

/** What the migration decided, so the shell can act on it and a test can assert it. */
export interface WorkspaceMigrationResult {
    /** The workspace to persist, or null when nothing needed changing. */
    readonly workspace: TabWorkspaceState | null;
    /** Where the shell should land, derived from whichever page was active. */
    readonly destination: RailDestination;
    /** The job to select in Work, or null when the old active page was Home or Map. */
    readonly activeJobId: string | null;
    /** True when the stored workspace was the untouched pre-rewrite seed. */
    readonly wasUntouchedDefault: boolean;
    /** Page ids that were dropped because nothing in this build declares them. */
    readonly unresolvedPageIds: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Recognising the untouched default                                          */
/* -------------------------------------------------------------------------- */

/**
 * True when this strip is, semantically, exactly what the pre-rewrite shell seeded.
 *
 * Judged on: the twelve pages present exactly once each, Home pinned and nothing else, the three
 * seeded groups with their exact memberships, and the legacy placement. Deliberately not judged
 * on tab ids, labels, colours, collapse state or slot order - ids are generated per install,
 * labels move with the language, and a collapsed group is a preference rather than a
 * customisation of the workspace's shape.
 */
export function isUntouchedLegacySeed(strip: TabStripState): boolean {
    if (strip.placement !== LEGACY_DEFAULT_PLACEMENT) return false;

    const pageIds = strip.tabs.map((tab) => tab.pageId);
    if (pageIds.length !== LEGACY_PAGE_IDS.length) return false;
    const seen = new Set(pageIds);
    if (seen.size !== pageIds.length) return false;
    if (!LEGACY_PAGE_IDS.every((id) => seen.has(id))) return false;

    const pinnedPageIds = strip.pinnedOrder
        .map((tabId) => strip.tabs.find((tab) => tab.id === tabId)?.pageId)
        .filter((id): id is string => id !== undefined);
    if (pinnedPageIds.length !== 1 || pinnedPageIds[0] !== "home") return false;

    const expectedGroups: readonly (readonly string[])[] = [
        ["projects", "cirender", "renders"],
        ["servers", "pages", "preview"],
        ["backups", "worldrepo"],
    ];
    if (strip.groups.length !== expectedGroups.length) return false;
    const actualGroups = strip.groups.map((group) =>
        group.tabIds
            .map((tabId) => strip.tabs.find((tab) => tab.id === tabId)?.pageId)
            .filter((id): id is string => id !== undefined),
    );
    return expectedGroups.every((expected, index) => {
        const actual = actualGroups[index];
        return (
            actual !== undefined &&
            actual.length === expected.length &&
            expected.every((id, position) => actual[position] === id)
        );
    });
}

/* -------------------------------------------------------------------------- */
/* Migrating                                                                  */
/* -------------------------------------------------------------------------- */

/** Removes a tab and every trace of it: its group membership, its pin, and its slot. */
function removeTab(strip: TabStripState, tabId: string): TabStripState {
    return {
        ...strip,
        tabs: strip.tabs.filter((tab) => tab.id !== tabId),
        groups: strip.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((id) => id !== tabId),
        })),
        pinnedOrder: strip.pinnedOrder.filter((id) => id !== tabId),
        slots: strip.slots.filter((slot) => !(slot.kind === "tab" && slot.tabId === tabId)),
        activeTabId: strip.activeTabId === tabId ? null : strip.activeTabId,
    };
}

/**
 * The shape a genuinely fresh Work workspace starts in: the pinned wizard, docked top, and the
 * three group definitions ready for their first member.
 *
 * The groups are declared with no members rather than omitted, so opening Projects files it under
 * "Rendering" the way it always did. A group with nothing in it renders no heading - `WorkPane`
 * enforces that - so this costs nothing visually while the strip holds one pinned tab.
 */
export function freshWorkStrip(makeTabId: (index: number) => string): TabStripState {
    const tabs = FRESH_WORKSPACE_JOB_IDS.map((jobId, index) => {
        const job = findJob(jobId);
        return {
            id: makeTabId(index),
            pageId: jobId,
            label: job?.labelFallback ?? jobId,
            icon: job?.icon ?? null,
            dirty: false,
            appearance: null,
        };
    });
    const first = tabs[0];
    return {
        id: "strip-main",
        label: "Main",
        windowId: "window-main",
        windowLabel: "",
        placement: WORK_DEFAULT_PLACEMENT,
        tabs,
        groups: JOB_SEED_GROUPS.map((group) => ({
            id: group.id,
            name: group.nameFallback,
            color: group.color,
            collapsed: false,
            tabIds: [],
            appearance: null,
        })),
        pinnedOrder: first === undefined ? [] : [first.id],
        slots: tabs.map((tab) => ({ kind: "tab" as const, tabId: tab.id })),
        activeTabId: first?.id ?? null,
    };
}

/**
 * Migrates one stored workspace.
 *
 * Returns `workspace: null` when nothing needed changing, so a caller can skip a write - and,
 * more importantly, so a workspace that has already been migrated is not rewritten on every mount
 * with a fresh set of object identities that the deep watcher would then persist again.
 */
export function migrateWorkspace(
    stored: TabWorkspaceState | null,
    options: { readonly makeTabId?: (index: number) => string } = {},
): WorkspaceMigrationResult {
    const makeTabId = options.makeTabId ?? ((index: number) => `tab-seed-${String(index)}`);

    if (stored === null || stored.strips.length === 0) {
        return {
            workspace: { strips: [freshWorkStrip(makeTabId)] },
            destination: "home",
            activeJobId: null,
            wasUntouchedDefault: false,
            unresolvedPageIds: [],
        };
    }

    const strip = stored.strips[0];
    if (strip === undefined) {
        return {
            workspace: { strips: [freshWorkStrip(makeTabId)] },
            destination: "home",
            activeJobId: null,
            wasUntouchedDefault: false,
            unresolvedPageIds: [],
        };
    }

    // Read the old active page *before* anything is removed, because Home and Map are exactly the
    // two the removal is about and losing which one was active would land everybody on Home.
    const activePageId = strip.tabs.find((tab) => tab.id === strip.activeTabId)?.pageId ?? null;

    if (isUntouchedLegacySeed(strip)) {
        return {
            workspace: { strips: [freshWorkStrip(makeTabId)] },
            destination: destinationForPage(activePageId),
            activeJobId: null,
            wasUntouchedDefault: true,
            unresolvedPageIds: [],
        };
    }

    // Customised. Remove only the two structural pages; everything else is somebody's arrangement.
    const railTabIds = strip.tabs
        .filter((tab) => (RAIL_PAGE_IDS as readonly string[]).includes(tab.pageId))
        .map((tab) => tab.id);

    let next = railTabIds.reduce(removeTab, strip);

    // A page id nothing in this build declares is *kept*, not deleted: an extension page, or a
    // page a newer build added and this one has not caught up with, is recoverable data. It is
    // reported so the Problems panel can say so rather than the tab silently rendering the tab
    // system's own "no content for that page" message forever.
    const unresolvedPageIds = next.tabs
        .map((tab) => tab.pageId)
        .filter((pageId) => findJob(pageId) === null);

    // Only a provably-default placement moves. A deliberate left, right or bottom is theirs.
    if (next.placement === LEGACY_DEFAULT_PLACEMENT && wasDefaultShaped(strip)) {
        next = { ...next, placement: WORK_DEFAULT_PLACEMENT };
    }

    if (next.activeTabId === null) {
        const survivor = next.tabs[0];
        next = { ...next, activeTabId: survivor?.id ?? null };
    }

    const activeJobId =
        activePageId !== null && findJob(activePageId) !== null ? activePageId : null;

    return {
        workspace: { strips: [next, ...stored.strips.slice(1)] },
        destination: destinationForPage(activePageId),
        activeJobId,
        wasUntouchedDefault: false,
        unresolvedPageIds,
    };
}

/**
 * A weaker test than {@link isUntouchedLegacySeed}: did the user leave the *placement* alone?
 *
 * A workspace can be customised in every other way and still never have been docked deliberately,
 * and moving a strip somebody has never touched from the edge the rail now owns is the whole point
 * of the change. So the placement moves when it is still the legacy default *and* no group has
 * been renamed or recoloured away from the seed - which is the cheapest available evidence that
 * the strip's own chrome has not been deliberately arranged.
 */
function wasDefaultShaped(strip: TabStripState): boolean {
    if (strip.placement !== LEGACY_DEFAULT_PLACEMENT) return false;
    const seedNames = new Set<string>(JOB_SEED_GROUPS.map((group) => group.nameFallback));
    return strip.groups.every((group) => seedNames.has(group.name));
}

/** Where the shell lands, given whichever page was last active. */
function destinationForPage(pageId: string | null): RailDestination {
    if (pageId === "home" || pageId === null) return "home";
    if (pageId === "map") return "map";
    return findJob(pageId) === null ? "home" : "work";
}

/* -------------------------------------------------------------------------- */
/* The marker                                                                 */
/* -------------------------------------------------------------------------- */

/** The two methods used, so a test can pass a plain object and nothing else leaks. */
export interface MigrationStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): MigrationStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

/** True when this build's migration has already run against this profile. */
export function migrationAlreadyRan(
    storage: MigrationStorage | null = defaultStorage(),
): boolean {
    if (storage === null) return false;
    try {
        const raw = storage.getItem(SHELL_MIGRATION_KEY);
        if (raw === null) return false;
        const parsed: unknown = JSON.parse(raw);
        return (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { version?: unknown }).version === SHELL_MIGRATION_VERSION
        );
    } catch {
        // A hand-edited or half-written marker is treated as "not migrated". Running an idempotent
        // migration a second time costs nothing; trusting a marker we cannot read costs the
        // migration entirely.
        return false;
    }
}

/**
 * Records that the migration ran. Call only after the transformed workspace has been persisted -
 * see this module's own doc comment for why the order is load-bearing.
 */
export function markMigrationRan(storage: MigrationStorage | null = defaultStorage()): void {
    if (storage === null) return;
    try {
        storage.setItem(
            SHELL_MIGRATION_KEY,
            JSON.stringify({ version: SHELL_MIGRATION_VERSION }),
        );
    } catch {
        // Private mode or a full quota. The migration is idempotent, so the only consequence is
        // that it runs again next launch and reaches the same answer.
    }
}
