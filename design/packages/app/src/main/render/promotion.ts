/** Durable, validated promotion of finished render output into the local catalogue. */

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { isValidMapId } from "./config.js";
import { readRenderRecord, type RenderRecord } from "./provenance.js";
import { readRenderSession } from "./session.js";
import { verifyCompletedOutputManifest, type CompletedOutputManifest } from "./outputManifest.js";
import {
    isValidRenderId,
    listRenderIds,
    renderWorkspace,
    type RenderWorkspace,
} from "./workspace.js";

export const FINISHED_PROMOTION_VERSION = 1;
export const FINISHED_PROMOTION_FILE = "finished-render-promotions.json";
const MAX_WORLD_PATH_LENGTH = 4096;
const MAX_PROJECT_ID_LENGTH = 256;
const MAX_ENGINE_TEXT_LENGTH = 256;
const MAX_REQUIRED_FILES = 256;
const MAX_REQUIRED_FILE_LENGTH = 1024;
const FILE_MUTATIONS = new Map<string, Promise<void>>();

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
        readonly runtime: "local" | "docker" | null;
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
    readonly outputManifest?: CompletedOutputManifest;
    readonly verifiedReceipt: {
        readonly verifiedAt: string;
        readonly requiredFiles: readonly string[];
    };
    readonly notificationDelivered: boolean;
}

export interface PromotionFailure {
    readonly renderId: string;
    readonly reason:
        | "invalid-render-id"
        | "missing-record"
        | "not-finished"
        | "missing-session"
        | "session-not-complete"
        | "missing-output"
        | "missing-map-output"
        | "malformed-output"
        | "provenance-mismatch"
        | "unsafe-path"
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
    readonly unmount?: (renderId: string) => void;
}

