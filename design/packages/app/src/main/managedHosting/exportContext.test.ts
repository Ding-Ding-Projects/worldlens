import { afterEach, expect, test } from "vitest";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildCompletedOutputManifest } from "../render/outputManifest.js";
import { assertManagedContextIdentity, exportManagedMapContext, stageManagedMapContext, verifyManagedMapContext } from "./exportContext.js";
import { createPasswordVerifier } from "./access.js";
import { ManagedImageOperations } from "./images.js";
import type { ProcessRunner } from "../cirender/gh.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "managed-export-")); roots.push(root);
    const map = join(root, "source"); await mkdir(join(map, "maps", "test"), { recursive: true });
    await writeFile(join(map, "index.html"), "<html>verified map</html>"); await writeFile(join(map, "maps", "test", "settings.json"), "{}");
    const manifest = await buildCompletedOutputManifest(map, ["test"]); if (!manifest) throw new Error("Fixture manifest unavailable");
    const bundle = join(root, "host.mjs");
    await build({ entryPoints: [resolve("packages/server/src/annotations/hostEntry.ts")], outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22" });
    const hash = createHash("sha256").update(await readFile(bundle)).digest("hex");
    const destination = join(root, "export");
    const request = { renderId: "render-test", sourceCommit: "a".repeat(40), webRoot: map, expectedManifest: manifest, destination, runtimeBundle: { path: bundle, sha256: hash }, containerBaseImage: "node:22-slim@sha256:" + "b".repeat(64) };
    return { root, request };
}
test("exports exact verified assets and templates without administrator preparation", async () => {
    const { request } = await fixture();
    const receipt = await exportManagedMapContext(request);
    expect(receipt.authentication).toBe("required"); expect(receipt.nativeWindows).toBe(false);
    expect(receipt.files.some(file => /administrator|bootstrap|\.bin$/u.test(file.path))).toBe(false);
    expect(await verifyManagedMapContext(request.destination)).toEqual(receipt);
    await writeFile(join(request.destination, "map", "index.html"), "changed");
    await expect(verifyManagedMapContext(request.destination)).rejects.toThrow("receipt");
});
test("refuses stale render output before creating an export", async () => {
    const { request } = await fixture(); await writeFile(join(request.webRoot, "index.html"), "stale");
    await expect(exportManagedMapContext(request)).rejects.toThrow("manifest");
});
test("bundled runtime consumes one-time bootstrap through process stdin", async () => {
    const { root, request } = await fixture(); await exportManagedMapContext(request);
    const data = join(root, "private-data"); const account = { username: "admin", verifier: await createPasswordVerifier("test-password-1234") };
    const run = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun, reject) => {
        const child = spawn(process.execPath, [join(request.destination, "managed-host.mjs"), "--bootstrap"], { env: { ...process.env, WORLDLENS_HOST_DATA: data }, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = ""; let stderr = ""; child.stdout.on("data", chunk => { stdout += String(chunk); }); child.stderr.on("data", chunk => { stderr += String(chunk); });
        child.once("error", reject); child.once("exit", code => resolveRun({ code, stdout, stderr })); child.stdin.end(JSON.stringify(account));
    });
    expect(await run()).toEqual({ code: 0, stdout: '{"state":"provisioned"}\n', stderr: "" });
    expect((await run()).code).toBe(1);
    expect((await readFile(join(data, "administrator.json"), "utf8"))).not.toContain("test-password-1234");
    expect(await verifyManagedMapContext(request.destination)).toBeTruthy();
});
test("build and save consume the exact verified export context and reject later mutation", async () => {
    const { root, request } = await fixture(); const receipt = await exportManagedMapContext(request);
    const imageId = "sha256:" + "d".repeat(64); const calls: string[][] = [];
    const runner: ProcessRunner = {
        async run(command, args) {
            calls.push([command, ...args]);
            if (args[0] === "image" && args[1] === "save") await writeFile(args[3]!, "saved image archive");
            const stdout = args.includes("{{.Id}}") ? imageId : args.includes("{{json .Config.Labels}}") ? JSON.stringify({ "worldlens.context": receipt.contextFingerprint, "worldlens.render": receipt.renderFingerprint, "org.opencontainers.image.revision": receipt.sourceCommit }) : "";
            return { started: true, code: 0, stdout, stderr: "" };
        }, async runToFile() { throw new Error("unused"); },
    };
    const operations = new ManagedImageOperations(runner);
    expect(await operations.build(request.destination, "worldlens-map:v1")).toEqual({ imageId, contextFingerprint: receipt.contextFingerprint });
    const archive = await operations.save(imageId, join(root, "map.tar"), request.destination);
    expect(archive.contextFingerprint).toBe(receipt.contextFingerprint); expect(archive.bytes).toBeGreaterThan(0);
    const count = calls.length; await writeFile(join(request.destination, "map", "index.html"), "changed");
    await expect(operations.build(request.destination, "worldlens-map:v2")).rejects.toThrow("receipt"); expect(calls).toHaveLength(count);
});
test("main-pinned identity rejects files and self-hashed receipt replaced together", async () => {
    const { root, request } = await fixture(); const original = await exportManagedMapContext(request);
    const staging = join(root, "private-staging"); await stageManagedMapContext(request.destination, staging, original);
    const changed = structuredClone(original); const file = changed.files.find(row => row.path === "map/index.html")!;
    const replacement = "replaced map"; await writeFile(join(request.destination, file.path), replacement);
    file.bytes = Buffer.byteLength(replacement); file.sha256 = createHash("sha256").update(replacement).digest("hex");
    changed.contextFingerprint = createHash("sha256").update(JSON.stringify(changed.files)).digest("hex");
    await writeFile(join(request.destination, "worldlens-host-export.json"), JSON.stringify(changed));
    const selfConsistent = await verifyManagedMapContext(request.destination);
    expect(() => assertManagedContextIdentity(selfConsistent, original)).toThrow("original main-process");
    expect(await readFile(join(staging, "map/index.html"), "utf8")).toBe("<html>verified map</html>");
    assertManagedContextIdentity(await verifyManagedMapContext(staging), original);
});
