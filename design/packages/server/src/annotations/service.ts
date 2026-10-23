import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpHandler } from "../http/HttpServer.js";
import { ManagedHostedAccess } from "../bridge/ManagedHostedAccess.js";
import { AnnotationHandler } from "./handler.js";
import { AnnotationStore } from "./store.js";

/** Installs account and annotation routes together so hosted edits cannot omit authorization. */
export class ManagedAnnotationService implements HttpHandler {
    private readonly annotations: AnnotationHandler;
    constructor(private readonly access: ManagedHostedAccess, storageRoot: string, private readonly origin: string) {
        const url = new URL(origin);
        if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) throw new Error("Network sign-in requires HTTPS.");
        if (url.origin !== origin) throw new Error("Specify an exact hosting origin without a path.");
        this.annotations = new AnnotationHandler(new AnnotationStore(storageRoot), req => access.principal(req));
    }
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", this.origin);
        if (url.pathname !== "/bridge/managed-session") {
            if (url.pathname === "/bridge/annotations" && req.method !== "GET" && req.headers.origin !== this.origin) return this.reply(res, 403, { error: "Same-origin authorization is required." });
            return this.annotations.handle(req, res);
        }
        if (req.method === "GET") return this.reply(res, 200, { required: true, signedIn: this.access.principal(req) !== null, state: this.access.status });
        if (req.method !== "POST") return this.reply(res, 405, { error: "Use POST to sign in." });
        if (req.headers.origin !== this.origin || req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") return this.reply(res, 403, { error: "Same-origin JSON sign-in is required." });
        const chunks: Buffer[] = []; let size = 0;
        try {
            for await (const chunk of req) { const buffer = Buffer.from(chunk as Uint8Array); size += buffer.length; if (size > 4096) return this.reply(res, 413, { error: "Sign-in request is too large." }); chunks.push(buffer); }
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!body || typeof body !== "object" || !("username" in body) || !("password" in body) || typeof body.username !== "string" || typeof body.password !== "string") return this.reply(res, 400, { error: "Enter your administrator credentials." });
            const token = await this.access.signIn(body.username, body.password, req.socket.remoteAddress ?? "unknown");
            if (!token) return this.reply(res, 401, { error: "Sign-in was not accepted." });
            res.setHeader("set-cookie", this.access.cookieFor(token, this.origin.startsWith("https:")));
            return this.reply(res, 200, { signedIn: true, state: this.access.status });
        } catch { return this.reply(res, 400, { error: "Sign-in could not be completed." }); }
    }
    private reply(res: ServerResponse, status: number, body: unknown): true { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); return true; }
}
