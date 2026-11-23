/**
 * The list of instances this app has created, kept in its own user-data file.
 *
 * The registry is what makes "only instances it created" true: every action in the manager
 * starts from a record here and then re-checks the container's ownership label, so a record
 * pointing at a container somebody else made is refused rather than obeyed, and a container
 * that carries the label but has no record is left alone. Writes are atomic (write beside,
 * then rename) so a crash cannot leave half a file that would hide every instance.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { InstanceRecord } from "./types.js";

export interface InstanceRegistry {
    list(): Promise<readonly InstanceRecord[]>;
    get(instanceId: string): Promise<InstanceRecord | null>;
    put(record: InstanceRecord): Promise<void>;
    remove(instanceId: string): Promise<void>;
}

interface FileShape { readonly version: 1; readonly instances: readonly InstanceRecord[] }

function isRecord(value: unknown): value is InstanceRecord {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Partial<InstanceRecord>;
    return typeof r.instanceId === "string" && /^[a-f0-9]{8}$/.test(r.instanceId)
        && typeof r.name === "string" && typeof r.containerName === "string" && typeof r.volumeName === "string"
        && typeof r.port === "number" && typeof r.link === "string" && typeof r.target === "object" && r.target !== null;
}

export function createFileRegistry(file: string): InstanceRegistry {
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T>(work: () => Promise<T>): Promise<T> => {
        const next = queue.then(work, work);
        queue = next.then(() => undefined, () => undefined);
        return next;
    };
    const read = async (): Promise<InstanceRecord[]> => {
        try {
            const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<FileShape>;
            return parsed.version === 1 && Array.isArray(parsed.instances) ? parsed.instances.filter(isRecord) : [];
        } catch {
            return [];
        }
    };
    const write = async (instances: readonly InstanceRecord[]): Promise<void> => {
        await mkdir(dirname(file), { recursive: true });
        const temp = `${file}.${String(process.pid)}.tmp`;
        await writeFile(temp, `${JSON.stringify({ version: 1, instances } satisfies FileShape, null, 2)}\n`, "utf8");
        await rename(temp, file);
    };
    return {
        list: () => serial(read),
        get: (id) => serial(async () => (await read()).find((entry) => entry.instanceId === id) ?? null),
        put: (record) => serial(async () => write([...(await read()).filter((entry) => entry.instanceId !== record.instanceId), record])),
        remove: (id) => serial(async () => write((await read()).filter((entry) => entry.instanceId !== id))),
    };
}

/** An in-memory registry for tests and for callers that do not want a file. */
export function createMemoryRegistry(initial: readonly InstanceRecord[] = []): InstanceRegistry {
    let records = [...initial];
    return {
        list: () => Promise.resolve([...records]),
        get: (id) => Promise.resolve(records.find((entry) => entry.instanceId === id) ?? null),
        put: (record) => { records = [...records.filter((entry) => entry.instanceId !== record.instanceId), record]; return Promise.resolve(); },
        remove: (id) => { records = records.filter((entry) => entry.instanceId !== id); return Promise.resolve(); },
    };
}
