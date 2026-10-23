import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnnotationAccessDenied, AnnotationConflict, AnnotationStore } from "./store.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const identity = { projectId: "project", mapId: "map", dimension: "minecraft:overworld" };
const editor = { subject: "admin", canRead: true, canWrite: true };
test("serializes concurrent writes and preserves the losing draft through a conflict", async () => {
    const root = await mkdtemp(join(tmpdir(), "annotations-")); roots.push(root);
    const store = new AnnotationStore(root);
    const results = await Promise.allSettled([store.write(identity, 0, [{ label: "a" }], editor), store.write(identity, 0, [{ label: "b" }], editor)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AnnotationConflict);
    expect((await new AnnotationStore(root).read(identity, editor)).revision).toBe(1);
    expect((await store.read({ ...identity, dimension: "minecraft:the_end" }, editor)).revision).toBe(0);
});
test("denies anonymous and read-only writes without changing storage", async () => {
    const root = await mkdtemp(join(tmpdir(), "annotations-")); roots.push(root);
    const store = new AnnotationStore(root);
    await expect(store.write(identity, 0, [], { ...editor, canWrite: false })).rejects.toBeInstanceOf(AnnotationAccessDenied);
    await expect(store.read(identity, { ...editor, subject: "" })).rejects.toBeInstanceOf(AnnotationAccessDenied);
    expect((await store.read(identity, editor)).revision).toBe(0);
});
