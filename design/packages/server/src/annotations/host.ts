import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { ManagedHostedAccess } from "../bridge/ManagedHostedAccess.js";
import type { HostedAdministrator } from "../bridge/ManagedHostedAccess.js";
import { ManagedAnnotationService } from "./service.js";

export interface ManagedMapHostOptions { mapRoot: string; dataRoot: string; origin: string; operationId?: string; contextFingerprint?: string; host?: string; port?: number; tls?: { key: string; cert: string } }
function outside(root: string, target: string): boolean { const rel = relative(root, target); return rel === ".." || rel.startsWith(".." + sep) || resolve(root, rel) !== target; }
const loginScript = `document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const response=await fetch('/bridge/managed-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:form.username.value,password:form.password.value})});form.password.value='';if(response.ok)location.replace('/');else document.querySelector('[role=status]').textContent='Sign-in was not accepted. Please try again.';});`;
const login = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Worldlens map sign in</title><main><h1>Sign in to this map</h1><form><label>Administrator <input name="username" autocomplete="username" required maxlength="80"></label><label>Password <input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>Sign in</button></form><p role="status" aria-live="polite"></p></main><script>${loginScript}</script></html>`;

/** Bootstrap is a local protected process operation. Never expose this as an HTTP endpoint. */
export async function bootstrapManagedMapHost(dataRoot: string, account: HostedAdministrator): Promise<void> {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    const access = new ManagedHostedAccess(null, async value => { await writeFile(join(dataRoot, "administrator.json"), JSON.stringify(value), { flag: "wx", mode: 0o600 }); });
    await access.provision(account);
}

export async function createManagedMapHost(options: ManagedMapHostOptions): Promise<{ server: Server; access: ManagedHostedAccess }> {
    const mapRoot = await realpath(options.mapRoot);
    await mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
    const dataRoot = await realpath(options.dataRoot);
    if (!outside(mapRoot, dataRoot) || !outside(dataRoot, mapRoot)) throw new Error("Account and annotation storage must be separate from map assets.");
    const origin = new URL(options.origin);
    if ((origin.protocol === "https:") !== Boolean(options.tls)) throw new Error("The hosting origin and TLS configuration must agree.");
    const accountPath = join(dataRoot, "administrator.json");
    const info = await lstat(accountPath);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 4096 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("Protected account storage permissions are invalid.");
    const account = JSON.parse(await readFile(accountPath, "utf8")) as HostedAdministrator;
    const access = new ManagedHostedAccess(null, async () => undefined);
    await access.provision(account);
    const annotations = new ManagedAnnotationService(access, join(dataRoot, "annotations"), options.origin);
    const handler = (req: IncomingMessage, res: ServerResponse): void => { void dispatch(req, res).catch(() => { if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" }); res.end("The map request could not be completed."); }); };
    async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
        res.setHeader("x-content-type-options", "nosniff");
        res.setHeader("referrer-policy", "no-referrer");
        const url = new URL(req.url ?? "/", options.origin);
        if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ ready: true, authentication: "required", access: access.status, operationId: options.operationId ?? null, contextFingerprint: options.contextFingerprint ?? null })); return; }
        if (await annotations.handle(req, res)) return;
        if (!access.principal(req)) {
            if (url.pathname !== "/" && url.pathname !== "/index.html") { res.writeHead(401); res.end("Sign in first."); return; }
            res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": `default-src 'none'; script-src 'sha256-${createHash("sha256").update(loginScript).digest("base64")}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` }); res.end(login); return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
        let pathname: string; try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
        if (pathname.includes("\\") || pathname.includes("\0")) { res.writeHead(400); res.end(); return; }
        const candidate = resolve(mapRoot, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
        if (outside(mapRoot, candidate)) { res.writeHead(403); res.end(); return; }
        let file: string; let compressed = false;
        try { file = await realpath(candidate); } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            try { file = await realpath(candidate + ".gz"); compressed = true; } catch { res.writeHead(404); res.end(); return; }
        }
        if (outside(mapRoot, file)) { res.writeHead(403); res.end(); return; }
        const stat = await lstat(file); if (!stat.isFile()) { res.writeHead(404); res.end(); return; }
        const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".wasm": "application/wasm" };
        res.setHeader("content-type", contentTypes[extname(candidate)] ?? "application/octet-stream");
        res.setHeader("cache-control", "private, no-cache"); if (compressed) res.setHeader("content-encoding", "gzip");
        res.writeHead(200); if (req.method === "HEAD") res.end(); else { const stream = createReadStream(file); stream.on("error", () => res.destroy()); stream.pipe(res); }
    }
    const server = options.tls ? createHttpsServer(options.tls, handler) : createHttpServer(handler);
    return { server, access };
}
