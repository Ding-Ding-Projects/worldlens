import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";

export const GALLERY_VERSION = 1 as const;
export const MAX_GALLERY_RECORDS = 5_000;
export const MAX_GALLERY_HISTORY = 10_000;
export const MAX_GALLERY_METADATA_BYTES = 2 * 1024 * 1024;
export const MAX_GALLERY_ASSET_BYTES = 32 * 1024 * 1024;
export const MAX_GALLERY_PIXELS = 100_000_000;

export interface GalleryMetadata {
    readonly mapId: string;
    readonly projectId: string;
    readonly coordinates: Record<string, number>;
    readonly camera: Record<string, number>;
    readonly timestamp: string;
    readonly dimensions: { readonly width: number; readonly height: number; readonly scale?: number };
    readonly version: string;
    readonly provenance: { readonly kind: "user-capture" | "user-import"; readonly captureId: string; readonly commit: string; readonly appVersion: string; readonly capturedAt: string };
}

export interface GalleryRecord {
    readonly id: string;
    readonly name: string;
    readonly asset: string;
    readonly tags: readonly string[];
    readonly notes: string;
    readonly metadata: GalleryMetadata;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface GalleryRevision {
    readonly id: string;
    readonly action: "captured" | "imported" | "updated" | "deleted" | "restored";
    readonly screenshotId: string;
    readonly at: string;
    readonly record: GalleryRecord | null;
}

interface GalleryState { readonly version: 1; readonly records: readonly GalleryRecord[]; readonly history: readonly GalleryRevision[]; }

export interface GalleryDraft { readonly name: string; readonly assetName: string; readonly bytes: Uint8Array; readonly tags?: readonly string[]; readonly notes?: string; readonly metadata: GalleryMetadata; }
export interface GalleryUpdate { readonly name?: string; readonly tags?: readonly string[]; readonly notes?: string; }
export interface GalleryAssetRead { readonly mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; readonly bytes: Uint8Array; }

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const text = (value: unknown, field: string, required = true): string => {
    if (typeof value !== "string" || value.length > 2_000 || (required && value.trim() === "")) throw new Error(`${field} is invalid`);
    return value;
};
const finite = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is invalid`);
    return value;
};
function basename(name: string): string {
    if (!name || name.length > 255 || name !== name.trim() || name.includes("/") || name.includes("\\") || name.includes("..") || name.startsWith(".")) throw new Error("gallery asset must be a relative basename");
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("gallery asset format is unsupported");
    return name;
}
function dimensions(bytes: Uint8Array): { width: number; height: number } {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.byteLength >= 24 && png.every((value, index) => bytes[index] === value)) return { width: view.getUint32(16), height: view.getUint32(20) };
    const header = String.fromCharCode(...bytes.slice(0, 12));
    if (header.startsWith("GIF89a") || header.startsWith("GIF87a")) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (header.startsWith("RIFF") && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" && String.fromCharCode(...bytes.slice(12, 16)) === "VP8X") return { width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16), height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16) };
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        for (let offset = 2; offset + 9 < bytes.length;) {
            if (bytes[offset] !== 0xff) { offset += 1; continue; }
            const marker = bytes[offset + 1]!;
            const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
            if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) return { height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
            offset += 2 + length;
        }
    }
    throw new Error("gallery asset has an invalid image signature");
}
function mimeFor(name: string): GalleryAssetRead["mime"] {
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (extension === ".png") return "image/png";
    if (extension === ".gif") return "image/gif";
    if (extension === ".webp") return "image/webp";
    return "image/jpeg";
}
function validateMetadata(metadata: GalleryMetadata): GalleryMetadata {
    text(metadata.mapId, "metadata.mapId"); text(metadata.projectId, "metadata.projectId"); text(metadata.version, "metadata.version"); text(metadata.timestamp, "metadata.timestamp");
    for (const [field, point] of [["coordinates", metadata.coordinates], ["camera", metadata.camera]] as const) { if (!point || typeof point !== "object") throw new Error(`${field} is invalid`); for (const [key, value] of Object.entries(point)) finite(value, `${field}.${key}`); }
    finite(metadata.dimensions.width, "metadata.dimensions.width"); finite(metadata.dimensions.height, "metadata.dimensions.height");
    if (metadata.dimensions.width < 1 || metadata.dimensions.height < 1 || metadata.dimensions.width * metadata.dimensions.height > MAX_GALLERY_PIXELS) throw new Error("metadata dimensions exceed bounds");
    if (metadata.provenance.kind !== "user-capture" && metadata.provenance.kind !== "user-import") throw new Error("provenance must be user capture or import");
    text(metadata.provenance.captureId, "metadata.provenance.captureId"); text(metadata.provenance.commit, "metadata.provenance.commit"); text(metadata.provenance.appVersion, "metadata.provenance.appVersion"); text(metadata.provenance.capturedAt, "metadata.provenance.capturedAt");
    return metadata;
}

export class GalleryStore {
    readonly root: string;
    private readonly assetDir: string;
    private readonly stateFile: string;
    private state: GalleryState = { version: 1, records: [], history: [] };
    private loaded = false;
    constructor(dataDir: string) { this.root = join(dataDir, "screenshot-gallery"); this.assetDir = join(this.root, "assets"); this.stateFile = join(this.root, "gallery.json"); }
    private async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        try { const raw = await readFile(this.stateFile, "utf8"); if (Buffer.byteLength(raw, "utf8") > MAX_GALLERY_METADATA_BYTES) throw new Error("gallery metadata exceeds bounds"); const parsed = JSON.parse(raw) as GalleryState; if (parsed.version !== 1 || !Array.isArray(parsed.records) || !Array.isArray(parsed.history) || parsed.records.length > MAX_GALLERY_RECORDS || parsed.history.length > MAX_GALLERY_HISTORY) throw new Error("gallery schema is invalid"); for (const record of parsed.records) { text(record.id, "record.id"); text(record.name, "record.name"); basename(record.asset); validateMetadata(record.metadata); if (!Array.isArray(record.tags) || record.tags.length > 32 || record.tags.some((tag) => typeof tag !== "string" || tag.length > 64)) throw new Error("gallery tags are invalid"); text(record.notes, "record.notes", false); } this.state = parsed; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`gallery metadata could not be read: ${error instanceof Error ? error.message : String(error)}`); }
    }
    private async ensureOwnedDirectories(): Promise<void> { await mkdir(this.assetDir, { recursive: true }); for (const directory of [this.root, this.assetDir]) { const info = await lstat(directory); if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("gallery app-data directory is a symlink, reparse point, or non-directory"); } }
    private async persist(): Promise<void> { await this.ensureOwnedDirectories(); const temp = `${this.stateFile}.${randomBytes(6).toString("hex")}.tmp`; await writeFile(temp, JSON.stringify(this.state), "utf8"); await rename(temp, this.stateFile); }
    private async safeAsset(name: string): Promise<string> { await this.ensureOwnedDirectories(); const file = basename(name); const path = join(this.assetDir, file); const info = await lstat(path).catch(() => null); if (info?.isSymbolicLink() || info?.isDirectory()) throw new Error("gallery asset is a symlink, directory, or reparse point"); return path; }
    async list(): Promise<{ records: readonly GalleryRecord[]; history: readonly GalleryRevision[] }> { await this.load(); return { records: this.state.records, history: this.state.history }; }
    async readAsset(id: string): Promise<GalleryAssetRead> { await this.load(); const record = this.state.records.find((candidate) => candidate.id === id); if (!record) throw new Error("gallery record not found"); const path = await this.safeAsset(record.asset); const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_GALLERY_ASSET_BYTES) throw new Error("gallery asset is unavailable or exceeds bounds"); const bytes = new Uint8Array(await readFile(path)); const actual = dimensions(bytes); if (actual.width !== record.metadata.dimensions.width || actual.height !== record.metadata.dimensions.height) throw new Error("gallery asset dimensions no longer match metadata"); return { mime: mimeFor(record.asset), bytes }; }
    async add(draft: GalleryDraft): Promise<GalleryRecord> { await this.load(); if (this.state.records.length >= MAX_GALLERY_RECORDS) throw new Error("gallery record limit reached"); const dims = dimensions(draft.bytes); if (draft.bytes.byteLength > MAX_GALLERY_ASSET_BYTES || dims.width !== draft.metadata.dimensions.width || dims.height !== draft.metadata.dimensions.height) throw new Error("gallery asset bytes or dimensions are invalid"); validateMetadata(draft.metadata); const extension = basename(draft.assetName).slice(draft.assetName.lastIndexOf(".")); const asset = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}${extension}`; const destination = await this.safeAsset(asset); await writeFile(destination, Buffer.from(draft.bytes), { flag: "wx" }); const now = new Date().toISOString(); const record: GalleryRecord = { id: randomBytes(12).toString("hex"), name: text(draft.name, "name"), asset, tags: [...new Set((draft.tags ?? []).map((tag) => text(tag, "tag")))].slice(0, 32), notes: text(draft.notes ?? "", "notes", false), metadata: draft.metadata, createdAt: now, updatedAt: now }; this.state = { ...this.state, records: [...this.state.records, record], history: [...this.state.history, { id: randomBytes(12).toString("hex"), action: draft.metadata.provenance.kind === "user-import" ? "imported" : "captured", screenshotId: record.id, at: now, record }] }; await this.persist(); return record; }
    async update(id: string, changes: GalleryUpdate): Promise<GalleryRecord> { await this.load(); const current = this.state.records.find((record) => record.id === id); if (!current) throw new Error("gallery record not found"); const record = { ...current, name: changes.name === undefined ? current.name : text(changes.name, "name"), tags: changes.tags === undefined ? current.tags : [...new Set(changes.tags.map((tag) => text(tag, "tag")))].slice(0, 32), notes: changes.notes === undefined ? current.notes : text(changes.notes, "notes", false), updatedAt: new Date().toISOString() }; this.state = { ...this.state, records: this.state.records.map((value) => value.id === id ? record : value), history: [...this.state.history, { id: randomBytes(12).toString("hex"), action: "updated", screenshotId: id, at: record.updatedAt, record }] }; await this.persist(); return record; }
    async remove(ids: readonly string[]): Promise<number> { await this.load(); const selected = new Set(ids); const removed = this.state.records.filter((record) => selected.has(record.id)); for (const record of removed) { const path = await this.safeAsset(record.asset); await unlink(path).catch(() => undefined); } const now = new Date().toISOString(); this.state = { ...this.state, records: this.state.records.filter((record) => !selected.has(record.id)), history: [...this.state.history, ...removed.map((record) => ({ id: randomBytes(12).toString("hex"), action: "deleted" as const, screenshotId: record.id, at: now, record }))].slice(-MAX_GALLERY_HISTORY) }; await this.persist(); return removed.length; }
    async export(format: "json" | "markdown"): Promise<{ format: string; filename: string; content: string }> { await this.load(); if (format === "json") return { format, filename: "worldlens-screenshot-gallery.json", content: JSON.stringify({ version: 1, records: this.state.records, history: this.state.history }, null, 2) }; return { format, filename: "worldlens-screenshot-gallery.md", content: `# Screenshot gallery\n\n${this.state.records.map((record) => `## ${record.name}\n\n- Asset: ${record.asset}\n- Map/project: ${record.metadata.mapId} / ${record.metadata.projectId}\n- Captured: ${record.metadata.timestamp}\n- Version: ${record.metadata.version}\n`).join("\n")}` }; }
}
