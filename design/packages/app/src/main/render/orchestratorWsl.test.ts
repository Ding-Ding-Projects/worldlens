import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const wsl = vi.hoisted(() => ({ probe: vi.fn(), plan: vi.fn(), path: vi.fn() }));
vi.mock("../runtime/wsl.js", () => ({
    probeWsl: wsl.probe,
    planWslLaunch: wsl.plan,
    wslPath: wsl.path,
}));
import { RenderOrchestrator } from "./orchestrator.js";
import { RenderSessionStore } from "./session.js";
import { resumeRequestFor } from "./resume.js";
import { renderWorkspace } from "./workspace.js";
let root = "";
afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
});
it("carries WSL identity, Linux config paths, progress and resume through the ordinary render channel", async () => {
    root = await mkdtemp(join(tmpdir(), "worldlens-wsl-test-"));
    const world = join(root, "world");
    await mkdir(world);
    wsl.probe.mockResolvedValue({
        ready: true,
        distributions: ["Ubuntu"],
        selected: "Ubuntu",
        javaVersion: "25.0.2",
        javaExecutable: "/usr/bin/java",
    });
    wsl.path.mockImplementation(async (path: string) => `/linux/${path.split(/[\\/]/).at(-1)}`);
    wsl.plan.mockImplementation(async (options) => ({
        mode: "wsl",
        role: "render",
        command: "wsl.exe",
        args: ["--distribution", options.distribution],
        cwd: options.cwd,
        mounts: [],
        containerName: null,
        engineConfigDir: "/linux/config",
        hostConfigDir: options.configDir,
        url: null,
        hostPort: null,
    }));
    const resolveEngine = vi
        .fn()
        .mockResolvedValue({
            engine: "upstream-java",
            engineVersion: "5.22",
            launch: "java-cli",
            enginePath: "C:\\engine.jar",
            javaExecutable: "/usr/bin/java",
            javaVersion: "25.0.2",
        });
    const script = join(root, "progress.mjs");
    await writeFile(
        script,
        `console.log("[12:00:00 INFO] Start updating 1 maps ..."); console.log("[12:00:01 INFO] updating map 'overworld': 100.0%"); console.log("[12:00:02 INFO] Your maps are now all up-to-date!");`,
    );
    const events: string[] = [];
    const sessions = new RenderSessionStore({ storageDir: root });
    const orchestrator = new RenderOrchestrator({
        storageDir: root,
        sessions,
        hasConsent: () => true,
        resolveEngine,
        onEvent: (event) => events.push(event.type),
        spawnEngine: (_command, _args, options) =>
            spawn(process.execPath, [script], {
                cwd: options.cwd,
                stdio: ["ignore", "pipe", "pipe"],
            }),
    });
    const result = await orchestrator.render({
        renderId: "wsl-render",
        runtime: "wsl",
        wslDistribution: "Ubuntu",
        renderThreads: 3,
        renderThreadPriority: 4,
        maps: [{ id: "overworld", world, config: 'name: "Retained map name"\nmin-x: 123' }],
    });
    expect(result.ok).toBe(true);
    expect(resolveEngine.mock.calls[0]?.[3]).toEqual({
        distribution: "Ubuntu",
        javaVersion: "25.0.2",
        javaExecutable: "/usr/bin/java",
    });
    const workspace = renderWorkspace(root, "wsl-render");
    const config = await readFile(join(workspace.configDir, "maps/overworld.conf"), "utf8");
    expect(config).toContain('world: "/linux/world"');
    expect(config).toContain("min-x: 123");
    const core = await readFile(join(workspace.configDir, "core.conf"), "utf8");
    expect(core).toContain("render-thread-count: 3");
    expect(core).toContain("render-thread-priority: 4");
    expect(events).toContain("progress");
    expect(events).toContain("finished");
    const session = (await sessions.list())[0]!;
    expect(resumeRequestFor(session)).toMatchObject({ runtime: "wsl", wslDistribution: "Ubuntu" });
});
