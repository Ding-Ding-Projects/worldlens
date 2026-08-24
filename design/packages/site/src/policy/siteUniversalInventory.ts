/**
 * The site owns this inventory. It is deliberately hand-written rather than discovered from
 * the DOM, so removing a contract cannot make the check remove its own expectation.
 */

export interface SiteUniversalInventoryRow {
    readonly id: string;
    readonly label: string;
    readonly implementation: string;
    readonly documentation: string;
    readonly tests: string;
    readonly builtInteraction: string;
    readonly capture: string;
    readonly status: "implemented" | "pending";
    readonly freshness: "candidate" | "verified";
}

export const SITE_UNIVERSAL_INVENTORY: readonly SiteUniversalInventoryRow[] = [
    {
        id: "language-and-tone",
        label: "Language modes and funny levels",
        implementation: "src/i18n/I18n.ts",
        documentation: "docs/site/universal-contracts.md#language-and-tone",
        tests: "src/i18n/I18n.test.ts",
        builtInteraction: "Universal contracts language selector",
        capture: "site-universal-contracts-language.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "appearance",
        label: "Every-element appearance editor",
        implementation: "src/appearance/editor/appearanceEditor.ts",
        documentation: "docs/site/universal-contracts.md#appearance",
        tests: "src/appearance/editor/appearanceEditor.test.ts",
        builtInteraction: "Edit appearance on the universal surface",
        capture: "site-universal-contracts-appearance.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "search-and-regex",
        label: "Search and anchored regex builders",
        implementation: "src/search/builderPanel.ts",
        documentation: "docs/site/universal-contracts.md#search",
        tests: "src/search/attachBuilder.test.ts",
        builtInteraction: "Universal contract search builder",
        capture: "site-universal-contracts-search.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "tabs",
        label: "Browser-style tabs and groups",
        implementation: "src/tabs/index.ts",
        documentation: "docs/site/universal-contracts.md#tabs",
        tests: "src/tabs/TabStrip.test.ts",
        builtInteraction: "Universal contracts tab",
        capture: "site-universal-contracts-tabs.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "locks",
        label: "Per-element and per-property toy locks",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#locks",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Create and unlock a site element lock",
        capture: "site-universal-contracts-locks.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "authenticator",
        label: "Local standards-based authenticator",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#authenticator",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Register an otpauth URI and inspect its countdown",
        capture: "site-universal-contracts-authenticator.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "support-tickets",
        label: "Local Support Tickets recovery surface",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#support-tickets",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Create a local recovery ticket",
        capture: "site-universal-contracts-support.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "unlock-ladder",
        label: "Waiting-only unlock ladder",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#unlock-ladder",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Solve the local waiting challenge",
        capture: "site-universal-contracts-ladder.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "history",
        label: "Append-only local visitor history",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#history",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Export and clear redacted site history",
        capture: "site-universal-contracts-history.png",
        status: "implemented",
        freshness: "candidate",
    },
    {
        id: "privacy-boundary",
        label: "Unauthenticated ordinary wording and local-only boundary",
        implementation: "src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#privacy",
        tests: "src/universal/siteContracts.test.ts",
        builtInteraction: "Storage disclosure and no-network recovery route",
        capture: "site-universal-contracts-privacy.png",
        status: "implemented",
        freshness: "candidate",
    },
];

export function assertSiteUniversalInventory(
    inventory: readonly SiteUniversalInventoryRow[] = SITE_UNIVERSAL_INVENTORY,
): void {
    if (inventory.length !== SITE_UNIVERSAL_INVENTORY.length)
        throw new Error(
            `Site universal inventory drifted: expected ${SITE_UNIVERSAL_INVENTORY.length} rows, found ${inventory.length}`,
        );
    const ids = new Set<string>();
    for (const row of inventory) {
        if (ids.has(row.id)) throw new Error(`Duplicate site universal inventory id: ${row.id}`);
        ids.add(row.id);
        for (const [field, value] of Object.entries(row)) {
            if (typeof value !== "string" || value.trim() === "")
                throw new Error(`Site universal inventory ${row.id} has an empty ${field}`);
        }
        if (row.status !== "implemented") throw new Error(`Site universal inventory row is pending: ${row.id}`);
        if (row.freshness !== "candidate" && row.freshness !== "verified") throw new Error(`Site universal inventory row has stale evidence: ${row.id}`);
    }
    for (const expected of SITE_UNIVERSAL_INVENTORY) {
        if (!ids.has(expected.id)) throw new Error(`Missing site universal inventory row: ${expected.id}`);
    }
}

/** Cross-check the universal additions against every pre-existing Pages contract row. */
export function assertGlobalPagesCrossCheck(
    coverage: readonly { readonly id: string }[] = PAGES_FEATURE_COVERAGE,
): void {
    const available = new Set(coverage.map((row) => row.id));
    const missing = REQUIRED_PAGES_FEATURE_IDS.filter((id) => !available.has(id));
    if (missing.length > 0) throw new Error(`Pages inventory rows missing from site cross-check: ${missing.join(", ")}`);
}
import { PAGES_FEATURE_COVERAGE, REQUIRED_PAGES_FEATURE_IDS } from "./globalFeatureCoverage.js";
