import { isIP } from "node:net";
type Fetch = typeof globalThis.fetch;
function checkedOrigin(value: string): URL {
    const url = new URL(value);
    if (url.username || url.password || url.origin !== value) throw new Error("Use an exact hosting origin without credentials or a path.");
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new Error("Network authentication requires HTTPS.");
    return url;
}
function privateLan(hostname: string): boolean {
    if (isIP(hostname) === 4) { const parts = hostname.split(".").map(Number); return parts[0] === 10 || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || (parts[0] === 192 && parts[1] === 168); }
    return /^\[f[cd][0-9a-f:]+\]$/iu.test(hostname);
}
/** Health and intended-LAN reachability are separate from authenticated account verification. */
export async function verifyManagedHostHealth(origin: string, fetcher: Fetch = fetch, expected?: { operationId: string; contextFingerprint: string }): Promise<{ healthy: true; lanVerified: boolean; origin: string }> {
    const url = checkedOrigin(origin);
    const response = await fetcher(new URL("/health", url), { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("The host health endpoint did not succeed.");
    const body = await response.text(); if (body.length > 4096) throw new Error("The host health response is invalid.");
    const value = JSON.parse(body) as { ready?: unknown; authentication?: unknown; operationId?: unknown; contextFingerprint?: unknown };
    if (value.ready !== true || value.authentication !== "required") throw new Error("The host has not confirmed authenticated readiness.");
    if (expected && (value.operationId !== expected.operationId || value.contextFingerprint !== expected.contextFingerprint)) throw new Error("Health belongs to a different host operation or export context.");
    return { healthy: true, lanVerified: privateLan(url.hostname), origin: url.origin };
}
export async function verifyOwnedManagedHostHealth(origin: string, expected: { operationId: string; contextFingerprint: string }, ownedRunning: () => Promise<boolean>, fetcher: Fetch = fetch): Promise<{ healthy: true; lanVerified: boolean; origin: string }> {
    if (!await ownedRunning()) throw new Error("Owned host is not running before health verification.");
    const health = await verifyManagedHostHealth(origin, fetcher, expected);
    if (!await ownedRunning()) throw new Error("Owned host exited during health verification.");
    return health;
}
/** Values enter only from the protected verification control; no credential or cookie is returned. */
export async function verifyManagedHostAccess(origin: string, username: string, password: string, fetcher: Fetch = fetch): Promise<{ state: "verified" }> {
    const url = checkedOrigin(origin);
    const response = await fetcher(new URL("/bridge/managed-session", url), { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { origin: url.origin, "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (!response.ok) throw new Error("Administrator verification did not succeed.");
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie?.startsWith("worldlens_session=")) throw new Error("Administrator verification did not establish a session.");
    const readback = await fetcher(new URL("/bridge/managed-session", url), { redirect: "error", signal: AbortSignal.timeout(10000), headers: { cookie } });
    const body = await readback.text(); if (body.length > 4096) throw new Error("Administrator readback is invalid.");
    const status = JSON.parse(body) as { signedIn?: unknown; state?: unknown };
    if (!readback.ok || status.signedIn !== true || status.state !== "verified") throw new Error("Administrator session could not be read back.");
    return { state: "verified" };
}
