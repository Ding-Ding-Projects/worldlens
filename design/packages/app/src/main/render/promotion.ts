/** Durable, validated promotion of finished render output into the local catalogue. */

import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { isValidMapId } from "./config.js";
import { readRenderRecord, type RenderRecord } from "./provenance.js";
import { readRenderSession, renderConfigFingerprint } from "./session.js";
import {
    buildCompletedOutputManifest,
    isCompletedOutputManifest,
    verifyCompletedOutputManifest,
    type CompletedOutputManifest,
} from "./outputManifest.js";
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
const LOCK_RETRY_MS = 100;
const LOCK_RETRIES = 120;
const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_HEARTBEAT_MS = 1_000;
const PROCESS_START_IDENTITY = `${Math.floor(Date.now() - process.uptime() * 1_000)}:${randomUUID()}`;

interface LockLease {
    readonly version: 1;
    readonly ownerPid: number;
    readonly ownerStartIdentity: string;
    readonly leaseId: string;
    readonly heartbeatAt: string;
}

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
    /** Legacy records without a config hash are retained as explicitly unverified migrations. */
    readonly verificationStatus: "verified" | "migrated-unverified";
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
    readonly lockRetryMs?: number;
    readonly lockRetries?: number;
    readonly lockStaleMs?: number;
    readonly lockHeartbeatMs?: number;
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

    private lockFile(): string {
        return join(this.canonicalStorageDir(), ".finished-render-promotions.lock");
    }

    private canonicalStorageDir(): string {
        const resolved = resolve(this.storageDir());
        try {
            const real = realpathSync.native(resolved);
            return process.platform === "win32" || process.platform === "darwin"
                ? real.toLowerCase()
                : real;
        } catch {
            return process.platform === "win32" || process.platform === "darwin"
                ? resolved.toLowerCase()
                : resolved;
        }
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
        const key = this.canonicalStorageDir();
        const previous = FILE_MUTATIONS.get(key) ?? Promise.resolve();
        let release: (() => void) | undefined;
        const current = new Promise<void>((resolveRelease) => (release = resolveRelease));
        FILE_MUTATIONS.set(key, current);
        await previous;
        let lock: (() => Promise<void>) | undefined;
        try {
            lock = await this.acquireDurableLock();
            return await work();
        } finally {
            await lock?.();
            release?.();
            if (FILE_MUTATIONS.get(key) === current) FILE_MUTATIONS.delete(key);
        }
    }

    private async acquireDurableLock(): Promise<() => Promise<void>> {
        await mkdir(this.canonicalStorageDir(), { recursive: true });
        const path = this.lockFile();
        const retryMs = this.options.lockRetryMs ?? LOCK_RETRY_MS;
        const retries = this.options.lockRetries ?? LOCK_RETRIES;
        const staleMs = this.options.lockStaleMs ?? LOCK_STALE_MS;
        const heartbeatMs = this.options.lockHeartbeatMs ?? LOCK_HEARTBEAT_MS;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            try {
                const handle = await open(path, "wx");
                const lease: LockLease = {
                    version: 1,
                    ownerPid: process.pid,
                    ownerStartIdentity: PROCESS_START_IDENTITY,
                    leaseId: randomUUID(),
                    heartbeatAt: new Date().toISOString(),
                };
                await handle.writeFile(`${JSON.stringify(lease)}\n`, "utf8");
                await handle.close();
                let released = false;
                const heartbeat = setInterval(() => {
                    void refreshLease(path, lease);
                }, heartbeatMs);
                heartbeat.unref?.();
                return async () => {
                    if (released) return;
                    released = true;
                    clearInterval(heartbeat);
                    if (await ownsLease(path, lease)) await rm(path, { force: true });
                };
            } catch (error) {
                if (!isAlreadyExists(error)) throw error;
                try {
                    const lease = await readLease(path);
                    const age = Date.now() - (await stat(path)).mtimeMs;
                    if (lease !== null && age > staleMs && !(await isLeaseOwnerAlive(lease)))
                        await rm(path, { force: true });
                } catch {
                    // The competing process may have released it between stat and rm.
                }
                await new Promise<void>((resolveWait) => setTimeout(resolveWait, retryMs));
            }
        }
        throw new Error("The render promotion catalogue lock remained held.");
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
    if (canonicalTextPath(session.outputRoot) !== canonicalTextPath(workspace.webRoot))
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
        record.configHash !== undefined &&
        renderConfigFingerprint(session.maps) !== session.configHash
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "session config identity does not match its canonical map configuration",
        );
    if (record.configHash !== undefined && record.configHash !== session.configHash)
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "record and session config identities differ",
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
    }
    const outputManifest =
        record.outputManifest ?? (await buildCompletedOutputManifest(workspace.webRoot, mapIds));
    if (outputManifest === null)
        return failure(
            workspace.renderId,
            "missing-output",
            "completed output manifest is missing or could not be computed",
        );
    if (
        record.outputManifest !== undefined &&
        !(await verifyCompletedOutputManifest(workspace.webRoot, outputManifest, mapIds))
    )
        return failure(
            workspace.renderId,
            "provenance-mismatch",
            "completed output manifest no longer matches the output tree",
        );
    if (
        outputManifest.maps.length !== mapIds.length ||
        new Set(outputManifest.maps.map((map) => map.id)).size !== outputManifest.maps.length ||
        outputManifest.maps.some((map) => !mapIds.includes(map.id)) ||
        outputManifest.maps.some((map) => map.fileCount < 2 || map.totalBytes <= 0)
    )
        return failure(
            workspace.renderId,
            "malformed-output",
            "a map has no rendered payload beyond settings",
        );
    const identity = outputManifest.payloadFingerprint;

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
        verificationStatus: record.configHash === undefined ? "migrated-unverified" : "verified",
        outputIdentity: identity,
        outputManifest,
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

