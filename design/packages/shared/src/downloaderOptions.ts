/**
 * The complete option set of the Minecraft world downloader, as data, in one place.
 *
 * ## Why this lives in `shared` rather than beside either consumer
 *
 * Two processes need this list and they need to agree about it exactly. The renderer draws a
 * control per option, decides whether the current value is a chosen one or the tool's own
 * compiled-in default, and validates before it lets anybody press Start. The main process turns
 * the same stored record into the argument vector the JVM actually receives. If those two lists
 * were written separately they would drift on the first day somebody added a flag, and the
 * drift would be invisible: the interface would keep offering a control that no longer reached
 * the tool, which this project counts as a defect rather than a placeholder.
 *
 * So the schema below is the only authority, {@link deriveDownloaderArguments} is the only place
 * an argument vector is built, and both packages import them from here.
 *
 * ## Where the values come from
 *
 * Every flag, default and explanation below was read out of the tool's own source rather than
 * paraphrased from its documentation, because the documentation is generated and can lag:
 *
 *  - `src/main/java/config/Config.java` on `Ding-Ding-Projects/minecraft-world-downloader@main`
 *    holds the `@Option` annotations, the field initialisers that ARE the defaults, and the
 *    getters that clamp several of them at run time.
 *  - `web/app.py` in the same repository holds the tool's own web console's option table, whose
 *    grouping and help text are reused here so a person who has seen one interface recognises
 *    the other.
 *
 * Where the tool clamps a value after parsing it, the clamp is recorded in {@link DownloaderOption.clamp}
 * and stated in the explanation, because a control that silently accepts 10 and produces 50 is
 * lying about what it does.
 *
 * ## The two flags this schema deliberately does not carry
 *
 * `--no-gui` and `--server` are not options a person toggles here; they are how this application
 * runs the tool at all, so {@link deriveDownloaderArguments} emits them itself. `--auto-open-reach`
 * is accepted by the tool and then ignored (reach is fixed at the survival 4.0), so offering a
 * control for it would be offering a control that does nothing.
 */

/** The option families, in the order the interface presents them. */
export const DOWNLOADER_OPTION_GROUPS = [
    "connection",
    "world",
    "map",
    "containers",
    "chat",
    "advanced",
] as const;

export type DownloaderOptionGroup = (typeof DOWNLOADER_OPTION_GROUPS)[number];

/**
 * How a stored value becomes an argument.
 *
 * `presence` is a boolean flag the tool takes with no value at all, so it is either written or
 * omitted; `value` writes the flag and then its value as a second argument vector element, never
 * as `--flag=value`, because the tool's parser accepts both and the split form cannot be confused
 * by a value that happens to contain an equals sign.
 */
export type DownloaderEmission = "presence" | "value";

export type DownloaderControl =
    | "text"
    | "path-file"
    | "integer"
    | "decimal"
    | "boolean"
    | "choice"
    | "gamemodes"
    | "colour";

/** A run-time clamp the tool applies to a parsed value, so the interface can say so up front. */
export interface DownloaderClamp {
    readonly minimum?: number;
    /** Rounds the value down to a multiple of this, as the world-centre offsets do. */
    readonly multipleOf?: number;
    /** A non-positive value is replaced by the default rather than honoured. */
    readonly nonPositiveFallsBackToDefault?: boolean;
}

export interface DownloaderChoice {
    readonly value: string;
    /** English label. The interface renders its own translated label where it has one. */
    readonly label: string;
}

export interface DownloaderOption {
    /** The key this application stores the value under. */
    readonly key: string;
    /** The tool's own flag, exactly as its parser spells it. */
    readonly flag: string;
    readonly group: DownloaderOptionGroup;
    readonly control: DownloaderControl;
    readonly emission: DownloaderEmission;
    /**
     * The tool's own compiled-in default, read from the field initialiser in `Config.java`.
     *
     * This is what the provenance line names when a value has never been chosen, which is why it
     * is the real value and not the word "default".
     */
    readonly fallback: string | number | boolean;
    /** One short line naming what the control is. */
    readonly label: string;
    /** The full explanation, shown behind progressive disclosure. */
    readonly explanation: string;
    readonly choices?: readonly DownloaderChoice[];
    readonly minimum?: number;
    readonly maximum?: number;
    /** The run-time clamp the tool applies after parsing, where it applies one. */
    readonly clamp?: DownloaderClamp;
    /**
     * Keys that must all be truthy before this option is emitted at all.
     *
     * The tool ignores, say, `--auto-open-delay` when the sweep is off, so writing it would put a
     * flag in the argument vector that changes nothing. The interface uses the same list to say
     * which condition a disabled control is waiting on.
     */
    readonly requires?: readonly string[];
    /** Flags the tool refuses unless its partner is present too. */
    readonly pairedWith?: string;
    /** True where turning this on can be noticed by the server or other players. */
    readonly consequential?: boolean;
}

/**
 * Minecraft's sixteen chat colour names.
 *
 * The tool accepts "any Minecraft colour name" as free text, which in a form is an invitation to
 * mistype one and get a feature that silently never fires. The set is closed and small, so it is
 * a picker.
 */
