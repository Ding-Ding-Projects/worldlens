import type * as http from "node:http";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { HttpHandler } from "./HttpServer.js";

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".conf": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".map": "application/json",
};

function contains(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Serves the built UI bundle. Directory requests fall back to index.html (the UI is a
 * hash-routed SPA). ETags follow upstream FileRequestHandler's shape (size|path|mtime).
 */
export class StaticHandler implements HttpHandler {
    private readonly root: string;

    constructor(root: string) {
        this.root = path.resolve(root);
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        if (req.method !== "GET" && req.method !== "HEAD") return false;
        const badRequest = (): true => {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        };
        let pathname: string;
        try {
            pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        } catch {
            return badRequest();
        }
        if (pathname.includes("\0")) return badRequest();
        let filePath = path.resolve(path.join(this.root, pathname));
        if (!contains(this.root, filePath)) return badRequest();

        // Resolve the configured root too: a symlinked web root is supported. The
        // tree must be trusted against concurrent ancestor/link replacement.
        const root = await fsp.realpath(this.root).catch(() => null);
        if (root === null) return false;
        let canonical = await fsp.realpath(filePath).catch(() => null);
        if (canonical === null) return false;
        if (!contains(root, canonical)) return badRequest();

        let stat = await fsp.stat(canonical).catch(() => null);
        if (stat?.isDirectory()) {
            filePath = path.join(filePath, "index.html");
            canonical = await fsp.realpath(path.join(canonical, "index.html")).catch(() => null);
            if (canonical === null) return false;
            if (!contains(root, canonical)) return badRequest();
            stat = await fsp.stat(canonical).catch(() => null);
        }
        if (res.destroyed) return true;
        if (!stat?.isFile()) return false;

        const etag = createHash("sha1")
            .update(`${stat.size}|${filePath}|${stat.mtimeMs}`)
            .digest("hex")
            .slice(0, 16);
        if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, {
                "x-content-type-options": "nosniff",
                "referrer-policy": "no-referrer",
                "content-security-policy":
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            });
            res.end();
            return true;
        }

        res.writeHead(200, {
            "content-type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
            "content-length": stat.size,
            etag,
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "content-security-policy":
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        if (req.method === "HEAD") {
            res.end();
            return true;
        }
        const stream = fs.createReadStream(canonical);
        try {
            await pipeline(stream, res);
        } catch {
            // pipeline destroys both ends and waits for the file to close on read
            // errors or disconnects. The response is unusable; do not append a 500.
        }
        return true;
    }
}
