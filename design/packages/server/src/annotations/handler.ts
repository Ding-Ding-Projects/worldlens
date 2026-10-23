import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpHandler } from "../http/HttpServer.js";
import { AnnotationAccessDenied, AnnotationConflict, AnnotationStore } from "./store.js";
import type { AnnotationIdentity, AnnotationPrincipal } from "./store.js";

/** Authorization is resolved by the host from its authenticated session, never from JSON. */
export class AnnotationHandler implements HttpHandler {
    constructor(private readonly store: AnnotationStore, private readonly authorize: (req: IncomingMessage, identity: AnnotationIdentity) => AnnotationPrincipal | null) {}
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/bridge/annotations") return false;
        const reply = (status: number, body: unknown): true => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body)); return true; };
        if (req.method !== "GET" && req.method !== "PUT") return reply(405, { error: "Use GET or PUT." });
        const identity: AnnotationIdentity = { projectId: url.searchParams.get("projectId") ?? "", mapId: url.searchParams.get("mapId") ?? "", dimension: url.searchParams.get("dimension") ?? "" };
        const principal = this.authorize(req, identity);
        if (!principal) return reply(401, { error: "Sign in first." });
        try {
            if (req.method === "GET") return reply(200, await this.store.read(identity, principal));
            // Cookie authentication alone does not authorize cross-origin writes.
            if (req.headers["sec-fetch-site"] === "cross-site" || req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") return reply(403, { error: "A same-origin JSON request is required." });
            const chunks: Buffer[] = []; let total = 0;
            for await (const chunk of req) { const buffer = Buffer.from(chunk as Uint8Array); total += buffer.length; if (total > 1100000) return reply(413, { error: "Annotation update is too large." }); chunks.push(buffer); }
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { expectedRevision: number; annotations: unknown[] };
            return reply(200, await this.store.write(identity, body.expectedRevision, body.annotations, principal));
        } catch (error) {
            if (error instanceof AnnotationConflict) return reply(409, { error: "Revision conflict. Retain your draft.", current: error.current });
            if (error instanceof AnnotationAccessDenied) return reply(403, { error: "Editor access is required." });
            return reply(400, { error: "Annotation request could not be applied." });
        }
    }
}
