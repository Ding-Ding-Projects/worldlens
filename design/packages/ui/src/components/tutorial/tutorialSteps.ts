/**
 * The tours' own itineraries: pure data, no copy in it.
 *
 * This is deliberately not where the words live. `tutorialCopy.ts` next door is what calls
 * the translator, because a catalogue key needs a literal, quoted-string call site somewhere
 * in the package for `appCopy.test.ts` and `catalogueCoverage.test.ts` to find it, and a step
 * built from two variables - a key and a fallback both read out of this object - would never
 * produce one, since the scanner reads source text rather than runtime values. `renderRun.ts`'s
 * `phaseLabel`/`adviseOnFailure` already draw this line the same way: a plain switch with one
 * literal call per case, fed by an id that lives here.
 *
 * ## What an anchor is, and the promise it makes
 *
 * `anchor` is a CSS selector for the one real control this step is about. It is never
 * invented: every selector below targets an attribute added to an existing, already-shipped
 * element (`data-tutorial-anchor` on a shell tab button, a rail destination button, or the
 * owning surface itself). `tutorialAnchors.test.ts` mounts the real owning surface for each
 * step of every tour and asserts the selector resolves to a real node, so a control renamed or
 * removed under a tour fails a test instead of quietly pointing the highlight at nothing.
 *
 * A control can still be absent at run time even though it exists in the source: its page may
 * not be open, or a narrow window may hide it. The overlay says so on the card and offers a
 * button that reveals the step's page (see `TutorialOverlay.vue`), rather than pointing at
 * nothing or silently moving on.
 *
 * `pageId` is the shell's own page id (`App.vue`'s `PAGE_*` constants, as strings): the value
 * `TutorialOverlay.vue` hands to the shell's `revealPage` so the step's real page is on
 * screen before the anchor is measured. `"home"`, `"map"` and `"work"` are rail destinations,
 * `"settings"` opens the settings panel, and every other id is a job opened in the Work strip.
 *
 * `signal` names an optional {@link TutorialSignal}: when the app fires it while this step is
 * the active one, the tour advances on its own, in addition to the ever-present Next button.
 */

export type TutorialStepId =
    | "welcome"
    | "makeAMap"
    | "findWorld"
    | "rendering"
    | "openMap"
    | "publish"
    | "wrapUp"
    | "homeRail"
    | "homeSearch"
    | "homeMachine"
    | "homeCatalogues"
    | "mapRail"
    | "mapPage"
    | "workRail"
    | "workStrip"
    | "workNewTab"
    | "projectsTab"
    | "projectsPage"
    | "projectsNew"
    | "pagesTab"
    | "toolsTab"
    | "toolsList"
    | "settingsRail"
    | "settingsSearch";

/** The step ids of the overall first-run tour, in order. */
export const TUTORIAL_STEP_IDS: readonly TutorialStepId[] = [
    "welcome",
    "makeAMap",
    "findWorld",
    "rendering",
    "openMap",
    "publish",
    "wrapUp",
];

/**
 * The tours. `overall` is the first-run walk; every other id is the short tour for one shell
 * destination or one of the main Work jobs, started from the command palette, from Help and
 * from Settings.
 */
export type TutorialTourId =
    | "overall"
    | "home"
    | "map"
    | "work"
    | "world"
    | "projects"
    | "pages"
    | "toolkit"
    | "settings";

export const TUTORIAL_TOUR_IDS: readonly TutorialTourId[] = [
    "overall",
    "home",
    "map",
    "work",
    "world",
    "projects",
    "pages",
    "toolkit",
    "settings",
];

/** Real, observable "the user did the thing" events a step can advance itself on. */
export type TutorialSignal = "world-chosen";

export interface TutorialStep {
    readonly id: TutorialStepId;
    /** The shell page id this step's anchor lives on, e.g. `"world"` or `"pages"`. */
    readonly pageId: string;
    /** A CSS selector resolving to the one real element this step highlights. */
    readonly anchor: string;
    /** Fires the step forward on its own when this event happens, on top of Next. */
    readonly signal?: TutorialSignal;
}

