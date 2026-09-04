/**
 * The seam between the Chunker route picker and whatever can actually run a conversion.
 *
 * Written to the same shape as `../project/projectHost.ts`, and for the same reasons: this
 * package runs inside the Electron shell where all four routes have channels, inside a
 * plain browser tab where none of them do, and inside vitest where a fake host makes the
 * whole picker testable with no Docker daemon, no SSH client and no network anywhere near
 * it.
 *
 * ## Nothing here is a second client
 *
 * Every route already has a bridge in this package and this file uses those rather than
 * inventing a fifth one:
 *
 * ```
 * local            ../world/bedrockBridge.ts     the Chunker jar and its status
 * docker           ../remote/remoteBridge.ts     the five real Docker states
 * github-actions   ../cirender/ciRenderBridge.ts plus the shell's own gh account list
 * ssh              ../remote/remoteBridge.ts     plus ../remote/remoteTargets.ts
 * ```
 *
 * There is no SSH client and no Docker client written here, and there must not be: the
 * main process owns both, and a second one in the renderer would be a second set of
 * refusals to keep in step with the first.
 *
 * ## A build reports what it lacks; it never hides it
 *
 * Each capability is probed on its own, so a shell that carries three of the four channels
 * offers three routes and says of the fourth exactly which channel is missing. That matters
 * more here than it does for a settings toggle: a route silently omitted from a picker
 * reads as "this app cannot convert on GitHub's runners", when the truth may be "this build
 * predates that channel", and those two send somebody to two different places.
 *
 * ## Nothing here moves a credential
 *
 * The probe reads whether an account is signed in and what it is called. It never reads a
 * token, never reads a private key, and never sends either anywhere. `remoteTargets.ts`
 * stores a path to a key file rather than a key, which is the only reason counting saved
 * machines is safe to do from the renderer at all.
 */

import { inject, provide, type InjectionKey } from "vue";
import { resolveBedrockBridge, type BedrockBridge } from "../world/bedrockBridge.js";
import {
    resolveCiRenderBridge,
    type CiRenderBridge,
} from "../cirender/ciRenderBridge.js";
import {
    resolveRemoteBridge,
    resolveRuntimeBridge,
    type RemoteBridge,
    type RuntimeBridge,
} from "../remote/remoteBridge.js";
import { loadTargets, type TargetStorage } from "../remote/remoteTargets.js";
import { unprobedFacts, type ChunkerDockerStatus, type ChunkerRouteFacts } from "./chunkerRoute.js";

/* -------------------------------------------------------------------------- */
/* The host                                                                    */
/* -------------------------------------------------------------------------- */

/** Everything the route picker asks of its environment. */
export interface ChunkerRouteHost {
    /** Named in the interface when a capability is missing, e.g. `Electron shell`. */
    readonly name: string;
    /**
     * Measures every route once and answers with facts, never with prose.
     *
     * Never rejects. A probe that threw for one route reports that route as unmeasured and
     * leaves the other three alone, because one broken channel is not evidence about the
     * others and refusing the whole picker over it would take away three working choices to
     * punish the one that is not.
     */
    probe(): Promise<ChunkerRouteFacts>;
}

/** The shell's own account list, the one fact the CI bridge does not carry on its own. */
interface GhAccountsHost {
    ghCliListAccounts?: () => Promise<unknown>;
}

/** Everything a host can be built out of, so a test can supply four fakes and no window. */
/**
 * The narrow slice of the shell's AWS surface this picker needs.
 *
 * Narrow on purpose: the picker decides which radio is offerable, so it asks two questions
 * and nothing else. Handing it the whole AWS namespace would let a later change here start
 * provisioning from a picker, which is not a thing a picker should be able to do.
 */
export interface AwsChunkerBridge {
    /** The accounts this machine's CLI profiles can reach. Empty means signed out. */
    listAccounts: () => Promise<readonly unknown[]>;
    /** What provisioning would do. `complete` means there is nothing left to create. */
    planStack: () => Promise<{ readonly complete: boolean; readonly region: string | null }>;
}

/**
 * The AWS bridge from the shell, or null when this build has no AWS surface.
 *
 * Every field is checked before it is believed. This runs against whatever the preload
 * exposed, which on an older build is a different shape than the one this file expects.
 */
