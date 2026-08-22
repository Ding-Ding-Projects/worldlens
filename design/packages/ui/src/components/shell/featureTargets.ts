/**
 * Where a catalogue row goes, expressed as data rather than as a click handler.
 *
 * Home's five catalogues, the catalogue pages themselves, the command palette and Home's own
 * search all offer the same eighty-five features, and every one of them has to end up in the
 * same place. Four components each holding their own `if (id === "renders") revealPage(...)`
 * ladder is how a palette ends up sending somebody to a screen the catalogue stopped using -
 * which is the exact failure `App.vue`'s existing "the palette opens nothing itself" comment
 * describes, one layer up.
 *
 * So a feature carries a {@link FeatureTarget}: a small tagged union naming what kind of
 * destination it is and which one. `shellNavigation.ts` owns the single function that turns one
 * into navigation, and the four surfaces above call that function and nothing else.
 *
 * ### Why the key is not the target
 *
 * Twenty-eight of the eighty-five features route to a job that another feature also routes to -
 * eight of them open `renders` alone - so a manifest keyed by its destination would collapse to
 * about a dozen rows. {@link CatalogueFeatureDefinition.key} is therefore a stable, globally
 * unique string of its own, and the target is a separate field. `catalogues.test.ts` asserts the
 * uniqueness, because a duplicate key silently drops a row from a `v-for` rather than failing.
 */

import type { JobId } from "./jobRegistry.js";

/** The three persistent destinations in the application rail. */
export type RailDestination = "home" | "map" | "work";

/** The five catalogues Home offers, in the order they are shown. */
export const CATALOGUE_IDS = ["make", "maps", "share", "copy", "host", "setup"] as const;

export type CatalogueId = (typeof CATALOGUE_IDS)[number];

/**
 * The viewer sub-surfaces a feature can ask the map destination to open.
 *
 * Deliberately a closed union rather than a free string: these map onto the map menu's own
 * existing pages, and a typo in a manifest of eighty-five rows would otherwise be a silent
 * no-op nobody notices until somebody clicks that one row.
 */
export type MapReveal = "maps" | "markers" | "settings" | "info";

/** The existing top-level overlays a feature can open. */
export type OverlayId = "settings" | "config" | "palette" | "notifications" | "eula" | "tour";

/** The two Work-workspace actions that are not a job. */
export type WorkAction = "tab-finder" | "dock-editor";

export type FeatureTarget =
    | { readonly kind: "job"; readonly jobId: JobId; readonly reveal?: string }
    | { readonly kind: "rail"; readonly destination: "map"; readonly reveal?: MapReveal }
    | { readonly kind: "overlay"; readonly overlay: OverlayId; readonly reveal?: string }
    | { readonly kind: "work-action"; readonly action: WorkAction; readonly reveal?: string }
    | { readonly kind: "docs"; readonly articleId: string }
    | {
          readonly kind: "conditional";
          readonly capability: string;
          readonly target: FeatureTarget;
      };

/**
 * One row on a catalogue page, and one entry in Home's search index.
 *
 * Copy is carried as a key plus an English fallback rather than as a resolved string, because
 * `t()` has to be called at render time: the language mode and both funny-level sliders move
 * the whole application's copy without anything being told to re-render, and a manifest that
 * resolved its strings once at module import would freeze at whatever the locale was when the
 * bundle first evaluated. `i18n.ts`'s own doc comment describes that mechanism.
 */
