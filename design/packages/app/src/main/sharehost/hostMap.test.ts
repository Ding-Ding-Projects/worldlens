import { describe, expect, it } from "vitest";
import { hostMap, type HostMapDeps } from "./hostMap.js";
import { createMemoryRegistry } from "./registry.js";
import { bundledImageFixture, fakeExecutor, out, type Script } from "./testing.js";
import { wordingFrom } from "./wording.js";
import type { HostMapEvent, HostMapRequest } from "./types.js";

const request: HostMapRequest = {
    renderId: "example-survival", target: { kind: "local" }, name: "bayville-map", port: 8100,
    maps: ["overworld", "nether"], startOnBoot: true, accessCode: true, lan: true,
};

const packed = { files: 12, contentBytes: 820_000_000, tarBytes: 821_000_000 };
const healthy = { json: () => Promise.resolve({ status: "ok" }), status: 200 };

/** The commands of a successful hosting run, in the order they are expected. */
function happyScript(extra: readonly Script[] = []): Script[] {
    return [
        ...extra,
        { when: /^docker info/, answer: out({ stdout: "x86_64\n" }) },
        { when: /^docker image inspect/, answer: out({ ok: false, stderr: "Error: No such image" }) },
        { when: /^docker load <stdin/, answer: out({ stdout: "Loaded image: worldlens-map-server:0.1.0\n" }) },
        { when: /^docker volume create/, answer: out() },
        { when: /^docker run --rm -i/, answer: out() },
        { when: /^docker run -d/, answer: out({ stdout: "abc123\n" }) },
    ];
}

async function setup(script: readonly Script[], overrides: Partial<HostMapDeps> = {}, kind: "local" | "ssh" = "local") {
    const executor = fakeExecutor(script, kind, kind === "local" ? "this PC" : "pi@map-host.example");
    const registry = createMemoryRegistry();
    const events: HostMapEvent[] = [];
    const deps: HostMapDeps = {
        executorFor: () => Promise.resolve(executor),
        webRootFor: () => "unused",
        bundledImageDir: () => dir,
        registry,
        tempDir: () => dir,
        pack: (options) => { configs.push({ ...options.config }); return Promise.resolve(packed); },
        fetcher: () => Promise.resolve(healthy),
        localAddress: () => Promise.resolve("192.0.2.59"),
        remoteAddress: () => Promise.resolve("192.0.2.93"),
        localPortFree: () => Promise.resolve(true),
        newId: () => "a1b2c3d4",
        sleep: () => Promise.resolve(),
        healthAttempts: 2,
        ...overrides,
    };
    return { executor, registry, events, deps, run: (r: HostMapRequest = request) => hostMap(deps, r, (event) => events.push(event)) };
}

let dir = "";
const configs: Record<string, unknown>[] = [];
async function fixtureDir(): Promise<void> { dir = await bundledImageFixture(); }

