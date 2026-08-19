/**
 * Throwaway target lifecycle for the SQL cross-engine oracle.
 *
 * PostgreSQL runs in an official, exact-tag container bound only to loopback. SQLite
 * uses a unique file directory because its JDBC driver is file-backed. Both targets
 * are scoped below the caller's work directory and return an idempotent dispose()
 * function for the harness's finally block. This module owns setup/teardown only;
 * comparison and rendering remain in sql-crosscompat.mjs.
 */

import { spawn } from "node:child_process";
import { lstat, mkdtemp, mkdir, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

const DEFAULT_POSTGRES_IMAGE = "postgres:17.6";
const DEFAULT_POSTGRES_USER = "postgres";
const DEFAULT_POSTGRES_DATABASE = "worldlens_crosscompat";
const DEFAULT_TIMEOUT_MS = 120_000;

function fail(message) {
    throw new Error(`[sql-crosscompat-targets] ${message}`);
}

async function assertSafeWorkRoot(workRoot) {
    const absolute = resolve(workRoot);
    if (!isAbsolute(absolute) || absolute === dirname(absolute) || absolute.endsWith(sep))
        fail("work root must be a non-root absolute directory");
    let current = absolute;
    while (true) {
        try {
            const info = await lstat(current);
            if (info.isSymbolicLink()) fail(`work root contains a symbolic-link/reparse component: ${current}`);
            if (!info.isDirectory()) fail(`work root component is not a directory: ${current}`);
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return absolute;
}

function assertIdentifier(value, label) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) fail(`${label} must be a simple SQL identifier`);
    return value;
}

function run(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, env } = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, {
            env: { ...process.env, ...(env ?? {}) },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            child.kill();
            settle({ code: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);
        const settle = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolvePromise(result);
        };
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (code) => settle({ code: code ?? -1, stdout, stderr, timedOut: false }));
    });
}

async function freeLoopbackPort() {
    const server = createServer();
    await new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: 0 }, resolvePromise);
    });
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : null;
    await new Promise((resolvePromise) => server.close(resolvePromise));
    if (!Number.isInteger(port) || port < 1) fail("could not reserve a loopback port");
    return port;
}

async function waitForPort(host, port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const connected = await new Promise((resolvePromise) => {
            const socket = createConnection({ host, port });
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                socket.destroy();
                resolvePromise(result);
            };
            socket.setTimeout(Math.min(1000, Math.max(1, deadline - Date.now())), () => finish(false));
            socket.once("connect", () => finish(true));
            socket.once("error", () => finish(false));
        });
        if (connected) return true;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    return false;
}

function ensureWithin(root, candidate) {
    const rootPath = resolve(root);
    const candidatePath = resolve(candidate);
    if (candidatePath !== rootPath && !candidatePath.startsWith(rootPath + sep))
        fail(`target path escapes work root: ${candidatePath}`);
    return candidatePath;
}

/**
 * Creates a SQLite target directory without touching any path outside workRoot.
 * The returned JDBC URL uses forward slashes so it can be embedded in HOCON on every
 * supported host without a second round of backslash escaping.
 */
