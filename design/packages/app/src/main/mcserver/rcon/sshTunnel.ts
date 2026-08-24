/** A bounded loopback-only SSH forward for a remote Docker server's RCON socket. */

import { createServer } from "node:net";
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

export async function openSshRconTunnel(options: SshRconTunnelOptions): Promise<Answer<SshRconTunnel>> {
    if (!Number.isInteger(options.remotePort) || options.remotePort < 1 || options.remotePort > 65_535) {
        return fail("invalid-request", "The remote RCON port is not valid.");
    }
    let reservation: Awaited<ReturnType<typeof reserveLoopbackPort>>;
    try {
        reservation = await reserveLoopbackPort();
    } catch (error) {
        return fail("denied", "A loopback RCON port could not be reserved.", String(error));
    }
    const command = options.sshBinary ?? "ssh";
    const args = sshRconForwardArguments(options.ssh, reservation.port, options.remotePort);
    const launch = options.spawnProcess ?? ((file, argv) => spawn(file, argv, { stdio: "ignore", windowsHide: true }));
    let child: ChildProcess;
    try {
        child = launch(command, args);
    } catch (error) {
        reservation.server.close();
        return fail("unreachable", "The SSH RCON tunnel could not be started.", String(error));
    }
    await new Promise<void>((resolve) => reservation.server.close(() => resolve()));
    let exitedEarly = false;
    let exitDetail = "";
    const exit = new Promise<void>((resolve) => {
        child.once("exit", (code, signal) => {
            exitedEarly = true;
            exitDetail = `exit=${String(code)} signal=${String(signal)}`;
            resolve();
        });
    });
    const settleMs = Math.max(50, Math.min(options.settleMs ?? 250, 2_000));
    await Promise.race([exit, new Promise<void>((resolve) => setTimeout(resolve, settleMs))]);
    if (exitedEarly) {
        return fail("unreachable", "The SSH RCON tunnel closed before it became ready.", exitDetail);
    }
    return ok({
        localPort: reservation.port,
        async close(): Promise<void> {
            if (child.exitCode !== null || child.signalCode !== null) return;
            child.kill();
            await new Promise<void>((resolve) => child.once("exit", () => resolve()));
        },
    });
}