async function safeJsonFile(
    path: string,
    workspaceRoot: string,
): Promise<Record<string, unknown> | null> {
    try {
        await assertNoLinks(path, workspaceRoot);
        const before = await lstat(path);
        const noFollow = process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW;
        const handle = await open(path, fsConstants.O_RDONLY | noFollow);
        let text: string;
        try {
            const opened = await handle.stat();
            const afterOpen = await lstat(path);
            if (
                before.isSymbolicLink() ||
                afterOpen.isSymbolicLink() ||
                !sameFileIdentity(before, opened) ||
                !sameFileIdentity(afterOpen, opened)
            )
                return null;
            text = await handle.readFile("utf8");
            const after = await handle.stat();
            const afterPath = await lstat(path);
            if (
                !sameFileIdentity(opened, after) ||
                afterPath.isSymbolicLink() ||
                !sameFileIdentity(afterPath, after)
            )
                return null;
        } finally {
            await handle.close();
        }
        const parsed: unknown = JSON.parse(text);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function sameFileIdentity(
    left: { size: number; mtimeMs: number; ctimeMs: number; ino?: number; dev?: number },
    right: { size: number; mtimeMs: number; ctimeMs: number; ino?: number; dev?: number },
): boolean {
    return (
        left.size === right.size &&
        left.mtimeMs === right.mtimeMs &&
        left.ctimeMs === right.ctimeMs &&
        (left.ino === undefined ||
            right.ino === undefined ||
            left.ino === 0 ||
            right.ino === 0 ||
            left.ino === right.ino) &&
        (left.dev === undefined ||
            right.dev === undefined ||
            left.dev === 0 ||
            right.dev === 0 ||
            left.dev === right.dev)
    );
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
        let info;
        try {
            info = await lstat(path);
        } catch (error) {
            // A component that is not there cannot be a symbolic link, and this check exists
            // to refuse one that is. Reporting ENOENT here turned every absent workspace into
            // "unsafe-path", which reads as a security refusal -- the caller, and anybody
            // reading the log, is told the path was rejected when the truth is that nothing is
            // at it. The existence checks further down produce the honest missing-record or
            // missing-output reason instead.
            //
            // Only ENOENT. A permission error, an I/O error or anything else still fails,
            // because those are cases where a link genuinely might be there and could not be
            // ruled out.
            if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") continue;
            throw error;
        }
        if (info.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${path}`);
    }
}

function isInside(root: string, child: string): boolean {
    const fold = (value: string) => {
        const normalized = value.replaceAll("\\", "/");
        return process.platform === "win32" || process.platform === "darwin"
            ? normalized.toLowerCase()
            : normalized;
    };
    const foldedRoot = fold(root);
    const foldedChild = fold(child);
    const prefix = foldedRoot.endsWith("/") ? foldedRoot : `${foldedRoot}/`;
    return foldedChild === foldedRoot || foldedChild.startsWith(prefix);
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
        outputRoot: canonicalTextPath(value.outputRoot),
        provenance: {
            ...value.provenance,
            recordFile: canonicalTextPath(value.provenance.recordFile),
            sessionFile: canonicalTextPath(value.provenance.sessionFile),
        },
        verifiedReceipt: { ...value.verifiedReceipt, verifiedAt: "" },
    });
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function canonicalTextPath(value: string): string {
    const normalized = value.replaceAll("\\", "/");
    return process.platform === "win32" || process.platform === "darwin"
        ? normalized.toLowerCase()
        : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isPromotion(value: unknown): value is FinishedRenderPromotion {
    if (!isRecord(value)) return false;
    const mapIds = Array.isArray(value.mapIds) ? value.mapIds : null;
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
        (value.outputManifest === undefined || isCompletedOutputManifest(value.outputManifest)) &&
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
        (value.verificationStatus === "verified" ||
            value.verificationStatus === "migrated-unverified") &&
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
        value.promotionId === `${value.renderId}:${value.outputIdentity}` &&
        (value.outputManifest === undefined ||
            (value.outputIdentity === value.outputManifest.payloadFingerprint &&
                mapIds !== null &&
                value.outputManifest.maps.length === mapIds.length &&
                value.outputManifest.maps.every((map) => mapIds.includes(map.id))));
    return ok;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isAlreadyExists(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "EEXIST"
    );
}

async function readLease(path: string): Promise<LockLease | null> {
    try {
        const value: unknown = JSON.parse(await readFile(path, "utf8"));
        if (!isRecord(value)) return null;
        return value.version === 1 &&
            typeof value.ownerPid === "number" &&
            Number.isSafeInteger(value.ownerPid) &&
            value.ownerPid > 0 &&
            typeof value.ownerStartIdentity === "string" &&
            value.ownerStartIdentity.length > 0 &&
            typeof value.leaseId === "string" &&
            value.leaseId.length > 0 &&
            typeof value.heartbeatAt === "string"
            ? (value as unknown as LockLease)
            : null;
    } catch {
        return null;
    }
}

async function ownsLease(path: string, expected: LockLease): Promise<boolean> {
    const current = await readLease(path);
    return (
        current !== null &&
        current.ownerPid === expected.ownerPid &&
        current.ownerStartIdentity === expected.ownerStartIdentity &&
        current.leaseId === expected.leaseId
    );
}

async function refreshLease(path: string, lease: LockLease): Promise<void> {
    try {
        if (!(await ownsLease(path, lease))) return;
        const handle = await open(path, "r+");
        try {
            const updated: LockLease = { ...lease, heartbeatAt: new Date().toISOString() };
            await handle.truncate(0);
            await handle.writeFile(`${JSON.stringify(updated)}\n`, "utf8");
        } finally {
            await handle.close();
        }
    } catch {
        // A missing or replaced lease is not recreated by the heartbeat.
    }
}

async function isLeaseOwnerAlive(lease: LockLease): Promise<boolean> {
    if (lease.ownerPid === process.pid) return lease.ownerStartIdentity === PROCESS_START_IDENTITY;
    try {
        process.kill(lease.ownerPid, 0);
        return true;
    } catch {
        return false;
    }
}
