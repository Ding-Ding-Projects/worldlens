/**
 * The kid-mode flag, its preferences, and the injection key the shell provides.
 *
 * Persisted under the existing `bluemap-*` namespace rather than a second one, per the shell's
 * storage rule. Turning kid mode on changes presentation only: no capability is added, removed or
 * gated by it, and the grown-up gate in front of leaving kid mode reads the **shared
 * restricted-mode record** (School mode's own shared credential, in `components/setup/schoolMode.js`)
 * rather than inventing a second one.
 *
 * ### Kid Mode ships on
 *
 * `enabled` defaults to `true`: a fresh install opens in Kid Mode, not Adult Mode. That is a
 * deliberate product decision, and it is the one thing in this module that creates a hazard the
 * rest of the file exists to close - see `KidGrownUpGate.vue`'s own doc comment for the full
 * reasoning, but the short version is: a fresh install has no shared restricted-mode credential
 * configured yet, so the gate must let a grown-up straight through to Adult Mode rather than
 * demand a code that was never set. Kid Mode must never become a one-way door.
 */
import { computed, inject, provide, ref, watch, type InjectionKey, type Ref } from "vue";
import type { KidLabelStyle } from "./kidLabels.js";

const KEY_ENABLED = "bluemap-kid-mode";
const KEY_NAME = "bluemap-kid-name";
const KEY_STYLE = "bluemap-kid-label-style";
const KEY_CELEBRATE = "bluemap-kid-celebrations";
const KEY_SOUND = "bluemap-kid-sound";

export interface KidModeState {
    readonly enabled: Ref<boolean>;
    readonly childName: Ref<string>;
    readonly labelStyle: Ref<KidLabelStyle>;
    readonly celebrations: Ref<boolean>;
    /** Off by default, and silent whenever reduced sound or quiet hours apply. */
    readonly sound: Ref<boolean>;
    readonly reducedMotion: Ref<boolean>;
}

export const KID_MODE: InjectionKey<KidModeState> = Symbol("worldlens.kidMode");

function persisted<T extends string | boolean>(key: string, fallback: T): Ref<T> {
    const raw = globalThis.localStorage?.getItem(key) ?? null;
    const initial = raw === null ? fallback : (typeof fallback === "boolean" ? (raw === "true") as T : raw as T);
    const value = ref(initial) as Ref<T>;
    watch(value, (next) => globalThis.localStorage?.setItem(key, String(next)));
    return value;
}

/** Builds a fresh, unprovided state. Never calls `provide()` - see `useKidMode()` for why. */
function buildKidModeState(): KidModeState {
    const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    const reducedMotion = ref(media?.matches === true);
    media?.addEventListener?.("change", (event) => (reducedMotion.value = event.matches));

    return {
        enabled: persisted(KEY_ENABLED, true),
        childName: persisted(KEY_NAME, "Explorer"),
        labelStyle: persisted<KidLabelStyle>(KEY_STYLE, "kid-first"),
        celebrations: persisted(KEY_CELEBRATE, true),
        sound: persisted(KEY_SOUND, false),
        reducedMotion,
    };
}

/**
 * The one canonical provider. Call this exactly once, from `App.vue`'s own `<script setup>`,
 * before any child that calls `useKidMode()` mounts - the same way the rest of this application's
 * shared state is provided at the root.
 */
export function createKidMode(): KidModeState {
    const state = buildKidModeState();
    provide(KID_MODE, state);
    return state;
}

/**
 * Reads the state `createKidMode()` provided at the root.
 *
 * The fallback deliberately does **not** call `provide()`. `provide()` only affects the
 * descendants of the component that calls it, so a fallback `provide()` reached from deep inside
 * the tree would not repair a missing root provider - it would create a second, disconnected
 * `KidModeState`, seeded from the same `localStorage` snapshot but never reactively linked to
 * whatever the real provider (or a sibling's own fallback) holds. Toggling "Use kid mode" from one
 * component would then silently fail to move a sibling that resolved a different instance, which
 * is exactly the bug the kid-mode drop-in audit found in the previous version of this function.
 *
 * A bare, unprovided state is returned instead: safe for an isolated test or a component that
 * genuinely has no ancestor provider, and a state that is still backed by the same persisted keys
 * so it agrees with the real state on every value that has already been saved - it simply is not
 * the same reactive object, which only matters for the cross-component live-sync `createKidMode()`
 * exists to give. If this fallback path is ever exercised in the real application, that is itself
 * the defect: `App.vue` failed to call `createKidMode()` before this component mounted.
 */
export function useKidMode(): KidModeState {
    const injected = inject(KID_MODE, null);
    return injected ?? buildKidModeState();
}

/** True when an animation may run at all: celebrations on, and the OS is not asking for calm. */
export function useMayAnimate(state: KidModeState) {
    return computed(() => state.celebrations.value && !state.reducedMotion.value);
}