export interface CatalogueFeatureDefinition {
    /** Globally unique. Never a target or job id - several rows share those. */
    readonly key: string;
    /** An `@mdi/js` path, matching the strategy every other surface here uses. */
    readonly icon: string;
    /** The heading this row is filed under inside its catalogue page. */
    readonly groupKey: string;
    readonly groupFallback: string;
    readonly nameKey: string;
    readonly nameFallback: string;
    readonly blurbKey: string;
    readonly blurbFallback: string;
    readonly target: FeatureTarget;
    /**
     * Names a resolver in `catalogueMeta.ts` rather than carrying a value.
     *
     * The prototype's `107 settings`, `1 running` and `0.14.3 ready` are illustrations of what
     * the row looks like with something in it, not product truth. A resolver reads the live
     * store and returns `undefined` when there is nothing honest to say, at which point the row
     * simply has no meta.
     */
    readonly metaResolver?: string;
    /**
     * Names a capability in `capabilities.ts`. Absent means "always available".
     *
     * A feature whose only implementation is a private contract that is not in this checkout is
     * gated here rather than drawn as a card with demo values - a status panel showing invented
     * numbers is still a fake integration.
     */
    readonly availability?: string;
    /** True where the current public restricted-mode contract requires the row to be absent. */
    readonly hideInRestrictedMode?: boolean;
}

/** One of Home's five cards, and the page behind it. */
export interface CatalogueDefinition {
    readonly id: CatalogueId;
    readonly icon: string;
    readonly titleKey: string;
    readonly titleFallback: string;
    readonly blurbKey: string;
    readonly blurbFallback: string;
    readonly features: readonly CatalogueFeatureDefinition[];
}

/**
 * The innermost target of a possibly-conditional one.
 *
 * `conditional` wraps another target rather than replacing it, so availability and destination
 * stay separate concerns; this is what every consumer that only cares about "where does this
 * go" calls first.
 */
export function unwrapTarget(target: FeatureTarget): Exclude<FeatureTarget, { kind: "conditional" }> {
    return target.kind === "conditional" ? unwrapTarget(target.target) : target;
}

/**
 * Every capability a target depends on, outermost first.
 *
 * A target can be conditional on more than one capability once one wraps another, which is why
 * this returns a list rather than the first one it finds.
 */
export function targetCapabilities(target: FeatureTarget): readonly string[] {
    return target.kind === "conditional"
        ? [target.capability, ...targetCapabilities(target.target)]
        : [];
}

/**
 * The capability a feature needs, or null when it has none.
 *
 * Both the explicit `availability` field and a `conditional` target contribute, because the
 * manifest uses whichever reads more naturally at the row: `availability` when the whole row is
 * optional, a conditional target when only the destination is.
 */
export function featureCapabilities(
    feature: CatalogueFeatureDefinition,
): readonly string[] {
    const fromTarget = targetCapabilities(feature.target);
    return feature.availability === undefined
        ? fromTarget
        : [feature.availability, ...fromTarget];
}

/**
 * A stable, human-readable route string, for tests and for the development-time error an
 * unknown target raises.
 *
 * Deliberately the same shape the specification writes routes in (`job:renders/reveal=console`)
 * so a failing assertion names something a reader can find in the design document rather than a
 * serialized object.
 */
export function describeTarget(target: FeatureTarget): string {
    switch (target.kind) {
        case "job":
            return target.reveal === undefined
                ? `job:${target.jobId}`
                : `job:${target.jobId}/reveal=${target.reveal}`;
        case "rail":
            return target.reveal === undefined
                ? `rail:${target.destination}`
                : `rail:${target.destination}/reveal=${target.reveal}`;
        case "overlay":
            return target.reveal === undefined
                ? `overlay:${target.overlay}`
                : `overlay:${target.overlay}/reveal=${target.reveal}`;
        case "work-action":
            return target.reveal === undefined
                ? `work-action:${target.action}`
                : `work-action:${target.action}/reveal=${target.reveal}`;
        case "docs":
            return `docs:${target.articleId}`;
        case "conditional":
            return `conditional:${target.capability} -> ${describeTarget(target.target)}`;
    }
}

/**
 * Which rail destination a target lands on, for the "three activations from cold start" test.
 *
 * An overlay does not change the destination - `App.vue` keeps the surface underneath exactly
 * where it was, so Escape returns to it - which is why this answers null rather than guessing.
 */
export function targetDestination(target: FeatureTarget): RailDestination | null {
    const inner = unwrapTarget(target);
    switch (inner.kind) {
        case "job":
        case "work-action":
        case "docs":
            return "work";
        case "rail":
            return inner.destination;
        case "overlay":
            return null;
    }
}
