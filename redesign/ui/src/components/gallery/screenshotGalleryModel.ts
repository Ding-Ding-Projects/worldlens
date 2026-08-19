import { createSettingMatcher } from "../config/regexEngine.js";

/** The library is intentionally empty until the user captures or imports a record. */
export const SCREENSHOT_EVIDENCE_ROOTS = [] as const;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_ASSET_PIXELS = 100_000_000;
const MAX_RECORDS = 5_000;
const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 64;
const MAX_TEXT_LENGTH = 2_000;
const MAX_PATH_LENGTH = 512;

export type GalleryAction = "captured" | "imported" | "updated" | "copied" | "deleted" | "restored";

export interface ScreenshotDimensions {
    readonly width: number;
    readonly height: number;
    readonly scale?: number;
}

export interface ScreenshotCamera {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
    readonly yaw?: number;
    readonly pitch?: number;
}

/** Provenance is deliberately mandatory: a gallery cannot seed a fake screenshot. */
export interface ScreenshotProvenance {
    readonly kind: "user-capture" | "user-import";
    readonly captureId: string;
    readonly commit: string;
    readonly appVersion: string;
    readonly capturedAt: string;
}

export interface ScreenshotMetadata {
    readonly mapId: string;
    readonly projectId: string;
    readonly coordinates: ScreenshotCamera;
    readonly camera: ScreenshotCamera;
    readonly timestamp: string;
    readonly dimensions: ScreenshotDimensions;
    readonly version: string;
    readonly provenance: ScreenshotProvenance;
}

export interface ScreenshotRecord {
    readonly id: string;
    readonly name: string;
    readonly assetPath: string;
    readonly tags: readonly string[];
    readonly notes: string;
    readonly metadata: ScreenshotMetadata;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface GalleryRevision {
    readonly id: string;
    readonly action: GalleryAction;
    readonly screenshotId: string;
    readonly at: string;
    readonly record: ScreenshotRecord | null;
    readonly changedFields: readonly string[];
}

export interface GalleryState {
    readonly version: 1;
    readonly records: readonly ScreenshotRecord[];
    readonly revisions: readonly GalleryRevision[];
}

export interface ScreenshotSearch {
    readonly query?: string;
    readonly regex?: boolean;
    readonly flags?: string;
    readonly mapId?: string;
    readonly projectId?: string;
    readonly tags?: readonly string[];
    readonly from?: string;
    readonly to?: string;
}

export interface GalleryExport {
    readonly format: "json" | "markdown";
    readonly filename: string;
    readonly content: string;
}

export interface GalleryStorage {
    read(): string | null;
    write(serialized: string): void;
}

export interface ScreenshotDraft {
    readonly id?: string;
    readonly name: string;
    readonly assetPath: string;
    readonly tags?: readonly string[];
    readonly notes?: string;
    readonly metadata: ScreenshotMetadata;
    /** Bytes are supplied by capture/import. They are never serialized into gallery state. */
    readonly asset?: ScreenshotAssetInput;
}

export interface ScreenshotAssetInput {
    readonly bytes: Uint8Array;
    readonly basename: string;
}

export interface GalleryAssetInspector {
    /** The host owns the canonical app-data root and rejects symlinks/reparse points. */
    readonly appDataRoot: string;
    readonly inspect: (basename: string) => { readonly exists: boolean; readonly bytes: Uint8Array; readonly reparsePoint: boolean };
}

export interface ScreenshotUpdate {
    readonly name?: string;
    readonly tags?: readonly string[];
    readonly notes?: string;
}

export function isGalleryAssetBasename(path: string): boolean {
    if (path.length === 0 || path.length > MAX_PATH_LENGTH || path !== path.trim()) return false;
    if (path.includes("/") || path.includes("\\") || path === "." || path === ".." || path.includes("..")) return false;
    if (path.startsWith(".") || /^[A-Za-z]:/.test(path)) return false;
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.has(extension);
}

/** @deprecated committed evidence roots are deliberately no longer accepted. */
export const isEvidenceAssetPath = isGalleryAssetBasename;

function assetDimensions(bytes: Uint8Array): ScreenshotDimensions {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength >= 24 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
        return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.byteLength >= 10 && (String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a")) {
        return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (bytes.byteLength >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
        const kind = String.fromCharCode(...bytes.slice(12, 16));
        if (kind === "VP8X" && bytes.byteLength >= 30) {
            const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
            const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
            return { width, height };
        }
    }
    if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        let offset = 2;
        while (offset + 9 < bytes.byteLength) {
            if (bytes[offset] !== 0xff) { offset += 1; continue; }
            const marker = bytes[offset + 1]!;
            const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
            if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) return { height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
            offset += 2 + length;
        }
    }
    throw new Error("asset has an unsupported or invalid image signature");
}

function validateAsset(asset: ScreenshotAssetInput, expected: ScreenshotDimensions): void {
    if (!isGalleryAssetBasename(asset.basename)) throw new Error("asset basename must be a relative image filename");
    if (asset.bytes.byteLength < 8 || asset.bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`asset must be between 8 bytes and ${MAX_ASSET_BYTES} bytes`);
    const actual = assetDimensions(asset.bytes);
    if (actual.width < 1 || actual.height < 1 || actual.width * actual.height > MAX_ASSET_PIXELS) throw new Error("asset dimensions exceed the gallery bound");
    if (actual.width !== expected.width || actual.height !== expected.height) throw new Error("asset dimensions do not match metadata.dimensions");
}

function boundedText(value: unknown, field: string, required = false): string {
    if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH || (required && value.trim() === "")) {
        throw new Error(`${field} must be a non-empty text value of at most ${MAX_TEXT_LENGTH} characters`);
    }
    return value;
}

function finiteNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be finite`);
    return value;
}

function validIso(value: unknown, field: string): string {
    const text = boundedText(value, field, true);
    if (Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp`);
    return text;
}

function validateMetadata(metadata: ScreenshotMetadata): ScreenshotMetadata {
    if (!metadata || typeof metadata !== "object") throw new Error("metadata is required");
    boundedText(metadata.mapId, "metadata.mapId", true);
    boundedText(metadata.projectId, "metadata.projectId", true);
    validIso(metadata.timestamp, "metadata.timestamp");
    boundedText(metadata.version, "metadata.version", true);
    for (const [name, point] of [["coordinates", metadata.coordinates], ["camera", metadata.camera]] as const) {
        if (!point || typeof point !== "object") throw new Error(`metadata.${name} is required`);
        finiteNumber(point.x, `metadata.${name}.x`);
        finiteNumber(point.y, `metadata.${name}.y`);
        if (point.z !== undefined) finiteNumber(point.z, `metadata.${name}.z`);
        if (point.yaw !== undefined) finiteNumber(point.yaw, `metadata.${name}.yaw`);
        if (point.pitch !== undefined) finiteNumber(point.pitch, `metadata.${name}.pitch`);
    }
    if (!metadata.dimensions || metadata.dimensions.width < 1 || metadata.dimensions.height < 1) {
        throw new Error("metadata.dimensions must contain positive width and height");
    }
    finiteNumber(metadata.dimensions.width, "metadata.dimensions.width");
    finiteNumber(metadata.dimensions.height, "metadata.dimensions.height");
    if (metadata.dimensions.scale !== undefined) finiteNumber(metadata.dimensions.scale, "metadata.dimensions.scale");
    const provenance = metadata.provenance;
    if (!provenance || (provenance.kind !== "user-capture" && provenance.kind !== "user-import")) {
        throw new Error("metadata.provenance.kind must identify a user capture or import");
    }
    boundedText(provenance.captureId, "metadata.provenance.captureId", true);
    boundedText(provenance.commit, "metadata.provenance.commit", true);
    boundedText(provenance.appVersion, "metadata.provenance.appVersion", true);
    validIso(provenance.capturedAt, "metadata.provenance.capturedAt");
    return metadata;
}

function validateTags(tags: readonly string[] | undefined): readonly string[] {
    if (tags === undefined) return [];
    if (!Array.isArray(tags) || tags.length > MAX_TAGS) throw new Error(`tags must contain at most ${MAX_TAGS} values`);
    const unique = [...new Set(tags.map((tag) => boundedText(tag, "tag", true).trim()))];
    if (unique.some((tag) => tag.length > MAX_TAG_LENGTH)) throw new Error(`tags must be at most ${MAX_TAG_LENGTH} characters`);
    return unique;
}

