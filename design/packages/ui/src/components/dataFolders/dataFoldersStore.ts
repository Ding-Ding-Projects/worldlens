/**
 * The state and actions behind the data folders settings.
 *
 * A folder change is never made by typing a path and hoping: the draft is validated by the main
 * process as soon as it changes (and again when it is applied), the way to treat the existing
 * data is an explicit choice, and applying shows real progress. Nothing here moves a byte
 * itself. It asks the main process, which copies, verifies and only then switches.
 */

import { computed, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import { currentPlatform, writeMapStorageDir } from "../setup/mapStorage.js";
import {
    cloneUrlFor,
    resolveDataFoldersBridge,
    type DataFolderHistoryEventReadout,
    type DataFolderKind,
    type DataFolderMoveMode,
    type DataFolderMoveReadout,
    type DataFolderProgressReadout,
    type DataFolderPushReadout,
    type DataFolderValidationReadout,
    type DataFoldersBridge,
    type DataFoldersStatusReadout,
} from "./dataFoldersBridge.js";

export interface FolderDraft {
    readonly folder: Ref<string>;
    readonly mode: Ref<DataFolderMoveMode>;
    readonly validation: Ref<DataFolderValidationReadout | null>;
    readonly checking: Ref<boolean>;
    /** The outcome of the last apply, kept until the next one. */
    readonly result: Ref<DataFolderMoveReadout | null>;
    readonly removalMessage: Ref<string | null>;
}

/** Why Apply is unavailable: a stable code the interface localizes, and the English fallback. */
export interface BlockedReason {
    readonly code: string;
    readonly message: string;
}

export interface OwnerChoice {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export interface DataFoldersStoreOptions {
    /** Injected in tests. Left out the preload is probed; `null` says there is deliberately none. */
    readonly bridge?: DataFoldersBridge | null;
    /** Tells the person about a failed history write without interrupting them. */
    readonly onHistoryFailure?: (message: string) => void;
    /** Points the running app at a new save folder. Defaults to the existing map-storage route. */
    readonly applySaveFolder?: (folder: string) => Promise<{ ok: boolean; message: string }>;
}

export interface DataFoldersStore {
    readonly available: boolean;
    readonly status: Ref<DataFoldersStatusReadout | null>;
    readonly loading: Ref<boolean>;
    readonly failure: Ref<string | null>;
    readonly drafts: Readonly<Record<DataFolderKind, FolderDraft>>;
    readonly busyKind: Ref<DataFolderKind | null>;
    readonly progress: Ref<DataFolderProgressReadout | null>;
    readonly restartPending: ComputedRef<boolean>;
    readonly canApply: (kind: DataFolderKind) => ComputedRef<boolean>;
    readonly applyBlockedReason: (kind: DataFolderKind) => ComputedRef<BlockedReason | null>;

    readonly remoteMessage: Ref<string | null>;
    readonly pushResult: Ref<DataFolderPushReadout | null>;
    readonly pushing: Ref<boolean>;
    readonly accounts: Ref<readonly { id: string; login: string; host: string }[]>;
    readonly owners: Ref<readonly OwnerChoice[]>;
    readonly creating: Ref<boolean>;
    readonly historyMessage: Ref<string | null>;

    start(): Promise<void>;
    stop(): void;
    refresh(): Promise<void>;
    setFolder(kind: DataFolderKind, folder: string): void;
    setMode(kind: DataFolderKind, mode: DataFolderMoveMode): void;
    useDefault(kind: DataFolderKind): void;
    apply(kind: DataFolderKind): Promise<void>;
    cancel(): Promise<void>;
    removeOld(kind: DataFolderKind): Promise<void>;
    restart(): Promise<void>;
    forgetUnreachable(): Promise<void>;
    commitNow(): Promise<void>;
    changeRemote(change: {
        enabled?: boolean;
        url?: string | null;
        includeCredentials?: boolean;
        accountId?: string | null;
    }): Promise<boolean>;
    pushNow(): Promise<void>;
    loadOwners(accountId: string | null): Promise<void>;
    createPrivateRepository(request: {
        accountId: string | null;
        owner: OwnerChoice;
        name: string;
    }): Promise<boolean>;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong.";
}

function makeDraft(): FolderDraft {
    return {
        folder: ref(""),
        mode: ref<DataFolderMoveMode>("move"),
        validation: ref<DataFolderValidationReadout | null>(null),
        checking: ref(false),
        result: ref<DataFolderMoveReadout | null>(null),
        removalMessage: ref<string | null>(null),
    };
}

export function createDataFoldersStore(options: DataFoldersStoreOptions = {}): DataFoldersStore {
    const bridge = options.bridge !== undefined ? options.bridge : resolveDataFoldersBridge();
    const status = shallowRef<DataFoldersStatusReadout | null>(null);
    const loading = ref(false);
    const failure = ref<string | null>(null);
    const drafts: Record<DataFolderKind, FolderDraft> = { profile: makeDraft(), save: makeDraft() };
    const busyKind = ref<DataFolderKind | null>(null);
    const progress = ref<DataFolderProgressReadout | null>(null);
    const remoteMessage = ref<string | null>(null);
    const pushResult = ref<DataFolderPushReadout | null>(null);
    const pushing = ref(false);
    const accounts = ref<readonly { id: string; login: string; host: string }[]>([]);
    const owners = ref<readonly OwnerChoice[]>([]);
    const creating = ref(false);
    const historyMessage = ref<string | null>(null);
    const checkTickets: Record<DataFolderKind, number> = { profile: 0, save: 0 };
    const stops: (() => void)[] = [];

    const restartPending = computed(
        () => status.value?.profile.pendingFolder !== null && status.value?.profile.pendingFolder !== undefined,
    );

    async function refresh(): Promise<void> {
        const read = bridge?.dataFoldersStatus;
        if (typeof read !== "function") return;
        loading.value = true;
        try {
            status.value = await read();
            failure.value = null;
            for (const kind of ["profile", "save"] as const) {
                if (drafts[kind].folder.value === "") drafts[kind].folder.value = status.value[kind].current;
            }
        } catch (error) {
            failure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    async function validate(kind: DataFolderKind): Promise<void> {
        const draft = drafts[kind];
        const check = bridge?.dataFoldersValidate;
        const folder = draft.folder.value.trim();
        const current = status.value?.[kind].current ?? "";
        if (typeof check !== "function" || folder === "" || folder === current) {
            draft.validation.value = null;
            draft.checking.value = false;
            return;
        }
        const ticket = (checkTickets[kind] += 1);
        draft.checking.value = true;
        try {
            const answer = await check({ kind, folder, mode: draft.mode.value });
            if (ticket === checkTickets[kind]) draft.validation.value = answer;
        } catch (error) {
            if (ticket === checkTickets[kind]) {
                draft.validation.value = { ok: false, code: "unexpected", message: describe(error) };
            }
        } finally {
            if (ticket === checkTickets[kind]) draft.checking.value = false;
        }
    }

    function setFolder(kind: DataFolderKind, folder: string): void {
        drafts[kind].folder.value = folder;
        drafts[kind].result.value = null;
        void validate(kind);
    }

    function setMode(kind: DataFolderKind, mode: DataFolderMoveMode): void {
        drafts[kind].mode.value = mode;
        void validate(kind);
    }

    function useDefault(kind: DataFolderKind): void {
        const folder = status.value?.[kind].default;
        if (folder !== undefined) setFolder(kind, folder);
    }

    const blockedReasons: Record<DataFolderKind, ComputedRef<BlockedReason | null>> = {
        profile: computed(() => blockedReason("profile")),
        save: computed(() => blockedReason("save")),
    };

    function blockedReason(kind: DataFolderKind): BlockedReason | null {
        const draft = drafts[kind];
        if (bridge === null || typeof bridge?.dataFoldersMove !== "function") {
            return { code: "no-bridge", message: "This build cannot change folders. Only the desktop app can." };
        }
        if (busyKind.value !== null) return { code: "busy", message: "Another folder change is still running." };
        const folder = draft.folder.value.trim();
        if (folder === "") return { code: "empty", message: "Choose a folder first." };
        if (folder === (status.value?.[kind].current ?? "")) {
            return { code: "same-as-current", message: "That is the folder already in use." };
        }
        const validation = draft.validation.value;
        if (draft.checking.value || validation === null) return { code: "checking", message: "Checking the folder..." };
        if (!validation.ok) return { code: validation.code, message: validation.message };
        return null;
    }

    const canApply = (kind: DataFolderKind): ComputedRef<boolean> =>
        computed(() => blockedReasons[kind].value === null);
    const applyBlockedReason = (kind: DataFolderKind): ComputedRef<BlockedReason | null> => blockedReasons[kind];

    async function applySave(folder: string): Promise<{ ok: boolean; message: string }> {
        if (options.applySaveFolder !== undefined) return await options.applySaveFolder(folder);
        const setter = bridge?.setMapStorageDirectory;
        if (typeof setter === "function") {
            const answer = await setter(folder);
            if (!answer.ok) return { ok: false, message: answer.message ?? "The app could not switch to that folder." };
        }
        writeMapStorageDir(folder, currentPlatform());
        return { ok: true, message: "" };
    }

    async function apply(kind: DataFolderKind): Promise<void> {
        const move = bridge?.dataFoldersMove;
        const draft = drafts[kind];
        // Re-checked here, not only on the button: a keyboard submit walks past a disabled button.
        if (typeof move !== "function" || blockedReasons[kind].value !== null) return;
        busyKind.value = kind;
        progress.value = null;
        draft.result.value = null;
        draft.removalMessage.value = null;
        try {
            let answer = await move({ kind, folder: draft.folder.value.trim(), mode: draft.mode.value });
            if (answer.ok && kind === "save") {
                const switched = await applySave(answer.folder);
                if (!switched.ok) {
                    answer = {
                        ok: false,
                        code: "switch-failed",
                        message: `${switched.message} The data was copied to the new folder, and the old folder is still in use.`,
                    };
                }
            }
            draft.result.value = answer;
            await refresh();
            // The field goes back to showing the folder in use; a profile folder waiting for a
            // restart is shown by the status, not by leaving a stale draft in the box.
            if (answer.ok) draft.folder.value = status.value?.[kind].current ?? draft.folder.value;
            draft.validation.value = null;
        } catch (error) {
            draft.result.value = { ok: false, code: "unexpected", message: describe(error) };
        } finally {
            busyKind.value = null;
            progress.value = null;
        }
    }

    async function cancel(): Promise<void> {
        await bridge?.dataFoldersCancel?.();
    }

    async function removeOld(kind: DataFolderKind): Promise<void> {
        const remove = bridge?.dataFoldersRemoveOld;
        if (typeof remove !== "function") return;
        try {
            const answer = await remove({ kind, confirm: true });
            drafts[kind].removalMessage.value = answer.message;
        } catch (error) {
            drafts[kind].removalMessage.value = describe(error);
        }
        await refresh();
    }

    async function restart(): Promise<void> {
        await bridge?.dataFoldersRestart?.();
    }

    async function forgetUnreachable(): Promise<void> {
        const forget = bridge?.dataFoldersForgetUnreachable;
        if (typeof forget !== "function") return;
        try {
            const answer = await forget();
            drafts.profile.removalMessage.value = answer.message;
        } catch (error) {
            drafts.profile.removalMessage.value = describe(error);
        }
        await refresh();
    }

    async function commitNow(): Promise<void> {
        const commit = bridge?.dataFoldersCommitNow;
        if (typeof commit !== "function") return;
        try {
            historyMessage.value = (await commit()).message;
        } catch (error) {
            historyMessage.value = describe(error);
        }
        await refresh();
    }

    async function changeRemote(change: Parameters<DataFoldersStore["changeRemote"]>[0]): Promise<boolean> {
        const apply = bridge?.dataFoldersChangeRemote;
        if (typeof apply !== "function") return false;
        try {
            const answer = await apply(change);
            remoteMessage.value = answer.ok ? null : answer.message;
            await refresh();
            return answer.ok;
        } catch (error) {
            remoteMessage.value = describe(error);
            return false;
        }
    }

    async function pushNow(): Promise<void> {
        const send = bridge?.dataFoldersPushNow;
        if (typeof send !== "function" || pushing.value) return;
        pushing.value = true;
        pushResult.value = null;
        try {
            pushResult.value = await send();
        } catch (error) {
            pushResult.value = { status: "failed", message: describe(error), sha: null, verified: false, excluded: [] };
        } finally {
            pushing.value = false;
        }
        await refresh();
    }

    async function loadAccounts(): Promise<void> {
        const list = bridge?.ghCliListAccounts;
        if (typeof list !== "function") return;
        try {
            const answer = await list();
            accounts.value = answer.accounts
                .filter((account) => account.host === "github.com")
                .map(({ id, login, host }) => ({ id, login, host }));
        } catch {
            accounts.value = [];
        }
    }

    async function loadOwners(accountId: string | null): Promise<void> {
        const list = bridge?.listBackupOwners;
        owners.value = [];
        if (typeof list !== "function") return;
        try {
            const answer = await list(accountId ?? undefined);
            owners.value = answer.ok ? answer.value : [];
        } catch {
            owners.value = [];
        }
    }

    async function createPrivateRepository(request: {
        accountId: string | null;
        owner: OwnerChoice;
        name: string;
    }): Promise<boolean> {
        const create = bridge?.createBackupRepository;
        if (typeof create !== "function" || creating.value) return false;
        creating.value = true;
        remoteMessage.value = null;
        try {
            const answer = await create({
                ...(request.accountId === null ? {} : { accountId: request.accountId }),
                ownerLogin: request.owner.login,
                ownerKind: request.owner.kind,
                name: request.name.trim(),
                // Private is not a default the person has to find: it is the only thing this asks for.
                private: true,
            });
            if (!answer.ok) {
                remoteMessage.value = answer.message;
                return false;
            }
            return await changeRemote({
                url: cloneUrlFor(answer.value.htmlUrl, answer.value.fullName),
                accountId: request.accountId,
            });
        } catch (error) {
            remoteMessage.value = describe(error);
            return false;
        } finally {
            creating.value = false;
        }
    }

    async function start(): Promise<void> {
        const onProgress = bridge?.onDataFoldersProgress;
        if (typeof onProgress === "function") stops.push(onProgress((value) => (progress.value = value)));
        const onHistory = bridge?.onDataFoldersHistory;
        if (typeof onHistory === "function") {
            stops.push(
                onHistory((event: DataFolderHistoryEventReadout) => {
                    if (event.kind === "failed") options.onHistoryFailure?.(event.message);
                    void refresh();
                }),
            );
        }
        await Promise.all([refresh(), loadAccounts()]);
    }

    function stop(): void {
        for (const dispose of stops.splice(0)) dispose();
    }

    return {
        available: bridge !== null && typeof bridge?.dataFoldersStatus === "function",
        status,
        loading,
        failure,
        drafts,
        busyKind,
        progress,
        restartPending,
        canApply,
        applyBlockedReason,
        remoteMessage,
        pushResult,
        pushing,
        accounts,
        owners,
        creating,
        historyMessage,
        start,
        stop,
        refresh,
        setFolder,
        setMode,
        useDefault,
        apply,
        cancel,
        removeOld,
        restart,
        forgetUnreachable,
        commitNow,
        changeRemote,
        pushNow,
        loadOwners,
        createPrivateRepository,
    };
}
