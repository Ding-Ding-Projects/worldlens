/**
 * Read-only discovery of Minecraft servers already running as plain Docker containers.
 *
 * `dockerhosting/manager.ts` carries a promise in its own header: "Unlabelled containers
 * are never managed." That sentence stays literally true because this module never writes
 * anything and never asks Docker to mutate anything either - it runs `docker ps`,
 * `docker inspect` and `docker logs --tail`, three read-only verbs, and turns what comes
 * back into a scored guess a human still has to confirm through `record.ts`.
 *
 * Nothing here is a single signal. A container can be named `minecraft` and run nothing
 * of the sort, and a container that mounts `server.properties` almost certainly is one
 * even if its image tag says nothing. `AdoptionCandidate.evidence` lists every signal that
 * fired so the confirmation screen can show its work instead of asking for blind trust.
 *
 * What this module will never do, on purpose: run `java -jar ... --version` (that starts
 * a second server against the same world - the exact kind of "helpful" probe that corrupts
 * a save), or stop, start, restart, pause or remove anything to get a better look at it.
 */

import type { CommandRunner } from "../../runtime/command.js";
import { DOCKER_HOSTING_LABEL, DOCKER_HOSTING_OWNER_LABEL } from "../../dockerhosting/manager.js";
import { fail, ok, type Answer } from "../transport/types.js";

/**
 * `dockerhosting/manager.ts` derives its own owner value per installation (a hash of its
 * record file path) - it is not the label *key* above, which is what we compare a
 * container's owner label against. When no owner value is supplied, nothing this
 * installation ever created can match, which is the safe default: every already-labelled
 * container reads as owned by "someone else" unless the caller proves otherwise.
 */
const NO_OWNER = " no-owner-configured";

export type DetectedFlavour =
    | "vanilla"
    | "paper"
    | "spigot"
    | "bukkit"
    | "purpur"
    | "fabric"
    | "forge"
    | "neoforge"
    | "unknown";

export type Confidence = "high" | "medium" | "low";

export interface Detected {
    readonly flavour: DetectedFlavour;
    readonly minecraftVersion: string | null;
    readonly serverDir: string | null;
    readonly confidence: Confidence;
}

export interface AdoptionCandidate {
    readonly containerId: string;
    readonly containerName: string;
    readonly image: string;
    readonly imageDigest: string | null;
    /** Docker's own `Created` timestamp for this container. Part of the fingerprint
     *  `record.ts` stores, alongside `containerId`, `imageDigest` and the mount sources. */
    readonly createdAt: string | null;
    readonly state: string;
    readonly ports: readonly number[];
    readonly mounts: readonly { readonly source: string; readonly destination: string }[];
    readonly detected: Detected;
    /** Every signal that contributed to `detected`, in the order it was checked. */
    readonly evidence: readonly string[];
    /** Set when this container already carries this app's own management label. */
    readonly existingOwner: string | null;
    /** Reasons `refuse.ts` would give for not adopting this one, computed here so the
     *  discovery screen can show them before the user even tries. Empty means clean. */
    readonly blockers: readonly string[];
}

export interface DiscoverOptions {
    readonly runner: CommandRunner;
    readonly docker?: string;
    readonly logTailLines?: number;
    /** This installation's own `DOCKER_HOSTING_OWNER_LABEL` value, so a container this app
     *  already created (through `dockerhosting/manager.ts`) is recognised as such rather
     *  than reported as owned by a stranger. */
    readonly ownerValue?: string;
}

interface DockerPsRow {
    readonly ID?: unknown;
    readonly Names?: unknown;
    readonly Image?: unknown;
    readonly State?: unknown;
    readonly Labels?: unknown;
}

interface DockerInspectMount {
    readonly Source?: unknown;
    readonly Destination?: unknown;
}

interface DockerInspectPort {
    readonly HostPort?: unknown;
}

