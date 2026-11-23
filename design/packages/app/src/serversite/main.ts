/**
 * The Minecraft server appliance's management site, as a program of its own.
 *
 * Runs the web console (`main/mcserver/webconsole`) with named accounts instead of a shared
 * password: the first person to open it becomes the owner, and sign-in can need a password, a
 * passkey, an authenticator code or any combination. The server it manages is the appliance's
 * own Minecraft container, registered on first start as a `local-docker` server so the console's
 * existing console, players, settings and plugins screens work unchanged.
 *
 * Configuration comes from the environment, because the appliance's boot script starts it:
 *
 * | Variable | Meaning |
 * | --- | --- |
 * | `WORLDLENS_DATA` | Where accounts and the server list are kept (default `/data/state`). |
 * | `WORLDLENS_SITE_PORT` | Port to listen on (default 8443). |
 * | `WORLDLENS_SITE_HOST` | The host name people use; passkeys are bound to it. |
 * | `WORLDLENS_SITE_ORIGIN` | The exact origin browsers see (default `https://<host>`). |
 * | `WORLDLENS_BEHIND_TLS` | `1` when a proxy or tunnel terminates TLS in front of this. |
 * | `WORLDLENS_SITE_LAN_HTTP` | `1` to allow plain HTTP on the local network (passkeys need HTTPS). |
 * | `WORLDLENS_MC_CONTAINER` | The Minecraft container's name (default `worldlens-mc`). |
 * | `WORLDLENS_MC_DIR` | The server folder as this program sees it (default `/data/server`). |
 * | `WORLDLENS_MC_NAME` | The server's display name. |
 */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AccountBook, type AccountsSnapshot } from "../main/mcserver/webconsole/accounts.js";
import type { SafeStorageLike } from "../main/mcserver/webconsole/password.js";
import { startWebConsoleServer } from "../main/mcserver/webconsole/server.js";
import {
    createServerRegistry,
    type ServerRecord,
    type ServerRegistry,
} from "../main/mcserver/registry.js";

export interface SiteConfiguration {
    readonly dataDirectory: string;
    readonly port: number;
    readonly host: string;
    readonly origin: string;
    readonly plainHttpAllowed: boolean;
    readonly container: string;
    readonly serverDir: string;
    readonly serverName: string;
}

export function readSiteConfiguration(env: Readonly<Record<string, string | undefined>>): {
    configuration: SiteConfiguration | null;
    problems: string[];
} {
    const problems: string[] = [];
    const port = Number.parseInt(env["WORLDLENS_SITE_PORT"] ?? "8443", 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        problems.push("WORLDLENS_SITE_PORT is not a port number.");
    const host = (env["WORLDLENS_SITE_HOST"] ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(host))
        problems.push(
            "WORLDLENS_SITE_HOST must be the host name people open, like mc-heapandyville.local.",
        );
    const origin = (env["WORLDLENS_SITE_ORIGIN"] ?? `https://${host}`).replace(/\/+$/, "");
    if (!/^https?:\/\/[^/]+$/.test(origin))
        problems.push(
            "WORLDLENS_SITE_ORIGIN must be an origin like https://mc-heapandyville.local.",
        );
    const container = env["WORLDLENS_MC_CONTAINER"] ?? "worldlens-mc";
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container))
        problems.push("WORLDLENS_MC_CONTAINER is not a container name.");
    const tls = env["WORLDLENS_BEHIND_TLS"] === "1";
    const lan = env["WORLDLENS_SITE_LAN_HTTP"] === "1";
    if (!tls && !lan)
        problems.push(
            "Set WORLDLENS_BEHIND_TLS=1 behind an HTTPS proxy or tunnel, or WORLDLENS_SITE_LAN_HTTP=1 to allow plain HTTP on this network.",
        );
    if (problems.length > 0) return { configuration: null, problems };
    return {
        configuration: {
            dataDirectory: env["WORLDLENS_DATA"] ?? "/data/state",
            port,
            host,
            origin,
            plainHttpAllowed: lan && !tls,
            container,
            serverDir: env["WORLDLENS_MC_DIR"] ?? "/data/server",
            serverName: (env["WORLDLENS_MC_NAME"] ?? "Minecraft server").slice(0, 80),
        },
        problems,
    };
}