export class RenderPromotionStore {
    private readonly options: RenderPromotionStoreOptions;
    private promotions: FinishedRenderPromotion[] = [];
    private rejectedRenderIds: string[] = [];

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
        await this.reconcile();
        return [...this.promotions];
    }

    async reconcile(): Promise<{
        readonly promotions: readonly FinishedRenderPromotion[];
        readonly failures: readonly PromotionFailure[];
    }> {
        return await this.serial(async () => {
            await this.reloadUnlocked();
            const failures: PromotionFailure[] = [];
            const next: FinishedRenderPromotion[] = [];
            const staleRenderIds: string[] = [...this.rejectedRenderIds];
            this.rejectedRenderIds = [];
            for (const stored of this.promotions) {
                const checked = await verifyFinishedRender(
                    renderWorkspace(this.storageDir(), stored.renderId),
                    this.verificationOptions(),
                );
                if (
                    checked.promotion === null ||
                    checked.promotion.promotionId !== stored.promotionId ||
                    !sameStablePromotion(stored, checked.promotion)
                ) {
                    staleRenderIds.push(stored.renderId);
                    failures.push(
                        checked.failure ??
                            failure(
                                stored.renderId,
                                "provenance-mismatch",
                                "stored promotion identity no longer matches output",
                            ).failure!,
                    );
                    continue;
                }
                next.push(stored);
            }
            for (const renderId of await listRenderIds(this.storageDir())) {
                const checked = await verifyFinishedRender(
                    renderWorkspace(this.storageDir(), renderId),
                    this.verificationOptions(),
                );
                if (checked.promotion === null) {
                    if (checked.failure?.reason !== "not-finished") failures.push(checked.failure!);
                    continue;
                }
                if (!next.some((entry) => entry.promotionId === checked.promotion?.promotionId))
                    next.push(checked.promotion);
            }
            if (!samePromotionList(this.promotions, next)) {
                try {
                    await this.writeUnlocked(next);
                } catch (error) {
                    failures.push({
                        renderId: "",
                        reason: "write-failed",
                        detail: describe(error),
                    });
                    return { promotions: [...this.promotions], failures };
                }
            }
            this.promotions = next;
            for (const renderId of staleRenderIds) this.options.unmount?.(renderId);
            return { promotions: [...next], failures };
        });
    }

    async promote(
        renderId: string,
        projectId: string | null = this.options.projectId ?? null,
    ): Promise<PromotionResult> {
        return await this.serial(async () => {
            await this.reloadUnlocked();
            const checked = await verifyFinishedRender(
                renderWorkspace(this.storageDir(), renderId),
                this.verificationOptions(projectId),
            );
            if (checked.promotion === null) return checked;
            const existing = this.promotions.find(
                (entry) => entry.promotionId === checked.promotion?.promotionId,
            );
            if (existing !== undefined)
                return { promotion: existing, created: false, failure: null };
            const next = [...this.promotions, checked.promotion];
            try {
                await this.writeUnlocked(next);
            } catch (error) {
                return {
                    promotion: null,
                    created: false,
                    failure: { renderId, reason: "write-failed", detail: describe(error) },
                };
            }
            this.promotions = next;
            return { promotion: checked.promotion, created: true, failure: null };
        });
    }

    async claimNotification(promotionId: string): Promise<boolean> {
        return await this.serial(async () => {
            await this.reloadUnlocked();
            const index = this.promotions.findIndex((entry) => entry.promotionId === promotionId);
            const current = index < 0 ? undefined : this.promotions[index];
            if (current === undefined || current.notificationDelivered) return false;
            const next = [...this.promotions];
            next[index] = { ...current, notificationDelivered: true };
            await this.writeUnlocked(next);
            this.promotions = next;
            return true;
        });
    }

    private verificationOptions(projectId: string | null = this.options.projectId ?? null): {
        readonly sourceCommit: string | null;
        readonly projectId: string | null;
        readonly storageRoot: string;
    } {
        return {
            sourceCommit: this.options.sourceCommit ?? null,
            projectId,
            storageRoot: resolve(this.storageDir()),
        };
    }

    private async serial<T>(work: () => Promise<T>): Promise<T> {
        const key = this.file();
        const previous = FILE_MUTATIONS.get(key) ?? Promise.resolve();
        let release: (() => void) | undefined;
        const current = new Promise<void>((resolveRelease) => (release = resolveRelease));
        FILE_MUTATIONS.set(key, current);
        await previous;
        try {
            return await work();
        } finally {
            release?.();
            if (FILE_MUTATIONS.get(key) === current) FILE_MUTATIONS.delete(key);
        }
    }

    private async reloadUnlocked(): Promise<void> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.file(), "utf8"));
            if (!isPromotionFile(parsed)) {
                this.promotions = [];
                return;
            }
            this.rejectedRenderIds = parsed.promotions.flatMap((value) =>
                isRecord(value) && typeof value.renderId === "string" && !isPromotion(value)
                    ? [value.renderId]
                    : [],
            );
            this.promotions = parsed.promotions.filter(isPromotion);
        } catch {
            // A first read may legitimately meet no catalogue. Preserve an in-memory
            // catalogue if a transient read races a same-process terminal event.
            return;
        }
    }

    private async writeUnlocked(next: readonly FinishedRenderPromotion[]): Promise<void> {
        await (this.options.writeText ?? atomicWriteTextFile)(
            this.file(),
            `${JSON.stringify({ promotionVersion: 1, promotions: next } satisfies PromotionFile, null, 4)}\n`,
        );
    }
}

