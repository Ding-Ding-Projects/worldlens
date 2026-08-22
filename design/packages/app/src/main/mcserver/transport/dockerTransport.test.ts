import { describe, expect, it } from "vitest";

import type { CommandOutput, CommandRunner } from "../../runtime/command.js";
import { createDockerTransport, type FileChannel } from "./dockerTransport.js";
import { hashBytes } from "./hash.js";
import { MAX_FILE_BYTES, type ServerTransport, type TransportCapabilities } from "./types.js";

interface Call {
    readonly command: string;
    readonly args: readonly string[];
}

function output(overrides: Partial<CommandOutput> = {}): CommandOutput {
    return { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null, ...overrides };
}

/**
 * A fake Docker that answers by command shape.
 *
 * `calls` is the point of it: most of what this transport does is decide the exact command
 * line, and asserting on the arguments is asserting on the real behaviour. Nothing here
 * needs a Docker daemon.
 */
function fakeDocker(responses: (args: readonly string[]) => CommandOutput): {
    runner: CommandRunner;
    calls: Call[];
} {
    const calls: Call[] = [];
    const runner: CommandRunner = async (command, args) => {
        calls.push({ command, args });
        return responses(args);
    };
    return { runner, calls };
}

/** An in-memory stand-in for the machine the daemon runs on. */
function fakeChannel(): FileChannel & { staged: Map<string, Uint8Array> } {
    const staged = new Map<string, Uint8Array>();
    return {
        staged,
        stagingPath: (name) => `/tmp/staged-${name}`,
        async collect(path, maxBytes) {
            const bytes = staged.get(path);
            if (bytes === undefined) {
                return { ok: false, failure: { code: "not-found", message: "not staged", detail: null } };
            }
            return { ok: true, value: bytes.byteLength > maxBytes ? bytes.subarray(0, maxBytes) : bytes };
        },
        async deposit(path, bytes) {
            staged.set(path, bytes);
            return { ok: true, value: undefined };
        },
        async discard(path) {
            staged.delete(path);
        },
    };
}

function build(
    responses: (args: readonly string[]) => CommandOutput,
    channel: FileChannel = fakeChannel(),
    capabilities?: Partial<TransportCapabilities>,
): { transport: ServerTransport; calls: Call[] } {
    const { runner, calls } = fakeDocker(responses);
    const transport = createDockerTransport({
        ref: { kind: "local-docker", containerRef: "mc-paper", serverDir: "/data" },
        containerRef: "mc-paper",
        serverDir: "/data",
        runner,
        files: channel,
        ...(capabilities === undefined ? {} : { capabilities }),
    });
    return { transport, calls };
}

describe("dockerTransport status", () => {
    it("reads running from Docker's own boolean", async () => {
        const { transport } = build(() =>
            output({ stdout: JSON.stringify({ Status: "running", Running: true, StartedAt: "2026-01-01T00:00:00Z", ExitCode: 0 }) }),
        );
        const answer = await transport.status();
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.running).toBe(true);
        expect(answer.value.state).toBe("running");
        expect(answer.value.startedAt).toBe("2026-01-01T00:00:00Z");
    });

    it("reports a missing container as absent rather than as an error", async () => {
        const { transport } = build(() =>
            output({ ok: false, exitCode: 1, stderr: "Error: No such container: mc-paper" }),
        );
        const answer = await transport.status();
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.state).toBe("absent");
        expect(answer.value.running).toBe(false);
    });

    it("reports an unreachable daemon as unreachable, never as stopped", async () => {
        // The distinction the whole console design rests on. Rendering this as "stopped"
        // offers a restart button for a server that is running perfectly well.
        const { transport } = build(() =>
            output({ ok: false, exitCode: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." }),
        );
        const answer = await transport.status();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unreachable");
        expect(answer.failure.code).not.toBe("not-running");
    });

    it("treats a runner that could not launch as unreachable", async () => {
        const { transport } = build(() => output({ ok: false, exitCode: null, spawnError: "ENOENT" }));
        const answer = await transport.status();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unreachable");
    });

    it("reports an SSH failure as unreachable rather than as a Docker problem", async () => {
        const { transport } = build(() =>
            output({ ok: false, exitCode: 255, stderr: "ssh: connect to host box port 22: No route to host" }),
        );
        const answer = await transport.status();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unreachable");
    });
});

