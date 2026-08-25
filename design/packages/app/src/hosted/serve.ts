import { BRIDGE_CHANNELS } from "@worldlens/bridge";
import {
    BridgeEventHandler,
    BridgeInvokeHandler,
    HostedAuthGate,
    HostedSession,
    HostedSessionHandler,
    HttpServer,
    StaticHandler,
    refuseUnsafeExposure,
} from "@worldlens/server";
import { channelPolicy } from "./capabilityProfile.js";
import { HostedIpcMain } from "./ipcMainLike.js";
import { MountRoots, type MountRoot } from "./mountRoots.js";

/**
 * The whole hosted deployment, assembled.
 *
 * Reading this file top to bottom is the fastest way to understand what a hosted WorldLens
 * actually is: the same renderer bundle the desktop serves, in front of the same feature
 * modules the desktop registers, reached over HTTP instead of Electron IPC, with two things
 * added that a desktop does not need - a password, and a boundary around the filesystem.
 *
 * ## Handler order is load-bearing
 *
 * The chain is tried in the order handlers are added, so:
 *
 *  1. the auth gate, so nothing below it can be reached before signing in;
 *  2. the sign-in route, which the gate deliberately lets past;
 *  3. the bridge, which claims `/bridge/*` outright and answers its own mistakes rather than
 *     falling through to a 404 that would read as "the bridge is not deployed";
 *  4. the static bundle last, because it is the catch-all that serves `index.html` for any
 *     path it does not recognise.
 *
 * Putting the static handler earlier would let it answer `/bridge/invoke` with the index page,
 * and the failure would look like the bridge returning HTML.
 */
export interface HostedServerOptions {
    /** Where the built renderer bundle lives. */
    readonly uiRoot: string;
    /** The folders this deployment may read and write. */
    readonly mountRoots: readonly MountRoot[];
    /** SHA-256 of the password, or `null` for a deployment with none. */
    readonly passwordHash: string | null;
    readonly host: string;
    readonly port: number;
    /** Set when a proxy terminates TLS, so the session cookie may be marked `Secure`. */
    readonly secureCookies?: boolean;
    /**
     * The operator said, in as many words, that this network needs no password.
     *
     * Deliberately awkward to set, and named for what it does rather than for what it enables.
     */
    readonly acknowledgedInsecure?: boolean;
    /** Grants that reach beyond the container. Everything not listed stays refused. */
    readonly capabilities?: readonly ("docker-socket" | "ssh" | "github")[];
    /** Registers the feature modules. Injected so the assembly can be tested without them. */
    readonly register?: (context: HostedContext) => void;
}

/** What a feature module is given instead of Electron's services. */
export interface HostedContext {
    readonly ipcMain: HostedIpcMain;
    readonly mounts: MountRoots;
}

export interface HostedServer {
    readonly url: string;
    close: () => Promise<void>;
}

/**
 * Raised before anything listens, when the configuration would expose more than intended.
 *
 * Thrown rather than logged: a deployment that warns and starts anyway has started anyway,
 * and the warning scrolls off in a container's log within seconds.
 */
export class UnsafeExposureError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UnsafeExposureError";
    }
}

export async function startHostedServer(options: HostedServerOptions): Promise<HostedServer> {
    const refusal = refuseUnsafeExposure({
        host: options.host,
        hasPassword: options.passwordHash !== null,
        acknowledgedInsecure: options.acknowledgedInsecure ?? false,
    });
    if (refusal !== null) throw new UnsafeExposureError(refusal);

    const ipcMain = new HostedIpcMain();
    const mounts = new MountRoots(options.mountRoots);
    options.register?.({ ipcMain, mounts });

    const granted = new Set(options.capabilities ?? []);
    const reachable = new Set<string>(BRIDGE_CHANNELS);
    const session = new HostedSession({ passwordHash: options.passwordHash });

    const events = new BridgeEventHandler({
        subscribe: (listener) => ipcMain.onBroadcast(listener),
    });
    events.start();

    const server = new HttpServer({ host: options.host, port: options.port });
    server.addHandler(new HostedAuthGate(session));
    server.addHandler(new HostedSessionHandler(session, options.secureCookies ?? false));
    server.addHandler(events);
    server.addHandler(
        new BridgeInvokeHandler({
            dispatch: async (channel, args) => await ipcMain.invoke(channel, args),
            permit: (channel) => {
                // The inventory is checked before the policy, and it is checked here rather
                // than only in tests. A prefix is a decision about a family of channels, so
                // `app:` being available would otherwise permit `app:anything-at-all`. Only
                // the channels the bridge actually reaches have been reviewed, so only those
                // are answered; anything else has by definition not been looked at.
                if (!reachable.has(channel))
                    return {
                        allowed: false,
                        reason: `"${channel}" is not part of this application's bridge, so nothing here answers it.`,
                    };
                const policy = channelPolicy(channel);
                if (policy.kind === "available") return { allowed: true };
                if (policy.kind === "refused")
                    return policy.instead === undefined
                        ? { allowed: false, reason: policy.reason }
                        : { allowed: false, reason: policy.reason, instead: policy.instead };
                // An opt-in channel the operator did not grant is refused with the grant
                // named, so the answer is actionable rather than merely negative.
                if (granted.has(policy.capability)) return { allowed: true };
                return {
                    allowed: false,
                    reason: policy.reason,
                    instead: `Start this deployment with the "${policy.capability}" capability if that is what you want.`,
                };
            },
        }),
    );
    server.addHandler(new StaticHandler(options.uiRoot));

    const address = await server.listen();
    return {
        url: `http://${options.host}:${String(address.port)}`,
        close: async () => {
            events.close();
            await server.close();
        },
    };
}
