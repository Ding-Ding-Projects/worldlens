import {
    APPEARANCE_STATES,
    SURFACE_PROPERTIES,
    type AppearanceStateName,
    type AppearanceRecord,
    type SurfacePropertyId,
} from "./appearanceRecord.js";
import { TYPOGRAPHY_PROPERTIES, type TypographyPropertyId } from "./typographySpec.js";

/** The lock-store surface used by every appearance property. */
export const APPEARANCE_LOCK_SURFACE = "appearance";
export const MAX_APPEARANCE_LOCK_PART_LENGTH = 256;

function encodePart(value: string, label: string): string {
    if (value.length === 0 || value.length > MAX_APPEARANCE_LOCK_PART_LENGTH) {
        throw new Error(
            `${label} is empty or exceeds ${MAX_APPEARANCE_LOCK_PART_LENGTH} characters.`,
        );
    }
    if ([...value].some((character) => character.charCodeAt(0) < 0x20)) {
        throw new Error(`${label} contains a control character.`);
    }
    return `${value.length}:${value}`;
}

export interface AppearancePropertyLockTarget {
    readonly surface: string;
    readonly path: string;
    readonly label: string;
    readonly state?: AppearanceStateName;
    readonly property: string;
}

function target(
    elementId: string,
    property: string,
    label: string,
    state: AppearanceStateName | undefined = undefined,
): AppearancePropertyLockTarget {
    const statePart = state === undefined ? "base" : `state:${state}`;
    return {
        surface: APPEARANCE_LOCK_SURFACE,
        path: `appearance/${encodePart(elementId, "element id")}/${encodePart(statePart, "state")}/${encodePart(property, "property")}`,
        label:
            state === undefined
                ? `${label} on ${elementId}`
                : `${label} (${state}) on ${elementId}`,
        ...(state === undefined ? {} : { state }),
        property,
    };
}

/** Pre-versioned path accepted while existing lock records migrate deterministically. */
export function legacyAppearancePropertyLockPath(
    elementId: string,
    property: string,
    state?: AppearanceStateName,
): string {
    return `element:${elementId}/${state === undefined ? "base" : `state:${state}`}/${property}`;
}

/** Stable target identity, deliberately independent from credentials or rendered labels. */
export function appearancePropertyLockTarget(
    elementId: string,
    property: TypographyPropertyId | SurfacePropertyId | string,
    state?: AppearanceStateName,
): AppearancePropertyLockTarget {
    return target(elementId, property, property, state);
}

/**
 * A hand-written inventory of every lockable appearance property and every state layer.
 * Credentials are owned by the lock store, never by an appearance record or its export.
 */
export function appearancePropertyLockTargets(
    elementId: string,
    record: AppearanceRecord,
): AppearancePropertyLockTarget[] {
    const base = [
        ...TYPOGRAPHY_PROPERTIES.map((property) => target(elementId, property, property)),
        ...SURFACE_PROPERTIES.map((property) => target(elementId, property, property)),
    ];
    const states = APPEARANCE_STATES.flatMap((state) => {
        const layer = record.states[state];
        if (layer === undefined) return [];
        return [
            ...TYPOGRAPHY_PROPERTIES.map((property) =>
                target(elementId, property, property, state),
            ),
            ...SURFACE_PROPERTIES.map((property) => target(elementId, property, property, state)),
            target(elementId, "effect", "effects", state),
            target(elementId, "icon", "icon", state),
            target(elementId, "badge", "badge", state),
            target(elementId, "separator", "separator", state),
            target(elementId, "shape", "shape", state),
            target(elementId, "spacing", "spacing", state),
        ];
    });
    return [...base, ...states];
}
