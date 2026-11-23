import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type LiveViewerConfig } from "@worldlens/liveviewer";
import type { CommandOptions, CommandOutput, CommandRunner } from "@worldlens/dockhand";
import type { BundledImageResult } from "./bundledImage.js";
import { InstanceRegistry } from "./registry.js";
import { LiveViewerService, type HealthReply } from "./service.js";
import type { HostRequest, LiveViewerAccounts, ViewerEvent } from "./types.js";

const OWNER = "test-owner";
const IMAGE_ID = `sha256:${"a".repeat(64)}`;
const REFERENCE = "worldlens-live-viewer:bundled-1.0.0";
const TOKEN = "SECRET-REFRESH-TOKEN-VALUE";

function out(stdout = "", ok = true, stderr = ""): CommandOutput {
    return { ok, exitCode: ok ? 0 : 1, stdout, stderr, spawnError: null };
}

interface Call {
    readonly command: string;
    readonly args: readonly string[];
    readonly input: string | undefined;
}

/** A pretend Docker. `script` may answer a call first; anything it declines gets a plausible success. */
class FakeHost {
    readonly calls: Call[] = [];
    imagePresent = false;
    script: (call: Call) => CommandOutput | null = () => null;

    readonly runner: CommandRunner = async (command, args, options?: CommandOptions) => {
        const call: Call = { command, args, input: options?.input };
        this.calls.push(call);
        const custom = this.script(call);
        if (custom !== null) return custom;
        const [first, second] = args;
        if (first === "version") return out(JSON.stringify({ Client: { Version: "27.0.0" }, Server: { Version: "27.0.0" } }));
        if (first === "ps") return out("");
        if (first === "image" && second === "inspect") return this.imagePresent ? out(IMAGE_ID) : out("", false, "Error: No such image");
        if (first === "load") {
            this.imagePresent = true;
            return out("Loaded image");
        }
        if (first === "logs") return out("liveviewer log line");
        return out("ok");
    };

    dockerCalls(): Call[] {
        return this.calls.filter((call) => call.command === "docker");
    }
}

function config(change: Partial<LiveViewerConfig> = {}): LiveViewerConfig {
    return { ...DEFAULT_CONFIG, server: { host: "192.0.2.50", port: 25565 }, ...change };
}

function request(change: Partial<HostRequest> = {}): HostRequest {
    return { config: config(), target: { kind: "local" }, hostPort: 3907, name: "Survival viewer", ...change };
}

const bundled: BundledImageResult = { ok: true, image: { reference: REFERENCE, imageId: IMAGE_ID, version: "1.0.0", tarPath: "C:/resources/liveviewer/liveviewer-image.tar", bytes: 10, sha256: "b".repeat(64) } };

const joined: HealthReply = { botConnected: true, state: "connected", botName: "LensBot", lastError: null };

let folder: string;
beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "lv-service-"));
});
afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

function make(host: FakeHost, extra: Partial<ConstructorParameters<typeof LiveViewerService>[0]> = {}): { service: LiveViewerService; registry: InstanceRegistry; events: ViewerEvent[] } {
    const registry = new InstanceRegistry(folder);
    const events: ViewerEvent[] = [];
    const service = new LiveViewerService({
        registry,
        owner: OWNER,
        resolveSsh: () => null,
        accounts: null,
        bundledImage: async () => bundled,
        localRunner: host.runner,
        localLan: () => "192.0.2.59",
        fetchHealth: async () => joined,
        onEvent: (event) => events.push(event),
        newId: () => "abc123def456",
        sleep: async () => undefined,
        now: () => new Date("2026-11-23T10:00:00Z"),
        ...extra,
    });
    return { service, registry, events };
}

