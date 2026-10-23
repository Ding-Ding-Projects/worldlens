import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, realpath, rm, writeFile, chmod } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isCompletedOutputManifest, verifyCompletedOutputManifest } from "../render/outputManifest.js";
import type { CompletedOutputManifest } from "../render/outputManifest.js";
import { composeTemplate, healthScript, hostBatch, nativeHealth, nativeStart, wslStart, wslHealth } from "./templates.js";

export interface VerifiedRuntimeFile { path: string; sha256: string }
export interface ManagedMapExportRequest {
    renderId: string; sourceCommit: string; webRoot: string; expectedManifest: CompletedOutputManifest; destination: string;
    runtimeBundle: VerifiedRuntimeFile;
    nodeWindows?: VerifiedRuntimeFile; nodeLinux?: VerifiedRuntimeFile;
    /** Immutable reviewed Node base, e.g. node:22-slim@sha256:... */
    containerBaseImage: string;
}
export interface ManagedMapExportReceipt { version: 1; renderId: string; sourceCommit: string; renderFingerprint: string; runtimeSha256: string; contextFingerprint: string; files: { path: string; sha256: string; bytes: number }[]; nativeWindows: boolean; nativeLinux: boolean; authentication: "required"; state: "exported" }
export function assertManagedContextIdentity(actual: ManagedMapExportReceipt, expected: ManagedMapExportReceipt): void {
    if (actual.contextFingerprint !== expected.contextFingerprint || actual.sourceCommit !== expected.sourceCommit || actual.renderId !== expected.renderId || actual.renderFingerprint !== expected.renderFingerprint || actual.runtimeSha256 !== expected.runtimeSha256 || JSON.stringify(actual.files) !== JSON.stringify(expected.files)) throw new Error("Hosting context differs from its original main-process export identity.");
}
/** Main-owned staging is never returned to the renderer and is created exclusively once. */
export async function stageManagedMapContext(source: string, destination: string, expected: ManagedMapExportReceipt): Promise<void> {
    assertManagedContextIdentity(await verifyManagedMapContext(source), expected);
    await mkdir(destination, { recursive: false, mode: 0o700 });
    for (const file of expected.files) {
        const target = join(destination, file.path); await mkdir(resolve(target, ".."), { recursive: true, mode: 0o700 });
        await copyFile(join(source, file.path), target);
        if (await hashFile(target) !== file.sha256) throw new Error("Hosting context changed while entering protected staging.");
    }
    await writeFile(join(destination, "worldlens-host-export.json"), JSON.stringify(expected), { flag: "wx", mode: 0o600 });
    for (const file of expected.files) await chmod(join(destination, file.path), file.path === "runtime/node" || file.path.endsWith(".sh") ? 0o500 : 0o400);
    assertManagedContextIdentity(await verifyManagedMapContext(destination), expected);
}
async function hashFile(path: string): Promise<string> { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex"); }
async function inventory(root: string, sub = ""): Promise<ManagedMapExportReceipt["files"]> {
    const rows: ManagedMapExportReceipt["files"] = [];
    for (const entry of await readdir(join(root, sub), { withFileTypes: true })) {
        const name = sub ? sub + "/" + entry.name : entry.name; const path = join(root, name); const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error("Hosting exports cannot contain symbolic links.");
        if (info.isDirectory()) rows.push(...await inventory(root, name));
        else if (info.isFile()) rows.push({ path: name, sha256: await hashFile(path), bytes: info.size });
        else throw new Error("Hosting export contains a non-regular entry.");
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path));
}
export async function verifyManagedMapContext(root: string): Promise<ManagedMapExportReceipt> {
    const receipt = JSON.parse(await readFile(join(root, "worldlens-host-export.json"), "utf8")) as ManagedMapExportReceipt;
    const actual = (await inventory(root)).filter(file => file.path !== "worldlens-host-export.json");
    const fingerprint = createHash("sha256").update(JSON.stringify(actual)).digest("hex");
    if (receipt.version !== 1 || receipt.authentication !== "required" || receipt.state !== "exported" || receipt.contextFingerprint !== fingerprint || JSON.stringify(actual) !== JSON.stringify(receipt.files)) throw new Error("Hosting export context no longer matches its verified receipt.");
    return receipt;
}
/** Copies only a verified map and approved runtime files. It never reads access storage. */
export async function exportManagedMapContext(request: ManagedMapExportRequest): Promise<ManagedMapExportReceipt> {
    if (!/^[a-f0-9]{40}$/u.test(request.sourceCommit) || !/^[a-zA-Z0-9_-]{1,128}$/u.test(request.renderId)) throw new Error("A source-bound render identity is required.");
    if (!/^node:[a-zA-Z0-9_.-]+@sha256:[a-f0-9]{64}$/u.test(request.containerBaseImage)) throw new Error("Select an immutable reviewed Node container base.");
    if (!isCompletedOutputManifest(request.expectedManifest) || !await verifyCompletedOutputManifest(request.webRoot, request.expectedManifest)) throw new Error("The completed render no longer matches its verification manifest.");
    const source = await realpath(request.webRoot); const destination = resolve(request.destination);
    const rel = relative(source, destination); if (!rel || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep))) throw new Error("Export outside the rendered map directory.");
    await mkdir(destination, { recursive: false });
    try {
        const resolvedDestination = await realpath(destination);
        const actualRelative = relative(source, resolvedDestination);
        if (!actualRelative || (!isAbsolute(actualRelative) && actualRelative !== ".." && !actualRelative.startsWith(".." + sep))) throw new Error("Export destination resolves inside the rendered map.");
        const files = await inventory(source);
        for (const file of files) { const target = join(destination, "map", file.path); await mkdir(resolve(target, ".."), { recursive: true }); await copyFile(join(source, file.path), target); }
        if (!await verifyCompletedOutputManifest(join(destination, "map"), request.expectedManifest)) throw new Error("Copied map verification failed.");
        const copyRuntime = async (file: VerifiedRuntimeFile, name: string): Promise<void> => {
            if (!/^[a-f0-9]{64}$/u.test(file.sha256) || (await lstat(file.path)).isSymbolicLink() || await hashFile(file.path) !== file.sha256) throw new Error("Runtime integrity verification failed.");
            await mkdir(join(destination, "runtime"), { recursive: true }); await copyFile(file.path, join(destination, name));
            if (await hashFile(join(destination, name)) !== file.sha256) throw new Error("Copied runtime integrity verification failed.");
        };
        await copyRuntime(request.runtimeBundle, "managed-host.mjs");
        if (request.nodeWindows) await copyRuntime(request.nodeWindows, "runtime/node.exe");
        if (request.nodeLinux) { await copyRuntime(request.nodeLinux, "runtime/node"); await chmod(join(destination, "runtime/node"), 0o755); }
        const dockerfile = `FROM ${request.containerBaseImage}\nWORKDIR /app\nCOPY managed-host.mjs health.mjs ./\nCOPY map ./map\nENV WORLDLENS_HOST_MAP=/app/map WORLDLENS_HOST_DATA=/data WORLDLENS_HOST_PORT=8443\nEXPOSE 8443\nENTRYPOINT ["node","/app/managed-host.mjs"]\n`;
        const outputs: Record<string, string> = { "Dockerfile": dockerfile, "compose.yaml": composeTemplate, "host.bat": hostBatch, "start-native.bat": nativeStart, "health-native.bat": nativeHealth, "start-wsl.sh": wslStart, "health-wsl.sh": wslHealth, "health.mjs": healthScript, ".dockerignore": "*\n!Dockerfile\n!managed-host.mjs\n!health.mjs\n!map/\n!map/**\n" };
        for (const [name, content] of Object.entries(outputs)) await writeFile(join(destination, name), content, { flag: "wx" });
        await chmod(join(destination, "start-wsl.sh"), 0o755);
        await chmod(join(destination, "health-wsl.sh"), 0o755);
        const exported = await inventory(destination);
        const receipt: ManagedMapExportReceipt = { version: 1, renderId: request.renderId, sourceCommit: request.sourceCommit, renderFingerprint: request.expectedManifest.payloadFingerprint, runtimeSha256: request.runtimeBundle.sha256, contextFingerprint: createHash("sha256").update(JSON.stringify(exported)).digest("hex"), files: exported, nativeWindows: Boolean(request.nodeWindows), nativeLinux: Boolean(request.nodeLinux), authentication: "required", state: "exported" };
        await writeFile(join(destination, "worldlens-host-export.json"), JSON.stringify(receipt, null, 2), { flag: "wx" });
        return await verifyManagedMapContext(destination);
    } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
