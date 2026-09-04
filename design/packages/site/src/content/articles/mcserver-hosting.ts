import type { Article } from "../types.js";
import {
    MCSERVER_AWS_DOC_URL,
    MCSERVER_CONFIG_DOC_URL,
    MCSERVER_MANAGER_DOC_URL,
    MCSERVER_PLUGINS_DOC_URL,
    MCSERVER_TRANSPORT_DOC_URL,
    MCSERVER_WEB_CONSOLE_DOC_URL,
    repoFile,
} from "../links.js";

export const mcserverHosting: Article = {
    id: "mcserver-hosting",
    title: "Running the Minecraft server, not only its map",
    summary:
        "Installing a Minecraft server, editing every one of its settings as a real control, running its console, managing its plugins and its players - all from the application, over a local process, a local Docker container, a container reached over SSH, or a browser talking to a locally hosted web console.",
    category: "application",
    status: "shipped",
    statusNote:
        "The transport layer, registry, config editor, RCON console, player and plugin managers and web console are wired into the Minecraft servers destination and covered by focused tests. The adoption event and review route are mounted through the application shell, while real Docker, SSH, Java and packaged Windows evidence remain separate pending proof. The AWS transport still has a tested backend without a screen that leads to it.",

    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content: [
                        "The rule that shapes the whole feature: ",
                        { strong: "nothing in it is configured by typing." },
                        " No command, no hand-edited file. Every setting - every key in ",
                        { code: "server.properties" },
                        ", every nested key in ",
                        { code: "paper-global.yml" },
                        ", every plugin's own ",
                        { code: "config.yml" },
                        " - is a real typed control. A boolean is a switch, ",
                        { code: "difficulty" },
                        " is a menu, ",
                        { code: "view-distance" },
                        " is a stepper that knows it stops at 32, a port is a stepper bounded to ",
                        "1-65535, and a colour opens the colour picker. Free text is reserved for ",
                        "things that genuinely are prose, like the message of the day.",
                    ],
                },
                {
                    kind: "table",
                    caption: "Where a server can live, and how the application reaches it",
                    columns: ["Where", "How"],
                    rows: [
                        ["A process on this computer", "A Java runtime the application downloads for it"],
                        ["A container on this computer", "The local Docker daemon"],
                        ["A container on another machine", "The same commands, over SSH"],
                        [
                            "An EC2 instance the app provisions",
                            [
                                "Priced, idempotent, tag-verified - and not reachable from any screen yet; see ",
                                { link: "AWS", href: MCSERVER_AWS_DOC_URL, external: true },
                                ".",
                            ],
                        ],
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Opening a server shows a tabbed panel with four real screens: a console that reads ",
                        "the server's log and sends commands over RCON, a config editor built from the ",
                        "document model described in the configuration section below, a plugin manager ",
                        "that searches Hangar, Modrinth and SpigotMC, and three player tables (whitelist, ",
                        "operators, bans) with an add-player dialog.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "Choosing a version is a picker over a live catalogue, not a text field: Vanilla ",
                        "reads Mojang's manifest, Purpur and Fabric read their own project APIs, and Paper ",
                        "and Velocity read PaperMC's v3 API, each entry carrying a release date and a ",
                        "verifiable SHA-256, with a link to the version's page on the Minecraft Wiki built ",
                        "from its name rather than looked up. Typing a version is possible only behind an ",
                        "explicit switch, for one published after the catalogue was fetched.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "Adoption is wired, packaged proof remains",
                    content: [
                        "A server this app did not create is meant to be adopted through a review dialog ",
                        "that shows exactly what will and will not be permitted before the server joins ",
                        "the list. That dialog, and the read-only discovery logic behind it, are built and ",
                        "tested. The button that opens it - ",
                        { code: "ServerListScreen.vue" },
                        "'s \"Adopt an existing server\" control - emits the event consumed by the mounted ",
                        "adoption flow at each application mount site in ",
                        { code: "App.vue" },
                        ". Candidate containers are listed before the review dialog. Packaged interaction and ",
                        "a real remote daemon remain pending evidence, so this article does not turn source ",
                        "wiring into a runtime claim.",
                    ],
                },
                {
                    kind: "paragraph",
                    content: [
                        "A server's console, config, plugins and players are also reachable from an ",
                        "ordinary browser rather than only from the desktop shell, through a locally ",
                        "hosted, password-protected HTTP server started and stopped from the same panel - ",
                        "see ",
                        { link: "the web console article", href: MCSERVER_WEB_CONSOLE_DOC_URL, external: true },
                        " for its sign-in, sessions and unlock ladder.",
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
                    content: [
                        "The editor never round-trips a configuration through a plain object. It parses ",
                        "the file into a document that keeps the original bytes, comments, blank lines and ",
                        "ordering, and a schema describes only some of those entries so they can render as ",
                        "controls - a key the schema has never heard of is just another node in the ",
                        "document, so a save that changes one setting cannot drop a setting it did not ",
                        "understand. Writes are whole-file, hash-gated against the copy the caller last ",
                        "read, and refused as ",
                        { code: "stale-document" },
                        " rather than silently discarding a change that landed in between.",
                    ],
                },
                {
                    kind: "table",
                    caption: "What kind of setting becomes what kind of control",
                    columns: ["Setting kind", "Control", "Examples"],
                    rows: [
                        ["A yes/no", "Switch", [{ code: "pvp" }, ", ", { code: "online-mode" }, ", ", { code: "hardcore" }]],
                        ["A fixed set of choices", "Menu", [{ code: "difficulty" }, ", ", { code: "gamemode" }]],
                        ["A bounded number", "Bounded stepper", [{ code: "view-distance" }, " (2-32), ", { code: "max-players" }]],
                        ["A port", "Stepper, 1-65535", [{ code: "server-port" }, ", ", { code: "rcon.port" }]],
                        ["A colour", "Infinite colour picker", "chat and MOTD colours"],
                        ["A folder or file", "Field with a native browse button", "world and plugin locations"],
                        ["Records", "A table with an add dialog", "operators, whitelist, bans"],
                        ["Genuine prose", "A text box - and only here", "the message of the day"],
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
                        "Every bridge call answers ok/failure rather than throwing; a failed list load keeps whatever was last shown instead of rendering an empty list, because an empty list is a claim of zero servers and a failed read is a different, honest claim.",
                        "A control whose action cannot succeed - an unreachable host, a read-only transport, an adopted server whose owner never granted a permission - is disabled with the exact reason named in its own tooltip.",
                        [
                            "The transport layer keeps ",
                            { code: "unreachable" },
                            " and ",
                            { code: "not-running" },
                            " as separate failure codes on purpose: liveness is judged by asking Docker ",
                            "directly, never by noticing that log output stopped, so a lost connection is ",
                            "never rendered as a restart button for a server that is actually running fine.",
                        ],
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
                        "An RCON password, when one exists, never reaches the renderer - the record only carries whether one is set, and the secret lives in the operating system credential vault.",
                        "An adopted server's write scope is enforced by the transport asking its own capabilities before offering a control, rather than the screen trusting itself. The source path is wired, and the packaged remote-daemon interaction remains pending (see behaviour, above).",
                        "Forgetting a server never deletes anything outside this app's own list, and says so explicitly in the same two-key super-confirmation gate every other destructive action here uses.",
                        "Player-list edits go through the same write-capability gate and stale-hash protection as any other file write.",
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
                        "Several hundred tests across ",
                        { code: "packages/app/src/main/mcserver/" },
                        " and ",
                        { code: "packages/ui/src/components/mcserver/" },
                        " cover the registry, all three transports, config parsing and round-tripping, ",
                        "the console session and RCON, players, plugins, adoption scoring and consent, the ",
                        "web console, and AWS planning - all against fakes and in-memory transports. A ",
                        "dedicated seam guard, ",
                        { code: "mcserverShellWiring.test.ts" },
                        ", proves the real ",
                        { code: "App.vue" },
                        " actually wires the store, the workspace job and its catalogue entry to the real ",
                        "screens.",
                    ],
                },
                {
                    kind: "callout",
                    tone: "warning",
                    title: "What that does not prove",
                    content: [
                        "No test in this pass drives a real Docker daemon, a real SSH host, a real ",
                        { code: "java -jar" },
                        " process, or a real AWS account. Source-level adoption wiring is covered by the ",
                        "seam guard, while packaged interaction and isolated-host evidence remain pending ",
                        "and are not inferred from that guard.",
                    ],
                },
            ],
        },
    ],

    suggested: [
        {
            articleId: "backups",
            reason: "The same server registry a rendered map and its world can be backed up from.",
        },
        {
            articleId: "docker-and-local",
            reason: "The same local-Docker foundation a Minecraft server container and a render container both run on.",
        },
        {
            articleId: "ssh-world-sources",
            reason: "The same key-only SSH connection style, reused here for a server reached over SSH instead of a world.",
        },
        {
            articleId: "mcserver-host-profiles",
            reason: "The guided host profile and remote adoption details behind this server destination.",
        },
        {
            articleId: "minecraft-version-catalogue",
            reason: "The complete version rows and family picker used by the New server wizard.",
        },
    ],

    sources: [
        { label: "docs/mcserver-transport.md", href: MCSERVER_TRANSPORT_DOC_URL },
        { label: "docs/mcserver-config.md", href: MCSERVER_CONFIG_DOC_URL },
        { label: "docs/minecraft-server-manager.md", href: MCSERVER_MANAGER_DOC_URL },
        { label: "docs/mcserver-plugins.md", href: MCSERVER_PLUGINS_DOC_URL },
        { label: "docs/mcserver-web-console.md", href: MCSERVER_WEB_CONSOLE_DOC_URL },
        { label: "docs/mcserver-aws.md", href: MCSERVER_AWS_DOC_URL },
        { label: "packages/app/src/main/mcserver/registry.ts", href: repoFile("design/packages/app/src/main/mcserver/registry.ts") },
        { label: "packages/ui/src/components/mcserver/ServerListScreen.vue", href: repoFile("design/packages/ui/src/components/mcserver/ServerListScreen.vue") },
    ],
};
