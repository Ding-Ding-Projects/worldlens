/** Explicit design inventory, not a production capability or capture receipt. */
export const companionStates = [
    {
        surface: "shared",
        id: "setup-source",
        purpose:
            "First-run source selection or bundled-content verification; required check gates Next.",
    },
    {
        surface: "shared",
        id: "setup-preferences",
        purpose: "Optional real accessibility/language preferences, Back/Next and explicit Skip.",
    },
    {
        surface: "shared",
        id: "setup-review",
        purpose:
            "Review actual check results and saved choices; open productive workspace only after required success.",
    },
    {
        surface: "shared",
        id: "setup-resume",
        purpose:
            "Restore saved wizard step, revalidate changed source and continue without losing choices.",
    },
    {
        surface: "shared",
        id: "new-tab",
        purpose: "Complete searchable destination catalogue preserving all existing tab drafts.",
    },
    {
        surface: "build",
        id: "cancel-confirm",
        purpose:
            "Explicit owned-process cancellation with Return as safe default and no unrelated termination.",
    },
    {
        surface: "guide",
        id: "guide-navigation",
        purpose: "Internal contents, article/wiki routes, related content, back and forward.",
    },
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

/** Complete companion navigation catalogue; productive application destinations are separate. */
export const companionDestinations = [
    { surface: "build", id: "workbench", en: "Build workbench", yue: "建置工作區" },
    { surface: "build", id: "runs", en: "Runs and recovery", yue: "執行同恢復" },
    { surface: "build", id: "artifacts", en: "Artifacts and receipts", yue: "產物同驗證記錄" },
    { surface: "build", id: "diagnostics", en: "Diagnostics", yue: "診斷" },
    { surface: "guide", id: "home", en: "Continue learning", yue: "繼續學習" },
    { surface: "guide", id: "categories", en: "Task categories", yue: "任務分類" },
    { surface: "guide", id: "articles", en: "All articles", yue: "全部文章" },
    { surface: "guide", id: "wiki", en: "Complete wiki", yue: "完整 wiki" },
    { surface: "guide", id: "search-results", en: "Search documentation", yue: "搜尋文件" },
    { surface: "guide", id: "walkthrough", en: "Guided walkthroughs", yue: "引導教學" },
    { surface: "shared", id: "source", en: "Source and version", yue: "來源同版本" },
    { surface: "shared", id: "history", en: "History", yue: "歷史" },
    { surface: "shared", id: "notifications", en: "Notifications", yue: "通知" },
    { surface: "shared", id: "settings", en: "Settings", yue: "設定" },
    { surface: "shared", id: "accessibility", en: "Accessibility tools", yue: "無障礙工具" },
    { surface: "shared", id: "setup-source", en: "Workspace setup", yue: "工作區設定精靈" },
] as const;
