import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildZip } from "../../download/zipTestUtil.js";
import { createFakeTransport } from "./testTransport.js";
import { installPluginVersion } from "./install.js";
import type { PluginFetchLike, PluginVersion } from "./types.js";

function bukkitJar(): Buffer {
    return buildZip([
        { name: "plugin.yml", content: Buffer.from("name: TestPlugin\nversion: 1.0.0\nmain: test.Main\n") },
        { name: "test/Main.class", content: Buffer.from("not real bytecode, just bytes") },
    ]);
}

function fabricJar(): Buffer {
    return buildZip([
        {
            name: "fabric.mod.json",
            content: Buffer.from(JSON.stringify({ id: "testmod", name: "Test Mod", version: "2.0.0" })),
        },
    ]);
}

function notAJar(): Buffer {
    return Buffer.from("this is definitely not a zip file, just some plain text bytes");
}

function fetchServing(bytes: Buffer): PluginFetchLike {
    return () => Promise.resolve(new Response(new Uint8Array(bytes), { status: 200 }));
}

function bukkitVersion(overrides: Partial<PluginVersion> = {}): PluginVersion {
    return {
        sourceId: "modrinth",
        projectId: "abc",
        versionId: "v1",
        versionName: "1.0.0",
        versionNumber: "1.0.0",
        loaders: ["paper"],
        gameVersions: ["1.21.4"],
        downloadUrl: "https://example/test-plugin.jar",
        filename: "test-plugin.jar",
        fileSize: null,
        hash: { sha512: null, sha1: null },
        publishedAt: null,
        ...overrides,
    };
}

describe("installPluginVersion", () => {
    it("downloads, verifies the hash, checks the jar shape, and writes into plugins/", async () => {
        const jar = bukkitJar();
        const sha512 = createHash("sha512").update(jar).digest("hex");
        const transport = createFakeTransport();

        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ hash: { sha512, sha1: null } }),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.installedPath).toBe("plugins/test-plugin.jar");
        expect(transport.files.has("plugins/test-plugin.jar")).toBe(true);
        expect(result.value.sha256).toBe(createHash("sha256").update(jar).digest("hex"));
    });

    it("installs a fabric mod into mods/", async () => {
        const jar = fabricJar();
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ loaders: ["fabric"], filename: "test-mod.jar" }),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.installedPath).toBe("mods/test-mod.jar");
    });

    it("REFUSES and deletes the file when the sha512 does not match", async () => {
        const jar = bukkitJar();
        const transport = createFakeTransport();
        const wrongHash = "f".repeat(128);

        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ hash: { sha512: wrongHash, sha1: null } }),
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("command-failed");
        expect(result.failure.message).toMatch(/sha512/);
        // Never installed.
        expect(transport.files.has("plugins/test-plugin.jar")).toBe(false);
    });

    it("refuses when the sha1 does not match and no sha512 was published", async () => {
        const jar = bukkitJar();
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ hash: { sha512: null, sha1: "e".repeat(40) } }),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toMatch(/sha1/);
    });

    it("refuses a file that is not a zip at all, even with a matching hash", async () => {
        const bytes = notAJar();
        const sha512 = createHash("sha512").update(bytes).digest("hex");
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(bytes),
            transport,
            version: bukkitVersion({ hash: { sha512, sha1: null } }),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toMatch(/ZIP signature/);
    });

    it("refuses a real zip with no recognisable plugin descriptor", async () => {
        const zip = buildZip([{ name: "readme.txt", content: Buffer.from("hello") }]);
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(zip),
            transport,
            version: bukkitVersion(),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toMatch(/not a recognisable plugin/);
    });

    it("refuses when the descriptor present does not match the claimed loader", async () => {
        // fabric.mod.json inside, but the version claims to be a bukkit plugin.
        const jar = fabricJar();
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ loaders: ["paper"] }),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toMatch(/descriptor does not match/);
    });

    it("installs without a published hash (Hangar-shaped) purely on the jar shape check", async () => {
        const jar = bukkitJar();
        const transport = createFakeTransport();
        const result = await installPluginVersion({
            fetch: fetchServing(jar),
            transport,
            version: bukkitVersion({ hash: { sha512: null, sha1: null } }),
        });
        expect(result.ok).toBe(true);
    });
});
