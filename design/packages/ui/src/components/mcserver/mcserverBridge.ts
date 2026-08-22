/**
 * Typed access to the extended `mcserver` bridge namespaces the panels need.
 *
 * `serverStore.ts` and `serverModel.ts` are owned by a sibling lane, so rather than widen
 * `McServerHost` there, this reads `globalThis.worldlens.mcserver` directly and gives every
 * call the same `{ ok, value } | { ok, failure }` shape the rest of the app already relies
 * on. Every accessor is feature-detected: a shell built before a given namespace shipped
 * gets `null` back rather than a call that throws.
 */

import type { Answer } from "./serverStore.js";
import type {
    AwsInstanceTypeOption,
    AwsProvisionPlan,
    AwsProvisionResult,
    AwsRegionOption,
    AwsServerSpec,
    AwsTeardownResult,
} from "./awsProvisionModel.js";

export interface ConsoleLineEvent {
    readonly stream: "stdout" | "stderr" | "app";
    readonly text: string;
    readonly at: string;
}

export interface RconTestResult {
    readonly ok: boolean;
    readonly latencyMs: number | null;
    readonly message: string;
}

export interface PlayerRecord {
    readonly name: string;
    readonly uuid: string | null;
    readonly online: boolean;
    readonly op: boolean;
    readonly whitelisted: boolean;
    readonly banned: boolean;
}

export type PlayerActionKind = "kick" | "ban" | "pardon" | "op" | "deop" | "whitelist-add" | "whitelist-remove";

export interface PluginSearchResult {
    readonly sourceId: "modrinth" | "hangar" | "spigot";
    readonly projectId: string;
    readonly name: string;
    readonly summary: string;
    readonly iconUrl: string | null;
    readonly downloads: number | null;
    readonly installable: boolean;
    readonly incompatibleReason: string | null;
}

export interface PluginVersion {
    readonly versionId: string;
    readonly versionNumber: string;
    readonly gameVersions: readonly string[];
    readonly loaders: readonly string[];
    readonly compatible: boolean | null;
    readonly compatibilityReason: string | null;
    readonly fileName: string;
    readonly sha1: string | null;
}

export interface InstalledPlugin {
    readonly path: string;
    readonly name: string;
    readonly version: string | null;
    readonly enabled: boolean;
    readonly source: "modrinth" | "hangar" | "spigot" | "unknown";
    readonly projectId: string | null;
}

export interface AdoptionCandidate {
    readonly containerId: string;
    readonly suggestedName: string;
    readonly confidence: "high" | "medium" | "low";
    readonly evidence: readonly string[];
    readonly mounts: readonly { readonly source: string; readonly target: string }[];
    readonly ports: readonly { readonly container: number; readonly host: number | null }[];
    readonly blockers: readonly string[];
}

export interface WebConsoleStatus {
    readonly running: boolean;
    readonly host: string;
    readonly port: number | null;
    readonly loopbackOnly: boolean;
    readonly hasPassword: boolean;
}

function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}
function noHost<T = never>(): Answer<T> {
    return { ok: false, failure: { code: "no-host", message: "This build cannot reach the server host.", detail: null } };
}
function isAnswer(value: unknown): value is { ok: boolean; value?: unknown; failure?: unknown } {
    return typeof value === "object" && value !== null && "ok" in value;
}
async function call<T>(fn: (() => Promise<unknown>) | undefined): Promise<Answer<T>> {
    if (typeof fn !== "function") return noHost<T>();
    try {
        const result = await fn();
        if (isAnswer(result)) return result as Answer<T>;
        return ok(result as T);
    } catch (error) {
        return { ok: false, failure: { code: "call-failed", message: error instanceof Error ? error.message : String(error), detail: null } };
    }
}