export async function verifyFinishedRender(
    workspace: RenderWorkspace,
    options: {
        readonly sourceCommit: string | null;
        readonly projectId: string | null;
        readonly storageRoot?: string;
    } = { sourceCommit: null, projectId: null },
): Promise<PromotionResult> {
    if (!isValidRenderId(workspace.renderId))
        return failure(
            workspace.renderId,
            "invalid-render-id",
            "render id is not a safe catalogue id",
        );
    try {
        await assertNoLinks(workspace.root, options.storageRoot ?? workspace.root);
        await assertNoLinks(workspace.recordFile, workspace.root);
        await assertNoLinks(join(workspace.root, "session.json"), workspace.root);
        await assertNoLinks(workspace.webRoot, workspace.root);
    } catch (error) {
        return failure(workspace.renderId, "unsafe-path", describe(error));
    }

    const record = await readRenderRecord(workspace.recordFile);
    if (record === null)
        return failure(workspace.renderId, "missing-record", "render.json is missing or malformed");
    if (record.renderId !== workspace.renderId)
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "workspace and record render ids differ",
        );
    if (record.outcome !== "finished" || record.finishedAt === null)
        return failure(workspace.renderId, "not-finished", "render is not a completed output");
    if (record.maps.length === 0 || record.maps.length > 64)
        return failure(
            workspace.renderId,
            "malformed-output",
            "record map list is empty or too large",
        );
    if (
        record.engine === "upstream-java" &&
        (record.engineSource === undefined || record.enginePath === null)
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "Java engine provenance is incomplete",
        );

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
    if (session.renderId !== workspace.renderId || session.renderId !== record.renderId)
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "workspace, record and session render ids differ",
        );
    if (session.outputRoot !== workspace.webRoot)
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "session output root differs from workspace output root",
        );
    if (
        session.engine !== record.engine ||
        session.engineVersion !== record.engineVersion ||
        session.javaVersion !== record.javaVersion ||
        (session.runtime ?? null) !== (record.runtime ?? null)
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "engine, runtime or Java provenance differs",
        );
    if (!/^[a-f0-9]{64}$/.test(session.configHash))
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "session config identity is missing or malformed",
        );
    if (
        !sameTimestamp(record.finishedAt, session.endedAt) ||
        !validTimeRange(record.startedAt, record.finishedAt)
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "render timestamps are invalid or disagree",
        );

    const mapIds = record.maps.map((map) => map.id);
    if (new Set(mapIds).size !== mapIds.length || mapIds.some((id) => !isValidMapId(id)))
        return failure(
            workspace.renderId,
            "malformed-output",
            "record contains an invalid or duplicate map id",
        );
    if (
        record.maps.length !== session.maps.length ||
        !record.maps.every((map, index) => sameMap(map, session.maps[index]))
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "record and session map identity differs",
        );
    if (
        record.maps.some(
            (map) => map.world.length === 0 || map.world.length > MAX_WORLD_PATH_LENGTH,
        )
    )
        return failure(
            workspace.renderId,
            "malformed-output",
            "record contains an invalid world path",
        );

    const rootSettingsPath = join(workspace.webRoot, "settings.json");
    const rootSettings = await safeJsonFile(rootSettingsPath, workspace.root);
    if (rootSettings === null)
        return failure(
            workspace.renderId,
            "missing-output",
            "web/settings.json is missing or malformed",
        );
    const outputMaps = rootSettings.maps;
    if (
        !Array.isArray(outputMaps) ||
        !outputMaps.every((value): value is string => typeof value === "string")
    )
        return failure(
            workspace.renderId,
            "malformed-output",
            "web/settings.json has no valid map list",
        );
    if (
        outputMaps.length !== mapIds.length ||
        new Set(outputMaps).size !== outputMaps.length ||
        mapIds.some((id) => !outputMaps.includes(id))
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "web/settings.json map set differs from the completed record",
        );
    const requiredFiles = ["settings.json"];
    const outputFiles = [rootSettingsPath];
    for (const mapId of mapIds) {
        if (!outputMaps.includes(mapId))
            return failure(
                workspace.renderId,
                "malformed-output",
                `web/settings.json omits map ${mapId}`,
            );
        const mapSettings = join(workspace.webRoot, "maps", mapId, "settings.json");
        const mapSettingsJson = await safeJsonFile(mapSettings, workspace.root);
        if (mapSettingsJson === null)
            return failure(
                workspace.renderId,
                "missing-map-output",
                `map settings missing or malformed for ${mapId}`,
            );
        const recordMap = record.maps.find((map) => map.id === mapId);
        if (recordMap === undefined || mapSettingsJson.name !== recordMap.name)
            return failure(
                workspace.renderId,
                "provenance-mismatch",
                `map settings identity differs for ${mapId}`,
            );
        requiredFiles.push(relative(workspace.webRoot, mapSettings).replaceAll("\\", "/"));
        outputFiles.push(mapSettings);
    }
    const identity = await outputIdentity(workspace, outputFiles);
    if (identity === null)
        return failure(
            workspace.renderId,
            "missing-output",
            "required output files disappeared while verifying",
        );
    if (
        record.outputManifest !== undefined &&
        !(await verifyCompletedOutputManifest(workspace.webRoot, record.outputManifest))
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "completed output manifest no longer matches the output tree",
        );

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
            runtime: record.runtime ?? null,
        },
        provenance: {
            recordFile: workspace.recordFile,
            sessionFile: sessionPath,
            recordVersion: record.recordVersion,
            sessionVersion: session.sessionVersion,
            sourceCommit: options.sourceCommit,
        },
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        outputIdentity: identity,
        ...(record.outputManifest === undefined ? {} : { outputManifest: record.outputManifest }),
        verifiedReceipt: { verifiedAt: new Date().toISOString(), requiredFiles },
        notificationDelivered: false,
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
            hash.update(relative(workspace.webRoot, file));
            const bytes = await readFile(file);
            hash.update(String(bytes.byteLength));
            hash.update(bytes);
        } catch {
            return null;
        }
    }
    return hash.digest("hex");
}