export function resolveAwsChunkerBridge(bridge: unknown): AwsChunkerBridge | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const root = bridge as Record<string, unknown>;
    const accounts = root.awsAccounts;
    const server = root.mcServer;
    if (typeof accounts !== "object" || accounts === null) return null;
    const list = (accounts as Record<string, unknown>).list;
    if (typeof list !== "function") return null;

    const awsNamespace =
        typeof server === "object" && server !== null
            ? (server as Record<string, unknown>).aws
            : undefined;
    const plan =
        typeof awsNamespace === "object" && awsNamespace !== null
            ? (awsNamespace as Record<string, unknown>).plan
            : undefined;

    return {
        listAccounts: async () => {
            const result: unknown = await (list as () => Promise<unknown>)();
            return Array.isArray(result) ? (result as readonly unknown[]) : [];
        },
        planStack: async () => {
            if (typeof plan !== "function") {
                // The route exists and its readiness cannot be established. Reported as
                // not complete with no region, which fails closed to "provision first"
                // rather than offering a start that would refuse.
                return { complete: false, region: null };
            }
            const result: unknown = await (plan as (r: unknown) => Promise<unknown>)({});
            const record = typeof result === "object" && result !== null
                ? (result as Record<string, unknown>)
                : {};
            return {
                complete: record.complete === true,
                region: typeof record.region === "string" ? record.region : null,
            };
        },
    };
}