export const MINECRAFT_CHAT_COLOURS: readonly DownloaderChoice[] = [
    { value: "black", label: "Black" },
    { value: "dark_blue", label: "Dark blue" },
    { value: "dark_green", label: "Dark green" },
    { value: "dark_aqua", label: "Dark aqua" },
    { value: "dark_red", label: "Dark red" },
    { value: "dark_purple", label: "Dark purple" },
    { value: "gold", label: "Gold" },
    { value: "gray", label: "Gray" },
    { value: "dark_gray", label: "Dark gray" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "aqua", label: "Aqua" },
    { value: "red", label: "Red" },
    { value: "light_purple", label: "Light purple" },
    { value: "yellow", label: "Yellow" },
    { value: "white", label: "White" },
];

/** The gamemodes the container sweep can be restricted to. */
export const AUTO_OPEN_GAMEMODES: readonly DownloaderChoice[] = [
    { value: "survival", label: "Survival" },
    { value: "creative", label: "Creative" },
    { value: "adventure", label: "Adventure" },
    { value: "spectator", label: "Spectator" },
];

/**
 * Every option, in group order.
 *
 * The explanations are written for somebody who has never read the tool's documentation, because
 * that is the point of putting them in the interface rather than linking out to a wiki.
 */
export const DOWNLOADER_OPTIONS: readonly DownloaderOption[] = [
    // ---- Connection -------------------------------------------------------------------------
    {
        key: "proxyPort",
        flag: "--local-port",
        group: "connection",
        control: "integer",
        emission: "value",
        fallback: 25565,
        minimum: 1,
        maximum: 65535,
        label: "Proxy port",
        explanation:
            "The port on this computer that the proxy listens on. This is the port you put into Minecraft's server list, not the port of the server you are downloading from. 25565 is Minecraft's usual port, so leaving it alone means the address is just the machine name with nothing after it. Change it if something else on this computer already holds 25565; the interface checks whether the port is free before it lets you start.",
    },
    {
        key: "disableSrvLookup",
        flag: "--disable-srv-lookup",
        group: "connection",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Skip the DNS SRV lookup",
        explanation:
            "Most public Minecraft servers publish an SRV record so that a short address resolves to the real host and port. The tool follows that record by default, which is what you want almost always. Turn this on only when you are typing an address that must be used exactly as written, such as a raw IP address on a home network where a stale SRV record would send the connection somewhere else.",
    },

    // ---- World output -----------------------------------------------------------------------
    {
        key: "levelSeed",
        flag: "--seed",
        group: "world",
        control: "integer",
        emission: "value",
        fallback: 0,
        label: "Level seed",
        explanation:
            "The numeric seed written into the saved world's level.dat. It does not change anything you download, because every chunk you receive comes from the server rather than being generated here. It decides what Minecraft would generate for the chunks you never visited, if you later open this world in a game with world generation left on. Leave it at 0 unless you know the server's real seed and want the unvisited parts to match.",
    },
    {
        key: "centerX",
        flag: "--center-x",
        group: "world",
        control: "integer",
        emission: "value",
        fallback: 0,
        pairedWith: "centerZ",
        clamp: { multipleOf: 512 },
        label: "Recentre on X",
        explanation:
            "Shifts the whole saved world so that this X coordinate lands at 0. It exists because a world downloaded far from the origin is awkward to open and to render. The tool rounds this down to a multiple of 512 before using it, since that is one region file, so entering 1500 actually recentres on 1024. The Z counterpart must be set at the same time; the tool refuses one without the other.",
    },
    {
        key: "centerZ",
        flag: "--center-z",
        group: "world",
        control: "integer",
        emission: "value",
        fallback: 0,
        pairedWith: "centerX",
        clamp: { multipleOf: 512 },
        label: "Recentre on Z",
        explanation:
            "The Z half of the recentring offset. Shifts the saved world so this Z coordinate lands at 0, rounded down to a multiple of 512 exactly as the X half is. The tool refuses to accept one of the two without the other, so this control and its X partner are enabled and disabled together.",
    },
    {
        key: "disableWorldGen",
        flag: "--disable-world-gen",
        group: "world",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Stop new chunks generating",
        explanation:
            "Writes the saved world as a superflat void, so opening it later shows exactly what you downloaded and nothing else. Without this, opening the world in Minecraft generates fresh terrain around the edges of what you walked, which looks like part of the server's world but is not. Turn it on when the download is evidence of what the server actually contains; leave it off when you intend to keep playing in the copy.",
    },
    {
        key: "disableChunkSaving",
        flag: "--disable-chunk-saving",
        group: "world",
        control: "boolean",
        emission: "presence",
        fallback: false,
        consequential: true,
        label: "Do not write chunks to disk",
        explanation:
            "Runs the whole proxy without saving anything. It exists for debugging the tool itself. With this on you can connect and play through the proxy and the world folder stays empty, so nothing you walk through is kept. There is no reason to turn it on for a download, and the interface says so beside the running state rather than letting you discover it from an empty folder afterwards.",
    },
    {
        key: "ignoreBlockChanges",
        flag: "--ignore-block-changes",
        group: "world",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Ignore changes after a chunk loads",
        explanation:
            "Keeps the first version of every chunk it receives and discards later edits to it. That makes the saved world a snapshot of the moment you arrived rather than a running record, which is cheaper and avoids capturing somebody else's building work mid-swing. Leave it off if you want the copy to follow what actually happened while you were connected.",
    },

    // ---- Render distance and the tool's own overview map ---------------------------------------
    {
        key: "extendedRenderDistance",
        flag: "--extended-render-distance",
        group: "map",
        control: "integer",
        emission: "value",
        fallback: 0,
        minimum: 0,
        maximum: 64,
        label: "Extended render distance",
        explanation:
            "Sends chunks you have already downloaded back to your game so you can see further than the server allows. Measured in chunks; 0 turns it off. This only ever shows you terrain you have downloaded before, so on a fresh world it does nothing at all until you have walked somewhere twice. On a server that watches for unusual client behaviour a large value is more noticeable than a small one.",
    },
    {
        key: "extendedRenderPace",
        flag: "--extended-render-pace",
        group: "map",
        control: "integer",
        emission: "value",
        fallback: 6,
        minimum: 0,
        maximum: 500,
        requires: ["extendedRenderDistance"],
        label: "Pace between re-sent chunks",
        explanation:
            "Milliseconds to wait between each chunk that the extended render distance sends back. Lower fills the view in faster and makes the game stutter; higher is smooth but the distance takes longer to appear. 0 means as fast as possible. It has no effect at all while the extended render distance is 0, which is why this control waits on that one.",
    },
    {
        key: "renderOtherPlayers",
        flag: "--render-players",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Show other players on the overview map",
        explanation:
            "Draws the other people on the server onto the tool's own overview map, using their Minecraft head. Their skins are fetched from Mojang's public skin service and cached, so turning this on makes outbound requests to Mojang that would not otherwise happen. It changes nothing about the world you save.",
    },
    {
        key: "markNewChunks",
        flag: "--mark-new-chunks",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Outline newly downloaded chunks",
        explanation:
            "Draws an orange outline on the tool's overview map around chunks it has just received, so you can see the edge of what you have covered as you walk. Purely a display choice in the tool's own window; the saved world is identical either way.",
    },
    {
        key: "markOldChunks",
        flag: "--mark-old-chunks",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: true,
        label: "Grey out previously downloaded chunks",
        explanation:
            "Greys chunks on the overview map that came from an earlier session rather than this one, which is how you tell new ground from ground you are walking over again. The tool has this on by default and its command line can only turn it on, never off, so this control is shown as the tool's own standing behaviour rather than as a switch that would not work.",
    },
    {
        key: "disableMarkUnsaved",
        flag: "--disable-mark-unsaved",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Stop marking unsaved chunks in red",
        explanation:
            "The overview map marks chunks in red while they are received but not yet written to disk. Turning the marking off makes the map calmer to look at and removes the one visual cue that tells you a chunk is still in flight, so leaving it on is the safer choice while you are watching a download.",
    },
    {
        key: "drawExtendedChunks",
        flag: "--draw-extended-chunks",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        requires: ["extendedRenderDistance"],
        label: "Draw re-sent chunks on the map",
        explanation:
            "Shows the chunks that the extended render distance pushed back to your game on the overview map as well. It is a way of checking that the extension is doing anything. With the extended render distance at 0 nothing is ever re-sent, so this control waits on that one.",
    },
    {
        key: "enableCaveMode",
        flag: "--enable-cave-mode",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Switch to cave view underground",
        explanation:
            "Makes the tool's overview map switch automatically to a cave rendering when your player is below the surface, instead of showing the terrain roof above you. Affects only that map window.",
    },
    {
        key: "disableMapRender",
        flag: "--disable-map-render",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Do not write the overview map to disk",
        explanation:
            "The tool renders a rough overview map into an `overview` folder beside the world while it runs headless. That is separate from this application's own 3D render and costs a little disk and processor time. Turning it off saves that; it removes nothing from the downloaded world itself.",
    },
    {
        key: "disableModdedBlockColors",
        flag: "--disable-modded-block-colors",
        group: "map",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Do not colour modded blocks",
        explanation:
            "Blocks from mods have no colour in the vanilla data, so the tool reads their textures out of the mod jars in your Minecraft folder to colour them on its overview map, falling back to a colour derived from the block's name. Turning this off skips reading those jars and leaves modded blocks uncoloured. Nothing about the saved world changes.",
    },

    // ---- The automatic container sweep --------------------------------------------------------
    {
        key: "autoOpenContainers",
        flag: "--auto-open-containers",
        group: "containers",
        control: "boolean",
        emission: "presence",
        fallback: false,
        consequential: true,
        label: "Open nearby containers automatically",
        explanation:
            "As you move, the proxy opens containers near you one at a time so their contents are saved into the world. Without it, a chest is saved empty unless you open it yourself. The tool marks this experimental, and it is: it makes your player perform actions you did not perform, which a server watching for automation can notice, and opening somebody's chest is visible to them in game. Everything below only takes effect while this is on.",
    },
    {
        key: "autoOpenDelay",
        flag: "--auto-open-delay",
        group: "containers",
        control: "integer",
        emission: "value",
        fallback: 400,
        minimum: 0,
        maximum: 60000,
        clamp: { minimum: 50 },
        requires: ["autoOpenContainers"],
        label: "Minimum delay between opens",
        explanation:
            "Milliseconds the sweep waits between one container and the next. Higher is slower and looks less like a machine. The tool refuses anything below 50 and uses 50 instead, so entering 10 gives you 50; the interface says that rather than accepting a number the tool will not honour.",
    },
    {
        key: "autoOpenGamemodes",
        flag: "--auto-open-gamemodes",
        group: "containers",
        control: "gamemodes",
        emission: "value",
        fallback: "all",
        requires: ["autoOpenContainers"],
        label: "Gamemodes the sweep runs in",
        explanation:
            "Restricts the sweep to particular gamemodes, so it can be left configured and only act when you are, say, in creative. Choosing none of them and choosing all of them both mean the same thing to the tool, which treats an empty list as no restriction at all.",
    },
    {
        key: "autoOpenAllowTrappedChests",
        flag: "--auto-open-allow-trapped-chests",
        group: "containers",
        control: "boolean",
        emission: "presence",
        fallback: false,
        consequential: true,
        requires: ["autoOpenContainers"],
        label: "Include trapped chests",
        explanation:
            "Trapped chests are left alone by default because opening one emits a redstone pulse, which can fire a contraption, open a door or set off an alarm somebody built specifically to catch this. Turning this on means the sweep opens them too. They are still skipped while another player is nearby, unless you also turn that protection off below.",
    },
    {
        key: "autoOpenAllowChestNearPlayers",
        flag: "--auto-open-allow-chest-near-players",
        group: "containers",
        control: "boolean",
        emission: "presence",
        fallback: false,
        consequential: true,
        requires: ["autoOpenContainers"],
        label: "Open chests while another player is nearby",
        explanation:
            "By default the sweep will not open a chest, trapped chest, barrel or shulker box while another player is within the radius below, because the opening animation and sound are visible to them. Other container types are opened regardless. Turning this on removes that hesitation entirely.",
    },
    {
        key: "autoOpenPlayerRadius",
        flag: "--auto-open-player-radius",
        group: "containers",
        control: "decimal",
        emission: "value",
        fallback: 100,
        minimum: 0,
        maximum: 512,
        clamp: { nonPositiveFallsBackToDefault: true },
        requires: ["autoOpenContainers"],
        label: "Nearby-player radius",
        explanation:
            "How many blocks away another player has to be before the sweep is willing to open a chest beside you. The tool ignores zero and anything negative and uses 100 instead, deliberately, so that an emptied field cannot quietly switch the protection off; turning the protection off has its own control above.",
    },
    {
        key: "autoOpenLog",
        flag: "--auto-open-log",
        group: "containers",
        control: "path-file",
        emission: "value",
        fallback: "",
        requires: ["autoOpenContainers"],
        label: "Item log file",
        explanation:
            "A readable text file listing every container the sweep opened, where it was, and what was in it. Left empty it is written as auto-open-items.log beside the world folder, which is what most people want. Point it somewhere else if you are collecting several downloads' logs together.",
    },
    {
        key: "autoOpenState",
        flag: "--auto-open-state",
        group: "containers",
        control: "path-file",
        emission: "value",
        fallback: "",
        requires: ["autoOpenContainers"],
        label: "Already-opened record",
        explanation:
            "Records which containers the sweep has already visited so that walking past them again does not open them a second time. Left empty it is written as auto-open-attempted.txt beside the world folder. Deleting this file makes the sweep treat every container as new again.",
    },
    {
        key: "containerMessageFormat",
        flag: "--container-message-format",
        group: "containers",
        control: "text",
        emission: "value",
        fallback: "",
        requires: ["autoOpenContainers"],
        label: "Saved-container message",
        explanation:
            "The line the tool shows above your hotbar each time it saves a container. The placeholders {type}, {count}, {x}, {y} and {z} are filled in. Left empty the tool uses its own wording, which is {type} ({count}) - {x} {y} {z}. Clearing it does not remove the message; it restores that default.",
    },

    // ---- Chat auto-reply ----------------------------------------------------------------------
    {
        key: "autoReply",
        flag: "--auto-reply",
        group: "chat",
        control: "boolean",
        emission: "presence",
        fallback: false,
        consequential: true,
        label: "Reply to matching chat automatically",
        explanation:
            "Watches incoming chat and, when a message contains the trigger text in the trigger colour, sends that same message's reply-coloured text back to the server as real chat from your account. It is your account speaking without you. The tool marks it experimental, and servers that enforce signed chat may reject the message outright. Everything below only takes effect while this is on.",
    },
    {
        key: "autoReplyTrigger",
        flag: "--auto-reply-trigger",
        group: "chat",
        control: "text",
        emission: "value",
        fallback: "",
        requires: ["autoReply"],
        label: "Trigger text",
        explanation:
            "The exact text that has to appear, in the trigger colour, for a reply to be sent. Surrounding spaces and quotation marks are ignored. There is no default and the feature does nothing without one, so the interface will not let you start with the reply turned on and this field empty.",
    },
    {
        key: "autoReplyTriggerColor",
        flag: "--auto-reply-trigger-color",
        group: "chat",
        control: "colour",
        emission: "value",
        fallback: "yellow",
        choices: MINECRAFT_CHAT_COLOURS,
        requires: ["autoReply"],
        label: "Trigger colour",
        explanation:
            "Which colour the trigger text has to be drawn in. Servers use colour to distinguish a warning from ordinary chatter, so this is how the tool tells one apart from the other. The tool accepts any Minecraft colour name; the list here is all sixteen of them, so a misspelling cannot silently stop the feature from ever firing.",
    },
    {
        key: "autoReplyColor",
        flag: "--auto-reply-color",
        group: "chat",
        control: "colour",
        emission: "value",
        fallback: "red",
        choices: MINECRAFT_CHAT_COLOURS,
        requires: ["autoReply"],
        label: "Reply colour",
        explanation:
            "Which coloured part of the triggering message is sent back as the reply. The reply is not text you write here; it is taken out of the message that triggered it, which is how the feature answers a challenge whose wording changes each time.",
    },
    {
        key: "autoReplyDelay",
        flag: "--auto-reply-delay",
        group: "chat",
        control: "integer",
        emission: "value",
        fallback: 1500,
        minimum: 0,
        maximum: 600000,
        clamp: { minimum: 250 },
        requires: ["autoReply"],
        label: "Minimum delay between replies",
        explanation:
            "Milliseconds the tool waits before it is willing to reply again, so a burst of matching messages cannot turn into chat spam and get your account kicked or muted. The tool refuses anything below 250 and uses 250 instead.",
    },

    // ---- Advanced -----------------------------------------------------------------------------
    {
        key: "disableInfoMessages",
        flag: "--disable-messages",
        group: "advanced",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Suppress the tool's in-game messages",
        explanation:
            "Stops the tool writing its own status lines into your game chat, such as the note it shows when it saves a chest. Useful when you are recording, and a nuisance when you are trying to work out whether anything is being saved at all.",
    },
    {
        key: "enableVoiceProxy",
        flag: "--enable-voice-proxy",
        group: "advanced",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Relay Simple Voice Chat and PlasmoVoice",
        explanation:
            "Those two mods carry voice over their own UDP connection, which does not go through a normal Minecraft proxy, so voice goes silent while you download. Turning this on relays that traffic as well, detecting the port from the server's own plugin messages. Leave it off if the server does not use either mod.",
    },
    {
        key: "devMode",
        flag: "--dev-mode",
        group: "advanced",
        control: "boolean",
        emission: "presence",
        fallback: false,
        label: "Developer mode",
        explanation:
            "Turns on the tool's own developer diagnostics. It exists for people working on the downloader itself and makes its output much noisier. It is offered here because the tool offers it, not because a download needs it.",
    },
];

