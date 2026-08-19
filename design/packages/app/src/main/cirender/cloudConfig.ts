/**
 * Cloud-first project creation.
 *
 * A computer that cannot render locally still needs a complete project file: the
 * cloud workflow reads the same file from the uploaded world archive.  This module
 * deliberately does not import the local render bridge, Java, BlueMap's CLI, or a
 * process runner.  It uses the shared config generator and the ordinary project-save
 * adapter, so the resulting file is the same schema a local editor would write and
 * its history is kept in the application's isolated project-history repository.
 */

import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import {
    PROJECT_FORMAT_VERSION,
    PROJECT_SCHEMA_ID,
    generateConfigSet,
    parseProjectFile,
    renderMapTemplate,
    type ProjectFile,
    type ProjectMap,
} from "@worldlens/config";
import { readProjectAt } from "./plan.js";
import { saveProject, type ProjectHistoryOptions, type ProjectSaveResult } from "../project/index.js";

/** The input fields the cloud setup surface can edit. Every one has an honest default. */
export interface CloudRenderConfigInput {
    readonly worldFolder: string;
    readonly projectName?: string | undefined;
    readonly mapId?: string | undefined;
    readonly mapName?: string | undefined;
    readonly dimension?: string | undefined;
    readonly sorting?: number | undefined;
    readonly enabledMapIds?: readonly string[] | undefined;
    readonly dataFolder?: string | undefined;
    readonly webroot?: string | undefined;
    readonly outputFolder?: string | null | undefined;
    readonly threads?: number | null | undefined;
    readonly force?: boolean | undefined;
    readonly fixEdges?: boolean | undefined;
    readonly metrics?: boolean | undefined;
}

export interface CloudRenderConfigDefaults {
    readonly projectName: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    readonly sorting: number;
    readonly enabledMapIds: readonly string[];
    readonly dataFolder: string;
    readonly webroot: string;
    readonly outputFolder: string | null;
    readonly threads: number | null;
    readonly force: boolean;
    readonly fixEdges: boolean;
    readonly metrics: boolean;
    readonly storageId: "file";
}

export type CloudRenderConfigFailureCode =
    | "invalid-request"
    | "invalid-world"
    | "already-exists"
    | "unreadable-project"
    | "cancelled"
    | "write-failed";

export interface CloudRenderConfigFailure {
    readonly code: CloudRenderConfigFailureCode;
    readonly message: string;
}

export type CloudRenderConfigBuildResult =
    | { readonly ok: true; readonly project: ProjectFile; readonly defaults: CloudRenderConfigDefaults }
    | { readonly ok: false; readonly failure: CloudRenderConfigFailure };

export type CloudRenderConfigSaveResult =
    | {
          readonly ok: true;
          readonly project: ProjectFile;
          readonly defaults: CloudRenderConfigDefaults;
          readonly saved: ProjectSaveResult & { readonly ok: true };
      }
    | { readonly ok: false; readonly failure: CloudRenderConfigFailure };

export interface CloudRenderConfigStamp {
    readonly now?: string | undefined;
    readonly id?: string | undefined;
    readonly appVersion?: string | null | undefined;
}

export const CLOUD_CONFIG_DEFAULT_DATA_FOLDER = "data";
export const CLOUD_CONFIG_DEFAULT_WEBROOT = "web";
export const CLOUD_CONFIG_DEFAULT_MAP_ID = "overworld";
export const CLOUD_CONFIG_DEFAULT_MAP_NAME = "Overworld";
export const CLOUD_CONFIG_DEFAULT_DIMENSION = "minecraft:overworld";

const SUPPORTED_DIMENSIONS = new Set([
    "minecraft:overworld",
    "minecraft:the_nether",
    "minecraft:the_end",
]);

/**
 * Derives the visible defaults without touching the file system.  The folder name is
 * only a display default; the world path itself is never copied into project metadata
 * except where the generated map config needs it.
 */
export function cloudRenderConfigDefaults(input: CloudRenderConfigInput): CloudRenderConfigDefaults {
    const world = input.worldFolder.trim().replace(/[\\/]+$/, "");
    const projectName = input.projectName?.trim() || basename(world) || "Untitled project";
    const mapId = input.mapId?.trim() || CLOUD_CONFIG_DEFAULT_MAP_ID;
    const mapName = input.mapName?.trim() || (mapId === CLOUD_CONFIG_DEFAULT_MAP_ID ? CLOUD_CONFIG_DEFAULT_MAP_NAME : mapId);
    const dimension = input.dimension?.trim() || CLOUD_CONFIG_DEFAULT_DIMENSION;
    const sorting = input.sorting ?? 0;
    const generatedIds = [mapId, "nether", "end"];
    return {
        projectName,
        mapId,
        mapName,
        dimension,
        sorting,
        enabledMapIds: input.enabledMapIds === undefined ? generatedIds : [...input.enabledMapIds],
        dataFolder: input.dataFolder?.trim() || CLOUD_CONFIG_DEFAULT_DATA_FOLDER,
        webroot: input.webroot?.trim() || CLOUD_CONFIG_DEFAULT_WEBROOT,
        outputFolder: input.outputFolder?.trim() || null,
        threads: input.threads === undefined ? null : input.threads,
        force: input.force ?? false,
        fixEdges: input.fixEdges ?? false,
        metrics: input.metrics ?? false,
        storageId: "file",
    };
}

