/**
 * The seam between the BlueMap-source settings section and the main process.
 *
 * A structural mirror of what the preload exposes on `window.worldlens.bluemapSource`,
 * restated rather than imported for the same reason `dependencyBridge.ts` restates its own
 * slice: this package compiles and runs in three places (the desktop app, a browser tab, and
 * under Vitest) and only the first of them has a preload.
 *
 * The whole namespace is feature-detected in one go by {@link blueMapSourceHostFrom}, and both
 * methods are required rather than probed one at a time. The section is a statement of fact
 * with a button under it; a build that could report the local half and not press the button
 * would be offering a control that throws when pressed, which is the exact shape the
 * decorative-UI rule forbids.
 */

/** Mirrors `BlueMapJarProvenance` in the app's `main/bluemap/source.ts`. */
export interface BlueMapJarProvenance {
    readonly commit: string;
    readonly shortCommit: string;
    readonly version: string | null;
    readonly builtAt: string | null;
    readonly jarPath: string;
}

/** Where the newest upstream release sits relative to the commit these jars were built from. */
export type BlueMapComparison = "level" | "behind" | "ahead" | "diverged";

export interface BlueMapUpstreamRelease {
    readonly ref: string;
    readonly commit: string;
    readonly shortCommit: string;
    readonly publishedAt: string | null;
    readonly comparison: BlueMapComparison;
    readonly commitsBehind: number;
    readonly commitsAhead: number;
}

/**
 * Both halves of the answer, either of which may be absent with a reason beside it.
 *
 * The reason fields are the point of the shape. "GitHub could not be asked" and "there is no
 * newer release" are different claims, and a report that could only express the second would
 * have to present the first as being up to date, which is the one thing this section must
 * never do.
 */
export interface BlueMapSourceReport {
    readonly jars: BlueMapJarProvenance | null;
    readonly jarsReason: string | null;
    readonly upstream: BlueMapUpstreamRelease | null;
    readonly upstreamReason: string | null;
    readonly checkedAt: string;
}

/** Everything the row asks of its environment. */
export interface BlueMapSourceHost {
    read(): Promise<BlueMapSourceReport>;
    check(): Promise<BlueMapSourceReport>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The host from the desktop shell's bridge, or null in a browser tab and under Vitest. */
export function blueMapSourceHostFrom(bridge: unknown): BlueMapSourceHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as Record<string, unknown>)["bluemapSource"];
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<Record<"read" | "check", unknown>>;
    if (!isFunction(candidate.read) || !isFunction(candidate.check)) return null;

    const ready = api as BlueMapSourceHost;
    return { read: () => ready.read(), check: () => ready.check() };
}