/** Every option, indexed by the key this application stores it under. */
export const DOWNLOADER_OPTIONS_BY_KEY: ReadonlyMap<string, DownloaderOption> = new Map(
    DOWNLOADER_OPTIONS.map((option) => [option.key, option]),
);

/**
 * How the account is proved to the server.
 *
 * There is deliberately no password mode, and there is no room for one: the tool's own command
 * line has no password flag at all. It takes either a Minecraft access token, or the instruction
 * to run Microsoft's device-code flow, or nothing but a username for a server that does not check.
 */
export type DownloaderAccountMode = "microsoft" | "token" | "offline";

export interface DownloaderAccount {
    readonly mode: DownloaderAccountMode;
    /** Required by the offline mode, optional beside a token, unused by the Microsoft flow. */
    readonly username: string;
}

/** The stored shape a session is started from. Values are held as text exactly as typed. */
export interface DownloaderSettings {
    readonly server: string;
    readonly outputFolder: string;
    /** Which version the person says they will connect with. See {@link SUPPORTED_MINECRAFT_VERSIONS}. */
    readonly declaredVersion: string;
    readonly account: DownloaderAccount;
    /** Only the keys somebody has actually chosen. A missing key means "the tool's own default". */
    readonly options: Readonly<Record<string, string | number | boolean>>;
}

