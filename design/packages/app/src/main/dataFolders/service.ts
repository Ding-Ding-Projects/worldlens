/**
 * The data folder feature as one object: where the profile and save folders are, moving them
 * safely, keeping the profile's history, and the optional send to a remote.
 *
 * It owns no IPC and no Electron import, so it is exercised with real folders and real Git in
 * tests. `ipc.ts` is the thin layer that exposes it to the interface.
 */

import { lstat, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { GitRunner } from "../history/git.js";
import { copyTree, measureTree, treeIsContainedIn, type MoveProgress, type SkippedEntry } from "./move.js";
import { isLanRemote, pushProfile, type PushOutcome, type PushRunner } from "./mirror.js";
import {
    EMPTY_POINTER,
    readPointer,
    writePointer,
    type DataFolderPointer,
    type ResolvedProfileFolder,
} from "./pointer.js";
import { isCredentialPath, isVolatilePath, describeCredentialExclusions } from "./profileEntries.js";
import {
    commitSettledChanges,
    ensureProfileRepository,
    lastProfileVersion,
    profileHeadSha,
    type CommitOutcome,
    type LastVersion,
} from "./profileRepo.js";
import {
    applyRemoteChange,
    readRemoteSettings,
    writeRemoteSettings,
    type RemoteChange,
    type RemoteSettings,
} from "./remoteSettings.js";
import { isSameOrInside, validateFolder, type FolderValidation } from "./validate.js";
import { listProfileFiles } from "./credentialPresence.js";

/** The longest a burst of changes can delay recording them. */
export const MAX_COMMIT_WAIT_MS = 5 * 60 * 1000;

export type FolderKind = "profile" | "save";
export type MoveMode = "move" | "copy" | "fresh";

export interface DataFoldersOptions {
    readonly pointerFile: string;
    /** The live profile folder (`userData`) for this launch. */
    readonly profileFolder: string;
    readonly startup: ResolvedProfileFolder;
    readonly saveFolder: () => string;
    readonly defaultSaveFolder: () => string;
    readonly installFolders: readonly string[];
    readonly systemFolders: readonly string[];
    readonly run: GitRunner;
    /** Builds the Git runner used to talk to a remote, signed in as the chosen account. */
    readonly pushRunner: (accountId: string | null, url: string) => Promise<PushRunner | null>;
    readonly now?: () => Date;
    /** How long a settled change waits before it is recorded. */
    readonly commitDelayMs?: number;
    readonly onHistoryEvent?: (event: HistoryEvent) => void;
}

export interface HistoryEvent {
    readonly kind: "committed" | "failed";
    readonly message: string;
    readonly sha: string | null;
}

export interface MoveRequest {
    readonly kind: FolderKind;
    readonly folder: string;
    readonly mode: MoveMode;
}

export type MoveResult =
    | {
          readonly ok: true;
          readonly kind: FolderKind;
          readonly mode: MoveMode;
          /** The folder that is now chosen. */
          readonly folder: string;
          /** True when the change only takes effect after a restart (always for the profile). */
          readonly needsRestart: boolean;
          readonly copiedFiles: number;
          readonly copiedBytes: number;
          readonly skipped: readonly SkippedEntry[];
          /** True/false when both folders held a Git history that was compared; null otherwise. */
          readonly historyIntact: boolean | null;
          /** The folder that can now be offered for removal, or null. */
          readonly oldFolderRemovable: string | null;
          readonly message: string;
      }
    | {
          readonly ok: false;
          readonly cancelled: boolean;
          readonly message: string;
          readonly code: string;
      };

export interface FolderStatus {
    readonly current: string;
    readonly default: string;
    /** The profile folder chosen but not yet in use (a restart is pending). */
    readonly pendingFolder: string | null;
    /** A chosen profile folder that could not be reached at start. */
    readonly unreachable: string | null;
    /** An older folder whose removal can be offered. */
    readonly removableOldFolder: string | null;
}

export interface DataFoldersStatus {
    readonly profile: FolderStatus;
    readonly save: FolderStatus;
    readonly pointerProblem: string | null;
    readonly history: {
        readonly available: boolean;
        readonly gitVersion: string | null;
        readonly unavailableReason: string | null;
        readonly initialised: boolean;
        readonly last: LastVersion | null;
        readonly lastFailure: string | null;
    };
    readonly remote: RemoteSettings & {
        readonly isLocalNetwork: boolean;
        readonly credentialFilesPresent: boolean;
        readonly excluded: readonly string[];
    };
}

function failure(code: string, message: string, cancelled = false): MoveResult {
    return { ok: false, cancelled, code, message };
}

/** Everything under the profile that is not left out by the move rules. */
export const skipVolatile = (relativePath: string): boolean => isVolatilePath(relativePath);

export class DataFoldersService {
    readonly #options: DataFoldersOptions;
    #moving: AbortController | null = null;
    #timer: ReturnType<typeof setTimeout> | null = null;
    #firstScheduledAt: number | null = null;
    #committing: Promise<CommitOutcome> | null = null;
    #lastFailure: string | null = null;
    #gitState: { available: boolean; version: string | null; reason: string | null; initialised: boolean } = {
        available: false,
        version: null,
        reason: "History has not been started yet.",
        initialised: false,
    };

    constructor(options: DataFoldersOptions) {
        this.#options = options;
    }

    get profileFolder(): string {
        return this.#options.profileFolder;
    }

    /* ---------------------------------------------------------------- history */

    /** Prepares the repository. Never rejects; a problem is reported in the status. */
    async startHistory(): Promise<void> {
        const prepared = await ensureProfileRepository(this.#options.run, this.#options.profileFolder);
        this.#gitState = {
            available: prepared.git.available,
            version: prepared.git.version,
            reason: prepared.ready ? null : prepared.reason,
            initialised: prepared.ready,
        };
        if (!prepared.ready) this.#lastFailure = prepared.reason;
    }

    /** Records settled changes soon, after a quiet period. Cheap to call repeatedly. */
    scheduleCommit(): void {
        const now = Date.now();
        if (this.#timer !== null) {
            // Constant activity never postpones recording forever.
            if (this.#firstScheduledAt !== null && now - this.#firstScheduledAt >= MAX_COMMIT_WAIT_MS) return;
            clearTimeout(this.#timer);
        } else {
            this.#firstScheduledAt = now;
        }
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.#firstScheduledAt = null;
            void this.commitNow();
        }, this.#options.commitDelayMs ?? 20_000);
        this.#timer.unref?.();
    }

    /** Records changes now. One run at a time; a second call joins the first. */
    commitNow(): Promise<CommitOutcome> {
        if (this.#committing !== null) return this.#committing;
        if (this.#timer !== null) {
            clearTimeout(this.#timer);
            this.#timer = null;
            this.#firstScheduledAt = null;
        }
        const run = commitSettledChanges(this.#options.run, this.#options.profileFolder)
            .then((outcome) => {
                if (outcome.failed) {
                    this.#lastFailure = outcome.reason;
                    this.#options.onHistoryEvent?.({
                        kind: "failed",
                        message: outcome.reason ?? "The history could not be saved.",
                        sha: null,
                    });
                } else if (outcome.committed) {
                    this.#lastFailure = null;
                    this.#options.onHistoryEvent?.({
                        kind: "committed",
                        message: outcome.subject ?? "Saved a version of the profile.",
                        sha: outcome.sha,
                    });
                }
                return outcome;
            })
            .finally(() => {
                this.#committing = null;
            });
        this.#committing = run;
        return run;
    }

    /** Waits for a pending recording to finish, for a clean shutdown. */
    async flush(): Promise<void> {
        if (this.#timer !== null) await this.commitNow();
        else if (this.#committing !== null) await this.#committing;
    }

    /* ----------------------------------------------------------------- remote */

    async remoteSettings(): Promise<RemoteSettings> {
        return await readRemoteSettings(this.#options.profileFolder);
    }

    async changeRemote(change: RemoteChange): Promise<{ ok: boolean; message: string; settings: RemoteSettings }> {
        const current = await this.remoteSettings();
        const applied = applyRemoteChange(current, change, isLanRemote);
        if (!applied.ok) return { ok: false, message: applied.message, settings: current };
        await writeRemoteSettings(this.#options.profileFolder, applied.settings);
        this.scheduleCommit();
        return { ok: true, message: "Saved.", settings: applied.settings };
    }

    /** Records pending changes, then sends the filtered history. */
    async pushNow(): Promise<PushOutcome> {
        const settings = await this.remoteSettings();
        if (!settings.enabled || settings.url === null) {
            return { status: "refused", message: "Sending to a remote is turned off.", sha: null, verified: false, excluded: [] };
        }
        await this.commitNow();
        const push = await this.#options.pushRunner(settings.accountId, settings.url);
        if (push === null) {
            const outcome: PushOutcome = {
                status: "refused",
                message: "No signed-in GitHub account is available for this remote. Sign in first.",
                sha: null,
                verified: false,
                excluded: [],
            };
            await this.#recordPush(settings, outcome);
            return outcome;
        }
        const outcome = await pushProfile({
            run: this.#options.run,
            push,
            root: this.#options.profileFolder,
            remoteUrl: settings.url,
            includeCredentials: settings.includeCredentials,
        });
        await this.#recordPush(settings, outcome);
        return outcome;
    }

    async #recordPush(settings: RemoteSettings, outcome: PushOutcome): Promise<void> {
        const ok = outcome.status === "pushed" || outcome.status === "up-to-date";
        const next: RemoteSettings = {
            ...settings,
            lastPush:
                ok && outcome.sha !== null
                    ? { at: (this.#options.now?.() ?? new Date()).toISOString(), sha: outcome.sha, verified: outcome.verified }
                    : settings.lastPush,
            lastError: ok ? null : outcome.message,
        };
        await writeRemoteSettings(this.#options.profileFolder, next).catch(() => undefined);
    }

    /* ----------------------------------------------------------------- status */

    async status(): Promise<DataFoldersStatus> {
        const pointerReadout = await readPointer(this.#options.pointerFile);
        const pointer = pointerReadout.pointer;
        const profile = this.#options.profileFolder;
        const unreachable = this.#options.startup.unreachable;
        const pendingFolder =
            pointer.profileFolder !== null && unreachable !== null && resolve(pointer.profileFolder) === resolve(unreachable)
                ? null
                : pointer.profileFolder !== null && resolve(pointer.profileFolder) !== resolve(profile)
                  ? pointer.profileFolder
                : pointer.profileFolder === null && !this.#options.startup.usingDefault
                  ? this.#options.startup.defaultFolder
                  : null;
        const remote = await this.remoteSettings();
        const files = await listProfileFiles(profile);
        const credentialFiles = files.some(isCredentialPath);
        const last = this.#gitState.initialised ? await lastProfileVersion(this.#options.run, profile) : null;
        const removable = await this.#removableOld(pointer, "profile");
        return {
            profile: {
                current: profile,
                default: this.#options.startup.defaultFolder,
                pendingFolder,
                unreachable: this.#options.startup.unreachable,
                removableOldFolder: removable,
            },
            save: {
                current: this.#options.saveFolder(),
                default: this.#options.defaultSaveFolder(),
                pendingFolder: null,
                unreachable: null,
                removableOldFolder: this.#savePrevious !== null ? await this.#removableSave() : null,
            },
            pointerProblem: this.#options.startup.pointerProblem ?? pointerReadout.problem,
            history: {
                available: this.#gitState.available,
                gitVersion: this.#gitState.version,
                unavailableReason: this.#gitState.available ? null : this.#gitState.reason,
                initialised: this.#gitState.initialised,
                last,
                lastFailure: this.#lastFailure,
            },
            remote: {
                ...remote,
                isLocalNetwork: remote.url !== null && isLanRemote(remote.url),
                credentialFilesPresent: credentialFiles,
                excluded: describeCredentialExclusions(),
            },
        };
    }

    /* ------------------------------------------------------------------ moves */

    #savePrevious: string | null = null;

    #currentOf(kind: FolderKind): string {
        return kind === "profile" ? this.#options.profileFolder : this.#options.saveFolder();
    }

    async #otherChosenFolder(kind: FolderKind): Promise<string | null> {
        if (kind === "profile") {
            const save = this.#options.saveFolder();
            return resolve(save) === resolve(this.#options.defaultSaveFolder()) ? null : save;
        }
        return this.#options.startup.usingDefault ? null : this.#options.profileFolder;
    }

    async validate(request: MoveRequest): Promise<FolderValidation> {
        const current = this.#currentOf(request.kind);
        const required =
            request.mode === "fresh"
                ? 0
                : await measureTree(current, request.kind === "profile" ? skipVolatile : undefined);
        return await validateFolder({
            candidate: request.folder,
            currentFolder: current,
            otherFolder: await this.#otherChosenFolder(request.kind),
            installFolders: this.#options.installFolders,
            systemFolders: this.#options.systemFolders,
            requiredBytes: required,
            requireEmpty: request.mode !== "fresh",
        });
    }

    cancelMove(): boolean {
        if (this.#moving === null) return false;
        this.#moving.abort();
        return true;
    }

    async move(request: MoveRequest, onProgress?: (progress: MoveProgress) => void): Promise<MoveResult> {
        if (this.#moving !== null) return failure("busy", "Another folder change is already running.");
        const controller = new AbortController();
        this.#moving = controller;
        try {
            const checked = await this.validate(request);
            if (!checked.ok) return failure(checked.code, checked.message);
            const current = this.#currentOf(request.kind);
            const target = checked.folder;

            // A snapshot first, so the history that moves is the history up to this moment.
            if (request.kind === "profile") await this.commitNow();

            let copiedFiles = 0;
            let copiedBytes = 0;
            let skipped: readonly SkippedEntry[] = [];
            if (request.mode !== "fresh") {
                const copy = await copyTree({
                    source: current,
                    target,
                    ...(request.kind === "profile" ? { skip: skipVolatile } : {}),
                    signal: controller.signal,
                    ...(onProgress === undefined ? {} : { onProgress }),
                });
                if (!copy.ok) {
                    return failure(
                        copy.cancelled ? "cancelled" : "copy-failed",
                        copy.cancelled
                            ? "Cancelled. The new folder was cleaned up and nothing has changed."
                            : `${copy.failure ?? "The copy failed."} ${copy.rolledBack ? "The partial copy was removed and nothing has changed." : "Some of the partial copy could not be removed from the new folder; nothing else has changed."}`,
                        copy.cancelled,
                    );
                }
                copiedFiles = copy.copiedFiles;
                copiedBytes = copy.copiedBytes;
                skipped = copy.skipped;
            }

            let historyIntact: boolean | null = null;
            if (request.kind === "profile" && request.mode !== "fresh") {
                const [before, after] = await Promise.all([
                    profileHeadSha(this.#options.run, current),
                    profileHeadSha(this.#options.run, target),
                ]);
                historyIntact = before === null ? null : before === after;
                if (historyIntact === false) {
                    return failure(
                        "history-mismatch",
                        "The saved versions did not arrive intact in the new folder, so nothing was switched. The old folder is untouched.",
                    );
                }
            }

            if (request.kind === "profile") {
                const defaultFolder = this.#options.startup.defaultFolder;
                const usingDefault = resolve(target) === resolve(defaultFolder);
                const pointer: DataFolderPointer = {
                    ...EMPTY_POINTER,
                    profileFolder: usingDefault ? null : target,
                    previousProfileFolder: request.mode === "move" ? current : null,
                };
                await writePointer(this.#options.pointerFile, pointer);
            } else {
                this.#savePrevious = request.mode === "move" ? current : null;
            }

            const needsRestart = request.kind === "profile";
            return {
                ok: true,
                kind: request.kind,
                mode: request.mode,
                folder: target,
                needsRestart,
                copiedFiles,
                copiedBytes,
                skipped,
                historyIntact,
                oldFolderRemovable: request.mode === "move" ? current : null,
                message: needsRestart
                    ? "The new profile folder is ready and will be used the next time the app starts. The old folder is kept until you remove it."
                    : "The new save folder is ready. The old folder is kept until you remove it.",
            };
        } catch (error) {
            return failure("unexpected", `The change could not be made (${(error as NodeJS.ErrnoException).code ?? "unknown"}). Nothing was switched.`);
        } finally {
            this.#moving = null;
        }
    }

    /**
     * Gives up on a chosen profile folder that could not be reached at start, so the default
     * is used from now on. Nothing on disk is touched, and the choice is only ever dropped on
     * the person's explicit request.
     */
    async forgetUnreachable(): Promise<{ ok: boolean; message: string }> {
        if (this.#options.startup.unreachable === null) {
            return { ok: false, message: "The chosen profile folder is reachable, so there is nothing to give up on." };
        }
        const readout = await readPointer(this.#options.pointerFile);
        await writePointer(this.#options.pointerFile, { ...readout.pointer, profileFolder: null });
        return { ok: true, message: "The default profile folder will be used from now on." };
    }

    /* ---------------------------------------------------------------- removal */

    async #removableOld(pointer: DataFolderPointer, kind: FolderKind): Promise<string | null> {
        if (kind !== "profile") return null;
        const previous = pointer.previousProfileFolder;
        if (previous === null) return null;
        // Only once the new folder is the live one, and the old one still exists.
        if (resolve(previous) === resolve(this.#options.profileFolder)) return null;
        if (!(await lstat(previous).then(() => true, () => false))) return null;
        return previous;
    }

    async #removableSave(): Promise<string | null> {
        const previous = this.#savePrevious;
        if (previous === null || resolve(previous) === resolve(this.#options.saveFolder())) return null;
        return (await lstat(previous).then(() => true, () => false)) ? previous : null;
    }

    /**
     * Removes the folder a move left behind, as its own step, after proving the new folder
     * holds everything the old one did. Refuses to touch anything but the recorded old folder.
     */
    async removeOld(kind: FolderKind, confirmed: boolean): Promise<{ ok: boolean; message: string }> {
        if (!confirmed) return { ok: false, message: "Removal needs your explicit confirmation." };
        const pointer = (await readPointer(this.#options.pointerFile)).pointer;
        const old = kind === "profile" ? await this.#removableOld(pointer, "profile") : await this.#removableSave();
        if (old === null) return { ok: false, message: "There is no old folder waiting to be removed." };
        const live = this.#currentOf(kind);
        if (isSameOrInside(old, live) || isSameOrInside(live, old)) {
            return { ok: false, message: "The old and new folders overlap, so nothing was removed." };
        }
        // The save folder may still live inside an old profile folder; never delete under it.
        if (kind === "profile" && isSameOrInside(old, this.#options.saveFolder())) {
            return { ok: false, message: "The save folder still lives inside the old profile folder, so nothing was removed. Move the save folder first." };
        }
        const proof = await treeIsContainedIn(old, live, kind === "profile" ? skipVolatile : undefined);
        if (!proof.contained) {
            return {
                ok: false,
                message: `The new folder does not fully match the old one (${proof.firstMismatch ?? "unknown file"}), so nothing was removed.`,
            };
        }
        if (kind === "profile") {
            const [before, after] = await Promise.all([
                profileHeadSha(this.#options.run, old),
                profileHeadSha(this.#options.run, live),
            ]);
            if (before !== null && before !== after) {
                return { ok: false, message: "The saved versions in the new folder do not match the old ones, so nothing was removed." };
            }
        }
        try {
            await rm(old, { recursive: true, force: false });
        } catch (error) {
            return { ok: false, message: `The old folder could not be removed (${(error as NodeJS.ErrnoException).code ?? "unknown"}). It is still there.` };
        }
        if (kind === "profile") {
            await writePointer(this.#options.pointerFile, { ...pointer, previousProfileFolder: null });
        } else {
            this.#savePrevious = null;
        }
        return { ok: true, message: "The old folder was removed." };
    }
}
