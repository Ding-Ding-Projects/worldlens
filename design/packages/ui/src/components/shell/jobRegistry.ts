/**
 * The jobs a Work workspace can hold, which is a different list from the catalogue of features.
 *
 * The uploaded handoff proposed one declarative list replacing both `pages` and `initialGroups`
 * in `App.vue`. That collapses two things that have to stay apart:
 *
 *  - **Discovery** is eighty-five rows across five catalogues, most of which are explanations of
 *    a capability rather than a destination, and several of which point at the same screen.
 *  - **The workspace** is eleven jobs, each of which is a real tab with a label, an icon, a
 *    seeded group and a persisted position, and each of which must survive a restart.
 *
 * Driving the tab strip from the catalogue would make "how many rows explain rendering" decide
 * how many tabs exist, which is nonsense. So the catalogue is in `catalogues.ts` and this is the
 * registry: the same shape `TabbedNavigation` already consumes, plus the seed-group membership
 * `App.vue` used to declare inline, plus the availability gate an optional job needs.
 *
 * ### The ids are the old page ids
 *
 * `wizard` is the one exception and it is not one: the legacy page id was `world`, and the job id
 * stays `world` here so an upgrading workspace keeps its tab. `wizard` is the *semantic* name the
 * specification uses, mapped in {@link JOB_IDS_BY_SEMANTIC_NAME} rather than renamed on disk,
 * because renaming a persisted page id is how a returning user loses the tab they had open.
 */

import {
    mdiCloudDownloadOutline,
    mdiCloudSyncOutline,
    mdiCloudUploadOutline,
    mdiCubeOutline,
    mdiSwapHorizontal,
    mdiEye,
    mdiFileDocumentOutline,
    mdiFolderMultipleOutline,
    mdiLifebuoy,
    mdiLockOutline,
    mdiMapPlus,
    mdiMemory,
    mdiRobotOutline,
    mdiProgressClock,
    mdiServerNetwork,
    mdiShieldKeyOutline,
    mdiSourceRepository,
    mdiWeb,
} from "@mdi/js";
import type { Component } from "vue";

/** The jobs the public checkout genuinely implements. */
export type CoreJobId =
    | "world"
    | "projects"
    | "cirender"
    | "structures"
    | "chunker"
    | "authenticator"
    | "locks"
    | "support"
    | "browserExtension"
    | "renders"
    | "servers"
    | "pages"
    | "preview"
    | "backups"
    | "worldrepo"
    | "docs"
    | "ollama";

/**
 * Jobs that exist only where a sanitized public contract for them is in this checkout.
 *
 * `memory` is the cross-application console. There is no public implementation of it here, so it
 * is capability-gated rather than drawn: a status card with demo values is still a fake
 * integration, and this repository must not acquire private implementation details by
 * implication.
 */
export type OptionalJobId = "memory";

export type JobId = CoreJobId | OptionalJobId;

/**
 * The specification's semantic names, mapped onto the persisted page ids.
 *
 * Two of them differ, and both differences are load-bearing: `wizard` is stored as `world` and
 * `runners` as `cirender`, because those are the ids already inside every saved workspace. The
 * manifest is written in the semantic names because that is what the approved design says; this
 * is where they become the ids the tab system has always used.
 */
export const JOB_IDS_BY_SEMANTIC_NAME = {
    wizard: "world",
    projects: "projects",
    runners: "cirender",
    structures: "structures",
    chunker: "chunker",
    authenticator: "authenticator",
    locks: "locks",
    support: "support",
    renders: "renders",
    servers: "servers",
    pages: "pages",
    preview: "preview",
    backups: "backups",
    worldrepo: "worldrepo",
    docs: "docs",
    memory: "memory",
    ollama: "ollama",
    browserExtension: "browserExtension",
} as const satisfies Record<string, JobId>;

/** The semantic name a manifest row writes. */
export type SemanticJobName = keyof typeof JOB_IDS_BY_SEMANTIC_NAME;