export async function createSqliteTarget({ workRoot }) {
    const root = await assertSafeWorkRoot(workRoot);
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "sqlite-crosscompat-"));
    const databasePath = ensureWithin(root, join(directory, "storage.db"));
    let disposed = false;
    const target = {
        kind: "sqlite",
        directory,
        databasePath,
        connectionUrl: `jdbc:sqlite:${databasePath.split("\\").join("/")}`,
        driverClass: "org.sqlite.JDBC",
        toJSON() {
            return { kind: "sqlite", databasePath: "<redacted>" };
        },
        cleanup: { ok: false, state: "pending" },
        async dispose() {
            if (disposed) return target.cleanup;
            disposed = true;
            try {
                await rm(directory, { recursive: true, force: true });
                target.cleanup = { ok: true, state: "removed" };
            } catch (error) {
                target.cleanup = {
                    ok: false,
                    state: "failed",
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
            return target.cleanup;
        },
    };
    return target;
}

/**
 * Starts one PostgreSQL container. The image, credentials, and database are all
 * per-target values; the password is returned only in memory and never logged.
 */
export async function createPostgresTarget({
    workRoot,
    image = DEFAULT_POSTGRES_IMAGE,
    user = DEFAULT_POSTGRES_USER,
    database = DEFAULT_POSTGRES_DATABASE,
    password,
    hostPort = 0,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    name = `worldlens-crosscompat-pg-${process.pid}-${Date.now()}`,
} = {}) {
    const root = await assertSafeWorkRoot(workRoot);
    if (!/^postgres:\d+\.\d+(?:\.\d+)?$/.test(image)) fail("PostgreSQL image must be an exact postgres:<major>.<minor>[.<patch>] tag");
    assertIdentifier(user, "PostgreSQL user");
    assertIdentifier(database, "PostgreSQL database");
    assertIdentifier(name.replace(/-/g, "_"), "container name");
    if (password === undefined || password.length < 16) fail("PostgreSQL password must be supplied in memory and be at least 16 characters");
    if (!Number.isInteger(hostPort) || hostPort < 0 || hostPort > 65535) fail("hostPort must be 0..65535");
    await mkdir(root, { recursive: true });
    const port = hostPort === 0 ? await freeLoopbackPort() : hostPort;
    const runResult = await run(
        "docker",
        [
            "run",
            "--detach",
            "--name",
            name,
            "--publish",
            `127.0.0.1:${port}:5432`,
            "--env",
            `POSTGRES_USER=${user}`,
            "--env",
            `POSTGRES_PASSWORD=${password}`,
            "--env",
            `POSTGRES_DB=${database}`,
            "--health-cmd",
            `pg_isready -U ${user} -d ${database}`,
            "--health-interval",
            "250ms",
            "--health-timeout",
            "3s",
            "--health-retries",
            "20",
            image,
        ],
        { timeoutMs },
    );
    if (runResult.code !== 0 || runResult.timedOut) {
        const cleanup = await run("docker", ["rm", "--force", name], { timeoutMs: 30_000 });
        const cleanupState = cleanup.code === 0 || /no such container/i.test(cleanup.stderr) ? "ok" : "failed";
        fail(
            `docker run failed for ${image}: ${runResult.stderr.trim().slice(-1000)}; ` +
                `startup cleanup=${cleanupState}`,
        );
    }
    let disposed = false;
    const target = {
        kind: "postgresql",
        image,
        containerName: name,
        host: "127.0.0.1",
        port,
        user,
        database,
        password,
        connectionUrl: `jdbc:postgresql://127.0.0.1:${port}/${database}`,
        connectionProperties: Object.freeze({ user, password }),
        driverClass: "org.postgresql.Driver",
        toJSON() {
            return { kind: "postgresql", image, containerName: name, host: "127.0.0.1", port, database, user };
        },
        cleanup: { ok: false, state: "pending" },
        async waitUntilReady(waitTimeoutMs = timeoutMs) {
            if (!(await waitForPort("127.0.0.1", port, waitTimeoutMs)))
                fail(`PostgreSQL container ${name} did not open 127.0.0.1:${port}`);
            const deadline = Date.now() + waitTimeoutMs;
            while (Date.now() < deadline) {
                const inspect = await run("docker", ["inspect", "--format={{.State.Health.Status}}", name], {
                    timeoutMs: 10_000,
                });
                if (inspect.code === 0 && inspect.stdout.trim() === "healthy") {
                    await target.authenticate();
                    return;
                }
                if (inspect.stdout.trim() === "unhealthy") fail(`PostgreSQL container ${name} became unhealthy`);
                await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
            }
            fail(`PostgreSQL container ${name} did not become healthy within ${waitTimeoutMs}ms`);
        },
        async authenticate() {
            const result = await run(
                "docker",
                [
                    "exec",
                    "--env",
                    `PGPASSWORD=${password}`,
                    name,
                    "psql",
                    "--no-password",
                    "--host",
                    "127.0.0.1",
                    "--username",
                    user,
                    "--dbname",
                    database,
                    "--command",
                    "SELECT 1",
                ],
                { timeoutMs: 15_000 },
            );
            if (result.code !== 0)
                fail(`PostgreSQL credential/property authentication failed for ${name}: ${result.stderr.trim().slice(-1000)}`);
            return { ok: true, state: "authenticated" };
        },
        async dispose() {
            if (disposed) return target.cleanup;
            disposed = true;
            try {
                const removed = await run("docker", ["rm", "--force", name], { timeoutMs: 30_000 });
                if (removed.code !== 0 && !/no such container/i.test(removed.stderr))
                    throw new Error(removed.stderr.trim().slice(-1000));
                target.cleanup = { ok: true, state: "removed" };
            } catch (error) {
                target.cleanup = {
                    ok: false,
                    state: "failed",
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
            return target.cleanup;
        },
    };
    return target;
}

export const POSTGRES_IMAGE = DEFAULT_POSTGRES_IMAGE;
