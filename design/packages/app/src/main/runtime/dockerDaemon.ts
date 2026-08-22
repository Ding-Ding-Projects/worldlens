/**
 * Starting Docker's engine, rather than telling somebody to go and start it themselves.
 *
 * The status note this serves used to end with "Start Docker Desktop, wait for it to finish
 * starting, and check again" - three instructions, in an application, for a thing the
 * application can do. That is the failure this module exists to remove: an interface that
 * knows exactly what needs to happen and hands the job back to the reader anyway.
 *
 * ## What it can and cannot do, honestly
 *
 * On Windows and macOS the engine ships as a desktop application that any user can launch,
 * so this launches it and waits. On Linux the engine is usually a system service, and
 * starting one needs privileges this process does not have and must not ask for by
 * silently invoking `sudo`. There, the honest answer is that it cannot, and the surface
 * says so with the command a person can run - which is a different thing from an interface
 * that could have helped and did not.
 *
 * ## Why it waits rather than returning immediately
 *
 * Docker Desktop's process starts in about a second and its engine answers a minute later.
 * A button that returned as soon as the process existed would report success while every
 * subsequent call still failed, which is worse than not having the button: it moves the
 * confusion from "nothing happened" to "it said it worked". So this polls the same probe
 * the rest of the app uses and only answers when the engine genuinely responds.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

import { dockerUsable, probeDocker, type DockerReport, type ProbeDockerOptions } from "./docker.js";

/** How long the engine is given to answer before this reports it is still not up. */
export const START_TIMEOUT_MS = 180_000;

/** How often the engine is asked whether it is ready yet. */
export const POLL_INTERVAL_MS = 2_000;

export type DockerStartOutcome =
    /** The engine answered. Docker is usable now. */
    | "started"
    /** It was already running before anything was launched. */
    | "already-running"
    /** Launched, but the engine had not answered before the deadline. */
    | "timed-out"
    /** Nothing here can be launched - see `reason`. */
    | "unsupported"
    /** The launch itself failed. */
    | "failed";

export interface DockerStartResult {
    readonly outcome: DockerStartOutcome;
    /** A sentence fit to show somebody. Never a raw error. */
    readonly message: string;
    /** What was tried, or what the failure said. Null when there is nothing useful to add. */
    readonly detail: string | null;
    /** The engine's state after the attempt, so a caller need not probe again. */
    readonly report: DockerReport | null;
}

export interface StartDockerOptions {
    readonly platform?: NodeJS.Platform;
    readonly probe?: (options?: ProbeDockerOptions) => Promise<DockerReport>;
    readonly docker?: string;
    /** Injected so a test never launches anything. */
    readonly launch?: (command: string, args: readonly string[]) => void;
    /** Injected so a test can say which candidate paths exist without a filesystem. */
    readonly exists?: (path: string) => Promise<boolean>;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
    /** Injected so a test does not actually wait. */
    readonly wait?: (ms: number) => Promise<void>;
    /** Reports progress while waiting, so the surface can say the engine is still starting. */
    readonly onWaiting?: (elapsedMs: number) => void;
}

async function realExists(path: string): Promise<boolean> {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Where Docker Desktop is installed, in the order worth trying.
 *
 * Read from the environment rather than hard-coded to `C:\Program Files`, because that is
 * not where it lives on a machine whose Windows is installed elsewhere or whose programs
 * folder is localised.
 */
export function windowsCandidates(env: NodeJS.ProcessEnv): readonly string[] {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
    );
    return roots.map((root) => join(root, "Docker", "Docker", "Docker Desktop.exe"));
}

export const MACOS_CANDIDATES: readonly string[] = [
    "/Applications/Docker.app",
    "/System/Volumes/Data/Applications/Docker.app",
];

/**
 * Starts Docker's engine and waits for it to actually answer.
 *
 * Never throws. Every outcome a caller has to render differently is a value.
 */
export async function startDockerDaemon(options: StartDockerOptions = {}): Promise<DockerStartResult> {
    const platform = options.platform ?? process.platform;
    const probe = options.probe ?? probeDocker;
    const exists = options.exists ?? realExists;
    const env = options.env ?? process.env;
    const timeoutMs = options.timeoutMs ?? START_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const probeOptions: ProbeDockerOptions = options.docker === undefined ? {} : { docker: options.docker };

    const launch =
        options.launch ??
        ((command: string, args: readonly string[]): void => {
            // Detached and unref'd: the engine must outlive this app, and it certainly must
            // not be killed when the window closes.
            const child = spawn(command, [...args], { detached: true, stdio: "ignore", windowsHide: true });
            child.unref();
        });

    const before = await probe(probeOptions);
    if (dockerUsable(before)) {
        return {
            outcome: "already-running",
            message: "Docker's engine was already running.",
            detail: null,
            report: before,
        };
    }

    // Only a stopped engine is startable. A Docker that is not installed at all needs a
    // download, and pressing start on it would be a button that could never work.
    if (before.status !== "daemon-unreachable") {
        return {
            outcome: "unsupported",
            message: "There is no Docker engine on this computer to start.",
            detail: before.message,
            report: before,
        };
    }

    let command: string;
    let args: readonly string[];

    if (platform === "win32") {
        const found: string[] = [];
        for (const candidate of windowsCandidates(env)) {
            if (await exists(candidate)) found.push(candidate);
        }
        const first = found[0];
        if (first === undefined) {
            return {
                outcome: "unsupported",
                message: "Docker Desktop is installed, but this app could not find it to start it.",
                detail: `Looked in: ${windowsCandidates(env).join(", ")}`,
                report: before,
            };
        }
        command = first;
        args = [];
    } else if (platform === "darwin") {
        const found: string[] = [];
        for (const candidate of MACOS_CANDIDATES) {
            if (await exists(candidate)) found.push(candidate);
        }
        const first = found[0];
        if (first === undefined) {
            return {
                outcome: "unsupported",
                message: "Docker Desktop is installed, but this app could not find it to start it.",
                detail: `Looked in: ${MACOS_CANDIDATES.join(", ")}`,
                report: before,
            };
        }
        command = "/usr/bin/open";
        args = ["-a", first];
    } else {
        // Deliberately not `sudo systemctl start docker`. Escalating privileges on somebody's
        // behalf, from a button, is not a thing this app does - so it says what it cannot do
        // and gives them the one command, which is a different failure from staying silent.
        return {
            outcome: "unsupported",
            message: "Docker's engine runs as a system service here, which this app cannot start for you.",
            detail: "Run: sudo systemctl start docker",
            report: before,
        };
    }

    try {
        launch(command, args);
    } catch (error) {
        return {
            outcome: "failed",
            message: "Docker Desktop could not be started.",
            detail: error instanceof Error ? error.message : String(error),
            report: before,
        };
    }

    let elapsed = 0;
    let latest = before;
    while (elapsed < timeoutMs) {
        await wait(pollIntervalMs);
        elapsed += pollIntervalMs;
        options.onWaiting?.(elapsed);
        latest = await probe(probeOptions);
        if (dockerUsable(latest)) {
            return {
                outcome: "started",
                message: "Docker's engine is running.",
                detail: null,
                report: latest,
            };
        }
    }

    // Deliberately not phrased as a failure. Docker Desktop genuinely can take longer than
    // this on a cold machine, and it is usually still coming up - so the message says what
    // is true rather than declaring a defeat the next probe would contradict.
    return {
        outcome: "timed-out",
        message: "Docker Desktop was started, but its engine has not answered yet.",
        detail: "It can take a few minutes on the first start. Check again shortly.",
        report: latest,
    };
}