/**
 * The versions the tool carries protocol handling for, with the protocol numbers it anchors them to.
 *
 * Read out of `src/main/java/config/Version.java`. Two things about this list are worth knowing
 * before it is used as a picker:
 *
 *  - **The tool has no version flag.** It works out which protocol to speak from the handshake
 *    your game client sends it, so nothing here is passed on the command line. The picker is
 *    still a real control: it is what the connection test compares the server's reported protocol
 *    against, and what the compatibility notes on the surface are keyed to.
 *  - **The names are the earliest release of each family.** The tool maps an in-between version to
 *    the nearest anchor below it, so choosing 1.21 covers 1.21 and 1.21.1.
 */
export interface MinecraftVersionAnchor {
    /** The release name, as a person would say it. */
    readonly name: string;
    /** The protocol number a client of that version sends in its handshake. */
    readonly protocol: number;
    /** The data version written into a world saved for it. */
    readonly dataVersion: number;
    /** Where the tool's own support for this family is best-effort rather than exercised. */
    readonly bestEffort?: boolean;
    /** A note the interface shows beside the choice, where there is one worth showing. */
    readonly note?: string;
}

export const SUPPORTED_MINECRAFT_VERSIONS: readonly MinecraftVersionAnchor[] = [
    {
        name: "1.8",
        protocol: 47,
        dataVersion: 100,
        bestEffort: true,
        note: "Uses the pre-palette chunk format and the bulk chunk packet, and borrows the bundled 1.12.2 registries.",
    },
    { name: "1.9", protocol: 107, dataVersion: 169, bestEffort: true },
    { name: "1.10", protocol: 210, dataVersion: 510, bestEffort: true },
    { name: "1.11", protocol: 315, dataVersion: 819, bestEffort: true },
    {
        name: "1.12.2",
        protocol: 317,
        dataVersion: 1132,
        note: "Furnaces and brewing stands are not opened by the container sweep on this version.",
    },
    { name: "1.13.2", protocol: 341, dataVersion: 1444 },
    { name: "1.14", protocol: 440, dataVersion: 1901 },
    { name: "1.15", protocol: 550, dataVersion: 2200 },
    { name: "1.16", protocol: 701, dataVersion: 2578 },
    { name: "1.17", protocol: 755, dataVersion: 2724 },
    { name: "1.18", protocol: 757, dataVersion: 2860 },
    { name: "1.19", protocol: 759, dataVersion: 3105 },
    { name: "1.19.3", protocol: 761, dataVersion: 3218 },
    { name: "1.20", protocol: 763, dataVersion: 3463 },
    { name: "1.20.2", protocol: 764, dataVersion: 3578 },
    { name: "1.20.4", protocol: 765, dataVersion: 3698 },
    { name: "1.20.6", protocol: 766, dataVersion: 3839 },
    { name: "1.21", protocol: 767, dataVersion: 3953 },
    { name: "1.21.3", protocol: 768, dataVersion: 4082 },
    { name: "1.21.5", protocol: 770, dataVersion: 4325 },
    {
        name: "26.1",
        protocol: 775,
        dataVersion: 4786,
        bestEffort: true,
        note: "The newest release the tool carries. Its chunk and chat handling is shared with 1.21.5 and up, which is exercised, but 26.1 itself has not been driven end to end.",
    },
];

