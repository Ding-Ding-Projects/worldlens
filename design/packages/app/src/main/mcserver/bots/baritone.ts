import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, copyFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { validateSpatial, type PointOperand } from "../commands/index.js";
import type { BotProfile, BotStatus } from "./mineflayer.js";

export const BARITONE_PROFILE = {
    minecraft: "1.21.4",
    javaMajor: 21,
    fabricLoader: "0.16.9",
    baritone: "1.13.1",
    bridge: "1.0.0",
    distributionUrl:
        "https://github.com/cabaletta/baritone/releases/download/v1.13.1/baritone-api-fabric-1.13.1.jar",
    distributionSha256: "bfb79c3cdb8fe1f7697999b1f9c7f08ea29775f3b69d48ad90c387690ee67b05",
    source: "https://github.com/cabaletta/baritone/blob/1.21.4/gradle.properties",
} as const;
const sha = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
export interface BaritoneInstallation {
    clientDirectory: string;
    bridgeJar: string;
    bridgeSha256: string;
    baritoneJar: string;
    javaMajor: number;
    minecraftVersion: string;
    fabricLoader: string;
}
/** Install only into a new, caller-owned client directory. Never replace existing mods. */
export async function installBaritoneClient(
    input: BaritoneInstallation,
): Promise<{ modsDirectory: string; bridgeSha256: string; distributionSha256: string }> {
    if (
        input.javaMajor !== 21 ||
        input.minecraftVersion !== BARITONE_PROFILE.minecraft ||
        input.fabricLoader !== BARITONE_PROFILE.fabricLoader ||
        !/^[a-f0-9]{64}$/.test(input.bridgeSha256)
    )
        throw new Error("Unsupported Java/client/loader or missing bridge build receipt.");
    const [distribution, bridge] = await Promise.all([
        readFile(input.baritoneJar),
        readFile(input.bridgeJar),
    ]);
    if (
        sha(distribution) !== BARITONE_PROFILE.distributionSha256 ||
        sha(bridge) !== input.bridgeSha256
    )
        throw new Error("Client mod integrity check failed.");
    const modsDirectory = join(resolve(input.clientDirectory), "mods");
    await mkdir(modsDirectory, { recursive: true });
    const destinations = [
        join(modsDirectory, "baritone-api-fabric-1.13.1.jar"),
        join(modsDirectory, "worldlens-baritone-client-1.0.0.jar"),
    ];
    for (const destination of destinations) {
        try {
            await stat(destination);
            throw new Error("Existing client mod will not be replaced.");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
    // COPYFILE_EXCL also protects against a concurrent writer after the existence check.
    await copyFile(input.baritoneJar, destinations[0]!, 1);
    await copyFile(input.bridgeJar, destinations[1]!, 1);
    if (
        sha(await readFile(destinations[0]!)) !== BARITONE_PROFILE.distributionSha256 ||
        sha(await readFile(destinations[1]!)) !== input.bridgeSha256
    )
        throw new Error("Installed client mod readback failed.");
    return {
        modsDirectory,
        bridgeSha256: input.bridgeSha256,
        distributionSha256: BARITONE_PROFILE.distributionSha256,
    };
}
export interface ProtectedClientLauncher {
    /** Launch an owned, verified Fabric client. Resolve authentication privately, never in process arguments or logs. */
    launch(request: {
        profile: BotProfile;
        installation: BaritoneInstallation;
        attempt: string;
    }): Promise<ChildProcessWithoutNullStreams>;
}
export class BaritoneSession {
    readonly #profile: BotProfile;
    readonly #installation: BaritoneInstallation;
    readonly #launcher: ProtectedClientLauncher;
    readonly #listeners = new Set<(status: BotStatus) => void>();
    #child: ChildProcessWithoutNullStreams | null = null;
    #generation = 0;
    #status: BotStatus;
    #pendingNavigation: string | null = null;
    constructor(
        profile: BotProfile,
        installation: BaritoneInstallation,
        launcher: ProtectedClientLauncher,
    ) {
        if (
            profile.engine !== "baritone" ||
            profile.target.version !== BARITONE_PROFILE.minecraft ||
            installation.minecraftVersion !== profile.target.version ||
            installation.javaMajor !== 21 ||
            installation.fabricLoader !== BARITONE_PROFILE.fabricLoader
        )
            throw new Error(
                "The reviewed Baritone profile requires Java 21, Fabric 0.16.9 and Minecraft 1.21.4.",
            );
        this.#profile = structuredClone(profile);
        this.#installation = structuredClone(installation);
        this.#launcher = launcher;
        this.#status = {
            id: profile.id,
            engine: "baritone",
            attempt: "",
            state: "stopped",
            message: "Not started.",
            position: null,
            commandGraph: null,
        };
    }
    get status(): BotStatus {
        return structuredClone(this.#status);
    }
    onStatus(listener: (status: BotStatus) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
    #update(patch: Partial<BotStatus>): void {
        this.#status = { ...this.#status, ...patch };
        for (const listener of this.#listeners) listener(this.status);
    }
    async start(): Promise<void> {
        if (this.#child || this.#status.state === "starting")
            throw new Error("Client is already active.");
        const generation = ++this.#generation;
        this.#update({
            attempt: randomUUID(),
            state: "starting",
            message: "Starting verified Java client.",
            position: null,
        });
        try {
            const child = await this.#launcher.launch({
                profile: this.#profile,
                installation: this.#installation,
                attempt: this.#status.attempt,
            });
            if (generation !== this.#generation) {
                child.kill();
                return;
            }
            this.#child = child;
            // Raw client output is deliberately not retained: launchers can print account data.
            child.stderr.resume();
            const lines = createInterface({ input: child.stdout });
            lines.on("line", (line) => {
                if (
                    generation !== this.#generation ||
                    line.length > 4096 ||
                    !line.startsWith("WORLDLENS_BOT_V1 ")
                )
                    return;
                this.#receive(line.slice(17));
            });
            child.once("error", () => {
                if (generation === this.#generation)
                    this.#update({ state: "failed", message: "Java client process failed." });
            });
            child.once("exit", (code) => {
                lines.close();
                if (generation !== this.#generation) return;
                this.#child = null;
                this.#pendingNavigation = null;
                this.#update({
                    state: code === 0 ? "stopped" : "failed",
                    message: "Java client exited.",
                    position: null,
                });
            });
        } catch {
            if (generation === this.#generation)
                this.#update({
                    state: "failed",
                    message: "Verified client launch is unavailable.",
                });
        }
    }
    #receive(line: string): void {
        try {
            const event = JSON.parse(line) as {
                state?: string;
                version?: string;
                bridgeVersion?: string;
                id?: string;
                x?: number;
                y?: number;
                z?: number;
                dimension?: string;
                pathing?: boolean;
            };
            if (
                event.version !== BARITONE_PROFILE.minecraft ||
                event.bridgeVersion !== BARITONE_PROFILE.bridge
            )
                return;
            if (event.state === "status") {
                const point: PointOperand = {
                    kind: "point",
                    dimension: event.dimension!,
                    x: event.x!,
                    y: event.y!,
                    z: event.z!,
                };
                validateSpatial(point);
                this.#update({
                    state: event.pathing ? "navigating" : "connected",
                    position: point,
                    message: event.pathing
                        ? "Baritone is following a path."
                        : "Java client world confirmed.",
                });
            } else if (event.state === "accepted" && event.id === this.#pendingNavigation)
                this.#update({
                    state: "navigating",
                    message: "Baritone accepted the navigation goal.",
                });
            else if (event.state === "cancelled") {
                this.#pendingNavigation = null;
                this.#update({ state: "connected", message: "Baritone cancelled navigation." });
            } else if (event.state === "rejected") {
                this.#pendingNavigation = null;
                this.#update({ message: "Client rejected the requested action." });
            } else if (event.state === "starting")
                this.#update({
                    state: "starting",
                    position: null,
                    message: "Waiting for server world.",
                });
        } catch {
            /* Ignore malformed telemetry, never display raw client output. */
        }
    }
    #send(action: string, data: Record<string, unknown> = {}): string {
        if (!this.#child || !this.#child.stdin.writable)
            throw new Error("Client control is unavailable.");
        const id = randomUUID();
        this.#child.stdin.write(`${JSON.stringify({ id, action, ...data })}\n`);
        return id;
    }
    navigate(point: PointOperand): void {
        validateSpatial(point);
        if (
            !["connected", "navigating"].includes(this.#status.state) ||
            this.#status.position?.dimension !== point.dimension ||
            ![point.x, point.y, point.z].every(Number.isInteger)
        )
            throw new Error(
                "Navigation needs a connected client in the selected dimension and integer coordinates.",
            );
        this.#pendingNavigation = this.#send("goto", {
            dimension: point.dimension,
            x: point.x,
            y: point.y,
            z: point.z,
        });
    }
    cancelNavigation(): void {
        this.#send("cancel");
    }
    stop(): void {
        if (!this.#child) {
            ++this.#generation;
            this.#update({ state: "stopped", message: "No client process.", position: null });
            return;
        }
        this.#send("stop");
        this.#update({ state: "stopping", message: "Waiting for owned client exit." });
    }
    /** Forced termination is explicitly scoped to this session's child, never an external client. */
    terminateOwnedClient(): void {
        this.#child?.kill();
    }
}
