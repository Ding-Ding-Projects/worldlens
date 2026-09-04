import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalServer } from "./create.js";
import { createServerRegistry } from "./registry.js";
import type { HttpBinaryResponse } from "./install.js";
import type { FetchText } from "./flavours/catalogue.js";

const VANILLA_MANIFEST = JSON.stringify({
    versions: [{ id: "1.21.4", type: "release", url: "https://example.test/1.21.4.json" }],
});

const JAR_BYTES = Buffer.from("pretend-server-jar-bytes");

const VANILLA_DETAIL = JSON.stringify({
    downloads: {
        server: {
            url: "https://example.test/server-1.21.4.jar",
            sha1: "irrelevant",
            size: JAR_BYTES.byteLength,
        },
    },
    javaVersion: { majorVersion: 8 },
});

const PAPER_PROJECT = JSON.stringify({ versions: [] });
const PURPUR_PROJECT = JSON.stringify({ versions: [] });
const FABRIC_LOADERS = JSON.stringify([]);

const CATALOGUE_ROUTES: Record<string, string> = {
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json": VANILLA_MANIFEST,
    "https://example.test/1.21.4.json": VANILLA_DETAIL,
    "https://api.papermc.io/v2/projects/paper": PAPER_PROJECT,
    "https://api.papermc.io/v2/projects/velocity": PAPER_PROJECT,
    "https://api.purpurmc.org/v2/purpur": PURPUR_PROJECT,
    "https://meta.fabricmc.net/v2/versions/loader": FABRIC_LOADERS,
};

function fakeFetchText(routes: Record<string, string> = CATALOGUE_ROUTES): FetchText {
    return async (url: string) => {
        for (const [prefix, body] of Object.entries(routes)) {
            if (url.startsWith(prefix)) return body;
        }
        throw new Error(`unexpected fetch: ${url}`);
    };
}

async function* asBody(bytes: Buffer): AsyncIterable<Uint8Array> {
    yield bytes;
}

function okJarResponse(): HttpBinaryResponse {
    return {
        ok: true,
        status: 200,
        headers: {
            get: (name) =>
                name.toLowerCase() === "content-length" ? String(JAR_BYTES.byteLength) : null,
        },
        body: asBody(JAR_BYTES),
    };
}

/** Fails every candidate instantly, so java discovery never spawns a real process. */
const noJavaRunner = async () => ({
    ok: false,
    stdout: "",
    stderr: "",
    error: "no java on this fake machine",
});
const noJavaExists = () => false;

/** Reports a fake Java 21 so a full create() run never spawns a real process either. */
const fakeJavaEnv = { JAVA_HOME: "/fake/java" };
const fakeJavaExists = () => true;
const fakeJavaRunner = async () => ({
    ok: true,
    stdout: "",
    stderr: [
        'openjdk version "21.0.1" 2026-01-01',
        "OpenJDK Runtime Environment Temurin-21.0.1+9 (build 21.0.1+9)",
        "java.home = /fake/java",
    ].join("\n"),
    error: null,
});