/** The version anchor the tool would use for a client reporting this protocol number. */
export function versionAnchorForProtocol(protocol: number): MinecraftVersionAnchor | null {
    let best: MinecraftVersionAnchor | null = null;
    for (const anchor of SUPPORTED_MINECRAFT_VERSIONS) {
        if (anchor.protocol <= protocol && (best === null || anchor.protocol > best.protocol)) {
            best = anchor;
        }
    }
    return best;
}

/**
 * The novice control over the container sweep's pacing and caution.
 *
 * The sweep has four knobs that trade the same thing against each other: how quickly it works
 * through containers versus how much like a person it behaves. Somebody who has never read the
 * tool's documentation cannot pick numbers for those, but they can answer "careful or quick".
 *
 * Every level below writes real values into the real options, and the mapping is written out here
 * rather than described, so that a reader can check the claim rather than trust it. Level 3 is
 * the level whose values are the tool's own defaults, which is why it is the default level.
 */
export interface SweepLevel {
    readonly level: 1 | 2 | 3 | 4 | 5;
    readonly name: string;
    readonly summary: string;
    readonly values: Readonly<Record<string, string | number | boolean>>;
}

export const SWEEP_LEVELS: readonly SweepLevel[] = [
    {
        level: 1,
        name: "As careful as possible",
        summary: "Slow, keeps well away from other people, and never touches a trapped chest.",
        values: {
            autoOpenDelay: 2000,
            autoOpenPlayerRadius: 200,
            autoOpenAllowTrappedChests: false,
            autoOpenAllowChestNearPlayers: false,
        },
    },
    {
        level: 2,
        name: "Careful",
        summary: "Noticeably slower than the tool's own pace, with a wider berth around players.",
        values: {
            autoOpenDelay: 1000,
            autoOpenPlayerRadius: 150,
            autoOpenAllowTrappedChests: false,
            autoOpenAllowChestNearPlayers: false,
        },
    },
    {
        level: 3,
        name: "The tool's own pace",
        summary: "Exactly the values the downloader ships with: 400ms apart, 100 blocks, trapped chests left alone.",
        values: {
            autoOpenDelay: 400,
            autoOpenPlayerRadius: 100,
            autoOpenAllowTrappedChests: false,
            autoOpenAllowChestNearPlayers: false,
        },
    },
    {
        level: 4,
        name: "Quick",
        summary: "Works through containers faster and keeps a smaller distance from other players.",
        values: {
            autoOpenDelay: 200,
            autoOpenPlayerRadius: 50,
            autoOpenAllowTrappedChests: false,
            autoOpenAllowChestNearPlayers: false,
        },
    },
    {
        level: 5,
        name: "As quick as possible",
        summary: "Opens everything, including trapped chests and chests beside other players. The most visible setting there is.",
        values: {
            autoOpenDelay: 50,
            autoOpenPlayerRadius: 10,
            autoOpenAllowTrappedChests: true,
            autoOpenAllowChestNearPlayers: true,
        },
    },
];

