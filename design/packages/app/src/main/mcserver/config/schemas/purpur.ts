/**
 * Hand-written `FieldMeta` for a small, well-known subset of `purpur.yml`.
 *
 * Purpur's own config is very large (several hundred keys, mostly per-world gameplay
 * toggles under `world-settings.default.*`, that Purpur adds and removes across builds
 * faster than any other flavour here). Claiming full, verified coverage of it would not be
 * honest, so this schema intentionally covers only long-standing, well-documented toggles
 * from Purpur's own wiki that have kept the same path and type across many releases. Every
 * other Purpur key still renders through `inferSchema.ts`'s value-shaped inference rather
 * than a text box - it is simply not claimed as a verified, hand-authored control here.
 */

import type { FieldMeta } from "@worldlens/config";
import { field } from "./schemaHelpers.js";

export const purpurFields: readonly FieldMeta[] = [
    field({
        path: "settings.mob-hard-limit-per-chunk",
        label: "Mob hard limit per chunk",
        doc: "Absolute cap on mobs allowed in a single chunk, regardless of category caps.",
        control: { kind: "number", integer: true, min: 0 },
        default: -1,
        group: "settings",
        advanced: true,
    }),
    field({
        path: "settings.velocity.enabled",
        label: "Enable Velocity forwarding",
        doc: "Whether Purpur should accept Velocity modern forwarding, mirroring Paper's own setting.",
        control: { kind: "switch" },
        default: false,
        group: "settings",
    }),
    field({
        path: "world-settings.default.gameplay-mechanics.disable-explosion-knockback",
        label: "Disable explosion knockback",
        doc: "Whether explosions apply no knockback to entities, for the default world settings block.",
        control: { kind: "switch" },
        default: false,
        group: "world-settings",
        advanced: true,
    }),
    field({
        path: "world-settings.default.mobs.zombie.baby-zombie-movement-modifier",
        label: "Baby zombie speed modifier",
        doc: "Movement-speed multiplier applied to baby zombies, for the default world settings block.",
        control: { kind: "number", integer: false, min: 0, max: 10, step: 0.05 },
        default: 1.7,
        group: "world-settings",
        advanced: true,
    }),
    field({
        path: "world-settings.default.blocks.anvil.unbreakable",
        label: "Unbreakable anvils",
        doc: "Whether anvils never take use-damage, for the default world settings block.",
        control: { kind: "switch" },
        default: false,
        group: "world-settings",
        advanced: true,
    }),
];
