/**
 * Test doubles for the pieces that talk to a machine.
 *
 * Trimmed from the application's own `remote/fakes.ts` to exactly what this package needs.
 * The original also fakes a file-transfer layer that belongs to the deployment above this
 * one; copying it here would have dragged that layer along behind it, which is the thing
 * this extraction exists to avoid.
 */
import type { CommandOutput, CommandRunner } from "./command.js";
import type { SshTarget } from "./target.js";

/** A `CommandOutput` with every field set, so nothing is accidentally undefined. */
export function output(partial: Partial<CommandOutput> = {}): CommandOutput {
    return {
        ok: partial.ok ?? true,
        exitCode: partial.exitCode ?? (partial.ok === false ? 1 : 0),
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

export interface RecordedCommand {
    readonly command: string;
    readonly args: readonly string[];
}

export interface FakeRunner {
    readonly runner: CommandRunner;
    readonly calls: RecordedCommand[];
    /** Every argv joined, for a cheap "did it ever say this" assertion. */
    text(): string;
}

/**
 * A runner that answers from a table of matchers.
 *
 * Matched in order, first match wins, so a test can put the specific case first and a
 * catch-all last. An unmatched command is a **failure of the test**, reported as such
 * rather than silently succeeding - a fake that answers "fine" to a command nobody
 * anticipated is how a test passes for a code path that does not work.
 */
export function fakeRunner(
    table: readonly { readonly when: RegExp; readonly answer: CommandOutput }[],
): FakeRunner {
    const calls: RecordedCommand[] = [];
    return {
        calls,
        text(): string {
            return calls.map((call) => `${call.command} ${call.args.join(" ")}`).join("\n");
        },
        runner: (command, args) => {
            calls.push({ command, args: [...args] });
            const line = `${command} ${args.join(" ")}`;
            for (const entry of table) {
                if (entry.when.test(line)) return Promise.resolve(entry.answer);
            }
            return Promise.resolve(
                output({
                    ok: false,
                    exitCode: 127,
                    stderr: `the fake runner was not told what to answer for: ${line}`,
                }),
            );
        },
    };
}

/** A valid target, so a test that is about something else does not have to build one. */
export function testTarget(overrides: Partial<SshTarget> = {}): SshTarget {
    return {
        id: "render-box",
        label: "the render box",
        host: "render.example",
        port: 2222,
        user: "renderer",
        identityFile: null,
        workDir: "/srv/worldlens",
        docker: "docker",
        ...overrides,
    };
}

/** `docker version --format {{json .}}` from a host where everything is fine. */
export const DOCKER_AVAILABLE = output({
    stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }),
});

/** What a remote shell says when `docker` is not installed on it. */
export const DOCKER_NOT_FOUND = output({
    ok: false,
    exitCode: 127,
    stderr: "bash: line 1: docker: command not found",
});

export const SSH_AUTH_REFUSED = output({
    ok: false,
    exitCode: 255,
    stderr: "renderer@render.example: Permission denied (publickey).",
});

/** OpenSSH's banner when a recorded key and the offered key disagree. */
export const SSH_HOST_KEY_CHANGED = output({
    ok: false,
    exitCode: 255,
    stderr:
        "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
        "@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n" +
        "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
        "IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\n" +
        "Host key verification failed.",
});

/** What OpenSSH says when the host is simply not there. */
export const SSH_UNREACHABLE = output({
    ok: false,
    exitCode: 255,
    stderr: "ssh: connect to host render.example port 2222: Connection timed out",
});

/** What OpenSSH says the first time it meets a host, with StrictHostKeyChecking=yes. */
export const SSH_HOST_KEY_UNKNOWN = output({
    ok: false,
    exitCode: 255,
    stderr:
        "No ED25519 host key is known for [render.example]:2222 and you have requested strict checking.\n" +
        "Host key verification failed.",
});
