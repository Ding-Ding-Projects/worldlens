import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
