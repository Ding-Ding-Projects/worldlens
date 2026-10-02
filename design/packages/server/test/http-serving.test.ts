import { afterEach, describe, expect, it } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs/promises";
import type { ReadStream } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { HttpServer } from "../src/http/HttpServer.js";
import { StaticHandler } from "../src/http/StaticHandler.js";

const cleanups: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("HTTP lifecycle did not settle")), 2000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function fixture() {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "worldlens-http-regression-"));
    cleanups.push(() => fs.rm(base, { recursive: true, force: true }));
    const root = path.join(base, "web");
    const outside = path.join(base, "web-private");
    await fs.mkdir(root);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(root, "index.html"), "public fixture");
    await fs.writeFile(path.join(outside, "secret.txt"), "outside synthetic marker");
    return { base, root, outside };
}

async function start(
    root: string,
    hook?: (req: http.IncomingMessage, res: http.ServerResponse) => void,
) {
    const server = new HttpServer({ authToken: "fixture-token" });
    const handler = new StaticHandler(root);
    const settled = deferred();
    server.addHandler({
        async handle(req, res) {
            hook?.(req, res);
            try {
                return await handler.handle(req, res);
            } finally {
                settled.resolve();
            }
        },
    });
    const { port } = await server.listen();
    let closed = false;
    const close = async () => {
        if (!closed) {
            closed = true;
            await server.close();
        }
    };
    cleanups.push(close);
    return { port, close, settled: settled.promise };
}

function request(
    port: number,
    url: string,
    method = "GET",
    headers: http.OutgoingHttpHeaders = {},
) {
    return new Promise<{
        status: number | undefined;
        body: string;
        headers: http.IncomingHttpHeaders;
    }>((resolve, reject) => {
        const req = http.request(
            {
                host: "127.0.0.1",
                port,
                path: url,
                method,
                agent: false,
                headers: { authorization: "Bearer fixture-token", ...headers },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.once("error", reject);
                res.once("end", () =>
                    resolve({
                        status: res.statusCode,
                        body: Buffer.concat(chunks).toString(),
                        headers: res.headers,
                    }),
                );
            },
        );
        req.once("error", reject);
        req.setTimeout(2000, () => req.destroy(new Error("fixture request timed out")));
        req.end();
    });
}

async function largeFile(root: string) {
    const file = await fs.open(path.join(root, "large.bin"), "w");
    try {
        await file.truncate(64 * 1024 * 1024);
    } finally {
        await file.close();
    }
}