/** Resolves a semantic name to the persisted job id, or null when it names nothing. */
export function jobIdForSemanticName(name: string): JobId | null {
    return Object.hasOwn(JOB_IDS_BY_SEMANTIC_NAME, name)
        ? JOB_IDS_BY_SEMANTIC_NAME[name as SemanticJobName]
        : null;
}

/** The three groups a fresh Work workspace seeds, unchanged from the pre-rewrite shell. */
export type JobSeedGroup = "rendering" | "finished" | "copies";

/**
 * One entry in the registry.
 *
 * `component` is deliberately absent: `App.vue` renders each job through `TabbedNavigation`'s
 * existing named-slot contract, so the mapping from job id to component is the template itself
 * rather than a second lookup table that could disagree with it. The type is exported for a
 * future consumer that needs it without forcing one now.
 */
export interface JobDefinition {
    readonly id: JobId;
    readonly semanticName: SemanticJobName;
    /** Translated at render time - see the `labelKey`/`labelFallback` pair, never a frozen string. */
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly icon: string;
    /** Null for a job that stays loose in the strip: the wizard and the docs browser. */
    readonly seedGroup: JobSeedGroup | null;
    /** Pinned the first time its tab exists. Only the wizard, on a fresh Work workspace. */
    readonly pinnedOnFreshWorkspace: boolean;
    /** Named in `capabilities.ts`; absent means the public checkout always has it. */
    readonly availability?: string;
    /** Reserved for a consumer that needs the component without the slot. */
    readonly component?: Component;
}

/**
 * The seed groups, named for the job their members share.
 *
 * Same three names, same three memberships and the same declaration order as the pre-rewrite
 * `initialGroups` in `App.vue`, because a returning user's workspace is restored rather than
 * re-seeded and the names are what their group headings already say.
 */
export const JOB_SEED_GROUPS = [
    {
        id: "seed-rendering",
        key: "rendering",
        nameKey: "tabs.group.seed.rendering",
        nameFallback: "Rendering",
        color: "primary",
    },
    {
        id: "seed-finished",
        key: "finished",
        nameKey: "tabs.group.seed.finished",
        nameFallback: "Finished maps",
        color: "tertiary",
    },
    {
        id: "seed-copies",
        key: "copies",
        nameKey: "tabs.group.seed.copies",
        nameFallback: "Keeping a copy",
        color: "secondary",
    },
] as const satisfies readonly {
    id: string;
    key: JobSeedGroup;
    nameKey: string;
    nameFallback: string;
    color: string;
}[];

/**
 * Every job, in the order they are declared to `TabbedNavigation`.
 *
 * Icons are the same `@mdi/js` exports the pre-rewrite `pages` list used, so an upgrading
 * workspace's restored tabs keep the icon they were saved with rather than changing appearance
 * for no reason a user could explain.
 */
