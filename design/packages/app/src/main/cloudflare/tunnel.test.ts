/**
 * Tunnels, across all three runtimes, with no daemon and no remote machine.
 *
 * Three assertions here are load-bearing.
 *
 * **No runtime publishes a port.** A tunnel dials out, so there is nothing to publish and
 * a `-p` would open a hole this design does not need. That is the whole security argument
 * for hosting a map from your own machine this way, so it is asserted rather than assumed.
 *
 * **A container image must be digest-pinned.** Every other managed container in this app
 * is, and a tag that can change under you between runs is a poor thing to be holding a
 * tunnel into your own machine.
 *
 * **The token never appears in anything a person is shown.** It reaches the container
 * through an environment variable, and the surface renders a redacted command - because a
 * preflight panel showing the real argv puts a live credential into the next screenshot.
 */

import { describe, expect, it } from "vitest";
import {
    assertDigestPinned,
    describeTunnelCommand,
    probeTunnelRuntime,
    TUNNEL_OWNER_LABEL,
    tunnelContainerName,
    tunnelHostname,
    tunnelRunCommand,
    tunnelStopCommand,
    UnpinnedImageError,
} from "./tunnel.js";
import type { TunnelRuntime } from "./tunnel.js";
import type { CommandRunner } from "../runtime/command.js";

const TOKEN = "eyJhIjoiZmFrZS10dW5uZWwtdG9rZW4tdmFsdWUifQ==";
const PINNED = `cloudflare/cloudflared@sha256:${"a".repeat(64)}`;

const sshTarget = {
    host: "box.example",
    port: 22,
    user: "worldlens",
    identityFile: "/home/me/.ssh/id_ed25519",
    docker: "docker",
};

const runtimes: readonly { readonly name: string; readonly runtime: TunnelRuntime }[] = [
    { name: "host", runtime: { id: "host" } },
    { name: "docker", runtime: { id: "docker", image: { reference: PINNED } } },
    {
        name: "ssh",
        runtime: { id: "ssh", image: { reference: PINNED }, target: sshTarget },
    },
];

describe("every tunnel runtime", () => {
    for (const { name, runtime } of runtimes) {
        it(`publishes no port on the ${name} runtime`, () => {
            const { args } = tunnelRunCommand({
                runtime,
                tunnelId: "tunnel-1",
                tunnelToken: TOKEN,
                origin: "http://localhost:8100",
            });

            // The entire point: outbound only. A published port here would be a hole the
            // design does not need, on somebody's home machine.
            //
            // Scoped to the docker portion rather than the whole argv, because `-p` means
            // two different things: to docker it publishes a port, to ssh it selects one.
            // The first version of this asserted over everything and failed on the ssh
            // runtime's perfectly correct `-p 22` - a guard firing on correct code, which
            // teaches people to ignore it.
            const dockerStart = args.indexOf("run");
            const dockerArgs = dockerStart === -1 ? args : args.slice(dockerStart);

            expect(dockerArgs).not.toContain("-p");
            expect(dockerArgs).not.toContain("--publish");
            expect(dockerArgs.join(" ")).not.toMatch(/\b\d+:\d+\b/);
        });

        it(`never shows the token to a person on the ${name} runtime`, () => {
            const request = {
                runtime,
                tunnelId: "tunnel-1",
                tunnelToken: TOKEN,
                origin: "http://localhost:8100",
            };

            const shown = describeTunnelCommand(request);

            expect(shown).not.toContain(TOKEN);
            expect(shown).toContain("<tunnel token>");
        });
    }
});

