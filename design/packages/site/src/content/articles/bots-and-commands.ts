import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const botsAndCommands: Article = {
    id: "bots-and-commands",
    title: "Discovered commands and bots",
    summary:
        "Commands built from the graph the server itself declares, previewed exactly before dispatch, and bots that join with a protected account. In this build the workflow answers with its exact unavailable reason.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "The command and bot modules have focused proof and their channels are registered on the integrated tree, but no protected account store, protocol connection or Baritone client build exists yet, so every engine is reported unavailable with that reason. No real account, client or server connection has been exercised.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                { kind: "list", items: [
                        "A command graph comes from an authenticated connection's declare_commands packet or from the official data-generator report for the exact selected version, keeping every node, parser, redirect and suggestion provider.",
                        "Only verified serializers produce typed controls; every other parser keeps an explicit unavailable descriptor, and a raw copy is an expert fallback rather than a safety claim.",
                        "A preview is held in the main process for sixty seconds and consumed once. Execution revalidates target, connection epoch, permission revision, graph revision and the exact text before dispatching on the same principal.",
                        "Bots use the pinned Mineflayer 4.39.0 runtime or a separately built Baritone client for Minecraft 1.21.4, resolving only an opaque account reference through a protected provider.",
                        "In this build, profiles are described from the server record and the installed runtime, and every engine is reported unavailable because no protocol connection or protected account store exists.",
                    ] },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                { kind: "paragraph", content: "Enabling the workflow needs a protected account setup flow with a Microsoft public client id, a trusted command target that owns a live protocol connection and its command lock, and for Baritone the Java client bridge built after the Java 21 and Gradle bootstrap. None of these are configured in this build, and the channels say so instead of failing silently." },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                { kind: "list", items: [
                        "An unknown server returns the registry's own not-found answer.",
                        "Malformed requests, unsupported engines and non-finite coordinates are refused before the registrar is reached.",
                        "An expired or already executed preview is refused, as is a preview beyond the 128 outstanding limit or a seventeenth live bot.",
                        "A reconnect whose client has not finished disconnecting within five seconds stays pending and says so.",
                    ] },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                { kind: "paragraph", content: "Renderer requests never provide executables, target proofs, account values or raw command strings. Dispatch always uses the principal that read the graph; an elevated console channel is never substituted. The Baritone bridge opens no control port, and every channel requires the application's own main frame as sender." },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                { kind: "paragraph", content: "On the integrated tree the lane's 23 command and bot tests, the 5 bot wiring tests and the bridge channel inventory tests pass and the app package typechecks. Not verified and not claimed: any real account, client, server connection, Java compilation or bot navigation." },
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
