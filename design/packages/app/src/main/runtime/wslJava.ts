/** Provision only an app-owned portable Linux JVM, leaving the distribution's packages alone. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { resolveTemurinRelease, type FetchText } from "../java/adoptium.js";
import { downloadVerified, type FetchBinary } from "../java/download.js";
import { REQUIRED_JAVA_FEATURE, parseJavaVersion } from "../java/version.js";
import { execFileCommandRunner, type CommandRunner } from "./command.js";
import { wslHome, wslPath, type WslEngineContext } from "./wsl.js";

export interface EnsureWslJavaOptions {
    readonly distribution: string;
    readonly cacheDir: string;
    readonly signal?: AbortSignal;
    readonly runner?: CommandRunner;
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    readonly onProgress?: (progress: {
        stage: string;
        message: string;
        received: number | null;
        total: number | null;
    }) => void;
}
const INSTALL =
    'set -eu; archive=$1; base=$2; digest=$3; nonce=$4; final="$base/$digest"; staging="$base/staging-$nonce"; mkdir -p "$base"; if test ! -d "$final"; then mkdir "$staging"; tar -xzf "$archive" -C "$staging" --strip-components=1; test -x "$staging/bin/java"; "$staging/bin/java" -version; mv -T "$staging" "$final"; fi; test -x "$final/bin/java"; ln -s "$final" "$base/link-$nonce"; mv -Tf "$base/link-$nonce" "$base/current"';

export async function ensureWslJava(options: EnsureWslJavaOptions): Promise<WslEngineContext> {
    const runner = options.runner ?? execFileCommandRunner;
    const args = ["--distribution", options.distribution, "--exec"];
    options.signal?.throwIfAborted();
    const architecture = await runner("wsl.exe", [...args, "uname", "-m"], {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const arch = architecture.stdout.trim();
    if (!architecture.ok || (arch !== "x86_64" && arch !== "aarch64"))
        throw new Error("The selected WSL architecture is unsupported for automatic Java setup.");
    options.onProgress?.({
        stage: "checking",
        message: "Resolving a verified Linux Java runtime for WSL.",
        received: null,
        total: null,
    });
    const release = await resolveTemurinRelease({
        platform: "linux",
        architecture: arch === "x86_64" ? "x64" : "arm64",
        feature: REQUIRED_JAVA_FEATURE,
        ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
    });
    options.signal?.throwIfAborted();
    const archive = await downloadVerified({
        url: release.url,
        sha256: release.sha256,
        target: join(options.cacheDir, `${release.sha256}.tar.gz`),
        expectedSize: release.size,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        onProgress: (progress) =>
            options.onProgress?.({
                stage: "downloading",
                message: "Downloading the Linux Java runtime for WSL.",
                received: progress.received,
                total: progress.total,
            }),
    });
    options.signal?.throwIfAborted();
    const [home, linuxArchive] = await Promise.all([
        wslHome(options.distribution, runner),
        wslPath(archive.path, options.distribution, runner),
    ]);
    options.onProgress?.({
        stage: "installing",
        message: "Installing Java in Worldlens's own WSL user directory.",
        received: null,
        total: null,
    });
    // Once extraction starts it is allowed to settle atomically. Aborting wsl.exe could
    // orphan tar; cancellation is checked immediately afterwards, before rendering.
    const result = await runner(
        "wsl.exe",
        [
            ...args,
            "sh",
            "-c",
            INSTALL,
            "worldlens-java",
            linuxArchive,
            `${home}/.local/share/worldlens/java`,
            release.sha256,
            randomUUID(),
        ],
        { timeoutMs: 120_000 },
    );
    if (!result.ok)
        throw new Error(`WSL Java setup failed: ${result.stderr.trim() || result.stdout.trim()}`);
    options.signal?.throwIfAborted();
    const executable = `${home}/.local/share/worldlens/java/${release.sha256}/bin/java`;
    const check = await runner("wsl.exe", [...args, executable, "-version"], { timeoutMs: 20_000 });
    const version = parseJavaVersion(`${check.stdout}\n${check.stderr}`);
    if (!check.ok || version === null || version.feature < REQUIRED_JAVA_FEATURE)
        throw new Error("The installed WSL Java runtime did not pass its version check.");
    return {
        distribution: options.distribution,
        javaVersion: version.version,
        javaExecutable: executable,
    };
}
