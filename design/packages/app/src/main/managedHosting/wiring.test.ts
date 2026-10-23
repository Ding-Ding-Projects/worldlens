import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
    ManagedHostingUnavailableError,
    REVIEWED_CONTAINER_BASE_IMAGE,
    managedHostingBuildFacts,
    unconfiguredHostResolver,
} from "./wiring.js";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "hosting-wiring-"));
    roots.push(dir);
    return dir;
}
const COMMIT = "49d009b5ad685022abbb47dcff00b43305589ba8";

test("the reviewed base image is digest-pinned in the exact form the export context accepts", () => {
    expect(REVIEWED_CONTAINER_BASE_IMAGE).toMatch(/^node:[a-zA-Z0-9_.-]+@sha256:[a-f0-9]{64}$/u);
});

test("build facts hash the real runtime bundle, carry the pinned base and omit absent native runtimes", async () => {
    const dir = await root();
    const bundle = join(dir, "managed-host.mjs");
    await writeFile(bundle, "export const host = true;\n");
    const facts = managedHostingBuildFacts({
        sourceCommit: COMMIT,
        runtimeBundlePath: bundle,
        nodeWindowsPath: join(dir, "absent-node.exe"),
        nodeLinuxPath: null,
    });
    const resolved = await facts();
    expect(resolved.sourceCommit).toBe(COMMIT);
    expect(resolved.runtimeBundle).toEqual({
        path: bundle,
        sha256: createHash("sha256").update("export const host = true;\n").digest("hex"),
    });
    expect(resolved.containerBaseImage).toBe(REVIEWED_CONTAINER_BASE_IMAGE);
    expect(resolved.nodeWindows).toBeUndefined();
    expect(resolved.nodeLinux).toBeUndefined();
    // cached: the same promise result, not a second hash
    expect(await facts()).toBe(resolved);
});

test("a build without a recorded source commit is reported as unavailable, naming why", async () => {
    const dir = await root();
    await writeFile(join(dir, "managed-host.mjs"), "x");
    const facts = managedHostingBuildFacts({
        sourceCommit: null,
        runtimeBundlePath: join(dir, "managed-host.mjs"),
    });
    await expect(facts()).rejects.toBeInstanceOf(ManagedHostingUnavailableError);
    await expect(facts()).rejects.toThrow(/does not record the 40-character source commit/u);
});

test("a missing runtime bundle is reported with its path, and the failure is not cached", async () => {
    const dir = await root();
    const bundle = join(dir, "managed-host.mjs");
    const facts = managedHostingBuildFacts({ sourceCommit: COMMIT, runtimeBundlePath: bundle });
    await expect(facts()).rejects.toThrow(bundle);
    await writeFile(bundle, "later");
    expect((await facts()).runtimeBundle.sha256).toBe(
        createHash("sha256").update("later").digest("hex"),
    );
});

test("the unconfigured host resolver names the target, the port and what still works", async () => {
    const resolve = unconfiguredHostResolver();
    await expect(
        resolve({ target: "native-wsl", context: "/tmp/ctx", port: 8443 }),
    ).rejects.toThrow(
        /native-wsl host on port 8443 .* HTTPS origin and trusted TLS .* Export, image build, save, registry sign-in and upload remain available/u,
    );
});
