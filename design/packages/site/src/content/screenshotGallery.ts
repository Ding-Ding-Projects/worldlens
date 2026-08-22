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
import galleryCategoryRegistry from "./gallery-categories.json";

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

type GalleryCategoryRegistryEntry = {
    readonly id: string;
    readonly label: string;
    readonly labelYue: string;
    readonly description: string;
    readonly descriptionYue: string;
    readonly prefixes: readonly string[];
    readonly evidenceGroups?: readonly string[];
};

const CATEGORY_REGISTRY = galleryCategoryRegistry as readonly GalleryCategoryRegistryEntry[];

/**
 * The category ids, written out rather than derived from the JSON.
 *
 * A JSON import types every string as `string`, so deriving the union from the file
 * collapsed `GalleryCategoryId` to plain `string`. That silently removed the type's whole
 * value: the label and description records stopped being checked for completeness, and
 * every lookup into them became `| undefined` under noUncheckedIndexedAccess.
 *
 * Written here it is a real union again, and the check below fails the build when the
 * JSON and this list drift apart - which is the pairing a rule-shaped guard cannot give
 * you, because a rule about entries that exist never notices one that disappeared.
 */
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

/** Fails the build when the registry file and the union above disagree, in either direction. */
const REGISTRY_IDS = CATEGORY_REGISTRY.map((category) => category.id);
const MISSING = GALLERY_CATEGORY_IDS.filter((id) => !REGISTRY_IDS.includes(id));
const UNKNOWN = REGISTRY_IDS.filter((id) => !(GALLERY_CATEGORY_IDS as readonly string[]).includes(id));
if (MISSING.length > 0 || UNKNOWN.length > 0) {
    throw new Error(
        `The gallery category registry does not match GALLERY_CATEGORY_IDS. ` +
            `Missing from the registry: ${MISSING.join(", ") || "none"}. ` +
            `Not in the union: ${UNKNOWN.join(", ") || "none"}.`,
    );
}

export type GalleryCategoryDefinition = GalleryCategoryRegistryEntry & {
    readonly id: GalleryCategoryId;
};

export const GALLERY_CATEGORIES: readonly GalleryCategoryDefinition[] = CATEGORY_REGISTRY as readonly GalleryCategoryDefinition[];

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
    readonly sourceCommit: string | null;
}

/**
 * The gallery is a view of the evidence ledger, not a second hand-written list.  Keep the
 * ledger totals available to the Pages surface so a missing image or an unpinned capture run
 * is visible to readers instead of being mistaken for a complete current gallery.
 */
export interface GalleryEvidenceSummary {
    readonly inventoryVersion: string;
    readonly inventoryTargetCount: number;
    readonly galleryTargetCount: number;
    readonly resolvedGalleryTargetCount: number;
    readonly missingGalleryTargets: readonly string[];
    readonly inventoryGroupCount: number;
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
        const sourceCommits = group["sourceCommits"];
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
            const sourceCommit =
                typeof sourceCommits === "object" && sourceCommits !== null
                    ? stringField(sourceCommits as Readonly<Record<string, unknown>>, target)
                    : null;
            records.push({
                file: match[1] as string,
                groupId,
                authority,
                reproducibility,
                proofNote,
                sourceCommit,
            });
        }
    }
    return records;
}

function galleryEvidenceSummary(): GalleryEvidenceSummary {
    const inventory = Object.values(evidenceInventoryModules)[0];
    if (typeof inventory !== "object" || inventory === null) {
        return {
            inventoryVersion: "not recorded",
            inventoryTargetCount: 0,
            galleryTargetCount: 0,
            resolvedGalleryTargetCount: 0,
            missingGalleryTargets: [],
            inventoryGroupCount: 0,
        };
    }

    const record = inventory as Readonly<Record<string, unknown>>;
    const groups = Array.isArray(record["groups"]) ? record["groups"] : [];
    const targets = new Set<string>();
    for (const value of groups) {
        if (typeof value !== "object" || value === null) continue;
        const groupTargets = (value as Readonly<Record<string, unknown>>)["targets"];
        if (!Array.isArray(groupTargets)) continue;
        for (const target of groupTargets) {
            if (typeof target !== "string") continue;
            const match = /^docs\/screenshots\/([^/]+\.png)$/i.exec(target);
            if (match !== null) targets.add(match[1] as string);
        }
    }

    const missingGalleryTargets = [...targets]
        .filter((file) => imageUrl(file) === null)
        .sort((left, right) => left.localeCompare(right));
    const version = record["version"];
    const expected = record["expectedTargetCount"];
    return {
        inventoryVersion:
            typeof version === "string" || typeof version === "number"
                ? String(version)
                : "not recorded",
        inventoryTargetCount: typeof expected === "number" ? expected : targets.size,
        galleryTargetCount: targets.size,
        resolvedGalleryTargetCount: targets.size - missingGalleryTargets.length,
        missingGalleryTargets,
        inventoryGroupCount: groups.length,
    };
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
    if (groupId === undefined) return null;
    return (
        CATEGORY_REGISTRY.find((category) => category.evidenceGroups?.includes(groupId))?.id as
            | GalleryCategoryId
            | undefined
    ) ?? null;
}

export function galleryCategory(file: string, evidenceGroupId?: string): GalleryCategoryDefinition {
    const evidenceCategoryId = categoryFromEvidenceGroup(evidenceGroupId);
    if (evidenceCategoryId !== null) {
        return GALLERY_CATEGORIES.find((category) => category.id === evidenceCategoryId)!;
    }
    const normalized = file.toLowerCase();
    const registryCategory = CATEGORY_REGISTRY.find((category) =>
        category.prefixes.some((prefix) => normalized.startsWith(prefix)),
    );
    if (registryCategory !== undefined) {
        return GALLERY_CATEGORIES.find((category) => category.id === registryCategory.id)!;
    }
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

function sourceCommitFor(evidence: EvidenceRecord | undefined): string {
    if (evidence?.sourceCommit !== null && evidence?.sourceCommit !== undefined) {
        return evidence.sourceCommit;
    }
    return /^[0-9a-f]{40}$/i.test(captureProvenance.commit)
        ? captureProvenance.commit
        : "Not pinned to a candidate commit";
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
        sourceCommit: sourceCommitFor(evidence),
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
        sourceCommit: sourceCommitFor(evidence),
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
        sourceCommit: sourceCommitFor(undefined),
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

/** Current evidence facts shown beside the searchable gallery. */
export const committedGalleryEvidence: GalleryEvidenceSummary = galleryEvidenceSummary();

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
