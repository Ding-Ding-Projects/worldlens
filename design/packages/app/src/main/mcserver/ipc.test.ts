import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    MCSERVER_CHANNELS,
    registerMcServerHandlers,
    safeContainerServerDir,
    type IpcMainLike,
    type McServerIpc,
} from "./ipc.js";
import type { ServerRecord } from "./registry.js";
import type { SafeStorageLike } from "./rcon/secret.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";

/** Reversible but obviously not real encryption - same fake as rcon/secret.test.ts. */
function fakeSafeStorage(available = true): SafeStorageLike {
    return {
        isEncryptionAvailable: () => available,
        encryptString: (text) => Buffer.from(`sealed:${text}`, "utf8"),
        decryptString: (buffer) => buffer.toString("utf8").replace(/^sealed:/, ""),
    };
}

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

/** A stand-in for `ipcMain` so nothing here needs Electron. */
function fakeIpc(): IpcMainLike & { handlers: Map<string, Handler>; removed: string[] } {
    const handlers = new Map<string, Handler>();
    const removed: string[] = [];
    return {
        handlers,
        removed,
        handle(channel: string, handler: unknown): void {
            handlers.set(channel, handler as Handler);
        },
        removeHandler(channel: string): void {
            removed.push(channel);
            handlers.delete(channel);
        },
    } as IpcMainLike & { handlers: Map<string, Handler>; removed: string[] };
}

