import { describe, expect, it } from "vitest";
import { ShareHostManager } from "./manager.js";
import { createMemoryRegistry } from "./registry.js";
import { bundledImageFixture, fakeExecutor, out, type Script } from "./testing.js";
import type { InstanceRecord } from "./types.js";

const record: InstanceRecord = {
    instanceId: "a1b2c3d4", name: "bayville-map", target: { kind: "local" }, targetLabel: "this PC",
    containerName: "worldlens-map-bayville-map-a1b2", volumeName: "worldlens-map-data-a1b2c3d4", port: 8100, lan: true,
    startOnBoot: true, protected: true, accessName: "viewer", maps: ["overworld"], renderId: "example", imageRef: "worldlens-map-server:0.0.9",
    link: "http://192.0.2.59:8100/", createdAt: "2026-11-23T19:28:00.000Z",
};

function inspectJson(running: boolean, health: string, instance = "a1b2c3d4", owned = true): string {
    return JSON.stringify({
        State: { Running: running, Status: running ? "running" : "exited", Health: { Status: health } },
        Config: { Labels: owned ? { "org.worldlens.map-host": "true", "org.worldlens.map-host.instance": instance } : {}, Env: ["MAP_TITLE=bayville-map", "MAP_HEALTH_LABEL=Map server", "MAP_ACCESS_NAME=viewer", "MAP_ACCESS_SALT=ss", "MAP_ACCESS_VERIFIER=vv"] },
    });
}

function make(script: readonly Script[], records: readonly InstanceRecord[] = [record]) {
    const executor = fakeExecutor(script);
    const registry = createMemoryRegistry(records);
    return { executor, registry, manager: new ShareHostManager({ registry, executorFor: () => Promise.resolve(executor), bundledImageDir: () => "unused", sleep: () => Promise.resolve(), healthAttempts: 2 }) };
}

