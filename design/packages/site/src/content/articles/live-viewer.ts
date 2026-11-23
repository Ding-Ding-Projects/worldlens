import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const liveViewer: Article = {
    id: "live-viewer",
    title: "Live 3D viewer with a mineflayer bot",
    summary:
        "Host Prismarine Viewer or Prismarine Web Client together with a mineflayer bot on your server, configured entirely with controls, and get a network link to watch the world live.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "On the default branch. A real Docker run against a vanilla 1.20.4 server passed on 2026-11-23: the bot joined and the viewer page answered from this PC. Microsoft sign-in is not wired in this build, and SSH hosting and the arm64 image have not been run.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "Choose Prismarine Viewer or Prismarine Web Client, a managed server or an address, the game version, the bot name, and where it runs.",
                        "Viewer controls: view distance, follow camera or first person, mouse look, showing other players and chat beside the view.",
                        "Bot behaviours: reconnect after a kick with a delay and a number of tries, follow a player, look at nearby players, relay chat to the page, and sleep at night.",
                        "The result is a network link with Open and Copy, and the instance joins the Hosted instances page.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "The viewer image is built at build time and shipped inside the application. Settings go into the container as a configuration file; nothing secret is ever placed on a command line. Offline names work on servers in offline mode. Microsoft sign-in needs the bot account service, which this build does not wire yet, so the dialog says it is not available." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "A server that never answers is reported after a 45 second join deadline instead of waiting silently.",
                        "Prismarine Web Client's proxy only reaches the one configured server.",
                        "A missing image in this build is named rather than downloaded.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "The container runs as a non-root user with a read-only filesystem. Each installation manages only the containers it created, recognised by its own installation id." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "Unit tests cover configuration, the hosting plan and the dialog. A real Docker run joined a real server and served the viewer and the web client. Not verified: Microsoft sign-in, SSH hosting, the arm64 image, and Web Client rendering in a browser." },
            ],
        },
    ],
    suggested: [
        { articleId: "share-host", reason: "Host the rendered map instead of a live view." },
        { articleId: "bots-and-commands", reason: "The bots that run inside the server manager." },
    ],
    sources: [{ label: "docs/live-viewer.md", href: repoFile("docs/live-viewer.md") }],
};
