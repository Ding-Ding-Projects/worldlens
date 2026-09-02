/** A bounded loopback-only SSH forward for a remote Docker server's RCON socket. */

import { createConnection, createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";

import { sshSecurityOptions, type SshOptionsInput } from "../../remote/ssh.js";
import { destination } from "../../remote/target.js";
import { fail, ok, type Answer } from "../transport/types.js";

export interface SshRconTunnel {
    readonly localPort: number;
    close(): Promise<void>;
}

export interface SshRconTunnelOptions {
    readonly ssh: SshOptionsInput;
    readonly remotePort: number;
    readonly sshBinary?: string;
    readonly spawnProcess?: (command: string, args: readonly string[]) => ChildProcess;
    readonly settleMs?: number;
    readonly retries?: number;
}

export function sshRconForwardArguments(ssh: SshOptionsInput, localPort: number, remotePort: number): readonly string[] {
    return [
        ...sshSecurityOptions(ssh),
        "-o",
        "ExitOnForwardFailure=yes",
        "-N",
        "-T",
        "-L",
        `127.0.0.1:${String(localPort)}:127.0.0.1:${String(remotePort)}`,
        "-p",
        String(ssh.target.port),
        destination(ssh.target),
    ];
}

async function reserveLoopbackPort(): Promise<{ readonly server: ReturnType<typeof createServer>; readonly port: number }> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: 0 }, () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
        server.close();
        throw new Error("The local loopback port could not be determined.");
    }
    return { server, port: address.port };
}

async function closeChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        child.once("exit", () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function probeLoopback(port: number, deadlineMs: number): Promise<boolean> {
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
        const connected = await new Promise<boolean>((resolve) => {
            const socket = createConnection({ host: "127.0.0.1", port });
            const finish = (value: boolean): void => {
                socket.removeAllListeners();
                socket.destroy();
                resolve(value);
            };
            socket.once("connect", () => finish(true));
            socket.once("error", () => finish(false));
            socket.setTimeout(100, () => finish(false));
        });
        if (connected) return true;
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return false;
}

export async function openSshRconTunnel(options: SshRconTunnelOptions): Promise<Answer<SshRconTunnel>> {
    if (!Number.isInteger(options.remotePort) || options.remotePort < 1 || options.remotePort > 65_535) {
        return fail("invalid-request", "The remote RCON port is not valid.");
    }
    const command = options.sshBinary ?? "ssh";
    const launch = options.spawnProcess ?? ((file, argv) => spawn(file, argv, { stdio: "ignore", windowsHide: true }));
    const settleMs = Math.max(50, Math.min(options.settleMs ?? 250, 2_000));
    const retries = Math.max(0, Math.min(options.retries ?? 2, 3));
    let lastFailure = "The SSH RCON tunnel did not become ready.";
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        let reservation: Awaited<ReturnType<typeof reserveLoopbackPort>>;
        try {
            reservation = await reserveLoopbackPort();
        } catch (error) {
            return fail("denied", "A loopback RCON port could not be reserved.", String(error));
        }
        const localPort = reservation.port;
        // The reservation must be released before ssh starts. Keeping it bound makes the
        // real ssh process fail its own -L bind with address-in-use.
        await new Promise<void>((resolve) => reservation.server.close(() => resolve()));
        const args = sshRconForwardArguments(options.ssh, localPort, options.remotePort);
        let child: ChildProcess;
        try {
            child = launch(command, args);
        } catch (error) {
            lastFailure = String(error);
            continue;
        }
        let processErrorMessage: string | null = null;
        let exitedEarly = false;
        let exitDetail = "";
        const exit = new Promise<void>((resolve) => {
            child.once("error", (error) => {
                processErrorMessage = error instanceof Error ? error.message : String(error);
                resolve();
            });
            child.once("exit", (code, signal) => {
                exitedEarly = true;
                exitDetail = `exit=${String(code)} signal=${String(signal)}`;
                resolve();
            });
        });
        const ready = probeLoopback(localPort, settleMs);
        await Promise.race([ready, exit, new Promise<void>((resolve) => setTimeout(resolve, settleMs))]);
        if (processErrorMessage !== null) {
            lastFailure = processErrorMessage;
            await closeChild(child);
            continue;
        }
        if (exitedEarly) {
            lastFailure = exitDetail;
            await closeChild(child);
            continue;
        }
        if (await ready) {
            return ok({
                localPort,
                async close(): Promise<void> {
                    await closeChild(child);
                },
            });
        }
        lastFailure = "The SSH process stayed alive but its loopback forward never accepted a connection.";
        await closeChild(child);
    }
    return fail("unreachable", "The SSH RCON tunnel could not be made ready.", lastFailure);
}
