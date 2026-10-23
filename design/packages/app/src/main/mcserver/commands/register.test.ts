import { describe, expect, it, vi } from "vitest";
import { discoverCommands } from "./index.js";
import {
    registerCommandBotOperations,
    type CommandBotRegistrar,
    type CommandBotRequests,
    type CommandBotResults,
    type TrustedCommandBotTarget,
} from "../bots/register.js";
function setup() {
    const handlers = new Map<string, (request: never) => Promise<unknown>>();
    const register: CommandBotRegistrar = (method, handler) => {
        handlers.set(method, handler as (request: never) => Promise<unknown>);
    };
    const proof = {
        serverId: "main-owned",
        version: "1.21.4",
        distributionSha256: "a".repeat(64),
        connectionEpoch: "1",
        principalId: "protected-account",
        permissionRevision: "1",
    };
    const graph = discoverCommands(
        {
            rootIndex: 0,
            nodes: [
                { flags: 0, children: [1] },
                { flags: 5, children: [], extraNodeData: { name: "list" } },
            ],
        },
        proof,
    );
    const dispatch = vi.fn(async () => {});
    let currentGraph = graph,
        clock = 1000;
    const target: TrustedCommandBotTarget = {
        target: proof,
        host: "127.0.0.1",
        port: 25565,
        currentGraph: async () => currentGraph,
        withCommandLock: async (operation) => operation(),
        dispatch,
        authorizeAccount: async () => {},
    };
    const backend = registerCommandBotOperations(register, {
        resolveTarget: async () => target,
        resolveAccount: async () => ({ username: "Test", auth: "offline" }),
        baritoneClient: async () => {
            throw new Error("Not installed.");
        },
        now: () => clock,
    });
    const call = <K extends keyof CommandBotRequests>(
        method: K,
        request: CommandBotRequests[K],
    ): Promise<CommandBotResults[K]> =>
        handlers.get(method)!(request as never) as Promise<CommandBotResults[K]>;
    return {
        call,
        dispatch,
        backend,
        changePermissions: () => {
            currentGraph = { ...graph, target: { ...proof, permissionRevision: "2" } };
        },
        expire: () => {
            clock = 100_000;
        },
    };
}
describe("main-owned command transport registration", () => {
    it("stores one-use previews in main and never accepts a renderer command string", async () => {
        const fixture = setup();
        const preview = await fixture.call("mcserver.commands.preview", {
            serverId: "main-owned",
            steps: [{ node: 1 }],
            dimension: null,
        });
        expect(preview.command).toBe("list");
        expect(
            await fixture.call("mcserver.commands.execute", { previewId: preview.previewId }),
        ).toEqual({ executed: true });
        expect(fixture.dispatch).toHaveBeenCalledWith(
            "list",
            expect.objectContaining({ principalId: "protected-account" }),
        );
        await expect(
            fixture.call("mcserver.commands.execute", { previewId: preview.previewId }),
        ).rejects.toThrow("already used");
        fixture.backend.dispose();
    });
    it("rejects expired previews and changed principal permissions without dispatch", async () => {
        const fixture = setup();
        const preview = await fixture.call("mcserver.commands.preview", {
            serverId: "main-owned",
            steps: [{ node: 1 }],
            dimension: null,
        });
        fixture.changePermissions();
        await expect(
            fixture.call("mcserver.commands.execute", { previewId: preview.previewId }),
        ).rejects.toThrow("changed");
        const second = await fixture.call("mcserver.commands.preview", {
            serverId: "main-owned",
            steps: [{ node: 1 }],
            dimension: null,
        });
        fixture.expire();
        await expect(
            fixture.call("mcserver.commands.execute", { previewId: second.previewId }),
        ).rejects.toThrow("expired");
        expect(fixture.dispatch).not.toHaveBeenCalled();
        fixture.backend.dispose();
    });
});
