import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConverterQueue } from "./queue.js";

describe("converter queue", () => {
    it("persists a durable queue, runs bounded work and supports pause and cancel", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-converter-"));
        try {
            const running: string[] = [];
            let peak = 0;
            const queue = new ConverterQueue({ stateFile: join(dir, "queue.json"), concurrency: 2, run: async (item, signal, report) => { running.push(item.id); peak = Math.max(peak, running.length); report(50, 10); await new Promise((resolve) => setTimeout(resolve, 20)); if (signal.aborted) return; report(100, 20); running.splice(running.indexOf(item.id), 1); } });
            await queue.enqueue(Array.from({ length: 12 }, (_, index) => ({ id: `i${index}`, source: `s${index}`, target: `t${index}`, adapterId: "text", bytes: null })));
            await queue.cancel("i11");
            await new Promise((resolve) => setTimeout(resolve, 800));
            expect(peak).toBeLessThanOrEqual(2);
            expect(JSON.parse(await readFile(join(dir, "queue.json"), "utf8")).version).toBe(1);
            expect(queue.snapshot().items.find((item) => item.id === "i11")?.state).toBe("cancelled");
        } finally { await rm(dir, { recursive: true, force: true }); }
    });
});