function stamp(stampInput: CloudRenderConfigStamp): { now: string; id: string; appVersion: string | null } {
    return {
        now: stampInput.now ?? new Date().toISOString(),
        id: stampInput.id ?? `p${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        appVersion: stampInput.appVersion ?? null,
    };
}

function invalid(message: string, code: CloudRenderConfigFailureCode = "invalid-request"):
    { readonly ok: false; readonly failure: CloudRenderConfigFailure } {
    return { ok: false, failure: { code, message } };
}

function mapFromGenerated(
    generated: ReadonlyMap<string, string>,
    id: string,
    name: string,
    dimension: string,
    sorting: number,
    world: string,
): ProjectMap | null {
    const config = generated.get(`maps/${id}.conf`);
    if (config === undefined) return null;
    return { id, name, world, dimension, config, storage: "file", sorting, enabled: true };
}

function presetFor(dimension: string): "overworld" | "nether" | "end" {
    if (dimension === "minecraft:the_nether") return "nether";
    if (dimension === "minecraft:the_end") return "end";
    return "overworld";
}

/**
 * Builds the complete cloud project from the shared generator's real defaults.
 * No Java, JDK, client, network, or local render is touched here.
 */
export function buildCloudRenderProject(
    input: CloudRenderConfigInput,
    stampInput: CloudRenderConfigStamp = {},
): CloudRenderConfigBuildResult {
    const worldFolder = input.worldFolder.trim();
    if (worldFolder === "" || !isAbsolute(worldFolder) || worldFolder.split(/[\\/]/).includes("..")) {
        return invalid(
            "Choose the world folder with a full path. Cloud setup does not create or render a world for an ambiguous path.",
            "invalid-world",
        );
    }
    const defaults = cloudRenderConfigDefaults(input);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(defaults.mapId)) {
        return invalid(
            "The map id may contain lower-case letters, digits, hyphens and underscores, and must start with a letter or digit.",
        );
    }
    if (defaults.mapId === "nether" || defaults.mapId === "end") {
        return invalid(`The map id ${defaults.mapId} is already used by another generated vanilla map.`);
    }
    if (!SUPPORTED_DIMENSIONS.has(defaults.dimension)) {
        return invalid(
            `The cloud workflow supports only ${[...SUPPORTED_DIMENSIONS].join(", ")}; ${defaults.dimension} is not one of them.`,
        );
    }
    if (defaults.threads !== null && (!Number.isInteger(defaults.threads) || defaults.threads < 1)) {
        return invalid("Render threads must be empty (automatic) or a positive whole number.");
    }
    if (!Number.isInteger(defaults.sorting)) return invalid("Map sorting must be a whole number.");
    const validMapIds = new Set([defaults.mapId, "nether", "end"]);
    if (defaults.enabledMapIds.length === 0 || defaults.enabledMapIds.some((id) => !validMapIds.has(id))) {
        return invalid("Keep at least one generated map enabled, using only the map ids shown in the guide.");
    }
    for (const [label, value] of [["data folder", defaults.dataFolder], ["web root", defaults.webroot]] as const) {
        if (value.includes("..") || value.includes("\0")) return invalid(`The ${label} cannot contain '..' or a null character.`);
    }

    const generated = generateConfigSet({
        world: worldFolder,
        dataFolder: defaults.dataFolder,
        webroot: defaults.webroot,
        version: stampInput.appVersion ?? "Worldlens",
        includePluginConfig: true,
        includeMetrics: defaults.metrics,
        isCli: true,
    });
    const byPath = new Map(generated.map((file) => [file.path, file.text]));
    const mapDefinitions = [
        { id: defaults.mapId, sourceId: "overworld", name: defaults.mapName, dimension: defaults.dimension, sorting: defaults.sorting },
        { id: "nether", sourceId: "nether", name: "Nether", dimension: "minecraft:the_nether", sorting: 100 },
        { id: "end", sourceId: "end", name: "End", dimension: "minecraft:the_end", sorting: 200 },
    ] as const;
    const maps: ProjectMap[] = [];
    for (const definition of mapDefinitions) {
        const chosen =
            definition;
        const generatedMap = mapFromGenerated(
            byPath,
            definition.sourceId,
            chosen.name,
            chosen.dimension,
            definition.sorting,
            worldFolder,
        );
        const map =
            generatedMap === null
                ? null
                : definition.sourceId !== CLOUD_CONFIG_DEFAULT_MAP_ID
                  ? generatedMap
                  : {
                        ...generatedMap,
                        id: chosen.id,
                        config: renderMapTemplate({
                            name: chosen.name,
                            world: worldFolder,
                            dimension: chosen.dimension,
                            dimensionType: chosen.dimension,
                            sorting: defaults.sorting,
                            preset: presetFor(chosen.dimension),
                        }),
                    };
        if (map === null) return invalid(`The shared config generator did not produce maps/${definition.id}.conf.`);
        maps.push({ ...map, enabled: defaults.enabledMapIds.includes(map.id) });
    }
    const fileStorage = byPath.get("storages/file.conf");
    if (fileStorage === undefined) return invalid("The shared config generator did not produce the file storage defaults.");

    const writtenAt = stamp(stampInput);
    const project: ProjectFile = {
        schema: PROJECT_SCHEMA_ID,
        version: PROJECT_FORMAT_VERSION,
        id: writtenAt.id,
        name: defaults.projectName,
        createdAt: writtenAt.now,
        updatedAt: writtenAt.now,
        appVersion: writtenAt.appVersion,
        maps,
        storages: [{ id: "file", config: fileStorage }],
        render: {
            route: "github-actions",
            // Cloud Actions always runs the bundled upstream Java renderer. Persisting the
            // engine is intentional: preflight must reject a genuinely incompatible choice,
            // never silently reinterpret a local TypeScript choice as cloud Java.
            engine: "upstream-java",
            threads: defaults.threads,
            force: defaults.force,
            fixEdges: defaults.fixEdges,
            metrics: defaults.metrics,
            outputFolder: defaults.outputFolder,
        },
        core: byPath.get("core.conf") ?? null,
        webapp: byPath.get("webapp.conf") ?? null,
        webserver: byPath.get("webserver.conf") ?? null,
        plugin: byPath.get("plugin.conf") ?? null,
        fromWizard: true,
    };
    const checked = parseProjectFile(JSON.stringify(project));
    if (!checked.ok) return invalid(`The generated cloud project did not pass its schema: ${checked.failure.kind}.`);
    return { ok: true, project: checked.project, defaults };
}

export interface SaveCloudRenderConfigOptions extends ProjectHistoryOptions {
    readonly appVersion?: string | null | undefined;
    readonly replaceUnreadable?: boolean | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly stamp?: CloudRenderConfigStamp | undefined;
}

/** Writes only a missing project, atomically, then records the save in local history. */
export async function saveCloudRenderConfig(
    options: SaveCloudRenderConfigOptions,
    input: CloudRenderConfigInput,
): Promise<CloudRenderConfigSaveResult> {
    if (options.signal?.aborted) return invalid("Cloud project creation was cancelled before anything was written.", "cancelled");
    const worldFolder = resolve(input.worldFolder.trim());
    const folder = await lstat(worldFolder).catch(() => null);
    if (folder === null || !folder.isDirectory()) {
        return invalid(`${worldFolder} is not an existing world folder, so no project was written.`, "invalid-world");
    }
    const existing = await readProjectAt(worldFolder);
    if (existing.ok) return invalid(`This world already has a project named ${existing.project.name}; it was left unchanged.`, "already-exists");
    if (existing.failure.code !== "no-project") return invalid(existing.failure.message, "unreadable-project");
    if (options.signal?.aborted) return invalid("Cloud project creation was cancelled before the atomic save.", "cancelled");

    const built = buildCloudRenderProject(input, { appVersion: options.appVersion ?? null, ...(options.stamp ?? {}) });
    if (!built.ok) return built;
    if (options.signal?.aborted) return invalid("Cloud project creation was cancelled before the atomic save.", "cancelled");
    // Cancellation is deliberately checked immediately before entering saveProject. The
    // project writer owns a three-step atomic write and cannot be interrupted safely after
    // its temporary file is created; a cancel racing that boundary therefore completes the
    // save and reports the truthful saved result rather than pretending the file is absent.
    const saved = await saveProject(
        {
            dataDir: options.dataDir,
            embedHistory: true,
            write: { replaceUnreadable: options.replaceUnreadable === true },
            ...(options.git === undefined ? {} : { git: options.git }),
        },
        worldFolder,
        built.project,
    );
    if (!saved.ok) return invalid(saved.reason, "write-failed");
    return { ok: true, project: saved.project, defaults: built.defaults, saved };
}
