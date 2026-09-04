import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const mcserverHostProfiles: Article = {
    id: "mcserver-host-profiles",
    title: "SSH host profiles for Minecraft servers",
    summary:
        "Guided remote host profiles with strict key trust, loopback RCON forwarding, remote container discovery and a separate real-host evidence boundary.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "Profile persistence, strict trust, tunnel handling and remote discovery have focused proof on the integration candidate. A real isolated host and packaged Windows flow remain pending, so this article keeps those boundaries visible.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The wizard validates host, account, port, working folder, image and identity-file metadata before saving a bounded versioned record.",
                        "Host fingerprints are reviewed explicitly. A changed fingerprint is refused, and accepted keys are stored in the application-owned trust file.",
                        "RCON uses a bounded SSH local forward bound to loopback and closes it with the app session.",
                        "Remote container discovery reads actual identity, mounts, ports and blockers before the shared adoption review can save an ssh-docker record.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "definitions",
                    items: [
                        {
                            term: "Host profile",
                            description:
                                "A versioned record of connection metadata and an identity-file path, never key bytes or passphrases.",
                        },
                        {
                            term: "Trust decision",
                            description:
                                "An explicit review of an offered fingerprint, recorded only after a repeat scan matches it.",
                        },
                        {
                            term: "Remote adoption",
                            description:
                                "A reviewable path that turns an existing remote container into an app-owned server record.",
                        },
                    ],
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Malformed records, traversal attempts and invalid commands are refused before any connection starts.",
                        "Missing SSH, unreachable hosts, stopped daemons, authentication refusals and trust mismatches stay distinct and name the next action.",
                        "A tunnel that exits before readiness is reported as unreachable, while forgetting a profile removes only local metadata.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The connection uses strict host-key checking and key-only authentication. Secrets remain in the operating-system vault, remote RCON is loopback-only, and the app never deletes remote containers, worlds, keys or trust entries as a side effect of a local profile action.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Real-host evidence remains pending",
                    content:
                        "Focused tests cover persistence, validation, trust, tunnels, remote discovery and typed lifecycle operations. An isolated SSH host, daemon and packaged capture are pending in the final smoke pass.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "mcserver-hosting",
            reason: "The parent server article explains the four server destinations and adoption boundary.",
        },
        {
            articleId: "ssh-world-sources",
            reason: "World-source SSH uses the same key-only trust and transfer foundations.",
        },
        {
            articleId: "remote-hosting",
            reason: "Remote map hosting consumes the same SSH and container transport family.",
        },
    ],
    sources: [
        {
            label: "docs/mcserver-host-profiles.md",
            href: repoFile("docs/mcserver-host-profiles.md"),
        },
        {
            label: "packages/app/src/main/mcserver/hostProfiles.ts",
            href: repoFile("design/packages/app/src/main/mcserver/hostProfiles.ts"),
        },
        {
            label: "packages/app/src/main/transport/sshDocker.ts",
            href: repoFile("design/packages/app/src/main/transport/sshDocker.ts"),
        },
    ],
};