/** The level whose values are the tool's own defaults. */
export const DEFAULT_SWEEP_LEVEL = 3;

/** The keys the sweep level writes, so a caller can tell which controls it owns. */
export const SWEEP_LEVEL_KEYS: readonly string[] = [
    "autoOpenDelay",
    "autoOpenPlayerRadius",
    "autoOpenAllowTrappedChests",
    "autoOpenAllowChestNearPlayers",
];

/**
 * Which level the raw values currently correspond to, or null when they match none of them.
 *
 * Returning null is the whole point: the values can be set to anything, and pretending an
 * unmatched combination is "nearly level 4" would be a lie the person cannot see through.
 * The interface shows that null as an explicit Custom state, and merely showing it writes nothing.
 */
export function sweepLevelOf(
    options: Readonly<Record<string, string | number | boolean>>,
): SweepLevel | null {
    for (const level of SWEEP_LEVELS) {
        const matches = SWEEP_LEVEL_KEYS.every((key) => {
            const option = DOWNLOADER_OPTIONS_BY_KEY.get(key);
            const effective = key in options ? options[key] : option?.fallback;
            return effective === level.values[key];
        });
        if (matches) return level;
    }
    return null;
}

/** A reason a session cannot be started, in words that say what to do about it. */
export interface DownloaderProblem {
    /** The settings key or account field the problem belongs to, so a control can show it. */
    readonly field: string;
    readonly message: string;
}

