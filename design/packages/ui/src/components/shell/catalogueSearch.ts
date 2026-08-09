/**
 * Searching the catalogue, through the same matcher every other search bar in this application
 * uses.
 *
 * `regexEngine.ts` already owns plain-text-versus-regex, flag handling, invalid-pattern reporting
 * and the backtracking guard, and every settings surface, the docs browser and the tab finder all
 * search through it. Home and the catalogue pages do too: a second, ad-hoc `includes()` filter
 * here would be a search bar whose regex builder was decoration, which is precisely the defect the
 * regex-builder rule exists to prevent.
 *
 * ### Capability filtering happens before indexing, not after
 *
 * A row whose capability is absent is dropped from the corpus rather than from the results. Filter
 * afterwards and the hidden row's own words are still in the haystack, so a query that matches only
 * that row reports "1 of 85" and shows nothing - which tells the reader the row exists and is being
 * withheld. That is a leak in the only sense that matters here.
 */

import { createSettingMatcher, type SettingMatcher } from "../config/regexEngine.js";
import { capabilityAvailable } from "./capabilities.js";
import { CATALOGUES } from "./catalogues.js";
import { featureCapabilities } from "./featureTargets.js";
import type {
    CatalogueDefinition,
    CatalogueFeatureDefinition,
    CatalogueId,
} from "./featureTargets.js";
import type { Translate } from "./catalogueMeta.js";

/** One feature, with its copy resolved for the locale and tone in force right now. */
export interface ResolvedFeature {
    readonly definition: CatalogueFeatureDefinition;
    readonly catalogueId: CatalogueId;
    readonly catalogueTitle: string;
    readonly group: string;
    readonly name: string;
    readonly blurb: string;
    /** Live, or undefined when the resolver had nothing honest to say. */
    readonly meta: string | undefined;
}

/** A catalogue with its copy resolved and its unavailable rows already removed. */
export interface ResolvedCatalogue {
    readonly definition: CatalogueDefinition;
    readonly id: CatalogueId;
    readonly title: string;
    readonly blurb: string;
    readonly features: readonly ResolvedFeature[];
}

/** One heading on a catalogue page, with the rows filed under it. */
export interface ResolvedGroup {
    readonly key: string;
    readonly heading: string;
    readonly features: readonly ResolvedFeature[];
}

/** True when every capability this row depends on is present in this build. */
export function featureAvailable(feature: CatalogueFeatureDefinition): boolean {
    return featureCapabilities(feature).every((name) => capabilityAvailable(name));
}

/**
 * The catalogues as the interface should draw them: translated, capability-filtered, and with
 * restricted-mode rows removed when that mode is active.
 *
 * `resolveMetaFor` is passed in rather than imported so a caller that has no live stores - a test,
 * or Home before anything has reconciled - can hand in a resolver that answers nothing, and get
 * back a catalogue with no meta rather than one with invented meta.
 */
export function resolveCatalogues(
    t: Translate,
    resolveMetaFor: (feature: CatalogueFeatureDefinition) => string | undefined,
    restrictedModeActive = false,
): readonly ResolvedCatalogue[] {
    return CATALOGUES.map((catalogue) => ({
        definition: catalogue,
        id: catalogue.id,
        title: t(catalogue.titleKey, catalogue.titleFallback),
        blurb: t(catalogue.blurbKey, catalogue.blurbFallback),
        features: catalogue.features
            .filter(
                (feature) =>
                    featureAvailable(feature) &&
                    !(restrictedModeActive && feature.hideInRestrictedMode === true),
            )
            .map((feature) => ({
                definition: feature,
                catalogueId: catalogue.id,
                catalogueTitle: t(catalogue.titleKey, catalogue.titleFallback),
                group: t(feature.groupKey, feature.groupFallback),
                name: t(feature.nameKey, feature.nameFallback),
                blurb: t(feature.blurbKey, feature.blurbFallback),
                meta: resolveMetaFor(feature),
            })),
    }));
}

/** Every resolved feature across every catalogue, in declared order. */
export function flattenFeatures(
    catalogues: readonly ResolvedCatalogue[],
): readonly ResolvedFeature[] {
    return catalogues.flatMap((catalogue) => catalogue.features);
}

/**
 * Files a catalogue's rows under their headings, in first-appearance order, dropping a heading
 * with nothing left under it.
 *
 * First-appearance rather than a declared heading order, so the manifest stays the one place the
 * order is decided: moving a row moves it, and a heading nobody has a row under stops rendering
 * without anything else needing to know.
 */
export function groupFeatures(catalogue: ResolvedCatalogue): readonly ResolvedGroup[] {
    const order: string[] = [];
    const byKey = new Map<string, { heading: string; features: ResolvedFeature[] }>();
    for (const feature of catalogue.features) {
        const key = feature.definition.groupKey;
        let bucket = byKey.get(key);
        if (bucket === undefined) {
            bucket = { heading: feature.group, features: [] };
            byKey.set(key, bucket);
            order.push(key);
        }
        bucket.features.push(feature);
    }
    return order.map((key) => {
        const bucket = byKey.get(key);
        return {
            key,
            heading: bucket?.heading ?? "",
            features: bucket?.features ?? [],
        };
    });
}

/** Everything a query matches against, for one row. */
export function featureHaystack(feature: ResolvedFeature): string {
    return [
        feature.catalogueTitle,
        feature.group,
        feature.name,
        feature.blurb,
        feature.meta ?? "",
        // The stable key too, so somebody who knows what a feature is called internally can find
        // it. It carries no private information: every key is a slug of the visible name.
        feature.definition.key,
    ]
        .filter((part) => part.trim().length > 0)
        .join("\n");
}

/** One line per row, which is what the anchored regex builder previews its matches against. */
export function catalogueSampleText(features: readonly ResolvedFeature[]): string {
    return features.map((feature) => `${feature.catalogueTitle}: ${feature.name}`).join("\n");
}

/** Builds the shared matcher. Re-exported so a component imports one module, not two. */
export function createCatalogueMatcher(
    query: string,
    regexMode: boolean,
    flags: string,
): SettingMatcher {
    return createSettingMatcher(query, regexMode, flags);
}

/** Every row the matcher accepts, in the order it was given. */
export function filterFeatures(
    features: readonly ResolvedFeature[],
    matcher: SettingMatcher,
): readonly ResolvedFeature[] {
    if (!matcher.active) return features;
    return features.filter((feature) => matcher.test(featureHaystack(feature)));
}

/**
 * The catalogues, each holding only the rows that matched.
 *
 * A catalogue with nothing left is kept rather than dropped, so Home's five cards stay five cards
 * while a search is running: the grid reflowing from five to two and back as somebody types is a
 * worse answer to "what matched" than a card honestly reading zero.
 */
export function filterCatalogues(
    catalogues: readonly ResolvedCatalogue[],
    matcher: SettingMatcher,
): readonly ResolvedCatalogue[] {
    if (!matcher.active) return catalogues;
    return catalogues.map((catalogue) => ({
        ...catalogue,
        features: filterFeatures(catalogue.features, matcher),
    }));
}
