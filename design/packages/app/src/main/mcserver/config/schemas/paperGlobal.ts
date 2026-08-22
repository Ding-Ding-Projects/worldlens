/**
 * Hand-written `FieldMeta` for a well-known, stable subset of Paper's `config/paper-global.yml`.
 *
 * This is deliberately NOT a claim of full coverage. Paper's global config has grown a large
 * number of sections (`chunk-loading-advanced`, `chunk-system`, `collisions`,
 * `packet-limiter`, `scoreboards`, `timings`, `watchdog`, ...) that change between Paper
 * builds, and fabricating bounds or defaults for keys this package cannot verify against a
 * real running Paper install would be worse than leaving them to the honest
 * value-shaped-inference fallback in `inferSchema.ts` (which still never renders a bare
 * text box for a boolean or a number - see `describeWithoutSchema` in `describe.ts`).
 *
 * What IS covered here are the keys that have been stable across Paper's config format for
 * a long time and are documented on docs.papermc.io/paper/reference/paper-global-yml:
 * the Velocity/BungeeCord proxy-forwarding block, the admin-command logging switch, the
 * watchdog early-warning timers, and the packet/spam limiter toggles that ship as booleans
 * or bounded integers. Anything not in this list falls through to inference rather than
 * being guessed at.
 */

import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, ms, select, text, ticks } from "./schemaHelpers.js";

