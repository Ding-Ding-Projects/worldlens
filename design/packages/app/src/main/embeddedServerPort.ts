/**
 * Keeps the interface on the same loopback port from one launch to the next.
 *
 * The interface is served by the embedded server at `http://127.0.0.1:<port>/`, and the
 * browser keeps `localStorage` per origin, port included. The server used to take a random
 * port on every launch, so every launch was a new origin with empty storage: the Work tab
 * layout, and every preference still kept only in `localStorage`, was gone after a restart,
 * and the old values were stranded under an origin nothing would load again.
 *
 * The port that worked last time is remembered in a small file in the application's data
 * folder and asked for first. Only when it cannot be had (another program took it, or the file
 * is missing or damaged) does the server fall back to a random port, which is then remembered
 * in turn.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AddressInfo } from "node:net";

/** The file, inside the application's data folder, that holds the remembered port. */
export const EMBEDDED_SERVER_PORT_FILE = "embedded-server-port.json";

/** Ports a remembered value may name: registered and dynamic ports, never privileged ones. */
const MIN_PORT = 1024;
const MAX_PORT = 65535;

function validPort(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= MIN_PORT && (value as number) <= MAX_PORT;
}

/** The remembered port, or null when there is none or it is not a usable port. */
export async function readPreferredPort(file: string): Promise<number | null> {
    try {
        const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
        const port = (parsed as { port?: unknown } | null)?.port;
        return validPort(port) ? port : null;
    } catch {
        return null;
    }
}

/** Remembers the port. A failed write only costs the next launch its old storage. */
export async function writePreferredPort(file: string, port: number): Promise<void> {
    if (!validPort(port)) return;
    try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify({ port })}\n`, "utf8");
    } catch {
        // Nothing to do: the server is already listening, and this launch works either way.
    }
}

/** Anything that can be told a port and then listen on it. */
export interface Listenable {
    listen(): Promise<AddressInfo>;
}

export interface PreferredListen<T extends Listenable> {
    readonly server: T;
    readonly address: AddressInfo;
    /** True when the remembered port was used, so the interface keeps its storage. */
    readonly reusedPreferredPort: boolean;
}

/**
 * Listens on the remembered port when it is free, otherwise on a random one.
 *
 * `create` builds a fresh server for a port each time, because a server whose listen failed is
 * not reused. Any failure on the remembered port falls back; a failure on the random port is
 * real and is thrown.
 */
export async function listenPreferringPort<T extends Listenable>(
    create: (port: number) => T,
    preferred: number | null,
): Promise<PreferredListen<T>> {
    if (preferred !== null && validPort(preferred)) {
        const server = create(preferred);
        try {
            const address = await server.listen();
            return { server, address, reusedPreferredPort: true };
        } catch {
            // Taken or refused: fall through to a random port.
        }
    }
    const server = create(0);
    const address = await server.listen();
    return { server, address, reusedPreferredPort: false };
}
