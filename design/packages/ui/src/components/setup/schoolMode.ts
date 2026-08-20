/**
 * Renderer state for the shared School-mode record.
 *
 * Electron owns the record and credential verifier.  This module is deliberately only an async
 * client of its narrow preload bridge: safe state comes back, a PIN/password goes in only for
 * the one operation that consumes it, and neither is copied into renderer storage.  A plain
 * browser or unit test has no preload at all, so it gets an explicitly labelled *local-only*
 * fallback.  A packaged host whose bridge is missing or fails never silently becomes that
 * fallback, because that would turn a shared-state failure into a false cross-app claim.
 */

import { computed, reactive, type ComputedRef } from "vue";
import { setupStorage } from "./setupPrefs.js";

export const SCHOOL_MODE_RECORD_KEY = "worldlens.school-mode.v1";
export const SCHOOL_MODE_RECORD_VERSION = 1;
export const SCHOOL_MODE_NAME_MAX_LENGTH = 48;

export interface SchoolModeSnapshot {
    readonly version: typeof SCHOOL_MODE_RECORD_VERSION;
    readonly enabled: boolean;
    readonly name: string | null;
    readonly credentialConfigured: boolean;
}

export type SchoolModeResult =
    | { readonly ok: true; readonly state: SchoolModeSnapshot }
    | {
          readonly ok: false;
          readonly code: SchoolModeFailureCode;
          readonly message: string;
          readonly state: SchoolModeSnapshot | null;
      };

export type SchoolModeFailureCode =
    | "invalid-name"
    | "credential-required"
    | "credential-invalid"
    | "credential-too-long"
    | "record-invalid"
    | "storage-unavailable"
    | "host-unavailable";

export interface SchoolModeEnableRequest {
    readonly name: string | null;
    readonly credential: string;
}

export type SchoolModeSource = "pending" | "shared" | "local-fallback" | "unavailable";
type MaybePromise<T> = T | Promise<T>;
const HOST_OPERATION_DEADLINE_MS = 5_000;
const HOST_CREDENTIAL_DEADLINE_MS = 30_000;
const SCHOOL_MODE_FAILURE_CODES = new Set<SchoolModeFailureCode>([
    "invalid-name",
    "credential-required",
    "credential-invalid",
    "credential-too-long",
    "record-invalid",
    "storage-unavailable",
    "host-unavailable",
]);

function isSchoolModeSnapshot(value: unknown): value is SchoolModeSnapshot {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const snapshot = value as Record<string, unknown>;
    return (
        snapshot.version === SCHOOL_MODE_RECORD_VERSION &&
        typeof snapshot.enabled === "boolean" &&
        (snapshot.name === null || typeof snapshot.name === "string") &&
        typeof snapshot.credentialConfigured === "boolean"
    );
}

function isSchoolModeResult(value: unknown): value is SchoolModeResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const result = value as Record<string, unknown>;
    if (result.ok === true) return isSchoolModeSnapshot(result.state);
    return (
        result.ok === false &&
        typeof result.code === "string" &&
        SCHOOL_MODE_FAILURE_CODES.has(result.code as SchoolModeFailureCode) &&
        typeof result.message === "string" &&
        (result.state === null || isSchoolModeSnapshot(result.state))
    );
}

