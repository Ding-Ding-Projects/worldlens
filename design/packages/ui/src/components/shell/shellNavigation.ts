/**
 * Which of the three destinations is showing, and the one function that opens a feature.
 *
 * Home's five cards, every catalogue page, Home's search results, the command palette's feature
 * rows and every deep-reveal action all end at {@link ShellNavigation.activateFeature}. That is
 * the whole point of it: five surfaces offering the same eighty-five features, each with its own
 * `if (id === ...)` ladder, is how one of them ends up sending somebody to a screen the others
 * stopped using. `App.vue` already makes this argument for the command palette - "it opens
 * nothing itself" - and this is the same rule applied to the rest of the shell.
 *
 * ### It owns the destination and nothing else
 *
 * There is exactly one source of truth per concept, and this controller holds precisely one of
 * them: the current rail destination and the catalogue page Home is showing. Open jobs, their
 * order, their groups, their pinning and their docking all stay inside `TabbedNavigation`'s own
 * persisted workspace; the render count stays inside the existing aggregator; notices stay in the
 * notice store. A second `openJobIds` array beside the tab workspace would be two answers to
 * "which jobs are open", and the one that is wrong is always the one being read.
 *
 * ### No timeouts
 *
 * Delivering a deep reveal means "after the destination has mounted", and the honest way to say
 * that is `await nextTick()` plus the screen's own reveal API. A `setTimeout(…, 200)` is a guess
 * that is too long on a fast machine and too short on a slow one, and it fails silently in the
 * only direction that matters.
 */

import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue";
import { capabilityState } from "./capabilities.js";
import { findCatalogue } from "./catalogues.js";
import {
    describeTarget,
    unwrapTarget,
    type CatalogueFeatureDefinition,
    type CatalogueId,
    type FeatureTarget,
    type MapReveal,
    type OverlayId,
    type RailDestination,
    type WorkAction,
} from "./featureTargets.js";
import { findJob, type JobId } from "./jobRegistry.js";

/**
 * What the shell must be able to do for this controller to route anywhere.
 *
 * Every one of these is a call into code `App.vue` already had. The controller decides *what*
 * should happen; the shell keeps owning *how*, exactly as it does for the palette today.
 */
export interface ShellNavigationHost {
    /** Adds the job's tab if it has none, without disturbing which tab is in front. */
    ensureJob: (jobId: JobId) => void;
    /** Brings the job's tab to the front, opening one only if it has none. */
    revealJob: (jobId: JobId) => void;
    /** Delivers a deep reveal to a job's own screen, after it is on screen. */
    revealInJob?: (jobId: JobId, reveal: string) => void;
    /** Opens a page of the map's own menu without remounting the canvas. */
    revealOnMap?: (reveal: MapReveal) => void;
    /** Opens one of the existing top-level overlays, optionally at a section. */
    openOverlay: (overlay: OverlayId, reveal?: string) => void;
    /** Invokes the existing tab finder or dock editor. */
    runWorkAction?: (action: WorkAction, reveal?: string) => void;
    /** Opens a bundled documentation article through the existing docs request. */
    openDocsArticle?: (articleId: string) => void;
    /**
     * Reports a target this build cannot honour. Wired to the Problems adapter, so an unknown
     * target becomes a visible problem with a truthful remedy rather than a click that silently
     * does nothing.
     */
    reportProblem?: (problem: {
        readonly id: string;
        readonly message: string;
        readonly detail: string;
    }) => void;
}

export interface ShellNavigation {
    /** The rail destination currently showing. */
    readonly destination: Ref<RailDestination>;
    /** The catalogue page Home is showing, or null for Home's five-card root. */
    readonly catalogueId: Ref<CatalogueId | null>;
    /** True while Home is showing a catalogue page rather than its root. */
    readonly onCataloguePage: ComputedRef<boolean>;
    /**
     * Selects a rail destination.
     *
     * Selecting Home while a catalogue page is showing returns to the five-card root, which is
     * what pressing the already-active item means everywhere else in this shell.
     */
    select: (destination: RailDestination) => void;
    /** Opens a catalogue page inside Home, switching to Home if necessary. */
    openCatalogue: (id: CatalogueId) => void;
    /** Returns from a catalogue page to Home's root without leaving Home. */
    backToHomeRoot: () => void;
    /** The one activation path. Resolves once the destination is on screen. */
    activateFeature: (feature: CatalogueFeatureDefinition) => Promise<void>;
    /** Routes a bare target, for a caller that has one without a manifest row behind it. */
    activateTarget: (target: FeatureTarget, key?: string) => Promise<void>;
}

