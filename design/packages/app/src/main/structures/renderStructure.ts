/**
 * Rendering one dropped structure or schematic file.
 *
 * This is the whole adaptation the drop-render lane makes: parse the file
 * (`parseStructureFile.ts`), wrap its blocks in the smallest real world that can hold them
 * (`buildStructureWorld.ts`), and then hand that world's folder to the *same*
 * `RenderOrchestrator.render` every world render already goes through - see
 * `render/orchestrator.ts` and `render/ipc.ts`, which this module is deliberately styled
 * after rather than duplicating. Nothing about meshing, tiling, storage or provenance is
 * reimplemented here; a structure render produces exactly the same `render.json`, the same
 * `RenderSuccess`/`RenderFailureResult` shape and the same progress events on
 * `RENDER_EVENT_CHANNEL` a world render does; a caller cannot tell the two apart once the
 * synthetic world folder has been written.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RenderOrchestrator, RenderResult } from "../render/orchestrator.js";
import { buildStructureWorld } from "./buildStructureWorld.js";
import { parseStructureFile } from "./parseStructureFile.js";
import type { ParseStructureFailureCode } from "./parseStructureFile.js";

export interface RenderStructureOptions {
    readonly orchestrator: RenderOrchestrator;
    /** Absolute path to the dropped `.nbt`/`.schem`/`.schematic`/`.litematic` file. */
    readonly filePath: string;
    /**
     * Where synthetic worlds are written, one subfolder per structure. Kept apart from the
     * render channel's own `storageDir` - that one holds finished tile output and its own
     * provenance records, and a synthetic *input* world sitting inside it would show up in
     * every listing that walks that folder looking for renders.
     */
    readonly worldsDir: string;
}

export type RenderStructureFailureCode = ParseStructureFailureCode | "read-failed" | "world-build-failed";

export interface RenderStructureFailure {
    readonly ok: false;
    readonly code: RenderStructureFailureCode;
    readonly message: string;
}

export type RenderStructureOutcome =
    | { readonly ok: true; readonly render: Extract<RenderResult, { ok: true }> }
    | RenderStructureFailure
    /** The synthetic world was built, but BlueMap itself failed or refused to render it. */
    | { readonly ok: false; readonly code: "render-failed"; readonly render: Extract<RenderResult, { ok: false }> };

function baseName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    return slash < 0 ? normalized : normalized.slice(slash + 1);
}

/** A filesystem- and map-id-safe stem for the dropped file's own name. */
function safeStem(name: string): string {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const cleaned = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned.length > 0 ? cleaned : "structure";
}

export async function renderStructure(options: RenderStructureOptions): Promise<RenderStructureOutcome> {
    const name = baseName(options.filePath);

    let bytes: Uint8Array;
    try {
        bytes = await readFile(options.filePath);
    } catch (error) {
        return {
            ok: false,
            code: "read-failed",
            message: `"${name}" could not be read: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const parsed = parseStructureFile(name, bytes);
    if (!parsed.ok) return parsed;

    // A stem plus a short hash of the source path, so dropping the same file twice reuses
    // one synthetic world (and one render id) instead of piling up a fresh one every time -
    // the same incremental-render reasoning `renderIdForWorld` already applies to real
    // worlds.
    const mapId = `structure-${safeStem(name)}-${hashOf(options.filePath)}`;
    const worldFolder = join(options.worldsDir, mapId);

    try {
        await rm(worldFolder, { recursive: true, force: true });
        await mkdir(options.worldsDir, { recursive: true });
        await buildStructureWorld(parsed.structure, worldFolder);
    } catch (error) {
        return {
            ok: false,
            code: "world-build-failed",
            message: `"${name}" could not be turned into a renderable world: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const result = await options.orchestrator.render({
        renderId: mapId,
        maps: [
            {
                id: mapId,
                world: worldFolder,
                name,
                dimension: "minecraft:overworld",
            },
        ],
    });

    if (!result.ok) return { ok: false, code: "render-failed", render: result };
    return { ok: true, render: result };
}

/** A short, stable, filesystem-safe tag derived from a path - not cryptographic, just distinct. */
function hashOf(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