/** The effective value of an option: what was chosen, or the tool's own default. */
export function effectiveValue(
    option: DownloaderOption,
    options: Readonly<Record<string, string | number | boolean>>,
): string | number | boolean {
    return option.key in options ? options[option.key] : option.fallback;
}

/** Whether every gate on this option is satisfied, so the tool would honour it. */
export function optionIsActive(
    option: DownloaderOption,
    options: Readonly<Record<string, string | number | boolean>>,
): boolean {
    if (option.requires === undefined) return true;
    return option.requires.every((key) => {
        const required = DOWNLOADER_OPTIONS_BY_KEY.get(key);
        if (required === undefined) return false;
        const value = effectiveValue(required, options);
        // A numeric gate such as the extended render distance is satisfied by any non-zero value,
        // which is exactly what "0 turns it off" means in the tool.
        return typeof value === "number" ? value !== 0 : value !== false && value !== "";
    });
}

const SERVER_ADDRESS = /^[A-Za-z0-9](?:[A-Za-z0-9.\-_]*[A-Za-z0-9])?$/;

/**
 * Everything wrong with these settings, with a message per problem naming the next step.
 *
 * This runs in the renderer to decide whether Start is enabled and what a disabled Start is
 * waiting on, and again in the main process before anything is spawned, because a renderer that
 * has drifted from a released shell must not be the only thing standing between a person and a
 * malformed argument vector.
 */
export function validateDownloaderSettings(settings: DownloaderSettings): readonly DownloaderProblem[] {
    const problems: DownloaderProblem[] = [];
    const server = settings.server.trim();
    if (server === "") {
        problems.push({
            field: "server",
            message: "Type the address of the server you want to download from, without a port.",
        });
    } else if (server.includes(":")) {
        problems.push({
            field: "server",
            message:
                "Take the port off the address. The tool resolves the real port itself, and the port field here is the one your own game connects to.",
        });
    } else if (!SERVER_ADDRESS.test(server)) {
        problems.push({
            field: "server",
            message: "That does not look like a hostname or an IP address. Letters, digits, dots and hyphens only.",
        });
    }

    if (settings.outputFolder.trim() === "") {
        problems.push({
            field: "outputFolder",
            message: "Choose the folder the downloaded world should be written into. Browse beside the field opens a folder picker.",
        });
    }

    if (settings.account.mode === "offline" && settings.account.username.trim() === "") {
        problems.push({
            field: "account.username",
            message: "An offline server still needs a name to call you. Type the username you use on it.",
        });
    }

    for (const option of DOWNLOADER_OPTIONS) {
        if (!optionIsActive(option, settings.options)) continue;
        const value = effectiveValue(option, settings.options);

        if (option.control === "integer" || option.control === "decimal") {
            const parsed = typeof value === "number" ? value : Number(String(value).trim());
            if (!Number.isFinite(parsed)) {
                problems.push({ field: option.key, message: `${option.label} has to be a number.` });
                continue;
            }
            if (option.control === "integer" && !Number.isInteger(parsed)) {
                problems.push({ field: option.key, message: `${option.label} has to be a whole number.` });
                continue;
            }
            if (option.minimum !== undefined && parsed < option.minimum) {
                problems.push({
                    field: option.key,
                    message: `${option.label} cannot be below ${option.minimum}.`,
                });
            }
            if (option.maximum !== undefined && parsed > option.maximum) {
                problems.push({
                    field: option.key,
                    message: `${option.label} cannot be above ${option.maximum}.`,
                });
            }
        }

        if (option.pairedWith !== undefined) {
            const partner = DOWNLOADER_OPTIONS_BY_KEY.get(option.pairedWith);
            const mineChosen = option.key in settings.options;
            const partnerChosen = partner !== undefined && partner.key in settings.options;
            if (mineChosen && !partnerChosen) {
                problems.push({
                    field: option.key,
                    message: `${option.label} needs ${partner?.label ?? option.pairedWith} set as well; the tool refuses one without the other.`,
                });
            }
        }
    }

    const replyOn = effectiveValue(
        DOWNLOADER_OPTIONS_BY_KEY.get("autoReply") as DownloaderOption,
        settings.options,
    );
    const trigger = effectiveValue(
        DOWNLOADER_OPTIONS_BY_KEY.get("autoReplyTrigger") as DownloaderOption,
        settings.options,
    );
    if (replyOn === true && String(trigger).trim() === "") {
        problems.push({
            field: "autoReplyTrigger",
            message: "Chat auto-reply does nothing without trigger text. Type the exact words that should set it off, or turn the reply back off.",
        });
    }

    return problems;
}