export const JOB_DEFINITIONS: readonly JobDefinition[] = [
    {
        id: "world",
        semanticName: "wizard",
        labelKey: "tabs.page.world",
        labelFallback: "Make a map",
        icon: mdiMapPlus,
        seedGroup: null,
        pinnedOnFreshWorkspace: true,
    },
    {
        id: "projects",
        semanticName: "projects",
        labelKey: "tabs.page.projects",
        labelFallback: "Projects",
        icon: mdiFolderMultipleOutline,
        seedGroup: "rendering",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "cirender",
        semanticName: "runners",
        labelKey: "tabs.page.ciRender",
        labelFallback: "GitHub runners",
        icon: mdiCloudSyncOutline,
        seedGroup: "rendering",
        pinnedOnFreshWorkspace: false,
    },
    /*
     * Four jobs `App.vue` has hosted a slot for since the doc comment beside
     * `openLockDataFolder` ("built, tested and unreachable until this") added them, but this
     * registry never learned their ids - so `TabbedNavigation` never knew they existed, no
     * new-tab menu item could open one, and no command-palette row could reveal one either.
     * The same gap the doc comment describes, one file over. Loose rather than seeded into any
     * of the three named groups below: none of Rendering, Finished maps or Keeping a copy
     * describes what any of these four are for.
     */
    {
        id: "structures",
        semanticName: "structures",
        labelKey: "tabs.page.structures",
        labelFallback: "Structures",
        icon: mdiCubeOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    /*
     * Converting a world between editions. Loose for the same reason the four above are:
     * it is neither rendering, nor a finished map, nor keeping a copy.
     */
    {
        id: "chunker",
        semanticName: "chunker",
        labelKey: "tabs.page.chunker",
        labelFallback: "Convert",
        icon: mdiSwapHorizontal,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "authenticator",
        semanticName: "authenticator",
        labelKey: "tabs.page.authenticator",
        labelFallback: "Authenticator",
        icon: mdiShieldKeyOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "locks",
        semanticName: "locks",
        labelKey: "tabs.page.locks",
        labelFallback: "Locks",
        icon: mdiLockOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "support",
        semanticName: "support",
        labelKey: "tabs.page.support",
        labelFallback: "Support Tickets",
        icon: mdiLifebuoy,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "renders",
        semanticName: "renders",
        labelKey: "tabs.page.renders",
        labelFallback: "Renders",
        icon: mdiProgressClock,
        seedGroup: "rendering",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "servers",
        semanticName: "servers",
        labelKey: "tabs.page.servers",
        labelFallback: "Maps and servers",
        icon: mdiServerNetwork,
        seedGroup: "finished",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "pages",
        semanticName: "pages",
        labelKey: "tabs.page.pages",
        labelFallback: "Publish to Pages",
        icon: mdiWeb,
        seedGroup: "finished",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "preview",
        semanticName: "preview",
        labelKey: "tabs.page.preview",
        labelFallback: "Watch it live",
        icon: mdiEye,
        seedGroup: "finished",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "backups",
        semanticName: "backups",
        labelKey: "tabs.page.backups",
        labelFallback: "Backups",
        icon: mdiCloudUploadOutline,
        seedGroup: "copies",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "worldrepo",
        semanticName: "worldrepo",
        labelKey: "tabs.page.worldRepo",
        labelFallback: "World repository",
        icon: mdiSourceRepository,
        seedGroup: "copies",
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "docs",
        semanticName: "docs",
        labelKey: "tabs.page.docs",
        labelFallback: "Docs",
        icon: mdiFileDocumentOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "ollama",
        semanticName: "ollama",
        labelKey: "tabs.page.ollama",
        labelFallback: "Ollama",
        icon: mdiRobotOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "browserExtension",
        semanticName: "browserExtension",
        labelKey: "tabs.page.browserExtension",
        labelFallback: "Browser downloads",
        icon: mdiCloudDownloadOutline,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
    },
    {
        id: "memory",
        semanticName: "memory",
        labelKey: "tabs.page.memory",
        labelFallback: "Memory console",
        icon: mdiMemory,
        seedGroup: null,
        pinnedOnFreshWorkspace: false,
        availability: "memory-console",
    },
];

/** Every job id, for a test that has to enumerate them without walking the objects. */
export const JOB_IDS: readonly JobId[] = JOB_DEFINITIONS.map((job) => job.id);

/** The job ids a genuinely fresh Work workspace opens: the pinned wizard, and nothing else. */
export const FRESH_WORKSPACE_JOB_IDS: readonly JobId[] = JOB_DEFINITIONS.filter(
    (job) => job.pinnedOnFreshWorkspace,
).map((job) => job.id);

/** The job with this id, or null. */
export function findJob(id: string): JobDefinition | null {
    return JOB_DEFINITIONS.find((job) => job.id === id) ?? null;
}

/**
 * The two structural pages the rewrite removes from the workspace.
 *
 * They are rail destinations now, so a restored workspace that still carries a tab for either
 * has it removed by `tabWorkspaceMigration.ts`. Kept as a named constant because three modules
 * check the same pair and a fourth spelling of `"home"` is how one of them ends up missing it.
 */
export const RAIL_PAGE_IDS = ["home", "map"] as const;

export type RailPageId = (typeof RAIL_PAGE_IDS)[number];

/** True for a page id that is a rail destination rather than a job. */
export function isRailPageId(pageId: string): pageId is RailPageId {
    return (RAIL_PAGE_IDS as readonly string[]).includes(pageId);
}
