import { HostingProfileStore } from "./profiles.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";
import { nodeProcessRunner } from "../cirender/gh.js";
import type { ProcessRunner } from "../cirender/gh.js";
import { verifyFinishedRender } from "../render/promotion.js";
import { isValidRenderId, renderWorkspace } from "../render/workspace.js";
import { ProtectedAccessStore } from "./access.js";
import { assertManagedContextIdentity, exportManagedMapContext, stageManagedMapContext, verifyManagedMapContext } from "./exportContext.js";
import type { ManagedMapExportReceipt, VerifiedRuntimeFile } from "./exportContext.js";
import { ManagedImageOperations } from "./images.js";
import { startDockerDeviceSignIn } from "./deviceSignIn.js";
import type { RegistryDeviceChallenge } from "./deviceSignIn.js";
import { provisionManagedDestination } from "./provision.js";
import { verifyOwnedManagedHostHealth } from "./verification.js";

export type ManagedHostTarget = "native-windows" | "native-wsl" | "container";
export interface ManagedHostingBuildFacts { sourceCommit: string; runtimeBundle: VerifiedRuntimeFile; containerBaseImage: string; nodeWindows?: VerifiedRuntimeFile; nodeLinux?: VerifiedRuntimeFile }
export interface ManagedHostingHostFacts { dataRoot: string; origin: string; tlsKey: string; tlsCert: string; distribution?: string; linuxContext?: string; linuxDataRoot?: string; linuxTlsKey?: string; linuxTlsCert?: string }
export interface ManagedHostingIpc { handle(channel: string, listener: (event: unknown, value?: unknown) => unknown): void; removeHandler(channel: string): void }
export interface ManagedHostingRegistrationOptions {
    dataFolder: string; safeStorage: SafeStorageLike; storageDir: () => string;
    buildFacts: () => Promise<ManagedHostingBuildFacts>;
    resolveHost: (request: { target: ManagedHostTarget; context: string; port: number }) => Promise<ManagedHostingHostFacts>;
    authorizeSender: (event: unknown) => boolean;
    sendDeviceChallenge?: (event: unknown, challenge: RegistryDeviceChallenge) => void;
    runner?: ProcessRunner;
    startProcess?: (command: string, args: readonly string[]) => Promise<{ hasExited(): boolean; stop?(): Promise<void> }>;
    deviceSignIn?: typeof startDockerDeviceSignIn;
    fetch?: typeof globalThis.fetch;
}
const channels = ["profile:list", "profile:save", "profile:remove", "profile:readiness", "access:prepare", "access:read", "export", "build", "save", "signIn", "signInStatus", "signInCancel", "upload", "deploy", "status", "stop"] as const;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error("Invalid hosting request.");
    return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 4096 || value.includes("\0")) throw new Error("A valid hosting value is required."); return value; }
function target(value: unknown): ManagedHostTarget { if (value !== "native-windows" && value !== "native-wsl" && value !== "container") throw new Error("Choose a supported hosting target."); return value; }
async function startOwnedProcess(command: string, args: readonly string[]): Promise<{ hasExited(): boolean; stop?(): Promise<void> }> {
    return new Promise((resolveStart, reject) => {
        const child = spawn(command, [...args], { shell: false, windowsHide: true, stdio: "ignore" }); let exited = false;
        child.once("error", () => reject(new Error("The host process could not start."))); child.once("exit", () => { exited = true; });
        child.once("spawn", () => resolveStart({ hasExited: () => exited, stop: async () => {
            if (exited) return;
            child.kill();
            await new Promise<void>((done) => { const timer = setTimeout(done, 3000); child.once("exit", () => { clearTimeout(timer); done(); }); });
        } }));
    });
}
interface Deployment { operationId: string; contextFingerprint: string; state: "started" | "healthy" | "exited"; url: string; health: "unverified" | "verified"; lanVerified: boolean; process?: { hasExited(): boolean; stop?(): Promise<void> }; containerId?: string }
export async function verifyWslManagedContext(facts: ManagedHostingHostFacts, expected: ManagedMapExportReceipt, runner: ProcessRunner): Promise<void> {
    if (!facts.distribution || !facts.linuxContext || !facts.linuxContext.startsWith("/")) throw new Error("A verified Linux context is required.");
    const node = expected.files.find(file => file.path === "runtime/node"); if (!node) throw new Error("Verified Linux runtime is unavailable.");
    const binary = await runner.run("wsl.exe", ["--distribution", facts.distribution, "--exec", "sha256sum", "--", facts.linuxContext + "/runtime/node"]);
    if (!binary.started || binary.code !== 0 || binary.stdout.trim().split(/\s/u)[0] !== node.sha256) throw new Error("Selected WSL runtime differs from the reviewed export.");
    const script = "import{lstat}from'node:fs/promises';import{createReadStream}from'node:fs';import{createHash}from'node:crypto';import{join}from'node:path';let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);for(const f of p.files){const n=join(p.root,f.path);const st=await lstat(n);if(!st.isFile()||st.isSymbolicLink())process.exit(1);const h=createHash('sha256');for await(const c of createReadStream(n))h.update(c);if(h.digest('hex')!==f.sha256)process.exit(1)}process.stdout.write(p.fingerprint)";
    const result = await runner.run("wsl.exe", ["--distribution", facts.distribution, "--exec", facts.linuxContext + "/runtime/node", "--input-type=module", "-e", script], { input: JSON.stringify({ root: facts.linuxContext, files: expected.files, fingerprint: expected.contextFingerprint }) });
    if (!result.started || result.code !== 0 || result.stdout !== expected.contextFingerprint) throw new Error("Selected WSL context does not match the reviewed export bytes.");
}