describe("hosting on this PC", () => {
    it("loads the bundled image, writes the settings, starts a hardened container and returns a verified LAN link", async () => {
        const host = new FakeHost();
        const { service, registry, events } = make(host);
        const answer = await service.host(request());
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.instance.url).toBe("http://192.0.2.59:3907/");
        expect(answer.verification).toMatchObject({ linkReachable: true, botJoined: true });
        expect(answer.steps.find((step) => step.id === "secrets")?.state).toBe("skipped");

        const docker = host.dockerCalls();
        const load = docker.find((call) => call.args[0] === "load");
        expect(load?.args).toEqual(["load", "-i", bundled.ok ? bundled.image.tarPath : ""]);
        const run = docker.find((call) => call.args[0] === "run" && call.args.includes("-d"));
        expect(run).toBeDefined();
        const args = run!.args;
        for (const expected of ["--read-only", "--restart", "unless-stopped", "--cap-drop", "ALL", "no-new-privileges", "3907:3007", "lv-abc123def456-config:/config:ro"]) {
            expect(args, expected).toContain(expected);
        }
        expect(args.some((value) => value.includes("/secrets"))).toBe(false);
        expect(args).toContain(`com.worldlens.liveviewer.owner=${OWNER}`);
        expect(args.at(-1)).toBe(REFERENCE);

        const writeConfig = docker.find((call) => call.args.includes("--entrypoint") && call.args.some((value) => value.includes("config.json")));
        const written = JSON.parse(writeConfig!.input!) as LiveViewerConfig;
        expect(written.server.host).toBe("192.0.2.50");
        expect(written.vocabulary).toEqual({});

        expect((await registry.list()).map((entry) => entry.id)).toEqual(["abc123def456"]);
        expect(events.some((event) => event.kind === "progress")).toBe(true);
    });

    it("points a loopback server at the host gateway name inside the container's config and maps that name", async () => {
        const host = new FakeHost();
        const { service } = make(host);
        await service.host(request({ config: config({ server: { host: "localhost", port: 25565 } }) }));
        const write = host.dockerCalls().find((call) => call.args.some((value) => value.includes("config.json")));
        expect((JSON.parse(write!.input!) as LiveViewerConfig).server.host).toBe("host.docker.internal");
        const run = host.dockerCalls().find((call) => call.args.includes("-d"))!;
        expect(run.args).toEqual(expect.arrayContaining(["--add-host", "host.docker.internal:host-gateway"]));
    });

    it("sends only the vocabulary entries the container can display", async () => {
        const host = new FakeHost();
        const { service } = make(host, { vocabulary: async () => ({ "Live viewer": "Viewer X", Settings: "Gear" }) });
        await service.host(request());
        const write = host.dockerCalls().find((call) => call.args.some((value) => value.includes("config.json")));
        expect((JSON.parse(write!.input!) as LiveViewerConfig).vocabulary).toEqual({ "Live viewer": "Viewer X" });
    });

    it("skips the load when the exact image is already present", async () => {
        const host = new FakeHost();
        host.imagePresent = true;
        const { service } = make(host);
        await service.host(request());
        expect(host.dockerCalls().some((call) => call.args[0] === "load")).toBe(false);
    });

    it("reports Docker not being available without touching anything", async () => {
        const host = new FakeHost();
        host.script = (call) => (call.args[0] === "version" ? { ok: false, exitCode: null, stdout: "", stderr: "", spawnError: "ENOENT" } : null);
        const { service, registry } = make(host);
        const answer = await service.host(request());
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("docker-unavailable");
        expect(await registry.list()).toEqual([]);
        expect(host.dockerCalls().some((call) => call.args[0] === "volume")).toBe(false);
    });

    it("says so when the image is not part of the build, and never downloads one", async () => {
        const host = new FakeHost();
        const { service } = make(host, { bundledImage: async () => ({ ok: false, reason: "missing", message: "The live viewer image is not part of this build." }) });
        const answer = await service.host(request());
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("image-missing");
        expect(host.calls.some((call) => call.args[0] === "pull")).toBe(false);
    });

    it("refuses a port another container already publishes", async () => {
        const host = new FakeHost();
        host.script = (call) => (call.args[0] === "ps" ? out("0.0.0.0:3907->3007/tcp, :::3907->3007/tcp") : null);
        const { service } = make(host);
        const answer = await service.host(request());
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("port-in-use");
    });

    it("removes the container and volumes it made when the start fails", async () => {
        const host = new FakeHost();
        host.script = (call) => (call.args[0] === "run" && call.args.includes("-d") ? out("", false, "Bind for 0.0.0.0:3907 failed: port is already allocated") : null);
        const { service, registry } = make(host);
        const answer = await service.host(request());
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("port-in-use");
        const volumes = host.dockerCalls().filter((call) => call.args[0] === "volume" && call.args[1] === "rm");
        expect(volumes.length).toBeGreaterThan(0);
        expect(await registry.list()).toEqual([]);
    });

    it("rolls back and names a firewall when this PC cannot open the link", async () => {
        const host = new FakeHost();
        const { service, registry } = make(host, { fetchHealth: async () => null, healthTimeoutMs: 6000, healthIntervalMs: 2000 });
        const answer = await service.host(request());
        expect(answer.ok).toBe(false);
        if (!answer.ok) {
            expect(answer.failure.code).toBe("unreachable");
            expect(answer.failure.message).toContain("firewall");
        }
        expect(host.dockerCalls().some((call) => call.args[0] === "rm" && call.args.includes("lv-abc123def456"))).toBe(true);
        expect(await registry.list()).toEqual([]);
    });

    it("reports a reachable link with a bot that has not joined, without claiming it joined", async () => {
        const host = new FakeHost();
        const stuck: HealthReply = { botConnected: false, state: "reconnecting", botName: "LensBot", lastError: "kicked: full" };
        const { service } = make(host, { fetchHealth: async () => stuck, healthTimeoutMs: 4000, healthIntervalMs: 2000 });
        const answer = await service.host(request());
        expect(answer.ok).toBe(true);
        if (answer.ok) {
            expect(answer.verification.linkReachable).toBe(true);
            expect(answer.verification.botJoined).toBe(false);
            expect(answer.verification.botNote).toContain("reconnecting");
        }
    });

    it("stops early with the bot's own reason when it has failed", async () => {
        const host = new FakeHost();
        const failed: HealthReply = { botConnected: false, state: "failed", botName: "LensBot", lastError: "ended: ECONNREFUSED" };
        const { service } = make(host, { fetchHealth: async () => failed });
        const answer = await service.host(request());
        expect(answer.ok).toBe(true);
        if (answer.ok) expect(answer.verification.botNote).toContain("ECONNREFUSED");
    });

    it("validates the web port", async () => {
        const { service } = make(new FakeHost());
        const answer = await service.host(request({ hostPort: 80 }));
        expect(answer.ok).toBe(false);
    });
});

