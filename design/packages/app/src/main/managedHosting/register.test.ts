import { afterEach, expect, test, vi } from "vitest";
vi.mock("../render/promotion.js", () => ({ verifyFinishedRender: vi.fn(async () => ({ promotion: null })) }));
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedHostingIpc, verifyWslManagedContext } from "./register.js";
import type { ManagedMapExportReceipt } from "./exportContext.js";
import type { ProcessRunner } from "../cirender/gh.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup(authorized = true) {
    const root = await mkdtemp(join(tmpdir(), "hosting-register-")); roots.push(root);
    const handlers = new Map<string, (event: unknown, value?: unknown) => unknown>();
    const calls: string[] = []; const facts = vi.fn(async () => { throw new Error("No runtime configured for this test."); });
    const registration = registerManagedHostingIpc({ handle: (channel, listener) => { handlers.set(channel, listener); }, removeHandler: channel => { handlers.delete(channel); } }, {
        dataFolder: root, storageDir: () => join(root, "renders"), authorizeSender: () => authorized,
        safeStorage: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(Buffer.from(value).map(byte => byte ^ 0x5a)), decryptString: value => Buffer.from(Buffer.from(value).map(byte => byte ^ 0x5a)).toString() },
        buildFacts: facts, resolveHost: async () => { throw new Error("No host configured."); },
        deviceSignIn: async onChallenge => { calls.push("device"); onChallenge({ verificationUrl: "https://login.docker.com/activate", userCode: "TEST-CODE" }); },
    });
    const invoke = (name: string, value?: unknown) => handlers.get("managedHosting:" + name)!({}, value) as Promise<{ ok: boolean; value?: Record<string, unknown>; failure?: { message: string } }>;
    return { handlers, registration, invoke, facts, calls };
}
test("registrar authorizes the sender before reading credentials or performing any operation", async () => {
    const { invoke, facts, calls } = await setup(false);
    expect((await invoke("access:prepare", { username: "admin", password: "test-only-password" })).ok).toBe(false);
    expect((await invoke("export", { renderId: "test", destination: "unused", target: "container" })).ok).toBe(false);
    expect((await invoke("signIn")).ok).toBe(false); expect(facts).not.toHaveBeenCalled(); expect(calls).toEqual([]);
});
test("registrar refuses renderer provenance fields and unrelated contexts before process work", async () => {
    const { invoke, facts } = await setup();
    expect((await invoke("export", { renderId: "test", destination: "unused", target: "container", expectedManifest: {} })).ok).toBe(false);
    expect(facts).not.toHaveBeenCalled();
    expect((await invoke("build", { context: "unrelated", localTag: "worldlens-map:test" })).ok).toBe(false);
    expect((await invoke("upload", { imageId: "sha256:" + "a".repeat(64), confirmed: true, destination: { registry: "docker.io", namespace: "owner", repository: "map", tag: "v1" } })).ok).toBe(false);
});
test("preparation/read and guided sign-in have concrete consumers and independent states", async () => {
    const { invoke, registration, handlers } = await setup();
    const prepared = await invoke("access:prepare", { username: "admin", password: "test-only-password" });
    expect(prepared.ok).toBe(true); expect(prepared.value?.state).toBe("prepared"); expect(prepared.value).not.toHaveProperty("password");
    const read = await invoke("access:read", prepared.value?.reference); expect(read.value?.state).toBe("prepared");
    expect((await invoke("signIn")).ok).toBe(true); await Promise.resolve();
    expect((await invoke("signInStatus")).value?.state).toBe("complete");
    expect(handlers.size).toBe(10); registration.dispose(); expect(handlers.size).toBe(0);
});
test("WSL bootstrap cannot trust a selected Linux path without matching reviewed bytes", async () => {
    const expected = { files: [{ path: "runtime/node", sha256: "a".repeat(64), bytes: 1 }], contextFingerprint: "b".repeat(64) } as ManagedMapExportReceipt;
    const facts = { dataRoot: "unused", origin: "https://host.invalid", tlsKey: "unused", tlsCert: "unused", distribution: "Ubuntu", linuxContext: "/reviewed/context" };
    const calls: string[][] = [];
    const runner: ProcessRunner = { async run(command, args) { calls.push([command, ...args]); return { started: true, code: 0, stdout: args.includes("sha256sum") ? "a".repeat(64) + "  /reviewed/context/runtime/node" : "different-context", stderr: "" }; }, async runToFile() { throw new Error("unused"); } };
    await expect(verifyWslManagedContext(facts, expected, runner)).rejects.toThrow("reviewed export bytes");
    expect(calls).toHaveLength(2);
    const wrongBinary: ProcessRunner = { ...runner, async run() { return { started: true, code: 0, stdout: "0".repeat(64), stderr: "" }; } };
    await expect(verifyWslManagedContext(facts, expected, wrongBinary)).rejects.toThrow("runtime differs");
});