interface DockerInspectRow {
    readonly Id?: unknown;
    readonly Name?: unknown;
    readonly Image?: unknown;
    readonly Created?: unknown;
    readonly State?: { readonly Status?: unknown };
    readonly Config?: {
        readonly Image?: unknown;
        readonly Env?: unknown;
        readonly Cmd?: unknown;
        readonly Labels?: unknown;
    };
    readonly Mounts?: readonly DockerInspectMount[];
    readonly NetworkSettings?: { readonly Ports?: Record<string, readonly DockerInspectPort[] | null> };
    readonly HostConfig?: {
        readonly Privileged?: unknown;
        readonly PidMode?: unknown;
        readonly NetworkMode?: unknown;
        readonly Binds?: readonly unknown[];
    };
}

const KNOWN_IMAGE_FLAVOURS: readonly { readonly needle: string; readonly flavour: DetectedFlavour }[] = [
    { needle: "itzg/minecraft-server", flavour: "unknown" },
    { needle: "paper", flavour: "paper" },
    { needle: "purpur", flavour: "purpur" },
    { needle: "spigot", flavour: "spigot" },
    { needle: "bukkit", flavour: "bukkit" },
    { needle: "fabric", flavour: "fabric" },
    { needle: "neoforge", flavour: "neoforge" },
    { needle: "forge", flavour: "forge" },
    { needle: "vanilla", flavour: "vanilla" },
    { needle: "minecraft", flavour: "unknown" },
];

const LOG_SIGNATURES: readonly { readonly pattern: RegExp; readonly flavour: DetectedFlavour | null }[] = [
    { pattern: /this server is running paper/i, flavour: "paper" },
    { pattern: /this server is running purpur/i, flavour: "purpur" },
    { pattern: /this server is running spigot/i, flavour: "spigot" },
    { pattern: /fabricloader/i, flavour: "fabric" },
    { pattern: /forge mod loader|minecraftforge/i, flavour: "forge" },
    { pattern: /starting minecraft server version/i, flavour: null },
    { pattern: /preparing level/i, flavour: null },
];

function parseJsonLines(stdout: string): DockerPsRow[] {
    const rows: DockerPsRow[] = [];
    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
            const value: unknown = JSON.parse(trimmed);
            if (typeof value === "object" && value !== null) rows.push(value as DockerPsRow);
        } catch {
            // A stray warning line on stdout is not a container. Skip it, invent nothing.
        }
    }
    return rows;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function envMap(env: unknown): Record<string, string> {
    const map: Record<string, string> = {};
    if (!Array.isArray(env)) return map;
    for (const entry of env) {
        if (typeof entry !== "string") continue;
        const index = entry.indexOf("=");
        if (index <= 0) continue;
        map[entry.slice(0, index)] = entry.slice(index + 1);
    }
    return map;
}

function detectFromImage(image: string): { flavour: DetectedFlavour; evidence: string | null } {
    const lower = image.toLowerCase();
    for (const { needle, flavour } of KNOWN_IMAGE_FLAVOURS) {
        if (lower.includes(needle)) {
            return { flavour, evidence: `image name mentions "${needle}"` };
        }
    }
    return { flavour: "unknown", evidence: null };
}

/**
 * Scores one inspected container into an `AdoptionCandidate`.
 *
 * Exported separately from `discoverAdoptionCandidates` so a test can hand it a fixed
 * `docker inspect` payload without touching a `CommandRunner` at all.
 */