export const paperGlobalFields: readonly FieldMeta[] = [
    field({
        path: "proxies.bungee-cord.online-mode",
        label: "BungeeCord online mode",
        doc: "Whether the server should use BungeeCord's forwarded online-mode player info.",
        control: { kind: "switch" },
        default: true, // Source: https://docs.papermc.io/paper/reference/global-configuration/ (proxies.bungee-cord.online-mode)
        group: "proxies",
    }),
    field({
        path: "proxies.proxy-protocol",
        label: "Use HAProxy protocol",
        doc: "Whether Paper should accept clients using the HAProxy PROXY protocol.",
        control: { kind: "switch" },
        default: false, // Source: https://docs.papermc.io/paper/reference/global-configuration/ (proxies.proxy-protocol)
        group: "proxies",
        advanced: true,
    }),
    field({
        path: "proxies.velocity.enabled",
        label: "Enable Velocity forwarding",
        doc: "Whether to use Velocity's modern player-info forwarding.",
        control: { kind: "switch" },
        default: false, // Source: https://docs.papermc.io/paper/reference/global-configuration/ (proxies.velocity.enabled)
        group: "proxies",
    }),
    field({
        path: "proxies.velocity.online-mode",
        label: "Velocity online mode",
        doc: "Whether Velocity's forwarded player info should be treated as online-mode.",
        control: { kind: "switch" },
        default: true, // Source: https://docs.papermc.io/paper/reference/global-configuration/ (proxies.velocity.online-mode)
        group: "proxies",
    }),
    field({
        path: "proxies.velocity.secret",
        label: "Velocity forwarding secret",
        doc: "The forwarding secret shared with Velocity's own forwarding-secret file. Must match exactly.",
        control: { kind: "text", monospace: true },
        default: "",
        group: "proxies",
        secret: true,
    }),
    field({
        path: "commands.log-admin-commands",
        label: "Log admin commands",
        doc: "Whether to log admin commands to console/log file.",
        control: { kind: "switch" },
        default: true, // UNVERIFIED: current Paper global-configuration docs do not list commands.log-admin-commands.
        group: "commands",
    }),
    field({
        path: "commands.suggest-player-names-when-null-tab-completions",
        label: "Suggest player names on empty tab-complete",
        doc: "Whether to suggest player names in tab completion when nothing has been typed yet.",
        control: { kind: "switch" },
        default: false, // Source: https://docs.papermc.io/paper/reference/global-configuration/ (commands.suggest-player-names-when-null-tab-completions)
        group: "commands",
        advanced: true,
    }),
    field({
        path: "console.enable-brigadier-highlighting",
        label: "Highlight commands in console",
        doc: "Whether to use Brigadier syntax highlighting for commands typed in the server console.",
        control: { kind: "switch" },
        default: true,
        group: "console",
        advanced: true,
    }),
    field({
        path: "console.enable-brigadier-completions",
        label: "Console command completions",
        doc: "Whether to use Brigadier tab completion for commands typed in the server console.",
        control: { kind: "switch" },
        default: true,
        group: "console",
        advanced: true,
    }),
    field({
        path: "logging.deobfuscate-stacktraces",
        label: "Deobfuscate stack traces",
        doc: "Whether to deobfuscate stack traces in the log using Mojang's mappings.",
        control: { kind: "switch" },
        default: true,
        group: "logging",
        advanced: true,
    }),
    field({
        path: "watchdog.early-warning-delay",
        label: "Watchdog early-warning delay",
        doc: "Time in milliseconds after a hang starts before Paper prints an early warning.",
        control: ms(0),
        default: 10000,
        group: "watchdog",
        advanced: true,
    }),
    field({
        path: "watchdog.early-warning-every",
        label: "Watchdog early-warning interval",
        doc: "How often, in milliseconds, Paper repeats the early-warning message while a hang continues.",
        control: ms(0),
        default: 5000,
        group: "watchdog",
        advanced: true,
    }),
    field({
        path: "packet-limiter.kick-message",
        label: "Packet limiter kick message",
        doc: "Message shown to a player kicked for exceeding a packet rate limit.",
        control: text(),
        default: "Sent too many packets",
        group: "packet-limiter",
        advanced: true,
    }),
    field({
        path: "spam-limiter.tab-spam-increment",
        label: "Tab-complete spam increment",
        doc: "Amount added to a player's spam count per tab-complete request.",
        control: boundedInt(0, 2147483647),
        default: 1,
        group: "spam-limiter",
        advanced: true,
    }),
    field({
        path: "spam-limiter.tab-spam-limit",
        label: "Tab-complete spam limit",
        doc: "Spam count threshold at which further tab-complete requests are ignored.",
        control: boundedInt(0, 2147483647),
        default: 500,
        group: "spam-limiter",
        advanced: true,
    }),
    field({
        path: "spam-limiter.recipe-spam-increment",
        label: "Recipe-book spam increment",
        doc: "Amount added to a player's spam count per recipe-book click.",
        control: boundedInt(0, 2147483647),
        default: 1,
        group: "spam-limiter",
        advanced: true,
    }),
    field({
        path: "spam-limiter.recipe-spam-limit",
        label: "Recipe-book spam limit",
        doc: "Spam count threshold at which further recipe-book clicks are ignored.",
        control: boundedInt(0, 2147483647),
        default: 20,
        group: "spam-limiter",
        advanced: true,
    }),
    field({
        path: "player-auto-save.rate",
        label: "Player auto-save rate",
        doc: "Ticks between automatic player-data saves; -1 uses the vanilla default.",
        control: ticks(-1),
        default: -1,
        group: "misc",
        advanced: true,
    }),
    field({
        path: "unsupported-settings.allow-permanent-block-break-exploits",
        label: "Allow permanent block-break exploits (unsupported)",
        doc: "Restores a legacy client-exploit path. Upstream marks this setting unsupported.",
        control: { kind: "switch" },
        default: false,
        group: "unsupported-settings",
        advanced: true,
    }),
    field({
        path: "unsupported-settings.allow-piston-duplication",
        label: "Allow piston duplication (unsupported)",
        doc: "Restores legacy piston-duplication behaviour. Upstream marks this setting unsupported.",
        control: { kind: "switch" },
        default: false,
        group: "unsupported-settings",
        advanced: true,
    }),
    field({
        path: "unsupported-settings.compression-format",
        label: "Region file compression format (unsupported override)",
        doc: "Overrides the region-file compression algorithm outside the vanilla server.properties setting.",
        control: select([
            { value: "gzip", label: "GZip" },
            { value: "zlib", label: "Zlib (deflate)" },
            { value: "none", label: "None" },
            { value: "lz4", label: "LZ4" },
        ]),
        default: "zlib",
        group: "unsupported-settings",
        advanced: true,
    }),
];