describe("dockerTransport lifecycle", () => {
    it("stops with a grace period rather than killing", async () => {
        const { transport, calls } = build(() => output());
        expect((await transport.stop({ graceful: true, timeoutMs: 30_000 })).ok).toBe(true);
        expect(calls[0]?.args).toEqual(["stop", "--timeout", "30", "mc-paper"]);
    });

    it("kills only when explicitly asked to", async () => {
        const { transport, calls } = build(() => output());
        expect((await transport.stop({ graceful: false, timeoutMs: 30_000 })).ok).toBe(true);
        expect(calls[0]?.args).toEqual(["kill", "mc-paper"]);
    });

    it("refuses a container name that has no business on a command line", async () => {
        const { runner } = fakeDocker(() => output());
        const transport = createDockerTransport({
            ref: { kind: "local-docker", containerRef: "mc; rm -rf /", serverDir: "/data" },
            containerRef: "mc; rm -rf /",
            serverDir: "/data",
            runner,
            files: fakeChannel(),
        });
        const answer = await transport.start();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });

    it("refuses an environment value carrying a newline", async () => {
        const { transport } = build(() => output());
        const answer = await transport.create({
            id: "a",
            name: "A",
            image: "itzg/minecraft-server",
            memoryMb: 2048,
            ports: [],
            env: { MOTD: "hi\nEULA=TRUE" },
        });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });
});

describe("dockerTransport capabilities", () => {
    it("refuses lifecycle on an adopted container that did not consent to it", async () => {
        const { transport, calls } = build(() => output(), fakeChannel(), { canLifecycle: false });
        const answer = await transport.start();
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unsupported");
        // Crucially, it never reached Docker at all.
        expect(calls).toHaveLength(0);
    });

    it("refuses a write when the user did not grant file access", async () => {
        const { transport, calls } = build(() => output(), fakeChannel(), { canWriteFiles: false });
        const answer = await transport.fileWrite("server.properties", new Uint8Array([1]), { expectedHash: null });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unsupported");
        expect(calls).toHaveLength(0);
    });

    it("refuses to recreate a container it did not create", async () => {
        const { transport } = build(() => output(), fakeChannel(), { canCreate: false });
        const answer = await transport.create({
            id: "a",
            name: "A",
            image: "itzg/minecraft-server",
            memoryMb: 1024,
            ports: [],
            env: {},
        });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unsupported");
    });
});

