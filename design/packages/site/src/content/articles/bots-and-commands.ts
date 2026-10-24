import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const botsAndCommands: Article = {
    id: "bots-and-commands",
    title: "Discovered commands and bots",
    summary:
        "Commands built from the graph the server itself declares, previewed exactly before dispatch, and bots that join with a protected account. Protected account setup and connection-bound command execution are available through production provider wiring.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The production provider connects protected accounts, trusted endpoints and Mineflayer sessions. Baritone requires a separately prepared managed client. No real account, Java build or server connection has been exercised in this change.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A command graph comes from an authenticated connection's declare_commands packet or from the official data-generator report for the exact selected version, keeping every node, parser, redirect and suggestion provider.",
                        "Only verified serializers produce typed controls; every other parser keeps an explicit unavailable descriptor, and a raw copy is an expert fallback rather than a safety claim.",
                        "A preview is held in the main process for sixty seconds and consumed once. Execution revalidates target, connection epoch, permission revision, graph revision and the exact text before dispatching on the same principal.",
                        "Bots use the pinned Mineflayer 4.39.0 runtime or a separately built Baritone client for Minecraft 1.21.4, resolving only an opaque account reference through a protected provider.",
                        "Profiles use the exact versions declared by the installed runtime. Commands bind to the authenticated profile UUID and current connection; endpoint changes and reconnects invalidate earlier previews.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Save your registered Microsoft public application client ID, prepare an account label, then use Sign in to selected account. Complete the expiring Microsoft device prompt in the trusted application window. No client secret is requested. Deploy Mineflayer to obtain the actual server command graph. Baritone additionally requires a prepared Java 21/Fabric client, verified bridge and mod, and the approved hidden-desktop launcher; unavailable preparation remains explicit.",
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
                        "An unknown server returns the registry's own not-found answer.",
                        "Malformed requests, unsupported engines and non-finite coordinates are refused before the registrar is reached.",
                        "An expired or already executed preview is refused, as is a preview beyond the 128 outstanding limit or a seventeenth live bot.",
                        "A reconnect whose client has not finished disconnecting within five seconds stays pending and says so.",
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
                        "Renderer requests never provide executables, target proofs, account values or raw command strings. Dispatch always uses the principal that read the graph; an elevated console channel is never substituted. The Baritone bridge opens no control port, and every channel requires the application's own main frame as sender.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The focused suite has 32 passing tests and the focused TypeScript check passes using existing workspace dependencies. These cover protected account listing, configuration persistence, changed endpoint/session rejection and same-principal command dispatch. Real account consent, server connection, Java compilation, packaged worker loading and bot navigation remain unverified.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "mcserver-hosting",
            reason: "The servers a command graph and a bot session belong to.",
        },
        {
            articleId: "map-drawing-and-commands",
            reason: "Picking the points and regions a command needs directly on the map.",
        },
        {
            articleId: "server-configuration-editor",
            reason: "The other typed path into a server, through its files rather than its commands.",
        },
    ],
    sources: [
        {
            label: "docs/bots-and-commands.md",
            href: repoFile("docs/bots-and-commands.md"),
        },
        {
            label: "packages/app/src/main/mcserver/bots/README.md",
            href: repoFile("design/packages/app/src/main/mcserver/bots/README.md"),
        },
        {
            label: "packages/app/src/main/mcserver/bots/wiring.ts",
            href: repoFile("design/packages/app/src/main/mcserver/bots/wiring.ts"),
        },
    ],
};
