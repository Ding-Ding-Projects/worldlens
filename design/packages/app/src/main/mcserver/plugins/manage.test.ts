import { describe, expect, it } from "vitest";

import { buildZip } from "../../download/zipTestUtil.js";
import { checkForUpdate, listInstalledPlugins, removePlugin, togglePlugin } from "./manage.js";
import { createFakeTransport } from "./testTransport.js";
import type { PluginSearchResult, PluginSource, PluginVersion } from "./types.js";

function bukkitJar(name: string, version: string): Buffer {
    return buildZip([{ name: "plugin.yml", content: Buffer.from(`name: ${name}\nversion: ${version}\n`) }]);
}

function fabricJar(id: string, version: string): Buffer {
    return buildZip([{ name: "fabric.mod.json", content: Buffer.from(JSON.stringify({ id, version })) }]);
}

describe("listInstalledPlugins", () => {
    it("lists jars in plugins/ and mods/, parsing each descriptor", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/essentials.jar", new Uint8Array(bukkitJar("Essentials", "2.20.1")));
        transport.files.set("mods/testmod.jar", new Uint8Array(fabricJar("testmod", "3.0.0")));

        const result = await listInstalledPlugins({ transport });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toHaveLength(2);
        const essentials = result.value.find((p) => p.filename === "essentials.jar");
        expect(essentials).toMatchObject({ name: "Essentials", version: "2.20.1", enabled: true, loaderHint: "bukkit" });
        const mod = result.value.find((p) => p.filename === "testmod.jar");
        expect(mod).toMatchObject({ name: "testmod", version: "3.0.0", enabled: true, loaderHint: "fabric" });
    });

    it("reports a disabled jar as disabled, from the .jar.disabled suffix", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/off.jar.disabled", new Uint8Array(bukkitJar("Off", "1.0.0")));

        const result = await listInstalledPlugins({ transport });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value[0]).toMatchObject({ enabled: false, filename: "off.jar.disabled" });
    });

    it("treats a missing plugins/mods directory as an empty server, not a failure", async () => {
        const transport = createFakeTransport();
        const result = await listInstalledPlugins({ transport });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual([]);
    });
});

describe("togglePlugin", () => {
    it("disables an enabled jar by renaming to the .jar.disabled suffix", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/essentials.jar", new Uint8Array(bukkitJar("Essentials", "1.0.0")));

        const result = await togglePlugin({ transport, path: "plugins/essentials.jar", enable: false });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.path).toBe("plugins/essentials.jar.disabled");
        expect(transport.files.has("plugins/essentials.jar")).toBe(false);
        expect(transport.files.has("plugins/essentials.jar.disabled")).toBe(true);
    });

    it("enables a disabled jar by stripping the suffix", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/essentials.jar.disabled", new Uint8Array(bukkitJar("Essentials", "1.0.0")));

        const result = await togglePlugin({ transport, path: "plugins/essentials.jar.disabled", enable: true });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.path).toBe("plugins/essentials.jar");
        expect(transport.files.has("plugins/essentials.jar.disabled")).toBe(false);
    });

    it("is a no-op when already in the requested state", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/essentials.jar", new Uint8Array(bukkitJar("Essentials", "1.0.0")));
        const result = await togglePlugin({ transport, path: "plugins/essentials.jar", enable: true });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.path).toBe("plugins/essentials.jar");
    });
});

describe("removePlugin", () => {
    it("deletes the file through the transport", async () => {
        const transport = createFakeTransport();
        transport.files.set("plugins/essentials.jar", new Uint8Array(bukkitJar("Essentials", "1.0.0")));
        const result = await removePlugin({ transport, path: "plugins/essentials.jar" });
        expect(result.ok).toBe(true);
        expect(transport.files.has("plugins/essentials.jar")).toBe(false);
    });
});

describe("checkForUpdate", () => {
    function fakeSource(latest: PluginVersion): PluginSource {
        const searchResult: PluginSearchResult = {
            sourceId: "modrinth",
            projectId: "abc",
            slug: "abc",
            name: "Abc",
            summary: "",
            iconUrl: null,
            downloads: null,
            pageUrl: "https://modrinth.com/plugin/abc",
            installable: true,
        };
        void searchResult;
        return {
            id: "modrinth",
            search: () => Promise.resolve({ ok: true, value: [] }),
            versions: () => Promise.resolve({ ok: true, value: [latest] }),
        };
    }

    function version(overrides: Partial<PluginVersion> = {}): PluginVersion {
        return {
            sourceId: "modrinth",
            projectId: "abc",
            versionId: "v2",
            versionName: "2.0.0",
            versionNumber: "2.0.0",
            loaders: ["paper"],
            gameVersions: ["1.21.4"],
            downloadUrl: "https://example/abc-2.0.0.jar",
            filename: "abc-2.0.0.jar",
            fileSize: null,
            hash: { sha512: null, sha1: null },
            publishedAt: null,
            ...overrides,
        };
    }

    it("reports an update available when the installed version differs", async () => {
        const source = fakeSource(version());
        const result = await checkForUpdate({
            source,
            projectId: "abc",
            installed: {
                filename: "abc.jar",
                path: "plugins/abc.jar",
                enabled: true,
                name: "Abc",
                version: "1.0.0",
                loaderHint: "bukkit",
                sha256: "x",
                sizeBytes: 10,
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.updateAvailable).toBe(true);
        expect(result.value.latestVersion).toBe("2.0.0");
    });

    it("reports no update when the installed version already matches the latest", async () => {
        const source = fakeSource(version({ versionNumber: "1.0.0" }));
        const result = await checkForUpdate({
            source,
            projectId: "abc",
            installed: {
                filename: "abc.jar",
                path: "plugins/abc.jar",
                enabled: true,
                name: "Abc",
                version: "1.0.0",
                loaderHint: "bukkit",
                sha256: "x",
                sizeBytes: 10,
            },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.updateAvailable).toBe(false);
    });
});
