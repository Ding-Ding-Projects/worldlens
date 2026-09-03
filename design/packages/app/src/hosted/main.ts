/**
 * The hosted deployment's entry point: `node hosted.js` inside a container.
 *
 * Configuration comes from the environment rather than from arguments, because the thing that
 * starts this is a `docker run` line or a compose file, and both of those already have a
 * natural place to put environment variables and an awkward one to put arguments.
 *
 * Every value is validated here rather than deeper in, so a misconfigured deployment fails
 * while somebody is still looking at the terminal instead of two screens into the interface.
 */
import { hashPassword } from "@worldlens/server";
import { startHostedServer, UnsafeExposureError } from "./serve.js";
import { registerHostedHandlers } from "./registerHostedHandlers.js";
import { validateMountRoots, type MountRoot } from "./mountRoots.js";
import type { HostedCapability } from "./capabilityProfile.js";

const CAPABILITIES: readonly HostedCapability[] = ["docker-socket", "ssh", "github"];

/**
 * Mounts, declared as `id:path[:ro][:Label]` entries separated by commas.
 *
 * Chosen to read like the `-v` flags beside it in the same command, so an operator writes the
 * folder twice in two similar-looking forms rather than in two unrelated ones:
 *
 *     -v ./worlds:/data/worlds:ro
 *     WORLDLENS_MOUNTS=worlds:/data/worlds:ro:Worlds
 */
export function parseMounts(declaration: string): { roots: MountRoot[]; problems: string[] } {
    const problems: string[] = [];
    const roots: MountRoot[] = [];
    for (const entry of declaration.split(",").map((part) => part.trim())) {
        if (entry === "") continue;
        const parts = entry.split(":");
        const id = parts[0] ?? "";
        const path = parts[1] ?? "";
        if (id === "" || path === "") {
            problems.push(`"${entry}" is not id:path[:ro][:Label].`);
            continue;
        }
        const rest = parts.slice(2);
        const writable = !rest.includes("ro");
        const label = rest.filter((part) => part !== "ro" && part !== "rw").join(":");
        roots.push({ id, path, writable, label: label === "" ? id : label });
    }
    problems.push(...validateMountRoots(roots));
    return { roots, problems };
}

/** Capability grants, comma separated. Anything unrecognised is a mistake, not a no-op. */
export function parseCapabilities(declaration: string): {
    granted: HostedCapability[];
    problems: string[];
} {
    const problems: string[] = [];
    const granted: HostedCapability[] = [];
    for (const name of declaration.split(",").map((part) => part.trim())) {
        if (name === "") continue;
        if (!CAPABILITIES.includes(name as HostedCapability)) {
            // Ignoring it would be worse than refusing: an operator who mistyped a grant would
            // believe they had made one, and only find out when the feature they wanted is
            // refused for a reason that does not mention their typo.
            problems.push(
                `"${name}" is not a capability. The ones that exist are: ${CAPABILITIES.join(", ")}.`,
            );
            continue;
        }
        granted.push(name as HostedCapability);
    }
    return { granted, problems };
}

export interface HostedEnvironment {
    readonly WORLDLENS_UI_ROOT?: string;
    readonly WORLDLENS_MOUNTS?: string;
    readonly WORLDLENS_PASSWORD?: string;
    readonly WORLDLENS_PASSWORD_SHA256?: string;
    readonly WORLDLENS_HOST?: string;
    readonly WORLDLENS_PORT?: string;
    readonly WORLDLENS_CAPABILITIES?: string;
    readonly WORLDLENS_BEHIND_TLS?: string;
    readonly WORLDLENS_INSECURE_NO_PASSWORD?: string;
    readonly WORLDLENS_DATA?: string;
}

export interface HostedConfiguration {
    readonly uiRoot: string;
    readonly mountRoots: readonly MountRoot[];
    readonly passwordHash: string | null;
    readonly host: string;
    readonly port: number;
    readonly secureCookies: boolean;
    readonly acknowledgedInsecure: boolean;
    readonly capabilities: readonly HostedCapability[];
    /** Where this deployment keeps its own records, distinct from the operator's mounts. */
    readonly dataDirectory: string;
}

