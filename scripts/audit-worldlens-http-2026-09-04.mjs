/**
 * Opt-in regression handoff. All files and HTTP listeners are disposable/local.
 * Run from the repository root with Node >=22.16:
 *   node --experimental-strip-types --test scripts/audit-worldlens-http-2026-09-04.mjs
 * These assertions describe safe behavior and intentionally fail on the audited baseline.
 * WORLDLENS_HTTP_AUDIT_SOURCE is only for auditing byte-verified standalone source copies.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const sourceDir = process.env.WORLDLENS_HTTP_AUDIT_SOURCE
    ?? fileURLToPath(new URL('../design/packages/server/src/http/', import.meta.url));
const { HttpServer } = await import(pathToFileURL(path.join(sourceDir, 'HttpServer.ts')).href);
const { StaticHandler } = await import(pathToFileURL(path.join(sourceDir, 'StaticHandler.ts')).href);
const SELF = fileURLToPath(import.meta.url);

async function fixture() {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'worldlens-http-audit-'));
    const root = path.join(base, 'web');
    const sibling = path.join(base, 'web-private');
    await fs.mkdir(root);
    await fs.mkdir(sibling);
    await fs.writeFile(path.join(root, 'index.html'), 'normal public fixture');
    await fs.writeFile(path.join(sibling, 'probe.txt'), 'outside-root synthetic marker');
    return { base, root, sibling };
}

function get(port, requestPath) {
    return new Promise((resolve, reject) => {
        // Deliberately use a raw request path: a URL client may normalize dot segments first.
        const request = http.get({ host: '127.0.0.1', port, path: requestPath, agent: false }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.once('error', reject);
            res.once('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        request.setTimeout(3000, () => request.destroy(new Error('fixture request timed out')));
        request.once('error', reject);
    });
}

async function withStatic(run) {
    const f = await fixture();
    const server = new HttpServer();
    server.addHandler(new StaticHandler(f.root));
    try {
        const { port } = await server.listen();
        await run({ ...f, port });
    } finally {
        await server.close();
        await fs.rm(f.base, { recursive: true, force: true });
    }
}

async function streamRaceChild(root) {
    const victim = path.join(root, 'vanishes.txt');
    await fs.writeFile(victim, 'disposable file removed after stat');
    const server = new HttpServer();
    const handler = new StaticHandler(root);
    let deleted = false;
    server.addHandler({
        async handle(req, res) {
            if (req.url === '/vanishes.txt') {
                const writeHead = res.writeHead;
                res.writeHead = function (...args) {
                    // A deterministic stat/open race, not a change to production source.
                    if (!deleted) { deleted = true; unlinkSync(victim); }
                    return writeHead.apply(this, args);
                };
            }
            return handler.handle(req, res);
        },
    });
    const { port } = await server.listen();
    const watchdog = setTimeout(() => { process.stderr.write('fixture watchdog expired\n'); process.exit(2); }, 6000);
    try {
        // Either an error response or a terminated transfer is acceptable; process death is not.
        await get(port, '/vanishes.txt').catch(() => undefined);
        const next = await get(port, '/index.html');
        assert.equal(next.status, 200, 'server must still serve after a failed file open');
        assert.equal(next.body, 'normal public fixture');
        process.stdout.write('server survived the stat/open race\n');
    } finally {
        clearTimeout(watchdog);
        await server.close();
    }
}

if (process.argv[2] === '--stream-race-child') {
    await streamRaceChild(process.argv[3]);
} else {
    test('control: an ordinary in-root file is served', { timeout: 10000 }, async () => {
        await withStatic(async ({ port }) => {
            assert.deepEqual(await get(port, '/index.html'), { status: 200, body: 'normal public fixture' });
        });
    });

    test('F1a: encoded parent traversal cannot read a same-prefix sibling', { timeout: 10000 }, async () => {
        await withStatic(async ({ port }) => {
            const result = await get(port, '/%2e%2e%2fweb-private/probe.txt');
            assert.notEqual(result.status, 200, `outside-root request returned ${JSON.stringify(result)}`);
            assert.ok(!result.body.includes('outside-root synthetic marker'));
        });
    });

    test('F1b: a symlink inside the web root cannot serve an outside file', { timeout: 10000 }, async (t) => {
        await withStatic(async ({ port, root, sibling }) => {
            try {
                await fs.symlink(sibling, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
            } catch (error) {
                if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
                    t.skip(`host cannot create the required link: ${error.code}`);
                    return;
                }
                throw error;
            }
            const result = await get(port, '/escape/probe.txt');
            assert.notEqual(result.status, 200, `outside-root symlink returned ${JSON.stringify(result)}`);
            assert.ok(!result.body.includes('outside-root synthetic marker'));
        });
    });

    test('F2: a file disappearing between stat and open does not crash the process', { timeout: 10000 }, async () => {
        const f = await fixture();
        try {
            const child = spawn(process.execPath, ['--experimental-strip-types', SELF, '--stream-race-child', f.root], {
                env: { ...process.env, WORLDLENS_HTTP_AUDIT_SOURCE: sourceDir },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '', stderr = '';
            child.stdout.setEncoding('utf8').on('data', (text) => { stdout += text; });
            child.stderr.setEncoding('utf8').on('data', (text) => { stderr += text; });
            const kill = setTimeout(() => child.kill('SIGKILL'), 8000);
            const [code, signal] = await once(child, 'close').finally(() => clearTimeout(kill));
            assert.equal(code, 0, `child exited ${code}, signal=${signal}\n${stdout}\n${stderr}`);
            assert.match(stdout, /server survived/);
        } finally {
            await fs.rm(f.base, { recursive: true, force: true });
        }
    });

    test('F3: disconnecting a download closes its source file', { timeout: 10000 }, async () => {
        const f = await fixture();
        const file = await fs.open(path.join(f.root, 'large.bin'), 'w');
        await file.truncate(64 * 1024 * 1024); // Sparse owned file, not 64 MiB of fixture data.
        await file.close();
        const handler = new StaticHandler(f.root);
        const server = new HttpServer();
        let source;
        let markClosed;
        const responseClosed = new Promise((resolve) => { markClosed = resolve; });
        server.addHandler({ async handle(req, res) {
            res.once('pipe', (stream) => { source = stream; });
            res.once('close', markClosed);
            return handler.handle(req, res);
        } });
        let request;
        try {
            const { port } = await server.listen();
            await new Promise((resolve, reject) => {
                request = http.get({ host: '127.0.0.1', port, path: '/large.bin', agent: false }, (res) => {
                    res.once('data', () => { res.destroy(); resolve(); });
                    res.on('error', () => {}); // Client intentionally abandons this transfer.
                });
                request.setTimeout(3000, () => request.destroy(new Error('no first response bytes')));
                request.once('error', reject);
            });
            await responseClosed;
            await delay(200);
            assert.ok(source, 'fixture must observe the actual fs.ReadStream');
            assert.equal(source.destroyed, true, `response closed but source.destroyed=${source.destroyed}, fd=${source.fd}`);
            assert.equal(source.fd, null, 'the abandoned transfer must release its file descriptor');
        } finally {
            request?.destroy();
            if (source && !source.closed) {
                const closed = once(source, 'close');
                source.destroy();
                await closed;
            }
            await server.close();
            await fs.rm(f.base, { recursive: true, force: true });
        }
    });

    test('F4: close() can terminate an active event-stream response', { timeout: 10000 }, async () => {
        const server = new HttpServer();
        let response;
        server.addHandler({ async handle(_req, res) {
            response = res;
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.write(': fixture stream remains open\n\n');
            return true;
        } });
        let request, incoming, closing;
        try {
            const { port } = await server.listen();
            incoming = await new Promise((resolve, reject) => {
                request = http.get({ host: '127.0.0.1', port, path: '/', agent: false }, resolve);
                request.once('error', reject);
            });
            incoming.on('error', () => {});
            incoming.resume();
            closing = server.close();
            const outcome = await Promise.race([closing.then(() => 'closed'), delay(1000).then(() => 'still-waiting')]);
            assert.equal(outcome, 'closed', 'closeAllConnections is unreachable while close() waits for the active stream');
        } finally {
            response?.end();
            incoming?.destroy();
            request?.destroy();
            if (closing) await closing;
            else await server.close();
        }
    });
}
