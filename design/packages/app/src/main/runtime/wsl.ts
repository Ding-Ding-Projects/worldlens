import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { win32, posix, join } from "node:path";
import { writeFile } from "node:fs/promises";
import { execFileCommandRunner, type CommandRunner } from "./command.js";
import { engineArguments, type EngineLaunch, type EngineArgumentOptions } from "./plan.js";
import { parseJavaVersion, REQUIRED_JAVA_FEATURE } from "../java/version.js";

export interface WslReport {
    readonly available: boolean;
    readonly distributions: readonly string[];
    readonly selected: string | null;
    readonly ready: boolean;
    readonly javaVersion: string | null;
    readonly javaExecutable: string | null;
    readonly message: string;
}
export interface WslEngineContext {
    readonly distribution: string;
    readonly javaVersion: string;
    readonly javaExecutable: string;
}

/** Preserve Unicode distribution names from WSL's UTF-16 list output. */
const wslCommandRunner: CommandRunner = (command, args, options) => {
    if (!args.includes("--list")) return execFileCommandRunner(command, args, options);
    return new Promise((resolve) =>
        execFile(
            command,
            [...args],
            {
                encoding: "buffer",
                windowsHide: true,
                timeout: options?.timeoutMs ?? 15_000,
                maxBuffer: 1024 * 1024,
            },
            (error, stdout, stderr) => {
                const decode = (value: Buffer): string =>
                    value.includes(0) ? value.toString("utf16le") : value.toString("utf8");
                const code: unknown = error?.code;
                resolve({
                    ok: error === null,
                    exitCode: error === null ? 0 : typeof code === "number" ? code : null,
                    spawnError: typeof code === "string" ? code : null,
                    stdout: decode(stdout),
                    stderr: decode(stderr),
                });
            },
        ),
    );
};

/** WSL's list is UTF-16LE on Windows, even through a UTF-8 command runner. */
export function parseWslDistributions(text: string): string[] {
    return [
        ...new Set(
            text
                .replace(/\0/g, "")
                .replace(/^\uFEFF/, "")
                .split(/\r?\n/)
                .map((line) => line.trim().replace(/^\*\s*/, ""))
                .filter((name) => name.length > 0 && !/^docker-desktop(?:-data)?$/i.test(name)),
        ),
    ];
}

export async function probeWsl(
    selected?: string,
    runner: CommandRunner = wslCommandRunner,
    platform: string = process.platform,
): Promise<WslReport> {
    const report = (
        message: string,
        distributions: string[] = [],
        choice: string | null = null,
        javaVersion: string | null = null,
        javaExecutable: string | null = null,
    ): WslReport => ({
        available: distributions.length > 0,
        distributions,
        selected: choice,
        ready: javaVersion !== null,
        javaVersion,
        javaExecutable,
        message,
    });
    if (platform !== "win32")
        return report("WSL rendering requires Windows and an existing Linux distribution.");
    if (
        selected !== undefined &&
        (typeof selected !== "string" || !selected.trim() || /[\0\r\n]/.test(selected))
    )
        return report("Select a valid installed WSL distribution.");
    const list = await runner("wsl.exe", ["--list", "--quiet"], { timeoutMs: 15_000 });
    if (!list.ok)
        return report(
            "WSL could not list installed distributions. Enable WSL and install a Linux distribution, then check again.",
        );
    const names = parseWslDistributions(list.stdout);
    if (!names.length)
        return report(
            "No user Linux distribution is installed. Docker's internal distributions cannot render here.",
        );
    // Ubuntu is preferred for the initial suggestion only. An explicit choice never changes.
    const choice = selected ?? names.find((name) => /^ubuntu(?:-|$)/i.test(name)) ?? names[0]!;
    if (!names.includes(choice))
        return report(
            `The selected WSL distribution '${choice}' is not installed. Select an installed distribution.`,
            names,
            choice,
        );
    const java = await runner("wsl.exe", ["--distribution", choice, "--exec", "java", "-version"], {
        timeoutMs: 20_000,
    });
    const version = parseJavaVersion(`${java.stdout}\n${java.stderr}`);
    if (java.ok && version !== null && version.feature >= REQUIRED_JAVA_FEATURE)
        return report(
            `Ready: ${choice}, Java ${version.version}.`,
            names,
            choice,
            version.version,
            "java",
        );
    const managed = await runner(
        "wsl.exe",
        [
            "--distribution",
            choice,
            "--exec",
            "sh",
            "-c",
            'exec "$HOME/.local/share/worldlens/java/current/bin/java" -version',
        ],
        { timeoutMs: 20_000 },
    );
    const managedVersion = parseJavaVersion(`${managed.stdout}\n${managed.stderr}`);
    if (managed.ok && managedVersion !== null && managedVersion.feature >= REQUIRED_JAVA_FEATURE) {
        const home = await wslHome(choice, runner);
        return report(
            `Ready: ${choice}, managed Java ${managedVersion.version}.`,
            names,
            choice,
            managedVersion.version,
            `${home}/.local/share/worldlens/java/current/bin/java`,
        );
    }
    return report(
        `WSL distribution '${choice}' needs Java ${REQUIRED_JAVA_FEATURE} or later. Starting a render will install a verified runtime in Worldlens's own user directory.`,
        names,
        choice,
    );
}