/** Main resolves all provenance and runtime inputs. Renderer input never supplies proof. */
export function registerManagedHostingIpc(ipc: ManagedHostingIpc, options: ManagedHostingRegistrationOptions): { dispose(): void } {
    const runner = options.runner ?? nodeProcessRunner(); const images = new ManagedImageOperations(runner);
    const profiles = new HostingProfileStore(join(options.dataFolder, "managed-hosting", "profiles"), runner);
    const access = new ProtectedAccessStore(join(options.dataFolder, "managed-hosting", "access"), options.safeStorage);
    const ownedContexts = new Map<string, { staging: string; identity: ManagedMapExportReceipt }>(); const builtImages = new Map<string, string>(); const deployments = new Map<string, Deployment>();
    let signIn: { state: string; verificationUrl?: string; userCode?: string } = { state: "idle" };
    let signInAbort: AbortController | null = null;
    const checkedContext = async (value: unknown): Promise<string> => {
        const path = resolve(text(value)); const entry = [...ownedContexts].find(([original, context]) => original === path || context.staging === path); const owned = entry?.[1];
        if (!owned || !entry) throw new Error("Export this context through the verified map workflow first.");
        assertManagedContextIdentity(await verifyManagedMapContext(entry[0]), owned.identity);
        assertManagedContextIdentity(await verifyManagedMapContext(owned.staging), owned.identity);
        return owned.staging;
    };
    const handlers: Record<string, (event: unknown, value: unknown) => Promise<unknown>> = {
        "profile:list": async () => profiles.list(),
        "profile:save": async (_event, value) => profiles.save(value),
        "profile:remove": async (_event, value) => profiles.remove(text(value)),
        "profile:readiness": async (_event, value) => {
            const row = record(value, ["profileId", "context", "target", "port"]);
            const context = await checkedContext(row.context);
            await profiles.resolve(text(row.profileId), { context, target: target(row.target), port: Number(row.port), excludedRoots: [resolve(text(row.context)), options.storageDir()] });
            return { state: "configured", health: "unverified", lanVerified: false, trust: "unverified" };
        },
        "access:prepare": async (_event, value) => { const row = record(value, ["username", "password"]); return access.prepare(text(row.username), text(row.password)); },
        "access:read": async (_event, value) => access.read(text(value)),
        export: async (_event, value) => {
            const row = record(value, ["renderId", "destination", "target"]); const renderId = text(row.renderId); const selected = target(row.target);
            if (!isValidRenderId(renderId)) throw new Error("Invalid render identity.");
            const facts = await options.buildFacts(); const storage = options.storageDir(); const workspace = renderWorkspace(storage, renderId);
            const verified = await verifyFinishedRender(workspace, { sourceCommit: facts.sourceCommit, projectId: null, storageRoot: storage });
            if (!verified.promotion || verified.promotion.verificationStatus !== "verified" || !verified.promotion.outputManifest) throw new Error("A completed provenance-verified render is required for hosting.");
            if (selected === "native-windows" && !facts.nodeWindows || selected === "native-wsl" && !facts.nodeLinux) throw new Error("The matching verified native runtime is unavailable.");
            const destination = resolve(text(row.destination));
            const receipt = await exportManagedMapContext({ renderId, destination, sourceCommit: facts.sourceCommit, webRoot: workspace.webRoot, expectedManifest: verified.promotion.outputManifest, runtimeBundle: facts.runtimeBundle, containerBaseImage: facts.containerBaseImage, ...(facts.nodeWindows ? { nodeWindows: facts.nodeWindows } : {}), ...(facts.nodeLinux ? { nodeLinux: facts.nodeLinux } : {}) });
            const stagingRoot = join(options.dataFolder, "managed-hosting", "contexts"); await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
            const staging = join(stagingRoot, randomUUID());
            await stageManagedMapContext(destination, staging, receipt);
            ownedContexts.set(destination, { staging, identity: structuredClone(receipt) }); return { ...receipt, context: destination, target: selected };
        },
        build: async (_event, value) => { const row = record(value, ["context", "localTag"]); const context = await checkedContext(row.context); const receipt = await images.build(context, text(row.localTag)); builtImages.set(receipt.imageId, context); return receipt; },
        save: async (_event, value) => { const row = record(value, ["context", "imageId", "path"]); const context = await checkedContext(row.context); const id = text(row.imageId); if (builtImages.get(id) !== context) throw new Error("Choose an image built from this verified context."); return images.save(id, text(row.path), context); },
        signIn: async event => {
            if (signIn.state === "pending") return signIn;
            signIn = { state: "pending" }; signInAbort = new AbortController(); const attempt = signInAbort;
            void (options.deviceSignIn ?? startDockerDeviceSignIn)(challenge => { if (attempt.signal.aborted || signInAbort !== attempt) return; signIn = { state: "pending", ...challenge }; options.sendDeviceChallenge?.(event, challenge); }, signInAbort.signal).then(() => { if (!attempt.signal.aborted && signInAbort === attempt) signIn = { state: "complete" }; }, () => { if (!attempt.signal.aborted && signInAbort === attempt) signIn = { state: "failed" }; });
            return signIn;
        },
        signInStatus: async () => ({ ...signIn }),
        signInCancel: async () => { signInAbort?.abort(); signIn = { state: "cancelled" }; return { ...signIn }; },
        upload: async (_event, value) => {
            const row = record(value, ["imageId", "destination", "confirmed"]); const id = text(row.imageId); const context = builtImages.get(id); if (!context) throw new Error("Choose an image built from a verified hosting context."); await checkedContext(context);
            const destination = record(row.destination, ["registry", "namespace", "repository", "tag"]);
            if (destination.registry !== "docker.io" || row.confirmed !== true) throw new Error("Review and confirm the Docker Hub destination first.");
            return images.upload(id, { registry: "docker.io", namespace: text(destination.namespace), repository: text(destination.repository), tag: text(destination.tag), confirmed: true });
        },
        deploy: async (_event, value) => {
            const row = record(value, ["context", "target", "accessReference", "port", "profileId"]); const context = await checkedContext(row.context); const selected = target(row.target); const port = Number(row.port);
            if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Choose a host port from 1024 through 65535.");
            const facts = row.profileId ? await profiles.resolve(text(row.profileId), { context, target: selected, port, excludedRoots: [resolve(text(row.context)), options.storageDir()] }) : await options.resolveHost({ context, target: selected, port });
            const origin = new URL(facts.origin); if (origin.origin !== facts.origin || origin.protocol !== "https:") throw new Error("Configure the exact HTTPS hosting origin and trusted TLS files first.");
            const identity = await verifyManagedMapContext(context);
            if (selected === "native-wsl") await verifyWslManagedContext(facts, identity, runner);
            const reference = text(row.accessReference); const operationId = randomUUID();
            const deployment: Deployment = { operationId, contextFingerprint: identity.contextFingerprint, state: "started", url: facts.origin, health: "unverified", lanVerified: false };
            if (selected === "container") {
                const imageId = [...builtImages].find(([, path]) => path === context)?.[0]; if (!imageId) throw new Error("Build this verified image before container deployment.");
                if ([facts.dataRoot, facts.tlsKey, facts.tlsCert].some(path => path.includes(","))) throw new Error("Choose private storage and TLS paths without commas.");
                await provisionManagedDestination(access, reference, { kind: "docker", context, image: imageId, dataRoot: facts.dataRoot }, runner);
                const result = await runner.run("docker", ["run", "--detach", "--read-only", "--security-opt", "no-new-privileges", "--cap-drop", "ALL", "--publish", `${port}:8443`, "--mount", `type=bind,source=${facts.dataRoot},target=/data`, "--mount", `type=bind,source=${facts.tlsKey},target=/tls/tls.key,readonly`, "--mount", `type=bind,source=${facts.tlsCert},target=/tls/tls.crt,readonly`, "--env", `WORLDLENS_HOST_ORIGIN=${facts.origin}`, "--env", `WORLDLENS_HOST_OPERATION=${operationId}`, "--env", `WORLDLENS_HOST_CONTEXT=${identity.contextFingerprint}`, "--env", "WORLDLENS_HOST_TLS_KEY=/tls/tls.key", "--env", "WORLDLENS_HOST_TLS_CERT=/tls/tls.crt", imageId]);
                if (!result.started || result.code !== 0 || !/^[a-f0-9]{64}$/u.test(result.stdout.trim())) throw new Error("The authenticated container did not start."); deployment.containerId = result.stdout.trim();
            } else {
                let command: string; let args: string[];
                if (selected === "native-windows") {
                    await provisionManagedDestination(access, reference, { kind: "native-windows", context, dataRoot: facts.dataRoot }, runner);
                    command = join(context, "runtime", "node.exe"); args = [join(context, "managed-host.mjs"), "--data-root", facts.dataRoot, "--map-root", join(context, "map"), "--origin", facts.origin, "--port", String(port), "--tls-key", facts.tlsKey, "--tls-cert", facts.tlsCert];
                } else {
                    if (!facts.distribution || !facts.linuxContext || !facts.linuxDataRoot || !facts.linuxTlsKey || !facts.linuxTlsCert) throw new Error("Configure the selected WSL distribution, runtime and private storage first.");
                    await provisionManagedDestination(access, reference, { kind: "wsl", context, distribution: facts.distribution, linuxContext: facts.linuxContext, linuxDataRoot: facts.linuxDataRoot }, runner);
                    command = "wsl.exe"; args = ["--distribution", facts.distribution, "--exec", facts.linuxContext + "/runtime/node", facts.linuxContext + "/managed-host.mjs", "--data-root", facts.linuxDataRoot, "--map-root", facts.linuxContext + "/map", "--origin", facts.origin, "--port", String(port), "--tls-key", facts.linuxTlsKey, "--tls-cert", facts.linuxTlsCert];
                }
                args.push("--operation-id", operationId, "--context-fingerprint", identity.contextFingerprint);
                const process = await (options.startProcess ?? startOwnedProcess)(command, args);
                deployment.process = selected === "native-wsl" ? { hasExited: () => process.hasExited() } : process;
            }
            deployments.set(operationId, deployment); return observe(deployment);
        },
        stop: async (_event, value) => {
            const operation = deployments.get(text(value)); if (!operation) throw new Error("This host operation is unavailable in the current session.");
            if (operation.containerId) {
                const result = await runner.run("docker", ["stop", "--time", "10", operation.containerId]);
                if (!result.started || result.code !== 0) throw new Error("The owned container did not confirm a stop.");
            } else if (operation.process?.stop) await operation.process.stop();
            else throw new Error("Stopping this process is unavailable; its state has not been changed.");
            return observe(operation);
        },
        status: async (_event, value) => { const operation = deployments.get(text(value)); if (!operation) throw new Error("This host operation is unavailable in the current session."); return observe(operation); },
    };
    async function observe(operation: Deployment): Promise<unknown> {
        let exited = operation.process?.hasExited() === true;
        if (operation.containerId) { const result = await runner.run("docker", ["inspect", "--format", "{{.State.Running}}", operation.containerId]); if (!result.started || result.code !== 0) throw new Error("Container observation is unavailable."); exited = result.stdout.trim() !== "true"; }
        if (exited) { operation.state = "exited"; operation.health = "unverified"; operation.lanVerified = false; }
        else { try {
            const health = await verifyOwnedManagedHostHealth(operation.url, operation, async () => {
                if (operation.process) return !operation.process.hasExited();
                if (!operation.containerId) return false;
                const check = await runner.run("docker", ["inspect", "--format", "{{.State.Running}}", operation.containerId]); return check.started && check.code === 0 && check.stdout.trim() === "true";
            }, options.fetch);
            operation.state = "healthy"; operation.health = "verified"; operation.lanVerified = health.lanVerified;
        } catch { operation.state = operation.process?.hasExited() ? "exited" : "started"; operation.health = "unverified"; operation.lanVerified = false; } }
        return { operationId: operation.operationId, state: operation.state, url: operation.url, health: operation.health, lanVerified: operation.lanVerified };
    }
    for (const name of channels) ipc.handle("managedHosting:" + name, async (event, value) => {
        if (!options.authorizeSender(event)) return { ok: false, failure: { message: "This sender cannot manage hosting." } };
        try { return { ok: true, value: await handlers[name]!(event, value) }; }
        catch (error) { return { ok: false, failure: { message: error instanceof Error ? error.message : "Hosting operation did not complete." } }; }
    });
    return { dispose() { signInAbort?.abort(); for (const name of channels) ipc.removeHandler("managedHosting:" + name); } };
}
