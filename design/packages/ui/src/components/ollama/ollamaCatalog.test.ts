import { describe, expect, it, vi } from "vitest";
import { MAX_CATALOG_RESPONSE_BYTES, refreshCatalog } from "./ollamaCatalog.js";

describe("Ollama catalogue refresh bounds", () => {
    it("refuses an advertised oversized page before reading its body", async () => {
        const text = vi.fn(async () => "never read");
        const response = {
            ok: true,
            body: null,
            headers: new Headers({
                "content-length": String(MAX_CATALOG_RESPONSE_BYTES + 1),
            }),
            text,
        } as unknown as Response;

        const result = await refreshCatalog(async () => response);

        expect(result).toMatchObject({
            ok: false,
            reason: "oversized",
            partial: { revision: { pageCount: 1, complete: false } },
        });
        expect(text).not.toHaveBeenCalled();
    });

    it("cancels an in-flight page request when the screen goes away", async () => {
        const outer = new AbortController();
        let requestSignal: AbortSignal | undefined;
        const fetchImpl = vi.fn(
            async (_url: string, init?: RequestInit): Promise<Response> =>
                await new Promise<Response>((_resolve, reject) => {
                    requestSignal = init?.signal ?? undefined;
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }),
        );

        const pending = refreshCatalog(fetchImpl, { signal: outer.signal });
        outer.abort();
        const result = await pending;

        expect(result).toMatchObject({ ok: false, reason: "aborted" });
        expect(requestSignal?.aborted).toBe(true);
    });

    it("follows every page and marks a natural end complete", async () => {
        const pages = new Map([
            [
                "https://catalog.test/",
                JSON.stringify({
                    models: [{ name: "first", tags: [{ tag: "latest" }] }],
                    nextPage: "https://catalog.test/page-2",
                }),
            ],
            [
                "https://catalog.test/page-2",
                JSON.stringify({
                    models: [{ name: "second", tags: [{ tag: "small" }] }],
                }),
            ],
        ]);

        const result = await refreshCatalog(
            async (url) => new Response(pages.get(url), { status: 200 }),
            { url: "https://catalog.test/" },
        );

        expect(result).toMatchObject({
            ok: true,
            catalog: {
                models: [{ family: "first" }, { family: "second" }],
                revision: { pageCount: 2, complete: true },
            },
        });
    });
});
