/**
 * Hand-written `FieldMeta` for a well-known, stable subset of `spigot.yml`.
 *
 * `spigot.yml` predates Paper and is still read by Paper (which layers its own
 * `paper-global.yml`/`paper-world-defaults.yml` on top rather than replacing it), so this
 * schema applies to both the `spigot` and `paper` flavours - see the registry in
 * `schemas/index.ts`. Only long-stable, well-documented keys from the Spigot wiki's
 * "Spigot.yml" reference are included; view-distance/simulation-distance style knobs that
 * moved to `server.properties` in modern versions are deliberately left out rather than
 * guessed at.
 */

import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, ticks } from "./schemaHelpers.js";

export const spigotFields: readonly FieldMeta[] = [
    field({
        path: "settings.debug",
        label: "Debug logging",
        doc: "Whether to enable extra debug logging for Spigot internals.",
        control: { kind: "switch" },
        default: false,
        group: "settings",
        advanced: true,
    }),
    field({
        path: "settings.bungeecord",
        label: "BungeeCord support",
        doc: "Whether the server should accept BungeeCord-forwarded connections.",
        control: { kind: "switch" },
        default: false,
        group: "settings",
    }),
    field({
        path: "settings.restart-on-crash",
        label: "Restart on crash",
        doc: "Whether Spigot's own watchdog should restart the server after a crash, when a restart script is present.",
        control: { kind: "switch" },
        default: true,
        group: "settings",
    }),
    field({
        path: "settings.timeout-time",
        label: "Watchdog timeout",
        doc: "Seconds a tick may take before the watchdog considers the server crashed.",
        control: boundedInt(0, 2147483647, "seconds"),
        default: 60,
        group: "settings",
        advanced: true,
    }),
    field({
        path: "messages.whitelist",
        label: "Whitelist message",
        doc: "Message shown to a player rejected because they are not whitelisted.",
        control: { kind: "text" },
        default: "You are not whitelisted on this server!",
        group: "messages",
    }),
    field({
        path: "messages.unknown-command",
        label: "Unknown command message",
        doc: "Message shown when a player runs a command the server does not recognise.",
        control: { kind: "text" },
        default: "Unknown command. Type \"/help\" for help.",
        group: "messages",
    }),
    field({
        path: "messages.server-full",
        label: "Server full message",
        doc: "Message shown to a player who tries to join a full server.",
        control: { kind: "text" },
        default: "The server is full!",
        group: "messages",
    }),
    field({
        path: "players.disable-saving",
        label: "Disable player data saving",
        doc: "Whether to disable player data saving. Loses inventories on crash - upstream marks this dangerous.",
        control: { kind: "switch" },
        default: false,
        group: "players",
        advanced: true,
    }),
    field({
        path: "world-settings.default.verbose",
        label: "Verbose world logging (default)",
        doc: "Whether to enable verbose per-world logging for the default world settings block.",
        control: { kind: "switch" },
        default: true,
        group: "world-settings",
        advanced: true,
    }),
    field({
        path: "world-settings.default.hopper-transfer",
        label: "Hopper transfer interval (default)",
        doc: "Ticks between hopper item transfers, for the default world settings block.",
        control: ticks(1),
        default: 8,
        group: "world-settings",
        advanced: true,
    }),
];
