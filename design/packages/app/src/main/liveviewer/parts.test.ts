import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@worldlens/liveviewer";
import { IMAGE_META, IMAGE_TAR, readBundledImage } from "./bundledImage.js";
import { hostChoices, serverChoices } from "./choices.js";
import { createLiveViewerAccounts, createPromptSource, type ProtectedAccountsLike } from "./accounts.js";
import { parseHostRequest } from "./ipc.js";
import { isLoopbackHost, lanAddressFrom } from "./lan.js";
import { firstLanAddress, instanceNames, portIsPublished, runArgs, validInstanceId, writeVolumeFileArgs } from "./plan.js";
import { InstanceRegistry, parseInstance } from "./registry.js";
import type { ViewerInstance } from "./types.js";

let folder: string;
beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "lv-parts-"));
});
afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

const instance: ViewerInstance = {
    id: "abc123def456",
    name: "Survival viewer",
    createdAt: "2026-11-23T10:00:00.000Z",
    target: { kind: "local" },
    hostPort: 3907,
    lanAddress: "192.0.2.59",
    url: "http://192.0.2.59:3907/",
    containerName: "lv-abc123def456",
    image: "worldlens-live-viewer:bundled-1.0.0",
    kind: "viewer",
    botName: "LensBot",
    serverLabel: "192.0.2.50:25565",
    auth: "offline",
    accountRef: null,
};

describe("plan", () => {
    it("derives fixed names from a validated id", () => {
        expect(validInstanceId("abc123def456")).toBe(true);
        expect(validInstanceId("../etc")).toBe(false);
        expect(validInstanceId("ABC")).toBe(false);
        expect(instanceNames("abc123def456")).toEqual({ container: "lv-abc123def456", configVolume: "lv-abc123def456-config", secretsVolume: "lv-abc123def456-secrets" });
    });

    it("mounts the config read-only and the secrets only when asked", () => {
        const base = { id: "abc123def456", owner: "o", image: "img:1", hostPort: 3907 };
        expect(runArgs({ ...base, withSecrets: false }).join(" ")).not.toContain("/secrets");
        expect(runArgs({ ...base, withSecrets: true }).join(" ")).toContain("lv-abc123def456-secrets:/secrets");
        expect(runArgs({ ...base, withSecrets: false })).toContain("--pids-limit");
    });

    it("writes volume files from a throwaway no-network container as the viewer's own user", () => {
        const args = writeVolumeFileArgs("img:1", "vol", "/secrets", "auth.json");
        expect(args).toEqual(expect.arrayContaining(["--network", "none", "--user", "1000:1000", "--entrypoint", "sh"]));
        expect(args.at(-1)).toBe("umask 077 && cat > /secrets/auth.json");
    });

    it("detects a published port in docker ps output", () => {
        expect(portIsPublished("0.0.0.0:3907->3007/tcp, :::3907->3007/tcp", 3907)).toBe(true);
        expect(portIsPublished("0.0.0.0:13907->3007/tcp", 3907)).toBe(false);
        expect(portIsPublished("3007/tcp", 3007)).toBe(false);
    });

    it("picks a LAN address and skips container bridges", () => {
        expect(firstLanAddress("172.17.0.1 192.0.2.60 fe80::1")).toBeNull();
        expect(firstLanAddress("172.17.0.1 192.168.1.20")).toBe("192.168.1.20");
        expect(firstLanAddress("10.0.0.5")).toBe("10.0.0.5");
        expect(firstLanAddress("203.0.113.9")).toBeNull();
    });
});

describe("lan", () => {
    const entry = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal, netmask: "", mac: "", cidr: null });

    it("prefers a physical adapter and ignores virtual and loopback ones", () => {
        const found = lanAddressFrom({ "vEthernet (WSL)": [entry("172.30.0.1")], Ethernet: [entry("192.168.1.20")], Loopback: [entry("127.0.0.1", true)] });
        expect(found).toBe("192.168.1.20");
    });

    it("falls back to a virtual adapter rather than inventing an address, and reports none honestly", () => {
        expect(lanAddressFrom({ "vEthernet (WSL)": [entry("172.30.0.1")] })).toBe("172.30.0.1");
        expect(lanAddressFrom({})).toBeNull();
        expect(lanAddressFrom({ Wi: [entry("203.0.113.9")] })).toBeNull();
    });

    it("recognises loopback hosts", () => {
        for (const host of ["localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) expect(isLoopbackHost(host), host).toBe(true);
        expect(isLoopbackHost("192.0.2.5")).toBe(false);
    });
});

describe("registry", () => {
    it("round-trips an instance and drops a record that fails validation", async () => {
        const registry = new InstanceRegistry(folder);
        await registry.add(instance);
        expect(await registry.list()).toEqual([instance]);
        await writeFile(join(folder, "live-viewers.v1.json"), JSON.stringify({ version: 1, instances: [instance, { ...instance, id: "../bad" }, { ...instance, id: "zzzzzzzzzzzz", hostPort: 0 }] }));
        expect((await registry.list()).map((entry) => entry.id)).toEqual(["abc123def456"]);
        await registry.remove("abc123def456");
        expect(await registry.list()).toEqual([]);
    });

    it("treats a wrong version or a corrupt file as empty", async () => {
        await writeFile(join(folder, "live-viewers.v1.json"), "{broken");
        expect(await new InstanceRegistry(folder).list()).toEqual([]);
        await writeFile(join(folder, "live-viewers.v1.json"), JSON.stringify({ version: 9, instances: [instance] }));
        expect(await new InstanceRegistry(folder).list()).toEqual([]);
    });

    it("validates targets and account references", () => {
        expect(parseInstance({ ...instance, target: { kind: "ssh", hostId: "pi" } })).not.toBeNull();
        expect(parseInstance({ ...instance, target: { kind: "ssh", hostId: "Pi; rm" } })).toBeNull();
        expect(parseInstance({ ...instance, accountRef: "not-a-uuid" })).toBeNull();
    });
});

