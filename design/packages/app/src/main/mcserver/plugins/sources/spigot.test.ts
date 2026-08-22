import { describe, expect, it } from "vitest";

import { createSpigotSource } from "./spigot.js";
import type { PluginFetchLike } from "../types.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createSpigotSource", () => {
    it("returns results that are never installable, and a working page link", async () => {
        const fetch: PluginFetchLike = () =>
            Promise.resolve(
                jsonResponse([
                    { id: 34315, name: "EssentialsX", tag: "The essential suite", downloads: 5000000 },
                ]),
            );
        const source = createSpigotSource({ fetch });
        const result = await source.search({ query: "essentials" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toMatchObject({
            sourceId: "spigot",
            projectId: "34315",
            installable: false,
            pageUrl: "https://www.spigotmc.org/resources/34315",
        });
    });

    it("never offers an install action - versions() is unsupported", async () => {
        const fetch: PluginFetchLike = () => Promise.resolve(jsonResponse([]));
        const source = createSpigotSource({ fetch });
        const result = await source.versions("34315");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("unsupported");
        expect(result.failure.message).toMatch(/SpigotMC/);
    });

    it("fails cleanly on a non-ok status", async () => {
        const fetch: PluginFetchLike = () => Promise.resolve(new Response("nope", { status: 500 }));
        const source = createSpigotSource({ fetch });
        const result = await source.search({ query: "x" });
        expect(result.ok).toBe(false);
    });
});
