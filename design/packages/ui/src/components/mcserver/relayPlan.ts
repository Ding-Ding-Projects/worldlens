/**
 * "Let players join": how players outside this network reach a Minecraft server.
 *
 * A Cloudflare tunnel carries the web pages (management site, live map) but not the game's raw
 * TCP and UDP ports. The relay route fixes that without opening anything on the home router:
 * a small public Linux machine (an Oracle Cloud Always Free VM, or any server reachable over
 * SSH) accepts players and forwards their traffic through a WireGuard tunnel that the server's
 * machine dials out to. This module writes everything that needs: fresh WireGuard keys, the
 * relay's cloud-init (or a setup script for an existing server), and the server side's tunnel
 * config. Nothing here talks to the network.
 *
 * Design: `design/design-sources/deploy-anywhere/Relay.dc.html`. Pure apart from key generation.
 */

export type RelayRoute = "router" | "oracle" | "ssh" | "local";

export interface ForwardedPort {
    readonly label: string;
    readonly port: number;
    readonly protocol: "tcp" | "udp";
}

export const DEFAULT_PORTS: readonly ForwardedPort[] = [
    { label: "Java players", port: 25565, protocol: "tcp" },
    { label: "Bedrock players (Geyser)", port: 19132, protocol: "udp" },
    { label: "Voice chat mod", port: 24454, protocol: "udp" },
    { label: "Server query", port: 25565, protocol: "udp" },
];

export const TUNNEL_PORT = 51820;
export const RELAY_ADDRESS = "10.77.0.1";
export const SERVER_ADDRESS = "10.77.0.2";

export interface KeyPair {
    readonly privateKey: string;
    readonly publicKey: string;
}

const b64 = (bytes: ArrayBuffer | Uint8Array): string =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** A WireGuard key pair (raw X25519, base64), made with Web Crypto. */
export async function wireGuardKeys(): Promise<KeyPair> {
    const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, [
        "deriveBits",
    ])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
    // PKCS#8 for X25519 ends with the 32-byte private scalar.
    return { privateKey: b64(pkcs8.slice(pkcs8.length - 32)), publicKey: b64(raw) };
}

export function portProblems(ports: readonly ForwardedPort[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of ports) {
        if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535)
            out.push(`${p.label}: the port must be from 1 to 65535.`);
        if (p.port === TUNNEL_PORT && p.protocol === "udp")
            out.push(`${p.label}: UDP ${TUNNEL_PORT} is used by the tunnel itself.`);
        const key = `${p.protocol}/${p.port}`;
        if (seen.has(key)) out.push(`${p.label}: ${key.toUpperCase()} is listed twice.`);
        seen.add(key);
    }
    if (ports.length === 0) out.push("Choose at least one port to forward.");
    return out;
}

/** Shell lines that open and forward the ports on the relay, idempotent across reboots. */
function forwardRules(ports: readonly ForwardedPort[]): string[] {
    const lines = [
        "sysctl -w net.ipv4.ip_forward=1",
        `iptables -C INPUT -p udp --dport ${TUNNEL_PORT} -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p udp --dport ${TUNNEL_PORT} -j ACCEPT`,
    ];
    for (const p of ports) {
        const spec = `-p ${p.protocol} --dport ${p.port}`;
        lines.push(
            `iptables -t nat -C PREROUTING ${spec} -j DNAT --to-destination ${SERVER_ADDRESS}:${p.port} 2>/dev/null || iptables -t nat -A PREROUTING ${spec} -j DNAT --to-destination ${SERVER_ADDRESS}:${p.port}`,
            `iptables -C FORWARD ${spec} -d ${SERVER_ADDRESS} -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 ${spec} -d ${SERVER_ADDRESS} -j ACCEPT`,
        );
    }
    lines.push(
        "iptables -C FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -m state --state ESTABLISHED,RELATED -j ACCEPT",
        // Replies must come back through the tunnel, so the server sees the relay as the sender.
        `iptables -t nat -C POSTROUTING -o wg0 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE`,
    );
    return lines;
}

export function relayWireGuardConfig(relay: KeyPair, server: KeyPair): string {
    return [
        "[Interface]",
        `Address = ${RELAY_ADDRESS}/24`,
        `ListenPort = ${TUNNEL_PORT}`,
        `PrivateKey = ${relay.privateKey}`,
        "",
        "[Peer]",
        `PublicKey = ${server.publicKey}`,
        `AllowedIPs = ${SERVER_ADDRESS}/32`,
        "",
    ].join("\n");
}

