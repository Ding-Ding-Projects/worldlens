import { expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createServer } from "node:net";
import { scryptSync } from "node:crypto";
import { bootstrapManagedMapHost, createManagedMapHost } from "./host.js";
test("host protects map assets and stores edits outside the immutable map tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "managed-host-"));
    const map = join(root, "map"); const data = join(root, "data"); await mkdir(map); await writeFile(join(map, "index.html"), "real map");
    const salt = "c".repeat(64);
    await bootstrapManagedMapHost(data, { username: "admin", verifier: { algorithm: "scrypt-v1", salt, digest: scryptSync("test-password-1234", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex") } });
    const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
    const address = reservation.address(); if (!address || typeof address === "string") throw new Error("Missing test listener address");
    const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const { server } = await createManagedMapHost({ mapRoot: map, dataRoot: data, origin });
    server.listen(port, "127.0.0.1"); await once(server, "listening");
    try {
        expect(await (await fetch(origin)).text()).toContain("Sign in to this map");
        expect((await (await fetch(origin + "/health")).json() as { authentication: string }).authentication).toBe("required");
        const login = await fetch(origin + "/bridge/managed-session", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "test-password-1234" }) });
        const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
        expect(await (await fetch(origin, { headers: { cookie } })).text()).toBe("real map");
        expect((await fetch(origin + "/administrator.json", { headers: { cookie } })).status).toBe(404);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