describe("static HTTP confinement", () => {
    it("supports a filesystem root and names beginning with two dots", async () => {
        const { root } = await fixture();
        await fs.writeFile(path.join(root, "..public.txt"), "public dot fixture");
        const filesystemRoot = path.parse(root).root;
        const { port } = await start(filesystemRoot);
        const url =
            "/" +
            path
                .relative(filesystemRoot, path.join(root, "..public.txt"))
                .split(path.sep)
                .map(encodeURIComponent)
                .join("/");
        expect((await request(port, url)).body).toBe("public dot fixture");
    });
    it("preserves GET, directory index, Unicode, HEAD, ETag, missing files and authentication", async () => {
        const { root } = await fixture();
        await fs.writeFile(path.join(root, "雪.txt"), "unicode fixture");
        const { port } = await start(root);
        const normal = await request(port, "/");
        expect(normal.status).toBe(200);
        expect(normal.body).toBe("public fixture");
        expect(normal.headers["x-content-type-options"]).toBe("nosniff");
        expect(normal.headers["content-type"]).toContain("text/html");
        expect((await request(port, "/%E9%9B%AA.txt")).body).toBe("unicode fixture");
        const head = await request(port, "/index.html", "HEAD");
        expect(head.status).toBe(200);
        expect(head.body).toBe("");
        expect(head.headers["content-length"]).toBe(String(Buffer.byteLength(normal.body)));
        const cached = await request(port, "/", "GET", { "if-none-match": normal.headers.etag });
        expect(cached.status).toBe(304);
        expect(cached.body).toBe("");
        expect((await request(port, "/missing")).status).toBe(404);
        expect((await request(port, "/", "POST")).status).toBe(404);
        expect((await request(port, "/", "GET", { authorization: "wrong" })).status).toBe(403);
    });

    it.each([
        "/%2e%2e%2fweb-private/secret.txt",
        "/%2e%2e%5cweb-private%5csecret.txt",
        "/%00",
        "/%zz",
    ])("rejects malformed or escaping path %s", async (url) => {
        const { root } = await fixture();
        const { port } = await start(root);
        const result = await request(port, url);
        // Backslash is a legal filename character on POSIX, but never leaks a sibling.
        expect([400, 404]).toContain(result.status);
        expect(result.body).not.toContain("outside synthetic marker");
    });

    it("supports a linked root and internal directory links but denies outside junctions", async () => {
        const { base, root, outside } = await fixture();
        const linkedRoot = path.join(base, "linked-root");
        const kind = process.platform === "win32" ? "junction" : "dir";
        await fs.mkdir(path.join(root, "nested"));
        await fs.writeFile(path.join(root, "nested", "index.html"), "nested public fixture");
        await fs.symlink(root, linkedRoot, kind);
        await fs.symlink(path.join(root, "nested"), path.join(root, "inside"), kind);
        await fs.symlink(outside, path.join(root, "escape"), kind);
        const { port } = await start(linkedRoot);
        expect((await request(port, "/")).body).toBe("public fixture");
        expect((await request(port, "/inside/")).body).toBe("nested public fixture");
        expect((await request(port, "/escape/secret.txt")).status).toBe(400);
    });

    it("checks file links and directory index links against the canonical root", async (context) => {
        const { root, outside } = await fixture();
        await fs.mkdir(path.join(root, "directory"));
        try {
            await fs.symlink(
                path.join(outside, "secret.txt"),
                path.join(root, "escape.txt"),
                "file",
            );
        } catch (error) {
            if (
                ["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")
            ) {
                context.skip();
                return;
            }
            throw error;
        }
        await fs.symlink(
            path.join(outside, "secret.txt"),
            path.join(root, "directory", "index.html"),
            "file",
        );
        await fs.symlink(path.join(root, "index.html"), path.join(root, "inside.html"), "file");
        const { port } = await start(root);
        expect((await request(port, "/escape.txt")).status).toBe(400);
        expect((await request(port, "/directory/")).status).toBe(400);
        expect((await request(port, "/inside.html")).body).toBe("public fixture");
    });
});

