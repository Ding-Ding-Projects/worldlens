import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { ApplianceInstance } from "./types.js";

/** The instances this tool created, in a JSON file under the app's own data folder. Nothing else is ever managed. */
export class InstanceRegistry {
    private readonly file: string;
    private pending: Promise<unknown> = Promise.resolve();
    constructor(root: string) {
        this.file = path.join(root, "instances.json");
    }

    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const result = this.pending.then(work, work);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }

    list(): Promise<ApplianceInstance[]> {
        return this.enqueue(() => this.read());
    }

    private async read(): Promise<ApplianceInstance[]> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as { version?: number; instances?: unknown };
            if (parsed.version !== 1 || !Array.isArray(parsed.instances)) return [];
            return parsed.instances.filter(isInstance);
        } catch {
            return [];
        }
    }

    add(instance: Omit<ApplianceInstance, "id" | "createdAt">): Promise<ApplianceInstance> {
        return this.enqueue(async () => {
            const all = await this.read();
            const record: ApplianceInstance = { ...instance, id: randomUUID(), createdAt: new Date().toISOString() };
            await this.write([...all, record]);
            return record;
        });
    }

    update(id: string, patch: Partial<Pick<ApplianceInstance, "link">>): Promise<ApplianceInstance | null> {
        return this.enqueue(async () => {
            const all = await this.read();
            const found = all.find((i) => i.id === id);
            if (!found) return null;
            const next = { ...found, ...patch };
            await this.write(all.map((i) => (i.id === id ? next : i)));
            return next;
        });
    }

    remove(id: string): Promise<void> {
        return this.enqueue(async () => this.write((await this.read()).filter((i) => i.id !== id)));
    }

    private async write(instances: readonly ApplianceInstance[]): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temp = `${this.file}.${randomUUID()}.tmp`;
        await fs.writeFile(temp, JSON.stringify({ version: 1, instances }, null, 2), { encoding: "utf8", mode: 0o600 });
        await fs.rename(temp, this.file);
    }
}

function isInstance(value: unknown): value is ApplianceInstance {
    if (value === null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return typeof v["id"] === "string" && (v["target"] === "vmware" || v["target"] === "virtualbox") && typeof v["name"] === "string" && typeof v["handle"] === "string" && typeof v["folder"] === "string" && typeof v["link"] === "string" && typeof v["port"] === "number" && typeof v["hostName"] === "string" && typeof v["createdAt"] === "string";
}
