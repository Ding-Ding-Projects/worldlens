/**
 * Markers a person makes, as opposed to markers a server publishes.
 *
 * ## Why this exists at all
 *
 * Every marker the application could show came from somebody else: BlueMap's own marker
 * files, or a live server's API. The marker menu rendered them, filtered them, searched
 * them - and offered no way to make one. A map of your own world opened on "This marker set
 * has nothing in it" and there was nothing anywhere in the application that could put
 * something in it. Reported from a real build, with a screenshot of exactly that sentence
 * and no button under it.
 *
 * ## These are yours, and they never pretend to be the server's
 *
 * A studio marker lives in its own set, kept separate from anything loaded from a marker
 * file or a live server. That separation is not tidiness: a marker file is somebody else's
 * data that gets refetched and replaced, so a user marker merged into it would vanish on
 * the next poll with no explanation. Kept apart, they survive, and the interface can always
 * answer "did I make this, or did the server?" - which is the question somebody asks the
 * moment two markers disagree.
 *
 * ## Nothing here is a secret, and nothing here leaves the machine
 *
 * A marker is a label, a note and three numbers. It is stored locally with the rest of this
 * application's own data and is never sent anywhere. Worth stating because a marker's
 * detail field is free text and people put things in free text.
 */

/** Where a marker sits. Minecraft's own axes, so the numbers match what the game shows. */
export interface MarkerPosition {
    x: number;
    y: number;
    z: number;
}

/**
 * One marker somebody made.
 *
 * `mapId` rather than a profile id: a render can hold several dimensions, and a marker
 * dropped on the nether has no business appearing over the overworld. Storing the map it
 * belongs to is what keeps that honest without a second lookup.
 */
export interface StudioMarker {
    readonly id: string;
    /** Which map this marker belongs to. Never shown; used to decide what to draw. */
    readonly mapId: string;
    label: string;
    /** Free text, shown when the marker is opened. May be empty. */
    detail: string;
    position: MarkerPosition;
    /** Hex, `#rrggbb`. Functional data colour, not chrome, so it is not an M3 token. */
    colour: string;
    /** False keeps it in the studio without drawing it on the map. */
    visible: boolean;
    /** ISO 8601. */
    readonly createdAt: string;
    updatedAt: string;
}

export const DEFAULT_MARKER_COLOUR = "#4f8cff";

/**
 * Minecraft's build limits, which are what make a typo detectable.
 *
 * Y is the only axis with a real bound worth enforcing: a Y of 40000 is a mistake every
 * time, where an X of 40000 is a perfectly ordinary far-lands-ward coordinate. The X and Z
 * bounds are the world border's own maximum, so they refuse a number that could not be a
 * position at all while accepting every number that could.
 */
export const MARKER_Y_MIN = -2048;
export const MARKER_Y_MAX = 2048;
export const MARKER_XZ_LIMIT = 30_000_000;

export type MarkerProblem =
    | { readonly field: "label"; readonly message: string }
    | { readonly field: "position"; readonly message: string }
    | { readonly field: "colour"; readonly message: string };

/**
 * What is wrong with a draft, in the order somebody fills the form in.
 *
 * Returns every problem rather than the first, so a form can mark all three fields at once
 * instead of making somebody fix one, submit, and discover the next.
 */
export function markerProblems(draft: {
    label: string;
    position: { x: number; y: number; z: number };
    colour: string;
}): readonly MarkerProblem[] {
    const problems: MarkerProblem[] = [];

    if (draft.label.trim() === "") {
        problems.push({
            field: "label",
            message: "A marker needs a name, or the list is a row of blanks.",
        });
    }

    const { x, y, z } = draft.position;
    if (![x, y, z].every((value) => Number.isFinite(value))) {
        problems.push({
            field: "position",
            message: "X, Y and Z all have to be numbers.",
        });
    } else if (y < MARKER_Y_MIN || y > MARKER_Y_MAX) {
        problems.push({
            field: "position",
            message: `Y is ${y}, which is outside anything a world builds to (${MARKER_Y_MIN} to ${MARKER_Y_MAX}).`,
        });
    } else if (
        Math.abs(x) > MARKER_XZ_LIMIT ||
        Math.abs(z) > MARKER_XZ_LIMIT
    ) {
        problems.push({
            field: "position",
            message: "X and Z are past the furthest a world border reaches.",
        });
    }

    if (!/^#[0-9a-f]{6}$/i.test(draft.colour)) {
        problems.push({
            field: "colour",
            message: "A colour is six hexadecimal digits after a hash, like #4f8cff.",
        });
    }

    return problems;
}

