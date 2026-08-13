import { describe, expect, it, vi } from "vitest";
import { fetchVersion, MAX_RESPONSE_BYTES, pullModel, streamChat } from "./ollamaApi.js";

function streamResponse(chunks: readonly string[], close = true): Response {
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            const chunk = chunks[index++];
            if (chunk !== undefined) controller.enqueue(new TextEncoder().encode(chunk));
            else if (close) controller.close();
        },
    });
    return new Response(body, { status: 200 });
}

describe("Ollama transport cancellation and stream boundaries", () => {
    it("does not start a request when the caller's signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchImpl = vi.fn(async () => new Response("{}"));

        const result = await fetchVersion({ fetchImpl, signal: controller.signal });

        expect(result).toEqual({
            ok: false,
            error: { kind: "aborted", message: "The request was cancelled." },
        });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("flushes a pull record that ends without a newline", async () => {
        const progress: string[] = [];
        const result = await pullModel("llama3", (line) => progress.push(line.status), {
            fetchImpl: async () => streamResponse(['{"status":"success"}']),
        });

        expect(result).toEqual({ ok: true, value: true });
        expect(progress).toEqual(["success"]);
    });

    it("returns as soon as chat reports done and cancels a stream that does not close", async () => {
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.enqueue(new TextEncoder().encode('{"done":true}\n'));
            },
            cancel() {
                cancelled = true;
            },
        });
        const received: boolean[] = [];

        const result = await streamChat(
            "llama3",
            [],
            (chunk) => received.push(chunk.done),
            {},
            { fetchImpl: async () => new Response(body), timeoutMs: 100 },
        );

        expect(result).toEqual({ ok: true, value: true });
        expect(received).toEqual([true]);
        expect(cancelled).toBe(true);
    });

    it("rejects an advertised oversized non-streaming body before reading it", async () => {
        const text = vi.fn(async () => "never read");
        const response = {
            ok: true,
            body: null,
            headers: new Headers({ "content-length": String(MAX_RESPONSE_BYTES + 1) }),
            text,
        } as unknown as Response;

        const result = await fetchVersion({ fetchImpl: async () => response });

        expect(result).toEqual({
            ok: false,
            error: {
                kind: "oversized",
                message: "The response was larger than this client will read.",
            },
        });
        expect(text).not.toHaveBeenCalled();
    });
});
