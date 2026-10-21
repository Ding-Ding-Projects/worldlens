/** Explicit design inventory, not a production capability or capture receipt. */
export const companionStates = [
    {
        surface: "build",
        id: "choose-source",
        purpose:
            "Browse and validate a checkout; no build action is enabled without valid scripts.",
    },
    {
        surface: "build",
        id: "ready",
        purpose: "Show source identity, action controls and installer ordinal validation.",
    },
    {
        surface: "build",
        id: "acquiring",
        purpose:
            "Observe trusted dependency acquisition, bytes only when reported, native consent boundary.",
    },
    {
        surface: "build",
        id: "building",
        purpose: "Observe workspace phases and live bounded diagnostics; Cancel remains available.",
    },
    {
        surface: "build",
        id: "verifying",
        purpose: "Validate receipt and exact artifacts; process exit alone cannot mark success.",
    },
    {
        surface: "build",
        id: "running",
        purpose:
            "Build verified and child application running; distinguish launch from process completion.",
    },
    {
        surface: "build",
        id: "installer",
        purpose: "Observe candidate-bound package production and unsigned-artifact verification.",
    },
    {
        surface: "build",
        id: "succeeded",
        purpose: "Show verified outputs, exit zero, source identity and exportable receipt.",
    },
    {
        surface: "build",
        id: "failed",
        purpose: "Persistent failure, actual exit status, last phase, recovery and retry.",
    },
    {
        surface: "build",
        id: "cancelling",
        purpose: "Cancellation requested; keep pending until owned process tree has terminated.",
    },
    {
        surface: "build",
        id: "cancelled",
        purpose: "Non-successful terminal result; preserve ineligible partial outputs.",
    },
    {
        surface: "build",
        id: "interrupted",
        purpose: "Recover prior run after restart without inventing successful completion.",
    },
    {
        surface: "build",
        id: "consent-required",
        purpose:
            "Native consent or unavailable prerequisite; explicit incomplete result and safe recovery.",
    },
    {
        surface: "guide",
        id: "home",
        purpose: "Continue real tasks, recent articles, categories and offline source version.",
    },
    {
        surface: "guide",
        id: "category",
        purpose: "Browse all indexed articles within the selected task category.",
    },
    {
        surface: "guide",
        id: "article",
        purpose:
            "Complete sanitized source article with anchors, related articles and optional source link.",
    },
    {
        surface: "guide",
        id: "wiki",
        purpose:
            "Complete pinned wiki content and local asset resolution, including sidebar navigation.",
    },
    {
        surface: "guide",
        id: "search-results",
        purpose: "Full-text results with keyboard navigation and local regex builder.",
    },
    {
        surface: "guide",
        id: "search-empty",
        purpose: "No-match state retaining query, clear and filter-recovery controls.",
    },
    {
        surface: "guide",
        id: "content-unavailable",
        purpose:
            "Missing/corrupt source or asset, explicit incomplete inventory, no fabricated article.",
    },
    {
        surface: "guide",
        id: "walkthrough",
        purpose:
            "Visitor-owned task progress and honest demonstrations; no implied live execution.",
    },
    {
        surface: "shared",
        id: "settings",
        purpose: "Tabbed complete shared controls with local search and contextual guidance.",
    },
    {
        surface: "shared",
        id: "accessibility",
        purpose: "Persistent accessibility entry, keyboard/focus/reading controls and reset.",
    },
    {
        surface: "shared",
        id: "notifications",
        purpose: "Persistent error history, filter, dismissal and privacy-safe export.",
    },
    {
        surface: "shared",
        id: "palette",
        purpose: "Search and focus exact actions/settings/articles with bounded/full-window modes.",
    },
    {
        surface: "shared",
        id: "restricted",
        purpose:
            "Shared renamed restriction control; suppressed capabilities absent from navigation/search.",
    },
    {
        surface: "shared",
        id: "close-active-run",
        purpose:
            "Build only: Return, Keep running or Cancel and close; never silently terminate work.",
    },
] as const;

export const referenceMatrix = {
    source: "98fb083e",
    wikiSource: "0b66c19306add3a090fc70ad08f1d785b49794f7",
    viewports: [
        { width: 1280, height: 800 },
        { width: 640, height: 480 },
    ],
    themes: ["light", "dark"],
    languages: ["en", "yue", "both"],
    scales: [100, 125, 150, 200],
    motion: "reduced",
    time: "2026-10-21T00:00:00Z",
    referenceComponent: "references/CompanionReference.vue",
    productionRoute: null,
    evidence: null,
    reviewVerdict: "pending-independent-review",
} as const;