function dockerOutput(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

const RECORD: ServerRecord = {
    id: "survival",
    name: "Survival",
    flavour: "paper",
    minecraftVersion: "1.21.4",
    ref: { kind: "local-docker", containerRef: "mc-survival", serverDir: "/data" },
    origin: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    hasRconSecret: false,
    rconPort: null,
    writeScope: [],
    localRuntime: null,
};

describe("registerMcServerHandlers", () => {
    let dir: string;
    let ipc: ReturnType<typeof fakeIpc>;
    let registered: McServerIpc;
    let calls: { command: string; args: readonly string[] }[];

    const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
        const handler = ipc.handlers.get(channel);
        if (handler === undefined) throw new Error(`no handler for ${channel}`);
        return handler({}, ...args);
    };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-mcipc-"));
        ipc = fakeIpc();
        calls = [];
        const runner: CommandRunner = async (command, args) => {
            calls.push({ command, args });
            if (args[0] === "inspect") {
                return dockerOutput({
                    stdout: JSON.stringify({ Status: "running", Running: true, ExitCode: 0 }),
                });
            }
            return dockerOutput();
        };
        registered = registerMcServerHandlers(ipc, {
            dataFolder: dir,
            factory: { runner },
            safeStorage: fakeSafeStorage(),
            nativeRestoreConfirm: async () => true,
        });
        await registered.registry.put(RECORD);
    });

    afterEach(async () => {
        registered.dispose();
        await rm(dir, { recursive: true, force: true });
    });

    it("registers every channel it declares", () => {
        for (const channel of Object.values(MCSERVER_CHANNELS)) {
            expect(ipc.handlers.has(channel)).toBe(true);
        }
    });

    it("builds a local-process transport from the runtime stored on the record", async () => {
        // `createTransport` demands a `localRuntime` callback for every local-process ref
        // and nothing outside this module supplied one, so every local server ever created
        // answered "This server has no Java runtime chosen yet." to start, status, RCON and
        // config - on every machine, whatever Java was installed. No test referenced
        // `localRuntime` at all, which is why it shipped.
        await registered.registry.put({
            ...RECORD,
            id: "local",
            name: "Local",
            ref: { kind: "local-process", serverDir: join(dir, "local") },
            localRuntime: { javaPath: "/usr/bin/java", jarPath: "/srv/server.jar", memoryMb: 2048 },
        });

        const answer = (await invoke(MCSERVER_CHANNELS.status, "local")) as {
            ok: boolean;
            failure?: { message: string };
        };
        expect(answer.failure?.message ?? "").not.toMatch(/no Java runtime chosen yet/);
        expect(answer.ok).toBe(true);
    });

    it("removes every channel on dispose", () => {
        registered.dispose();
        for (const channel of Object.values(MCSERVER_CHANNELS)) {
            expect(ipc.removed).toContain(channel);
        }
    });

    it("lists saved servers", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.list)) as {
            ok: boolean;
            value: ServerRecord[];
        };
        expect(answer.ok).toBe(true);
        expect(answer.value).toHaveLength(1);
    });

    it("edits only metadata on an existing server", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.save, {
            id: "survival",
            name: "Renamed",
            flavour: "purpur",
            minecraftVersion: "1.21.5",
        })) as { ok: boolean; value?: ServerRecord };
        expect(answer.ok).toBe(true);
        expect(answer.value?.name).toBe("Renamed");
        expect(answer.value?.origin).toBe("created");
        expect(answer.value?.ref).toEqual(RECORD.ref);
    });

    it("refuses a renderer-forged container record and origin", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.save, {
            ...RECORD,
            id: "victim",
            ref: { kind: "local-docker", containerRef: "victim-container", serverDir: "/" },
            origin: "created",
        })) as { ok: boolean; failure?: { code: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure?.code).toBe("invalid-request");
        const missing = await registered.registry.get("victim");
        expect(missing.ok).toBe(false);
    });

    it("refuses to reclassify an adopted record through the renderer edit route", async () => {
        const adopted = { ...RECORD, id: "adopted", origin: "adopted" as const };
        await registered.registry.put(adopted);
        const answer = (await invoke(MCSERVER_CHANNELS.save, {
            ...adopted,
            origin: "created",
        })) as { ok: boolean; failure?: { code: string } };
        expect(answer.ok).toBe(false);
        const stored = await registered.registry.get("adopted");
        expect(stored.ok && stored.value.origin).toBe("adopted");
    });

    it("reports status through the transport", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.status, "survival")) as {
            ok: boolean;
            value: { running: boolean };
        };
        expect(answer.ok).toBe(true);
        expect(answer.value.running).toBe(true);
    });

    it("refuses an unknown server rather than reaching for a machine", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.status, "ghost")) as {
            ok: boolean;
            failure: { code: string };
        };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("not-found");
        expect(calls).toHaveLength(0);
    });

    it("refuses a malformed server name before doing anything", async () => {
        for (const bad of [undefined, null, 42, "", "x".repeat(500)]) {
            const answer = (await invoke(MCSERVER_CHANNELS.status, bad)) as {
                ok: boolean;
                failure: { code: string };
            };
            expect(answer.ok).toBe(false);
            expect(answer.failure.code).toBe("invalid-request");
        }
        expect(calls).toHaveLength(0);
    });

    it("stops gracefully when the renderer says nothing about it", async () => {
        // A missing or malformed flag must never be read as "kill it" - that costs
        // whatever the server has not saved since its last autosave.
        await invoke(MCSERVER_CHANNELS.stop, "survival", undefined);
        expect(calls[0]?.args[0]).toBe("stop");

        calls.length = 0;
        await invoke(MCSERVER_CHANNELS.stop, "survival", { graceful: "no thanks" });
        expect(calls[0]?.args[0]).toBe("stop");
    });

    it("kills only when the renderer explicitly asks", async () => {
        await invoke(MCSERVER_CHANNELS.stop, "survival", { graceful: false });
        expect(calls[0]?.args[0]).toBe("kill");
    });

    it("clamps an absurd stop timeout instead of passing it through", async () => {
        await invoke(MCSERVER_CHANNELS.stop, "survival", { graceful: true, timeoutMs: 99_999_999 });
        expect(calls[0]?.args).toEqual(["stop", "--timeout", "60", "mc-survival"]);
    });

    it("refuses a path with a line break before it reaches the machine", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.fileRead, "survival", "a\nb.yml")) as {
            ok: boolean;
            failure: { code: string };
        };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("invalid-request");
        expect(calls).toHaveLength(0);
    });

    it("refuses a write whose body is not readable", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.fileWrite, "survival", "server.properties", {
            text: 42,
        })) as { ok: boolean; failure: { code: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("refuses root and host-sensitive container destinations even when the host source is safe", () => {
        for (const path of [
            "/",
            "/root",
            "/home",
            "/etc",
            "/usr",
            "/var",
            "/opt/tmp",
            "/custom/server",
        ]) {
            expect(safeContainerServerDir(path)).toBe(false);
        }
        expect(safeContainerServerDir("/data")).toBe(true);
        expect(safeContainerServerDir("/server/world")).toBe(true);
    });

    it("configures RCON through the vault without returning the password", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.rconConfigure, "survival", {
            port: 25_575,
            password: "fixture-password",
        })) as {
            ok: boolean;
            value?: { configured: boolean; port: number };
        };
        expect(answer).toEqual({ ok: true, value: { configured: true, port: 25_575 } });
        const saved = await registered.registry.get("survival");
        expect(saved.ok && saved.value.hasRconSecret).toBe(true);
        expect(saved.ok && saved.value.rconPort).toBe(25_575);
        expect(JSON.stringify(answer)).not.toContain("fixture-password");
    });

    it("issues a scoped one-time restore receipt only after a main challenge and native evidence", async () => {
        const refused = (await invoke(MCSERVER_CHANNELS.backupRestoreIssue, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            challenge: "not-issued",
            proof: { keyOne: true, keyTwo: true, travel: 100 },
        })) as { ok: boolean; failure: { code: string } };
        expect(refused.ok).toBe(false);
        expect(refused.failure.code).toBe("denied");
        const challenge = (await invoke(MCSERVER_CHANNELS.backupRestoreChallenge, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
        })) as { ok: boolean; value?: { challenge: string; expiresAt: number } };
        expect(challenge.ok).toBe(true);
        for (const step of [
            { step: "key-one", value: true },
            { step: "key-two", value: true },
            { step: "slider", value: 100 },
        ]) {
            const transition = (await invoke(MCSERVER_CHANNELS.backupRestoreStep, "survival", {
                challenge: challenge.value?.challenge,
                ...step,
            })) as { ok: boolean };
            expect(transition.ok).toBe(true);
        }
        const authorized = (await invoke(MCSERVER_CHANNELS.backupRestoreAuthorize, "survival", {
            challenge: challenge.value?.challenge,
        })) as { ok: boolean; value?: { authorization: string } };
        expect(authorized.ok).toBe(true);
        const issued = (await invoke(MCSERVER_CHANNELS.backupRestoreIssue, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
            challenge: challenge.value?.challenge,
            authorization: authorized.value?.authorization,
        })) as { ok: boolean; value?: { receipt: string; expiresAt: number } };
        expect(issued.ok).toBe(true);
        expect(issued.value?.receipt.length).toBe(64);
        expect(issued.value?.expiresAt).toBeGreaterThan(Date.now());
        const replay = (await invoke(MCSERVER_CHANNELS.backupRestoreIssue, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
            challenge: challenge.value?.challenge,
            proof: { keyOne: true, keyTwo: true, travel: 100 },
        })) as { ok: boolean; failure: { code: string } };
        expect(replay.ok).toBe(false);
        expect(replay.failure.code).toBe("denied");
    });

    it("refuses fabricated confirmation booleans and wrong restore scopes", async () => {
        const challenge = (await invoke(MCSERVER_CHANNELS.backupRestoreChallenge, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
        })) as { ok: boolean; value?: { challenge: string } };
        expect(challenge.ok).toBe(true);
        const wrongProof = (await invoke(MCSERVER_CHANNELS.backupRestoreIssue, "survival", {
            owner: "fixture-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
            challenge: challenge.value?.challenge,
            authorization: "fabricated-authorization",
            superConfirmed: true,
            proof: { keyOne: true, keyTwo: false, travel: 100 },
        })) as { ok: boolean; failure: { code: string } };
        expect(wrongProof.ok).toBe(false);
        const wrongOwner = (await invoke(MCSERVER_CHANNELS.backupRestoreIssue, "survival", {
            owner: "other-owner",
            repo: "fixture-backups",
            tag: "fixture-tag",
            worldFolder: "/data",
            challenge: challenge.value?.challenge,
            proof: { keyOne: true, keyTwo: true, travel: 100 },
        })) as { ok: boolean; failure: { code: string } };
        expect(wrongOwner.ok).toBe(false);
    });

    it("carries the record's write scope into the transport", async () => {
        await registered.registry.put({ ...RECORD, writeScope: ["plugins"] });
        const answer = (await invoke(MCSERVER_CHANNELS.fileWrite, "survival", "server.properties", {
            text: "pvp=false",
            expectedHash: null,
        })) as { ok: boolean; failure: { code: string } };

        // The scope is stored on the record, so a handler that built a transport without it
        // would silently ignore what the user consented to on an adopted container.
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("out-of-scope");
    });

    it("uses the typed local Docker create route without invoking local-process creation", async () => {
        calls.length = 0;
        const answer = (await invoke(MCSERVER_CHANNELS.create, {
            id: "fixture-docker",
            name: "Fixture Docker",
            flavour: "paper",
            version: "1.21.4",
            memoryMb: 1024,
            acceptedEula: true,
            runtime: "local-docker",
            dockerPlan: {
                image: "example/minecraft@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                imageVerified: true,
                containerRef: "fixture-container",
                serverDir: "/data",
                ports: [{ host: 25565, container: 25565 }],
            },
        })) as { ok: boolean; value?: ServerRecord };
        expect(answer.ok).toBe(true);
        expect(
            calls.some((call) => call.command === "docker" && call.args.includes("--label")),
        ).toBe(true);
        expect(calls.some((call) => call.args.includes("127.0.0.1:25565:25565"))).toBe(true);
        expect(calls.some((call) => call.args.includes("java"))).toBe(false);
        expect(answer.value?.ref).toEqual({
            kind: "local-docker",
            containerRef: "fixture-container",
            serverDir: "/data",
        });
    });

    it("forgetting a server never asks Docker to remove anything", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.forget, "survival")) as { ok: boolean };
        expect(answer.ok).toBe(true);
        // Forgetting is not deleting. This is what makes releasing an adopted container safe.
        expect(calls.some((call) => call.args.includes("rm"))).toBe(false);
        const listed = (await invoke(MCSERVER_CHANNELS.list)) as {
            ok: boolean;
            value: ServerRecord[];
        };
        expect(listed.value).toHaveLength(0);
    });
});

