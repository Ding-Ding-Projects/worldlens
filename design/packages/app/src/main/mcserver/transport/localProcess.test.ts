import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashBytes } from "./hash.js";
import { BACKUP_DIR, createLocalProcessTransport } from "./localProcess.js";
import type { ServerTransport } from "./types.js";

/**
 * A stand-in for a Minecraft server process.
 *
 * Deliberately a real EventEmitter with real streams rather than a bag of vi.fn(), because
 * the thing under test is stream plumbing - if this were mocked at the method level the
 * test would prove only that the mock was called.
 */
class FakeChild extends EventEmitter {
    readonly stdin = new PassThrough();
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    exitCode: number | null = null;

    /** What the server "received" on its console. */
    written = "";

    constructor() {
        super();
        this.stdin.on("data", (chunk: Buffer) => {
            this.written += chunk.toString("utf8");
        });
    }

    exit(code: number): void {
        this.exitCode = code;
        this.emit("exit", code);
    }

    kill(): boolean {
        this.exit(143);
        return true;
    }
}

describe("createLocalProcessTransport files", () => {
    let dir: string;
    let transport: ServerTransport;

    beforeEach(async () => {
        // A real temporary directory, not a mocked fs. The file half of this transport is
        // almost entirely filesystem behaviour, and a mock would assert nothing about it.
        dir = await mkdtemp(join(tmpdir(), "wl-mcserver-"));
        transport = createLocalProcessTransport({
            serverDir: dir,
            javaPath: join(dir, "java"),
            jarPath: join(dir, "server.jar"),
            memoryMb: 2048,
        });
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("reads a file back with a hash of its bytes", async () => {
        await writeFile(join(dir, "server.properties"), "pvp=true\n");
        const answer = await transport.fileRead("server.properties");
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(Buffer.from(answer.value.bytes).toString("utf8")).toBe("pvp=true\n");
        expect(answer.value.hash).toBe(hashBytes(new Uint8Array(Buffer.from("pvp=true\n"))));
        expect(answer.value.truncated).toBe(false);
    });

    it("reports not-found rather than an empty file", async () => {
        const answer = await transport.fileRead("nope.yml");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("not-found");
    });

    it("truncates at maxBytes and says that it did", async () => {
        await writeFile(join(dir, "big.txt"), "0123456789");
        const answer = await transport.fileRead("big.txt", { maxBytes: 4 });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.truncated).toBe(true);
        expect(answer.value.size).toBe(10);
        expect(Buffer.from(answer.value.bytes).toString("utf8")).toBe("0123");
    });

    it("refuses to read outside the server folder", async () => {
        const answer = await transport.fileRead("../secrets.txt");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("out-of-scope");
    });

    it("writes a new file and reports its hash", async () => {
        const bytes = new Uint8Array(Buffer.from("motd=hello\n"));
        const answer = await transport.fileWrite("server.properties", bytes, {
            expectedHash: null,
        });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.hash).toBe(hashBytes(bytes));
        expect(answer.value.backupPath).toBeNull();
        expect(await readFile(join(dir, "server.properties"), "utf8")).toBe("motd=hello\n");
    });

    it("backs the old file up before replacing it", async () => {
        await writeFile(join(dir, "server.properties"), "pvp=true\n");
        const read = await transport.fileRead("server.properties");
        expect(read.ok).toBe(true);
        if (!read.ok) return;

        const answer = await transport.fileWrite(
            "server.properties",
            new Uint8Array(Buffer.from("pvp=false\n")),
            {
                expectedHash: read.value.hash,
            },
        );
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.backupPath).not.toBeNull();
        expect(answer.value.backupPath).toContain(BACKUP_DIR);
        // The backup must hold what was there BEFORE, or it is not a backup.
        expect(await readFile(answer.value.backupPath as string, "utf8")).toBe("pvp=true\n");
        expect(await readFile(join(dir, "server.properties"), "utf8")).toBe("pvp=false\n");
    });

    it("refuses a write whose expected hash no longer matches the file", async () => {
        await writeFile(join(dir, "config.yml"), "a: 1\n");
        const read = await transport.fileRead("config.yml");
        expect(read.ok).toBe(true);
        if (!read.ok) return;

        // Something else rewrites it - a plugin, or the server flushing defaults on stop.
        await writeFile(join(dir, "config.yml"), "a: 1\nb: 2\n");

        const answer = await transport.fileWrite(
            "config.yml",
            new Uint8Array(Buffer.from("a: 99\n")),
            {
                expectedHash: read.value.hash,
            },
        );
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("stale-document");
        // The file on disk must be untouched. A refused write that wrote anyway is the
        // exact data loss this guard exists to prevent.
        expect(await readFile(join(dir, "config.yml"), "utf8")).toBe("a: 1\nb: 2\n");
    });

    it("allows a deliberate unconditional overwrite", async () => {
        await writeFile(join(dir, "config.yml"), "a: 1\n");
        const answer = await transport.fileWrite(
            "config.yml",
            new Uint8Array(Buffer.from("a: 2\n")),
            {
                expectedHash: null,
            },
        );
        expect(answer.ok).toBe(true);
        expect(await readFile(join(dir, "config.yml"), "utf8")).toBe("a: 2\n");
    });

    it("refuses to write outside the write scope", async () => {
        const scoped = createLocalProcessTransport({
            serverDir: dir,
            javaPath: join(dir, "java"),
            jarPath: join(dir, "server.jar"),
            memoryMb: 1024,
            writeScope: ["plugins"],
        });
        const outside = await scoped.fileWrite("server.properties", new Uint8Array([1]), {
            expectedHash: null,
        });
        expect(outside.ok).toBe(false);
        if (outside.ok) return;
        expect(outside.failure.code).toBe("out-of-scope");

        const inside = await scoped.fileWrite("plugins/a.yml", new Uint8Array([1]), {
            expectedHash: null,
        });
        expect(inside.ok).toBe(true);
    });

    it("lists a directory with kinds and sizes", async () => {
        await writeFile(join(dir, "server.properties"), "pvp=true\n");
        await mkdir(join(dir, "plugins"));
        const answer = await transport.fileList(".");
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        const byName = new Map(answer.value.map((entry) => [entry.name, entry]));
        expect(byName.get("server.properties")?.kind).toBe("file");
        expect(byName.get("server.properties")?.size).toBe(9);
        expect(byName.get("plugins")?.kind).toBe("directory");
    });
});

