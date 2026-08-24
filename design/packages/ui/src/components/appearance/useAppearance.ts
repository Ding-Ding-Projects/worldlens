/**
 * The live appearance state, and how a component binds itself to a piece of it.
 *
 * One module-level state rather than a provide/inject tree, for the same reason the
 * notification centre and the palette keep theirs: an element deep in a dialog inside a menu
 * has to see the same appearance as the tab that opened it, and threading a provider through
 * every intermediate component means the one place somebody forgets is the one place the
 * theme stops applying. It is a plain `ref` over a plain immutable value, so every write goes
 * through the pure functions in `appearanceStore` and can be reasoned about there.
 *
 * ## Registration is a fact, not a claim
 *
 * A component that can be restyled calls {@link registerAppearanceTarget} when it mounts and
 * drops out again when it unmounts, so the editor's element list is a list of elements that
 * exist right now. The alternative - a hard-coded inventory of every tab, menu and toolbar
 * the app is supposed to have - is a list of claims, and the first entry to go stale is
 * indistinguishable from a bug in the editor. The editor's own chrome is the exception and is
 * listed statically, because it exists for exactly as long as the editor does.
 *
 * ## Capabilities are probed once, and absence means yes
 *
 * `CSS.supports` does not exist under jsdom and need not exist in every embedder. The
 * capability probe treats a missing `CSS` as "assume everything works" rather than as
 * "nothing works", because a false negative here would hide a control the platform can
 * perfectly well render, and hiding controls is precisely what the contract forbids.
 */

import {
    computed,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    type ComputedRef,
    type Ref,
} from "vue";