describe("static HTTP lifecycle", () => {
    it("closes a stream when the response disconnects before the file opens", async () => {
        const { root } = await fixture();
        let source: ReadStream | undefined;
        const sourceClosed = deferred();
        const { port, settled } = await start(root, (_req, res) => {
            res.once("pipe", (stream: ReadStream) => {
                source = stream;
                stream.once("close", sourceClosed.resolve);
                res.destroy();
            });
        });
        await expect(request(port, "/index.html")).rejects.toThrow();
        await bounded(Promise.all([sourceClosed.promise, settled]));
        expect(source?.fd).toBe(null);
    });
    it("survives a deterministic stat/open failure in an isolated process", async () => {
        const { root } = await fixture();
        await fs.writeFile(path.join(root, "index.html"), "normal public fixture");
        // The historical reproducer contains no global error suppression: an unhandled
        // ReadStream error exits the child and makes this assertion fail.
        const script = fileURLToPath(
            new URL("../../../../scripts/audit-worldlens-http-2026-09-04.mjs", import.meta.url),
        );
        const { stdout } = await promisify(execFile)(
            process.execPath,
            ["--experimental-strip-types", script, "--stream-race-child", root],
            { timeout: 8000 },
        );
        expect(stdout).toContain("server survived");
    });

    it.each([false, true])(
        "releases the descriptor after a read failure (partial=%s)",
        async (partial) => {
            const { root } = await fixture();
            await largeFile(root);
            let source: ReadStream | undefined;
            const sourceClosed = deferred();
            const { port, settled } = await start(root, (req, res) => {
                if (req.url !== "/large.bin") return;
                res.once("pipe", (stream: ReadStream) => {
                    source = stream;
                    stream.once("close", sourceClosed.resolve);
                    stream.once(partial ? "data" : "open", () => {
                        stream.destroy(new Error("synthetic read failure"));
                    });
                });
            });
            await expect(request(port, "/large.bin")).rejects.toThrow();
            await bounded(Promise.all([sourceClosed.promise, settled]));
            expect(source?.closed).toBe(true);
            expect(source?.fd).toBe(null);
            expect((await request(port, "/")).status).toBe(200);
        },
    );

    it("closes the source on repeated mid-download cancellations", async () => {
        const { root } = await fixture();
        await largeFile(root);
        for (let attempt = 0; attempt < 3; attempt++) {
            let source: ReadStream | undefined;
            const sourceClosed = deferred();
            const { port, close, settled } = await start(root, (_req, res) => {
                res.once("pipe", (stream: ReadStream) => {
                    source = stream;
                    stream.once("close", sourceClosed.resolve);
                });
            });
            await new Promise<void>((resolve, reject) => {
                const req = http.get(
                    {
                        host: "127.0.0.1",
                        port,
                        path: "/large.bin",
                        agent: false,
                        headers: { authorization: "Bearer fixture-token" },
                    },
                    (res) => {
                        res.on("error", () => {});
                        res.once("data", () => {
                            res.destroy();
                            resolve();
                        });
                    },
                );
                req.once("error", reject);
                cleanups.push(() => {
                    req.destroy();
                });
            });
            await bounded(Promise.all([sourceClosed.promise, settled]));
            expect(source?.destroyed).toBe(true);
            expect(source?.fd).toBe(null);
            await close();
        }
    });

    it("settles an abort before filesystem lookups finish without opening a stream", async () => {
        const { root } = await fixture();
        let piped = false;
        const { port, settled } = await start(root, (_req, res) => {
            res.once("pipe", () => {
                piped = true;
            });
            res.destroy();
        });
        await expect(request(port, "/index.html")).rejects.toThrow();
        await bounded(settled);
        expect(piped).toBe(false);
    });

    it("releases a normally completed download", async () => {
        const { root } = await fixture();
        let source: ReadStream | undefined;
        const sourceClosed = deferred();
        const { port, settled } = await start(root, (_req, res) => {
            res.once("pipe", (stream: ReadStream) => {
                source = stream;
                stream.once("close", sourceClosed.resolve);
            });
        });
        expect((await request(port, "/")).body).toBe("public fixture");
        await bounded(Promise.all([sourceClosed.promise, settled]));
        expect(source?.fd).toBe(null);
    });
});

describe("HTTP shutdown", () => {
    it("closes with no clients", async () => {
        const { root } = await fixture();
        const { close } = await start(root);
        await bounded(close());
    });

    it("terminates an active event stream without waiting for the client", async () => {
        const server = new HttpServer();
        let response: http.ServerResponse | undefined;
        const responseClosed = deferred();
        server.addHandler({
            async handle(_req, res) {
                response = res;
                res.once("close", responseClosed.resolve);
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.write(": synthetic event\n\n");
                return true;
            },
        });
        const { port } = await server.listen();
        const req = http.get({ host: "127.0.0.1", port, agent: false });
        req.on("error", () => {});
        const [incoming] = (await once(req, "response")) as [http.IncomingMessage];
        incoming.on("error", () => {});
        incoming.resume();
        const closing = server.close();
        try {
            await bounded(Promise.all([closing, responseClosed.promise]));
            expect(response?.destroyed).toBe(true);
        } finally {
            response?.destroy();
            incoming.destroy();
            req.destroy();
            await closing;
        }
    });

    it("terminates an active static download and closes its descriptor", async () => {
        const { root } = await fixture();
        await largeFile(root);
        let source: ReadStream | undefined;
        const sourceClosed = deferred();
        const { port, close, settled } = await start(root, (_req, res) => {
            res.once("pipe", (stream: ReadStream) => {
                source = stream;
                stream.once("close", sourceClosed.resolve);
            });
        });
        const req = http.get({
            host: "127.0.0.1",
            port,
            path: "/large.bin",
            agent: false,
            headers: { authorization: "Bearer fixture-token" },
        });
        req.on("error", () => {});
        cleanups.push(() => {
            req.destroy();
        });
        const [incoming] = (await once(req, "response")) as [http.IncomingMessage];
        incoming.on("error", () => {});
        cleanups.push(() => {
            incoming.destroy();
        });
        await bounded(Promise.all([close(), sourceClosed.promise, settled]));
        expect(source?.fd).toBe(null);
    });
});