describe("hosting with a Microsoft account", () => {
    const accounts: LiveViewerAccounts = {
        list: async () => [],
        createMicrosoftAccount: async (label) => ({ accountRef: "11111111-2222-3333-4444-555555555555", label }),
        authenticate: async () => undefined,
        cancel: () => undefined,
        exportForHosting: async () => ({ clientId: "11111111-2222-3333-4444-555555555555", caches: { live: { token: { refresh_token: TOKEN } } } }),
    };

    it("writes the sign-in only to standard input of a no-network container, never into an argument", async () => {
        const host = new FakeHost();
        const { service } = make(host, { accounts });
        const answer = await service.host(request({ config: config({ auth: "microsoft" }), accountRef: "11111111-2222-3333-4444-555555555555" }));
        expect(answer.ok).toBe(true);
        const everything = JSON.stringify(host.calls.map((call) => call.args));
        expect(everything).not.toContain(TOKEN);
        const secretWrite = host.dockerCalls().find((call) => call.args.some((value) => value.includes("auth.json")));
        expect(secretWrite).toBeDefined();
        expect(secretWrite!.input).toContain(TOKEN);
        expect(secretWrite!.args).toEqual(expect.arrayContaining(["--network", "none"]));
        expect(secretWrite!.args.join(" ")).toContain("umask 077");
        const run = host.dockerCalls().find((call) => call.args.includes("-d"))!;
        expect(run.args).toContain("lv-abc123def456-secrets:/secrets");
        // the configuration file carries no credential
        const configWrite = host.dockerCalls().find((call) => call.args.some((value) => value.includes("config.json")))!;
        expect(configWrite.input).not.toContain(TOKEN);
    });

    it("asks for sign-in when no account is chosen", async () => {
        const { service } = make(new FakeHost(), { accounts });
        const answer = await service.host(request({ config: config({ auth: "microsoft" }) }));
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("sign-in-required");
    });

    it("refuses an account that has never signed in and cleans up", async () => {
        const host = new FakeHost();
        const { service, registry } = make(host, { accounts: { ...accounts, exportForHosting: async () => ({ clientId: "11111111-2222-3333-4444-555555555555", caches: {} }) } });
        const answer = await service.host(request({ config: config({ auth: "microsoft" }), accountRef: "11111111-2222-3333-4444-555555555555" }));
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("sign-in-required");
        expect(await registry.list()).toEqual([]);
        expect(host.dockerCalls().some((call) => call.args.includes("-d"))).toBe(false);
    });
});

