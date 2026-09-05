import type { Article } from "../types.js";
import { WORLD_DOWNLOADER_DOC_URL, repoFile } from "../links.js";

export const worldDownloader: Article = {
    id: "world-downloader",
    title: "Get a world off a live server",
    summary:
        "Connect to a Minecraft server as an ordinary client and save every chunk it sends to a folder on this computer, using the bundled Fabric Carpet world downloader.",
    category: "application",
    status: "ported-unverified",
    statusNote:
        "main/worlddownloader/ was a complete, tested module registered nowhere in main/index.ts - a feature wired at one end and consumed at neither. It is now registered, reachable through window.worldlens.worldDownloader, and rendered by a real screen backed by focused tests and two wiring guards. No end-to-end run against a live Minecraft server was performed: that would need a real server to connect to, which this pass did not have.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    ordered: true,
                    items: [
                        "Get the downloader tool once (ensureJar), which downloads and verifies the Fabric Carpet world downloader jar into this application's own data directory.",
                        "Fill in server address, output folder, declared Minecraft version, and the account to connect with (Microsoft, an existing token, or offline).",
                        "Test the connection, which pings the server directly and reports whether its real protocol matches the declared version.",
                        "Start the download. The main process re-validates the settings, resolves an already-installed Java, and spawns the jar as a real subprocess.",
                        "Watch it run: real session events (log lines, sign-in prompts, phase changes) are fanned to every open window and rendered live.",
                        "Stop it, or let it finish - a finished event carries real byte counts, chunk counts and a per-dimension breakdown.",
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
                            term: "Server address",
                            description:
                                "Exactly what would be typed into Minecraft's own server list - host, or host:port.",
                        },
                        {
                            term: "Account mode",
                            description:
                                "Microsoft account, an existing access token, or offline/cracked. Only token mode has a saved secret, held in this application's own secret store and never sent back to the renderer.",
                        },
                        {
                            term: "Java",
                            description:
                                "Resolved through discoverJava() with this build's packaged resourcesPath, matching every other Java-resolving call site. Nothing here provisions a JVM; a status poll can never trigger a download.",
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
                    kind: "definitions",
                    items: [
                        {
                            term: "No jar yet",
                            description: "The get-the-downloader step is offered before start is enabled.",
                        },
                        {
                            term: "No Java",
                            description:
                                "Reported as a fact on the status card; start stays disabled rather than failing after launch.",
                        },
                        {
                            term: "Port already taken",
                            description:
                                "worlddownloader:portFree binds and releases the real port rather than reading a socket table, so a lingering close state cannot produce a false \"free\".",
                        },
                        {
                            term: "Connection refused",
                            description:
                                "start() answers ok:false with the real message from the tool; the screen shows it rather than throwing.",
                        },
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "The access token is typed into its own main-process-owned intake window, never into this application’s ordinary renderer; the bridge only opens that window and clears whatever is held. Status only reports whether a token is held, never its value.",
                        "worlddownloader:start re-validates the settings server-side with the same validator the renderer's own form uses, because a released renderer and a released main process are separate artifacts that can drift.",
                        "Redacted session arguments let the status surface show what a running session was launched with, by index, without ever holding the secret itself.",
                    ],
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "worldDownloaderWiring.test.ts reads main/index.ts's real source and proves startWorldDownloader() supplies a real data directory, safe storage, a non-provisioning Java resolver and an event fan-out - the same discipline bundledRuntimeWiring.test.ts already applies elsewhere. channels.test.ts and factory.test.ts prove the bridge namespace and the channel inventory agree in both directions. worldDownloaderBridge.test.ts proves the renderer resolver refuses a partial namespace, and WorldDownloaderScreen.test.ts mounts the real screen against an injected fake bridge to prove the unavailable, blocked, populated-from-real-settings and failed-start states all render honestly.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "No live server was reached",
                    content:
                        "This pass wired the module to a real screen and proved every seam with focused tests; it did not run the downloader against a real Minecraft server, which would need one to connect to.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "docker-world-source",
            reason: "The other input route with the identical \"fully built module, not yet wired\" shape this document closes.",
        },
        {
            articleId: "world-reading",
            reason: "Where a world this downloader saves rejoins ordinary world validation.",
        },
        {
            articleId: "backups",
            reason: "A natural next step for a world just pulled off a live server.",
        },
    ],
    sources: [
        { label: "docs/world-downloader.md", href: WORLD_DOWNLOADER_DOC_URL },
        {
            label: "WorldDownloaderScreen.vue",
            href: repoFile(
                "design/packages/ui/src/components/worlddownloader/WorldDownloaderScreen.vue",
            ),
        },
        {
            label: "worldDownloaderBridge.ts",
            href: repoFile(
                "design/packages/ui/src/components/worlddownloader/worldDownloaderBridge.ts",
            ),
        },
        { label: "main/worlddownloader", href: repoFile("design/packages/app/src/main/worlddownloader") },
    ],
};