/** The server side: it dials out to the relay, so nothing opens on the home router. */
export function serverWireGuardConfig(server: KeyPair, relay: KeyPair, relayHost: string): string {
    return [
        "[Interface]",
        `Address = ${SERVER_ADDRESS}/24`,
        `PrivateKey = ${server.privateKey}`,
        "",
        "[Peer]",
        `PublicKey = ${relay.publicKey}`,
        `Endpoint = ${relayHost.trim() || "RELAY_PUBLIC_ADDRESS"}:${TUNNEL_PORT}`,
        `AllowedIPs = ${RELAY_ADDRESS}/32`,
        "PersistentKeepalive = 25",
        "",
    ].join("\n");
}

/** A setup script for any Debian or Ubuntu server (run once as root, e.g. over SSH). */
export function relaySetupScript(
    relay: KeyPair,
    server: KeyPair,
    ports: readonly ForwardedPort[],
): string {
    const rules = forwardRules(ports);
    return [
        "#!/bin/sh",
        "# WorldLens player relay: forwards Minecraft ports through a WireGuard tunnel.",
        "set -eu",
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get update -q && apt-get install -yq wireguard-tools iptables",
        "install -d -m 700 /etc/wireguard",
        "cat > /etc/wireguard/wg0.conf <<'WG'",
        relayWireGuardConfig(relay, server).trimEnd(),
        "WG",
        "chmod 600 /etc/wireguard/wg0.conf",
        "echo net.ipv4.ip_forward=1 > /etc/sysctl.d/90-worldlens-relay.conf",
        "cat > /usr/local/sbin/worldlens-relay-rules <<'RULES'",
        "#!/bin/sh",
        ...rules,
        "RULES",
        "chmod 755 /usr/local/sbin/worldlens-relay-rules",
        "/usr/local/sbin/worldlens-relay-rules",
        "systemctl enable --now wg-quick@wg0",
        "cat > /etc/systemd/system/worldlens-relay-rules.service <<'UNIT'",
        "[Unit]",
        "Description=WorldLens relay port forwarding",
        "After=network-online.target wg-quick@wg0.service",
        "[Service]",
        "Type=oneshot",
        "ExecStart=/usr/local/sbin/worldlens-relay-rules",
        "[Install]",
        "WantedBy=multi-user.target",
        "UNIT",
        "systemctl daemon-reload && systemctl enable worldlens-relay-rules.service",
        'echo "Relay ready."',
        "",
    ].join("\n");
}

/** cloud-init user data for a new Oracle Cloud (or any cloud-init) Ubuntu VM. */
export function relayCloudInit(
    relay: KeyPair,
    server: KeyPair,
    ports: readonly ForwardedPort[],
): string {
    const script = relaySetupScript(relay, server, ports)
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n");
    return [
        "#cloud-config",
        "write_files:",
        "  - path: /root/worldlens-relay-setup.sh",
        "    permissions: '0700'",
        "    content: |",
        script.trimEnd(),
        "runcmd:",
        "  - [sh, /root/worldlens-relay-setup.sh]",
        "",
    ].join("\n");
}

/** What the cloud's own firewall must allow, which no script on the VM can change. */
export function cloudFirewallRules(ports: readonly ForwardedPort[]): string[] {
    return [
        `UDP ${TUNNEL_PORT} (the tunnel)`,
        ...ports.map((p) => `${p.protocol.toUpperCase()} ${p.port} (${p.label})`),
    ];
}

/** Steps for the router route, which only the person can do in their router's settings. */
export function routerSteps(ports: readonly ForwardedPort[], serverLanAddress: string): string[] {
    return [
        "Open your router's settings page (often http://192.168.1.1 or the address printed on the router).",
        `Find "Port forwarding" and add one rule per port, pointing at ${serverLanAddress.trim() || "the server's local address"}:`,
        ...ports.map((p) => `${p.protocol.toUpperCase()} ${p.port} → ${p.port} (${p.label})`),
        "If your provider uses CGNAT (your router's internet address starts with 100.64 to 100.127), forwarding cannot work; use a relay instead.",
    ];
}