describe("createLocalProcessTransport lifecycle", () => {
    it("launches a generated loader argument file without executing the installer jar", async () => {
        const argsFile = "C:/fixture/libraries/forge/win_args.txt";
        let actual: readonly string[] = [];
        const transport = createLocalProcessTransport({
            serverDir: "C:/fixture",
            javaPath: "java",
            jarPath: "C:/fixture/installer.jar",
            argsFile,
            memoryMb: 2048,
            spawnProcess: ((_command: string, args: readonly string[]) => {
                actual = args;
                return new FakeChild();
            }) as never,
        });
        expect((await transport.start()).ok).toBe(true);
        expect(actual).toEqual(["-Xmx2048M", "-Xms1024M", `@${argsFile}`, "nogui"]);
        expect(actual).not.toContain("-jar");
        expect(actual).not.toContain("C:/fixture/installer.jar");
    });
    let dir: string;
    let child: FakeChild;
    let transport: ServerTransport;
    let spawnArgs: readonly string[] = [];

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-mcserver-run-"));
        child = new FakeChild();
        transport = createLocalProcessTransport({
            serverDir: dir,
            javaPath: "/usr/bin/java",
            jarPath: join(dir, "paper.jar"),
            memoryMb: 4096,
            spawnProcess: ((_command: string, args: readonly string[]) => {
                spawnArgs = args;
                return child;
            }) as never,
        });
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("reports not running before it is started", async () => {
        const answer = await transport.status();
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.running).toBe(false);
    });

    it("starts the JVM with the memory it was given", async () => {
        expect((await transport.start()).ok).toBe(true);
        expect(spawnArgs).toContain("-Xmx4096M");
        expect(spawnArgs).toContain("-jar");
        expect(spawnArgs).toContain("nogui");
        const answer = await transport.status();
        expect(answer.ok && answer.value.running).toBe(true);
    });

    it("does not spawn a second server onto the same world", async () => {
        await transport.start();
        const first = child;
        await transport.start();
        // A second JVM writing the same world folder is how a world gets corrupted.
        expect(child).toBe(first);
    });

    it("stops gracefully by asking the server to stop, not by killing it", async () => {
        await transport.start();
        const stopping = transport.stop({ graceful: true, timeoutMs: 1_000 });
        // The server hears `stop`, saves, and exits of its own accord.
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(child.written).toBe("stop\n");
        child.exit(0);
        const answer = await stopping;
        expect(answer.ok).toBe(true);
    });

    it("reports a timeout rather than escalating to a kill on its own", async () => {
        await transport.start();
        const answer = await transport.stop({ graceful: true, timeoutMs: 20 });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("timeout");
        // Still running: escalating to a kill is the user's call, because it costs
        // whatever the server has not saved.
        expect(child.exitCode).toBeNull();
    });

    it("refuses to stop something that is not running", async () => {
        const answer = await transport.stop({ graceful: true, timeoutMs: 100 });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("not-running");
    });
});

describe("createLocalProcessTransport console", () => {
    let dir: string;
    let child: FakeChild;
    let transport: ServerTransport;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "wl-mcserver-console-"));
        child = new FakeChild();
        transport = createLocalProcessTransport({
            serverDir: dir,
            javaPath: "/usr/bin/java",
            jarPath: join(dir, "paper.jar"),
            memoryMb: 1024,
            spawnProcess: (() => child) as never,
        });
        await transport.start();
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("yields server output as separate lines", async () => {
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;

        const collected: string[] = [];
        const reading = (async () => {
            for await (const line of attached.value.lines) {
                collected.push(line.text);
                if (collected.length === 2) attached.value.detach();
            }
        })();

        child.stdout.write("[12:00:00 INFO]: Starting minecraft server\n[12:00:01 INFO]: Done!\n");
        await reading;

        expect(collected).toEqual([
            "[12:00:00 INFO]: Starting minecraft server",
            "[12:00:01 INFO]: Done!",
        ]);
    });

    it("sends a command as one line", async () => {
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;
        expect((await attached.value.send("say hello")).ok).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(child.written).toBe("say hello\n");
        attached.value.detach();
    });

    it("refuses a command containing a line break", async () => {
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;

        // Otherwise `say hi\nstop` runs a second command the user never confirmed.
        const answer = await attached.value.send("say hi\nstop");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
        expect(child.written).toBe("");
        attached.value.detach();
    });

    it("detaching stops the follower and leaves the server alone", async () => {
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;

        attached.value.detach();
        const exit = await attached.value.closed;
        expect(exit.reason).toBe("detached");

        // The whole point: the server is still running after we stopped listening.
        expect(child.exitCode).toBeNull();
        const status = await transport.status();
        expect(status.ok && status.value.running).toBe(true);
    });

    it("refuses to attach to a server that is not running", async () => {
        child.exit(0);
        const answer = await transport.attach();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("not-running");
    });
});