describe("ShareHostManager", () => {
    it("lists only recorded instances with their live state", async () => {
        const t = make([{ when: /^docker inspect/, answer: out({ stdout: inspectJson(true, "healthy") }) }]);
        const list = await t.manager.list();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ instanceId: "a1b2c3d4", state: "running", detail: "healthy" });
        expect(t.executor.calls.every((call) => !/docker ps/.test(call))).toBe(true);
    });

    it("reports stopped, unhealthy and missing containers distinctly", async () => {
        const stopped = make([{ when: /^docker inspect/, answer: out({ stdout: inspectJson(false, "") }) }]);
        expect((await stopped.manager.list())[0]?.state).toBe("stopped");
        const sick = make([{ when: /^docker inspect/, answer: out({ stdout: inspectJson(true, "unhealthy") }) }]);
        expect((await sick.manager.list())[0]?.state).toBe("unhealthy");
        const gone = make([{ when: /^docker inspect/, answer: out({ ok: false, stderr: "Error: No such object: x" }) }]);
        expect((await gone.manager.list())[0]?.state).toBe("missing");
    });

    it("leaves a container alone when it does not carry this app's labels", async () => {
        const t = make([{ when: /^docker inspect/, answer: out({ stdout: inspectJson(true, "healthy", "a1b2c3d4", false) }) }]);
        expect((await t.manager.list())[0]?.state).toBe("unknown");
        const answer = await t.manager.stop("a1b2c3d4");
        expect(answer.ok).toBe(false);
        expect(t.executor.calls.some((call) => call.startsWith("docker stop"))).toBe(false);
    });

    it("refuses an instance that was never recorded", async () => {
        const t = make([]);
        expect((await t.manager.remove("deadbeef")).ok).toBe(false);
        expect(t.executor.calls).toEqual([]);
    });

    it("starts, stops and restarts by recorded container name", async () => {
        const t = make([{ when: /^docker inspect/, answer: out({ stdout: inspectJson(true, "healthy") }) }, { when: /^docker (start|stop|restart)/, answer: out() }]);
        for (const verb of ["start", "stop", "restart"] as const) expect((await t.manager[verb]("a1b2c3d4")).ok).toBe(true);
        expect(t.executor.calls).toContain("docker stop worldlens-map-bayville-map-a1b2");
    });

    it("removes the container, its labelled volume and its record, in that order", async () => {
        const t = make([
            { when: /^docker inspect/, answer: out({ stdout: inspectJson(true, "healthy") }) },
            { when: /^docker rm -f/, answer: out() },
            { when: /^docker volume inspect/, answer: out({ stdout: "a1b2c3d4\n" }) },
            { when: /^docker volume rm/, answer: out() },
        ]);
        expect((await t.manager.remove("a1b2c3d4")).ok).toBe(true);
        expect(await t.registry.list()).toEqual([]);
        const order = t.executor.calls.filter((c) => /^docker (rm|volume rm)\b/.test(c)).map((c) => c.split(" ").slice(0, 3).join(" "));
        expect(order[0]).toContain("docker rm -f");
        expect(order[1]).toContain("docker volume rm");
    });

    it("keeps a volume that does not carry this instance's label", async () => {
        const t = make([
            { when: /^docker inspect/, answer: out({ stdout: inspectJson(false, "") }) },
            { when: /^docker rm -f/, answer: out() },
            { when: /^docker volume inspect/, answer: out({ stdout: "someone-else\n" }) },
        ]);
        const answer = await t.manager.remove("a1b2c3d4");
        expect(answer.ok).toBe(false);
        expect(t.executor.calls.some((call) => call.startsWith("docker volume rm"))).toBe(false);
        expect(await t.registry.list()).toHaveLength(1);
    });

    it("updates by setting the old container aside and putting it back if the new one fails", async () => {
        const dir = await bundledImageFixture("amd64", ["sha256:new"]);
        const calls: Script[] = [
            { when: /^docker inspect --type/, answer: out({ stdout: inspectJson(true, "healthy") }) },
            { when: /^docker info/, answer: out({ stdout: "x86_64\n" }) },
            { when: /^docker image inspect/, answer: out({ stdout: '["sha256:new"]\n' }) },
            { when: /^docker stop/, answer: out() },
            { when: /^docker rename/, answer: out() },
            { when: /^docker run -d/, answer: out({ ok: false, exitCode: 125, stderr: "boom" }) },
            { when: /^docker rm -f/, answer: out() },
            { when: /^docker start/, answer: out() },
        ];
        const executor = fakeExecutor(calls);
        const registry = createMemoryRegistry([record]);
        const manager = new ShareHostManager({ registry, executorFor: () => Promise.resolve(executor), bundledImageDir: () => dir, sleep: () => Promise.resolve(), healthAttempts: 2 });
        const answer = await manager.update("a1b2c3d4");
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("previous one is running again");
        expect(executor.calls.filter((c) => c.startsWith("docker rename"))).toHaveLength(2);
        expect(executor.calls.at(-1)).toBe("docker start worldlens-map-bayville-map-a1b2");
        expect((await registry.get("a1b2c3d4"))?.imageRef).toBe("worldlens-map-server:0.0.9");
    });

    it("keeps the volume, so the packed access settings survive an update", async () => {
        const dir = await bundledImageFixture("amd64", ["sha256:new"]);
        const executor = fakeExecutor([
            { when: /^docker inspect --type/, answer: out({ stdout: inspectJson(true, "healthy") }) },
            { when: /^docker info/, answer: out({ stdout: "x86_64\n" }) },
            { when: /^docker image inspect/, answer: out({ stdout: '["sha256:new"]\n' }) },
            { when: /^docker inspect --format \{\{\.State\.Health\.Status\}\}/, answer: out({ stdout: "healthy\n" }) },
            { when: /^docker (stop|rename|rm -f)/, answer: out() },
            { when: /^docker run -d/, answer: out({ stdout: "id\n" }) },
        ]);
        const registry = createMemoryRegistry([record]);
        const manager = new ShareHostManager({ registry, executorFor: () => Promise.resolve(executor), bundledImageDir: () => dir, sleep: () => Promise.resolve(), healthAttempts: 2 });
        const answer = await manager.update("a1b2c3d4");
        expect(answer.ok).toBe(true);
        const run = executor.calls.find((c) => c.startsWith("docker run -d")) ?? "";
        expect(run).not.toContain("MAP_ACCESS");
        expect(run).toContain("-v worldlens-map-data-a1b2c3d4:/data:ro");
        expect(run).toContain("worldlens-map-server:bundled");
        expect((await registry.get("a1b2c3d4"))?.imageRef).toBe("worldlens-map-server:bundled");
    });
});