function withHostDeadline(
    operation: () => Promise<SchoolModeResult>,
    milliseconds = HOST_OPERATION_DEADLINE_MS,
): Promise<SchoolModeResult> {
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
            () => reject(new Error("The shared mode bridge did not answer in time.")),
            milliseconds,
        );
        void operation().then(
            (result) => {
                globalThis.clearTimeout(timer);
                if (isSchoolModeResult(result)) resolve(result);
                else reject(new Error("The shared mode bridge returned an invalid payload."));
            },
            (error: unknown) => {
                globalThis.clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * An async-capable replacement seam.  Local fallback operations intentionally return directly
 * so older browser/unit callers retain their immediate state updates; the real host returns
 * promises through IPC.
 */
export interface SchoolModeRecordAdapter {
    readonly source: Exclude<SchoolModeSource, "pending" | "unavailable">;
    read(): MaybePromise<SchoolModeResult>;
    enable(request: SchoolModeEnableRequest): MaybePromise<SchoolModeResult>;
    rename(name: string | null): MaybePromise<SchoolModeResult>;
    verify(credential: string): MaybePromise<SchoolModeResult>;
    disable(credential: string): MaybePromise<SchoolModeResult>;
    reset(): MaybePromise<SchoolModeResult>;
    subscribe?(listener: (result: SchoolModeResult) => void): () => void;
}

interface UnavailableSchoolModeAdapter {
    readonly source: "unavailable";
    read(): SchoolModeResult;
    enable(request: SchoolModeEnableRequest): SchoolModeResult;
    rename(name: string | null): SchoolModeResult;
    verify(credential: string): SchoolModeResult;
    disable(credential: string): SchoolModeResult;
    reset(): SchoolModeResult;
}

type ActiveAdapter = SchoolModeRecordAdapter | UnavailableSchoolModeAdapter;

interface PersistedLocalFallbackRecord {
    readonly version: typeof SCHOOL_MODE_RECORD_VERSION;
    readonly enabled: boolean;
    readonly name: string | null;
}

interface SchoolModeState {
    ready: boolean;
    source: SchoolModeSource;
    enabled: boolean;
    name: string | null;
    credentialConfigured: boolean;
    error: string | null;
    errorCode: SchoolModeFailureCode | null;
}

function defaultSnapshot(): SchoolModeSnapshot {
    return {
        version: SCHOOL_MODE_RECORD_VERSION,
        enabled: false,
        name: null,
        credentialConfigured: false,
    };
}

function failure(
    code: SchoolModeFailureCode,
    message: string,
    state: SchoolModeSnapshot | null = null,
): SchoolModeResult {
    return { ok: false, code, message, state };
}

function normaliseName(value: unknown): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false };
    const trimmed = value.trim();
    if (trimmed.length > SCHOOL_MODE_NAME_MAX_LENGTH || /[\u0000-\u001F\u007F-\u009F]/u.test(trimmed)) {
        return { ok: false };
    }
    return { ok: true, value: trimmed === "" ? null : trimmed };
}

function parseLocalFallbackRecord(raw: string | null): SchoolModeSnapshot {
    if (raw === null) return defaultSnapshot();
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return defaultSnapshot();
        const record = parsed as Record<string, unknown>;
        const name = normaliseName(record.name);
        if (record.version !== SCHOOL_MODE_RECORD_VERSION || typeof record.enabled !== "boolean" || !name.ok) {
            return defaultSnapshot();
        }
        return {
            version: SCHOOL_MODE_RECORD_VERSION,
            enabled: record.enabled,
            name: name.value,
            credentialConfigured: false,
        };
    } catch {
        return defaultSnapshot();
    }
}

function localFallbackRecord(snapshot: SchoolModeSnapshot): PersistedLocalFallbackRecord {
    return { version: SCHOOL_MODE_RECORD_VERSION, enabled: snapshot.enabled, name: snapshot.name };
}

/**
 * Browser/test fallback only.  It deliberately stores no credential and its `credentialConfigured`
 * bit remains false, so this adapter can never masquerade as the shared host implementation.
 */
export function createSetupStorageSchoolModeAdapter(
    storage: {
        read(key: string): string | null;
        write(key: string, value: string): void;
        remove(key: string): void;
    } | null = null,
): SchoolModeRecordAdapter {
    const target = (): NonNullable<typeof storage> | ReturnType<typeof setupStorage> => storage ?? setupStorage();
    const readSnapshot = (): SchoolModeSnapshot => parseLocalFallbackRecord(target().read(SCHOOL_MODE_RECORD_KEY));
    const save = (snapshot: SchoolModeSnapshot): void =>
        target().write(SCHOOL_MODE_RECORD_KEY, JSON.stringify(localFallbackRecord(snapshot)));

    return {
        source: "local-fallback",
        read: () => {
            try {
                return { ok: true, state: readSnapshot() };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be read.");
            }
        },
        enable: (request) => {
            const name = normaliseName(request.name);
            if (!name.ok) {
                return failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
            }
            try {
                const next: SchoolModeSnapshot = {
                    ...readSnapshot(),
                    enabled: true,
                    name: name.value,
                    credentialConfigured: false,
                };
                save(next);
                return { ok: true, state: next };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be saved.");
            }
        },
        rename: (nameInput) => {
            const name = normaliseName(nameInput);
            if (!name.ok) {
                return failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
            }
            try {
                const next: SchoolModeSnapshot = { ...readSnapshot(), name: name.value };
                save(next);
                return { ok: true, state: next };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be saved.");
            }
        },
        verify: () => {
            try {
                return { ok: true, state: readSnapshot() };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be read.");
            }
        },
        disable: () => {
            try {
                const next: SchoolModeSnapshot = { ...readSnapshot(), enabled: false };
                save(next);
                return { ok: true, state: next };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be saved.");
            }
        },
        reset: () => {
            try {
                target().remove(SCHOOL_MODE_RECORD_KEY);
                return { ok: true, state: defaultSnapshot() };
            } catch {
                return failure("storage-unavailable", "The local-only fallback record could not be reset.");
            }
        },
    };
}

