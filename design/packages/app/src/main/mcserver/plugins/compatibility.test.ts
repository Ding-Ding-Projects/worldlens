import { describe, expect, it } from "vitest";

import type { ServerFlavour, ServerRecord } from "../registry.js";
import { checkCompatibility } from "./compatibility.js";
import type { PluginVersion } from "./types.js";

function server(overrides: Partial<ServerRecord> = {}): ServerRecord {
    return {
        id: "survival",
        name: "Survival",
        flavour: "paper",
        minecraftVersion: "1.21.4",
        ref: { kind: "local-process", serverDir: "/data" },
        origin: "created",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        localRuntime: null,
        ...overrides,
    };
}

function version(overrides: Partial<PluginVersion> = {}): PluginVersion {
    return {
        sourceId: "modrinth",
        projectId: "abc",
        versionId: "v1",
        versionName: "1.0.0",
        versionNumber: "1.0.0",
        loaders: ["paper"],
        gameVersions: ["1.21.4"],
        downloadUrl: "https://example/plugin.jar",
        filename: "plugin.jar",
        fileSize: 1234,
        hash: { sha512: null, sha1: null },
        publishedAt: null,
        ...overrides,
    };
}

describe("checkCompatibility", () => {
    it("is compatible when the loader and Minecraft version both match", () => {
        const result = checkCompatibility(server(), version());
        expect(result.verdict).toBe("compatible");
        expect(result.reason).toMatch(/paper/);
    });

    it("accepts a bukkit/spigot plugin on a Paper server", () => {
        const result = checkCompatibility(server(), version({ loaders: ["bukkit"] }));
        expect(result.verdict).toBe("compatible");
    });

    it("accepts a fabric mod on a Fabric server", () => {
        const result = checkCompatibility(
            server({ flavour: "fabric" }),
            version({ loaders: ["fabric"], gameVersions: ["1.21.4"] }),
        );
        expect(result.verdict).toBe("compatible");
    });

    it("refuses a fabric mod on a Paper server", () => {
        const result = checkCompatibility(server(), version({ loaders: ["fabric"] }));
        expect(result.verdict).toBe("incompatible");
        expect(result.reason).toMatch(/fabric/);
    });

    it("refuses a forge mod on a paper server", () => {
        const result = checkCompatibility(server(), version({ loaders: ["forge"] }));
        expect(result.verdict).toBe("incompatible");
    });

    it("refuses when the Minecraft version does not match", () => {
        const result = checkCompatibility(server({ minecraftVersion: "1.20.1" }), version({ gameVersions: ["1.21.4"] }));
        expect(result.verdict).toBe("incompatible");
        expect(result.reason).toMatch(/1.20.1/);
    });

    it("is unknown when the server flavour is unidentified", () => {
        const result = checkCompatibility(server({ flavour: "unknown" as ServerFlavour }), version());
        expect(result.verdict).toBe("unknown");
    });

    it("is unknown when the server's Minecraft version is unidentified", () => {
        const result = checkCompatibility(server({ minecraftVersion: null }), version());
        expect(result.verdict).toBe("unknown");
    });

    it("is unknown when the version reports no loader", () => {
        const result = checkCompatibility(server(), version({ loaders: [] }));
        expect(result.verdict).toBe("unknown");
    });

    it("is unknown when the version reports no game versions", () => {
        const result = checkCompatibility(server(), version({ gameVersions: [] }));
        expect(result.verdict).toBe("unknown");
    });

    it("refuses any plugin on a vanilla server", () => {
        const result = checkCompatibility(server({ flavour: "vanilla" }), version());
        expect(result.verdict).toBe("incompatible");
    });

    it("never claims compatibility purely from the plugin's name", () => {
        // The version below is named as though it were a Fabric build, but its own
        // reported loaders say bukkit - the field, never the name, must decide.
        const fabricNamedButBukkitTagged = version({
            versionName: "SuperMod-Fabric-1.0.0.jar",
            loaders: ["bukkit"],
        });
        const result = checkCompatibility(server(), fabricNamedButBukkitTagged);
        expect(result.verdict).toBe("compatible");
    });
});