export interface MarkerDraft {
    label: string;
    detail: string;
    position: MarkerPosition;
    colour: string;
}

/** A blank draft, optionally starting where the camera is - which is usually what is meant. */
export function emptyDraft(at?: Partial<MarkerPosition>): MarkerDraft {
    return {
        label: "",
        detail: "",
        position: {
            x: Math.round(at?.x ?? 0),
            y: Math.round(at?.y ?? 64),
            z: Math.round(at?.z ?? 0),
        },
        colour: DEFAULT_MARKER_COLOUR,
    };
}

export interface CreateOptions {
    readonly id?: string;
    readonly now?: string;
}

export type MarkerResult =
    | { readonly ok: true; readonly marker: StudioMarker }
    | { readonly ok: false; readonly problems: readonly MarkerProblem[] };

export function createMarker(
    mapId: string,
    draft: MarkerDraft,
    options: CreateOptions = {},
): MarkerResult {
    const problems = markerProblems(draft);
    if (problems.length > 0) return { ok: false, problems };

    const now = options.now ?? new Date().toISOString();
    return {
        ok: true,
        marker: {
            id: options.id ?? crypto.randomUUID(),
            mapId,
            label: draft.label.trim(),
            detail: draft.detail.trim(),
            // Rounded because a marker is placed at a block, and a position carrying nine
            // decimal places renders as a coordinate readout nobody can compare to the F3
            // screen they are looking at.
            position: {
                x: Math.round(draft.position.x),
                y: Math.round(draft.position.y),
                z: Math.round(draft.position.z),
            },
            colour: draft.colour.toLowerCase(),
            visible: true,
            createdAt: now,
            updatedAt: now,
        },
    };
}

/** An edit, validated exactly as a creation is. Identity and creation time never move. */
export function editMarker(
    marker: StudioMarker,
    draft: MarkerDraft,
    now = new Date().toISOString(),
): MarkerResult {
    const problems = markerProblems(draft);
    if (problems.length > 0) return { ok: false, problems };
    return {
        ok: true,
        marker: {
            ...marker,
            label: draft.label.trim(),
            detail: draft.detail.trim(),
            position: {
                x: Math.round(draft.position.x),
                y: Math.round(draft.position.y),
                z: Math.round(draft.position.z),
            },
            colour: draft.colour.toLowerCase(),
            updatedAt: now,
        },
    };
}

/** The draft that edits this marker, so a form is never populated field by field. */
export function draftFrom(marker: StudioMarker): MarkerDraft {
    return {
        label: marker.label,
        detail: marker.detail,
        position: { ...marker.position },
        colour: marker.colour,
    };
}

/**
 * The searchable text of one marker.
 *
 * The coordinates are in it deliberately: "what did I put near 200, 70, -450" is a real
 * question, and a search that only covered the label could not answer it.
 */
export function markerSearchText(marker: StudioMarker): string {
    return [
        marker.label,
        marker.detail,
        `${marker.position.x} ${marker.position.y} ${marker.position.z}`,
    ].join(" ");
}

/**
 * Studio markers shaped as the viewer's own marker-set data.
 *
 * The one place this module knows the viewer exists, and it knows it only as a shape:
 * building the object here rather than reaching into three.js keeps every rule above
 * testable with no renderer anywhere near it. Hidden markers are left out rather than added
 * and switched off, because a marker set is refetched wholesale and "added but invisible" is
 * a state that survives exactly until the next refresh.
 */
export function toMarkerSetData(
    markers: readonly StudioMarker[],
    mapId: string,
): {
    id: string;
    label: string;
    toggleable: boolean;
    defaultHidden: boolean;
    markers: Record<string, unknown>;
} {
    const drawn = markers.filter((marker) => marker.mapId === mapId && marker.visible);
    const entries: Record<string, unknown> = {};
    for (const marker of drawn) {
        entries[marker.id] = {
            type: "poi",
            position: { ...marker.position },
            label: marker.label,
            detail: marker.detail === "" ? marker.label : marker.detail,
            sorting: 0,
            listed: true,
            classes: ["worldlens-studio-marker"],
        };
    }
    return {
        id: MARKER_STUDIO_SET_ID,
        label: "My markers",
        toggleable: true,
        defaultHidden: false,
        markers: entries,
    };
}

/**
 * The set id studio markers live under.
 *
 * A fixed, namespaced id rather than a random one: it has to be stable so the set can be
 * replaced on every change instead of stacking up, and it has to be unmistakable so a
 * marker file that happens to define a set called "markers" cannot collide with it.
 */
export const MARKER_STUDIO_SET_ID = "worldlens:studio";
