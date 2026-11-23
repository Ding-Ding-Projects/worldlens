import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { isPrivateIPv4 } from "./plan.js";

/** Virtual adapters whose addresses a person on the LAN cannot reach. */
const VIRTUAL_ADAPTER = /vethernet|docker|veth|br-|virtualbox|vmware|vbox|loopback|wsl|hyper-v|tailscale|zerotier/i;

/**
 * The address another device on the same network would use to reach this PC.
 *
 * Pure over the interface table so it can be tested without a network. Private IPv4 only,
 * physical-looking adapters first, and `null` when there is none: an invented address is
 * worse than an honest "unavailable".
 */
export function lanAddressFrom(interfaces: Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>): string | null {
    const candidates: { name: string; address: string; virtual: boolean }[] = [];
    for (const [name, entries] of Object.entries(interfaces)) {
        for (const entry of entries ?? []) {
            if (entry.family !== "IPv4" || entry.internal || !isPrivateIPv4(entry.address)) continue;
            candidates.push({ name, address: entry.address, virtual: VIRTUAL_ADAPTER.test(name) });
        }
    }
    const physical = candidates.find((entry) => !entry.virtual);
    return (physical ?? candidates[0])?.address ?? null;
}

export function localLanAddress(): string | null {
    return lanAddressFrom(networkInterfaces());
}

export function isLoopbackHost(host: string): boolean {
    return host === "localhost" || host === "::1" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
