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
    readonly capture: {
        readonly path: string;
        readonly sha256: string;
        readonly tuple: {
            readonly screen: string;
            readonly state: string;
            readonly theme: string;
            readonly viewport: string;
            readonly scale: string;
            readonly accessibility: string;
            readonly sourceCommit: string;
            readonly candidateCommit: string;
        };
    };
    readonly status: "implemented" | "pending";
    readonly freshness: "pending" | "verified";
}

function captureProof(path: string, sha256: string, screen: string, sourceCommit: string): SiteUniversalInventoryRow["capture"] {
    return { path, sha256, tuple: { screen, state: "baseline", theme: "dark", viewport: "1280x800", scale: "1x", accessibility: "keyboard-focus-and-aria", sourceCommit, candidateCommit: "09eb0d45eedd72b8c8c5e6022ab9bafbe7be5dd6" } };
}

export const SITE_UNIVERSAL_INVENTORY: readonly SiteUniversalInventoryRow[] = [
    {
        id: "language-and-tone",
        label: "Language modes and funny levels",
        implementation: "design/packages/site/src/i18n/I18n.ts",
        documentation: "docs/site/universal-contracts.md#language-and-tone",
        tests: "design/packages/site/src/i18n/I18n.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/settings-section-language-and-tone.png", "de5618dd7025b5bbc2932eed4c2924539939012b46409776b7e9083ff60fb5b9", "language and tone settings", "485e65987b21d6e453d16fb15a665ba750487756"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "appearance",
        label: "Every-element appearance editor",
        implementation: "design/packages/site/src/appearance/editor/appearanceEditor.ts",
        documentation: "docs/site/universal-contracts.md#appearance",
        tests: "design/packages/site/src/appearance/editor/appearanceEditor.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/appearance-surface.png", "37657e4b53cc40eb54e225b3fa8e48c8450cacbda5708b66be6443fbeb88e768", "appearance surface", "485e65987b21d6e453d16fb15a665ba750487756"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "search-and-regex",
        label: "Search and anchored regex builders",
        implementation: "design/packages/site/src/search/builderPanel.ts",
        documentation: "docs/site/universal-contracts.md#search",
        tests: "design/packages/site/src/search/attachBuilder.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/settings-regex-builder.png", "ff9de56305b3b5899a93e8ebe31e143d3519ee3ea428a215f405b2e0cdf74f12", "settings regex builder", "485e65987b21d6e453d16fb15a665ba750487756"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "tabs",
        label: "Browser-style tabs and groups",
        implementation: "design/packages/site/src/tabs/index.ts",
        documentation: "docs/site/universal-contracts.md#tabs",
        tests: "design/packages/site/src/tabs/TabStrip.test.ts",
        builtInteraction: "design/packages/site/src/main.ts",
        capture: captureProof("docs/screenshots/tab-strip.png", "7e0055c1706fb08ad1c81d18613c0456fcdd473fe20cb04131c38fbce9a35454", "browser tab strip", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "locks",
        label: "Per-element and per-property toy locks",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#locks",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/lock-list-screen.png", "c49c795b4889b5ba726da3010755be834fda4f6a99484d63dbe93bf3fa6445db", "lock list", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "authenticator",
        label: "Local standards-based authenticator",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#authenticator",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: captureProof("docs/screenshots/authenticator-screen.png", "c3404ec591c55088c1030b4cbc1534cfbe8fcd9fee52735eaf1e99df702558d2", "authenticator", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "support-tickets",
        label: "Local Support Tickets recovery surface",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#support-tickets",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/support-tickets-screen.png", "4a17291b6fb70868238e88b34f14f6ab1e07c761753cf9ae59288e805469d186", "support tickets", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "unlock-ladder",
        label: "Waiting-only unlock ladder",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#unlock-ladder",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: captureProof("docs/screenshots/super-confirm-armed.png", "e0416f31c01efd025a9a99de7518a1f2dc32635f1dfca6e2fff66e596b3625fd", "unlock ladder clock", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "history",
        label: "Append-only local visitor history",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#history",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.test.ts",
        capture: captureProof("docs/screenshots/config-history.png", "ade7c4d12ed7ad3535b8181a59016406248a92ac67a5433a04aa98c80edd150e", "local history", "485e65987b21d6e453d16fb15a665ba750487756"),
        status: "implemented",
        freshness: "pending",
    },
    {
        id: "privacy-boundary",
        label: "Unauthenticated ordinary wording and local-only boundary",
        implementation: "design/packages/site/src/universal/siteContracts.ts",
        documentation: "docs/site/universal-contracts.md#privacy",
        tests: "design/packages/site/src/universal/siteContracts.test.ts",
        builtInteraction: "design/packages/site/src/universal/siteContracts.mount.test.ts",
        capture: captureProof("docs/screenshots/support-tickets-screen.png", "4a17291b6fb70868238e88b34f14f6ab1e07c761753cf9ae59288e805469d186", "privacy boundary", "47bad3bc20aac077a972035602095ce3d5eceb42"),
        status: "implemented",
        freshness: "pending",
    },
];

/** Independent IDs required from the global Pages inventory. Keep this list separate from the coverage rows. */
export const REQUIRED_UNIVERSAL_SITE_IDS = [
    "site-universal-contracts",
    "site-universal-appearance",
    "site-universal-locks",
    "site-universal-authenticator",
    "site-universal-support-tickets",
    "site-universal-unlock-ladder",
    "site-universal-evidence",
] as const;

export function assertSiteUniversalInventory(
    inventory: readonly SiteUniversalInventoryRow[] = SITE_UNIVERSAL_INVENTORY,
    options: { readonly allowPending?: boolean } = {},
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
            if (field === "capture") continue;
            if (typeof value !== "string" || value.trim() === "")
                throw new Error(`Site universal inventory ${row.id} has an empty ${field}`);
        }
        if (!/^[a-f0-9]{64}$/.test(row.capture.sha256) || row.capture.path.trim() === "") throw new Error(`Site universal inventory ${row.id} has invalid capture proof`);
        for (const value of Object.values(row.capture.tuple)) if (value.trim() === "") throw new Error(`Site universal inventory ${row.id} has an incomplete capture tuple`);
        if (!/^[a-f0-9]{40}$/.test(row.capture.tuple.sourceCommit) || !/^[a-f0-9]{40}$/.test(row.capture.tuple.candidateCommit)) throw new Error(`Site universal inventory ${row.id} has an invalid evidence commit`);
        if (row.status !== "implemented") throw new Error(`Site universal inventory row is pending: ${row.id}`);
        if (row.freshness !== "verified" && row.freshness !== "pending") throw new Error(`Site universal inventory row has stale evidence: ${row.id}`);
        if (row.freshness === "pending" && options.allowPending === false) throw new Error(`Site universal inventory evidence is pending: ${row.id}`);
    }
    for (const expected of SITE_UNIVERSAL_INVENTORY) {
        if (!ids.has(expected.id)) throw new Error(`Missing site universal inventory row: ${expected.id}`);
    }
}

