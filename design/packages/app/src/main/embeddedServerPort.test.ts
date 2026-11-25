import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    listenPreferringPort,
    readPreferredPort,
    writePreferredPort,
} from "./embeddedServerPort.js";

const open: Server[] = [];

/** A real loopback listener on `port`, closed after each case. */
function listener(port: number) {
    const server = createServer();
    open.push(server);
    return {
        listen: () =>
            new Promise<AddressInfo>((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, "127.0.0.1", () => resolve(server.address() as AddressInfo));
            }),
    };
}

afterEach(async () => {
    await Promise.all(
        open.splice(0).map(
            (server) => new Promise<void>((resolve) => (server.listening ? server.close(() => resolve()) : resolve())),
        ),
    );
});

describe("the embedded server's port", () => {
    it("comes back on the same port next launch, so the interface keeps its storage", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-port-"));
        try {
            const file = join(dir, "embedded-server-port.json");
            const first = await listenPreferringPort(listener, await readPreferredPort(file));
            expect(first.reusedPreferredPort).toBe(false);
            await writePreferredPort(file, first.address.port);
            await closeOpenListeners();

            const second = await listenPreferringPort(listener, await readPreferredPort(file));
            expect(second.reusedPreferredPort).toBe(true);
            expect(second.address.port).toBe(first.address.port);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("falls back to another port when the remembered one is taken", async () => {
        const taken = await listener(0).listen();
        const result = await listenPreferringPort(listener, taken.port);
        expect(result.reusedPreferredPort).toBe(false);
        expect(result.address.port).not.toBe(taken.port);
    });

    it("ignores a missing, damaged or out-of-range remembered port", async () => {
        const dir = await mkdtemp(join(tmpdir(), "worldlens-port-"));
        try {
            const file = join(dir, "embedded-server-port.json");
            expect(await readPreferredPort(file)).toBeNull();
            await writeFile(file, "not json", "utf8");
            expect(await readPreferredPort(file)).toBeNull();
            await writeFile(file, JSON.stringify({ port: 80 }), "utf8");
            expect(await readPreferredPort(file)).toBeNull();
            await writeFile(file, JSON.stringify({ port: 70000 }), "utf8");
            expect(await readPreferredPort(file)).toBeNull();

            await writePreferredPort(file, 80);
            expect(await readFile(file, "utf8")).toBe(JSON.stringify({ port: 70000 }));
            await writePreferredPort(file, 52311);
            expect(await readPreferredPort(file)).toBe(52311);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

/** Closes the listeners opened so far, standing in for the app quitting. */
async function closeOpenListeners(): Promise<void> {
    await Promise.all(
        open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
}
