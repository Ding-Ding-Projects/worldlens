import { expect, test } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptSync } from "node:crypto";
import { ManagedHostedAccess } from "../bridge/ManagedHostedAccess.js";
import { ManagedAnnotationService } from "./service.js";
test("real HTTP boundary requires sign-in and same-origin edits with revision protection", async () => {
    const root = await mkdtemp(join(tmpdir(), "hosted-annotations-"));
    const access = new ManagedHostedAccess(null, async () => undefined);
    const salt = "a".repeat(64);
    await access.provision({ username: "admin", verifier: { algorithm: "scrypt-v1", salt, digest: scryptSync("test-password-1234", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex") } });
    // Assigned after the server has an address, because the service needs the exact origin the
    // server ended up listening on; the request handler above only dereferences it per request.
    // eslint-disable-next-line prefer-const
    let service: ManagedAnnotationService;
    const server = createServer((req, res) => { void service.handle(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    const origin = `http://127.0.0.1:${address.port}`;
    service = new ManagedAnnotationService(access, root, origin);
    const path = origin + "/bridge/annotations?projectId=p&mapId=m&dimension=overworld";
    try {
        expect((await fetch(path)).status).toBe(401);
        const login = await fetch(origin + "/bridge/managed-session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "test-password-1234" }) });
        expect(login.status).toBe(200); expect(access.status).toBe("verified");
        const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
        const update = { method: "PUT", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, annotations: [{ label: "shared" }] }) };
        expect((await fetch(path, { ...update, headers: { ...update.headers, origin: "https://other.invalid" } })).status).toBe(403);
        expect((await fetch(path, update)).status).toBe(200);
        expect((await fetch(path, update)).status).toBe(409);
        expect((await (await fetch(path, { headers: { cookie } })).json() as { revision: number }).revision).toBe(1);
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(root, { recursive: true, force: true }); }
});
test("network authentication refuses plaintext hosting", () => {
    expect(() => new ManagedAnnotationService(new ManagedHostedAccess(null, async () => undefined), "unused", "http://192.0.2.1:8080")).toThrow("HTTPS");
});
