/**
 * Durable promotion of a finished render into the local map catalogue.
 *
 * A render record is not, by itself, proof that a viewer can open a map. This
 * module joins the record, the completed session, and the small output manifest
 * before writing one receipt. The receipt is keyed by render id plus an output
 * identity, so repeated terminal events and restarts are harmless.
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { readRenderRecord, type RenderRecord } from "./provenance.js";
import { readRenderSession } from "./session.js";
import { listRenderIds, renderWorkspace, type RenderWorkspace } from "./workspace.js";

export const FINISHED_PROMOTION_VERSION = 1;
export const FINISHED_PROMOTION_FILE = "finished-render-promotions.json";

export interface FinishedRenderPromotion {
    readonly promotionVersion: 1;
    readonly promotionId: string;
    readonly renderId: string;
    readonly worldIds: readonly string[];
    readonly projectId: string | null;
    readonly mapIds: readonly string[];
    readonly outputRoot: string;
    readonly dataRoot: string;
    readonly engine: {
        readonly id: RenderRecord["engine"];
        readonly version: string;
        readonly source: RenderRecord["engineSource"] | null;
        readonly javaVersion: string | null;
    };
    readonly provenance: {
        readonly recordFile: string;
        readonly sessionFile: string;
        readonly recordVersion: number;
        readonly sessionVersion: number;
        readonly sourceCommit: string | null;
    };
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly outputIdentity: string;
    readonly verifiedReceipt: {
        readonly verifiedAt: string;
        readonly requiredFiles: readonly string[];
    };
}

export interface PromotionFailure {
    readonly renderId: string;
    readonly reason:
        | "missing-record"
        | "not-finished"
        | "missing-session"
        | "session-not-complete"
        | "missing-output"
        | "missing-map-output"
        | "malformed-output"
        | "write-failed";
    readonly detail: string;
}

export interface PromotionResult {
    readonly promotion: FinishedRenderPromotion | null;
    readonly created: boolean;
    readonly failure: PromotionFailure | null;
}

interface PromotionFile {
    readonly promotionVersion: 1;
    readonly promotions: readonly FinishedRenderPromotion[];
}

export interface RenderPromotionStoreOptions {
    readonly storageDir: string | (() => string);
    readonly now?: () => Date;
    readonly sourceCommit?: string | null;
    readonly projectId?: string | null;
    readonly writeText?: (path: string, text: string) => Promise<void>;
}

export class RenderPromotionStore {
    private readonly options: RenderPromotionStoreOptions;
    private promotions: FinishedRenderPromotion[] = [];
    private loaded = false;

    constructor(options: RenderPromotionStoreOptions) {
        this.options = options;
    }

    storageDir(): string {
        return typeof this.options.storageDir === "string"
            ? this.options.storageDir
            : this.options.storageDir();
    }

    file(): string {
        return join(this.storageDir(), FINISHED_PROMOTION_FILE);
    }

    async list(): Promise<readonly FinishedRenderPromotion[]> {
        await this.load();
        return [...this.promotions];
    }

    async reconcile(): Promise<{
        readonly promotions: readonly FinishedRenderPromotion[];
        readonly failures: readonly PromotionFailure[];
    }> {
        await this.load();
        const failures: PromotionFailure[] = [];
        for (const renderId of await listRenderIds(this.storageDir())) {
            const result = await this.promote(renderId);
            if (result.failure !== null) failures.push(result.failure);
        }
        return { promotions: [...this.promotions], failures };
    }

    async promote(renderId: string): Promise<PromotionResult> {
        await this.load();
        const workspace = renderWorkspace(this.storageDir(), renderId);
        const checked = await verifyFinishedRender(workspace, {
            sourceCommit: this.options.sourceCommit ?? null,
            projectId: this.options.projectId ?? null,
        });
        if (checked.promotion === null) return checked;

        const existing = this.promotions.find(
            (entry) => entry.promotionId === checked.promotion?.promotionId,
        );
        if (existing !== undefined) return { promotion: existing, created: false, failure: null };

        const next = [...this.promotions, checked.promotion];
        try {
            await (this.options.writeText ?? atomicWriteTextFile)(
                this.file(),
                `${JSON.stringify({ promotionVersion: 1, promotions: next } satisfies PromotionFile, null, 4)}\n`,
            );
        } catch (error) {
            return {
                promotion: null,
                created: false,
                failure: {
                    renderId,
                    reason: "write-failed",
                    detail: describe(error),
                },
            };
        }
        this.promotions = next;
        return { promotion: checked.promotion, created: true, failure: null };
    }

    private async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const parsed: unknown = JSON.parse(await readFile(this.file(), "utf8"));
            if (
                !isRecord(parsed) ||
                parsed.promotionVersion !== 1 ||
                !Array.isArray(parsed.promotions)
            )
                return;
            this.promotions = parsed.promotions.filter(isPromotion);
        } catch {
            this.promotions = [];
        }
    }
}

export async function verifyFinishedRender(
    workspace: RenderWorkspace,
    options: { readonly sourceCommit: string | null; readonly projectId: string | null } = {
        sourceCommit: null,
        projectId: null,
    },
): Promise<PromotionResult> {
    const record = await readRenderRecord(workspace.recordFile);
    if (record === null)
        return failure(workspace.renderId, "missing-record", "render.json is missing or malformed");
    if (record.outcome !== "finished")
        return failure(workspace.renderId, "not-finished", `render outcome is ${record.outcome}`);
    if (record.finishedAt === null)
        return failure(workspace.renderId, "not-finished", "finished render has no finish time");

    const sessionPath = join(workspace.root, "session.json");
    const session = await readRenderSession(sessionPath);
    if (session === null)
        return failure(
            workspace.renderId,
            "missing-session",
            "completed session.json is missing or malformed",
        );
    if (session.status !== "completed" || session.endedAt === null)
        return failure(
            workspace.renderId,
            "session-not-complete",
            `session status is ${session.status}`,
        );
    if (session.renderId !== record.renderId || session.outputRoot !== workspace.webRoot)
        return failure(
            workspace.renderId,
            "malformed-output",
            "record and session identify different output",
        );

    const requiredFiles = ["settings.json"];
    const rootSettings = await readJsonFile(join(workspace.webRoot, "settings.json"));
    if (rootSettings === null)
        return failure(
            workspace.renderId,
            "missing-output",
            "web/settings.json is missing or malformed",
        );
    const maps = rootSettings.maps;
    if (!Array.isArray(maps) || !maps.every((value): value is string => typeof value === "string"))
        return failure(
            workspace.renderId,
            "malformed-output",
            "web/settings.json has no valid map list",
        );
    const mapIds = record.maps.map((map) => map.id);
    const outputFiles: string[] = [];
    for (const mapId of mapIds) {
        if (!maps.includes(mapId))
            return failure(
                workspace.renderId,
                "malformed-output",
                `web/settings.json omits map ${mapId}`,
            );
        const mapSettings = join(workspace.webRoot, "maps", mapId, "settings.json");
        if (!(await isRegularFile(mapSettings)))
            return failure(
                workspace.renderId,
                "missing-map-output",
                `map settings missing for ${mapId}`,
            );
        if ((await readJsonFile(mapSettings)) === null)
            return failure(
                workspace.renderId,
                "malformed-output",
                `map settings malformed for ${mapId}`,
            );
        requiredFiles.push(relative(workspace.root, mapSettings));
        outputFiles.push(mapSettings);
    }

    const identity = await outputIdentity(workspace, [
        join(workspace.webRoot, "settings.json"),
        ...outputFiles,
    ]);
    if (identity === null)
        return failure(
            workspace.renderId,
            "missing-output",
            "required output files disappeared while verifying",
        );

    const finishedAt = record.finishedAt;
    const promotion: FinishedRenderPromotion = {
        promotionVersion: 1,
        promotionId: `${record.renderId}:${identity}`,
        renderId: record.renderId,
        worldIds: [...new Set(record.maps.map((map) => map.world))],
        projectId: options.projectId,
        mapIds,
        outputRoot: workspace.webRoot,
        dataRoot: `/local/${encodeURIComponent(record.renderId)}`,
        engine: {
            id: record.engine,
            version: record.engineVersion,
            source: record.engineSource ?? null,
            javaVersion: record.javaVersion,
        },
        provenance: {
            recordFile: workspace.recordFile,
            sessionFile: sessionPath,
            recordVersion: record.recordVersion,
            sessionVersion: session.sessionVersion,
            sourceCommit: options.sourceCommit,
        },
        startedAt: record.startedAt,
        finishedAt,
        outputIdentity: identity,
        verifiedReceipt: {
            verifiedAt:
                (options as { readonly verifiedAt?: string }).verifiedAt ??
                new Date().toISOString(),
            requiredFiles,
        },
    };
    return { promotion, created: false, failure: null };
}

function failure(
    renderId: string,
    reason: PromotionFailure["reason"],
    detail: string,
): PromotionResult {
    return { promotion: null, created: false, failure: { renderId, reason, detail } };
}

async function outputIdentity(
    workspace: RenderWorkspace,
    files: readonly string[],
): Promise<string | null> {
    const hash = createHash("sha256");
    hash.update(workspace.renderId);
    for (const file of files) {
        try {
            const info = await stat(file);
            hash.update(relative(workspace.webRoot, file));
            hash.update(String(info.size));
            hash.update(String(info.mtimeMs));
            hash.update(await readFile(file));
        } catch {
            return null;
        }
    }
    return hash.digest("hex");
}

async function isRegularFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
    try {
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPromotion(value: unknown): value is FinishedRenderPromotion {
    if (!isRecord(value)) return false;
    return (
        value.promotionVersion === 1 &&
        typeof value.promotionId === "string" &&
        typeof value.renderId === "string" &&
        typeof value.dataRoot === "string" &&
        typeof value.outputRoot === "string" &&
        typeof value.startedAt === "string" &&
        typeof value.finishedAt === "string" &&
        typeof value.outputIdentity === "string" &&
        Array.isArray(value.mapIds) &&
        value.mapIds.every((mapId) => typeof mapId === "string") &&
        Array.isArray(value.worldIds) &&
        value.worldIds.every((worldId) => typeof worldId === "string") &&
        isRecord(value.verifiedReceipt) &&
        typeof value.verifiedReceipt.verifiedAt === "string" &&
        Array.isArray(value.verifiedReceipt.requiredFiles) &&
        value.verifiedReceipt.requiredFiles.every((file) => typeof file === "string")
    );
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