async function safeJsonFile(
    path: string,
    workspaceRoot: string,
): Promise<Record<string, unknown> | null> {
    try {
        await assertNoLinks(path, workspaceRoot);
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function assertNoLinks(target: string, stopAt: string): Promise<void> {
    const absoluteTarget = resolve(target);
    const absoluteStop = resolve(stopAt);
    if (!isInside(absoluteStop, absoluteTarget))
        throw new Error("path escapes the render workspace");
    const parts: string[] = [];
    let current = absoluteTarget;
    while (true) {
        parts.unshift(current);
        if (current === absoluteStop) break;
        const parent = resolve(current, "..");
        if (parent === current) throw new Error("path has no workspace ancestor");
        current = parent;
    }
    for (const path of parts) {
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${path}`);
    }
}

function isInside(root: string, child: string): boolean {
    const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
    return child === root || child.startsWith(prefix);
}

function sameMap(
    left: { id: string; world: string; dimension: string; name: string } | undefined,
    right: { id: string; world: string; dimension: string; name: string } | undefined,
): boolean {
    return (
        left !== undefined &&
        right !== undefined &&
        left.id === right.id &&
        left.world === right.world &&
        left.dimension === right.dimension &&
        left.name === right.name
    );
}

function sameTimestamp(left: string, right: string): boolean {
    const a = Date.parse(left);
    const b = Date.parse(right);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1_000;
}

function validTimeRange(startedAt: string, finishedAt: string): boolean {
    const start = Date.parse(startedAt);
    const finish = Date.parse(finishedAt);
    return Number.isFinite(start) && Number.isFinite(finish) && finish >= start;
}

function isPromotionFile(
    value: unknown,
): value is { readonly promotionVersion: 1; readonly promotions: readonly unknown[] } {
    return isRecord(value) && value.promotionVersion === 1 && Array.isArray(value.promotions);
}

function samePromotionList(
    left: readonly FinishedRenderPromotion[],
    right: readonly FinishedRenderPromotion[],
): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function sameStablePromotion(
    left: FinishedRenderPromotion,
    right: FinishedRenderPromotion,
): boolean {
    const stable = (value: FinishedRenderPromotion) => ({
        ...value,
        notificationDelivered: false,
        verifiedReceipt: { ...value.verifiedReceipt, verifiedAt: "" },
    });
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isOutputManifest(value: unknown): value is CompletedOutputManifest {
    if (!isRecord(value)) return false;
    return (
        value.version === 1 &&
        typeof value.fileCount === "number" &&
        Number.isSafeInteger(value.fileCount) &&
        value.fileCount >= 0 &&
        typeof value.totalBytes === "number" &&
        Number.isSafeInteger(value.totalBytes) &&
        value.totalBytes >= 0 &&
        typeof value.payloadFingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(value.payloadFingerprint)
    );
}

function isPromotion(value: unknown): value is FinishedRenderPromotion {
    if (!isRecord(value)) return false;
    const engine = isRecord(value.engine) ? value.engine : null;
    const provenance = isRecord(value.provenance) ? value.provenance : null;
    const receipt = isRecord(value.verifiedReceipt) ? value.verifiedReceipt : null;
    const ok =
        value.promotionVersion === 1 &&
        typeof value.promotionId === "string" &&
        value.promotionId.length <= 256 &&
        typeof value.renderId === "string" &&
        isValidRenderId(value.renderId) &&
        typeof value.dataRoot === "string" &&
        value.dataRoot === `/local/${encodeURIComponent(value.renderId)}` &&
        typeof value.outputRoot === "string" &&
        typeof value.outputIdentity === "string" &&
        (value.outputManifest === undefined || isOutputManifest(value.outputManifest)) &&
        Array.isArray(value.mapIds) &&
        value.mapIds.length > 0 &&
        value.mapIds.length <= 64 &&
        value.mapIds.every((id) => typeof id === "string" && isValidMapId(id)) &&
        Array.isArray(value.worldIds) &&
        value.worldIds.length > 0 &&
        value.worldIds.length <= 64 &&
        value.worldIds.every(
            (world) => typeof world === "string" && world.length <= MAX_WORLD_PATH_LENGTH,
        ) &&
        typeof value.startedAt === "string" &&
        value.startedAt.length <= 64 &&
        typeof value.finishedAt === "string" &&
        value.finishedAt.length <= 64 &&
        engine !== null &&
        (engine.id === "upstream-java" || engine.id === "typescript") &&
        typeof engine.version === "string" &&
        engine.version.length <= MAX_ENGINE_TEXT_LENGTH &&
        (engine.source === null ||
            engine.source === "bundled" ||
            engine.source === "staged" ||
            engine.source === "gradle" ||
            engine.source === "managed") &&
        (engine.javaVersion === null || typeof engine.javaVersion === "string") &&
        (engine.javaVersion === null || engine.javaVersion.length <= 128) &&
        (engine.runtime === null || engine.runtime === "local" || engine.runtime === "docker") &&
        provenance !== null &&
        typeof provenance.recordFile === "string" &&
        typeof provenance.sessionFile === "string" &&
        typeof provenance.recordVersion === "number" &&
        typeof provenance.sessionVersion === "number" &&
        (provenance.sourceCommit === null ||
            (typeof provenance.sourceCommit === "string" &&
                provenance.sourceCommit.length <= 128)) &&
        receipt !== null &&
        typeof receipt.verifiedAt === "string" &&
        Array.isArray(receipt.requiredFiles) &&
        receipt.requiredFiles.length > 0 &&
        receipt.requiredFiles.length <= MAX_REQUIRED_FILES &&
        receipt.requiredFiles.every(
            (file) =>
                typeof file === "string" &&
                file.length > 0 &&
                file.length <= MAX_REQUIRED_FILE_LENGTH &&
                !file.startsWith("/") &&
                !file.includes("\\") &&
                !file.split("/").includes(".."),
        ) &&
        (value.projectId === null ||
            (typeof value.projectId === "string" &&
                value.projectId.length <= MAX_PROJECT_ID_LENGTH)) &&
        typeof value.notificationDelivered === "boolean" &&
        value.promotionId === `${value.renderId}:${value.outputIdentity}`;
    return ok;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
