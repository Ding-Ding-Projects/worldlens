import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, open, realpath, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProcessRunner } from "../cirender/gh.js";
async function verifyManagedMapContext(context: string) { return (await import("./exportContext.js")).verifyManagedMapContext(context); }

export const DEFAULT_REGISTRY = "docker.io";
export interface ImageUploadReview { registry: "docker.io"; namespace: string; repository: string; tag: string; confirmed: true }
function destination(review: ImageUploadReview): string {
    if (review.registry !== DEFAULT_REGISTRY || review.confirmed !== true || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(review.namespace) || !/^[a-z0-9][a-z0-9_.-]{0,127}$/u.test(review.repository) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u.test(review.tag)) throw new Error("Review a valid Docker Hub destination before upload.");
    return `${review.registry}/${review.namespace}/${review.repository}:${review.tag}`;
}
/** Build/save never invokes login or upload. The CLI owns registry credentials. */
export class ManagedImageOperations {
    constructor(private readonly runner: ProcessRunner) {}
    private async run(args: readonly string[]): Promise<string> {
        const result = await this.runner.run("docker", args);
        if (!result.started || result.code !== 0) throw new Error("Docker operation did not complete. Check the runtime and retry.");
        return result.stdout.trim();
    }
    async build(context: string, localTag: string): Promise<{ imageId: string; contextFingerprint: string }> {
        if (!/^worldlens-map:[a-z0-9][a-z0-9_.-]{0,100}$/u.test(localTag)) throw new Error("Invalid local map image tag.");
        const path = await realpath(context);
        if (!(await stat(path)).isDirectory()) throw new Error("Export context is unavailable.");
        const receipt = await verifyManagedMapContext(path);
        await this.run(["build", "--pull", "--label", `org.opencontainers.image.revision=${receipt.sourceCommit}`, "--label", `worldlens.context=${receipt.contextFingerprint}`, "--label", `worldlens.render=${receipt.renderFingerprint}`, "--tag", localTag, path]);
        const imageId = await this.run(["image", "inspect", "--format", "{{.Id}}", localTag]);
        if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) throw new Error("Built image identity could not be verified.");
        await this.verifyImageContext(imageId, context);
        return { imageId, contextFingerprint: receipt.contextFingerprint };
    }
    async save(imageId: string, archive: string, context: string): Promise<{ path: string; sha256: string; bytes: number; contextFingerprint: string }> {
        this.assertImage(imageId);
        const contextFingerprint = await this.verifyImageContext(imageId, context);
        const path = resolve(archive);
        // Existing output is never overwritten.
        try { await stat(path); throw new Error("Choose a new archive destination."); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const temporary = path + "." + randomUUID() + ".tmp";
        const reserved = await open(temporary, "wx", 0o600); await reserved.close();
        try {
            await this.run(["image", "save", "--output", temporary, imageId]);
            const hash = createHash("sha256");
            for await (const chunk of createReadStream(temporary)) hash.update(chunk);
            const bytes = (await stat(temporary)).size;
            if (!bytes) throw new Error("Docker did not produce an image archive.");
            // Hard-link publication is exclusive, including when another writer races the initial check.
            await link(temporary, path);
            return { path, sha256: hash.digest("hex"), bytes, contextFingerprint };
        } finally { await rm(temporary, { force: true }); }
    }
    async upload(imageId: string, review: ImageUploadReview): Promise<{ reference: string; digest: string }> {
        this.assertImage(imageId);
        const target = destination(review);
        await this.run(["image", "tag", imageId, target]);
        await this.run(["image", "push", target]);
        const raw = await this.run(["buildx", "imagetools", "inspect", target, "--format", "{{json .Manifest}}"]);
        let digest: unknown;
        try { digest = (JSON.parse(raw) as { digest?: unknown }).digest; } catch { throw new Error("Uploaded manifest could not be read back."); }
        if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error("Uploaded manifest digest is unavailable.");
        const immutable = `${DEFAULT_REGISTRY}/${review.namespace}/${review.repository}@${digest}`;
        const manifest = await this.run(["buildx", "imagetools", "inspect", immutable, "--raw"]);
        let configDigest: unknown;
        try { configDigest = (JSON.parse(manifest) as { config?: { digest?: unknown } }).config?.digest; } catch { throw new Error("Uploaded image configuration could not be verified."); }
        if (configDigest !== imageId) throw new Error("The uploaded manifest does not identify the reviewed image. Multi-platform uploads require a separate verified workflow.");
        return { reference: immutable, digest };
    }
    private assertImage(imageId: string): void { if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) throw new Error("A verified immutable image ID is required."); }
    private async verifyImageContext(imageId: string, context: string): Promise<string> {
        const receipt = await verifyManagedMapContext(context);
        const raw = await this.run(["image", "inspect", "--format", "{{json .Config.Labels}}", imageId]);
        let labels: Record<string, unknown>; try { labels = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("Image context labels are unavailable."); }
        if (!labels || labels["worldlens.context"] !== receipt.contextFingerprint || labels["worldlens.render"] !== receipt.renderFingerprint || labels["org.opencontainers.image.revision"] !== receipt.sourceCommit) throw new Error("Image does not match the verified render export.");
        return receipt.contextFingerprint;
    }
}
