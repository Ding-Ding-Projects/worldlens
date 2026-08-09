/**
 * The renderer-local School mode policy.
 *
 * The product contract eventually needs one shared application-data record and a locally
 * verified unlock credential. This package has neither a preload reader for that record nor a
 * credential-verification boundary, so this module intentionally does **not** invent either.
 * Instead it owns the part a renderer can truthfully own today:
 *
 * - an injectable read/write record adapter, so a privileged shared-record implementation can
 *   replace local storage without rewriting any UI;
 * - a small local record containing only enabled state and a user-chosen display name;
 * - an override at read time, so language and tone choices survive while English/serious copy is
 *   in force; and
 * - an explicit reset path whose UI says exactly why it is not a security boundary.
 *
 * No credential, digest, PIN, passkey, token or secret is accepted, stored or serialized here.
 * A local policy is useful for the live renderer behaviour, but it is not represented as the
 * universal cross-application lock until its real owner seam exists.
 */

import { computed, reactive, type ComputedRef } from "vue";
import { setupStorage } from "./setupPrefs.js";

const RECORD_KEY = "worldlens.school-mode.v1";
const RECORD_VERSION = 1;
const MAX_NAME_LENGTH = 48;

/**
 * A tiny persistence seam for the policy record.
 *
 * The default adapter delegates to `setupStorage()` on every call, which keeps the normal
 * renderer path live and lets tests swap the backing store. A main/preload owner can later
 * provide an adapter backed by the shared local application-data record without changing the
 * mode state or its components.
 */
export interface SchoolModeRecordAdapter {
    read(): string | null;
    write(serialized: string): void;
    remove(): void;
}

/** Creates the current renderer-local adapter, or wraps a supplied storage implementation. */
export function createSetupStorageSchoolModeAdapter(
    storage: {
        read(key: string): string | null;
        write(key: string, value: string): void;
        remove(key: string): void;
    } | null = null,
): SchoolModeRecordAdapter {
    return {
        read: () => (storage ?? setupStorage()).read(RECORD_KEY),
        write: (serialized) => (storage ?? setupStorage()).write(RECORD_KEY, serialized),
        remove: () => (storage ?? setupStorage()).remove(RECORD_KEY),
    };
}

interface PersistedSchoolMode {
    readonly version: typeof RECORD_VERSION;
    readonly enabled: boolean;
    readonly name: string | null;
}

interface SchoolModeState {
    enabled: boolean;
    name: string | null;
}

function normaliseName(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().slice(0, MAX_NAME_LENGTH).trim();
    return trimmed === "" ? null : trimmed;
}

function parseRecord(raw: string | null): PersistedSchoolMode {
    if (raw === null) return { version: RECORD_VERSION, enabled: false, name: null };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
            return { version: RECORD_VERSION, enabled: false, name: null };
        }
        const record = parsed as Record<string, unknown>;
        if (record.version !== RECORD_VERSION || typeof record.enabled !== "boolean") {
            return { version: RECORD_VERSION, enabled: false, name: null };
        }
        return {
            version: RECORD_VERSION,
            enabled: record.enabled,
            name: normaliseName(record.name),
        };
    } catch {
        return { version: RECORD_VERSION, enabled: false, name: null };
    }
}

let adapter: SchoolModeRecordAdapter = createSetupStorageSchoolModeAdapter();
const state = reactive<SchoolModeState>(parseRecord(adapter.read()));

function persist(): void {
    const record: PersistedSchoolMode = {
        version: RECORD_VERSION,
        enabled: state.enabled,
        name: state.name,
    };
    adapter.write(JSON.stringify(record));
}

/** Re-reads the active adapter. Tests and a future host bridge call this after a swap. */
export function reloadSchoolMode(): void {
    const record = parseRecord(adapter.read());
    state.enabled = record.enabled;
    state.name = record.name;
}

/**
 * Replaces the record provider, then immediately reconciles the live policy.
 *
 * This is the replacement seam for a later main/preload shared-record owner. It deliberately
 * accepts only the three ordinary record operations, never credential material.
 */
export function setSchoolModeRecordAdapter(next: SchoolModeRecordAdapter): void {
    adapter = next;
    reloadSchoolMode();
}

/** Returns to the renderer-local adapter after a test or an external adapter experiment. */
export function resetSchoolModeRecordAdapter(): void {
    adapter = createSetupStorageSchoolModeAdapter();
    reloadSchoolMode();
}

/** Whether the renderer-local policy is currently active. */
export function schoolModeEnabled(): boolean {
    return state.enabled;
}

/** The chosen name only. Consumers provide the localized shipped fallback themselves. */
export function schoolModeChosenName(): string | null {
    return state.name;
}

/** Resolves a user-selected name first, so a rename has one owner everywhere it is rendered. */
export function schoolModeName(shippedName: string): string {
    return state.name ?? shippedName;
}

/** Saves the display name without changing the enabled state. */
export function renameSchoolMode(raw: string): void {
    state.name = normaliseName(raw);
    persist();
}

/** Enables the renderer-local policy. No credential is accepted or implied. */
export function enableSchoolMode(): void {
    state.enabled = true;
    persist();
}

/**
 * Removes the renderer-local record.
 *
 * This restores the saved base language/tone settings because the policy never overwrites them.
 * It is intentionally named as record deletion rather than an unlock: without a privileged
 * verifier, claiming a credential-protected exit would be false.
 */
export function deleteSchoolModeLocalRecord(): void {
    adapter.remove();
    state.enabled = false;
    state.name = null;
}

/**
 * The policy's effective values. Base preferences remain stored separately in setupI18n.
 * Level 1 is the documented fully serious value, so an active policy has no funny-level voice.
 */
export function effectiveSchoolModeLanguage<T extends string>(base: T, english: T): T {
    return state.enabled ? english : base;
}

export function effectiveSchoolModeFunnyLevel<T extends number>(base: T, serious: T): T {
    return state.enabled ? serious : base;
}

/** The reactive view for templates such as Settings and App.vue. */
export interface SchoolModeView {
    readonly enabled: ComputedRef<boolean>;
    readonly chosenName: ComputedRef<string | null>;
}

export function useSchoolMode(): SchoolModeView {
    return {
        enabled: computed(() => state.enabled),
        chosenName: computed(() => state.name),
    };
}

/** The storage key is exported for the truthful reset explanation and focused tests only. */
export const SCHOOL_MODE_RECORD_KEY = RECORD_KEY;
