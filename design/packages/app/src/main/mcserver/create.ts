/**
 * Bringing a new local Minecraft server into existence, end to end.
 *
 * The one thing every step below shares: it either fully succeeds or leaves nothing new
 * behind for the next launch to trip over. A server "created" with no jar, or a registry
 * record pointing at a folder that was never actually written, is worse than an honest
 * failure - it looks like a server until the moment somebody presses Start.
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

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { FetchText } from "./flavours/catalogue.js";
import { fabricServerJarUrl, listCatalogue, type FlavourId, type VersionEntry } from "./flavours/catalogue.js";
import { requiredJavaFeature } from "./flavours/javaRequirement.js";
import { installServerJar, type FetchBinary } from "./install.js";
import type { ServerRecord, ServerRegistry } from "./registry.js";
import { createLocalProcessTransport } from "./transport/localProcess.js";
import { fail, ok, type Answer } from "./transport/types.js";
import type { DiscoverJavaOptions, JavaDiscovery } from "../java/discovery.js";
import { describeDiscoveryFailure, discoverJava } from "../java/discovery.js";
import type { JavaRunner } from "../java/probe.js";
import { provisionJava, type ProvisionEvent, type ProvisionJavaOptions } from "../java/provision.js";

const ID = /^[a-z][a-z0-9-]{0,62}$/;

export interface CreateLocalServerOptions {
    readonly id: string;
    readonly name: string;
    readonly flavour: FlavourId;
    /** The exact version entry string from the catalogue (`"1.21.4"`, `"1.21.4#11"`, …). */
    readonly version: string;
    readonly memoryMb: number;
    /**
     * Explicit, and required to be exactly `true` to accept Mojang's EULA on the user's
     * behalf. There is deliberately no default here: a missing or falsy value writes no
     * `eula.txt` at all, which leaves the server refusing to start until the person
     * running it decides for themselves. Coercing anything other than the literal `true`
     * into acceptance would be accepting a legal document nobody agreed to.
     */
    readonly acceptedEula: boolean;
    readonly dataDir: string;
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
): Answer<string> {
    if (entry.downloadUrl !== null) return ok(entry.downloadUrl);
    if (flavour !== "fabric") {
        return fail(
            "invalid-request",
            `No download is published for ${flavour} ${entry.version}.`,
        );
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
    return ok(fabricServerJarUrl(versionForGame(entry, flavour), entry.version, fabricInstallerVersion));
}

/**
 * For every flavour except Fabric the catalogue's `version` field IS the Minecraft game
 * version. Fabric is the one exception - its entries are loader builds - so this function
 * exists only so the intent above is legible at the call site rather than silently correct.
 */
function versionForGame(entry: VersionEntry, flavour: FlavourId): string {
    void flavour;
    return entry.version;
}

function defaultServerProperties(): string {
    return [
        "# Generated by WorldLens",
        "server-port=25565",
        "enable-rcon=false",
        "motd=A WorldLens server",
        "online-mode=true",
        "",
    ].join("\n");
}

async function ensureJavaRuntime(
    options: CreateLocalServerOptions,
    feature: number,
): Promise<Answer<{ readonly javaPath: string }>> {
    const discoveryOptions: DiscoverJavaOptions = {
        dataDir: options.dataDir,
        required: feature,
        ...(options.javaRunner === undefined ? {} : { runner: options.javaRunner }),
        ...(options.javaExists === undefined ? {} : { exists: options.javaExists }),
        ...(options.javaEnv === undefined ? {} : { env: options.javaEnv }),
    };
    const discovery: JavaDiscovery = await discoverJava(discoveryOptions);
    if (discovery.installation !== null) {
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
export async function createLocalServer(options: CreateLocalServerOptions): Promise<Answer<ServerRecord>> {
    if (!ID.test(options.id)) {
        return fail("invalid-request", "A server name may use lower-case letters, numbers and hyphens.");
    }
    if (!Number.isFinite(options.memoryMb) || options.memoryMb < 256) {
        return fail("invalid-request", "A server needs at least 256 MB of memory to be worth starting.");
    }

    const now = options.now ?? (() => new Date().toISOString());

    const catalogue = await listCatalogue({
        dataDir: options.dataDir,
        ...(options.fetchText === undefined ? {} : { fetchText: options.fetchText }),
    });
    if (!catalogue.ok) return catalogue;

    const flavourCatalogue = catalogue.value.flavours.find((entry) => entry.flavour === options.flavour);
    if (flavourCatalogue === undefined) {
        return fail("not-found", `"${options.flavour}" is not a server flavour this app supports.`);
    }

    const entry = resolveVersionEntry(options.flavour, options.version, flavourCatalogue.versions);
    if (!entry.ok) return entry;

    // Fabric's loader entries do not carry the real Java requirement (it follows the
    // target game version, which the caller names separately for Fabric); every other
    // flavour's catalogue entry already carries the true requirement from its own API,
    // which is used ahead of a version-string guess wherever it is available.
    const javaFeatureAnswer =
        options.flavour === "fabric"
            ? requiredJavaFeature(options.version)
            : { known: true as const, feature: entry.value.javaFeature };
    const feature = javaFeatureAnswer.known ? javaFeatureAnswer.feature : entry.value.javaFeature;

    const downloadUrl = resolveDownloadUrl(options.flavour, entry.value, options.fabricInstallerVersion);
    if (!downloadUrl.ok) return downloadUrl;

    const javaRuntime = await ensureJavaRuntime(options, feature);
    if (!javaRuntime.ok) return javaRuntime;

    const serverDir = join(options.serversRoot, options.id);
    try {
        await mkdir(serverDir, { recursive: true });
    } catch (error) {
        return fail("denied", "The server folder could not be created.", String(error));
    }

    const jarPath = join(serverDir, "server.jar");
    const installed = await installServerJar({
        url: downloadUrl.value,
        targetPath: jarPath,
        sha256: entry.value.sha256,
        ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onDownloadProgress === undefined
            ? {}
            : { onProgress: (progress) => options.onDownloadProgress?.(progress.received, progress.total) }),
    });
    if (!installed.ok) return installed;

    try {
        await writeFile(join(serverDir, "server.properties"), defaultServerProperties(), "utf8");
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
        memoryMb: options.memoryMb,
        ...(options.now === undefined ? {} : { now: options.now }),
    });
    const instance = await transport.create({
        id: options.id,
        name: options.name,
        javaPath: javaRuntime.value.javaPath,
        jarPath,
        memoryMb: options.memoryMb,
        ports: [{ host: 25565, container: 25565 }],
        env: {},
    });
    if (!instance.ok) return instance;

    const record: ServerRecord = {
        id: options.id,
        name: options.name,
        flavour: options.flavour,
        minecraftVersion: options.flavour === "fabric" ? options.version : entry.value.version.split("#")[0] ?? entry.value.version,
        ref: { kind: "local-process", serverDir },
        origin: "created",
        createdAt: now(),
        updatedAt: now(),
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
    };

    return options.registry.put(record);
}