/** Translate using the chosen distribution's real automount configuration, not a guessed /mnt/c. */
export async function wslPath(
    path: string,
    distribution: string,
    runner: CommandRunner = execFileCommandRunner,
): Promise<string> {
    if (/[\0\r\n]/.test(path) || !win32.isAbsolute(path))
        throw new Error("WSL requires an absolute Windows path.");
    const normalized = win32.normalize(path);
    const unc = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(\\.*)?$/i.exec(normalized);
    if (unc) {
        if (unc[1]!.toLowerCase() !== distribution.toLowerCase())
            throw new Error(
                "The world belongs to another WSL distribution. Select its distribution explicitly.",
            );
        return posix.normalize((unc[2] ?? "\\").replaceAll("\\", "/"));
    }
    if (!/^[a-z]:\\/i.test(normalized))
        throw new Error(
            "WSL rendering supports local drive paths and paths in the selected WSL distribution, not network shares.",
        );
    const result = await runner("wsl.exe", [
        "--distribution",
        distribution,
        "--exec",
        "wslpath",
        "-a",
        "-u",
        normalized,
    ]);
    const translated = result.stdout.trim();
    if (!result.ok || !translated.startsWith("/") || /[\0\r\n]/.test(translated))
        throw new Error(`WSL could not translate the path: ${path}`);
    return translated;
}

// User values are positional arguments, never interpolated into shell source. The marker
// binds cancellation to the exact owned Linux process, including its kernel start time.
const START =
    'pidfile=$1; cancel=$2; shift 2; test ! -e "$cancel" || exit 130; start=$(awk "{print \\$22}" /proc/$$/stat); printf "%s %s\\n" "$$" "$start" > "$pidfile"; test ! -e "$cancel" || exit 130; exec "$@"';
const STOP =
    'pidfile=$1; expected=$2; test -r "$pidfile" || exit 0; read pid started < "$pidfile"; case "$pid:$started" in *[!0-9:]*|:*) exit 2;; esac; owned() { test -r "/proc/$pid/stat" && test "$(awk "{print \\$22}" /proc/$pid/stat)" = "$started" && tr "\\0" "\\n" < "/proc/$pid/environ" | grep -Fxq "WORLDLENS_WSL_RENDER_ID=$expected"; }; owned || exit 0; kill -TERM "$pid"; n=0; while owned && test "$n" -lt 10; do sleep 1; n=$((n+1)); done; if owned; then kill -KILL "$pid"; fi';

export interface WslControl {
    readonly distribution: string;
    readonly token: string;
    readonly pidFile: string;
    readonly hostCancelFile: string;
}
export async function planWslLaunch(
    options: EngineArgumentOptions & {
        readonly distribution: string;
        readonly javaExecutable?: string;
        readonly cwd: string;
    },
    runner: CommandRunner = execFileCommandRunner,
): Promise<EngineLaunch> {
    const token = randomUUID();
    const pidFile = await wslPath(
        join(options.cwd, "wsl-process.pid"),
        options.distribution,
        runner,
    );
    const hostCancelFile = join(options.cwd, `wsl-cancel-${token}`);
    const [cwd, configDir, jarPath, cancelFile] = await Promise.all([
        wslPath(options.cwd, options.distribution, runner),
        wslPath(options.configDir, options.distribution, runner),
        wslPath(options.jarPath, options.distribution, runner),
        wslPath(hostCancelFile, options.distribution, runner),
    ]);
    return {
        mode: "wsl",
        role: options.role,
        command: "wsl.exe",
        args: [
            "--distribution",
            options.distribution,
            "--cd",
            cwd,
            "--exec",
            "env",
            `WORLDLENS_WSL_RENDER_ID=${token}`,
            "sh",
            "-c",
            START,
            "worldlens-wsl",
            pidFile,
            cancelFile,
            options.javaExecutable ?? "java",
            ...engineArguments({ ...options, configDir, jarPath }),
        ],
        cwd: options.cwd,
        mounts: [],
        containerName: null,
        engineConfigDir: configDir,
        hostConfigDir: options.configDir,
        url: null,
        hostPort: null,
        wsl: { distribution: options.distribution, token, pidFile, hostCancelFile },
    };
}

export async function stopWsl(
    control: WslControl,
    runner: CommandRunner = execFileCommandRunner,
): Promise<void> {
    // A cancellation before Linux has written its PID must also prevent the later launch.
    await writeFile(control.hostCancelFile, "cancel\n", "utf8");
    const result = await runner(
        "wsl.exe",
        [
            "--distribution",
            control.distribution,
            "--exec",
            "sh",
            "-c",
            STOP,
            "worldlens-stop",
            control.pidFile,
            control.token,
        ],
        { timeoutMs: 15_000 },
    );
    if (!result.ok) throw new Error("WSL could not confirm cancellation of the render process.");
}

export async function wslHome(
    distribution: string,
    runner: CommandRunner = execFileCommandRunner,
): Promise<string> {
    const home = await runner("wsl.exe", [
        "--distribution",
        distribution,
        "--exec",
        "sh",
        "-c",
        'printf "%s" "$HOME"',
    ]);
    const path = home.stdout.trim();
    if (!home.ok || !path.startsWith("/") || path === "/" || /[\0\r\n]/.test(path))
        throw new Error("WSL did not report a usable user home directory.");
    return path;
}
