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
        path: `element:${elementId}/${statePart}/${property}`,
        label:
            state === undefined
                ? `${label} on ${elementId}`
                : `${label} (${state}) on ${elementId}`,
        ...(state === undefined ? {} : { state }),
        property,
    };
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