export function readConfiguration(env: HostedEnvironment): {
    configuration: HostedConfiguration | null;
    problems: readonly string[];
} {
    const problems: string[] = [];
    const mounts = parseMounts(env.WORLDLENS_MOUNTS ?? "");
    problems.push(...mounts.problems);
    const capabilities = parseCapabilities(env.WORLDLENS_CAPABILITIES ?? "");
    problems.push(...capabilities.problems);

    const port = Number.parseInt(env.WORLDLENS_PORT ?? "8110", 10);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
        problems.push(`"${env.WORLDLENS_PORT ?? ""}" is not a port number.`);

    // Both forms exist because they suit different deployments: a compose file can hold the
    // hash and never the password, while somebody trying this out for ten minutes should not
    // have to run a hashing command first.
    let passwordHash: string | null = null;
    if (env.WORLDLENS_PASSWORD_SHA256 !== undefined && env.WORLDLENS_PASSWORD_SHA256 !== "") {
        if (!/^[a-f0-9]{64}$/i.test(env.WORLDLENS_PASSWORD_SHA256))
            problems.push("WORLDLENS_PASSWORD_SHA256 is not a SHA-256 hex digest.");
        else passwordHash = env.WORLDLENS_PASSWORD_SHA256.toLowerCase();
    } else if (env.WORLDLENS_PASSWORD !== undefined && env.WORLDLENS_PASSWORD !== "") {
        passwordHash = hashPassword(env.WORLDLENS_PASSWORD);
    }

    const uiRoot = env.WORLDLENS_UI_ROOT ?? "/app/ui";
    if (problems.length > 0) return { configuration: null, problems };
    return {
        configuration: {
            uiRoot,
            mountRoots: mounts.roots,
            passwordHash,
            host: env.WORLDLENS_HOST ?? "0.0.0.0",
            port,
            secureCookies: env.WORLDLENS_BEHIND_TLS === "1",
            acknowledgedInsecure: env.WORLDLENS_INSECURE_NO_PASSWORD === "1",
            capabilities: capabilities.granted,
            dataDirectory: env.WORLDLENS_DATA ?? "/data/state",
        },
        problems,
    };
}

/** What the container prints on startup, so an operator can see what they actually deployed. */
export function describeDeployment(configuration: HostedConfiguration): string {
    const lines = [
        `WorldLens is listening on http://${configuration.host}:${String(configuration.port)}`,
        configuration.passwordHash === null
            ? "  Password: none. Anyone who can reach this address has full access."
            : "  Password: set.",
        // Issue #169: an operator looking at a running container has to be able to tell
        // which build it is without pulling the image and reading its labels. Null when
        // the build could not establish a commit, said plainly rather than left blank.
        `  Built:    ${__WORLDLENS_SOURCE_COMMIT__ ?? "commit unknown"}` +
            (__WORLDLENS_BUILT_AT__ === null ? "" : ` at ${__WORLDLENS_BUILT_AT__}`),
    ];
    if (configuration.mountRoots.length === 0) {
        lines.push("  Folders:  none mounted, so there is nothing to read or render.");
    } else {
        lines.push("  Folders:");
        for (const root of configuration.mountRoots)
            lines.push(
                `    ${root.label} (${root.id}) -> ${root.path} ${root.writable ? "read/write" : "read-only"}`,
            );
    }
    lines.push(
        configuration.capabilities.length === 0
            ? "  Extras:   none granted. Docker, SSH and GitHub features are refused."
            : `  Extras:   ${configuration.capabilities.join(", ")}`,
    );
    return lines.join("\n");
}

/* c8 ignore start -- the process wrapper; everything it calls is tested above. */
export async function main(env: HostedEnvironment = process.env): Promise<void> {
    const { configuration, problems } = readConfiguration(env);
    if (configuration === null) {
        for (const problem of problems) process.stderr.write(`worldlens: ${problem}\n`);
        process.exitCode = 1;
        return;
    }
    try {
        const server = await startHostedServer({
            ...configuration,
            register: (context) =>
                registerHostedHandlers(context, {
                    dataDirectory: configuration.dataDirectory,
                    posture: {
                        mounts: configuration.mountRoots.map((root) => ({
                            id: root.id,
                            label: root.label,
                            writable: root.writable,
                        })),
                        capabilities: configuration.capabilities,
                        passwordSet: configuration.passwordHash !== null,
                    },
                }),
        });
        process.stdout.write(`${describeDeployment(configuration)}\n`);
        // A container stops by signal, so shutting down cleanly on one is what lets an
        // in-flight render finish its write rather than being cut off mid-file.
        for (const signal of ["SIGINT", "SIGTERM"] as const)
            process.on(signal, () => {
                void server.close().then(() => process.exit(0));
            });
    } catch (error) {
        if (error instanceof UnsafeExposureError) {
            process.stderr.write(`worldlens: ${error.message}\n`);
            process.exitCode = 1;
            return;
        }
        throw error;
    }
}
/* c8 ignore stop */