function isHostBridge(value: unknown): value is NonNullable<WorldlensBridge["schoolMode"]> {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return ["read", "enable", "rename", "verify", "disable", "reset", "onChanged"].every(
        (method) => typeof candidate[method] === "function",
    );
}

function createHostAdapter(bridge: NonNullable<WorldlensBridge["schoolMode"]>): SchoolModeRecordAdapter {
    return {
        source: "shared",
        read: () => withHostDeadline(() => bridge.read()),
        enable: (request) => withHostDeadline(() => bridge.enable(request), HOST_CREDENTIAL_DEADLINE_MS),
        rename: (name) => withHostDeadline(() => bridge.rename(name)),
        verify: (credential) => withHostDeadline(() => bridge.verify(credential), HOST_CREDENTIAL_DEADLINE_MS),
        disable: (credential) => withHostDeadline(() => bridge.disable(credential), HOST_CREDENTIAL_DEADLINE_MS),
        reset: () => withHostDeadline(() => bridge.reset()),
        subscribe: (listener) =>
            bridge.onChanged((result) => {
                if (isSchoolModeResult(result)) listener(result);
                else listener(failure("host-unavailable", "The shared mode bridge returned an invalid event."));
            }),
    };
}

function unavailableAdapter(message: string): UnavailableSchoolModeAdapter {
    const result = (): SchoolModeResult => failure("host-unavailable", message);
    return {
        source: "unavailable",
        read: result,
        enable: result,
        rename: result,
        verify: result,
        disable: result,
        reset: result,
    };
}

/**
 * Resolves the preload once.  No `window.worldlens` means this is a web/browser/test host and
 * receives the explicit local-only fallback; a partial Worldlens bridge is a packaging mismatch,
 * not permission to pretend that a local record is shared.
 */
export function createDefaultSchoolModeAdapter(): ActiveAdapter {
    if (typeof window === "undefined" || window.worldlens === undefined) {
        return createSetupStorageSchoolModeAdapter();
    }
    if (!isHostBridge(window.worldlens.schoolMode)) {
        return unavailableAdapter("This packaged app does not expose the shared mode bridge.");
    }
    return createHostAdapter(window.worldlens.schoolMode);
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
    return typeof (value as Promise<T>).then === "function";
}

let adapter: ActiveAdapter = createDefaultSchoolModeAdapter();
const state = reactive<SchoolModeState>({
    ready: false,
    source: adapter.source,
    enabled: false,
    name: null,
    credentialConfigured: false,
    error: null,
    errorCode: null,
});
let stateGeneration = 0;
let readyPromise: Promise<void> | null = null;
let stopAdapterSubscription: (() => void) | null = null;

function applySnapshot(snapshot: SchoolModeSnapshot): void {
    state.enabled = snapshot.enabled;
    state.name = snapshot.name;
    state.credentialConfigured = snapshot.credentialConfigured;
}