describe("hostMap", () => {
    it("runs the five steps in order and returns a link proven from this PC", async () => {
        await fixtureDir();
        const t = await setup(happyScript());
        const outcome = await t.run();
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.link).toBe("http://192.0.2.59:8100/");
        expect(outcome.result.where).toBe("this PC");
        const done = t.events.filter((e) => e.type === "step" && e.state === "done").map((e) => (e.type === "step" ? e.step : ""));
        expect(done).toEqual(["load-image", "pack", "copy", "start", "health"]);
        expect(t.events.at(-1)?.type).toBe("ready");
    });

    it("starts a read-only, capability-free container with ownership labels and the chosen port", async () => {
        await fixtureDir();
        const t = await setup(happyScript());
        await t.run();
        const run = t.executor.calls.find((call) => call.startsWith("docker run -d")) ?? "";
        for (const part of ["--read-only", "--cap-drop ALL", "no-new-privileges", "--user 65532:65532", "0.0.0.0:8100:8080", ":/data:ro", "--restart unless-stopped", "org.worldlens.map-host=true", "org.worldlens.map-host.instance=a1b2c3d4"]) {
            expect(run).toContain(part);
        }
        expect(run).not.toContain("--privileged");
    });

    it("binds to loopback when the map is not reachable on the network", async () => {
        await fixtureDir();
        const t = await setup(happyScript(), {});
        const outcome = await t.run({ ...request, lan: false, startOnBoot: false });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        expect(outcome.result.link).toBe("http://127.0.0.1:8100/");
        const run = t.executor.calls.find((call) => call.startsWith("docker run -d")) ?? "";
        expect(run).toContain("127.0.0.1:8100:8080");
        expect(run).toContain("--restart no");
    });

    it("shows the access code once, keeps only a scrypt verifier in the packed settings, and never stores the code", async () => {
        await fixtureDir();
        const t = await setup(happyScript());
        const outcome = await t.run();
        if (!outcome.ok) throw new Error("expected success");
        const access = configs.at(-1)?.["access"] as { name: string; verifier: string };
        expect(access.name).toBe("viewer");
        expect(access.verifier).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
        expect(access.verifier).not.toContain(outcome.result.accessCode ?? "x");
        const code = outcome.result.accessCode ?? "";
        expect(code).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
        expect(outcome.result.accessName).toBe("viewer");
        expect(JSON.stringify(await t.registry.list())).not.toContain(code);
        expect(t.executor.calls.join("\n")).not.toContain(code);
        expect(t.executor.calls.join("\n")).not.toContain("scrypt$");
        expect((await t.registry.list())[0]?.protected).toBe(true);
    });

    it("hosts with no access code when it is not asked for", async () => {
        await fixtureDir();
        const t = await setup(happyScript());
        const outcome = await t.run({ ...request, accessCode: false });
        if (!outcome.ok) throw new Error("expected success");
        expect(outcome.result.accessCode).toBeNull();
        expect(configs.at(-1)?.["access"]).toBeNull();
    });

    it("skips docker load when the same image is already on the machine", async () => {
        await fixtureDir();
        const t = await setup(happyScript([{ when: /^docker image inspect/, answer: out({ stdout: '["sha256:layer1"]\n' }) }]));
        await t.run();
        expect(t.executor.calls.some((call) => call.startsWith("docker load"))).toBe(false);
        expect(t.events.find((e) => e.type === "step" && e.step === "load-image" && e.state === "done")).toMatchObject({ meta: "already on the machine" });
    });

    it("refuses a taken port before touching Docker and offers the next free one", async () => {
        await fixtureDir();
        const taken = new Set([8100]);
        const t = await setup(happyScript(), { localPortFree: (p) => Promise.resolve(!taken.has(p)) });
        const outcome = await t.run();
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.failure.step).toBe("check");
        expect(outcome.failure.fix).toEqual({ id: "use-port", port: 8101, label: "Use port 8101 and retry" });
        expect(t.executor.calls.some((call) => call.startsWith("docker load") || call.startsWith("docker volume"))).toBe(false);
    });

    it("reports a failed start exactly, masks the access verifier, and removes what it created", async () => {
        await fixtureDir();
        const t = await setup(happyScript([
            { when: /^docker run -d/, answer: out({ ok: false, exitCode: 125, stderr: "docker: Error response from daemon: Bind for 0.0.0.0:8100 failed: port is already allocated\n" }) },
            { when: /^docker rm -f/, answer: out() },
            { when: /^docker volume rm/, answer: out() },
        ]));
        const outcome = await t.run();
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.failure.step).toBe("start");
        expect(outcome.failure.exitCode).toBe(125);
        expect(outcome.failure.output).toContain("port is already allocated");
        expect(outcome.failure.command).toContain("docker run -d");
        expect(outcome.failure.command).not.toContain("scrypt$");
        expect(outcome.failure.fix?.id).toBe("use-port");
        expect(t.executor.calls.some((call) => call.startsWith("docker volume rm -f worldlens-map-data-a1b2c3d4"))).toBe(true);
        expect(await t.registry.list()).toEqual([]);
        expect(t.events.at(-1)?.type).toBe("failed");
    });

    it("never calls it ready when this PC cannot open the link", async () => {
        await fixtureDir();
        const t = await setup(happyScript([{ when: /^docker rm -f/, answer: out() }, { when: /^docker volume rm/, answer: out() }]), {
            fetcher: () => Promise.reject(new Error("connect ETIMEDOUT")),
        });
        const outcome = await t.run();
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.failure.step).toBe("health");
        expect(outcome.failure.message).toContain("192.0.2.59:8100");
        expect(outcome.failure.output).toContain("ETIMEDOUT");
        expect(await t.registry.list()).toEqual([]);
    });

    it("hosts on an SSH host using that host's own address", async () => {
        await fixtureDir();
        const t = await setup(happyScript(), {}, "ssh");
        const outcome = await t.run({ ...request, target: { kind: "ssh", targetId: "pi" } });
        if (!outcome.ok) throw new Error("expected success");
        expect(outcome.result.link).toBe("http://192.0.2.93:8100/");
        expect(outcome.result.where).toBe("pi@map-host.example");
    });

    it("passes labels through the personal wording table without storing it", async () => {
        await fixtureDir();
        const t = await setup(happyScript(), { wording: () => Promise.resolve(wordingFrom({ "Map server": "Server of maps" })) });
        await t.run();
        expect(configs.at(-1)?.["healthLabel"]).toBe("Server of maps");
        expect(JSON.stringify(await t.registry.list())).not.toContain("Server of maps");
    });

    it("refuses a bundled image whose checksum no longer matches", async () => {
        await fixtureDir();
        const { writeFile } = await import("node:fs/promises");
        await writeFile(`${dir}/worldlens-map-server-amd64.tar`, "tampered");
        const t = await setup(happyScript());
        const outcome = await t.run();
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(outcome.failure.step).toBe("load-image");
        expect(outcome.failure.message).toContain("checksum");
    });

    it("refuses an empty map choice and a bad name", async () => {
        await fixtureDir();
        const t = await setup(happyScript());
        expect((await t.run({ ...request, maps: [] })).ok).toBe(false);
        expect((await t.run({ ...request, name: "../escape" })).ok).toBe(false);
        expect(t.executor.calls).toEqual([]);
    });
});
