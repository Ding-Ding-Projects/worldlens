import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

export interface AnnotationIdentity { projectId: string; mapId: string; dimension: string }
export interface AnnotationPrincipal { subject: string; canRead: boolean; canWrite: boolean }
export interface AnnotationDocument { version: 1; identity: AnnotationIdentity; revision: number; updatedAt: string; updatedBy: string; annotations: unknown[] }
export class AnnotationConflict extends Error { constructor(readonly current: AnnotationDocument) { super("Annotations changed. Reload before saving; retain your draft."); } }
export class AnnotationAccessDenied extends Error {}

function identityKey(identity: AnnotationIdentity): string {
    for (const value of [identity.projectId, identity.mapId, identity.dimension]) {
        if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f]/u.test(value)) throw new Error("Invalid annotation identity.");
    }
    return createHash("sha256").update(JSON.stringify([identity.projectId, identity.mapId, identity.dimension])).digest("hex");
}

/** One store owns its directory. Writes to a document are serialized and atomically replaced. */
export class AnnotationStore {
    private readonly pending = new Map<string, Promise<unknown>>();
    constructor(private readonly root: string) {}
    async read(identity: AnnotationIdentity, principal: AnnotationPrincipal): Promise<AnnotationDocument> {
        if (!principal.subject || !principal.canRead) throw new AnnotationAccessDenied("Sign in to read annotations.");
        const key = identityKey(identity);
        try {
            const value = JSON.parse(await readFile(join(this.root, key + ".json"), "utf8")) as AnnotationDocument;
            if (value.version !== 1 || identityKey(value.identity) !== key || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.annotations)) throw new Error("Invalid stored annotation document.");
            return value;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            return { version: 1, identity: { ...identity }, revision: 0, updatedAt: "", updatedBy: "", annotations: [] };
        }
    }
    async write(identity: AnnotationIdentity, expectedRevision: number, annotations: unknown[], principal: AnnotationPrincipal): Promise<AnnotationDocument> {
        if (!principal.subject || !principal.canRead || !principal.canWrite) throw new AnnotationAccessDenied("An authorized editor is required.");
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !Array.isArray(annotations) || annotations.length > 10000) throw new Error("Invalid annotation update.");
        const serialized = JSON.stringify(annotations);
        if (Buffer.byteLength(serialized) > 1024 * 1024) throw new Error("Annotation document exceeds its limit.");
        const key = identityKey(identity);
        const previous = this.pending.get(key) ?? Promise.resolve();
        const operation = previous.catch(() => undefined).then(async () => {
            const current = await this.read(identity, principal);
            if (current.revision !== expectedRevision) throw new AnnotationConflict(current);
            const document: AnnotationDocument = { version: 1, identity: { ...identity }, revision: current.revision + 1, updatedAt: new Date().toISOString(), updatedBy: principal.subject, annotations: JSON.parse(serialized) as unknown[] };
            await mkdir(this.root, { recursive: true, mode: 0o700 });
            const temporary = join(this.root, key + "." + randomUUID() + ".tmp");
            try { await writeFile(temporary, JSON.stringify(document), { flag: "wx", mode: 0o600 }); await rename(temporary, join(this.root, key + ".json")); }
            finally { await rm(temporary, { force: true }); }
            return document;
        });
        this.pending.set(key, operation);
        try { return await operation; } finally { if (this.pending.get(key) === operation) this.pending.delete(key); }
    }
}