describe("dockerTransport files", () => {
    it("copies a file out through staging and hashes the bytes", async () => {
        const channel = fakeChannel();
        const bytes = new Uint8Array(Buffer.from("pvp=true\n"));
        const { transport, calls } = build((args) => {
            if (args[0] === "cp") {
                channel.staged.set(args[2] as string, bytes);
                return output();
            }
            return output();
        }, channel);

        const answer = await transport.fileRead("server.properties");
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(Buffer.from(answer.value.bytes).toString("utf8")).toBe("pvp=true\n");
        expect(answer.value.hash).toBe(hashBytes(bytes));
        // Copied out of the container by path, so it works on a stopped container too -
        // which is exactly when a broken config most needs fixing.
        expect(calls[0]?.args[1]).toBe("mc-paper:/data/server.properties");
    });

    it("refuses to read outside the server folder before touching Docker", async () => {
        const { transport, calls } = build(() => output());
        const answer = await transport.fileRead("../../etc/passwd");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("out-of-scope");
        expect(calls).toHaveLength(0);
    });

    it("writes by staging the bytes and copying them in", async () => {
        const channel = fakeChannel();
        const { transport, calls } = build(() => output(), channel);
        const bytes = new Uint8Array(Buffer.from("motd=hello\n"));
        const answer = await transport.fileWrite("server.properties", bytes, { expectedHash: null });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.hash).toBe(hashBytes(bytes));
        const cp = calls.find((call) => call.args[0] === "cp");
        expect(cp?.args[2]).toBe("mc-paper:/data/server.properties");
    });

    it("refuses a stale write and does not copy anything in", async () => {
        const channel = fakeChannel();
        const onDisk = new Uint8Array(Buffer.from("a: 1\nb: 2\n"));
        const { transport, calls } = build((args) => {
            if (args[0] === "cp" && String(args[1]).startsWith("mc-paper:")) {
                channel.staged.set(args[2] as string, onDisk);
            }
            return output();
        }, channel);

        const answer = await transport.fileWrite("config.yml", new Uint8Array(Buffer.from("a: 99\n")), {
            expectedHash: hashBytes(new Uint8Array(Buffer.from("a: 1\n"))),
        });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("stale-document");

        // Nothing was copied INTO the container. A refused write that wrote anyway is the
        // exact data loss this guard exists to prevent.
        const inbound = calls.filter((call) => call.args[0] === "cp" && String(call.args[2]).startsWith("mc-paper:"));
        expect(inbound).toHaveLength(0);
    });

    it("allows the write when the hash still matches", async () => {
        const channel = fakeChannel();
        const onDisk = new Uint8Array(Buffer.from("a: 1\n"));
        const { transport } = build((args) => {
            if (args[0] === "cp" && String(args[1]).startsWith("mc-paper:")) {
                channel.staged.set(args[2] as string, onDisk);
            }
            return output();
        }, channel);

        const answer = await transport.fileWrite("config.yml", new Uint8Array(Buffer.from("a: 2\n")), {
            expectedHash: hashBytes(onDisk),
        });
        expect(answer.ok).toBe(true);
    });

    it("refuses to hash-check a file too large to have been read whole", async () => {
        // A truncated read cannot prove the rest of the file is unchanged, so a write
        // gated on that hash would silently discard everything past the read limit. The
        // channel here always returns more bytes than any limit, so every read truncates.
        const staged = new Map<string, Uint8Array>();
        const huge = new Uint8Array(Buffer.alloc(MAX_FILE_BYTES + 1_024, 7));
        const transport = createDockerTransport({
            ref: { kind: "local-docker", containerRef: "mc-paper", serverDir: "/data" },
            containerRef: "mc-paper",
            serverDir: "/data",
            runner: async (_command, args) => {
                if (args[0] === "cp") staged.set(args[2] as string, huge);
                return output();
            },
            files: {
                stagingPath: (name) => `/tmp/staged-${name}`,
                async collect(path, maxBytes) {
                    const bytes = staged.get(path);
                    if (bytes === undefined) {
                        return { ok: false, failure: { code: "not-found", message: "no", detail: null } };
                    }
                    return { ok: true, value: bytes.subarray(0, maxBytes) };
                },
                async deposit(path, bytes) {
                    staged.set(path, bytes);
                    return { ok: true, value: undefined };
                },
                async discard(path) {
                    staged.delete(path);
                },
            },
        });

        const answer = await transport.fileWrite("big.bin", new Uint8Array([1]), { expectedHash: "deadbeef" });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
        expect(answer.failure.message).toContain("too large");
    });

    it("parses a directory listing into kinds and sizes", async () => {
        const listing = [
            "total 12",
            "drwxr-xr-x 2 root root 4096 2026-01-01 10:00 plugins",
            "-rw-r--r-- 1 root root 1024 2026-01-02 11:30 server.properties",
            "lrwxrwxrwx 1 root root    9 2026-01-03 12:00 latest.log -> logs/a.log",
        ].join("\n");
        const { transport } = build(() => output({ stdout: listing }));
        const answer = await transport.fileList(".");
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        const byName = new Map(answer.value.map((entry) => [entry.name, entry]));
        expect(byName.get("plugins")?.kind).toBe("directory");
        expect(byName.get("server.properties")?.kind).toBe("file");
        expect(byName.get("server.properties")?.size).toBe(1024);
        expect(byName.get("latest.log")?.kind).toBe("symlink");
    });
});

describe("dockerTransport console", () => {
    it("replays the log tail without following it", async () => {
        const { transport, calls } = build(() =>
            output({ stdout: "[12:00:00 INFO]: Starting minecraft server\n[12:00:30 INFO]: Done!" }),
        );
        const attached = await transport.attach({ tail: 200 });
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;

        const lines: string[] = [];
        for await (const line of attached.value.lines) lines.push(line.text);
        expect(lines).toEqual(["[12:00:00 INFO]: Starting minecraft server", "[12:00:30 INFO]: Done!"]);
        expect(calls[0]?.args).toEqual(["logs", "--tail", "200", "mc-paper"]);
        // No --follow, and above all no `attach`: a stray signal through an attached TTY
        // would take a live server full of players down with it.
        expect(calls[0]?.args).not.toContain("--follow");
        expect(calls[0]?.args[0]).not.toBe("attach");
    });

    it("points console writes at RCON rather than pretending to send them", async () => {
        const { transport } = build(() => output({ stdout: "" }));
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;
        const answer = await attached.value.send("say hello");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("unsupported");
    });

    it("says plainly when a console is read-only", async () => {
        const { transport } = build(() => output({ stdout: "" }), fakeChannel(), { console: "none" });
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;
        const answer = await attached.value.send("stop");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.message).toContain("read");
    });

    it("refuses a command containing a line break", async () => {
        const { transport } = build(() => output({ stdout: "" }), fakeChannel(), { console: "exec-helper" });
        const attached = await transport.attach();
        expect(attached.ok).toBe(true);
        if (!attached.ok) return;
        const answer = await attached.value.send("say hi\nstop");
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("invalid-request");
    });
});
