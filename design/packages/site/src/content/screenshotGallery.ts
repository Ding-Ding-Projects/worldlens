/**
 * The committed screenshot gallery as structured, searchable records.
 *
 * `captures.ts` carries the hand-written showcase records. The screenshot harness also
 * commits a manifest describing every real capture from its latest proof run. This module
 * joins both sources without inventing a surface: a manifest record is shown only when its
 * PNG resolves, and a hand-written record outside the manifest keeps its own explicit copy.
 */

import { captureProvenance, repoCaptures } from "./captures.js";
import type { RepoCapture } from "./captures.js";

const imageModules = import.meta.glob("../../../../../docs/screenshots/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const manifestModules = import.meta.glob("../../../../../docs/screenshots/manifest.json", {
    eager: true,
    import: "default",
}) as Record<string, unknown>;

const evidenceInventoryModules = import.meta.glob(
    "../../../../../docs/screenshots/evidence-inventory.json",
    {
        eager: true,
        import: "default",
    },
) as Record<string, unknown>;

export const GALLERY_CATEGORY_IDS = [
    "getting-started",
    "shell-navigation",
    "settings-appearance",
    "worlds-projects",
    "configuration",
    "delivery-runtime",
    "kid-mode",
    "site-evidence",
    "installed-builds",
    "rendered-maps",
    "issue-baselines",
    "historical-retired",
    "other",
] as const;

export type GalleryCategoryId = (typeof GALLERY_CATEGORY_IDS)[number];

export interface GalleryCategoryDefinition {
    readonly id: GalleryCategoryId;
    readonly label: string;
    readonly labelYue: string;
    readonly description: string;
    readonly descriptionYue: string;
    readonly prefixes: readonly string[];
}

