/**
 * The hosted bridge over real HTTP, against a real server on a real port.
 *
 * These use `fetch` and a real socket rather than calling the handlers directly, because the
 * things most likely to be wrong here are not logic: they are status codes, headers, and
 * whether a stream actually flushes. None of those are observable from a unit call.
 */
import { afterEach, describe, expect, it } from "vitest";
import { HttpServer } from "../src/http/HttpServer.js";
import { BridgeInvokeHandler } from "../src/bridge/BridgeInvokeHandler.js";
import { BridgeEventHandler } from "../src/bridge/BridgeEventHandler.js";

const servers: HttpServer[] = [];
const eventHandlers: BridgeEventHandler[] = [];

afterEach(async () => {
    for (const handler of eventHandlers.splice(0)) handler.close();
    for (const server of servers.splice(0)) await server.close();
});

async function startInvoke(options: {
    dispatch?: (channel: string, args: readonly unknown[]) => Promise<unknown>;
    permit?: (channel: string) => { allowed: boolean; reason?: string; instead?: string };
    maximumBodyBytes?: number;
}): Promise<string> {
    const server = new HttpServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    server.addHandler(
        new BridgeInvokeHandler({
            dispatch: options.dispatch ?? (async () => await Promise.resolve("ok")),
            permit: (channel) =>
                (options.permit?.(channel) ?? { allowed: true }) as never,
            ...(options.maximumBodyBytes === undefined
                ? {}
                : { maximumBodyBytes: options.maximumBodyBytes }),
        }),
    );
    const address = await server.listen();
    return `http://127.0.0.1:${String(address.port)}`;
}

