/**
 * Bringing a new local Minecraft server into existence, end to end.
 *
 * Registry records are written only after the required payload and launch configuration
 * exist. A failed local installation retains its files for diagnosis. Container registry
 * failures use ownership-verified rollback and explicitly report retained resources.
 *
 * The order matters and is deliberate:
 *
 * 1. resolve the requested flavour/version against the real catalogue - never trust a
 *    version string the caller typed without checking it is one this app actually knows;
 * 2. resolve a Java runtime that satisfies the version's requirement, provisioning one
 *    only when asked to (`provisionJavaIfMissing`) - downloading a 200 MB JDK is a
 *    decision, not a side effect of clicking "Create";
 * 3. create the server directory;
 * 4. download the server jar, verified;
 * 5. write `server.properties` and, only when explicitly consented to, `eula.txt`;
 * 6. record the instance with the transport and save the `ServerRecord`.
 *
 * Every one of those returns `Answer<T>`, so a failure at any step stops the chain with
 * `if (!step.ok) return step;` and nothing after it runs.
 */

import { mkdir, rmdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { FetchText } from "./flavours/catalogue.js";
import {
    fabricServerJarUrl,
    listCatalogue,
    resolveFabricInstallerVersion,
    type FlavourId,
    type VersionEntry,
} from "./flavours/catalogue.js";
import { installLocalLoader, type InstallerRunner } from "./localLoaderInstall.js";
import { buildSpigotServer, resolveSpigotBuildPlan } from "./spigotBuildTools.js";
import { installServerJar, type FetchBinary } from "./install.js";
import type { ServerRecord, ServerRegistry } from "./registry.js";
import { createLocalProcessTransport } from "./transport/localProcess.js";
import { createLocalDockerTransport } from "./transport/localDocker.js";
import { createSshDockerTransport } from "./transport/sshDocker.js";
import type { SshOptionsInput } from "../remote/ssh.js";
import { sshCommandRunner } from "../remote/ssh.js";
import { execFileCommandRunner } from "../runtime/command.js";
import { dockerServerProfile, type ServerCreationFlavour } from "./dockerServerProfile.js";
import type { CommandRunner } from "../runtime/command.js";
import { fail, ok, type Answer } from "./transport/types.js";
import type { DiscoverJavaOptions, JavaDiscovery } from "../java/discovery.js";
import { describeDiscoveryFailure, discoverJava } from "../java/discovery.js";
import type { JavaRunner } from "../java/probe.js";
import {
    provisionJava,
    type ProvisionEvent,
    type ProvisionJavaOptions,
} from "../java/provision.js";

const ID = /^[a-z][a-z0-9-]{0,62}$/;

export interface CreateLocalServerOptions {
    readonly gameVersion?: string;
    readonly installerRunner?: InstallerRunner;
    readonly id: string;
    readonly name: string;
    readonly flavour: ServerCreationFlavour;
    /** The exact version entry string from the catalogue (`"1.21.4"`, `"1.21.4#11"`, …). */
    readonly version: string;
    readonly memoryMb: number;
    /** The game port selected in the creation wizard. */
    readonly port?: number;
    /**
     * Explicit, and required to be exactly `true` to accept Mojang's EULA on the user's
     * behalf. There is deliberately no default here: a missing or falsy value writes no
     * `eula.txt` at all, which leaves the server refusing to start until the person
     * running it decides for themselves. Coercing anything other than the literal `true`
     * into acceptance would be accepting a legal document nobody agreed to.
     */
    readonly acceptedEula: boolean;
    readonly dataDir: string;
    /**
     * Where the installer's own bundled runtimes live, or null outside a packaged build.
     *
     * Creation resolved Java without this, so a clean install could not see the Temurin JRE
     * inside its own installer: it downloaded a second copy, or refused outright, for a
     * runtime it was already shipping. That is the exact state bundling exists to remove.
     */
    readonly resourcesPath?: string | null;
    readonly serversRoot: string;
    readonly registry: ServerRegistry;
    /**
     * Provision a JDK when nothing suitable is already installed. Off by default, for the
     * same reason `provisionJava` itself only runs when asked to: it is a multi-hundred-
     * megabyte download and belongs to a decision the caller made, not one this function
     * makes quietly on someone's behalf.
     */
    readonly provisionJavaIfMissing?: boolean;
    /** For Fabric only: which installer build to combine with the chosen loader. */
    readonly fabricInstallerVersion?: string;
    /** Optional mod-loader profile values supplied by the create wizard. */
    readonly loaderVersion?: string;
    readonly modsDirectory?: string;
    readonly preinstallApiLibraries?: readonly string[];
    readonly fetchText?: FetchText;
    readonly fetchBinary?: FetchBinary;
    /** Injected in tests so Java discovery never launches a real `java` process. */
    readonly javaRunner?: JavaRunner;
    readonly javaExists?: (path: string) => boolean;
    readonly javaEnv?: NodeJS.ProcessEnv;
    readonly onProvisionEvent?: (event: ProvisionEvent) => void;
    readonly onDownloadProgress?: (received: number, total: number | null) => void;
    readonly now?: () => string;
    readonly signal?: AbortSignal;
}

export interface CreateLocalDockerServerOptions {
    readonly id: string;
    readonly name: string;
    readonly flavour: ServerCreationFlavour;
    readonly version: string;
    readonly memoryMb: number;
    readonly port?: number;
    readonly loaderVersion?: string;
    readonly gameVersion?: string;
    readonly ssh?: {
        readonly hostId: string;
        readonly connection: SshOptionsInput;
        readonly hostDirectory: string;
    };
    readonly acceptedEula: boolean;
    readonly serversRoot: string;
    readonly registry: ServerRegistry;
    readonly dockerPlan: {
        readonly image: string;
        readonly imageVerified: boolean;
        readonly containerRef: string;
        readonly serverDir: string;
        readonly ports: readonly { readonly host: number; readonly container: number }[];
        readonly runner?: CommandRunner;
        readonly docker?: string;
    };
    readonly now?: () => string;
}

/** Creates a new app-owned local Docker server without routing through local-process Java. */
export async function createLocalDockerServer(
    options: CreateLocalDockerServerOptions,
): Promise<Answer<ServerRecord>> {
    if (
        !ID.test(options.id) ||
        !Number.isInteger(options.memoryMb) ||
        options.memoryMb < 256 ||
        options.memoryMb > 1_048_576 ||
        !options.name.trim() ||
        options.name.length > 512 ||
        /[\r\n\0]/.test(options.name + options.version) ||
        !options.version ||
        options.version.length > 512
    ) {
        return fail("invalid-request", "A Docker server needs a valid id and memory limit.");
    }
    const plan = options.dockerPlan;
    const profile = dockerServerProfile(options);
    if (!profile.ok) return profile;
    const guidedMatch = /^itzg\/(minecraft-server|mc-proxy):java(8|11|16|17|21|25)$/.exec(
        plan.image,
    );
    const guidedImage = guidedMatch !== null;
    if (
        (guidedImage || plan.image.startsWith("itzg/")) &&
        !plan.image.startsWith(`${profile.value.imageRepository}${guidedImage ? ":" : "@"}`)
    )
        return fail("invalid-request", "The selected image family cannot run this server flavour.");
    if (guidedMatch && Number(guidedMatch[2]) < profile.value.javaFeature)
        return fail(
            "invalid-request",
            `The selected image needs Java ${profile.value.javaFeature} or newer for this version.`,
        );
    if (
        (!guidedImage && !/@sha256:[a-f0-9]{64}$/.test(plan.image)) ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(plan.containerRef)
    ) {
        return fail(
            "invalid-request",
            "A Docker server needs a verified digest-pinned image and safe container name.",
        );
    }
    if (
        plan.serverDir !== profile.value.serverDir ||
        plan.ports.length === 0 ||
        plan.ports.some(
            (port) =>
                !Number.isInteger(port.host) ||
                !Number.isInteger(port.container) ||
                port.host < 1 ||
                port.host > 65_535 ||
                port.container < 1 ||
                port.container > 65_535,
        )
    ) {
        return fail(
            "invalid-request",
            "The Docker plan must use the scoped /data mount and valid ports.",
        );
    }
    const selectedPort = options.port ?? plan.ports[0]!.host;
    if (
        plan.ports.length !== 1 ||
        plan.ports[0]!.host !== selectedPort ||
        plan.ports[0]!.container !== 25565
    ) {
        return fail(
            "invalid-request",
            "The Docker port mapping must match the selected server port and container port 25565.",
        );
    }
    const existing = await options.registry.get(options.id);
    if (existing.ok) return fail("invalid-request", "A server with that id already exists.");
    if (existing.failure.code !== "not-found") return existing;
    const runner =
        options.ssh === undefined
            ? (plan.runner ?? execFileCommandRunner)
            : sshCommandRunner({
                  ...options.ssh.connection,
                  ...(plan.runner === undefined ? {} : { runner: plan.runner }),
              });
    const docker = plan.docker ?? "docker";
    let image = plan.image;
    if (guidedImage) {
        const pulled = await runner(docker, ["pull", image], { timeoutMs: 600_000 });
        if (!pulled.ok)
            return fail(
                "command-failed",
                "The selected Minecraft server image could not be downloaded.",
                pulled.stderr,
            );
        const inspected = await runner(
            docker,
            ["image", "inspect", "--format", "{{json .RepoDigests}}", image],
            { timeoutMs: 30_000 },
        );
        if (!inspected.ok)
            return fail(
                "command-failed",
                "The downloaded image digest could not be verified.",
                inspected.stderr,
            );
        try {
            const digests: unknown = JSON.parse(inspected.stdout);
            const pinned = Array.isArray(digests)
                ? digests.find(
                      (value): value is string =>
                          typeof value === "string" &&
                          value.startsWith(`${profile.value.imageRepository}@sha256:`) &&
                          /@sha256:[a-f0-9]{64}$/.test(value),
                  )
                : undefined;
            if (pinned === undefined)
                return fail(
                    "invalid-request",
                    "Docker did not return a verified Minecraft server image digest.",
                );
            image = pinned;
        } catch {
            return fail("invalid-request", "Docker returned an unreadable image digest.");
        }
    }
    const serverDir = options.ssh?.hostDirectory ?? join(options.serversRoot, options.id);
    if (options.ssh === undefined) {
        try {
            await mkdir(options.serversRoot, { recursive: true });
            await mkdir(serverDir);
        } catch (error) {
            return fail(
                "denied",
                "The new Docker server folder could not be created. Existing folders are never reused.",
                String(error),
            );
        }
    }
    const transportOptions = {
        containerRef: plan.containerRef,
        serverDir: plan.serverDir,
        ...(plan.runner === undefined ? {} : { runner: plan.runner }),
        ...(plan.docker === undefined ? {} : { docker: plan.docker }),
    };
    const transport =
        options.ssh === undefined
            ? createLocalDockerTransport(transportOptions)
            : createSshDockerTransport({
                  ...options.ssh.connection,
                  hostId: options.ssh.hostId,
                  ...transportOptions,
              });
    const creationId = randomUUID();
    const instance = await transport.create({
        id: options.id,
        name: options.name,
        image,
        memoryMb: options.memoryMb,
        ports: plan.ports,
        env: {
            ...profile.value.env,
            EULA: options.acceptedEula ? "TRUE" : "FALSE",
            MEMORY: `${options.memoryMb}M`,
            SERVER_PORT: "25565",
        },
        volumes: [{ host: serverDir, container: plan.serverDir }],
        labels: {
            "com.worldlens.docker-hosting": "true",
            "com.worldlens.docker-instance": options.id,
            "com.worldlens.docker-name": options.name,
            "com.worldlens.docker-version": "1",
            "com.worldlens.docker-creation": creationId,
        },
    });
    if (!instance.ok) return instance;
    const record: ServerRecord = {
        id: options.id,
        name: options.name,
        flavour: options.flavour,
        minecraftVersion: options.version,
        ref: transport.ref,
        origin: "created",
        createdAt: options.now?.() ?? new Date().toISOString(),
        updatedAt: options.now?.() ?? new Date().toISOString(),
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        localRuntime: null,
    };
    const saved = await options.registry.put(record);
    if (!saved.ok) {
        const inspected = await runner(
            docker,
            ["inspect", "--format", "{{json .}}", plan.containerRef],
            { timeoutMs: 20_000 },
        );
        let ownedId: string | null = null;
        try {
            const state = JSON.parse(inspected.stdout) as {
                Id?: unknown;
                State?: { Running?: unknown };
                Config?: { Labels?: Record<string, unknown> };
            };
            const labels = state.Config?.Labels;
            if (
                inspected.ok &&
                typeof state.Id === "string" &&
                /^[a-f0-9]{64}$/.test(state.Id) &&
                state.State?.Running === false &&
                labels?.["com.worldlens.docker-hosting"] === "true" &&
                labels?.["com.worldlens.docker-instance"] === options.id &&
                labels?.["com.worldlens.docker-name"] === options.name &&
                labels?.["com.worldlens.docker-creation"] === creationId
            )
                ownedId = state.Id;
        } catch {
            /* An unreadable ownership proof never authorizes removal. */
        }
        if (ownedId === null)
            return fail(
                "command-failed",
                `The server registry could not be saved. Container ${plan.containerRef} was retained because ownership or stopped state could not be verified. Use Adopt existing server to recover it.`,
                saved.failure.message,
            );
        const removed = await runner(docker, ["rm", ownedId], { timeoutMs: 30_000 });
        if (!removed.ok)
            return fail(
                "command-failed",
                `The server registry could not be saved and container ${plan.containerRef} could not be rolled back. Use Adopt existing server to recover it.`,
                removed.stderr,
            );
        try {
            if (options.ssh === undefined) await rmdir(serverDir);
            else {
                const folder = await runner("rmdir", ["--", serverDir], { timeoutMs: 20_000 });
                if (!folder.ok)
                    return fail(
                        "command-failed",
                        "The new container was rolled back, but its data folder was retained because it was not empty or could not be removed.",
                        saved.failure.message,
                    );
            }
        } catch {
            return fail(
                "command-failed",
                "The new container was rolled back, but its data folder was retained because it was not empty or could not be removed.",
                saved.failure.message,
            );
        }
        return saved;
    }
    return saved;
}

function resolveVersionEntry(
    flavour: FlavourId,
    versionId: string,
    versions: readonly VersionEntry[],
): Answer<VersionEntry> {
    const entry = versions.find((candidate) => candidate.version === versionId);
    if (entry === undefined) {
        return fail(
            "not-found",
            `"${versionId}" is not a ${flavour} version this app currently knows about.`,
            "Refresh the catalogue and try again.",
        );
    }
    return ok(entry);
}

function resolveDownloadUrl(
    flavour: FlavourId,
    entry: VersionEntry,
    fabricInstallerVersion: string | undefined,
    gameVersion?: string,
): Answer<string> {
    if (entry.downloadUrl !== null) return ok(entry.downloadUrl);
    if (flavour !== "fabric") {
        return fail("invalid-request", `No download is published for ${flavour} ${entry.version}.`);
    }
    if (fabricInstallerVersion === undefined || fabricInstallerVersion.trim() === "") {
        return fail(
            "invalid-request",
            "A Fabric server needs an installer version as well as a loader version.",
            "fabricInstallerVersion was not supplied.",
        );
    }
    // entry.version here is the Fabric *loader* version; the caller supplies the game
    // version separately, quoted back in the returned URL for provenance.
    if (!gameVersion)
        return fail(
            "invalid-request",
            "Choose the Minecraft game version separately from the Fabric loader.",
        );
    return ok(fabricServerJarUrl(gameVersion, entry.version, fabricInstallerVersion));
}

function defaultServerProperties(port: number): string {
    return [
        "# Generated by WorldLens",
        `server-port=${String(port)}`,
        "enable-rcon=false",
        "motd=A WorldLens server",
        "online-mode=true",
        "",
    ].join("\n");
}

async function ensureJavaRuntime(
    options: CreateLocalServerOptions,
    feature: number,
    needsCompiler = false,
    maximumFeature = Number.POSITIVE_INFINITY,
): Promise<Answer<{ readonly javaPath: string }>> {
    const discoveryOptions: DiscoverJavaOptions = {
        dataDir: options.dataDir,
        required: feature,
        ...(options.resourcesPath === undefined || options.resourcesPath === null
            ? {}
            : { resourcesPath: options.resourcesPath }),
        ...(options.javaRunner === undefined ? {} : { runner: options.javaRunner }),
        ...(options.javaExists === undefined ? {} : { exists: options.javaExists }),
        ...(options.javaEnv === undefined ? {} : { env: options.javaEnv }),
    };
    const discovery: JavaDiscovery = await discoverJava(discoveryOptions);
    const exists = options.javaExists ?? existsSync;
    const compilerExists = (javaPath: string) =>
        exists(join(dirname(javaPath), process.platform === "win32" ? "javac.exe" : "javac"));
    if (
        discovery.installation !== null &&
        discovery.installation.version.feature <= maximumFeature &&
        (!needsCompiler || compilerExists(discovery.installation.executable))
    ) {
        return ok({ javaPath: discovery.installation.executable });
    }

    if (options.provisionJavaIfMissing !== true) {
        return fail(
            "invalid-request",
            `No Java ${String(feature)} runtime is available for this server.`,
            describeDiscoveryFailure(discovery),
        );
    }

    const provisionOptions: ProvisionJavaOptions = {
        dataDir: options.dataDir,
        feature,
        ...(options.onProvisionEvent === undefined ? {} : { onEvent: options.onProvisionEvent }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    try {
        const record = await provisionJava(provisionOptions);
        if (
            record.feature > maximumFeature ||
            (needsCompiler && !compilerExists(record.executable))
        )
            return fail(
                "invalid-request",
                "The provisioned Java installation does not satisfy the compiler and version requirements.",
            );
        return ok({ javaPath: record.executable });
    } catch (error) {
        return fail(
            "command-failed",
            `Java ${String(feature)} could not be downloaded and installed.`,
            error instanceof Error ? error.message : String(error),
        );
    }
}

/**
 * Creates a new local-process Minecraft server: resolves the version, ensures a Java
 * runtime, downloads the jar, writes the initial configuration, and records the server.
 *
 * Returns the saved `ServerRecord` on success. Every failure along the way is an
 * `Answer` failure describing exactly which step did not complete; nothing throws.
 */
export async function createLocalServer(
    options: CreateLocalServerOptions,
): Promise<Answer<ServerRecord>> {
    if (!ID.test(options.id)) {
        return fail(
            "invalid-request",
            "A server name may use lower-case letters, numbers and hyphens.",
        );
    }
    if (!Number.isFinite(options.memoryMb) || options.memoryMb < 256) {
        return fail(
            "invalid-request",
            "A server needs at least 256 MB of memory to be worth starting.",
        );
    }
    const port = options.port ?? 25565;
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        return fail("invalid-request", "A server port must be a whole number from 1 to 65535.");
    }

    const now = options.now ?? (() => new Date().toISOString());

    const catalogue = await listCatalogue({
        dataDir: options.dataDir,
        ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
    });
    if (!catalogue.ok) return catalogue;

    const catalogueFlavour = options.flavour;
    const flavourCatalogue = catalogue.value.flavours.find(
        (entry) => entry.flavour === catalogueFlavour,
    );
    if (flavourCatalogue === undefined) {
        return fail("not-found", `"${options.flavour}" is not a server flavour this app supports.`);
    }

    const entry = resolveVersionEntry(catalogueFlavour, options.version, flavourCatalogue.versions);
    if (!entry.ok) return entry;

    // Fabric's loader entries do not carry the real Java requirement (it follows the
    // target game version, which the caller names separately for Fabric); every other
    // flavour's catalogue entry already carries the true requirement from its own API,
    // which is used ahead of a version-string guess wherever it is available.
    const usesInstaller = options.flavour === "forge" || options.flavour === "neoforge";
    const loaderProfile =
        usesInstaller || options.flavour === "fabric" ? dockerServerProfile(options) : null;
    if (loaderProfile !== null && !loaderProfile.ok) return loaderProfile;
    const gameVersion = loaderProfile?.ok
        ? loaderProfile.value.env.VERSION
        : entry.value.version.split("#")[0];
    const gameEntry = catalogue.value.flavours
        .find((item) => item.flavour === "vanilla")
        ?.versions.find((item) => item.version === gameVersion);
    if (options.flavour === "fabric" && gameEntry === undefined)
        return fail(
            "not-found",
            "The selected Fabric game version is absent from the game catalogue. Refresh it before creating.",
        );
    const feature =
        gameEntry?.javaFeature ??
        (loaderProfile?.ok ? loaderProfile.value.javaFeature : entry.value.javaFeature);
    let fabricInstallerVersion = options.fabricInstallerVersion;
    if (options.flavour === "fabric" && fabricInstallerVersion === undefined) {
        const resolved = await resolveFabricInstallerVersion(options.fetchText);
        if (!resolved.ok) return resolved;
        fabricInstallerVersion = resolved.value;
    }

    const spigotPlan =
        options.flavour === "spigot"
            ? await resolveSpigotBuildPlan(options.version, options.fetchText)
            : null;
    if (spigotPlan !== null && !spigotPlan.ok) return spigotPlan;
    const downloadUrl =
        options.flavour === "spigot" && spigotPlan?.ok
            ? ok(spigotPlan.value.url)
            : resolveDownloadUrl(
                  catalogueFlavour,
                  entry.value,
                  fabricInstallerVersion,
                  options.gameVersion,
              );
    if (!downloadUrl.ok) return downloadUrl;

    const javaRuntime = await ensureJavaRuntime(
        options,
        spigotPlan?.ok ? spigotPlan.value.javaMin : feature,
        options.flavour === "spigot",
        spigotPlan?.ok ? spigotPlan.value.javaMax : undefined,
    );
    if (!javaRuntime.ok) return javaRuntime;

    const serverDir = join(options.serversRoot, options.id);
    try {
        await mkdir(options.serversRoot, { recursive: true });
        await mkdir(serverDir);
    } catch (error) {
        return fail(
            "denied",
            "A new server folder could not be created. Existing folders are never reused.",
            String(error),
        );
    }

    let jarPath = join(serverDir, usesInstaller ? "installer.jar" : "server.jar");
    let argsFile: string | undefined;
    if (spigotPlan?.ok) {
        const built = await buildSpigotServer({
            plan: spigotPlan.value,
            javaPath: javaRuntime.value.javaPath,
            dataDir: options.dataDir,
            serverDir,
            ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
            ...(options.installerRunner === undefined ? {} : { runner: options.installerRunner }),
            ...(options.now === undefined ? {} : { now: options.now }),
        });
        if (!built.ok) return built;
        jarPath = built.value.jarPath;
    } else {
        const installed = await installServerJar({
            url: downloadUrl.value,
            targetPath: jarPath,
            sha256: entry.value.sha256,
            ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(options.onDownloadProgress === undefined
                ? {}
                : {
                      onProgress: (progress) =>
                          options.onDownloadProgress?.(progress.received, progress.total),
                  }),
        });
        if (!installed.ok) return installed;
    }
    if (options.flavour === "forge" || options.flavour === "neoforge") {
        const prepared = await installLocalLoader({
            flavour: options.flavour,
            version: options.version,
            javaPath: javaRuntime.value.javaPath,
            installerPath: jarPath,
            serverDir,
            ...(options.installerRunner === undefined ? {} : { runner: options.installerRunner }),
        });
        if (!prepared.ok) return prepared;
        jarPath = prepared.value.jarPath;
        argsFile = prepared.value.argsFile;
    }

    try {
        if (options.modsDirectory !== undefined && options.modsDirectory.trim() !== "") {
            const modsDirectory = options.modsDirectory.trim();
            if (
                modsDirectory === "." ||
                modsDirectory === ".." ||
                /[\\/:*?"<>|]/.test(modsDirectory)
            ) {
                return fail("invalid-request", "The mods directory must be one safe folder name.");
            }
            await mkdir(join(serverDir, modsDirectory), { recursive: true });
        }
        await writeFile(
            join(serverDir, "server.properties"),
            defaultServerProperties(port),
            "utf8",
        );
    } catch (error) {
        return fail("denied", "server.properties could not be written.", String(error));
    }

    if (options.acceptedEula === true) {
        try {
            await writeFile(
                join(serverDir, "eula.txt"),
                `# Accepted through WorldLens on ${now()}\neula=true\n`,
                "utf8",
            );
        } catch (error) {
            return fail("denied", "eula.txt could not be written.", String(error));
        }
    }

    const transport = createLocalProcessTransport({
        serverDir,
        javaPath: javaRuntime.value.javaPath,
        jarPath,
        ...(argsFile === undefined ? {} : { argsFile }),
        memoryMb: options.memoryMb,
        ...(options.now === undefined ? {} : { now: options.now }),
    });
    const instance = await transport.create({
        id: options.id,
        name: options.name,
        javaPath: javaRuntime.value.javaPath,
        jarPath,
        memoryMb: options.memoryMb,
        ports: [{ host: port, container: port }],
        env: {},
    });
    if (!instance.ok) return instance;

    const record: ServerRecord = {
        id: options.id,
        name: options.name,
        flavour: options.flavour,
        minecraftVersion: gameVersion ?? options.version,
        ref: { kind: "local-process", serverDir },
        origin: "created",
        createdAt: now(),
        updatedAt: now(),
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        localRuntime: {
            javaPath: javaRuntime.value.javaPath,
            jarPath,
            ...(argsFile === undefined ? {} : { argsFile }),
            memoryMb: options.memoryMb,
        },
    };

    return options.registry.put(record);
}
