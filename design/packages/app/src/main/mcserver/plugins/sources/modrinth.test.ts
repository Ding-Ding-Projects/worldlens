import { describe, expect, it } from "vitest";

import { createModrinthSource } from "./modrinth.js";
import type { PluginFetchLike } from "../types.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createModrinthSource", () => {
    it("searches and maps hits, never touching the real network", () => {
        const calls: string[] = [];
        const fetch: PluginFetchLike = (url) => {
            calls.push(url);
            return Promise.resolve(
                jsonResponse({
                    hits: [
                        {
                            project_id: "AANobbMI",
                            slug: "worldedit",
                            title: "WorldEdit",
                            description: "In-game map editor",
                            icon_url: "https://cdn.example/icon.png",
                            downloads: 999,
                        },
                        { project_id: "not-a-real-one" },
                    ],
                }),
            );
        };
        const source = createModrinthSource({ fetch });

        return source.search({ query: "worldedit" }).then((result) => {
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value).toHaveLength(1);
            expect(result.value[0]).toMatchObject({
                sourceId: "modrinth",
                projectId: "AANobbMI",
                slug: "worldedit",
                name: "WorldEdit",
                installable: true,
            });
            expect(calls[0]).toContain("api.modrinth.com");
            expect(calls[0]).toContain("query=worldedit");
        });
    });

    it("resolves versions with both sha512 and sha1 and normalised loaders", async () => {
        const fetch: PluginFetchLike = () =>
            Promise.resolve(
                jsonResponse([
                    {
                        id: "ver1",
                        name: "1.2.3 release",
                        version_number: "1.2.3",
                        loaders: ["paper", "spigot", "not-a-real-loader"],
                        game_versions: ["1.21.4", "1.21.3"],
                        date_published: "2026-01-01T00:00:00Z",
                        files: [
                            {
                                primary: true,
                                url: "https://cdn.example/worldedit-1.2.3.jar",
                                filename: "worldedit-1.2.3.jar",
                                size: 4096,
                                hashes: { sha512: "a".repeat(128), sha1: "b".repeat(40) },
                            },
                        ],
                    },
                ]),
            );
        const source = createModrinthSource({ fetch });
        const result = await source.versions("AANobbMI");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toHaveLength(1);
        const version = result.value[0];
        expect(version).toMatchObject({
            versionNumber: "1.2.3",
            loaders: ["paper", "spigot", "unknown"],
            gameVersions: ["1.21.4", "1.21.3"],
            downloadUrl: "https://cdn.example/worldedit-1.2.3.jar",
            filename: "worldedit-1.2.3.jar",
            fileSize: 4096,
        });
        expect(version?.hash.sha512).toBe("a".repeat(128));
        expect(version?.hash.sha1).toBe("b".repeat(40));
    });

    it("fails cleanly when Modrinth answers with a non-ok status", async () => {
        const fetch: PluginFetchLike = () => Promise.resolve(new Response("nope", { status: 503 }));
        const source = createModrinthSource({ fetch });
        const result = await source.search({ query: "x" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("command-failed");
    });

    it("fails cleanly when the network throws", async () => {
        const fetch: PluginFetchLike = () => Promise.reject(new Error("ENOTFOUND"));
        const source = createModrinthSource({ fetch });
        const result = await source.search({ query: "x" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unreachable");
    });
});