interface RawBridge {
    readonly mcserver?: {
        rconTest?(id: string): Promise<unknown>;
        consoleOpen?(id: string, tail?: number): Promise<unknown>;
        consoleSend?(id: string, sessionId: string, command: string): Promise<unknown>;
        consoleClose?(id: string, sessionId: string): Promise<unknown>;
        onConsoleLine?(listener: (sessionId: string, event: unknown) => void): () => void;
        players?: {
            list?(id: string): Promise<unknown>;
            action?(id: string, request: { action: string; name: string; reason?: string }): Promise<unknown>;
        };
        plugins?: {
            search?(request: unknown): Promise<unknown>;
            versions?(request: unknown): Promise<unknown>;
            install?(id: string, request: unknown): Promise<unknown>;
            list?(id: string, request?: unknown): Promise<unknown>;
            toggle?(id: string, request: unknown): Promise<unknown>;
            remove?(id: string, path: string): Promise<unknown>;
            updates?(request: unknown): Promise<unknown>;
        };
        adopt?: {
            discover?(): Promise<unknown>;
            confirm?(request: unknown): Promise<unknown>;
            release?(id: string, options?: unknown): Promise<unknown>;
        };
        webConsole?: {
            status?(): Promise<unknown>;
            start?(options?: unknown): Promise<unknown>;
            stop?(): Promise<unknown>;
            setPassword?(password: string): Promise<unknown>;
            bind?(): Promise<unknown>;
        };
        aws?: {
            plan?(request: unknown): Promise<unknown>;
            provision?(request: unknown): Promise<unknown>;
            teardown?(request: unknown): Promise<unknown>;
            regions?(): Promise<unknown>;
            instanceTypes?(): Promise<unknown>;
        };
    };
}

function bridge(root: unknown = globalThis): RawBridge["mcserver"] | undefined {
    return (root as { worldlens?: RawBridge }).worldlens?.mcserver;
}

export function rconTest(id: string, root: unknown = globalThis): Promise<Answer<RconTestResult>> {
    const b = bridge(root);
    return call(b?.rconTest ? () => b.rconTest!(id) : undefined);
}

export function consoleOpen(id: string, tail: number, root: unknown = globalThis): Promise<Answer<{ sessionId: string }>> {
    const b = bridge(root);
    return call(b?.consoleOpen ? () => b.consoleOpen!(id, tail) : undefined);
}
export function consoleSend(id: string, sessionId: string, command: string, root: unknown = globalThis): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.consoleSend ? () => b.consoleSend!(id, sessionId, command) : undefined);
}
export function consoleClose(id: string, sessionId: string, root: unknown = globalThis): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.consoleClose ? () => b.consoleClose!(id, sessionId) : undefined);
}
export function onConsoleLine(
    listener: (sessionId: string, event: ConsoleLineEvent) => void,
    root: unknown = globalThis,
): () => void {
    const b = bridge(root);
    if (typeof b?.onConsoleLine !== "function") return () => {};
    return b.onConsoleLine((sessionId, event) => listener(sessionId, event as ConsoleLineEvent));
}

export function playersList(id: string, root: unknown = globalThis): Promise<Answer<readonly PlayerRecord[]>> {
    const b = bridge(root);
    return call(b?.players?.list ? () => b.players!.list!(id) : undefined);
}
export function playersAction(
    id: string,
    request: { action: PlayerActionKind; name: string; reason?: string },
    root: unknown = globalThis,
): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.players?.action ? () => b.players!.action!(id, request) : undefined);
}

export function pluginsSearch(
    request: { sourceId: "modrinth" | "hangar" | "spigot"; query: string; loader?: string; gameVersion?: string; limit?: number },
    root: unknown = globalThis,
): Promise<Answer<readonly PluginSearchResult[]>> {
    const b = bridge(root);
    return call(b?.plugins?.search ? () => b.plugins!.search!(request) : undefined);
}
export function pluginsVersions(
    request: { sourceId: "modrinth" | "hangar" | "spigot"; projectId: string; loader?: string; gameVersion?: string; serverId?: string },
    root: unknown = globalThis,
): Promise<Answer<readonly PluginVersion[]>> {
    const b = bridge(root);
    return call(b?.plugins?.versions ? () => b.plugins!.versions!(request) : undefined);
}
export function pluginsInstall(
    id: string,
    request: { version: PluginVersion; pluginsDir?: string; modsDir?: string },
    root: unknown = globalThis,
): Promise<Answer<{ path: string; sha1: string | null; verified: boolean }>> {
    const b = bridge(root);
    return call(b?.plugins?.install ? () => b.plugins!.install!(id, request) : undefined);
}
export function pluginsList(
    id: string,
    request?: { pluginsDir?: string; modsDir?: string },
    root: unknown = globalThis,
): Promise<Answer<readonly InstalledPlugin[]>> {
    const b = bridge(root);
    return call(b?.plugins?.list ? () => b.plugins!.list!(id, request) : undefined);
}
export function pluginsToggle(
    id: string,
    request: { path: string; enable: boolean },
    root: unknown = globalThis,
): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.plugins?.toggle ? () => b.plugins!.toggle!(id, request) : undefined);
}
export function pluginsRemove(id: string, path: string, root: unknown = globalThis): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.plugins?.remove ? () => b.plugins!.remove!(id, path) : undefined);
}
export function pluginsUpdates(
    request: { sourceId: "modrinth" | "hangar" | "spigot"; projectId: string; installed: string },
    root: unknown = globalThis,
): Promise<Answer<{ hasUpdate: boolean; latest: PluginVersion | null }>> {
    const b = bridge(root);
    return call(b?.plugins?.updates ? () => b.plugins!.updates!(request) : undefined);
}