function reconcileResult(
    result: SchoolModeResult,
    adapterSource: ActiveAdapter["source"],
    invalidateSharedState = false,
): void {
    if (result.ok) {
        applySnapshot(result.state);
        state.error = null;
        state.errorCode = null;
        state.source = adapterSource;
        return;
    }
    if (result.state !== null) applySnapshot(result.state);
    state.error = result.message;
    state.errorCode = result.code;
    if (adapterSource === "shared" && invalidateSharedState) {
        // A failed packaged-host read cannot retain an earlier browser/local snapshot. Leaving
        // that visible would be the very false shared-state claim this split is designed to stop.
        applySnapshot(defaultSnapshot());
        state.source = "unavailable";
    } else {
        state.source = adapterSource;
    }
}

function completeRead(
    result: SchoolModeResult,
    generation: number,
    source: ActiveAdapter["source"],
): void {
    if (generation !== stateGeneration) return;
    reconcileResult(result, source, true);
    state.ready = true;
}

function attachAdapterSubscription(): void {
    stopAdapterSubscription?.();
    stopAdapterSubscription = null;
    if (adapter.source !== "shared" || adapter.subscribe === undefined) return;
    const subscribed = adapter;
    stopAdapterSubscription = adapter.subscribe((result) => {
        if (adapter !== subscribed) return;
        stateGeneration += 1;
        reconcileResult(result, subscribed.source, true);
        state.ready = true;
        readyPromise = Promise.resolve();
    });
}

/** Re-reads the active adapter. The packaged path is asynchronous; the local fallback is immediate. */
export function reloadSchoolMode(): Promise<void> {
    attachAdapterSubscription();
    const generation = ++stateGeneration;
    const source = adapter.source;
    // A refresh keeps the last enforced policy on screen until the replacement answer arrives.
    // In particular, retrying an unavailable packaged bridge must not reveal suppressed controls
    // for the duration of its deadline.
    if (!state.ready) {
        state.ready = false;
        state.source = source;
    }
    const result = adapter.read();
    if (!isPromiseLike(result)) {
        completeRead(result, generation, source);
        return Promise.resolve();
    }
    return result
        .then((value) => completeRead(value, generation, source))
        .catch(() =>
            completeRead(
                failure("host-unavailable", "The shared mode bridge could not be reached."),
                generation,
                source,
            ),
        );
}

/** The packaged renderer calls this before mount, so it never reports a guessed shared state. */
export function ensureSchoolModeReady(): Promise<void> {
    if (readyPromise === null) readyPromise = reloadSchoolMode();
    return readyPromise;
}

/** Replaces the adapter for a focused browser/unit test or an embedding host. */
export function setSchoolModeRecordAdapter(next: ActiveAdapter): Promise<void> {
    stopAdapterSubscription?.();
    stopAdapterSubscription = null;
    adapter = next;
    stateGeneration += 1;
    state.ready = false;
    state.source = next.source;
    readyPromise = null;
    return reloadSchoolMode();
}

/** Returns to the real preload bridge when present, otherwise the visibly local-only fallback. */
export function resetSchoolModeRecordAdapter(): Promise<void> {
    stopAdapterSubscription?.();
    stopAdapterSubscription = null;
    adapter = createDefaultSchoolModeAdapter();
    stateGeneration += 1;
    state.ready = false;
    state.source = adapter.source;
    readyPromise = null;
    return reloadSchoolMode();
}

function invokeOperation(operation: () => MaybePromise<SchoolModeResult>): Promise<SchoolModeResult> {
    const generation = ++stateGeneration;
    const source = adapter.source;
    const result = operation();
    if (!isPromiseLike(result)) {
        if (generation === stateGeneration) {
            reconcileResult(result, source);
            state.ready = true;
        }
        return Promise.resolve(result);
    }
    return result
        .then((value) => {
            if (generation === stateGeneration) {
                reconcileResult(value, source);
                state.ready = true;
            }
            return value;
        })
        .catch(() => {
            const failureResult = failure("host-unavailable", "The shared mode bridge could not be reached.");
            if (generation === stateGeneration) {
                reconcileResult(failureResult, source, true);
                state.ready = true;
            }
            return failureResult;
        });
}

/** Whether the effective policy is active. An unavailable packaged bridge fails closed. */
export function schoolModeEnabled(): boolean {
    return state.ready && (state.enabled || state.source === "unavailable");
}

/** The user-selected name only. Consumers provide their own shipped fallback when no name exists. */
export function schoolModeChosenName(): string | null {
    return state.name;
}

