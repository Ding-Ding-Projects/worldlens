import { describe, expect, it } from "vitest";

import { createHangarSource } from "./hangar.js";
import type { PluginFetchLike } from "../types.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createHangarSource", () => {
    it("searches and derives projectId from owner/slug", async () => {
        const fetch: PluginFetchLike = () =>
            Promise.resolve(
                jsonResponse({
                    result: [
                        {
                            name: "EssentialsX",
                            namespace: { owner: "EssentialsX", slug: "essentialsx" },
                            description: "The essential plugin suite",
                            avatarUrl: "https://cdn.example/ex.png",
                            stats: { downloads: 12345 },
                        },
                    ],
                }),
            );
        const source = createHangarSource({ fetch });
        const result = await source.search({ query: "essentials" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual([
            {
                sourceId: "hangar",
                projectId: "EssentialsX/essentialsx",
                slug: "essentialsx",
                name: "EssentialsX",
                summary: "The essential plugin suite",
                iconUrl: "https://cdn.example/ex.png",
                downloads: 12345,
                pageUrl: "https://hangar.papermc.io/EssentialsX/essentialsx",
                installable: true,
            },
        ]);
    });

    it("resolves versions, always tagged paper, with no published hash", async () => {
        const fetch: PluginFetchLike = () =>
            Promise.resolve(
                jsonResponse({
                    result: [
                        {
                            name: "2.20.1",
                            createdAt: "2026-02-01T00:00:00Z",
                            downloads: {
                                PAPER: {
                                    fileInfo: { name: "EssentialsX-2.20.1.jar", sizeBytes: 555 },
                                    platformVersions: ["1.21.4"],
                                },
                            },
                        },
                    ],
                }),
            );
        const source = createHangarSource({ fetch });
        const result = await source.versions("EssentialsX/essentialsx");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toHaveLength(1);
        const version = result.value[0];
        expect(version?.loaders).toEqual(["paper"]);
        expect(version?.hash).toEqual({ sha512: null, sha1: null });
        expect(version?.filename).toBe("EssentialsX-2.20.1.jar");
        expect(version?.gameVersions).toEqual(["1.21.4"]);
    });

    it("fails cleanly on a non-ok status", async () => {
        const fetch: PluginFetchLike = () => Promise.resolve(new Response("nope", { status: 500 }));
        const source = createHangarSource({ fetch });
        const result = await source.search({ query: "x" });
        expect(result.ok).toBe(false);
    });
});