describe("hosting request parsing", () => {
    const base = { config: DEFAULT_CONFIG, target: { kind: "local" }, hostPort: 3907, name: "A viewer" };

    it("accepts a valid request and discards a renderer-supplied vocabulary", () => {
        const parsed = parseHostRequest({ ...base, config: { ...DEFAULT_CONFIG, vocabulary: { x: "y" } } });
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.request.config.vocabulary).toEqual({});
    });

    it("rejects malformed requests with a reason", () => {
        for (const bad of [null, { ...base, target: { kind: "ssh", hostId: "Bad Id" } }, { ...base, hostPort: "3907" }, { ...base, name: "" }, { ...base, accountRef: "x" }, { ...base, config: { ...DEFAULT_CONFIG, viewDistance: 99 } }]) {
            const parsed = parseHostRequest(bad);
            expect(parsed.ok).toBe(false);
            if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(0);
        }
    });
});

describe("bundled image", () => {
    async function stage(tar: string, meta: Record<string, unknown> = {}): Promise<void> {
        await writeFile(join(folder, IMAGE_TAR), tar);
        const sha256 = createHash("sha256").update(tar).digest("hex");
        await writeFile(join(folder, IMAGE_META), JSON.stringify({ reference: "worldlens-live-viewer:bundled-1.0.0", version: "1.0.0", bytes: Buffer.byteLength(tar), sha256, ...meta }));
    }

    it("reads a staged image whose checksum matches", async () => {
        await stage("tar-bytes");
        const result = await readBundledImage(folder);
        expect(result.ok).toBe(true);
    });

    it("refuses a tampered archive and a missing one", async () => {
        await stage("tar-bytes");
        await writeFile(join(folder, IMAGE_TAR), "tar-bytez");
        const tampered = await readBundledImage(folder);
        expect(tampered).toMatchObject({ ok: false, reason: "corrupt" });
        expect(await readBundledImage(join(folder, "nowhere"))).toMatchObject({ ok: false, reason: "missing" });
    });

    it("refuses a description with a bad reference", async () => {
        await stage("x", { reference: "bad reference with spaces" });
        expect(await readBundledImage(folder)).toMatchObject({ ok: false, reason: "corrupt" });
    });
});

describe("choices", () => {
    it("lists managed servers, using localhost for this PC and skipping unresolvable SSH hosts", () => {
        const records = [
            { id: "a", name: "Survival", minecraftVersion: "1.21.4", ref: { kind: "local-process" } },
            { id: "b", name: "Remote", minecraftVersion: null, ref: { kind: "ssh-docker", hostId: "pi" } },
            { id: "c", name: "Gone", minecraftVersion: null, ref: { kind: "ssh-docker", hostId: "missing" } },
        ];
        const choices = serverChoices(records, (hostId) => (hostId === "pi" ? "192.0.2.60" : null));
        expect(choices.map((choice) => [choice.id, choice.host])).toEqual([["a", "localhost"], ["b", "192.0.2.60"]]);
    });

    it("always offers this PC first", () => {
        const choices = hostChoices([{ hostId: "pi", target: { label: "Pi", host: "192.0.2.60" } }]);
        expect(choices[0]).toEqual({ kind: "local", hostId: null, label: "This PC" });
        expect(choices[1]?.hostId).toBe("pi");
    });
});

describe("accounts adapter", () => {
    it("forwards only the device code for the account being signed in and always unsubscribes", async () => {
        const prompts = createPromptSource();
        const store: ProtectedAccountsLike = {
            list: async () => [],
            createMicrosoftAccount: async (label, clientId) => ({ accountRef: `${clientId}:${label}`, label }),
            async authenticate(reference) {
                prompts.emit({ accountRef: "other", userCode: "XXXX-XXXX", verificationUri: "https://microsoft.com/link", expiresIn: 900 });
                prompts.emit({ accountRef: reference, userCode: "ABCD-EFGH", verificationUri: "https://microsoft.com/link", expiresIn: 900 });
            },
            cancelAuthentication: () => undefined,
            exportForHosting: async () => ({ clientId: "c", caches: {} }),
        };
        const adapter = createLiveViewerAccounts({ store, prompts, clientId: async () => "11111111-2222-3333-4444-555555555555" });
        const codes: string[] = [];
        await adapter.authenticate("mine", (code) => codes.push(code.userCode));
        expect(codes).toEqual(["ABCD-EFGH"]);
        prompts.emit({ accountRef: "mine", userCode: "LATE-CODE", verificationUri: "https://microsoft.com/link", expiresIn: 1 });
        expect(codes).toEqual(["ABCD-EFGH"]);
    });

    it("refuses to create an account when no client id is configured", async () => {
        const adapter = createLiveViewerAccounts({ store: { list: async () => [], createMicrosoftAccount: async () => ({ accountRef: "x", label: "x" }), authenticate: async () => undefined, cancelAuthentication: () => undefined, exportForHosting: async () => ({ clientId: "", caches: {} }) }, prompts: createPromptSource(), clientId: async () => "" });
        await expect(adapter.createMicrosoftAccount("Main")).rejects.toThrow(/not configured/);
    });
});
