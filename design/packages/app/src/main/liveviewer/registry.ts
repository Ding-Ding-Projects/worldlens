/**
 * The viewers this installation created.
 *
 * Only what a viewer IS (name, target, port, link) is stored. Whether it is running, and
 * whether its bot has joined, is asked of Docker every time, because a cached "running"
 * outlives a reboot. Nothing secret is stored: a Microsoft account is a reference into
 * protected storage, and the vocabulary mapping lives only in the viewer's own volume.
 *
 * A record that fails validation is dropped rather than repaired. A half-understood record
 * points at a container nobody is sure about, and stopping or removing it on a guess is the
 * one thing this file exists to prevent.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { validInstanceId } from "./plan.js";
import type { HostTarget, ViewerInstance } from "./types.js";

export const REGISTRY_FILE = "live-viewers.v1.json";
export const REGISTRY_VERSION = 1;
export const REGISTRY_MAX_BYTES = 512 * 1024;
export const REGISTRY_MAX_RECORDS = 100;

function text(value: unknown, max = 256): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value);
}

function parseTarget(value: unknown): HostTarget | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    if (raw.kind === "local") return { kind: "local" };
    if (raw.kind === "ssh" && text(raw.hostId, 64) && /^[a-z][a-z0-9-]{0,62}$/.test(raw.hostId)) return { kind: "ssh", hostId: raw.hostId };
    return null;
}

export function parseInstance(value: unknown): ViewerInstance | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    const target = parseTarget(raw.target);
    if (target === null) return null;
    if (!text(raw.id, 64) || !validInstanceId(raw.id)) return null;
    if (!text(raw.name, 120) || !text(raw.createdAt, 40) || !text(raw.lanAddress, 80) || !text(raw.url, 200)) return null;
    if (!text(raw.containerName, 80) || !text(raw.image, 300) || !text(raw.botName, 32) || !text(raw.serverLabel, 300)) return null;
    if (typeof raw.hostPort !== "number" || !Number.isInteger(raw.hostPort) || raw.hostPort < 1 || raw.hostPort > 65535) return null;
    if (raw.kind !== "viewer" && raw.kind !== "client") return null;
    if (raw.auth !== "offline" && raw.auth !== "microsoft") return null;
    if (raw.accountRef !== null && !(typeof raw.accountRef === "string" && /^[a-f0-9-]{36}$/.test(raw.accountRef))) return null;
    return {
        id: raw.id,
        name: raw.name,
        createdAt: raw.createdAt,
        target,
        hostPort: raw.hostPort,
        lanAddress: raw.lanAddress,
        url: raw.url,
        containerName: raw.containerName,
        image: raw.image,
        kind: raw.kind,
        botName: raw.botName,
        serverLabel: raw.serverLabel,
        auth: raw.auth,
        accountRef: raw.accountRef as string | null,
    };
}

export class InstanceRegistry {
    readonly #file: string;
    #queue: Promise<unknown> = Promise.resolve();

    constructor(dataFolder: string) {
        this.#file = join(dataFolder, REGISTRY_FILE);
    }

    #enqueue<T>(work: () => Promise<T>): Promise<T> {
        const next = this.#queue.then(work, work);
        this.#queue = next.then(() => undefined, () => undefined);
        return next;
    }

    async #read(): Promise<ViewerInstance[]> {
        let raw: string;
        try {
            raw = await readFile(this.#file, "utf8");
        } catch {
            return [];
        }
        if (raw.length > REGISTRY_MAX_BYTES) return [];
        try {
            const parsed = JSON.parse(raw) as { version?: unknown; instances?: unknown };
            if (parsed.version !== REGISTRY_VERSION || !Array.isArray(parsed.instances)) return [];
            return parsed.instances.slice(0, REGISTRY_MAX_RECORDS).map(parseInstance).filter((entry): entry is ViewerInstance => entry !== null);
        } catch {
            return [];
        }
    }

    async #write(instances: readonly ViewerInstance[]): Promise<void> {
        await mkdir(dirname(this.#file), { recursive: true });
        await atomicWriteTextFile(this.#file, JSON.stringify({ version: REGISTRY_VERSION, instances }, null, 2));
    }

    list(): Promise<ViewerInstance[]> {
        return this.#enqueue(() => this.#read());
    }

    get(id: string): Promise<ViewerInstance | null> {
        return this.#enqueue(async () => (await this.#read()).find((entry) => entry.id === id) ?? null);
    }

    add(instance: ViewerInstance): Promise<void> {
        return this.#enqueue(async () => {
            const current = await this.#read();
            if (current.length >= REGISTRY_MAX_RECORDS) throw new Error("The list of hosted viewers is full.");
            await this.#write([...current.filter((entry) => entry.id !== instance.id), instance]);
        });
    }

    remove(id: string): Promise<void> {
        return this.#enqueue(async () => {
            const current = await this.#read();
            await this.#write(current.filter((entry) => entry.id !== id));
        });
    }
}
