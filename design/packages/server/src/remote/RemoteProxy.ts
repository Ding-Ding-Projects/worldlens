import type * as http from "node:http";
import { Readable } from "node:stream";
import type { HttpHandler } from "../http/HttpServer.js";

export interface RemoteProfile {
    id: string;
    name: string;
    /** Base URL of the remote BlueMap instance, e.g. "https://bluecolored.de/bluemap". */
    baseUrl: string;
    /** Extra headers to attach (e.g. basic auth) — stored per profile. */
    headers?: Record<string, string>;
}

export interface RemoteProfileProbe {
    readonly reachable: boolean;
    readonly version: string | null;
    readonly failure: string | null;
}

/**
 * Request headers forwarded to the remote (conditional requests). accept-encoding is
 * deliberately NOT forwarded: undici negotiates and transparently decompresses, so the
 * local hop always carries an identity-encoded body.
 */
const FORWARD_REQUEST_HEADERS = ["if-none-match", "if-modified-since", "accept"];

/**
 * Response headers passed back to the viewer. content-encoding/content-length are
 * omitted because fetch() hands us the decompressed body (their original values would
 * describe bytes we no longer have).
 */
const FORWARD_RESPONSE_HEADERS = ["content-type", "etag", "last-modified", "cache-control"];

/**
 * Reverse proxy for remote BlueMap servers, mounted at /remote/{profileId}/…
 *
 * Remote BlueMap instances do not send CORS headers (the upstream webapp is same-origin),
 * so the sandboxed renderer cannot fetch them directly. Routing through this proxy keeps
 * everything same-origin, forwards conditional-request headers (the viewer's
 * RevalidatingFileLoader relies on ETag revalidation), preserves 204-for-missing-tile
 * semantics, and streams SSE (`live/sse`) without buffering.
 */
export class RemoteProxyHandler implements HttpHandler {
    private readonly profiles = new Map<string, RemoteProfile>();

    setProfile(profile: RemoteProfile): void {
        this.profiles.set(profile.id, profile);
    }

    removeProfile(id: string): void {
        this.profiles.delete(id);
    }

    getProfiles(): RemoteProfile[] {
        return [...this.profiles.values()];
    }

    /**
     * Checks a configured profile through the same validated proxy configuration used by
     * map requests. Redirects are not followed, response bytes are bounded, and callers
     * receive only health facts - never headers or profile credentials.
     */
    async probe(profileId: string, signal?: AbortSignal): Promise<RemoteProfileProbe> {
        const profile = this.profiles.get(profileId);
        if (profile === undefined) return { reachable: false, version: null, failure: "The profile is not configured." };
        const base = profile.baseUrl.endsWith("/") ? profile.baseUrl : `${profile.baseUrl}/`;
        const target = new URL("settings.json", base);
        let response: Response;
        try {
            const timeout = AbortSignal.timeout(5_000);
            const probeSignal = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
            response = await fetch(target, {
                method: "GET",
                headers: { accept: "application/json" },
                redirect: "manual",
                signal: probeSignal,
            });
        } catch (error) {
            if (signal?.aborted) throw error;
            return { reachable: false, version: null, failure: "The profile did not answer its health check." };
        }
        if (response.status < 200 || response.status >= 300) {
            return { reachable: false, version: null, failure: `The profile health check returned HTTP ${String(response.status)}.` };
        }
        const body = await readBoundedBody(response, 64 * 1024);
        if (body === null) return { reachable: true, version: null, failure: "The profile health response was larger than the bounded limit." };
        try {
            const parsed: unknown = JSON.parse(body);
            const version = typeof parsed === "object" && parsed !== null && typeof (parsed as Record<string, unknown>)["version"] === "string"
                ? (parsed as Record<string, string>)["version"]
                : null;
            return { reachable: true, version, failure: null };
        } catch {
            return { reachable: true, version: null, failure: "The profile answered, but its health response was not JSON." };
        }
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/remote\/([^/]+)\/(.*)$/.exec(url.pathname);
        if (!match) return false;

        const [, profileId, rest] = match;
        const profile = this.profiles.get(profileId!);
        if (!profile) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Unknown remote profile");
            return true;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain" });
            res.end("Method Not Allowed");
            return true;
        }

        const target = new URL(rest ?? "", profile.baseUrl.endsWith("/") ? profile.baseUrl : profile.baseUrl + "/");
        // Never allow the path to escape the configured base URL.
        if (!target.href.startsWith(profile.baseUrl.replace(/\/$/, ""))) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Invalid path");
            return true;
        }

        const headers: Record<string, string> = { ...profile.headers };
        for (const name of FORWARD_REQUEST_HEADERS) {
            const value = req.headers[name];
            if (typeof value === "string") headers[name] = value;
        }

        let upstream: Response;
        try {
            upstream = await fetch(target, {
                method: req.method,
                headers,
                redirect: "manual",
                signal: AbortSignal.timeout(rest?.endsWith("live/sse") ? 24 * 60 * 60_000 : 60_000),
            });
        } catch {
            res.writeHead(502, { "content-type": "text/plain" });
            res.end("Bad Gateway");
            return true;
        }
        if (upstream.status >= 300 && upstream.status < 400) {
            res.writeHead(502, { "content-type": "text/plain" });
            res.end("Remote redirect refused");
            return true;
        }

        const responseHeaders: Record<string, string> = {};
        for (const name of FORWARD_RESPONSE_HEADERS) {
            const value = upstream.headers.get(name);
            if (value !== null) responseHeaders[name] = value;
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        const isSse = contentType.startsWith("text/event-stream");
        if (isSse) {
            responseHeaders["cache-control"] = "no-cache";
            responseHeaders["x-accel-buffering"] = "no";
        }

        res.writeHead(upstream.status, responseHeaders);
        if (upstream.body && req.method !== "HEAD" && upstream.status !== 204 && upstream.status !== 304) {
            const body = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
            body.pipe(res);
            req.on("close", () => body.destroy());
            await new Promise<void>((resolve) => res.on("close", () => resolve()));
        } else {
            res.end();
        }
        return true;
    }
}

async function readBoundedBody(response: Response, limit: number): Promise<string | null> {
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > limit) return null;
    if (response.body === null) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                return null;
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}
