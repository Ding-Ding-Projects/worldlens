import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServerRegistry } from "../main/mcserver/registry.js";
import { ensureServerRecord, loadAccounts, readSiteConfiguration, saveAccounts } from "./main.js";

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wl-site-"));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe("server management site", () => {
    it("needs a host name and an explicit choice about HTTPS", () => {
        expect(readSiteConfiguration({}).problems.join(" ")).toMatch(/WORLDLENS_SITE_HOST/);
        expect(
            readSiteConfiguration({ WORLDLENS_SITE_HOST: "mc.local" }).problems.join(" "),
        ).toMatch(/BEHIND_TLS/);
        const { configuration } = readSiteConfiguration({
            WORLDLENS_SITE_HOST: "MC-Heapandyville.local",
            WORLDLENS_SITE_LAN_HTTP: "1",
            WORLDLENS_DATA: dir,
        });
        expect(configuration).toMatchObject({
            host: "mc-heapandyville.local",
            origin: "https://mc-heapandyville.local",
            plainHttpAllowed: true,
            port: 8443,
            container: "worldlens-mc",
        });
    });

    it("keeps accounts in a private file and refuses to start on a damaged one", async () => {
        const book = await loadAccounts(dir);
        expect(book.openForOwner).toBe(true);
        book.registerOwner({
            name: "SpongeBob",
            password: "krabby patty 42",
            totp: null,
            passkey: null,
            policy: ["password"],
            now: new Date(),
        });
        await saveAccounts(dir, book.snapshot());
        expect((await loadAccounts(dir)).openForOwner).toBe(false);
        if (process.platform !== "win32")
            expect((await stat(join(dir, "server-site-accounts.v1.json"))).mode & 0o777).toBe(
                0o600,
            );
        await writeFile(join(dir, "server-site-accounts.v1.json"), "{broken");
        await expect(loadAccounts(dir)).rejects.toThrow(/will not start/);
    });

    it("registers the appliance's container once", async () => {
        const registry = createServerRegistry({ dataFolder: dir });
        const { configuration } = readSiteConfiguration({
            WORLDLENS_SITE_HOST: "mc.local",
            WORLDLENS_BEHIND_TLS: "1",
            WORLDLENS_DATA: dir,
        });
        await ensureServerRecord(registry, configuration!, "2026-11-23T00:00:00.000Z");
        await ensureServerRecord(registry, configuration!, "2026-11-23T00:00:00.000Z");
        const list = await registry.list();
        expect(list.ok && list.value.map((r) => r.ref)).toEqual([
            { kind: "local-docker", containerRef: "worldlens-mc", serverDir: "/data/server" },
        ]);
        expect(await readFile(join(dir, "minecraft-servers.v1.json"), "utf8")).toContain(
            "worldlens-mc",
        );
    });
});
