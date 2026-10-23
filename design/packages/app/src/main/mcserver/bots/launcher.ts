import { createRequire } from "node:module";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, delimiter } from "node:path";
import { pathToFileURL } from "node:url";
import {
    BARITONE_PROFILE,
    installBaritoneClient,
    type BaritoneInstallation,
    type ProtectedClientLauncher,
} from "./baritone.js";
import type { ProtectedBotAccounts } from "./accounts.js";
import type { BotProfile } from "./mineflayer.js";
export const JAVA_CLIENT_DEPENDENCIES = {
    core: "2.16.2",
    installer: "6.3.6",
    authentication: "3.1.1",
    minecraft: "1.21.4",
    fabricLoader: "0.16.9",
    javaMajor: 21,
    gradle: "8.12.1",
} as const;
interface ResolvedClient {
    id: string;
    minecraftVersion: string;
    mainClass: string;
    minecraftDirectory: string;
}
interface InstallerRuntime {
    getVersionList(): Promise<{ versions: Array<{ id: string; url: string; sha1: string }> }>;
    installMinecraft(
        metadata: { id: string; url: string; sha1: string },
        directory: string,
    ): Promise<ResolvedClient>;
    installFabric(options: {
        minecraftVersion: string;
        version: string;
        minecraft: string;
    }): Promise<string>;
    completeInstallation(
        version: ResolvedClient,
        options?: { diagnose?: boolean; signal?: AbortSignal },
    ): Promise<void>;
}
interface CoreRuntime {
    Version: { parse(directory: string, id: string): Promise<ResolvedClient> };
    launch(options: Record<string, unknown>): Promise<ChildProcessWithoutNullStreams>;
}
function runtime(): { installer: InstallerRuntime; core: CoreRuntime } {
    const require = createRequire(import.meta.url);
    if (
        (require("@xmcl/core/package.json") as { version: string }).version !==
            JAVA_CLIENT_DEPENDENCIES.core ||
        (require("@xmcl/installer/package.json") as { version: string }).version !==
            JAVA_CLIENT_DEPENDENCIES.installer
    )
        throw new Error("Unreviewed managed-client runtime.");
    return {
        installer: require("@xmcl/installer") as InstallerRuntime,
        core: require("@xmcl/core") as CoreRuntime,
    };
}
export interface ManagedClientPreparation {
    /** Must be a main-owned isolated client directory, never an adopted user installation. */
    clientDirectory: string;
    javaExecutable: string;
    bridgeJar: string;
    bridgeSha256: string;
    baritoneJar: string;
    downloadConsent: boolean;
    eulaConsent: boolean;
    signal?: AbortSignal;
}
export interface PreparedManagedClient {
    installation: BaritoneInstallation;
    javaExecutable: string;
    versionId: string;
    metadataSha1: string;
}
/** Obtains the real official client, Fabric libraries/assets and validated bot mods. */
export async function prepareManagedBaritoneClient(
    input: ManagedClientPreparation,
): Promise<PreparedManagedClient> {
    if (!input.downloadConsent || !input.eulaConsent)
        throw new Error("Explicit download and Minecraft EULA consent are required.");
    const { installer, core } = runtime();
    const manifest = await installer.getVersionList();
    const metadata = manifest.versions.find((version) => version.id === BARITONE_PROFILE.minecraft);
    if (
        !metadata ||
        !/^https:\/\/(?:piston-meta\.mojang\.com|launchermeta\.mojang\.com)\//.test(metadata.url)
    )
        throw new Error("Official client version metadata is unavailable.");
    await mkdir(input.clientDirectory, { recursive: true });
    await installer.installMinecraft(metadata, input.clientDirectory);
    const versionBytes = await readFile(
        join(input.clientDirectory, "versions", metadata.id, `${metadata.id}.json`),
    );
    if (createHash("sha1").update(versionBytes).digest("hex") !== metadata.sha1)
        throw new Error("Official client metadata integrity check failed.");
    const versionId = await installer.installFabric({
        minecraftVersion: BARITONE_PROFILE.minecraft,
        version: BARITONE_PROFILE.fabricLoader,
        minecraft: input.clientDirectory,
    });
    const resolved = await core.Version.parse(input.clientDirectory, versionId);
    if (
        resolved.mainClass !== "net.fabricmc.loader.impl.launch.knot.KnotClient" ||
        resolved.minecraftVersion !== BARITONE_PROFILE.minecraft
    )
        throw new Error("Fabric client version does not match the reviewed profile.");
    await installer.completeInstallation(resolved, {
        ...(input.signal ? { signal: input.signal } : {}),
    });
    await installer.completeInstallation(resolved, {
        diagnose: true,
        ...(input.signal ? { signal: input.signal } : {}),
    });
    const installation: BaritoneInstallation = {
        clientDirectory: input.clientDirectory,
        bridgeJar: input.bridgeJar,
        bridgeSha256: input.bridgeSha256,
        baritoneJar: input.baritoneJar,
        javaMajor: 21,
        minecraftVersion: BARITONE_PROFILE.minecraft,
        fabricLoader: BARITONE_PROFILE.fabricLoader,
    };
    await installBaritoneClient(installation);
    const result = {
        installation,
        javaExecutable: input.javaExecutable,
        versionId,
        metadataSha1: metadata.sha1,
    };
    await writeFile(
        join(input.clientDirectory, "worldlens-client-receipt.json"),
        JSON.stringify(
            {
                schemaVersion: 1,
                minecraftVersion: BARITONE_PROFILE.minecraft,
                fabricLoader: BARITONE_PROFILE.fabricLoader,
                versionId,
                metadataSha1: metadata.sha1,
                bridgeSha256: input.bridgeSha256,
                baritoneSha256: BARITONE_PROFILE.distributionSha256,
            },
            null,
            2,
        ),
    );
    return result;
}
export type HiddenClientSpawn = (
    executable: string,
    arguments_: string[],
    options: SpawnOptions,
) => ChildProcessWithoutNullStreams;
/** Launches the actual Fabric client after real core prechecks, with private stdin authentication. */
export class ManagedBaritoneLauncher implements ProtectedClientLauncher {
    readonly #prepared: PreparedManagedClient;
    readonly #accounts: ProtectedBotAccounts;
    readonly #spawn: HiddenClientSpawn;
    constructor(
        prepared: PreparedManagedClient,
        accounts: ProtectedBotAccounts,
        hiddenDesktopSpawn?: HiddenClientSpawn,
    ) {
        this.#prepared = structuredClone(prepared);
        this.#accounts = accounts;
        if (process.platform === "win32" && !hiddenDesktopSpawn)
            throw new Error(
                "The current Windows host requires the approved named hidden-desktop process route.",
            );
        this.#spawn =
            hiddenDesktopSpawn ??
            ((executable, args, options) =>
                spawn(executable, args, {
                    ...options,
                    stdio: "pipe",
                }) as ChildProcessWithoutNullStreams);
    }
    async launch(request: {
        profile: BotProfile;
        installation: BaritoneInstallation;
        attempt: string;
    }): Promise<ChildProcessWithoutNullStreams> {
        const { profile } = request;
        if (
            profile.engine !== "baritone" ||
            profile.target.version !== BARITONE_PROFILE.minecraft ||
            request.installation.clientDirectory !== this.#prepared.installation.clientDirectory
        )
            throw new Error("Managed client target differs from prepared installation.");
        const mods = join(this.#prepared.installation.clientDirectory, "mods");
        const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
        if (
            hash(await readFile(join(mods, "worldlens-baritone-client-1.0.0.jar"))) !==
                this.#prepared.installation.bridgeSha256 ||
            hash(await readFile(join(mods, "baritone-api-fabric-1.13.1.jar"))) !==
                BARITONE_PROFILE.distributionSha256
        )
            throw new Error("Installed bot mod integrity changed.");
        const session = await this.#accounts.authenticate(profile.accountRef);
        const { core } = runtime();
        const placeholder = "WORLDLENS_PRIVATE_STDIN_ACCESS";
        return await core.launch({
            gamePath: this.#prepared.installation.clientDirectory,
            resourcePath: this.#prepared.installation.clientDirectory,
            javaPath: this.#prepared.javaExecutable,
            version: this.#prepared.versionId,
            gameProfile: { id: session.profile.id, name: session.profile.name },
            accessToken: placeholder,
            quickPlayMultiplayer: `${profile.host}:${profile.port}`,
            launcherName: "Worldlens",
            extraClassPaths: [this.#prepared.installation.bridgeJar],
            extraJVMArgs: [
                "-XX:-HeapDumpOnOutOfMemoryError",
                `-Dlog4j2.configurationFile=jar:${pathToFileURL(this.#prepared.installation.bridgeJar).href}!/worldlens-bot-log4j2.xml`,
            ],
            extraExecOption: { windowsHide: true, stdio: "pipe", shell: false },
            spawn: (executable: string, args: string[], options: SpawnOptions) => {
                const mainIndex = args.indexOf("net.fabricmc.loader.impl.launch.knot.KnotClient");
                if (
                    mainIndex < 0 ||
                    args.slice(0, mainIndex).some((arg) => arg.includes(placeholder))
                )
                    throw new Error("Unexpected managed client launch layout.");
                const publicArguments = args.slice(0, mainIndex);
                const classpathIndex = publicArguments.indexOf("-cp");
                if (classpathIndex < 0 || !publicArguments[classpathIndex + 1])
                    throw new Error("Managed client classpath is unavailable.");
                if (
                    !publicArguments[classpathIndex + 1]!.split(delimiter).includes(
                        this.#prepared.installation.bridgeJar,
                    )
                )
                    publicArguments[classpathIndex + 1] +=
                        delimiter + this.#prepared.installation.bridgeJar;
                const child = this.#spawn(
                    executable,
                    [...publicArguments, "org.worldlens.bot.ProtectedClientBootstrap"],
                    { ...options, windowsHide: true, stdio: "pipe", shell: false },
                );
                const privateArguments = args
                    .slice(mainIndex + 1)
                    .map((arg) => (arg === placeholder ? session.accessToken : arg));
                child.stdin.write(
                    JSON.stringify({
                        mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
                        arguments: privateArguments,
                    }) + "\n",
                );
                return child;
            },
        });
    }
}
