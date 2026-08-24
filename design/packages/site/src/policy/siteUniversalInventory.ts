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
        implementation: "design/packages/site/src/i18n/I18n.ts",
        documentation: "docs/site/universal-contracts.md#language-and-tone",
        tests: "design/packages/site/src/i18n/I18n.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/settings-section-language-and-tone.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "appearance",
        label: "Every-element appearance editor",
        implementation: "design/packages/site/src/appearance/editor/appearanceEditor.ts",
        documentation: "docs/site/universal-contracts.md#appearance",
        tests: "design/packages/site/src/appearance/editor/appearanceEditor.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/appearance-surface.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "search-and-regex",
        label: "Search and anchored regex builders",
        implementation: "design/packages/site/src/search/builderPanel.ts",
        documentation: "docs/site/universal-contracts.md#search",
        tests: "design/packages/site/src/search/attachBuilder.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/settings-regex-builder.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "tabs",
        label: "Browser-style tabs and groups",
        implementation: "design/packages/site/src/tabs/index.ts",
        documentation: "docs/site/universal-contracts.md#tabs",
        tests: "design/packages/site/src/tabs/TabStrip.test.ts",
        builtInteraction: "design/packages/site/src/main.ts",
        capture: "docs/screenshots/tab-strip.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "locks",
        label: "Per-element and per-property toy locks",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#locks",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/lock-list-screen.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "authenticator",
        label: "Local standards-based authenticator",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#authenticator",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: "docs/screenshots/authenticator-screen.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "support-tickets",
        label: "Local Support Tickets recovery surface",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#support-tickets",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/support-tickets-screen.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "unlock-ladder",
        label: "Waiting-only unlock ladder",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#unlock-ladder",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: "docs/screenshots/super-confirm-armed.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "history",
        label: "Append-only local visitor history",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#history",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: "docs/screenshots/config-history.png",
        status: "implemented",
        freshness: "verified",
    },
    {
        id: "privacy-boundary",
        label: "Unauthenticated ordinary wording and local-only boundary",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#privacy",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: "docs/screenshots/support-tickets-screen.png",
        status: "implemented",
        freshness: "verified",
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