/** Strict evidence check. Existing captures are retained for traceability but are not current proof. */
export function assertSiteEvidenceReady(
    inventory: readonly SiteUniversalInventoryRow[] = SITE_UNIVERSAL_INVENTORY,
    expectedCandidateCommit?: string,
): void {
    assertSiteUniversalInventory(inventory, { allowPending: false });
    if (expectedCandidateCommit !== undefined && !/^[a-f0-9]{40}$/.test(expectedCandidateCommit))
        throw new Error("Site universal evidence requires an exact candidate commit SHA.");
    if (expectedCandidateCommit !== undefined) {
        for (const row of inventory) {
            if (row.capture.tuple.candidateCommit !== expectedCandidateCommit)
                throw new Error(`Site universal evidence is bound to a different candidate commit: ${row.id}`);
        }
    }
}

/** Cross-check the universal additions against every pre-existing Pages contract row. */
export function assertGlobalPagesCrossCheck(
    coverage: readonly { readonly id: string }[] = PAGES_FEATURE_COVERAGE,
): void {
    const available = new Set(coverage.map((row) => row.id));
    const missing = REQUIRED_UNIVERSAL_SITE_IDS.filter((id) => !available.has(id));
    if (missing.length > 0) throw new Error(`Pages inventory rows missing from site cross-check: ${missing.join(", ")}`);
}
import { PAGES_FEATURE_COVERAGE } from "./globalFeatureCoverage.js";
