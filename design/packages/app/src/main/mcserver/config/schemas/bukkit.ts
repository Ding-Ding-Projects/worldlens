/**
 * Hand-written `FieldMeta` for the long-stable core of `bukkit.yml`.
 *
 * `bukkit.yml` is the oldest of the three legacy config files (predates Spigot) and every
 * flavour downstream of CraftBukkit still reads it, so this schema applies to `spigot`,
 * `paper` and `purpur` alike - see `schemas/index.ts`.
 */

import type { FieldMeta } from "@worldlens/config";
import { boundedInt, field, ticks } from "./schemaHelpers.js";

export const bukkitFields: readonly FieldMeta[] = [
    field({
        path: "settings.allow-end",
        label: "Allow the End",
        doc: "Whether players can travel to the End dimension.",
        control: { kind: "switch" },
        default: true,
        group: "settings",
    }),
    field({
        path: "settings.warn-on-overload",
        label: "Warn on overload",
        doc: "Whether to print a warning when the server can't keep up and starts skipping ticks.",
        control: { kind: "switch" },
        default: true,
        group: "settings",
        advanced: true,
    }),
    field({
        path: "settings.permissions-file",
        label: "Permissions file",
        doc: "Path to the legacy Bukkit permissions.yml file.",
        control: { kind: "path", select: "file", relativeToWorkingDirectory: true },
        default: "permissions.yml",
        group: "settings",
        advanced: true,
    }),
    field({
        path: "spawn-limits.monsters",
        label: "Monster spawn limit",
        doc: "Maximum number of monsters that can spawn per world tick sweep.",
        control: boundedInt(0, 2147483647),
        default: 70,
        group: "spawn-limits",
    }),
    field({
        path: "spawn-limits.animals",
        label: "Animal spawn limit",
        doc: "Maximum number of animals that can spawn per world tick sweep.",
        control: boundedInt(0, 2147483647),
        default: 10,
        group: "spawn-limits",
    }),
    field({
        path: "spawn-limits.water-animals",
        label: "Water animal spawn limit",
        doc: "Maximum number of water animals that can spawn per world tick sweep.",
        control: boundedInt(0, 2147483647),
        default: 5,
        group: "spawn-limits",
    }),
    field({
        path: "spawn-limits.water-ambient",
        label: "Water ambient spawn limit",
        doc: "Maximum number of water-ambient mobs (fish schools) that can spawn per world tick sweep.",
        control: boundedInt(0, 2147483647),
        default: 20,
        group: "spawn-limits",
    }),
    field({
        path: "spawn-limits.ambient",
        label: "Ambient spawn limit",
        doc: "Maximum number of ambient mobs (bats) that can spawn per world tick sweep.",
        control: boundedInt(0, 2147483647),
        default: 15,
        group: "spawn-limits",
    }),
    field({
        path: "chunk-gc.period-in-ticks",
        label: "Chunk garbage-collection period",
        doc: "Ticks between sweeps that unload chunks nobody is using.",
        control: ticks(1),
        default: 600,
        group: "chunk-gc",
        advanced: true,
    }),
    field({
        path: "ticks-per.animal-spawns",
        label: "Ticks per animal spawn attempt",
        doc: "Ticks between animal spawn attempts. 0 disables animal spawning.",
        control: ticks(0),
        default: 400,
        group: "ticks-per",
    }),
    field({
        path: "ticks-per.monster-spawns",
        label: "Ticks per monster spawn attempt",
        doc: "Ticks between monster spawn attempts. 0 disables monster spawning.",
        control: ticks(0),
        default: 1,
        group: "ticks-per",
    }),
    field({
        path: "ticks-per.water-spawns",
        label: "Ticks per water-mob spawn attempt",
        doc: "Ticks between water animal spawn attempts. 0 disables water-mob spawning.",
        control: ticks(0),
        default: 1,
        group: "ticks-per",
        advanced: true,
    }),
];