const ACCOUNTS_FILE = "server-site-accounts.v1.json";

export async function loadAccounts(dataDirectory: string): Promise<AccountBook> {
    try {
        const snapshot = JSON.parse(
            await readFile(join(dataDirectory, ACCOUNTS_FILE), "utf8"),
        ) as AccountsSnapshot;
        if (snapshot.version !== 1)
            throw new Error(`Unknown accounts file version ${String(snapshot.version)}.`);
        return new AccountBook(snapshot);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return new AccountBook();
        // A damaged accounts file must not reopen owner sign-up to whoever arrives first.
        throw new Error(
            `The accounts file could not be read, so the site will not start: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/** Writes atomically and readable by this user only. */
export async function saveAccounts(
    dataDirectory: string,
    snapshot: AccountsSnapshot,
): Promise<void> {
    await mkdir(dataDirectory, { recursive: true });
    const target = join(dataDirectory, ACCOUNTS_FILE);
    const partial = `${target}.partial`;
    await writeFile(partial, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
    await chmod(partial, 0o600);
    await rename(partial, target);
}

/** Registers the appliance's own Minecraft container once, so the console can manage it. */
export async function ensureServerRecord(
    registry: ServerRegistry,
    configuration: SiteConfiguration,
    now: string,
): Promise<void> {
    const list = await registry.list();
    if (
        list.ok &&
        list.value.some(
            (r) => r.ref.kind === "local-docker" && r.ref.containerRef === configuration.container,
        )
    )
        return;
    const record: ServerRecord = {
        id: "appliance-server",
        name: configuration.serverName,
        flavour: "vanilla",
        minecraftVersion: null,
        ref: {
            kind: "local-docker",
            containerRef: configuration.container,
            serverDir: configuration.serverDir,
        },
        origin: "created",
        createdAt: now,
        updatedAt: now,
        hasRconSecret: false,
        rconPort: null,
        writeScope: [],
        localRuntime: null,
    } as unknown as ServerRecord;
    const put = await registry.put(record);
    if (!put.ok)
        throw new Error(`The appliance's server could not be registered: ${put.failure.message}`);
}

/** Accounts mode never stores the shared password, so no encryption is needed or offered. */
const NO_SHARED_PASSWORD: SafeStorageLike = {
    isEncryptionAvailable: () => false,
    encryptString: () => {
        throw new Error("This site uses named accounts, not a shared password.");
    },
    decryptString: () => {
        throw new Error("This site uses named accounts, not a shared password.");
    },
};

/* c8 ignore start -- process entry point */
export async function main(
    env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
    const { configuration, problems } = readSiteConfiguration(env);
    if (configuration === null) {
        for (const p of problems) process.stderr.write(`worldlens-server-site: ${p}\n`);
        process.exitCode = 1;
        return;
    }
    const registry = createServerRegistry({ dataFolder: configuration.dataDirectory });
    await ensureServerRecord(registry, configuration, new Date().toISOString());
    const book = await loadAccounts(configuration.dataDirectory);
    const handle = await startWebConsoleServer({
        registry,
        safeStorage: NO_SHARED_PASSWORD,
        dataFolder: configuration.dataDirectory,
        host: "0.0.0.0",
        port: configuration.port,
        tlsTerminated: !configuration.plainHttpAllowed,
        // Plain HTTP on the local network is the operator's explicit choice above.
        allowPlainHttp: configuration.plainHttpAllowed,
        accounts: {
            book,
            save: (snapshot) => saveAccounts(configuration.dataDirectory, snapshot),
            rpId: configuration.host,
            origin: configuration.origin,
            siteName: configuration.serverName,
        },
    });
    process.stdout.write(
        `Server management site on port ${handle.port}. ${book.openForOwner ? "The first person to open it becomes the owner." : "Sign-up is closed; join with an invitation."}${configuration.plainHttpAllowed ? " Plain HTTP: passkeys work only over HTTPS." : ""}\n`,
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.on(signal, () => void handle.close().then(() => process.exit(0)));
}
/* c8 ignore stop */
