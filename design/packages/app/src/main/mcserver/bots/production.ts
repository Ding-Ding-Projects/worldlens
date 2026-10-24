import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { ProtectedBotAccounts, type ProtectedDevicePrompt } from "./accounts.js";
import {
    ManagedBaritoneLauncher,
    type PreparedManagedClient,
    type HiddenClientSpawn,
} from "./launcher.js";
import { loadMineflayerRuntime, type MineflayerSession } from "./mineflayer.js";
import type { CommandBotMainPorts, TrustedCommandBotTarget } from "./register.js";

export interface TrustedBotEndpoint {
    serverId: string;
    host: string;
    port: number;
    version: string;
    /** Verified server distribution digest, or an explicit unknown marker. Never inferred from version. */
    distributionSha256: string;
}
export interface ProductionBotOptions {
    userData: string;
    resolveEndpoint(serverId: string): Promise<TrustedBotEndpoint>;
    workerPath: string;
    preparedBaritone?: () => Promise<PreparedManagedClient>;
    hiddenClientSpawn?: HiddenClientSpawn;
    accountsFactory?: (prompt: (value: ProtectedDevicePrompt) => void) => ProtectedBotAccounts;
}
export interface ProductionBotPorts extends CommandBotMainPorts {
    configurePublicClient(clientId: string): Promise<void>;
    publicClientConfiguration(): Promise<{ clientId: string }>;
    devicePrompt(accountRef: string): ProtectedDevicePrompt | null;
    clearDevicePrompt(accountRef: string): void;
    baritoneAvailable: boolean;
}
/** Main-owned production services. Renderer input never supplies endpoints, launch paths or credentials. */
export async function createProductionBotPorts(
    options: ProductionBotOptions,
): Promise<ProductionBotPorts> {
    const configurationPath = join(options.userData, "bot-public-client.json");
    const prompts = new Map<string, { value: ProtectedDevicePrompt; expires: number }>();
    const accounts =
        options.accountsFactory?.(receivePrompt) ??
        new ProtectedBotAccounts(receivePrompt, options.workerPath);
    function receivePrompt(value: ProtectedDevicePrompt): void {
        if (
            !Number.isFinite(value.expiresIn) ||
            value.expiresIn <= 0 ||
            value.expiresIn > 900 ||
            !/^[A-Z0-9-]{4,32}$/i.test(value.userCode)
        )
            return;
        prompts.set(value.accountRef, { value, expires: Date.now() + value.expiresIn * 1000 });
    }
    let clientId = "";
    try {
        const raw = await readFile(configurationPath, "utf8");
        if (raw.length < 4096) {
            const stored = JSON.parse(raw) as { clientId?: unknown };
            if (
                typeof stored.clientId === "string" &&
                /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stored.clientId)
            )
                clientId = stored.clientId;
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            throw new Error("Public client configuration could not be read.");
    }
    const connections = new Map<
        string,
        { session: MineflayerSession; accountRef: string; endpoint: TrustedBotEndpoint }
    >();
    const locks = new Map<string, Promise<unknown>>();
    const ports: ProductionBotPorts = {
        protectedAccounts: accounts,
        dispose() {
            accounts.cancelAllAuthentication();
            prompts.clear();
            connections.clear();
        },
        get microsoftPublicClientId() {
            return clientId;
        },
        baritoneAvailable:
            !!options.preparedBaritone &&
            (process.platform !== "win32" || !!options.hiddenClientSpawn),
        async configurePublicClient(value) {
            if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
                throw new Error("Enter the registered Microsoft public application client ID.");
            await mkdir(options.userData, { recursive: true });
            const temporary = `${configurationPath}.${randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify({ schemaVersion: 1, clientId: value }), {
                flag: "wx",
                mode: 0o600,
            });
            await rename(temporary, configurationPath);
            clientId = value;
        },
        publicClientConfiguration: async () => ({ clientId }),
        clearDevicePrompt: (reference) => {
            prompts.delete(reference);
        },
        devicePrompt(reference) {
            const saved = prompts.get(reference);
            if (!saved || saved.expires <= Date.now()) {
                prompts.delete(reference);
                return null;
            }
            return structuredClone(saved.value);
        },
        resolveAccount: (reference) => accounts.mineflayerAccount(reference),
        mineflayerRuntime: loadMineflayerRuntime,
        bindSession(serverId, accountRef, session, target) {
            const endpoint = {
                serverId,
                host: target.host,
                port: target.port,
                version: target.target.version,
                distributionSha256: target.target.distributionSha256,
            };
            connections.set(serverId, { session, accountRef, endpoint: structuredClone(endpoint) });
        },
        async resolveTarget(serverId, accountRef) {
            const endpoint = await options.resolveEndpoint(serverId);
            if (
                endpoint.serverId !== serverId ||
                !endpoint.host ||
                /[\r\n\0\s]/u.test(endpoint.host) ||
                !Number.isInteger(endpoint.port) ||
                endpoint.port < 1 ||
                endpoint.port > 65535 ||
                !endpoint.version
            )
                throw new Error("The registered server has no valid game-protocol endpoint.");
            const selected = connections.get(serverId);
            const currentGraph = async () => {
                if (
                    !selected ||
                    connections.get(serverId) !== selected ||
                    (["serverId", "host", "port", "version", "distributionSha256"] as const).some(
                        (field) => selected.endpoint[field] !== endpoint[field],
                    )
                )
                    throw new Error(
                        "Connect a bot to this exact server before discovering commands.",
                    );
                const status = selected.session.status;
                if (!["connected", "navigating"].includes(status.state) || !status.commandGraph)
                    throw new Error("The connected principal has not supplied a command graph.");
                return status.commandGraph;
            };
            const target: TrustedCommandBotTarget = {
                host: endpoint.host,
                port: endpoint.port,
                target: {
                    serverId,
                    version: endpoint.version,
                    distributionSha256: endpoint.distributionSha256,
                    connectionEpoch: "pending",
                    principalId: accountRef ?? selected?.accountRef ?? "unconnected",
                    permissionRevision: "server-declaration",
                },
                currentGraph,
                async withCommandLock(operation) {
                    const preceding = locks.get(serverId) ?? Promise.resolve();
                    const current = preceding.catch(() => undefined).then(operation);
                    locks.set(serverId, current);
                    try {
                        return await current;
                    } finally {
                        if (locks.get(serverId) === current) locks.delete(serverId);
                    }
                },
                async dispatch(command, proof) {
                    await currentGraph();
                    selected!.session.dispatchCommand(command, proof);
                },
                authorizeAccount: (reference) => accounts.authorize(reference),
            };
            return target;
        },
        async baritoneClient() {
            if (!options.preparedBaritone || !ports.baritoneAvailable)
                throw new Error(
                    "The managed Java client and approved launch route are not prepared.",
                );
            const prepared = await options.preparedBaritone();
            return {
                installation: prepared.installation,
                launcher: new ManagedBaritoneLauncher(
                    prepared,
                    accounts,
                    options.hiddenClientSpawn,
                ),
            };
        },
    };
    return ports;
}