function validateDraft(draft: ScreenshotDraft, inspector?: GalleryAssetInspector): ScreenshotDraft {
    if (!isGalleryAssetBasename(draft.assetPath)) throw new Error("assetPath must be a relative app-data image basename");
    boundedText(draft.name, "name", true);
    const notes = draft.notes ?? "";
    boundedText(notes, "notes");
    validateTags(draft.tags);
    validateMetadata(draft.metadata);
    if (draft.asset) {
        if (draft.asset.basename !== draft.assetPath) throw new Error("asset basename does not match assetPath");
        validateAsset(draft.asset, draft.metadata.dimensions);
    } else if (inspector) {
        const inspected = inspector.inspect(draft.assetPath);
        if (!inspected.exists || inspected.reparsePoint) throw new Error("asset is missing or is a symlink/reparse point");
        validateAsset({ basename: draft.assetPath, bytes: inspected.bytes }, draft.metadata.dimensions);
    } else {
        throw new Error("asset bytes or an app-data asset inspector are required");
    }
    if (draft.id !== undefined) boundedText(draft.id, "id", true);
    return { ...draft, notes, tags: validateTags(draft.tags) };
}

function cloneRecord(record: ScreenshotRecord): ScreenshotRecord {
    return { ...record, tags: [...record.tags], metadata: { ...record.metadata, coordinates: { ...record.metadata.coordinates }, camera: { ...record.metadata.camera }, dimensions: { ...record.metadata.dimensions }, provenance: { ...record.metadata.provenance } } };
}

