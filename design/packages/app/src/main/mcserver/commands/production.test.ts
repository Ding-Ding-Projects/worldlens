import { test, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionBotPorts } from "../bots/production.js";
import type { ProtectedBotAccounts } from "../bots/accounts.js";
import type { MineflayerSession } from "../bots/mineflayer.js";

const endpoint = {
    serverId: "test",
    host: "localhost",
    port: 25565,
    version: "1.21.4",
    distributionSha256: "unknown",
};
const accounts = {
    authorize: vi.fn(async () => undefined),
    mineflayerAccount: vi.fn(),
} as unknown as ProtectedBotAccounts;

test("public client configuration validates and persists without an account payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "worldlens-bot-"));
    try {
        const options = {
            userData: directory,
            workerPath: "unused",
            resolveEndpoint: async () => endpoint,
            accountsFactory: () => accounts,
        };
        const ports = await createProductionBotPorts(options);
        await expect(ports.configurePublicClient("not-a-client-id")).rejects.toThrow();
        const clientId = "12345678-1234-1234-1234-123456789abc";
        await ports.configurePublicClient(clientId);
        expect((await createProductionBotPorts(options)).microsoftPublicClientId).toBe(clientId);
        expect(await ports.publicClientConfiguration()).toEqual({ clientId });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("commands bind to the connected principal and reject changed sessions or endpoints", async () => {
    const directory = await mkdtemp(join(tmpdir(), "worldlens-bot-"));
    try {
        let currentEndpoint = endpoint;
        const ports = await createProductionBotPorts({
            userData: directory,
            workerPath: "unused",
            resolveEndpoint: async () => currentEndpoint,
            accountsFactory: () => accounts,
        });
        const initial = await ports.resolveTarget("test", "account-a");
        await expect(initial.currentGraph()).rejects.toThrow();
        expect(initial.target.principalId).toBe("account-a");
        const graph = {
            target: { ...initial.target, connectionEpoch: "real-connection" },
            revision: "graph",
        };
        const dispatchCommand = vi.fn();
        const session = {
            status: { state: "connected", commandGraph: graph },
            dispatchCommand,
        } as unknown as MineflayerSession;
        ports.bindSession!("test", "account-a", session, initial);
        const connected = await ports.resolveTarget("test");
        expect(await connected.currentGraph()).toEqual(graph);
        await connected.dispatch("say test", graph.target);
        expect(dispatchCommand).toHaveBeenCalledWith("say test", graph.target);
        ports.bindSession!("test", "account-b", session, initial);
        await expect(connected.dispatch("say test", graph.target)).rejects.toThrow();
        currentEndpoint = { ...endpoint, port: 25566 };
        await expect((await ports.resolveTarget("test")).currentGraph()).rejects.toThrow();
        await expect(ports.resolveTarget("another-server")).rejects.toThrow();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("device prompts expire, clear, and reject malformed challenge data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "worldlens-bot-"));
    try {
        let receive!: (prompt: import("../bots/accounts.js").ProtectedDevicePrompt) => void;
        const ports = await createProductionBotPorts({
            userData: directory,
            workerPath: "unused",
            resolveEndpoint: async () => endpoint,
            accountsFactory: (callback) => {
                receive = callback;
                return accounts;
            },
        });
        receive({
            accountRef: "a",
            verificationUri: "https://microsoft.com/link",
            userCode: "ABCD1234",
            expiresIn: 900,
        });
        expect(ports.devicePrompt("a")?.userCode).toBe("ABCD1234");
        ports.clearDevicePrompt("a");
        expect(ports.devicePrompt("a")).toBeNull();
        receive({
            accountRef: "a",
            verificationUri: "https://microsoft.com/link",
            userCode: "ABCD1234",
            expiresIn: 901,
        });
        expect(ports.devicePrompt("a")).toBeNull();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
