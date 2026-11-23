import { describe, expect, it } from "vitest";
import {
    DEFAULT_PORTS,
    cloudFirewallRules,
    portProblems,
    relayCloudInit,
    relaySetupScript,
    routerSteps,
    serverWireGuardConfig,
    wireGuardKeys,
} from "./relayPlan.js";

describe("player relay plan", () => {
    it("makes real 32-byte WireGuard keys", async () => {
        const k = await wireGuardKeys();
        expect(atob(k.privateKey)).toHaveLength(32);
        expect(atob(k.publicKey)).toHaveLength(32);
        expect(k.privateKey).not.toBe((await wireGuardKeys()).privateKey);
    });

    it("forwards each chosen port and protocol through the tunnel, on any reboot", async () => {
        const relay = await wireGuardKeys();
        const server = await wireGuardKeys();
        const ports = DEFAULT_PORTS.slice(0, 2);
        const script = relaySetupScript(relay, server, ports);
        expect(script).toContain("-p tcp --dport 25565 -j DNAT --to-destination 10.77.0.2:25565");
        expect(script).toContain("-p udp --dport 19132 -j DNAT --to-destination 10.77.0.2:19132");
        expect(script).toContain(`PublicKey = ${server.publicKey}`);
        expect(script).toContain("systemctl enable --now wg-quick@wg0");
        expect(script).not.toContain(server.privateKey);
        const cloud = relayCloudInit(relay, server, ports);
        expect(cloud.startsWith("#cloud-config\n")).toBe(true);
        expect(cloud).toContain("      iptables -t nat");
        const side = serverWireGuardConfig(server, relay, "141.147.88.20");
        expect(side).toContain("Endpoint = 141.147.88.20:51820");
        expect(side).toContain("PersistentKeepalive = 25");
        expect(side).not.toContain(relay.privateKey);
        expect(cloudFirewallRules(ports)).toEqual([
            "UDP 51820 (the tunnel)",
            "TCP 25565 (Java players)",
            "UDP 19132 (Bedrock players (Geyser))",
        ]);
    });

    it("refuses clashing ports and explains the router route", () => {
        expect(portProblems([])).toHaveLength(1);
        expect(portProblems([{ label: "x", port: 51820, protocol: "udp" }]).join()).toMatch(
            /tunnel/,
        );
        expect(
            portProblems([
                { label: "a", port: 1, protocol: "tcp" },
                { label: "b", port: 1, protocol: "tcp" },
            ]).join(),
        ).toMatch(/twice/);
        expect(routerSteps(DEFAULT_PORTS.slice(0, 1), "192.168.1.20").join("\n")).toContain(
            "pointing at 192.168.1.20",
        );
    });
});
