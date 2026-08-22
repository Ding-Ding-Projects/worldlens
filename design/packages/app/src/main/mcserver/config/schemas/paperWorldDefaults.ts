/**
 * Hand-written `FieldMeta` for a well-known, stable subset of Paper's
 * `config/paper-world-defaults.yml`.
 *
 * Same honesty note as `paperGlobal.ts`: this is a small, verified subset (anti-xray and
 * chunk-related toggles that have kept their path and type across many Paper releases),
 * not a claim of complete coverage of every per-world key Paper ships.
 */

import type { FieldMeta } from "@worldlens/config";
import { field, select } from "./schemaHelpers.js";

export const paperWorldDefaultsFields: readonly FieldMeta[] = [
    field({
        path: "anticheat.anti-xray.enabled",
        label: "Enable anti-X-ray",
        doc: "Whether Paper should obscure ores from X-ray clients by faking nearby blocks.",
        control: { kind: "switch" },
        default: true,
        group: "anticheat",
    }),
    field({
        path: "anticheat.anti-xray.engine-mode",
        label: "Anti-X-ray engine mode",
        doc: "Which anti-X-ray strategy to use.",
        control: select([
            { value: "1", label: "Hide ores that have no exposed face" },
            { value: "2", label: "Hide ores plus obfuscate nearby blocks" },
        ]),
        default: "1",
        group: "anticheat",
        advanced: true,
    }),
    field({
        path: "chunks.prevent-moving-into-unloaded-chunks",
        label: "Prevent moving into unloaded chunks",
        doc: "Whether to stop entities from being moved into chunks that are not currently loaded.",
        control: { kind: "switch" },
        default: true,
        group: "chunks",
        advanced: true,
    }),
    field({
        path: "entities.spawning.despawn-ranges.soft",
        label: "Soft despawn range",
        doc: "Distance in blocks from a player beyond which an entity may start despawning.",
        control: { kind: "number", integer: true, min: 0 },
        default: 32,
        group: "entities",
        advanced: true,
    }),
    field({
        path: "entities.spawning.despawn-ranges.hard",
        label: "Hard despawn range",
        doc: "Distance in blocks from a player beyond which an entity always despawns.",
        control: { kind: "number", integer: true, min: 0 },
        default: 128,
        group: "entities",
        advanced: true,
    }),
];