function nextId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseState(raw: string | null, inspector?: GalleryAssetInspector): GalleryState {
    if (!raw) return { version: 1, records: [], revisions: [] };
    try {
        const value = JSON.parse(raw) as Partial<GalleryState>;
        if (value.version !== 1 || !Array.isArray(value.records) || !Array.isArray(value.revisions)) throw new Error("unsupported gallery state");
        const records = value.records.map((record) => {
            const draft = validateDraft(record as unknown as ScreenshotDraft, inspector);
            return { ...draft, id: record.id, createdAt: record.createdAt, updatedAt: record.updatedAt, tags: draft.tags ?? [] } as ScreenshotRecord;
        });
        if (records.length > MAX_RECORDS) throw new Error("gallery contains too many records");
        return { version: 1, records, revisions: value.revisions as GalleryRevision[] };
    } catch (error) {
        throw new Error(`invalid screenshot gallery data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function createScreenshotGallery(storage?: GalleryStorage, inspector?: GalleryAssetInspector) {
    if (inspector && (inspector.appDataRoot.trim() === "" || inspector.appDataRoot.includes("..") || !(/^[A-Za-z]:[\\/]/.test(inspector.appDataRoot) || inspector.appDataRoot.startsWith("\\\\") || inspector.appDataRoot.startsWith("/")))) throw new Error("canonical app-data root is invalid");
    let state = parseState(storage?.read() ?? null, inspector);
    const persist = () => storage?.write(JSON.stringify(state));
    const commit = (action: GalleryAction, screenshotId: string, record: ScreenshotRecord | null, changedFields: readonly string[]) => {
        const revision: GalleryRevision = { id: nextId("revision"), action, screenshotId, at: new Date().toISOString(), record: record ? cloneRecord(record) : null, changedFields: [...changedFields] };
        state = { ...state, revisions: [...state.revisions, revision] };
        persist();
    };
    const add = (draft: ScreenshotDraft, action: GalleryAction = "captured"): ScreenshotRecord => {
        if (state.records.length >= MAX_RECORDS) throw new Error(`gallery is limited to ${MAX_RECORDS} screenshots`);
        const checked = validateDraft(draft, inspector);
        const now = new Date().toISOString();
        const { asset: _asset, ...recordDraft } = checked;
        const record: ScreenshotRecord = { ...recordDraft, id: checked.id ?? nextId("screenshot"), createdAt: now, updatedAt: now, tags: checked.tags ?? [], notes: checked.notes ?? "" };
        if (state.records.some((existing) => existing.id === record.id)) throw new Error(`screenshot id already exists: ${record.id}`);
        state = { ...state, records: [...state.records, record] };
        commit(action, record.id, record, ["created"]);
        return cloneRecord(record);
    };
    return {
        get state(): GalleryState { return { version: 1, records: state.records.map(cloneRecord), revisions: state.revisions.map((revision) => ({ ...revision, record: revision.record ? cloneRecord(revision.record) : null, changedFields: [...revision.changedFields] })) }; },
        add,
        importJson(raw: string): ScreenshotRecord[] { const imported = parseState(raw, inspector); const added = imported.records.map((record) => add(record, "imported")); return added; },
        update(id: string, changes: ScreenshotUpdate): ScreenshotRecord {
            const current = state.records.find((record) => record.id === id);
            if (!current) throw new Error(`unknown screenshot: ${id}`);
            const nextDraft: ScreenshotDraft = { ...current, ...changes, id: current.id, assetPath: current.assetPath, metadata: current.metadata };
            const checked = validateDraft(nextDraft);
            const updated: ScreenshotRecord = { ...current, name: checked.name, tags: checked.tags ?? [], notes: checked.notes ?? "", updatedAt: new Date().toISOString() };
            state = { ...state, records: state.records.map((record) => record.id === id ? updated : record) };
            commit("updated", id, updated, Object.keys(changes));
            return cloneRecord(updated);
        },
        bulkUpdate(ids: readonly string[], changes: ScreenshotUpdate): number {
            let changed = 0;
            for (const id of ids) {
                if (state.records.some((record) => record.id === id)) {
                    this.update(id, changes);
                    changed += 1;
                }
            }
            return changed;
        },
        copy(id: string): ScreenshotRecord { const current = state.records.find((record) => record.id === id); if (!current) throw new Error(`unknown screenshot: ${id}`); return add({ ...current, id: nextId("screenshot"), name: `${current.name} copy` }, "copied"); },
        remove(ids: readonly string[]): number { const selected = new Set(ids); const removed = state.records.filter((record) => selected.has(record.id)); state = { ...state, records: state.records.filter((record) => !selected.has(record.id)) }; for (const record of removed) commit("deleted", record.id, record, ["deleted"]); return removed.length; },
        restore(revisionId: string): ScreenshotRecord { const revision = state.revisions.find((candidate) => candidate.id === revisionId); if (!revision?.record) throw new Error(`revision cannot be restored: ${revisionId}`); const record = revision.record; state = { ...state, records: [...state.records.filter((candidate) => candidate.id !== record.id), { ...cloneRecord(record), updatedAt: new Date().toISOString() }] }; commit("restored", record.id, record, ["restored"]); return cloneRecord(record); },
        search(filter: ScreenshotSearch = {}): { records: ScreenshotRecord[]; error: string | null } {
            const matcher = createSettingMatcher(filter.query ?? "", filter.regex === true, filter.flags ?? "i");
            const from = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY;
            const to = filter.to ? Date.parse(filter.to) : Number.POSITIVE_INFINITY;
            const tags = new Set(filter.tags ?? []);
            const records = state.records.filter((record) => matcher.test([record.name, record.notes, record.assetPath, record.metadata.mapId, record.metadata.projectId, ...record.tags].join("\n")) && (!filter.mapId || record.metadata.mapId === filter.mapId) && (!filter.projectId || record.metadata.projectId === filter.projectId) && [...tags].every((tag) => record.tags.includes(tag)) && Date.parse(record.metadata.timestamp) >= from && Date.parse(record.metadata.timestamp) <= to).map(cloneRecord);
            return { records, error: matcher.error };
        },
        export(format: "json" | "markdown", ids?: readonly string[]): GalleryExport { const records = state.records.filter((record) => !ids || ids.includes(record.id)); if (format === "json") return { format, filename: "worldlens-screenshot-gallery.json", content: JSON.stringify({ version: 1, records, revisions: state.revisions }, null, 2) }; const body = records.map((record) => `## ${record.name}\n\n- Asset: \`${record.assetPath}\`\n- Map/project: ${record.metadata.mapId} / ${record.metadata.projectId}\n- Captured: ${record.metadata.timestamp}\n- Dimensions: ${record.metadata.dimensions.width}×${record.metadata.dimensions.height}\n- Version: ${record.metadata.version}\n- Commit: ${record.metadata.provenance.commit}\n- Tags: ${record.tags.join(", ") || "(none)"}\n\n${record.notes || "No notes."}`).join("\n\n"); return { format, filename: "worldlens-screenshot-gallery.md", content: `# Screenshot gallery\n\n${body}\n` }; },
    } as const;
}