/** Resolves a user-selected name first, so a rename has one owner everywhere it is rendered. */
export function schoolModeName(shippedName: string): string {
    return state.name ?? shippedName;
}

/** Saves the name through the host bridge or the visibly local-only browser/test fallback. */
export function renameSchoolMode(raw: string): Promise<SchoolModeResult> {
    const name = normaliseName(raw);
    if (!name.ok) {
        const result = failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
        reconcileResult(result, adapter.source);
        return Promise.resolve(result);
    }
    return invokeOperation(() => adapter.rename(name.value));
}

/** Enables the mode. Only the host adapter consumes a credential and it never persists in UI state. */
export function enableSchoolMode(
    request: SchoolModeEnableRequest = { name: state.name, credential: "" },
): Promise<SchoolModeResult> {
    const name = normaliseName(request.name);
    if (!name.ok) {
        const result = failure("invalid-name", `Choose a name of at most ${SCHOOL_MODE_NAME_MAX_LENGTH} characters.`);
        reconcileResult(result, adapter.source);
        return Promise.resolve(result);
    }
    return invokeOperation(() => adapter.enable({ name: name.value, credential: request.credential }));
}

/** Uses the host's locally verified credential route; local fallback disables only its own preview. */
export function disableSchoolMode(credential = ""): Promise<SchoolModeResult> {
    return invokeOperation(() => adapter.disable(credential));
}

/** Verifies the shared credential without changing the shared policy record. */
export function verifySchoolModeCredential(credential = ""): Promise<SchoolModeResult> {
    return invokeOperation(() => adapter.verify(credential));
}

/** Stops the preload event subscription when the renderer root is torn down. */
export function disposeSchoolMode(): void {
    stopAdapterSubscription?.();
    stopAdapterSubscription = null;
    stateGeneration += 1;
    readyPromise = null;
}

/**
 * Intentionally clears the current record.  Kept as a compatibility alias for prior browser
 * tests; the settings UI calls `resetSchoolModeRecord` so its label cannot imply an unlock.
 */
export function deleteSchoolModeLocalRecord(): Promise<SchoolModeResult> {
    return resetSchoolModeRecord();
}

export function resetSchoolModeRecord(): Promise<SchoolModeResult> {
    return invokeOperation(() => adapter.reset());
}

/** The policy is a read-time override; base preferences remain stored by setupI18n. */
export function effectiveSchoolModeLanguage<T extends string>(base: T, english: T): T {
    return schoolModeEnabled() ? english : base;
}

export function effectiveSchoolModeFunnyLevel<T extends number>(base: T, serious: T): T {
    return schoolModeEnabled() ? serious : base;
}

/**
 * Framework-neutral policy handoff for a sibling package such as the viewer.  It exposes the
 * effective restriction only; no adapter, credential input, verifier, file location, or Vue ref
 * escapes this module.  A caller can pass this plain value across a package seam after the
 * preload read has completed instead of inferring policy from a renderer-local storage key.
 */
export interface SchoolModeRestriction {
    readonly ready: boolean;
    readonly active: boolean;
    readonly name: string | null;
    readonly source: SchoolModeSource;
}

export function schoolModeRestriction(): SchoolModeRestriction {
    return {
        ready: state.ready,
        active: schoolModeEnabled(),
        name: state.name,
        source: state.source,
    };
}

/** The reactive view for templates such as Settings, App, and the language search corpus. */
export interface SchoolModeView {
    readonly ready: ComputedRef<boolean>;
    readonly source: ComputedRef<SchoolModeSource>;
    readonly enabled: ComputedRef<boolean>;
    readonly chosenName: ComputedRef<string | null>;
    readonly credentialConfigured: ComputedRef<boolean>;
    readonly error: ComputedRef<string | null>;
    readonly errorCode: ComputedRef<SchoolModeFailureCode | null>;
}

export function useSchoolMode(): SchoolModeView {
    return {
        ready: computed(() => state.ready),
        source: computed(() => state.source),
        enabled: computed(() => schoolModeEnabled()),
        chosenName: computed(() => state.name),
        credentialConfigured: computed(() => state.credentialConfigured),
        error: computed(() => state.error),
        errorCode: computed(() => state.errorCode),
    };
}
