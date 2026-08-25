import type { CommandRunner } from "./command.js";
import { powershellRemoteCommand } from "./windowsShell.js";

/**
 * Whether a remote machine is POSIX or Windows, and the three things that answer differs for.
 *
 * ## Why this is not a detail
 *
 * Almost everything about deploying a container is identical on both. Three things are not,
 * and each of them fails in a way that does not look like an operating-system problem:
 *
 *  - **Quoting.** A POSIX login shell has one complete answer (single quotes). Windows has
 *    none, because OpenSSH there defaults to `cmd.exe` and an administrator may set
 *    PowerShell instead, and the two disagree about everything. `windowsShell.ts` already
 *    solves this by refusing to quote at all - Base64 through `-EncodedCommand` contains no
 *    character any shell reinterprets - and this decides when to use it.
 *  - **Checking a port is really listening.** The POSIX probe is a bash builtin. On Windows
 *    there is no `/dev/tcp` and usually no bash, so the probe reports "not listening" for a
 *    service that started perfectly, and the deployment rolls back a container that worked.
 *  - **Which directories are refused.** `/etc` and `/usr` mean nothing on Windows, and
 *    `C:\Windows` means nothing on Linux. A refusal list for the wrong platform is not a
 *    weaker guard, it is an absent one.
 */
export type RemoteHostKind = "posix" | "windows";

/**
 * Ask the machine what it is.
 *
 * `uname` is the probe rather than something Windows-flavoured because its *failure* is as
 * informative as its success and costs nothing: a POSIX host answers, and a Windows host
 * does not have the command. Probing the other way round would mean starting PowerShell on
 * every POSIX host to be told it is not there.
 */
export async function detectHostKind(
    runner: CommandRunner,
    ssh: string,
    sshArguments: readonly string[],
): Promise<RemoteHostKind> {
    const answer = await runner(ssh, [...sshArguments, "uname -s"]);
    if (answer.ok && /linux|darwin|bsd|sunos|aix/i.test(answer.stdout)) return "posix";
    return "windows";
}

/**
 * A command that succeeds only if something is listening on a loopback port.
 *
 * The POSIX form is a bash builtin with nothing to install, which is what makes it usable on
 * a minimal server. Windows gets the .NET client through `-EncodedCommand`, which needs
 * nothing installed either and, crucially, needs no quoting: the Base64 alphabet contains no
 * character `cmd.exe` or PowerShell would reinterpret, so it survives whichever of them the
 * host has as its login shell.
 *
 * Both exit non-zero when nothing answers, so the caller reads an exit code either way.
 */
export function loopbackProbeCommand(kind: RemoteHostKind, port: number): string {
    if (kind === "posix")
        return `timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/${String(port)}' 2>/dev/null`;
    const script = [
        "$ErrorActionPreference = 'Stop'",
        "$client = New-Object System.Net.Sockets.TcpClient",
        `$connect = $client.BeginConnect('127.0.0.1', ${String(port)}, $null, $null)`,
        "$ok = $connect.AsyncWaitHandle.WaitOne(5000, $false)",
        "$client.Close()",
        "if (-not $ok) { exit 1 }",
        "exit 0",
    ].join("; ");
    return powershellRemoteCommand(script);
}

/**
 * Directories nothing may be staged into, per platform.
 *
 * Both lists are deliberately shorter than "everything that matters". They name the places
 * where writing is definitely a mistake, not the places where writing is merely unusual: a
 * remote account's own home directory is exactly where a deployment belongs, and a list that
 * refused it would be one people work around rather than one they trust.
 */
export const REFUSED_ROOTS: Readonly<Record<RemoteHostKind, readonly string[]>> = Object.freeze({
    posix: Object.freeze(["/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/sbin", "/sys", "/usr"]),
    windows: Object.freeze([
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "c:\\$recycle.bin",
    ]),
});

/** Whether this path is somewhere a deployment may stage files. */
export function stagingPathRefusal(kind: RemoteHostKind, path: string): string | null {
    const given = path.trim();
    if (given === "") return "No directory was given.";
    if (given.includes("\0")) return "That path contains a character a path cannot contain.";

    if (kind === "windows") {
        const normalised = given.replace(/\//g, "\\").toLowerCase().replace(/\\+$/, "");
        // A bare drive root, and a UNC server or share root, are both "the whole machine"
        // rather than a directory on it.
        if (/^[a-z]:$/.test(normalised) || /^[a-z]:\\$/.test(normalised))
            return `${given} is a whole drive rather than a directory on it.`;
        if (/^\\\\[^\\]+(\\[^\\]+)?$/.test(normalised))
            return `${given} is a whole share rather than a directory in it.`;
        for (const root of REFUSED_ROOTS.windows)
            if (normalised === root || normalised.startsWith(`${root}\\`))
                return `${given} is inside ${root}, which is a system directory on the remote host.`;
        if (!/^[a-z]:\\/.test(normalised) && !normalised.startsWith("\\\\"))
            return `${given} is not an absolute Windows path.`;
        return null;
    }

    const normalised = given.replace(/\/+$/, "");
    if (!normalised.startsWith("/") && !normalised.startsWith("~"))
        return `${given} is not an absolute path.`;
    if (normalised === "/") return "The filesystem root is not a directory to stage into.";
    for (const root of REFUSED_ROOTS.posix)
        if (normalised === root || normalised.startsWith(`${root}/`))
            return `${given} is inside ${root}, which is a system directory on the remote host.`;
    return null;
}