export function scoreCandidate(
    inspected: DockerInspectRow,
    logTail: string,
    ownerValue: string,
): AdoptionCandidate {
    const evidence: string[] = [];
    let flavour: DetectedFlavour = "unknown";
    let confidence: Confidence = "low";

    const containerId = asString(inspected.Id) ?? "";
    const containerName = (asString(inspected.Name) ?? "").replace(/^\//, "");
    const image = asString(inspected.Config?.Image) ?? asString(inspected.Image) ?? "";
    const state = asString(inspected.State?.Status) ?? "unknown";
    const createdAt = asString(inspected.Created);
    const imageIdMatch = /sha256:[a-f0-9]{64}/.exec(asString(inspected.Image) ?? "");

    // Signal 1: image name.
    const fromImage = detectFromImage(image);
    if (fromImage.evidence !== null) {
        evidence.push(fromImage.evidence);
        flavour = fromImage.flavour;
    }

    // Signal 2: image env (TYPE=, VERSION=, EULA=).
    const env = envMap(inspected.Config?.Env);
    let minecraftVersion: string | null = null;
    if (typeof env.TYPE === "string" && env.TYPE.trim() !== "") {
        evidence.push(`image env TYPE=${env.TYPE}`);
        const byType = env.TYPE.toLowerCase();
        if (byType === "paper" || byType === "purpur" || byType === "spigot" || byType === "fabric" || byType === "forge" || byType === "vanilla") {
            flavour = byType as DetectedFlavour;
        }
    }
    if (typeof env.VERSION === "string" && env.VERSION.trim() !== "") {
        evidence.push(`image env VERSION=${env.VERSION}`);
        minecraftVersion = env.VERSION;
    }
    if (typeof env.EULA === "string") {
        evidence.push(`image env EULA=${env.EULA}`);
    }

    // Signal 3: port 25565.
    const ports: number[] = [];
    const portMap = inspected.NetworkSettings?.Ports ?? {};
    for (const [containerPort, bindings] of Object.entries(portMap)) {
        if (containerPort.startsWith("25565")) evidence.push("container publishes port 25565");
        for (const binding of bindings ?? []) {
            const hostPort = asString(binding.HostPort);
            if (hostPort !== null) {
                const parsed = Number.parseInt(hostPort, 10);
                if (Number.isInteger(parsed)) ports.push(parsed);
            }
        }
    }
    const has25565 = evidence.some((line) => line.includes("25565"));

    // Signal 4: mount layout containing server.properties or level.dat.
    const mounts = (inspected.Mounts ?? [])
        .map((mount) => ({ source: asString(mount.Source) ?? "", destination: asString(mount.Destination) ?? "" }))
        .filter((mount) => mount.source !== "" && mount.destination !== "");
    let serverDir: string | null = null;
    let hasFilesystemEvidence = false;
    for (const mount of mounts) {
        const lowerDest = mount.destination.toLowerCase();
        if (lowerDest.includes("data") || lowerDest === "/server" || lowerDest.includes("minecraft")) {
            serverDir = mount.source;
        }
    }
    // `docker inspect` cannot read inside the mounted directory - that would be a
    // filesystem read outside anything Docker owns. The mount *shape* is the only
    // filesystem-adjacent signal available without touching the host path directly.
    if (mounts.some((mount) => mount.destination === "/data" || mount.destination === "/server")) {
        evidence.push("mount layout matches a known server-data mount point");
        hasFilesystemEvidence = true;
        serverDir = serverDir ?? mounts[0]?.source ?? null;
    }

    // Signal 5: log signature.
    let hasLogEvidence = false;
    for (const { pattern, flavour: logFlavour } of LOG_SIGNATURES) {
        if (pattern.test(logTail)) {
            evidence.push(`log line matches "${pattern.source}"`);
            hasLogEvidence = true;
            if (logFlavour !== null) flavour = logFlavour;
        }
    }
    const versionMatch = /starting minecraft server version ([\w.-]+)/i.exec(logTail);
    if (versionMatch?.[1] !== undefined) {
        evidence.push(`log reports version ${versionMatch[1]}`);
        minecraftVersion = minecraftVersion ?? versionMatch[1];
    }

    // Signal 6: inspected command line.
    const cmd = Array.isArray(inspected.Config?.Cmd) ? inspected.Config?.Cmd.join(" ") : "";
    if (typeof cmd === "string" && /\.jar\b/i.test(cmd)) {
        evidence.push(`command line references a .jar`);
    }
    if (typeof cmd === "string" && /forge|fabric|paper|spigot|purpur/i.test(cmd)) {
        evidence.push("command line names a known server flavour");
    }

    // Confidence: never from a single signal.
    const strongSignalCount =
        (fromImage.evidence !== null ? 1 : 0) +
        (has25565 ? 1 : 0) +
        (hasFilesystemEvidence ? 1 : 0) +
        (hasLogEvidence ? 1 : 0) +
        (typeof env.EULA === "string" ? 1 : 0);
    if (strongSignalCount >= 3) confidence = "high";
    else if (strongSignalCount === 2) confidence = "medium";
    else confidence = "low";

    const labels =
        typeof inspected.Config?.Labels === "object" && inspected.Config?.Labels !== null
            ? (inspected.Config.Labels as Record<string, unknown>)
            : {};
    const existingOwner =
        labels[DOCKER_HOSTING_LABEL] === "true" ? asString(labels[DOCKER_HOSTING_OWNER_LABEL]) : null;

    const blockers: string[] = [];
    if (inspected.HostConfig?.Privileged === true) blockers.push("This container runs privileged.");
    if (typeof inspected.HostConfig?.PidMode === "string" && inspected.HostConfig.PidMode.startsWith("host")) {
        blockers.push("This container shares the host's process namespace.");
    }
    if (typeof inspected.HostConfig?.NetworkMode === "string" && inspected.HostConfig.NetworkMode === "host") {
        blockers.push("This container shares the host's network namespace.");
    }
    for (const mount of mounts) {
        const src = mount.source.replace(/\\/g, "/").toLowerCase();
        if (src === "/" || /^[a-z]:\/?$/.test(src)) {
            blockers.push("This container mounts the root filesystem.");
        }
        if (src.includes("docker.sock")) {
            blockers.push("This container mounts the Docker socket.");
        }
    }
    if (existingOwner !== null && existingOwner !== ownerValue) {
        blockers.push("This container is already owned by a different WorldLens installation.");
    }
    if (confidence === "low" && !hasFilesystemEvidence && !hasLogEvidence) {
        blockers.push("Not enough evidence: no filesystem layout and no log signature matched.");
    }

    return {
        containerId,
        containerName,
        image,
        imageDigest: imageIdMatch?.[0] ?? null,
        createdAt,
        state,
        ports,
        mounts,
        detected: { flavour, minecraftVersion, serverDir, confidence },
        evidence,
        existingOwner,
        blockers,
    };
}

/**
 * Lists every container Docker knows about and scores each as a possible Minecraft server.
 *
 * Every step here is read-only: `docker ps -a`, `docker inspect`, `docker logs --tail`.
 * Nothing is started, stopped, or asked to run a version probe inside itself.
 */
export async function discoverAdoptionCandidates(options: DiscoverOptions): Promise<Answer<readonly AdoptionCandidate[]>> {
    const docker = options.docker ?? "docker";
    const tail = options.logTailLines ?? 200;

    const psResult = await options.runner(docker, ["ps", "-a", "--format", "{{json .}}"]);
    if (!psResult.ok) {
        return fail("unreachable", "Docker could not be reached to look for existing servers.", psResult.stderr || psResult.spawnError);
    }
    const rows = parseJsonLines(psResult.stdout);
    if (rows.length === 0) return ok([]);

    const candidates: AdoptionCandidate[] = [];
    for (const row of rows) {
        const id = asString(row.ID);
        if (id === null) continue;

        const inspectResult = await options.runner(docker, ["inspect", id]);
        if (!inspectResult.ok) continue; // Container vanished between ps and inspect; skip it.
        let inspectedList: unknown;
        try {
            inspectedList = JSON.parse(inspectResult.stdout);
        } catch {
            continue;
        }
        const inspected = Array.isArray(inspectedList) ? (inspectedList[0] as DockerInspectRow | undefined) : undefined;
        if (inspected === undefined) continue;

        const logsResult = await options.runner(docker, ["logs", "--tail", String(tail), id]);
        const logTail = logsResult.ok || logsResult.exitCode === 0 ? `${logsResult.stdout}\n${logsResult.stderr}` : "";

        candidates.push(scoreCandidate(inspected, logTail, options.ownerValue ?? NO_OWNER));
    }

    return ok(candidates);
}