export function adoptDiscover(root: unknown = globalThis): Promise<Answer<readonly AdoptionCandidate[]>> {
    const b = bridge(root);
    return call(b?.adopt?.discover ? () => b.adopt!.discover!() : undefined);
}
export function adoptConfirm(
    request: {
        id: string;
        containerId: string;
        consent?: { configWrite?: boolean; lifecycle?: boolean; pluginInstall?: boolean; consoleWrite?: boolean };
    },
    root: unknown = globalThis,
): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.adopt?.confirm ? () => b.adopt!.confirm!(request) : undefined);
}
export function adoptRelease(
    id: string,
    options?: { restoreSnapshot?: boolean },
    root: unknown = globalThis,
): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.adopt?.release ? () => b.adopt!.release!(id, options) : undefined);
}

export function webConsoleStatus(root: unknown = globalThis): Promise<Answer<WebConsoleStatus>> {
    const b = bridge(root);
    return call(b?.webConsole?.status ? () => b.webConsole!.status!() : undefined);
}
export function webConsoleStart(
    options: { host?: string; port?: number; tlsTerminated?: boolean } | undefined,
    root: unknown = globalThis,
): Promise<Answer<WebConsoleStatus>> {
    const b = bridge(root);
    return call(b?.webConsole?.start ? () => b.webConsole!.start!(options) : undefined);
}
export function webConsoleStop(root: unknown = globalThis): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.webConsole?.stop ? () => b.webConsole!.stop!() : undefined);
}
export function webConsoleSetPassword(password: string, root: unknown = globalThis): Promise<Answer<void>> {
    const b = bridge(root);
    return call(b?.webConsole?.setPassword ? () => b.webConsole!.setPassword!(password) : undefined);
}
export function webConsoleBind(root: unknown = globalThis): Promise<Answer<WebConsoleStatus>> {
    const b = bridge(root);
    return call(b?.webConsole?.bind ? () => b.webConsole!.bind!() : undefined);
}

export function awsPlan(request: AwsServerSpec, root: unknown = globalThis): Promise<Answer<AwsProvisionPlan>> {
    const b = bridge(root);
    return call(b?.aws?.plan ? () => b.aws!.plan!(request) : undefined);
}
export function awsProvision(request: AwsServerSpec, root: unknown = globalThis): Promise<Answer<AwsProvisionResult>> {
    const b = bridge(root);
    return call(b?.aws?.provision ? () => b.aws!.provision!(request) : undefined);
}
export function awsTeardown(
    target: { serverId: string; region: string; instanceId: string | null; elasticIpAllocationId: string | null; securityGroupId: string | null },
    root: unknown = globalThis,
): Promise<Answer<AwsTeardownResult>> {
    const b = bridge(root);
    return call(b?.aws?.teardown ? () => b.aws!.teardown!(target) : undefined);
}
export function awsRegions(root: unknown = globalThis): Promise<Answer<readonly AwsRegionOption[]>> {
    const b = bridge(root);
    return call(b?.aws?.regions ? () => b.aws!.regions!() : undefined);
}
export function awsInstanceTypes(root: unknown = globalThis): Promise<Answer<readonly AwsInstanceTypeOption[]>> {
    const b = bridge(root);
    return call(b?.aws?.instanceTypes ? () => b.aws!.instanceTypes!() : undefined);
}

/** True once a build's bridge advertises this whole extended surface. */
export function hasExtendedBridge(root: unknown = globalThis): boolean {
    const b = bridge(root);
    return !!(b?.consoleOpen && b?.players?.list && b?.plugins?.search && b?.adopt?.discover && b?.webConsole?.status);
}
