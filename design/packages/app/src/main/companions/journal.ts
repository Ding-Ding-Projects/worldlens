import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { BuildRecord } from "./runs.js";
import { knownBuildPhase } from "./progress.js";

export interface BuildJournal { save(record: BuildRecord): Promise<void> }
/** Owner-local journal only. Console output, environment and private payloads are never saved. */
export class FileBuildJournal implements BuildJournal {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private readonly directory: string) {
        if (!path.isAbsolute(directory)) throw new Error("A private absolute journal directory is required.");
    }
    save(record: BuildRecord): Promise<void> {
        // Reconstruct phase metadata from the reviewed table at the persistence boundary.
        // Never serialize a caller-supplied console label, even if it resembles a phase.
        const { lastPhase, ...rest } = record;
        const phase = lastPhase && knownBuildPhase(lastPhase.stage, lastPhase.stages, lastPhase.label);
        const snapshot = { ...rest, ...(phase ? { lastPhase: phase } : {}) };
        const task = this.tail.then(async () => {
            if (!/^[a-f0-9-]{36}$/u.test(record.id)) throw new Error("Invalid build record identity.");
            await mkdir(this.directory, { recursive: true });
            const target = path.join(this.directory, `${record.id}.json`);
            const temporary = `${target}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({ schemaVersion: 1, record: snapshot }), { encoding: "utf8", mode: 0o600, flag: "wx" });
                await rename(temporary, target);
            } finally { await rm(temporary, { force: true }).catch(() => undefined); }
        });
        this.tail = task.catch(() => undefined);
        return task;
    }
    /** Historical data is display-only. Recovery never reconnects or terminates a recorded PID. */
    async read(id: string): Promise<BuildRecord> {
        if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("Invalid build record identity.");
        await this.tail;
        const file = path.join(this.directory, `${id}.json`);
        if ((await stat(file)).size > 64 * 1024) throw new Error("Build history record is too large.");
        const raw = await readFile(file, "utf8");
        if (raw.length > 64 * 1024) throw new Error("Build history record is too large.");
        const value = JSON.parse(raw) as { schemaVersion?: number; record?: BuildRecord };
        const record = value.record;
        if (value.schemaVersion !== 1 || !record || record.id !== id || typeof record.startedAt !== "string" || !record.plan?.source?.commit)
            throw new Error("Build history record is invalid.");
        if (["prepared", "running", "cancelling"].includes(record.state))
            return { ...record, state: "interrupted", detail: "The previous host did not record completion. Process state is unknown; inspect it before retrying." };
        return record;
    }
}
