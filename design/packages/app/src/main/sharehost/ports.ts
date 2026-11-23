/**
 * Is this port free on the machine that will host the map?
 *
 * Asked of the right machine: a port free on this PC says nothing about the SSH host. On
 * this PC the answer is a real attempt to listen; on a host it is read from `ss`, with
 * `netstat` as the fallback. When neither can answer, the port is reported as free and the
 * real `docker run` remains the final judge, whose refusal is turned into a one-click fix.
 */
import { createServer } from "node:net";
import type { Executor } from "./exec.js";
import type { InstanceRecord, PortCheck } from "./types.js";

export function isLocalPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => server.close(() => resolve(true)));
        server.listen(port, "0.0.0.0");
    });
}

/** Ports in use on a Linux host, read from `ss -ltn` or `netstat -ltn` output. */
export function parseListeningPorts(text: string): Set<number> {
    const ports = new Set<number>();
    for (const line of text.split(/\r?\n/)) {
        for (const match of line.matchAll(/(?:\*|\[?[0-9a-fA-F:.]+\]?):(\d{1,5})\s/g)) ports.add(Number(match[1]));
    }
    return ports;
}

export interface PortCheckOptions {
    readonly executor: Executor;
    readonly port: number;
    /** Records already hosted on this same machine: their ports are taken even if stopped. */
    readonly known: readonly InstanceRecord[];
    readonly localFree?: (port: number) => Promise<boolean>;
}

export async function checkPort(options: PortCheckOptions): Promise<PortCheck> {
    const claimed = new Set(options.known.map((record) => record.port));
    let remote: Set<number> | null = null;
    if (options.executor.kind === "ssh") {
        const ss = await options.executor.exec("ss", ["-ltn"]);
        if (ss.ok && ss.stdout.trim() !== "") remote = parseListeningPorts(ss.stdout);
        else {
            const netstat = await options.executor.exec("netstat", ["-ltn"]);
            if (netstat.ok) remote = parseListeningPorts(netstat.stdout);
        }
    }
    const localFree = options.localFree ?? isLocalPortFree;
    const free = async (port: number): Promise<boolean> => {
        if (port < 1 || port > 65535 || claimed.has(port)) return false;
        if (options.executor.kind === "local") return localFree(port);
        return remote === null || !remote.has(port);
    };
    const isFree = await free(options.port);
    if (isFree) return { free: true, suggested: options.port };
    for (let candidate = options.port + 1; candidate <= Math.min(options.port + 100, 65535); candidate += 1) {
        if (await free(candidate)) return { free: false, suggested: candidate };
    }
    return { free: false, suggested: options.port };
}