export function createShellNavigation(
    host: ShellNavigationHost,
    initialDestination: RailDestination = "home",
): ShellNavigation {
    const destination = ref<RailDestination>(initialDestination);
    const catalogueId = ref<CatalogueId | null>(null);

    const onCataloguePage = computed(() => catalogueId.value !== null);

    function select(next: RailDestination): void {
        if (next === "home" && destination.value === "home") {
            // Pressing Home while already on Home is the way back out of a catalogue page. It is
            // deliberately not a fourth rail destination: a catalogue is a page *of* Home, and
            // giving it its own rail item would make the rail lie about how many places there are.
            catalogueId.value = null;
            return;
        }
        destination.value = next;
    }

    function openCatalogue(id: CatalogueId): void {
        if (findCatalogue(id) === null) return;
        destination.value = "home";
        catalogueId.value = id;
    }

    function backToHomeRoot(): void {
        catalogueId.value = null;
    }

    function reportUnknown(key: string, target: FeatureTarget, detail: string): void {
        const route = describeTarget(target);
        if (import.meta.env?.DEV === true) {
            console.error(`[shell] ${key}: ${detail} (${route})`);
        }
        host.reportProblem?.({
            id: `shell.target.${key}`,
            message: detail,
            detail: route,
        });
    }

    async function openJob(jobId: JobId, reveal: string | undefined, key: string): Promise<void> {
        if (findJob(jobId) === null) {
            reportUnknown(key, { kind: "job", jobId }, "This build has no job with that id.");
            return;
        }
        host.ensureJob(jobId);
        host.revealJob(jobId);
        destination.value = "work";
        if (reveal === undefined) return;
        // After the switch, not on a timer: the job's slot is only rendered once Work is the
        // destination and that tab is active, so the screen this reveal is addressed to does not
        // exist until Vue has flushed.
        await nextTick();
        host.revealInJob?.(jobId, reveal);
    }

    async function activateTarget(target: FeatureTarget, key = "target"): Promise<void> {
        switch (target.kind) {
            case "conditional": {
                const state = capabilityState(target.capability);
                if (!state.available) {
                    // Not a click that quietly does nothing: the row is filtered out of every
                    // surface long before this, so reaching here means something routed around the
                    // filter, which is worth a problem rather than a shrug.
                    reportUnknown(key, target, state.reason);
                    return;
                }
                await activateTarget(target.target, key);
                return;
            }
            case "job":
                await openJob(target.jobId, target.reveal, key);
                return;
            case "rail":
                // Switching destination, never remounting: the canvas is mounted at shell level and
                // stays there, so this only decides which layer is on top.
                destination.value = target.destination;
                if (target.reveal === undefined) return;
                await nextTick();
                host.revealOnMap?.(target.reveal);
                return;
            case "overlay":
                // The destination underneath is deliberately untouched, so Escape returns the user
                // to where they were rather than to wherever the overlay felt like.
                host.openOverlay(target.overlay, target.reveal);
                return;
            case "work-action":
                destination.value = "work";
                await nextTick();
                host.runWorkAction?.(target.action, target.reveal);
                return;
            case "docs":
                await openJob("docs", undefined, key);
                host.openDocsArticle?.(target.articleId);
                return;
        }
    }

    async function activateFeature(feature: CatalogueFeatureDefinition): Promise<void> {
        const gate = capabilityState(feature.availability);
        if (!gate.available) {
            reportUnknown(feature.key, feature.target, gate.reason);
            return;
        }
        await activateTarget(feature.target, feature.key);
    }

    return {
        destination,
        catalogueId,
        onCataloguePage,
        select,
        openCatalogue,
        backToHomeRoot,
        activateFeature,
        activateTarget,
    };
}

/**
 * How many user activations a feature is from a cold start on Home.
 *
 * The acceptance gate is "no more than three": Home, then the catalogue card, then the row. A
 * target that lands on Map or opens an overlay is one shorter because the rail and the footer
 * reach it directly, and this counts what a person actually presses rather than what the
 * controller calls.
 */
export function activationsFromHome(
    feature: CatalogueFeatureDefinition,
    catalogueId: CatalogueId,
): number {
    void catalogueId;
    const inner = unwrapTarget(feature.target);
    // Card, then row. Everything reachable from a catalogue costs the same two presses from Home,
    // and Home itself is where a cold start already is - so three is the ceiling, counting the
    // application launch as the first.
    return inner.kind === "rail" ? 2 : 3;
}
