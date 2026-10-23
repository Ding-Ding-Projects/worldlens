import { expect, test } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { fail, ok } from "../transport/types.js";
import { BOT_CHANNELS, CONNECTION_UNAVAILABLE_REASON, registerBotIpc } from "./wiring.js";

function fakeIpc() {
    const handlers = new Map<
        string,
        (event: IpcMainInvokeEvent, request: unknown) => Promise<unknown>
    >();
    return {
        handlers,
        ipc: {
            handle: (
                channel: string,
                listener: (event: IpcMainInvokeEvent, request: unknown) => Promise<unknown>,
            ) => {
                handlers.set(channel, listener);
            },
            removeHandler: (channel: string) => {
                handlers.delete(channel);
            },
        },
    };
}
const registry = {
    get: async (id: string) =>
        id === "survival"
            ? ok({ id, name: "Survival", minecraftVersion: "1.21.4" } as never)
            : fail("not-found", "No server with that name is registered."),
};
const event = {} as IpcMainInvokeEvent;
const invoke = (
    handlers: ReturnType<typeof fakeIpc>["handlers"],
    channel: string,
    request?: unknown,
) =>
    handlers.get(channel)!(event, request) as Promise<{
        ok: boolean;
        value?: unknown;
        failure?: { code: string; message: string };
    }>;

test("registers every bot channel and removes them all on dispose", () => {
    const { ipc, handlers } = fakeIpc();
    const registration = registerBotIpc(ipc, {
        registry,
        isTrustedSender: () => true,
        mineflayerVersions: () => [],
    });
    expect([...handlers.keys()].sort()).toEqual(Object.values(BOT_CHANNELS).sort());
    registration.dispose();
    expect(handlers.size).toBe(0);
});

test("profiles are described from the registry record but never read as available without a connection", async () => {
    const { ipc, handlers } = fakeIpc();
    registerBotIpc(ipc, {
        registry,
        isTrustedSender: () => true,
        mineflayerVersions: () => ["1.21.4"],
    });
    const answer = await invoke(handlers, BOT_CHANNELS.profiles, { serverId: "survival" });
    expect(answer.ok).toBe(true);
    const capabilities = answer.value as {
        engine: string;
        available: boolean;
        reason: string | null;
        serverVersion: string;
    }[];
    expect(capabilities.map((c) => c.engine).sort()).toEqual(["baritone", "mineflayer"]);
    expect(capabilities.every((c) => c.available === false)).toBe(true);
    expect(capabilities.every((c) => c.serverVersion === "1.21.4")).toBe(true);
    // both engines would have matched 1.21.4, so both carry the connection reason, not a version excuse
    expect(capabilities.every((c) => c.reason === CONNECTION_UNAVAILABLE_REASON)).toBe(true);
});

test("an unknown server and a malformed request are refused before any registrar work", async () => {
    const { ipc, handlers } = fakeIpc();
    registerBotIpc(ipc, { registry, isTrustedSender: () => true, mineflayerVersions: () => [] });
    expect(
        (await invoke(handlers, BOT_CHANNELS.profiles, { serverId: "nope" })).failure?.code,
    ).toBe("not-found");
    expect((await invoke(handlers, BOT_CHANNELS.profiles, "survival")).failure?.code).toBe(
        "invalid-request",
    );
    expect(
        (
            await invoke(handlers, BOT_CHANNELS.deploy, {
                serverId: "survival",
                engine: "rocket",
                accountRef: "a",
            })
        ).failure?.code,
    ).toBe("invalid-request");
    expect(
        (
            await invoke(handlers, BOT_CHANNELS.navigate, {
                botId: "b",
                point: { kind: "point", dimension: "overworld", x: 1, y: Number.NaN, z: 3 },
            })
        ).failure?.code,
    ).toBe("invalid-request");
});

test("deploy and account preparation answer with the exact unavailable reason instead of pretending", async () => {
    const { ipc, handlers } = fakeIpc();
    registerBotIpc(ipc, { registry, isTrustedSender: () => true, mineflayerVersions: () => [] });
    const deploy = await invoke(handlers, BOT_CHANNELS.deploy, {
        serverId: "survival",
        engine: "mineflayer",
        accountRef: "acct",
        navigation: true,
    });
    expect(deploy.ok).toBe(false);
    expect(deploy.failure?.message).toContain("authenticated game-protocol connection");
    expect(deploy.failure?.message).toContain("Survival");
    const microsoft = await invoke(handlers, BOT_CHANNELS.prepareAccount, {
        provider: "microsoft",
        username: "steve",
    });
    expect(microsoft.failure?.message).toContain("Protected account setup is unavailable");
    const offline = await invoke(handlers, BOT_CHANNELS.prepareAccount, {
        provider: "offline",
        username: "steve",
    });
    expect(offline.failure?.code).toBe("unsupported");
    expect(await invoke(handlers, BOT_CHANNELS.accounts)).toEqual({ ok: true, value: [] });
    const status = await invoke(handlers, BOT_CHANNELS.status, { botId: "missing" });
    expect(status.failure?.message).toContain("Owned bot session not found");
});

test("a request from an untrusted sender is denied before validation", async () => {
    const { ipc, handlers } = fakeIpc();
    registerBotIpc(ipc, { registry, isTrustedSender: () => false, mineflayerVersions: () => [] });
    expect(
        (await invoke(handlers, BOT_CHANNELS.profiles, { serverId: "survival" })).failure?.code,
    ).toBe("denied");
});
