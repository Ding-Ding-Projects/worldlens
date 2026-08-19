import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { RenderQueuePersistence } from "../src/render/RenderQueuePersistence.js";

interface FakeTask {
    readonly id: string;
    hasMoreWork(): boolean;
}

class FakeRenderManager {
    readonly tasks: FakeTask[];
    readonly saves: Array<{ file: string; taskIds: string[] }> = [];
    activeSaves = 0;
    maxActiveSaves = 0;
    #saveDelayMs: number;

    constructor(tasks: FakeTask[] = [], saveDelayMs = 0) {
        this.tasks = tasks;
        this.#saveDelayMs = saveDelayMs;
    }

    async loadRenderTaskQueue(file: string): Promise<number> {
        try {
            const saved = JSON.parse(await readFile(file, "utf8")) as { taskIds?: string[] };
            return saved.taskIds?.length ?? 0;
        } catch {
            return 0;
        }
    }

    getScheduledRenderTasks(): readonly FakeTask[] {
        return [...this.tasks];
    }

    async saveRenderTaskQueue(file: string, _maps: ReadonlyMap<string, unknown>, tasks: readonly FakeTask[]): Promise<void> {
        this.activeSaves++;
        this.maxActiveSaves = Math.max(this.maxActiveSaves, this.activeSaves);
        try {
            if (this.#saveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.#saveDelayMs));
            const taskIds = tasks.map((task) => task.id);
            this.saves.push({ file, taskIds });
            await writeFile(file, JSON.stringify({ taskIds }), "utf8");
        } finally {
            this.activeSaves--;
        }
    }
}

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempQueueFile(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "worldlens-render-queue-"));
    roots.push(root);
    return join(root, "nested", "tasks.dat");
}

function managerWithTasks(tasks: FakeTask[], saveDelayMs = 0): FakeRenderManager {
    return new FakeRenderManager(tasks, saveDelayMs);
}

/**
 * Runs the persistence boundary in a genuinely separate Node process.
 *
 * The in-process tests above prove the queue's mechanics, but they cannot prove that the
 * bytes survive the process which wrote them. This child deliberately has its own manager
 * instance and only communicates through the queue file, matching the server boundary's
 * restart contract without smuggling state through Vitest globals.
 */
function runPersistenceProcess(mode: "write" | "read", file: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const script = `
        import { readFile } from "node:fs/promises";
        const { RenderQueuePersistence } = await import("./packages/server/dist/index.js");
        const mode = process.argv[1];
        const file = process.argv[2];
        class RestartManager {
            tasks = mode === "write" ? [{ id: "queued-after-restart", hasMoreWork: () => true }] : [];
            async loadRenderTaskQueue(path) {
                const saved = JSON.parse(await readFile(path, "utf8"));
                this.tasks = (saved.taskIds ?? []).map((id) => ({ id, hasMoreWork: () => true }));
                return this.tasks.length;
            }
            getScheduledRenderTasks() { return this.tasks; }
            async saveRenderTaskQueue(path, _maps, tasks) {
                const { writeFile } = await import("node:fs/promises");
                await writeFile(path, JSON.stringify({ taskIds: tasks.map((task) => task.id) }), "utf8");
            }
        }
        const manager = new RestartManager();
        const persistence = new RenderQueuePersistence(manager, { file, maps: new Map(), intervalMs: 0 });
        if (mode === "write") {
            await persistence.shutdown();
            console.log(JSON.stringify({ phase: mode, taskIds: manager.tasks.map((task) => task.id) }));
        } else {
            const restored = await persistence.start();
            console.log(JSON.stringify({ phase: mode, restored, taskIds: manager.tasks.map((task) => task.id) }));
            await persistence.shutdown();
        }
    `;
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--input-type=module", "-e", script, "--", mode, file], {
            cwd: fileURLToPath(new URL("../../..", import.meta.url)),
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

describe("RenderQueuePersistence acceptance", () => {
    it("writes a unique staging file, atomically reopens, and leaves no staging residue", async () => {
        const file = await tempQueueFile();
        const manager = managerWithTasks([{ id: "active", hasMoreWork: () => true }]);
        const persistence = new RenderQueuePersistence(manager as never, { file, maps: new Map(), intervalMs: 0 });

        await persistence.flush();
        const saved = JSON.parse(await readFile(file, "utf8")) as { taskIds: string[] };
        const entries = await readdir(join(file, ".."));

        expect(saved.taskIds).toEqual(["active"]);
        expect(manager.saves).toHaveLength(1);
        expect(manager.saves[0]?.file).toMatch(/\.staging-[0-9a-f-]+$/);
        expect(entries.some((entry) => entry.includes(".staging-"))).toBe(false);

        const reopened = new RenderQueuePersistence(manager as never, { file, maps: new Map(), intervalMs: 0 });
        await expect(reopened.start()).resolves.toBe(1);
    });

    it("filters terminal tasks before saving", async () => {
        const file = await tempQueueFile();
        const manager = managerWithTasks([
            { id: "active", hasMoreWork: () => true },
            { id: "finished", hasMoreWork: () => false },
            { id: "cancelled", hasMoreWork: () => false },
        ]);
        const persistence = new RenderQueuePersistence(manager as never, { file, maps: new Map(), intervalMs: 0 });

        await persistence.flush();

        expect(manager.saves[0]?.taskIds).toEqual(["active"]);
    });

    it("coalesces overlapping requests into sequential writes", async () => {
        const file = await tempQueueFile();
        const manager = managerWithTasks([{ id: "active", hasMoreWork: () => true }], 10);
        const persistence = new RenderQueuePersistence(manager as never, { file, maps: new Map(), intervalMs: 0 });

        persistence.requestSave();
        persistence.requestSave();
        persistence.requestSave();
        await persistence.flush();

        expect(manager.maxActiveSaves).toBe(1);
        expect(manager.saves).toHaveLength(2);
        expect(new Set(manager.saves.map((save) => save.file)).size).toBe(2);
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ taskIds: ["active"] });
    });

    it("restores a queued task after the writer process exits and a new process starts", async () => {
        const file = await tempQueueFile();
        const writer = await runPersistenceProcess("write", file);
        expect(writer.code, writer.stderr).toBe(0);
        expect(JSON.parse(writer.stdout.trim())).toEqual({ phase: "write", taskIds: ["queued-after-restart"] });

        const reader = await runPersistenceProcess("read", file);
        expect(reader.code, reader.stderr).toBe(0);
        expect(JSON.parse(reader.stdout.trim())).toEqual({
            phase: "read",
            restored: 1,
            taskIds: ["queued-after-restart"],
        });
    }, 30_000);
});
