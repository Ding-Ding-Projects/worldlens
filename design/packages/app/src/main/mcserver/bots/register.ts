import type { ProtectedBotAccounts } from "./accounts.js";
import { randomUUID } from "node:crypto";
import {
    dispatchPreview,
    previewCommand,
    type CommandGraph,
    type CommandPreview,
    type CommandStep,
    type CommandTarget,
    type PointOperand,
} from "../commands/index.js";
import {
    BaritoneSession,
    type BaritoneInstallation,
    type ProtectedClientLauncher,
} from "./baritone.js";
import {
    MineflayerSession,
    loadMineflayerRuntime,
    type BotProfile,
    type BotStatus,
    type MineflayerRuntime,
    type ProtectedAccount,
} from "./mineflayer.js";
import { describeBotProfiles, type BotCapability } from "./profiles.js";
export interface CommandPreviewResult {
    previewId: string;
    command: string;
    graphRevision: string;
    dimension: string | null;
    expiresAt: string;
}
export interface CommandBotRequests {
    "mcserver.bots.accounts.create": { label: string };
    "mcserver.bots.accounts.signIn": { accountRef: string };
    "mcserver.bots.accounts.cancel": { accountRef: string };
    "mcserver.commands.discover": { serverId: string };
    "mcserver.commands.preview": {
        serverId: string;
        steps: CommandStep[];
        dimension: string | null;
    };
    "mcserver.commands.execute": { previewId: string };
    "mcserver.bots.profiles": { serverId: string };
    "mcserver.bots.deploy": {
        serverId: string;
        engine: "mineflayer" | "baritone";
        accountRef: string;
        navigation: boolean;
    };
    "mcserver.bots.status": { botId: string };
    "mcserver.bots.navigate": { botId: string; point: PointOperand };
    "mcserver.bots.cancel": { botId: string };
    "mcserver.bots.stop": { botId: string };
    "mcserver.bots.reconnect": { botId: string };
}
export interface CommandBotResults {
    "mcserver.bots.accounts.create": { accountRef: string; label: string };
    "mcserver.bots.accounts.signIn": { accountRef: string; state: "verified"; profileName: string };
    "mcserver.bots.accounts.cancel": { cancelled: true };
    "mcserver.commands.discover": CommandGraph;
    "mcserver.commands.preview": CommandPreviewResult;
    "mcserver.commands.execute": { executed: true };
    "mcserver.bots.profiles": BotCapability[];
    "mcserver.bots.deploy": BotStatus;
    "mcserver.bots.status": BotStatus;
    "mcserver.bots.navigate": BotStatus;
    "mcserver.bots.cancel": BotStatus;
    "mcserver.bots.stop": BotStatus;
    "mcserver.bots.reconnect": BotStatus;
}
export type CommandBotRegistrar = <K extends keyof CommandBotRequests>(
    method: K,
    handler: (request: CommandBotRequests[K]) => Promise<CommandBotResults[K]>,
) => void;
export interface TrustedCommandBotTarget {
    target: CommandTarget;
    host: string;
    port: number;
    currentGraph(): Promise<CommandGraph>;
    /** Hold the exact target/principal connection across discovery, revalidation and dispatch. */
    withCommandLock<T>(operation: () => Promise<T>): Promise<T>;
    dispatch(command: string, target: CommandTarget): Promise<void>;
    authorizeAccount(reference: string): Promise<void>;
}
export interface CommandBotMainPorts {
    dispose?(): void;
    protectedAccounts?: ProtectedBotAccounts;
    microsoftPublicClientId?: string;
    resolveTarget(serverId: string, accountRef?: string): Promise<TrustedCommandBotTarget>;
    bindSession?(
        serverId: string,
        accountRef: string,
        session: MineflayerSession,
        target: TrustedCommandBotTarget,
    ): void;
    resolveAccount(reference: string): Promise<ProtectedAccount>;
    mineflayerRuntime?(navigation: boolean): MineflayerRuntime;
    baritoneClient(
        serverId: string,
        accountRef: string,
    ): Promise<{ installation: BaritoneInstallation; launcher: ProtectedClientLauncher }>;
    onBotStatus?(status: BotStatus): void;
    now?(): number;
}
function id(value: unknown): string {
    if (typeof value !== "string" || !value.length || value.length > 256 || /[\r\n\0]/.test(value))
        throw new Error("Invalid operation identifier.");
    return value;
}
type Session = MineflayerSession | BaritoneSession;
/** Main-owned registry. No renderer-supplied executable, target proof, account value or command string is trusted. */
export function registerCommandBotOperations(
    register: CommandBotRegistrar,
    ports: CommandBotMainPorts,
): { dispose(): void } {
    const bots = new Map<
        string,
        {
            session: Session;
            unsubscribe: () => void;
            request: CommandBotRequests["mcserver.bots.deploy"];
        }
    >();
    const previews = new Map<
        string,
        { serverId: string; preview: CommandPreview; expiresAt: number }
    >();
    const now = ports.now ?? Date.now;
    let disposed = false;
    const resolveTarget = async (serverId: string): Promise<TrustedCommandBotTarget> => {
        if (disposed) throw new Error("Backend is closed.");
        return ports.resolveTarget(id(serverId));
    };
    const bot = (botId: string): Session => {
        if (disposed) throw new Error("Backend is closed.");
        const entry = bots.get(id(botId));
        if (!entry) throw new Error("Owned bot session not found.");
        return entry.session;
    };
    register("mcserver.bots.accounts.create", async (request) => {
        if (disposed || !ports.protectedAccounts || !ports.microsoftPublicClientId)
            throw new Error("Protected account setup is unavailable.");
        return ports.protectedAccounts.createMicrosoftAccount(
            id(request.label),
            ports.microsoftPublicClientId,
        );
    });
    register("mcserver.bots.accounts.signIn", async (request) => {
        if (disposed || !ports.protectedAccounts)
            throw new Error("Protected account setup is unavailable.");
        const reference = id(request.accountRef),
            session = await ports.protectedAccounts.authenticate(reference);
        return { accountRef: reference, state: "verified", profileName: session.profile.name };
    });
    register("mcserver.bots.accounts.cancel", async (request) => {
        if (disposed || !ports.protectedAccounts)
            throw new Error("Protected account setup is unavailable.");
        ports.protectedAccounts.cancelAuthentication(id(request.accountRef));
        return { cancelled: true };
    });
    register("mcserver.commands.discover", async (request) => {
        const target = await resolveTarget(request.serverId);
        return target.withCommandLock(() => target.currentGraph());
    });
    register("mcserver.commands.preview", async (request) => {
        const target = await resolveTarget(request.serverId);
        if (
            !Array.isArray(request.steps) ||
            request.steps.length > 256 ||
            (request.dimension !== null && typeof request.dimension !== "string")
        )
            throw new Error("Invalid preview arguments.");
        for (const [key, saved] of previews) if (saved.expiresAt <= now()) previews.delete(key);
        if (previews.size >= 128) throw new Error("Too many outstanding command previews.");
        const preview = await target.withCommandLock(async () =>
            previewCommand(await target.currentGraph(), request.steps, request.dimension),
        );
        const previewId = randomUUID(),
            expiresAt = now() + 60_000;
        previews.set(previewId, { serverId: request.serverId, preview, expiresAt });
        return {
            previewId,
            command: preview.command,
            graphRevision: preview.graphRevision,
            dimension: preview.dimension,
            expiresAt: new Date(expiresAt).toISOString(),
        };
    });
    register("mcserver.commands.execute", async (request) => {
        const previewId = id(request.previewId),
            saved = previews.get(previewId);
        previews.delete(previewId);
        if (!saved || saved.expiresAt <= now())
            throw new Error("Command preview expired or was already used.");
        const target = await resolveTarget(saved.serverId);
        await target.withCommandLock(() =>
            dispatchPreview(
                saved.preview,
                () => target.currentGraph(),
                (command, proof) => target.dispatch(command, proof),
            ),
        );
        return { executed: true };
    });
    register("mcserver.bots.profiles", async (request) => {
        const target = await resolveTarget(request.serverId);
        let versions: readonly string[] = [];
        try {
            versions = (ports.mineflayerRuntime?.(false) ?? loadMineflayerRuntime(false))
                .supportedVersions;
        } catch {
            /* Availability remains false when the runtime cannot be loaded. */
        }
        return describeBotProfiles(target.target.version, versions);
    });
    const deploy = async (
        request: CommandBotRequests["mcserver.bots.deploy"],
    ): Promise<BotStatus> => {
        if (disposed) throw new Error("Backend is closed.");
        if (
            !["mineflayer", "baritone"].includes(request.engine) ||
            typeof request.navigation !== "boolean"
        )
            throw new Error("Invalid bot profile.");
        if (
            [...bots.values()].filter(
                (entry) => !["stopped", "failed"].includes(entry.session.status.state),
            ).length >= 16
        )
            throw new Error("Owned bot capacity reached.");
        const accountRef = id(request.accountRef);
        const target = await ports.resolveTarget(id(request.serverId), accountRef);
        await target.authorizeAccount(accountRef);
        const profile: BotProfile = {
            id: randomUUID(),
            engine: request.engine,
            target: structuredClone(target.target),
            host: target.host,
            port: target.port,
            accountRef,
            navigation: request.navigation,
        };
        let session: Session;
        if (request.engine === "mineflayer")
            session = new MineflayerSession(
                profile,
                ports.mineflayerRuntime?.(request.navigation) ??
                    loadMineflayerRuntime(request.navigation),
            );
        else {
            const client = await ports.baritoneClient(request.serverId, accountRef);
            session = new BaritoneSession(profile, client.installation, client.launcher);
        }
        if (disposed) throw new Error("Backend is closed.");
        const unsubscribe = session.onStatus((status) => ports.onBotStatus?.(status));
        bots.set(profile.id, { session, unsubscribe, request: structuredClone(request) });
        if (session instanceof MineflayerSession) {
            ports.bindSession?.(request.serverId, accountRef, session, target);
            await session.start((reference) => ports.resolveAccount(reference));
        } else await session.start();
        return session.status;
    };
    register("mcserver.bots.deploy", deploy);
    register("mcserver.bots.reconnect", async (request) => {
        const entry = bots.get(id(request.botId));
        if (!entry) throw new Error("Owned bot session not found.");
        entry.session.stop();
        if (!["stopped", "failed"].includes(entry.session.status.state)) {
            await new Promise<void>((resolveStop, reject) => {
                const timer = setTimeout(() => {
                    unsubscribe();
                    reject(
                        new Error(
                            "Client has not finished disconnecting. Reconnect remains pending.",
                        ),
                    );
                }, 5000);
                const unsubscribe = entry.session.onStatus((status) => {
                    if (["stopped", "failed"].includes(status.state)) {
                        clearTimeout(timer);
                        unsubscribe();
                        resolveStop();
                    }
                });
            });
        }
        return deploy(entry.request);
    });
    register("mcserver.bots.status", async (request) => bot(request.botId).status);
    register("mcserver.bots.navigate", async (request) => {
        const session = bot(request.botId);
        await session.navigate(request.point);
        return session.status;
    });
    register("mcserver.bots.cancel", async (request) => {
        const session = bot(request.botId);
        session.cancelNavigation();
        return session.status;
    });
    register("mcserver.bots.stop", async (request) => {
        const session = bot(request.botId);
        session.stop();
        return session.status;
    });
    return {
        dispose: () => {
            disposed = true;
            previews.clear();
            for (const entry of bots.values()) {
                entry.session.stop();
                entry.unsubscribe();
            }
            bots.clear();
            ports.dispose?.();
        },
    };
}
