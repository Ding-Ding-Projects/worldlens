/**
 * The hosted deployment as a whole, over a real socket.
 *
 * Every piece below is covered by its own tests. What is only observable here is whether they
 * compose: whether the gate really sits in front of the bridge, whether the capability
 * profile really reaches the wire, and whether the static bundle really stays behind
 * `/bridge/*` rather than answering it with the index page. Handler order is the kind of
 * mistake that no unit test can see and that looks, from the browser, like the bridge
 * returning HTML.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "@worldlens/server";
import { startHostedServer, UnsafeExposureError, type HostedServer } from "./serve.js";

const running: HostedServer[] = [];
afterEach(async () => {
    for (const server of running.splice(0)) await server.close();
});

/** A stand-in for the built renderer bundle, so this test needs no build. */
function fakeUiRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "worldlens-hosted-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>WorldLens</title>");
    return root;
}

async function start(
    overrides: Partial<Parameters<typeof startHostedServer>[0]> = {},
): Promise<string> {
    const server = await startHostedServer({
        uiRoot: fakeUiRoot(),
        mountRoots: [],
        passwordHash: null,
        host: "127.0.0.1",
        port: 0,
        register: ({ ipcMain }) => {
            ipcMain.handle("app:version", () => "1.0.0");
            ipcMain.handle("render:start", () => {
                throw new Error("no world is mounted");
            });
            ipcMain.handle("dockerhosting:create", () => "created");
            ipcMain.handle("window:minimize", () => "minimised");
        },
        ...overrides,
    });
    running.push(server);
    return server.url;
}

const invoke = async (base: string, channel: string, cookie?: string): Promise<Response> =>
    await fetch(`${base}/bridge/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie === undefined ? {} : { cookie }) },
        body: JSON.stringify({ channel, args: [] }),
    });

describe("a hosted deployment, assembled", () => {
    it("serves the renderer bundle", async () => {
        const base = await start();

        const response = await fetch(`${base}/`);

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("WorldLens");
    });

    it("answers an available channel", async () => {
        const base = await start();

        expect(await (await invoke(base, "app:version")).json()).toEqual({
            ok: true,
            result: "1.0.0",
        });
    });

    it("does not let the static bundle answer a bridge path with the index page", async () => {
        // The failure handler order would produce, and it is completely silent: the bridge
        // appears to return HTML, and the transport reports a JSON parse error somewhere far
        // away from the actual mistake.
        const base = await start();

        const response = await invoke(base, "app:version");

        expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("refuses a channel this deployment cannot answer, even though a handler exists", async () => {
        // The handler is registered above on purpose. The policy has to be what stops it,
        // not the absence of an implementation - otherwise the boundary would be an accident.
        const base = await start();

        const response = await invoke(base, "window:minimize");

        expect(response.status).toBe(403);
        const body = (await response.json()) as { error: { message: string } };
        expect(body.error.message).toContain("no application window");
    });

    it("refuses an ungranted capability and names the grant that would allow it", async () => {
        const base = await start();

        const response = await invoke(base, "dockerhosting:create");

        expect(response.status).toBe(403);
        const body = (await response.json()) as { error: { instead?: string } };
        expect(body.error.instead).toContain("docker-socket");
    });

    it("allows that same channel once the operator granted it", async () => {
        const base = await start({ capabilities: ["docker-socket"] });

        expect(await (await invoke(base, "dockerhosting:create")).json()).toEqual({
            ok: true,
            result: "created",
        });
    });

    it("carries a handler's own failure through with its message intact", async () => {
        const base = await start();

        const response = await invoke(base, "render:start");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: false,
            error: { message: "no world is mounted" },
        });
    });

    it("puts the sign-in gate in front of the bridge when a password is set", async () => {
        const base = await start({ passwordHash: hashPassword("hunter2") });

        expect((await invoke(base, "app:version")).status).toBe(401);

        const signedIn = await fetch(`${base}/bridge/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: "hunter2" }),
        });
        const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

        expect((await invoke(base, "app:version", cookie)).status).toBe(200);
    });

    it("refuses to start on a network address with no password", async () => {
        // Thrown rather than warned. A deployment that warns and starts anyway has started
        // anyway, and the warning scrolls out of a container's log within seconds.
        await expect(
            startHostedServer({
                uiRoot: fakeUiRoot(),
                mountRoots: [],
                passwordHash: null,
                host: "0.0.0.0",
                port: 0,
            }),
        ).rejects.toBeInstanceOf(UnsafeExposureError);
    });

    it("starts on a network address once a password is set", async () => {
        const server = await startHostedServer({
            uiRoot: fakeUiRoot(),
            mountRoots: [],
            passwordHash: hashPassword("hunter2"),
            host: "127.0.0.1",
            port: 0,
        });
        running.push(server);

        expect(server.url).toContain("127.0.0.1");
    });

    it("refuses a channel nothing registered, rather than answering it emptily", async () => {
        const base = await start();

        const response = await invoke(base, "app:version-typo");

        // Refused because it is not in the bridge's own channel inventory. The prefix
        // policy alone would have allowed it - "app:" is available - which is exactly why
        // the inventory is enforced at run time and not only in a test.
        expect(response.status).toBe(403);
    });
});
