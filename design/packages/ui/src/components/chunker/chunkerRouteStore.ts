/**
 * Which destination the last conversion was pointed at, remembered across restarts.
 *
 * Choosing where a conversion runs is not a preference somebody expresses once per session.
 * A person who has set up a repository for this, or a container image, or a machine over
 * SSH, chose that route because it is the one their world actually fits on - and an
 * application that quietly resets to "this computer" every launch asks them to make the
 * same decision again every time, and converts on the wrong machine whenever they forget.
 *
 * ## Why only the route's own fields are stored
 *
 * The stored value is the route and nothing else: a kind, and the concrete identifiers that
 * particular kind carries. No readiness, no measurement, no account state. Readiness is a
 * fact about the machine right now and is measured again on every launch, so persisting it
 * would only create a second, older answer to a question the probe already answers.
 *
 * ## Why a restored route is never trusted to be runnable
 *
 * Restoring a route restores a *choice*, not a permission. Docker can be uninstalled between
 * launches, a repository can lose write access, a saved machine can be forgotten. The picker
 * checks readiness against freshly probed facts exactly as it does for a route chosen by
 * hand, so a restored route that can no longer run shows its own reason and its own fix
 * rather than starting anything.
 *
 * Every read is total: a missing entry, unreadable storage, malformed JSON, an unknown kind
 * or a field of the wrong type all produce `null`, which the caller reads as "nothing was
 * remembered" and falls back to its own default. A corrupt entry never throws and never
 * half-applies.
 */

import {
    CHUNKER_ROUTE_IDS,
    defaultRouteFor,
    type ChunkerRoute,
    type ChunkerRouteId,
} from "./chunkerRoute.js";

const STORAGE_KEY = "worldlens-chunker-route";

/** The slice of `Storage` this file uses, so a test can hand in a plain object. */
export interface ChunkerRouteStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStorage(): ChunkerRouteStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A stored string field, or null when it is absent, empty or not a string at all. */
function text(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function isRouteId(value: unknown): value is ChunkerRouteId {
    return (
        typeof value === "string" && CHUNKER_ROUTE_IDS.includes(value as ChunkerRouteId)
    );
}

/**
 * Rebuild a route from whatever was stored, field by field.
 *
 * Written as one branch per kind rather than by spreading the parsed object, because a
 * spread would carry any extra key straight back into the route - including a key an older
 * or a tampered-with entry invented. Naming each field is what keeps a restored route the
 * same shape as one the picker would have built.
 */
function routeFrom(kind: ChunkerRouteId, stored: Record<string, unknown>): ChunkerRoute {
    switch (kind) {
        case "local":
            return { kind: "local" };
        case "docker":
            return { kind: "docker", image: text(stored.image) };
        case "github-actions":
            return {
                kind: "github-actions",
                owner: text(stored.owner),
                repo: text(stored.repo),
            };
        case "ssh":
            return { kind: "ssh", targetId: text(stored.targetId), label: text(stored.label) };
        case "aws":
            return { kind: "aws", region: text(stored.region) };
    }
}

/** The remembered route, or null when nothing usable was stored. Never throws. */
export function loadChunkerRoute(
    storage: ChunkerRouteStorage | null = defaultStorage(),
): ChunkerRoute | null {
    if (storage === null) return null;

    let raw: string | null;
    try {
        raw = storage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
    if (raw === null || raw === "") return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;

    const kind = parsed.kind;
    if (!isRouteId(kind)) return null;
    return routeFrom(kind, parsed);
}

/** Remember this route. A storage that refuses the write is not an error worth raising. */
export function saveChunkerRoute(
    route: ChunkerRoute,
    storage: ChunkerRouteStorage | null = defaultStorage(),
): void {
    if (storage === null) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(route));
    } catch {
        // A full or blocked storage costs the next launch its remembered route and nothing
        // else. Failing the conversion screen over it would be far worse than forgetting.
    }
}

/** The remembered route, or `local` when nothing was remembered. */
export function initialChunkerRoute(
    storage: ChunkerRouteStorage | null = defaultStorage(),
): ChunkerRoute {
    return loadChunkerRoute(storage) ?? defaultRouteFor("local");
}