describe("hosting over SSH", () => {
    const ssh = {
        target: { id: "pi", label: "Pi", host: "192.168.1.60", port: 22, user: "pi", identityFile: null, workDir: "/home/pi/stage", docker: "docker" },
        knownHostsFile: "known_hosts",
    };

    /** Reads the single remote command line that ssh carries as its final argument. */
    function remoteWords(args: readonly string[]): string[] {
        const line = args.at(-1) ?? "";
        return [...line.matchAll(/'((?:[^']|'\\'')*)'|(\S+)/g)].map((match) => (match[1] ?? match[2] ?? "").replace(/'\\''/g, "'"));
    }

    it("copies the archive with scp, loads it remotely, and reads the LAN address from the remote host", async () => {
        const local = new FakeHost();
        const remote: string[][] = [];
        let remoteImage = false;
        const runner: CommandRunner = async (command, args, options) => {
            if (command === "scp") {
                local.calls.push({ command, args, input: undefined });
                return out();
            }
            if (command === "ssh") {
                const words = remoteWords(args);
                remote.push(words);
                if (words[0] === "hostname") return out("192.168.1.60 172.17.0.1 ");
                if (words[0] === "mkdir" || words[0] === "rm") return out();
                if (words[1] === "version") return out(JSON.stringify({ Client: { Version: "27.0.0" }, Server: { Version: "27.0.0" } }));
                if (words[1] === "ps") return out("");
                if (words[1] === "image") return remoteImage ? out(IMAGE_ID) : out("", false, "No such image");
                if (words[1] === "load") {
                    remoteImage = true;
                    return out("Loaded");
                }
                return out("ok");
            }
            return local.runner(command, args, options);
        };
        const { service } = make(new FakeHost(), { localRunner: runner, resolveSsh: (hostId) => (hostId === "pi" ? ssh : null) });
        const answer = await service.host(request({ target: { kind: "ssh", hostId: "pi" } }));
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.instance.url).toBe("http://192.168.1.60:3907/");
        expect(local.calls.some((call) => call.command === "scp" && call.args.includes("-P"))).toBe(true);
        expect(remote.some((words) => words[1] === "load" && words[3]?.startsWith("/home/pi/stage/lv-image-"))).toBe(true);
        expect(remote.some((words) => words[0] === "rm")).toBe(true);
    });

    it("says so when the SSH host is not a saved one", async () => {
        const { service } = make(new FakeHost());
        const answer = await service.host(request({ target: { kind: "ssh", hostId: "unknown" } }));
        expect(answer.ok).toBe(false);
        if (!answer.ok) expect(answer.failure.code).toBe("ssh-unavailable");
    });
});

describe("instance manager", () => {
    async function hosted(host: FakeHost, extra: Partial<ConstructorParameters<typeof LiveViewerService>[0]> = {}) {
        const made = make(host, extra);
        const answer = await made.service.host(request());
        expect(answer.ok).toBe(true);
        host.calls.length = 0;
        return made;
    }

    it("lists state from Docker and the bot from the health route", async () => {
        const host = new FakeHost();
        host.script = (call) => (call.args[0] === "inspect" ? out("running") : null);
        const { service } = await hosted(host);
        const statuses = await service.list();
        expect(statuses).toHaveLength(1);
        expect(statuses[0]).toMatchObject({ state: "running", botConnected: true });
    });

    it("reports a container that has gone missing", async () => {
        const host = new FakeHost();
        const { service } = await hosted(host);
        host.script = (call) => (call.args[0] === "inspect" ? out("", false, "Error: No such object: lv-abc123def456") : null);
        expect((await service.list())[0]?.state).toBe("missing");
    });

    it("stops, starts and restarts only a container it created", async () => {
        const host = new FakeHost();
        const { service } = await hosted(host);
        const stopped = await service.control("abc123def456", "stop");
        expect(stopped.ok).toBe(true);
        expect(host.dockerCalls().some((call) => call.args[0] === "stop" && call.args[1] === "lv-abc123def456")).toBe(true);
        const stranger = await service.control("zzzzzzzzzzzz", "stop");
        expect(stranger.ok).toBe(false);
        if (!stranger.ok) expect(stranger.failure.code).toBe("not-owned");
    });

    it("removes the container, both volumes and the record only after the name is confirmed", async () => {
        const host = new FakeHost();
        const { service, registry } = await hosted(host);
        const refused = await service.remove("abc123def456", "wrong");
        expect(refused.ok).toBe(false);
        expect(await registry.list()).toHaveLength(1);
        const removed = await service.remove("abc123def456", "Survival viewer");
        expect(removed.ok).toBe(true);
        expect(await registry.list()).toEqual([]);
        const calls = host.dockerCalls().map((call) => call.args.join(" "));
        expect(calls).toContain("rm -f lv-abc123def456");
        expect(calls).toContain("volume rm -f lv-abc123def456-config");
        expect(calls).toContain("volume rm -f lv-abc123def456-secrets");
    });

    it("bounds the log request", async () => {
        const host = new FakeHost();
        const { service } = await hosted(host);
        expect((await service.logs("abc123def456", 5000)).ok).toBe(false);
        const logs = await service.logs("abc123def456", 50);
        expect(logs.ok).toBe(true);
    });
});