describe("registerMcServerHandlers - catalogue, java and create channels", () => {
    let dir: string;
    let ipc: ReturnType<typeof fakeIpc>;

    const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
        const handler = ipc.handlers.get(channel);
        if (handler === undefined) throw new Error(`no handler for ${channel}`);
        return handler({}, ...args);
    };

    const VANILLA_MANIFEST = JSON.stringify({
        versions: [{ id: "1.21.4", type: "release", url: "https://example.test/1.21.4.json" }],
    });
    const VANILLA_DETAIL = JSON.stringify({
        downloads: {
            server: { url: "https://example.test/server-1.21.4.jar", sha1: "x", size: 10 },
        },
        javaVersion: { majorVersion: 21 },
    });
    const EMPTY_LIST = JSON.stringify({ versions: [] });
    const EMPTY_LOADERS = JSON.stringify([]);

    const routes: Record<string, string> = {
        "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json": VANILLA_MANIFEST,
        "https://example.test/1.21.4.json": VANILLA_DETAIL,
        "https://api.papermc.io/v2/projects/paper": EMPTY_LIST,
        "https://api.papermc.io/v2/projects/velocity": EMPTY_LIST,
        "https://api.purpurmc.org/v2/purpur": EMPTY_LIST,
        "https://meta.fabricmc.net/v2/versions/loader": EMPTY_LOADERS,
    };

    const fetchText = async (url: string): Promise<string> => {
        for (const [prefix, body] of Object.entries(routes)) {
            if (url.startsWith(prefix)) return body;
        }
        throw new Error(`unexpected fetch: ${url}`);
    };

    const noJavaRunner = async () => ({ ok: false, stdout: "", stderr: "", error: "no java here" });
    const noJavaExists = () => false;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-mcipc-catalogue-"));
        ipc = fakeIpc();
        registerMcServerHandlers(ipc, {
            dataFolder: dir,
            fetchText,
            javaRunner: noJavaRunner,
            javaExists: noJavaExists,
            safeStorage: fakeSafeStorage(),
        });
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("lists the real catalogue shape through mcserver:catalogue:list", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.catalogueList)) as {
            ok: boolean;
            value: { flavours: { flavour: string; versions: unknown[] }[] };
        };
        expect(answer.ok).toBe(true);
        const vanilla = answer.value.flavours.find((f) => f.flavour === "vanilla");
        expect(vanilla?.versions).toHaveLength(1);
    });

    it("refreshes the catalogue through mcserver:catalogue:refresh", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.catalogueRefresh)) as { ok: boolean };
        expect(answer.ok).toBe(true);
    });

    it("resolves a Java requirement and reports no installation without inventing one", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.javaResolve, "1.20.4")) as {
            ok: boolean;
            value: { requirement: { known: boolean; feature?: number }; installation: unknown };
        };
        expect(answer.ok).toBe(true);
        expect(answer.value.requirement).toEqual({ known: true, feature: 17 });
        expect(answer.value.installation).toBeNull();
    });

    it("refuses to resolve a Java requirement for a malformed version argument", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.javaResolve, 42)) as {
            ok: boolean;
            failure: { code: string };
        };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("refuses to create a server with an unsupported flavour", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.create, {
            id: "survival",
            name: "Survival",
            flavour: "bedrock-only-thing",
            version: "1.21.4",
            memoryMb: 1024,
        })) as { ok: boolean; failure: { code: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("refuses to create a server whose details are not readable", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.create, "not an object")) as {
            ok: boolean;
            failure: { code: string };
        };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("accepts the transport object the wizard really sends, with no runtime string", async () => {
        // The renderer has never set `runtime`. It sends `transport` as a TransportRef
        // object, and the handler used to compare that object against string literals,
        // so it matched neither and every local runtime was refused with "not supported
        // by this build". Every other create test sends the string form or omits it,
        // which is why a green suite said nothing about the shipped path.
        //
        // An unknown version keeps this about the seam: reaching the version lookup at
        // all proves the runtime check accepted the object and let creation proceed.
        const answer = (await invoke(MCSERVER_CHANNELS.create, {
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.0.0-does-not-exist",
            memoryMb: 1024,
            acceptedEula: true,
            transport: { kind: "local-process", serverDir: "/servers/survival" },
        })) as { ok: boolean; failure: { code: string; message: string } };
        expect(answer.failure.message).not.toMatch(/not supported by this build/);
        expect(answer.failure.code).toBe("not-found");
    });

    it("names the runtime it cannot create here rather than blaming the build", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.create, {
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            acceptedEula: true,
            transport: { kind: "aws", region: "us-east-1" },
        })) as { ok: boolean; failure: { message: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure.message).toContain("aws");
    });

    it("refuses to create a server for an unknown version without downloading anything", async () => {
        const answer = (await invoke(MCSERVER_CHANNELS.create, {
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.0.0-does-not-exist",
            memoryMb: 1024,
            acceptedEula: true,
        })) as { ok: boolean; failure: { code: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure.code).toBe("not-found");
    });
});