const call = async (base: string, body: unknown): Promise<Response> =>
    await fetch(`${base}/bridge/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });

describe("calling a channel over HTTP", () => {
    it("returns what the handler returned", async () => {
        const base = await startInvoke({
            dispatch: async (channel, args) => await Promise.resolve({ channel, args }),
        });

        const response = await call(base, { channel: "world:inspect", args: ["/data/worlds"] });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            result: { channel: "world:inspect", args: ["/data/worlds"] },
        });
    });

    it("carries a handler's own failure at status 200, so the message survives", async () => {
        // The distinction the whole file is built around. A thrown handler is an application
        // answer, not a transport failure, and it has to arrive with its own words intact.
        const base = await startInvoke({
            dispatch: () => Promise.reject(new Error("that world has no region files")),
        });

        const response = await call(base, { channel: "render:start", args: [] });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: false,
            error: { message: "that world has no region files" },
        });
    });

    it("refuses a channel this deployment does not answer, and says why", async () => {
        const base = await startInvoke({
            permit: (channel) =>
                channel === "window:minimize"
                    ? {
                          allowed: false,
                          reason: "There is no application window in a browser tab.",
                          instead: "Use the browser's own controls.",
                      }
                    : { allowed: true },
        });

        const response = await call(base, { channel: "window:minimize", args: [] });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: {
                message: "There is no application window in a browser tab.",
                channel: "window:minimize",
                instead: "Use the browser's own controls.",
            },
        });
    });

    it("never reaches the handler for a refused channel", async () => {
        // Enforced at the boundary rather than inside each feature, so a mistake in one
        // module cannot open a channel policy says is shut.
        let reached = false;
        const base = await startInvoke({
            dispatch: async () => {
                reached = true;
                return await Promise.resolve(null);
            },
            permit: () => ({ allowed: false, reason: "Refused for the purposes of this test." }),
        });

        await call(base, { channel: "anything:at-all", args: [] });

        expect(reached).toBe(false);
    });

    it("rejects a malformed body with 400 rather than treating it as an empty call", async () => {
        const base = await startInvoke({});

        expect((await call(base, "{not json")).status).toBe(400);
        expect((await call(base, { args: [] })).status).toBe(400);
        expect((await call(base, { channel: "", args: [] })).status).toBe(400);
        // Present but not an array is a client bug, and quietly reading it as no arguments
        // would turn that bug into a confusing handler failure much further away.
        expect((await call(base, { channel: "a:b", args: "nope" })).status).toBe(400);
    });

    it("treats a missing args as a call with no arguments, because most calls have none", async () => {
        let seen: readonly unknown[] | null = null;
        const base = await startInvoke({
            dispatch: async (_channel, args) => {
                seen = args;
                return await Promise.resolve(null);
            },
        });

        await call(base, { channel: "app:version" });

        expect(seen).toEqual([]);
    });

    it("refuses an oversized body instead of reading it all first", async () => {
        const base = await startInvoke({ maximumBodyBytes: 256 });

        const response = await call(base, { channel: "a:b", args: ["x".repeat(4096)] });

        expect(response.status).toBe(413);
    });

    it("answers a wrong method itself rather than letting it fall through to a 404", async () => {
        // Falling through would render as "the bridge is not deployed here", which is a
        // completely different diagnosis from "you used GET".
        const base = await startInvoke({});

        expect((await fetch(`${base}/bridge/invoke`)).status).toBe(405);
    });

    it("sets the headers a JSON route needs when there is no Electron session to add them", async () => {
        const base = await startInvoke({});

        const response = await call(base, { channel: "app:version", args: [] });

        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("leaves unrelated paths alone", async () => {
        const base = await startInvoke({});

        expect((await fetch(`${base}/maps/one/settings.json`)).status).toBe(404);
    });
});

describe("the event stream", () => {
    async function startEvents(replayDepth?: number): Promise<{
        base: string;
        push: (channel: string, payload: unknown) => void;
        handler: BridgeEventHandler;
    }> {
        let emit: ((channel: string, payload: unknown) => void) | null = null;
        const handler = new BridgeEventHandler({
            subscribe: (listener) => {
                emit = listener;
                return () => {
                    emit = null;
                };
            },
            ...(replayDepth === undefined ? {} : { replayDepth }),
        });
        eventHandlers.push(handler);
        handler.start();
        const server = new HttpServer({ host: "127.0.0.1", port: 0 });
        servers.push(server);
        server.addHandler(handler);
        const address = await server.listen();
        return {
            base: `http://127.0.0.1:${String(address.port)}`,
            push: (channel, payload) => emit?.(channel, payload),
            handler,
        };
    }

    /** Read whatever has arrived so far, then let go. */
    async function readAvailable(response: Response, expected: number): Promise<string> {
        const reader = response.body?.getReader();
        if (reader === undefined) return "";
        const decoder = new TextDecoder();
        let text = "";
        while (text.split("\n\n").length - 1 < expected) {
            const chunk = await reader.read();
            if (chunk.done) break;
            text += decoder.decode(chunk.value, { stream: true });
        }
        await reader.cancel();
        return text;
    }

    it("carries every channel over one stream, tagged by channel", async () => {
        const { base, push } = await startEvents();
        const response = await fetch(`${base}/bridge/events`);
        expect(response.headers.get("content-type")).toBe("text/event-stream");
        // Without this a reverse proxy buffers the whole stream and delivers it at the end,
        // which is indistinguishable from the feature not working at all.
        expect(response.headers.get("x-accel-buffering")).toBe("no");

        push("render:event", { phase: "started" });
        push("download:event", { phase: "resolving" });
        const text = await readAvailable(response, 2);

        expect(text).toContain("event: render:event");
        expect(text).toContain('data: {"phase":"started"}');
        expect(text).toContain("event: download:event");
        expect(text).toContain("id: 1");
        expect(text).toContain("id: 2");
    });

    it("replays what a reconnecting client missed", async () => {
        const { base, push } = await startEvents();
        push("render:event", { n: 1 });
        push("render:event", { n: 2 });
        push("render:event", { n: 3 });

        const response = await fetch(`${base}/bridge/events`, {
            headers: { "last-event-id": "1" },
        });
        const text = await readAvailable(response, 2);

        expect(text).toContain('{"n":2}');
        expect(text).toContain('{"n":3}');
        expect(text).not.toContain('{"n":1}');
    });

    it("says so when a client missed more than is held, rather than pretending it did not", async () => {
        // The honest half of replay. A client silently handed an incomplete stream shows a
        // progress bar stuck at 40%, which reads as a hang rather than as lost events.
        const { base, push } = await startEvents(2);
        for (let n = 1; n <= 5; n++) push("render:event", { n });

        const response = await fetch(`${base}/bridge/events`, {
            headers: { "last-event-id": "1" },
        });
        const text = await readAvailable(response, 1);

        expect(text).toContain("event: bridge:resync");
    });

    it("keeps the ring buffer bounded", async () => {
        const { base, push } = await startEvents(3);
        for (let n = 1; n <= 50; n++) push("render:event", { n });

        const response = await fetch(`${base}/bridge/events`, {
            headers: { "last-event-id": "47" },
        });
        const text = await readAvailable(response, 3);

        expect(text).toContain('{"n":48}');
        expect(text).not.toContain('{"n":10}');
    });

    it("forgets a client that disconnects", async () => {
        const { base, handler } = await startEvents();
        const response = await fetch(`${base}/bridge/events`);
        await response.body?.cancel();

        // The socket close is asynchronous; wait for the handler to notice rather than
        // asserting immediately and getting a flaky pass.
        for (let attempt = 0; attempt < 50 && handler.connectionCount() > 0; attempt++)
            await new Promise((resolve) => setTimeout(resolve, 10));

        expect(handler.connectionCount()).toBe(0);
    });

    it("does not double-deliver when started twice", async () => {
        const { base, push, handler } = await startEvents();
        handler.start();
        const response = await fetch(`${base}/bridge/events`);

        push("render:event", { only: "once" });
        const text = await readAvailable(response, 1);

        expect(text.split("event: render:event").length - 1).toBe(1);
    });
});