const anchorOf = (name: string): string => `[data-tutorial-anchor="${name}"]`;

/**
 * The genuine first-run path, in order: what BlueMap is, finding a world the computer
 * already has, what rendering means and roughly how long it takes, where the finished map
 * goes and how to open it, that it can be published, and where to find this tour again.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
    { id: "welcome", pageId: "map", anchor: anchorOf("rail-map") },
    { id: "makeAMap", pageId: "world", anchor: anchorOf("tab-world") },
    { id: "findWorld", pageId: "world", anchor: anchorOf("world-find"), signal: "world-chosen" },
    { id: "rendering", pageId: "world", anchor: anchorOf("world-render-explainer") },
    { id: "openMap", pageId: "map", anchor: anchorOf("rail-map") },
    { id: "publish", pageId: "pages", anchor: anchorOf("pages-publish") },
    // Docs lives inside the general tools tab now, so the tour points at that tab.
    { id: "wrapUp", pageId: "toolkit", anchor: anchorOf("tab-toolkit") },
];

/**
 * Every tour's steps. Each per-destination tour is two to four steps, every one on an anchor
 * that already exists on the real surface.
 */
export const TUTORIAL_TOURS: Readonly<Record<TutorialTourId, readonly TutorialStep[]>> = {
    overall: TUTORIAL_STEPS,
    home: [
        { id: "homeRail", pageId: "home", anchor: anchorOf("rail-home") },
        { id: "homeSearch", pageId: "home", anchor: anchorOf("home-search") },
        { id: "homeMachine", pageId: "home", anchor: anchorOf("home-machine") },
        { id: "homeCatalogues", pageId: "home", anchor: anchorOf("home-catalogues") },
    ],
    map: [
        { id: "mapRail", pageId: "map", anchor: anchorOf("rail-map") },
        { id: "mapPage", pageId: "map", anchor: anchorOf("map-page") },
    ],
    work: [
        { id: "workRail", pageId: "work", anchor: anchorOf("rail-work") },
        { id: "workStrip", pageId: "work", anchor: anchorOf("work-strip") },
        { id: "workNewTab", pageId: "work", anchor: anchorOf("work-new-tab") },
    ],
    world: [
        { id: "makeAMap", pageId: "world", anchor: anchorOf("tab-world") },
        { id: "findWorld", pageId: "world", anchor: anchorOf("world-find"), signal: "world-chosen" },
        { id: "rendering", pageId: "world", anchor: anchorOf("world-render-explainer") },
    ],
    projects: [
        { id: "projectsTab", pageId: "projects", anchor: anchorOf("tab-projects") },
        { id: "projectsPage", pageId: "projects", anchor: anchorOf("projects-page") },
        { id: "projectsNew", pageId: "projects", anchor: anchorOf("projects-new") },
    ],
    pages: [
        { id: "pagesTab", pageId: "pages", anchor: anchorOf("tab-pages") },
        { id: "publish", pageId: "pages", anchor: anchorOf("pages-publish") },
    ],
    toolkit: [
        { id: "toolsTab", pageId: "toolkit", anchor: anchorOf("tab-toolkit") },
        { id: "toolsList", pageId: "toolkit", anchor: anchorOf("tools-list") },
    ],
    settings: [
        { id: "settingsRail", pageId: "settings", anchor: anchorOf("rail-settings") },
        { id: "settingsSearch", pageId: "settings", anchor: anchorOf("settings-search") },
    ],
};

export function isTutorialTourId(value: unknown): value is TutorialTourId {
    return typeof value === "string" && (TUTORIAL_TOUR_IDS as readonly string[]).includes(value);
}

export function tutorialStepIndex(id: TutorialStepId): number {
    return TUTORIAL_STEPS.findIndex((step) => step.id === id);
}