describe("the container runtimes", () => {
    it("refuses an image that is not digest-pinned", () => {
        expect(() => assertDigestPinned("cloudflare/cloudflared:latest")).toThrow(
            UnpinnedImageError,
        );
        expect(() => assertDigestPinned("cloudflare/cloudflared")).toThrow(UnpinnedImageError);
        expect(() => assertDigestPinned(PINNED)).not.toThrow();
    });

    it("refuses to build a run command around an unpinned image", () => {
        expect(() =>
            tunnelRunCommand({
                runtime: { id: "docker", image: { reference: "cloudflare/cloudflared:latest" } },
                tunnelId: "tunnel-1",
                tunnelToken: TOKEN,
                origin: "http://localhost:8100",
            }),
        ).toThrow(UnpinnedImageError);
    });

    it("labels the container so it can be found again and nothing else is treated as ours", () => {
        const { args } = tunnelRunCommand({
            runtime: { id: "docker", image: { reference: PINNED } },
            tunnelId: "tunnel-abcdef123456789",
            tunnelToken: TOKEN,
            origin: "http://localhost:8100",
        });

        expect(args).toContain(TUNNEL_OWNER_LABEL);
        expect(args).toContain("com.worldlens.tunnel=tunnel-abcdef123456789");
        expect(args).toContain(tunnelContainerName("tunnel-abcdef123456789"));
    });

    it("passes the token as an environment variable, not an argument", () => {
        const { args } = tunnelRunCommand({
            runtime: { id: "docker", image: { reference: PINNED } },
            tunnelId: "tunnel-1",
            tunnelToken: TOKEN,
            origin: "http://localhost:8100",
        });

        // In `docker ps` output an argument is visible to anybody on the machine; an
        // environment variable at least requires an inspect.
        expect(args).toContain(`TUNNEL_TOKEN=${TOKEN}`);
        expect(args).not.toContain("--token");
    });
});

describe("the ssh runtime", () => {
    it("keeps host key checking on and password auth off", () => {
        const { command, args } = tunnelRunCommand({
            runtime: { id: "ssh", image: { reference: PINNED }, target: sshTarget },
            tunnelId: "tunnel-1",
            tunnelToken: TOKEN,
            origin: "http://localhost:8100",
        });

        expect(command).toBe("ssh");
        // A tunnel is a route into somebody's machine, which makes it the last place to
        // relax either of these.
        expect(args).toContain("StrictHostKeyChecking=yes");
        expect(args).toContain("PasswordAuthentication=no");
        expect(args).toContain("-i");
        expect(args).toContain(sshTarget.identityFile);
    });

    it("carries a key path and never a key", () => {
        const { args } = tunnelRunCommand({
            runtime: { id: "ssh", image: { reference: PINNED }, target: sshTarget },
            tunnelId: "tunnel-1",
            tunnelToken: TOKEN,
            origin: "http://localhost:8100",
        });
        expect(args.join(" ")).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    });
});

describe("stopping a tunnel", () => {
    it("removes the container on the container runtimes", () => {
        expect(tunnelStopCommand({ id: "docker", image: { reference: PINNED } }, "t1")).toEqual({
            command: "docker",
            args: ["rm", "--force", tunnelContainerName("t1")],
        });
    });

    it("has no command for the host runtime, which is a supervised process", () => {
        // Returning a plausible-looking command here would be worse than null: a caller
        // would run it, see it succeed, and believe the process had stopped.
        expect(tunnelStopCommand({ id: "host" }, "t1")).toBeNull();
    });
});

describe("probing a runtime", () => {
    it("reports a missing cloudflared as missing", async () => {
        const runner: CommandRunner = async () => ({
            ok: false,
            exitCode: null,
            stdout: "",
            stderr: "not found",
            spawnError: "ENOENT",
        });
        const result = await probeTunnelRuntime({ runtime: "host", runner });
        expect(result.usable).toBe(false);
        expect(result.detail).toMatch(/not installed/i);
    });

    it("accepts a cloudflared that answers", async () => {
        const runner: CommandRunner = async () => ({
            ok: true,
            exitCode: 0,
            stdout: "cloudflared version 2026.8.0",
            stderr: "",
            spawnError: null,
        });
        const result = await probeTunnelRuntime({ runtime: "host", runner });
        expect(result.usable).toBe(true);
    });
});

describe("the tunnel hostname", () => {
    it("only resolves through Cloudflare, which is why its record must be proxied", () => {
        expect(tunnelHostname("abc123")).toBe("abc123.cfargotunnel.com");
    });
});
