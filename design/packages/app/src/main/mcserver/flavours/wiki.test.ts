import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyWikiArticle, type WikiFetch } from "./wiki.js";

describe("main-boundary Wiki verification", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-wiki-check-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("verifies a representative article and reuses the bounded cache", async () => {
        let calls = 0;
        const fetch: WikiFetch = async (_url, method) => {
            calls += 1;
            return method === "HEAD" ? { status: 200 } : { status: 200, body: "ok" };
        };
        const first = await verifyWikiArticle({
            dataDir: dir,
            version: "1.21.4",
            now: () => "2026-08-24T00:00:00Z",
            fetch,
        });
        const second = await verifyWikiArticle({
            dataDir: dir,
            version: "1.21.4",
            now: () => "2026-08-25T00:00:00Z",
            fetch,
        });
        expect(first.state).toBe("verified");
        expect(second).toEqual(first);
        expect(calls).toBe(1);
    });

    it("distinguishes unavailable, forbidden-unverified, timeout, and invalid mappings", async () => {
        const response =
            (status: number): WikiFetch =>
            async () => ({ status });
        expect(
            (await verifyWikiArticle({ dataDir: dir, version: "1.20.1", fetch: response(404) }))
                .state,
        ).toBe("unavailable");
        expect(
            (await verifyWikiArticle({ dataDir: dir, version: "1.20.2", fetch: response(403) }))
                .state,
        ).toBe("offline-unverified");
        expect(
            (
                await verifyWikiArticle({
                    dataDir: dir,
                    version: "../../Main_Page",
                    fetch: response(200),
                })
            ).state,
        ).toBe("unavailable");
    });

    it("falls back to offline-unverified on timeout or network refusal", async () => {
        const fetch: WikiFetch = async () => {
            throw new Error("timeout");
        };
        const result = await verifyWikiArticle({ dataDir: dir, version: "24w14a", fetch });
        expect(result.state).toBe("offline-unverified");
    });

    it("retries an unverified cached result after its short TTL", async () => {
        let calls = 0;
        const fetch: WikiFetch = async () => {
            calls += 1;
            return { status: calls === 1 ? 403 : 200 };
        };
        const first = await verifyWikiArticle({
            dataDir: dir,
            version: "1.20.9",
            now: () => "2026-08-24T00:00:00Z",
            fetch,
        });
        const second = await verifyWikiArticle({
            dataDir: dir,
            version: "1.20.9",
            now: () => "2026-08-24T00:11:00Z",
            fetch,
        });
        expect(first.state).toBe("offline-unverified");
        expect(second.state).toBe("verified");
        expect(calls).toBe(2);
    });
});