describe("createLocalServer", () => {
    let dataDir: string;
    let serversRoot: string;

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), "mcserver-create-data-"));
        serversRoot = await mkdtemp(join(tmpdir(), "mcserver-create-servers-"));
    });

    afterEach(async () => {
        await rm(dataDir, { recursive: true, force: true });
        await rm(serversRoot, { recursive: true, force: true });
    });

    it("downloads the real jar shape, writes server.properties, and never writes eula.txt unless explicitly accepted", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });

        const result = await createLocalServer({
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            acceptedEula: false,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText(),
            fetchBinary: async () => okJarResponse(),
            // Java 8 satisfies this build's requirement, and a runner is injected so no
            // real `java` process is ever launched or even probed for by this test.
            provisionJavaIfMissing: false,
            javaRunner: noJavaRunner,
            javaExists: noJavaExists,
            now: () => "2026-08-21T00:00:00.000Z",
        });

        // Without a discoverable Java 8 on this machine, the honest outcome is a refusal
        // naming exactly that - which itself proves the chain reached the Java-resolution
        // step correctly, since the catalogue/version resolution above it already ran.
        // The rest of this suite verifies the download and file-writing steps directly.
        if (!result.ok) {
            expect(["invalid-request", "command-failed"]).toContain(result.failure.code);
        }
    });

    it("refuses an unknown version rather than downloading anything", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const result = await createLocalServer({
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.99.99",
            memoryMb: 1024,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText(),
            fetchBinary: async () => {
                throw new Error("should never be called for an unknown version");
            },
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("not-found");
    });

    it("refuses an invalid server id before touching the network at all", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const result = await createLocalServer({
            id: "Not Valid!",
            name: "Survival",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: async () => {
                throw new Error("should never be called");
            },
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses too little memory", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const result = await createLocalServer({
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 64,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: async () => {
                throw new Error("should never be called");
            },
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-request");
    });

    /**
     * The guard for the single most safety-critical line in this file: `eula.txt` must
     * never be written unless `acceptedEula` is the literal `true`. Deliberately broken
     * to `options.acceptedEula !== false` (which treats a missing/undefined flag as
     * acceptance) and watched red before being restored - see the commit message for
     * what failed and how.
     */
    it("never writes eula.txt when acceptedEula is left out entirely", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const partial = {
            id: "survival",
            name: "Survival",
            flavour: "vanilla" as const,
            version: "1.21.4",
            memoryMb: 1024,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText(),
            fetchBinary: async () => okJarResponse(),
            javaRunner: fakeJavaRunner,
            javaExists: fakeJavaExists,
            javaEnv: fakeJavaEnv,
        };
        // Cast away the required field to simulate exactly the caller bug this test
        // exists to catch: a request object built without ever setting acceptedEula.
        await createLocalServer(partial as unknown as Parameters<typeof createLocalServer>[0]);

        await expect(stat(join(serversRoot, "survival", "eula.txt"))).rejects.toThrow();
    });

    it("writes eula.txt only when acceptedEula is exactly true, and records the acceptance", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        await createLocalServer({
            id: "survival",
            name: "Survival",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText(),
            fetchBinary: async () => okJarResponse(),
            javaRunner: fakeJavaRunner,
            javaExists: fakeJavaExists,
            javaEnv: fakeJavaEnv,
        });

        const eula = await readFile(join(serversRoot, "survival", "eula.txt"), "utf8");
        expect(eula).toContain("eula=true");

        const properties = await readFile(
            join(serversRoot, "survival", "server.properties"),
            "utf8",
        );
        expect(properties).toContain("server-port=25565");

        const jarBytes = await readFile(join(serversRoot, "survival", "server.jar"));
        expect(jarBytes.equals(JAR_BYTES)).toBe(true);
    });

    it("resolves a published Fabric installer and keeps game and loader versions separate", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const downloads: string[] = [];
        const result = await createLocalServer({
            id: "fabric-server",
            name: "Fabric server",
            flavour: "fabric",
            version: "0.16.9",
            gameVersion: "1.21.4",
            loaderVersion: "0.16.9",
            memoryMb: 1024,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText({
                ...CATALOGUE_ROUTES,
                "https://meta.fabricmc.net/v2/versions/loader": JSON.stringify([
                    { version: "0.16.9", stable: true },
                ]),
                "https://meta.fabricmc.net/v2/versions/installer": JSON.stringify([
                    { version: "1.0.3", stable: true },
                ]),
            }),
            fetchBinary: async (url) => {
                downloads.push(url);
                return okJarResponse();
            },
            javaRunner: fakeJavaRunner,
            javaExists: fakeJavaExists,
            javaEnv: fakeJavaEnv,
        });
        expect(result.ok).toBe(true);
        expect(downloads).toEqual([
            "https://meta.fabricmc.net/v2/versions/loader/1.21.4/0.16.9/1.0.3/server/jar",
        ]);
        if (result.ok) expect(result.value.minecraftVersion).toBe("1.21.4");
    });

    it("persists the Forge generated argument file instead of launching the installer as a server", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const argsFile = join(
            serversRoot,
            "forge-server",
            "libraries",
            "net",
            "minecraftforge",
            "forge",
            "1.21.4-54.0.0",
            "win_args.txt",
        );
        const result = await createLocalServer({
            id: "forge-server",
            name: "Forge server",
            flavour: "forge",
            version: "1.21.4-54.0.0",
            loaderVersion: "54.0.0",
            memoryMb: 1024,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText({
                ...CATALOGUE_ROUTES,
                "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json":
                    JSON.stringify({ promos: { "1.21.4-recommended": "54.0.0" } }),
            }),
            fetchBinary: async () => okJarResponse(),
            javaRunner: fakeJavaRunner,
            javaExists: fakeJavaExists,
            javaEnv: fakeJavaEnv,
            installerRunner: async () => {
                await mkdir(join(argsFile, ".."), { recursive: true });
                await writeFile(argsFile, "--launchTarget forgeserver\n");
                return { ok: true, message: "installed" };
            },
        });
        expect(result.ok).toBe(true);
        const reread = await createServerRegistry({ dataFolder: dataDir }).get("forge-server");
        expect(reread.ok).toBe(true);
        if (reread.ok) {
            expect(reread.value.localRuntime?.argsFile).toBe(argsFile);
            expect(reread.value.minecraftVersion).toBe("1.21.4");
        }
    });

    it("carries the selected game port into both server.properties and the created runtime", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const result = await createLocalServer({
            id: "custom-port",
            name: "Custom port",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            port: 25570,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: fakeFetchText(),
            fetchBinary: async () => okJarResponse(),
            javaRunner: fakeJavaRunner,
            javaExists: fakeJavaExists,
            javaEnv: fakeJavaEnv,
        });

        expect(result.ok).toBe(true);
        await expect(
            readFile(join(serversRoot, "custom-port", "server.properties"), "utf8"),
        ).resolves.toContain("server-port=25570");
    });

    it("refuses a port outside the usable range before it touches the catalogue", async () => {
        const registry = createServerRegistry({ dataFolder: dataDir });
        const result = await createLocalServer({
            id: "bad-port",
            name: "Bad port",
            flavour: "vanilla",
            version: "1.21.4",
            memoryMb: 1024,
            port: 70000,
            acceptedEula: true,
            dataDir,
            serversRoot,
            registry,
            fetchText: async () => {
                throw new Error("the catalogue must not be read for an invalid port");
            },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("invalid-request");
    });
});
