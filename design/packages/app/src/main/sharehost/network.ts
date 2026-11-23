/**
 * Finding the address other computers should use, and proving it works.
 *
 * "Reachable" is only ever claimed after a request from this PC to that address has come
 * back from the map server. A container's own address, a loopback bind, or a published port
 * that nothing has asked is not proof, and this module has no function that reports one.
 */
import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import type { Executor } from "./exec.js";

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isUsableLanAddress(address: string): boolean {
    if (!IPV4.test(address)) return false;
    const parts = address.split(".").map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b] = parts as [number, number, number, number];
    if (a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    return true;
}

/** Names of adapters that carry virtual machines or containers, not the network. */
const VIRTUAL = /vethernet|virtualbox|vmware|vmnet|docker|wsl|hyper-v|loopback|tailscale|zerotier|^br-|^veth|^lo$/i;

/**
 * This PC's LAN address: the one the operating system would use to reach the outside.
 *
 * A UDP `connect` sends nothing; it only asks the routing table which local address a
 * packet to that destination would leave from, which is exactly the address of the adapter
 * holding the default route. Failing that, the first private address on an adapter that is
 * not obviously a virtual one.
 */
export async function localLanAddress(): Promise<string | null> {
    const viaRoute = await new Promise<string | null>((resolve) => {
        const socket = createSocket("udp4");
        const done = (value: string | null): void => { try { socket.close(); } catch { /* already closed */ } resolve(value); };
        socket.once("error", () => done(null));
        try {
            socket.connect(9, "192.0.2.1", () => {
                try { done(socket.address().address); } catch { done(null); }
            });
        } catch { done(null); }
    });
    if (viaRoute !== null && isUsableLanAddress(viaRoute)) return viaRoute;
    for (const [name, list] of Object.entries(networkInterfaces())) {
        if (VIRTUAL.test(name)) continue;
        for (const entry of list ?? []) {
            if (entry.family === "IPv4" && !entry.internal && isUsableLanAddress(entry.address)) return entry.address;
        }
    }
    return null;
}

/** The host's LAN address, asked of the host itself: its route to the outside first. */
export async function remoteLanAddress(executor: Executor): Promise<string | null> {
    const route = await executor.exec("ip", ["-4", "route", "get", "1.1.1.1"]);
    const src = /\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})/.exec(route.stdout);
    if (src?.[1] !== undefined && isUsableLanAddress(src[1])) return src[1];
    const names = await executor.exec("hostname", ["-I"]);
    for (const candidate of names.stdout.split(/\s+/)) if (isUsableLanAddress(candidate)) return candidate;
    return null;
}

export type Fetcher = (url: string, init?: { readonly signal?: AbortSignal; readonly headers?: Record<string, string> }) => Promise<{ readonly status: number; json(): Promise<unknown> }>;

export interface HealthProbe {
    readonly ok: boolean;
    readonly detail: string;
}

/** One bounded request to `/health`. The access code is never needed for this route. */
export async function probeHealth(url: string, fetcher: Fetcher, timeoutMs = 3000): Promise<HealthProbe> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
        const response = await fetcher(url, { signal: abort.signal });
        if (response.status !== 200) return { ok: false, detail: `answered ${String(response.status)}` };
        const body = (await response.json()) as { status?: unknown };
        return body.status === "ok" ? { ok: true, detail: "200 OK" } : { ok: false, detail: "answered, but the map has no files" };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    } finally {
        clearTimeout(timer);
    }
}

/** Retries a probe until it passes or the budget runs out, never waiting longer than asked. */
export async function waitForHealth(
    urls: readonly string[],
    fetcher: Fetcher,
    options: { readonly attempts: number; readonly delayMs: number; readonly sleep?: (ms: number) => Promise<void>; readonly signal?: AbortSignal },
): Promise<{ readonly url: string | null; readonly lastDetail: string }> {
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let lastDetail = "no attempt was made";
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
        for (const url of urls) {
            if (options.signal?.aborted === true) return { url: null, lastDetail: "cancelled" };
            const probe = await probeHealth(url, fetcher);
            if (probe.ok) return { url, lastDetail: probe.detail };
            lastDetail = `${url} ${probe.detail}`;
        }
        if (attempt < options.attempts - 1) await sleep(options.delayMs);
    }
    return { url: null, lastDetail };
}
