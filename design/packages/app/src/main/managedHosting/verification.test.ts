import { expect, test } from "vitest";
import { verifyManagedHostAccess, verifyManagedHostHealth, verifyOwnedManagedHostHealth } from "./verification.js";
test("health only claims LAN proof when the actual checked endpoint is a private LAN address", async () => {
    const fetcher = async () => new Response(JSON.stringify({ ready: true, authentication: "required" }));
    expect(await verifyManagedHostHealth("http://127.0.0.1:8443", fetcher as typeof fetch)).toEqual({ healthy: true, lanVerified: false, origin: "http://127.0.0.1:8443" });
    expect((await verifyManagedHostHealth("https://192.168.1.20:8443", fetcher as typeof fetch)).lanVerified).toBe(true);
    await expect(verifyManagedHostHealth("http://192.168.1.20:8443", fetcher as typeof fetch)).rejects.toThrow("HTTPS");
});
test("administrator verified state requires authenticated session readback", async () => {
    const calls: RequestInit[] = [];
    const fetcher = async (_url: unknown, init: RequestInit) => { calls.push(init); return calls.length === 1 ? new Response("{}", { headers: { "set-cookie": "worldlens_session=test-session; HttpOnly" } }) : new Response(JSON.stringify({ signedIn: true, state: "verified" })); };
    expect(await verifyManagedHostAccess("http://localhost:8443", "admin", "test-only-password", fetcher as typeof fetch)).toEqual({ state: "verified" });
    expect(calls).toHaveLength(2); expect(calls[1]?.headers).toEqual({ cookie: "worldlens_session=test-session" });
});
test("a healthy unrelated listener cannot satisfy operation-bound health verification", async () => {
    const fetcher = async () => new Response(JSON.stringify({ ready: true, authentication: "required", operationId: "old-operation", contextFingerprint: "old-context" }));
    await expect(verifyManagedHostHealth("https://192.168.1.20:8443", fetcher as typeof fetch, { operationId: "new-operation", contextFingerprint: "new-context" })).rejects.toThrow("different host operation");
});
test("a matching health response cannot pass when the owned process exits during the request", async () => {
    let running = true; const expected = { operationId: "owned-operation", contextFingerprint: "owned-context" };
    const fetcher = async () => { running = false; return new Response(JSON.stringify({ ready: true, authentication: "required", ...expected })); };
    await expect(verifyOwnedManagedHostHealth("https://192.168.1.20:8443", expected, async () => running, fetcher as typeof fetch)).rejects.toThrow("exited during");
});