export const GALLERY_CATEGORIES: readonly GalleryCategoryDefinition[] = [
    {
        id: "getting-started",
        label: "Getting started",
        labelYue: "開始使用",
        description: "First run, Home, compact Home layouts, and the first runtime choice.",
        descriptionYue: "首次啟動、主頁、窄版主頁，同第一個執行位置選擇。",
        prefixes: ["firstrun-", "home-", "redesign-home-", "eula-", "run-location"],
    },
    {
        id: "shell-navigation",
        label: "Shell and navigation",
        labelYue: "外殼同導覽",
        description: "Full windows, title bars, navigation, menus, tabs, palettes, and notices.",
        descriptionYue: "完整視窗、標題列、導覽、選單、分頁、指令面板同通知。",
        prefixes: [
            "shell-",
            "installed-app-",
            "titlebar-",
            "chrome-",
            "menu-",
            "tab-",
            "palette-",
            "browser-",
            "notifications-",
            "lowlevel-adult-",
            "theme-",
            "dimsum-",
        ],
    },
    {
        id: "settings-appearance",
        label: "Settings and appearance",
        labelYue: "設定同外觀",
        description:
            "Settings, appearance tools, locks, support, authentication, and confirmation states.",
        descriptionYue: "設定、外觀工具、鎖定、支援、驗證同確認狀態。",
        prefixes: [
            "settings-",
            "appearance-",
            "infinite-",
            "lock-",
            "support-",
            "authenticator-",
            "super-confirm-",
        ],
    },
    {
        id: "worlds-projects",
        label: "Worlds and projects",
        labelYue: "世界同專案",
        description: "Project, profile, backup, import, structure, and map-creation surfaces.",
        descriptionYue: "專案、設定檔、備份、匯入、結構同建立地圖畫面。",
        prefixes: ["wizard-", "projects-", "profiles-", "drop-", "structures-", "backups-"],
    },
    {
        id: "configuration",
        label: "Configuration editor",
        labelYue: "設定檔編輯器",
        description: "The complete options editor, its tabs, search, history, and guarded actions.",
        descriptionYue: "完整選項編輯器、各分頁、搜尋、歷史同受確認保護嘅操作。",
        prefixes: ["config-"],
    },
    {
        id: "delivery-runtime",
        label: "Delivery and runtime",
        labelYue: "發佈同執行環境",
        description:
            "Publishing, continuous integration, local model, and large-file runtime surfaces.",
        descriptionYue: "發佈、持續整合、本機模型同大型檔案執行畫面。",
        prefixes: ["ci-", "pages-", "ollama-", "chunker-", "lowlevel-ci-"],
    },
    {
        id: "kid-mode",
        label: "Kid Mode",
        labelYue: "兒童模式",
        description:
            "Kid Mode catalogues, settings, progress, stickers, narrow layouts, and scales.",
        descriptionYue: "兒童模式目錄、設定、進度、貼紙、窄版畫面同顯示比例。",
        prefixes: ["kid-", "lowlevel-kid-"],
    },
    {
        id: "site-evidence",
        label: "Website evidence",
        labelYue: "網站證據",
        description:
            "Compact site proofs, walkthrough frames, tab layouts, and live Pages captures.",
        descriptionYue: "窄版網站證據、操作示範畫面、分頁版面同真實 Pages 截圖。",
        prefixes: [],
    },
    {
        id: "installed-builds",
        label: "Installed builds",
        labelYue: "已安裝版本",
        description:
            "Real installed or packaged application captures driven outside the component test path.",
        descriptionYue: "喺元件測試路徑以外，實際安裝或封裝版本嘅真實截圖。",
        prefixes: [],
    },
    {
        id: "rendered-maps",
        label: "Rendered maps",
        labelYue: "已渲染地圖",
        description:
            "Captures backed by a real rendered world and its recorded rendering provenance.",
        descriptionYue: "由真實渲染世界同已記錄渲染來源支持嘅截圖。",
        prefixes: [],
    },
    {
        id: "issue-baselines",
        label: "Issue baselines",
        labelYue: "問題基準",
        description:
            "Real before-and-after or focused evidence retained for individual reported defects.",
        descriptionYue: "為個別已報告問題保留嘅真實前後或聚焦證據。",
        prefixes: [],
    },
    {
        id: "historical-retired",
        label: "Historical and retired",
        labelYue: "歷史同已退役",
        description:
            "Evidence kept for audit value and labelled so it is not mistaken for the current interface.",
        descriptionYue: "為審核保留嘅證據，清楚標示避免當成目前介面。",
        prefixes: [],
    },
    {
        id: "other",
        label: "Other real captures",
        labelYue: "其他真實截圖",
        description: "Manifest-backed captures that do not belong to one of the named sets above.",
        descriptionYue: "有 manifest 記錄，但唔屬於上面任何一組嘅真實截圖。",
        prefixes: [],
    },
] as const;

export const GALLERY_SEARCH_FIELD_NAMES = [
    "category",
    "title",
    "description",
    "state",
    "theme",
    "viewport",
    "commit",
] as const;

export type GallerySearchField = (typeof GALLERY_SEARCH_FIELD_NAMES)[number];

export interface GalleryCapture {
    readonly file: string;
    readonly url: string;
    readonly title: string;
    readonly description: string;
    readonly state: string;
    readonly alt: string;
    readonly categoryId: GalleryCategoryId;
    readonly theme: string;
    readonly viewport: string;
    readonly sourceCommit: string;
    readonly sourceRun: string;
    readonly capturedAt: string;
    /** A recorded shape when the manifest or hand-written record provides one. */
    readonly aspectRatio: string | null;
}

interface ManifestCaptureRecord {
    readonly file: string;
    readonly surface: string;
    readonly caption: string;
    readonly capturedAt: string;
}

interface EvidenceRecord {
    readonly file: string;
    readonly groupId: string;
    readonly authority: string;
    readonly reproducibility: string;
    readonly proofNote: string;
}

function imageUrl(file: string): string | null {
    for (const [path, url] of Object.entries(imageModules)) {
        if (path.endsWith(`/${file}`)) return url;
    }
    return null;
}