import {
    appearanceStyle,
    APPEARANCE_STATES,
    emptyRecord,
    SURFACE_PROPERTIES,
    resetSurface,
    resetTypography,
    resetAppearanceStateProperty,
    type AppearanceRecord,
    type AppearanceStyle,
    type SurfacePropertyId,
    type SurfaceSpec,
    type AppearanceStateLayer,
    type AppearanceStateName,
    type AppearanceStatePropertyGroup,
    isRecordEmpty,
    resolveStateAppearance,
} from "./appearanceRecord.js";
import {
    appearancePropertyLockTarget,
    legacyAppearancePropertyLockPath,
} from "./appearanceLocks.js";
import { useLockStore } from "../locks/useLocks.js";
import type { LockStore } from "../locks/lockStore.js";
import {
    EDITOR_CHROME_TARGETS,
    readAppearanceState,
    recordFor,
    resolveTarget,
    withRecord,
    writeAppearanceState,
    type AppearanceState,
    type AppearanceTargetInfo,
} from "./appearanceStore.js";
import { BUNDLED_FONTS, queryInstalledFonts, type FontFamily } from "./fontCatalog.js";
import { TYPOGRAPHY_PROPERTIES } from "./typographySpec.js";
import {
    detectTypographyCapabilities,
    type TypographyCapabilities,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/* -------------------------------------------------------------------------- */
/* The state                                                                  */
/* -------------------------------------------------------------------------- */

const state = ref<AppearanceState>(readAppearanceState());

/** The whole appearance state, read-only to callers that only want to render it. */
export function appearanceState(): Ref<AppearanceState> {
    return state;
}

/**
 * Replaces the state and persists it.
 *
 * Every mutation in this feature funnels through here, so there is exactly one place that
 * writes to storage and exactly one thing to look at when a change fails to survive a
 * restart.
 */
export function commitAppearance(next: AppearanceState, locks?: LockStore): void {
    state.value = next;
    writeAppearanceState(next);
}

/** Reloads from storage, which is what a test needs between cases. */
export function reloadAppearance(): void {
    state.value = readAppearanceState();
}

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

const registered = ref<AppearanceTargetInfo[]>([]);

export function registerAppearanceTarget(info: AppearanceTargetInfo): void {
    if (registered.value.some((entry) => entry.id === info.id)) return;
    registered.value = [...registered.value, info];
}

export function unregisterAppearanceTarget(id: string): void {
    registered.value = registered.value.filter((entry) => entry.id !== id);
}

/**
 * Every element the editor can be pointed at right now.
 *
 * The editor's own chrome first, because those entries are always present and a list whose
 * first rows move around as the user navigates is a list nobody can build muscle memory for.
 */
export function appearanceTargets(): ComputedRef<AppearanceTargetInfo[]> {
    return computed(() => [...EDITOR_CHROME_TARGETS, ...registered.value]);
}

/* -------------------------------------------------------------------------- */
/* Capabilities and fonts                                                     */
/* -------------------------------------------------------------------------- */

/** The engine's own answer about what it will render, probed once for the whole app. */
export const typographyCapabilities: TypographyCapabilities = detectTypographyCapabilities(
    typeof globalThis.CSS?.supports === "function"
        ? { supports: (property, value) => globalThis.CSS.supports(property, value) }
        : null,
);

const fonts = shallowRef<readonly FontFamily[]>(BUNDLED_FONTS);
let fontsRequested = false;

/**
 * The font catalogue, filled in from the platform the first time anybody asks.
 *
 * Deliberately lazy and deliberately silent about failure. `queryLocalFonts()` shows a
 * permission prompt, so asking for it at startup would greet a user who has never opened the
 * appearance editor with a dialog about fonts; and a denied prompt is a choice rather than an
 * error, so the answer is the bundled list and no notification.
 */
export function fontCatalog(): Ref<readonly FontFamily[]> {
    if (!fontsRequested) {
        fontsRequested = true;
        void queryInstalledFonts().then((found) => {
            fonts.value = found;
        });
    }
    return fonts;
}

/* -------------------------------------------------------------------------- */
/* Binding one element                                                        */
/* -------------------------------------------------------------------------- */

/** Everything a component needs to render itself and to be edited. */
export interface AppearanceTargetBinding {
    id: ComputedRef<string>;
    /** This element's own overrides, without anything it inherits. */
    record: ComputedRef<AppearanceRecord>;
    /** The style object to bind, plus what the platform could not do. */
    style: ComputedRef<AppearanceStyle>;
    /** True when this element has overrides of its own that a reset would remove. */
    customised: ComputedRef<boolean>;
    setTypography: <K extends TypographyPropertyId>(id: K, value: TypographySpec[K]) => void;
    setSurface: <K extends SurfacePropertyId>(id: K, value: SurfaceSpec[K]) => void;
    resetTypographyProperty: (id: TypographyPropertyId) => void;
    resetSurfaceProperty: (id: SurfacePropertyId) => void;
    setInherit: (presetId: string) => void;
    resetElement: () => void;
    resetEverything: () => void;
    commitState: (next: AppearanceState) => void;
    setState: (state: AppearanceStateName, layer: AppearanceStateLayer) => void;
    resetStateProperty: (
        state: AppearanceStateName,
        group: AppearanceStatePropertyGroup,
        property: string,
    ) => void;
    isPropertyLocked: (property: string, state?: AppearanceStateName) => boolean;
}

/**
 * Binds a component to one element's appearance.
 *
 * The id is a getter rather than a string so a component whose identity changes - a tab that
 * is reordered, a row that is recycled by a virtual list - keeps following the right record
 * instead of the one it happened to mount with. That is the contract's "loses its anchor when
 * tabs reorder" failure, prevented at the source rather than patched at the editor.
 */
export function useAppearanceTarget(
    id: string | (() => string),
    stateName?: AppearanceStateName | (() => AppearanceStateName | undefined),
): AppearanceTargetBinding {
    const targetId = computed(() => (typeof id === "function" ? id() : id));

    const record = computed(() => recordFor(state.value, targetId.value));

    const activeState = computed(() => (typeof stateName === "function" ? stateName() : stateName));
    const locks = useLockStore();

    const style = computed(() =>
        appearanceStyle(
            resolveTarget(state.value, targetId.value),
            typographyCapabilities,
            fonts.value,
            activeState.value,
            state.value.rainbowSpeed,
        ),
    );

    function update(next: AppearanceRecord): void {
        const nextState = withRecord(state.value, targetId.value, next);
        commitAppearance(reconcileLockedState(state.value, nextState), locks);
    }

    function lockedForState(
        elementId: string,
        property: string,
        stateName?: AppearanceStateName,
    ): boolean {
        return lockedFor(elementId, property, stateName);
    }

    function reconcileLockedState(
        previous: AppearanceState,
        next: AppearanceState,
    ): AppearanceState {
        const elements: Record<string, AppearanceRecord> = { ...next.elements };
        const ids = new Set([...Object.keys(previous.elements), ...Object.keys(next.elements)]);
        for (const elementId of ids) {
            const oldRecord = recordFor(previous, elementId);
            const nextRecord = elements[elementId] ?? emptyRecord();
            const oldResolved = resolveTarget(previous, elementId);
            const kept: AppearanceRecord = {
                ...nextRecord,
                typography: { ...nextRecord.typography },
                surface: { ...nextRecord.surface },
                states: { ...nextRecord.states },
            };
            for (const property of TYPOGRAPHY_PROPERTIES) {
                if (
                    !lockedForState(elementId, property) ||
                    oldResolved.typography[property] === undefined
                )
                    continue;
                (kept.typography as Record<string, unknown>)[property] =
                    oldResolved.typography[property];
            }
            for (const property of SURFACE_PROPERTIES) {
                if (
                    !lockedForState(elementId, property) ||
                    oldResolved.surface[property] === undefined
                )
                    continue;
                (kept.surface as Record<string, unknown>)[property] = oldResolved.surface[property];
            }
            for (const stateName of APPEARANCE_STATES) {
                const oldState = resolveStateAppearance(oldResolved, stateName);
                const oldLayer = oldResolved.states[stateName] ?? {};
                const nextLayer = kept.states[stateName];
                const nextState = { ...(nextLayer ?? {}) };
                for (const property of TYPOGRAPHY_PROPERTIES) {
                    if (!lockedForState(elementId, property, stateName)) continue;
                    const value = oldState.typography[property];
                    if (value !== undefined)
                        nextState.typography = { ...nextState.typography, [property]: value };
                }
                for (const property of SURFACE_PROPERTIES) {
                    if (!lockedForState(elementId, property, stateName)) continue;
                    const value = oldState.surface[property];
                    if (value !== undefined)
                        nextState.surface = { ...nextState.surface, [property]: value };
                }
                const groups = [
                    [
                        "effect",
                        {
                            elevation: oldState.surface.elevation,
                            opacity: oldState.surface.opacity,
                            shadowColor: oldLayer.effect?.shadowColor,
                            shadowBlur: oldLayer.effect?.shadowBlur,
                            glowColor: oldLayer.effect?.glowColor,
                            glowRadius: oldLayer.effect?.glowRadius,
                        },
                    ],
                    [
                        "spacing",
                        {
                            gap: oldState.surface.gap,
                            marginInline: oldState.surface.marginInline,
                            marginBlock: oldState.surface.marginBlock,
                            paddingInline: oldState.surface.paddingInline,
                            paddingBlock: oldState.surface.paddingBlock,
                        },
                    ],
                    ["icon", oldState.surface.icon],
                    ["badge", oldState.surface.badge],
                    ["separator", oldState.surface.separator],
                ] as const;
                for (const [group, effective] of groups) {
                    const values = { ...((nextState[group] ?? {}) as Record<string, unknown>) };
                    for (const property of Object.keys(effective)) {
                        if (
                            !lockedForState(elementId, property, stateName) &&
                            !lockedForState(elementId, group, stateName)
                        )
                            continue;
                        const value = (effective as Record<string, unknown>)[property];
                        if (value !== undefined) values[property] = value;
                    }
                    if (Object.keys(values).length > 0) {
                        (nextState as Record<string, unknown>)[group] = values;
                    }
                }
                if (
                    oldState.surface.shape !== undefined &&
                    lockedForState(elementId, "shape", stateName)
                ) {
                    nextState.shape = oldState.surface.shape;
                }
                if (Object.keys(nextState).length > 0) kept.states[stateName] = nextState;
            }
            if (isRecordEmpty(kept)) delete elements[elementId];
            else elements[elementId] = kept;
        }
        return { ...next, elements };
    }

    function lockedFor(
        elementId: string,
        property: string,
        stateName?: AppearanceStateName,
    ): boolean {
        if (!locks.canList) return false;
        const target = appearancePropertyLockTarget(elementId, property, stateName);
        return (
            locks.isLocked(target.surface, target.path) ||
            locks.isLocked(
                target.surface,
                legacyAppearancePropertyLockPath(elementId, property, stateName),
            )
        );
    }

    function locked(property: string, stateName?: AppearanceStateName): boolean {
        return lockedFor(targetId.value, property, stateName);
    }

    function preserveLockedRecord(elementId: string, source: AppearanceRecord): AppearanceRecord {
        const kept = emptyRecord();
        for (const property of TYPOGRAPHY_PROPERTIES) {
            if (lockedFor(elementId, property) && source.typography[property] !== undefined) {
                (kept.typography as Record<string, unknown>)[property] =
                    source.typography[property];
            }
        }
        for (const property of SURFACE_PROPERTIES) {
            if (lockedFor(elementId, property) && source.surface[property] !== undefined) {
                (kept.surface as Record<string, unknown>)[property] = source.surface[property];
            }
        }
        for (const stateName of APPEARANCE_STATES) {
            const layer = source.states[stateName];
            if (layer === undefined) continue;
            const nextLayer: AppearanceStateLayer = {};
            for (const group of [
                "typography",
                "surface",
                "effect",
                "icon",
                "badge",
                "separator",
                "spacing",
            ] as const) {
                const values = layer[group];
                if (values === undefined) continue;
                const keptValues: Record<string, unknown> = {};
                for (const property of Object.keys(values)) {
                    if (
                        lockedFor(elementId, property, stateName) ||
                        lockedFor(elementId, group, stateName)
                    ) {
                        keptValues[property] = (values as Record<string, unknown>)[property];
                    }
                }
                if (Object.keys(keptValues).length > 0) {
                    (nextLayer as Record<string, unknown>)[group] = keptValues;
                }
            }
            if (layer.shape !== undefined && lockedFor(elementId, "shape", stateName)) {
                nextLayer.shape = layer.shape;
            }
            if (Object.keys(nextLayer).length > 0) kept.states[stateName] = nextLayer;
        }
        return kept;
    }

    return {
        id: targetId,
        record,
        style,
        customised: computed(() => state.value.elements[targetId.value] !== undefined),

        setTypography(property, value) {
            if (locked(property)) return;
            update({
                ...record.value,
                typography: { ...record.value.typography, [property]: value },
            });
        },

        setSurface(property, value) {
            if (locked(property)) return;
            update({ ...record.value, surface: { ...record.value.surface, [property]: value } });
        },

        resetTypographyProperty(property) {
            if (locked(property)) return;
            update(resetTypography(record.value, property));
        },

        resetSurfaceProperty(property) {
            if (locked(property)) return;
            update(resetSurface(record.value, property));
        },

        setInherit(presetId) {
            update({ ...record.value, inherit: presetId });
        },

        resetElement() {
            commitAppearance(
                withRecord(
                    state.value,
                    targetId.value,
                    preserveLockedRecord(targetId.value, record.value),
                ),
            );
        },

        resetEverything() {
            const elements: Record<string, AppearanceRecord> = {};
            for (const [elementId, source] of Object.entries(state.value.elements)) {
                const kept = preserveLockedRecord(elementId, source);
                if (!isRecordEmpty(kept)) elements[elementId] = kept;
            }
            commitAppearance({ ...state.value, elements, activePreset: "" }, locks);
        },
        commitState(next) {
            commitAppearance(reconcileLockedState(state.value, next), locks);
        },
        setState(stateName, layer) {
            const previous = record.value.states[stateName] ?? {};
            const guardGroup = <T extends Record<string, unknown>>(
                group: keyof AppearanceStateLayer,
                incoming: T | undefined,
            ): T | undefined => {
                if (incoming === undefined) return undefined;
                const before = previous[group];
                if (locked(String(group), stateName)) {
                    return before as T | undefined;
                }
                const guarded = { ...incoming };
                for (const property of Object.keys(incoming)) {
                    if (locked(property, stateName)) {
                        const value =
                            before && typeof before === "object"
                                ? (before as Record<string, unknown>)[property]
                                : undefined;
                        if (value === undefined) delete guarded[property];
                        else (guarded as Record<string, unknown>)[property] = value;
                    }
                }
                return guarded;
            };
            const nextLayer: AppearanceStateLayer = {
                ...layer,
                typography: guardGroup(
                    "typography",
                    layer.typography as Record<string, unknown> | undefined,
                ) as never,
                surface: guardGroup(
                    "surface",
                    layer.surface as Record<string, unknown> | undefined,
                ) as never,
                effect: guardGroup(
                    "effect",
                    layer.effect as Record<string, unknown> | undefined,
                ) as never,
                icon: guardGroup(
                    "icon",
                    layer.icon as Record<string, unknown> | undefined,
                ) as never,
                badge: guardGroup(
                    "badge",
                    layer.badge as Record<string, unknown> | undefined,
                ) as never,
                separator: guardGroup(
                    "separator",
                    layer.separator as Record<string, unknown> | undefined,
                ) as never,
                spacing: guardGroup(
                    "spacing",
                    layer.spacing as Record<string, unknown> | undefined,
                ) as never,
            };
            if (layer.shape !== undefined && locked("shape", stateName)) {
                if (previous.shape === undefined) delete nextLayer.shape;
                else nextLayer.shape = previous.shape;
            }
            const next = { ...record.value.states, [stateName]: nextLayer };
            update({ ...record.value, states: next });
        },
        resetStateProperty(stateName, group, property) {
            if (locked(property, stateName)) return;
            update(
                resetAppearanceStateProperty(
                    record.value,
                    stateName,
                    group,
                    property as TypographyPropertyId | SurfacePropertyId,
                ),
            );
        },
        isPropertyLocked: locked,
    };
}

/**
 * Registers an element for as long as the calling component is mounted.
 *
 * Paired deliberately: an entry that outlived its component would put a row in the editor's
 * element list that opens an editor for something nobody can see.
 */
export function useRegisteredTarget(info: AppearanceTargetInfo): void {
    onMounted(() => registerAppearanceTarget(info));
    onBeforeUnmount(() => unregisterAppearanceTarget(info.id));
}

/* -------------------------------------------------------------------------- */
/* Cross-instance popup coordination                                         */
/* -------------------------------------------------------------------------- */

/**
 * Whichever `AppearanceTarget` instance currently owns the one open menu or editor, so a
 * second instance opening its own popup can close the first before opening its own - the same
 * "one open menu at a time" rule the site's own `contextMenu.ts` already enforces
 * (`openElementMenu`'s `openMenu?.close()` before it opens a new one).
 *
 * Without this, `menuOpen`/`editorOpen` are refs private to each `AppearanceTarget` instance,
 * with nothing coordinating between them. Right-clicking a second element while the first
 * one's menu is still open used to leave both rendered and interactive at once: the first
 * instance's own `vClickOutside` directive only closes on a real `click` DOM event, and a
 * right mouse press never dispatches one (only `mousedown`/`contextmenu`), so nothing ever
 * told the first instance to close - two context menus stacked on screen, which no native or
 * conventional context menu does.
 */
let closeOtherAppearancePopup: (() => void) | null = null;

/**
 * Called by an instance right before it opens its own menu or editor. Closes whichever
 * *other* instance currently owns the shared "one open popup" slot - a no-op when this
 * instance already owns it, so reopening or repositioning one's own menu never bounces its
 * own popup shut - then claims the slot for this instance.
 */
export function claimAppearancePopup(close: () => void): void {
    if (closeOtherAppearancePopup !== null && closeOtherAppearancePopup !== close) {
        closeOtherAppearancePopup();
    }
    closeOtherAppearancePopup = close;
}

/**
 * Called by an instance once its own popup has closed (or the instance unmounts), so it stops
 * being the registered owner. A no-op when some other instance has since claimed the slot,
 * which is exactly the case a force-closed instance hits: it never owned the slot to begin
 * with by the time it gets here, since the instance that closed it already claimed it first.
 */
export function releaseAppearancePopup(close: () => void): void {
    if (closeOtherAppearancePopup === close) {
        closeOtherAppearancePopup = null;
    }
}

/** An empty record, re-exported so a component does not reach past this module for one. */
export { emptyRecord };