export interface ChunkerRoutePieces {
    readonly bedrock: BedrockBridge | null;
    readonly runtime: RuntimeBridge | null;
    readonly remote: RemoteBridge | null;
    readonly ci: CiRenderBridge | null;
    /** The shell root, probed for `ghCliListAccounts` only. */
    readonly shell: GhAccountsHost | null;
    /**
     * The AWS surface, when this build has one.
     *
     * Two questions, not one: whether the CLI has usable credentials, and whether the
     * render stack exists in a region. They need different answers - signing in is free
     * and provisioning is not - so collapsing them would offer the wrong action half the
     * time, and the expensive half at that.
     */
    readonly aws?: AwsChunkerBridge | null | undefined;
    /**
     * Where saved SSH machines live. `null` means "keep nothing", which is what a test
     * wants and what a browser with storage blocked genuinely has.
     */
    readonly targetStorage?: TargetStorage | null | undefined;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** Docker's own status string, accepted only when it is one of the five real states. */
function dockerStatusOf(value: unknown): ChunkerDockerStatus | null {
    switch (value) {
        case "available":
        case "daemon-unreachable":
        case "not-installed":
        case "refused":
        case "unusable":
            return value;
        default:
            return null;
    }
}

/**
 * Reads the shell's gh account list into the two facts this picker needs.
 *
 * Structural rather than typed against the preload for the same reason `bedrockBridge.ts`
 * restates its own shapes: this package is built separately and has to compile against a
 * shell that has not grown the method yet. Anything unrecognised comes back unmeasured,
 * which is the honest answer and reads differently from "signed out".
 */
async function readGhAccounts(
    shell: GhAccountsHost | null,
): Promise<{ signedIn: boolean | null; account: string | null }> {
    if (shell === null || !isFunction(shell.ghCliListAccounts)) {
        return { signedIn: null, account: null };
    }
    let answer: unknown;
    try {
        answer = await shell.ghCliListAccounts();
    } catch {
        // A probe that threw measured nothing. Saying so is different from saying the
        // person is signed out, and only one of the two would be true.
        return { signedIn: null, account: null };
    }
    if (typeof answer !== "object" || answer === null) return { signedIn: null, account: null };
    const accounts = (answer as { accounts?: unknown }).accounts;
    if (!Array.isArray(accounts)) return { signedIn: null, account: null };
    if (accounts.length === 0) return { signedIn: false, account: null };

    const active = accounts.find(
        (entry): entry is { login?: unknown; active?: unknown } =>
            typeof entry === "object" && entry !== null && (entry as { active?: unknown }).active === true,
    );
    const chosen = active ?? (accounts[0] as { login?: unknown });
    const login = typeof chosen.login === "string" ? chosen.login : null;
    return { signedIn: true, account: login };
}

/**
 * A host built from four already-probed bridges.
 *
 * Takes the pieces rather than reaching for `window` itself, so a test can hand it a build
 * missing exactly one channel and see the refusal that produces.
 */
export function chunkerRouteHostFrom(pieces: ChunkerRoutePieces): ChunkerRouteHost {
    return {
        name: "Electron shell",
        probe: async (): Promise<ChunkerRouteFacts> => {
            const base = unprobedFacts();

            /* -- local: is the Chunker jar actually on this machine? ---------- */
            let chunkerInstalled: boolean | null = null;
            if (pieces.bedrock !== null) {
                try {
                    const status = await pieces.bedrock.chunkerStatus();
                    chunkerInstalled = status.lookup.found;
                } catch {
                    // Left unmeasured on purpose. The conversion screen offers to fetch the
                    // jar when it turns out to be missing, so guessing "missing" here would
                    // only put a scary sentence in front of somebody whose install is fine.
                    chunkerInstalled = null;
                }
            }

            /* -- docker: the five states, from the main process --------------- */
            let dockerStatus: ChunkerDockerStatus | null = null;
            let dockerMessage: string | null = null;
            let dockerImage: string | null = null;
            const dockerSupported = pieces.runtime !== null && pieces.runtime.canProbeDocker;
            if (pieces.runtime !== null && dockerSupported) {
                try {
                    const summary = await pieces.runtime.dockerRuntime();
                    dockerStatus = dockerStatusOf(summary.status);
                    dockerMessage = summary.detail ?? summary.message ?? null;
                } catch {
                    dockerStatus = null;
                }
                try {
                    const modes = await pieces.runtime.runtimeModes();
                    dockerImage = modes.dockerImage === "" ? null : modes.dockerImage;
                } catch {
                    // The image is a nicety beside a working route, never a condition of it.
                    dockerImage = null;
                }
            }

            /* -- github's runners: a channel, and an account to drive it ------ */
            const ci = await readGhAccounts(pieces.shell);

            /* -- amazon: credentials, then whether the stack exists ----------- */
            const awsBridge = pieces.aws ?? null;
            let awsSignedIn: boolean | null = null;
            let awsProvisioned: boolean | null = null;
            let awsRegion: string | null = null;
            if (awsBridge !== null) {
                try {
                    const accounts = await awsBridge.listAccounts();
                    awsSignedIn = accounts.length > 0;
                } catch {
                    // Could not ask. Null, not false: "no credentials" and "the question
                    // could not be put" deserve different answers, and only one of them is
                    // fixed by signing in.
                    awsSignedIn = null;
                }
                if (awsSignedIn === true) {
                    try {
                        const plan = await awsBridge.planStack();
                        awsProvisioned = plan.complete;
                        awsRegion = plan.region;
                    } catch {
                        awsProvisioned = null;
                    }
                }
            }

            /* -- ssh: a channel, and at least one machine set up -------------- */
            let hosts: number | null = null;
            if (pieces.remote !== null) {
                try {
                    hosts = loadTargets(
                        pieces.targetStorage === undefined ? undefined : pieces.targetStorage,
                    ).length;
                } catch {
                    hosts = null;
                }
            }

            return {
                local: {
                    supported: pieces.bedrock !== null,
                    chunkerInstalled,
                },
                docker: {
                    supported: dockerSupported,
                    status: dockerStatus,
                    message: dockerMessage,
                    image: dockerImage,
                },
                githubActions: {
                    supported: pieces.ci !== null,
                    signedIn: pieces.ci === null ? base.githubActions.signedIn : ci.signedIn,
                    account: pieces.ci === null ? null : ci.account,
                },
                ssh: {
                    supported: pieces.remote !== null,
                    hosts: pieces.remote === null ? null : hosts,
                },
                aws: {
                    supported: awsBridge !== null,
                    signedIn: awsSignedIn,
                    provisioned: awsProvisioned,
                    region: awsRegion,
                },
            };
        },
    };
}

/**
 * A host from the shell's bridge, or null when this build has no route at all.
 *
 * Null only when every one of the four channels is missing, which is what a plain browser
 * tab looks like. A build carrying any one of them gets a host, so the picker can show the
 * one that works and name the three that do not.
 */
export function chunkerRouteHostFromBridge(bridge: unknown): ChunkerRouteHost | null {
    const shell =
        typeof bridge === "object" && bridge !== null ? (bridge as GhAccountsHost) : null;
    const pieces: ChunkerRoutePieces = {
        bedrock: resolveBedrockBridge(),
        runtime: resolveRuntimeBridge(),
        remote: resolveRemoteBridge(),
        ci: resolveCiRenderBridge(),
        shell,
        aws: resolveAwsChunkerBridge(bridge),
    };
    if (
        pieces.bedrock === null &&
        pieces.runtime === null &&
        pieces.remote === null &&
        pieces.ci === null
    ) {
        return null;
    }
    return chunkerRouteHostFrom(pieces);
}

const CHUNKER_ROUTE_HOST = Symbol("worldlens-chunker-route-host") as InjectionKey<
    ChunkerRouteHost | null
>;

/** Puts a host in reach of every Chunker surface below this component. */
export function provideChunkerRouteHost(host: ChunkerRouteHost | null): void {
    provide(CHUNKER_ROUTE_HOST, host);
}

/** The host, or null when nothing is wired up. Falls back to the window bridge. */
export function useChunkerRouteHost(): ChunkerRouteHost | null {
    const provided = inject(CHUNKER_ROUTE_HOST, undefined);
    if (provided !== undefined) return provided;
    return resolveChunkerRouteHost();
}

/** The bridge on `window`, probed. Exported for surfaces that resolve their own. */
export function resolveChunkerRouteHost(): ChunkerRouteHost | null {
    return chunkerRouteHostFromBridge(
        typeof globalThis === "undefined"
            ? null
            : (globalThis as { worldlens?: unknown }).worldlens,
    );
}

/** One sentence explaining what cannot be done and why, for a surface with no host. */
export function routeHostMissingReason(): string {
    return (
        "Converting a world runs a real program over real files, so every one of the four " +
        "places it can run needs the desktop app. This page is running in a browser tab, " +
        "which has none of them."
    );
}