/** The argument vector, plus anything a person ought to be told about it. */
export interface DerivedArguments {
    /** Everything after the jar path, in order. */
    readonly args: readonly string[];
    /**
     * The same vector with the access token replaced by asterisks.
     *
     * Anything that renders, logs, exports or reports the arguments uses this one. The real vector
     * exists only long enough to reach the spawn call.
     */
    readonly redacted: readonly string[];
    /**
     * Notes worth surfacing beside the start button: values the tool will clamp, and the fact that
     * a token is being handed over on a command line.
     */
    readonly notes: readonly string[];
}

/**
 * Turn stored settings into the tool's argument vector. This is the only place that happens.
 *
 * The access token is a parameter rather than part of the settings on purpose. It never lives in
 * the settings record, so it cannot reach the persisted settings file, an export, or a diagnostic
 * report by accident: the only way it enters this function is for the caller to have fetched it
 * out of the operating system credential store immediately before spawning.
 */
export function deriveDownloaderArguments(
    settings: DownloaderSettings,
    accessToken: string | null = null,
): DerivedArguments {
    const args: string[] = ["--no-gui", "--server", settings.server.trim()];
    const notes: string[] = [];
    // Index into `args` of the token value, so the redacted copy can be made without a second
    // pass that would have to guess which element was the secret.
    let tokenIndex = -1;

    if (settings.outputFolder.trim() !== "") {
        args.push("--output", settings.outputFolder.trim());
    }

    const username = settings.account.username.trim();
    if (settings.account.mode === "microsoft") {
        args.push("--microsoft-login");
    } else if (settings.account.mode === "token") {
        if (username !== "") args.push("--username", username);
        if (accessToken !== null && accessToken !== "") {
            args.push("--token");
            tokenIndex = args.length;
            args.push(accessToken);
            notes.push(
                "The tool takes an access token on its command line and has no other way in, so while it runs the token is visible to anything on this computer that can list running processes. It is not written to any file by the tool, and this application keeps it in the operating system credential store.",
            );
        }
    } else if (username !== "") {
        args.push("--username", username);
    }

    for (const option of DOWNLOADER_OPTIONS) {
        if (!optionIsActive(option, settings.options)) continue;
        if (!(option.key in settings.options)) continue;

        const value = settings.options[option.key];

        if (option.emission === "presence") {
            // A boolean the tool defaults to true has no "off" flag, so writing the flag when the
            // value is already true would add an argument that changes nothing. Only a true value
            // that differs from the fallback is worth emitting.
            if (value === true && option.fallback !== true) args.push(option.flag);
            continue;
        }

        const text = String(value).trim();
        if (text === "") continue;
        if (text === String(option.fallback)) continue;

        if (option.clamp?.minimum !== undefined) {
            const parsed = Number(text);
            if (Number.isFinite(parsed) && parsed < option.clamp.minimum) {
                notes.push(
                    `${option.label} is set to ${text}, and the tool will use ${option.clamp.minimum} instead because it refuses anything lower.`,
                );
            }
        }
        if (option.clamp?.multipleOf !== undefined) {
            const parsed = Number(text);
            if (Number.isFinite(parsed)) {
                const rounded = Math.floor(parsed / option.clamp.multipleOf) * option.clamp.multipleOf;
                if (rounded !== parsed) {
                    notes.push(
                        `${option.label} is set to ${text}, and the tool will use ${rounded} because it rounds this down to a multiple of ${option.clamp.multipleOf}.`,
                    );
                }
            }
        }
        if (option.clamp?.nonPositiveFallsBackToDefault === true) {
            const parsed = Number(text);
            if (Number.isFinite(parsed) && parsed <= 0) {
                notes.push(
                    `${option.label} is set to ${text}, and the tool will use ${String(option.fallback)} instead, because it treats a value at or below zero as a mistake rather than as an instruction to switch the protection off.`,
                );
            }
        }

        args.push(option.flag, text);
    }

    const redacted = tokenIndex === -1 ? [...args] : args.map((entry, index) => (index === tokenIndex ? "********" : entry));

    return { args, redacted, notes };
}