function stringField(record: Readonly<Record<string, unknown>>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function manifestCaptures(): readonly ManifestCaptureRecord[] {
    const manifest = Object.values(manifestModules)[0];
    if (typeof manifest !== "object" || manifest === null) return [];
    const values = (manifest as Readonly<Record<string, unknown>>)["captures"];
    if (!Array.isArray(values)) return [];

    const captures: ManifestCaptureRecord[] = [];
    for (const value of values) {
        if (typeof value !== "object" || value === null) continue;
        const record = value as Readonly<Record<string, unknown>>;
        if (record["kind"] !== "capture") continue;
        const file = stringField(record, "file");
        const surface = stringField(record, "surface");
        const caption = stringField(record, "caption");
        const capturedAt = stringField(record, "capturedAt");
        if (file === null || surface === null || caption === null || capturedAt === null) continue;
        if (!file.toLowerCase().endsWith(".png")) continue;
        captures.push({ file, surface, caption, capturedAt });
    }
    return captures;
}

function evidenceRecords(): readonly EvidenceRecord[] {
    const inventory = Object.values(evidenceInventoryModules)[0];
    if (typeof inventory !== "object" || inventory === null) return [];
    const groups = (inventory as Readonly<Record<string, unknown>>)["groups"];
    if (!Array.isArray(groups)) return [];

    const records: EvidenceRecord[] = [];
    for (const value of groups) {
        if (typeof value !== "object" || value === null) continue;
        const group = value as Readonly<Record<string, unknown>>;
        const groupId = stringField(group, "id");
        const authority = stringField(group, "authority");
        const reproducibility = stringField(group, "reproducibility");
        const proofNote =
            stringField(group, "uiSourceDigestNote") ?? "No additional proof note is recorded.";
        const targets = group["targets"];
        if (
            groupId === null ||
            authority === null ||
            reproducibility === null ||
            !Array.isArray(targets)
        ) {
            continue;
        }
        for (const target of targets) {
            if (typeof target !== "string") continue;
            const match = /^docs\/screenshots\/([^/]+\.png)$/i.exec(target);
            if (match === null) continue;
            records.push({
                file: match[1] as string,
                groupId,
                authority,
                reproducibility,
                proofNote,
            });
        }
    }
    return records;
}

function humanTitle(file: string): string {
    const words = file
        .replace(/\.png$/i, "")
        .replaceAll("_", ".")
        .split("-")
        .filter((word) => word.length > 0);
    const title = words.join(" ");
    return title.length === 0 ? file : `${title[0]?.toUpperCase() ?? ""}${title.slice(1)}`;
}

function categoryFromEvidenceGroup(groupId: string | undefined): GalleryCategoryId | null {
    switch (groupId) {
        case "site-compact-proof":
        case "site-walkthrough-media":
        case "live-pages":
        case "site-tabs-compact-proof":
            return "site-evidence";
        case "installed-app-cdp":
        case "profile-migration-packaged":
            return "installed-builds";
        case "app-playwright-map-dependent":
        case "consent-render":
            return "rendered-maps";
        case "issue-baselines":
            return "issue-baselines";
        case "historical-site-baseline":
        case "retired-app-surfaces":
            return "historical-retired";
        default:
            return null;
    }
}

export function galleryCategory(file: string, evidenceGroupId?: string): GalleryCategoryDefinition {
    const evidenceCategoryId = categoryFromEvidenceGroup(evidenceGroupId);
    if (evidenceCategoryId !== null) {
        return GALLERY_CATEGORIES.find((category) => category.id === evidenceCategoryId)!;
    }
    const normalized = file.toLowerCase();
    return (
        GALLERY_CATEGORIES.find(
            (category) =>
                category.id !== "other" &&
                category.prefixes.some((prefix) => normalized.startsWith(prefix)),
        ) ?? GALLERY_CATEGORIES[GALLERY_CATEGORIES.length - 1]!
    );
}

interface ViewportInfo {
    readonly label: string;
    readonly aspectRatio: string | null;
}

function viewportInfo(...values: readonly string[]): ViewportInfo {
    const haystack = values.join(" ");
    const match = /\b(\d{3,4})\s*(?:x|×|by)\s*(\d{3,4})\b/i.exec(haystack);
    if (match === null) return { label: "Not recorded", aspectRatio: null };
    const width = Number.parseInt(match[1] ?? "", 10);
    const height = Number.parseInt(match[2] ?? "", 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return { label: "Not recorded", aspectRatio: null };
    }
    return { label: `${width} × ${height}`, aspectRatio: `${width} / ${height}` };
}

function recordedTheme(...values: readonly string[]): string {
    const haystack = values.join(" ").toLowerCase();
    const hasDark = /\bdark\b/.test(haystack);
    const hasLight = /\blight\b/.test(haystack);
    const hasContrast = /\b(?:high[- ]?)?contrast\b/.test(haystack);
    if (hasContrast) return "High contrast";
    if (hasDark && hasLight) return "Light and dark";
    if (hasDark) return "Dark";
    if (hasLight) return "Light";
    return "Not recorded";
}

function evidenceState(evidence: EvidenceRecord | undefined): string {
    if (evidence === undefined) return "No evidence-group metadata is recorded for this capture.";
    return [
        `Evidence group: ${evidence.groupId}.`,
        `Reproducibility: ${evidence.reproducibility}.`,
        `Authority: ${evidence.authority}.`,
        evidence.proofNote,
    ].join(" ");
}

function fromManifest(
    record: ManifestCaptureRecord,
    known: RepoCapture | undefined,
    evidence: EvidenceRecord | undefined,
): GalleryCapture | null {
    const url = imageUrl(record.file);
    if (url === null) return null;
    const category = galleryCategory(record.file, evidence?.groupId);
    const viewport = viewportInfo(record.file, record.surface, record.caption);
    return {
        file: record.file,
        url,
        title: known?.title ?? humanTitle(record.file),
        description: record.surface,
        state: `${record.caption} ${evidenceState(evidence)}`,
        alt: known?.alt ?? record.surface,
        categoryId: category.id,
        theme: recordedTheme(record.file, record.surface, record.caption),
        viewport: viewport.label,
        sourceCommit: captureProvenance.commit,
        sourceRun:
            evidence === undefined
                ? captureProvenance.run
                : `${captureProvenance.run}; ${evidence.authority}; ${evidence.proofNote}`,
        capturedAt: record.capturedAt,
        aspectRatio: known?.aspectRatio ?? viewport.aspectRatio,
    };
}

function fromEvidence(
    evidence: EvidenceRecord,
    known: RepoCapture | undefined,
    manifest: ManifestCaptureRecord | undefined,
): GalleryCapture | null {
    if (manifest !== undefined) return fromManifest(manifest, known, evidence);
    const url = imageUrl(evidence.file);
    if (url === null) return null;
    const category = galleryCategory(evidence.file, evidence.groupId);
    const title = known?.title ?? humanTitle(evidence.file);
    const viewport = viewportInfo(evidence.file, known?.configuration ?? "", known?.alt ?? "");
    return {
        file: evidence.file,
        url,
        title,
        description:
            known?.alt ??
            `${title}, a real capture retained in the ${category.label} evidence category.`,
        state: evidenceState(evidence),
        alt:
            known?.alt ??
            `${title}. Real capture recorded by ${evidence.authority} in the ${category.label} evidence category.`,
        categoryId: category.id,
        theme: recordedTheme(evidence.file, known?.configuration ?? "", known?.alt ?? ""),
        viewport: viewport.label,
        sourceCommit: "See the committed evidence record",
        sourceRun: `${evidence.authority}; ${evidence.proofNote}`,
        capturedAt: "Not recorded for this individual capture",
        aspectRatio: known?.aspectRatio ?? viewport.aspectRatio,
    };
}

function fromHandWritten(record: RepoCapture): GalleryCapture {
    return {
        file: record.file,
        url: record.url,
        title: record.title,
        description: record.alt,
        state: record.configuration,
        alt: record.alt,
        categoryId: galleryCategory(record.file).id,
        theme: recordedTheme(record.file, record.configuration, record.alt),
        viewport: viewportInfo(record.file, record.configuration).label,
        sourceCommit: captureProvenance.commit,
        sourceRun: captureProvenance.run,
        capturedAt: "Not recorded for this individual capture",
        aspectRatio: record.aspectRatio,
    };
}

const handWrittenByFile = new Map(repoCaptures.map((capture) => [capture.file, capture]));
const manifestByFile = new Map(manifestCaptures().map((capture) => [capture.file, capture]));
const seenFiles = new Set<string>();

const evidenceGallery = evidenceRecords()
    .map((evidence) => {
        seenFiles.add(evidence.file);
        return fromEvidence(
            evidence,
            handWrittenByFile.get(evidence.file),
            manifestByFile.get(evidence.file),
        );
    })
    .filter((capture): capture is GalleryCapture => capture !== null);

const remainingManifestGallery = [...manifestByFile.values()]
    .filter((record) => !seenFiles.has(record.file))
    .map((record) => {
        seenFiles.add(record.file);
        return fromManifest(record, handWrittenByFile.get(record.file), undefined);
    })
    .filter((capture): capture is GalleryCapture => capture !== null);

/**
 * Every real committed capture the site can prove and resolve, in manifest order first.
 *
 * The final hand-written-only records preserve genuine older captures whose current manifest
 * does not repeat them. Duplicate filenames collapse to the manifest entry rather than rendering
 * the same image twice.
 */
export const committedCaptureGallery: readonly GalleryCapture[] = [
    ...evidenceGallery,
    ...remainingManifestGallery,
    ...repoCaptures.filter((capture) => !seenFiles.has(capture.file)).map(fromHandWritten),
];

export function galleryCategorySearchText(capture: GalleryCapture): string {
    const category = GALLERY_CATEGORIES.find((candidate) => candidate.id === capture.categoryId);
    if (category === undefined) return capture.categoryId;
    return [
        category.id,
        category.label,
        category.labelYue,
        category.description,
        category.descriptionYue,
    ].join(" ");
}

export function gallerySearchValue(capture: GalleryCapture, field: GallerySearchField): string {
    switch (field) {
        case "category":
            return galleryCategorySearchText(capture);
        case "title":
            return capture.title;
        case "description":
            return capture.description;
        case "state":
            return capture.state;
        case "theme":
            return capture.theme;
        case "viewport":
            return capture.viewport;
        case "commit":
            return `${capture.sourceCommit} ${capture.sourceRun}`;
    }
}

export function filterGalleryByCategory(
    captures: readonly GalleryCapture[],
    categoryId: GalleryCategoryId | "all",
): readonly GalleryCapture[] {
    return categoryId === "all"
        ? captures
        : captures.filter((capture) => capture.categoryId === categoryId);
}

export interface GalleryCaptureGroup {
    readonly category: GalleryCategoryDefinition;
    readonly captures: readonly GalleryCapture[];
}

export function groupGalleryCaptures(
    captures: readonly GalleryCapture[],
): readonly GalleryCaptureGroup[] {
    const groups: GalleryCaptureGroup[] = [];
    for (const category of GALLERY_CATEGORIES) {
        const matching = captures.filter((capture) => capture.categoryId === category.id);
        if (matching.length > 0) groups.push({ category, captures: matching });
    }
    return groups;
}

export function galleryCategoryCounts(
    captures: readonly GalleryCapture[],
): ReadonlyMap<GalleryCategoryId, number> {
    const counts = new Map<GalleryCategoryId, number>();
    for (const categoryId of GALLERY_CATEGORY_IDS) counts.set(categoryId, 0);
    for (const capture of captures)
        counts.set(capture.categoryId, (counts.get(capture.categoryId) ?? 0) + 1);
    return counts;
}
