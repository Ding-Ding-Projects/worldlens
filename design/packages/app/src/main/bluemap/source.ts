/**
 * Which BlueMap the jars in this installation actually are, and whether upstream has moved on.
 *
 * The engine this app renders with is not this app's code. It is BlueMap's own source, vendored
 * at `vendor/BlueMap` as a git submodule pinned to one commit, compiled unmodified by
 * `scripts/bootstrap.mjs` with upstream's own Gradle wrapper. Nothing in the resulting jar is
 * written here, which is exactly why the question "what is in there" has no answer inside the
 * jar that this app is entitled to trust: the version in the filename is upstream's
 * `git describe` output, and a filename is a label rather than a provenance record.
 *
 * So the build writes one beside the jars, and this module reads it. That file
 * (`worldlens-jar-provenance.json`, per `scripts/bootstrap-helpers.mjs`) is the only thing that
 * can say which submodule commit a given jar was compiled from, and its absence is a real
 * answer rather than a missing one: jars that arrived some other way genuinely cannot be shown
 * to match any commit, and this module says that instead of guessing the pinned commit and
 * presenting it as fact.
 *
 * The upstream half is deliberately a separate call from the local half. Reading a small JSON
 * file beside a jar is instant and always possible; asking GitHub what its newest release is
 * needs a network, can be rate limited, and can simply fail. Folding the two together would
 * make opening a settings screen wait on the internet, and would make one failure erase the
 * other's perfectly good answer.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveCliJar, type JarLookupOptions } from "../java/jars.js";

/** The repository the vendored submodule tracks. Stated once so nothing else spells it out. */
export const BLUEMAP_REPOSITORY = "BlueMap-Minecraft/BlueMap";

/**
 * The filename the build writes beside the jars.
 *
 * Kept in step with `JAR_STAMP_NAME` in `scripts/bootstrap-helpers.mjs` by spelling, which is
 * the same joint the settings-section anchors use: the writer is a build script that never
 * imports TypeScript, so there is no shared constant either side could import instead.
 */
export const JAR_STAMP_NAME = "worldlens-jar-provenance.json";

/** What the build recorded about the jars sitting in this installation. */
export interface BlueMapJarProvenance {
    /** The full `vendor/BlueMap` commit the jars were compiled from. */
    readonly commit: string;
    /** The same, shortened for display. Derived here so no caller shortens it differently. */
    readonly shortCommit: string;
    /** Upstream's own git-describe version, from the jar filename. Null when unparseable. */
    readonly version: string | null;
    /** When the build ran, as the stamp recorded it. Null when the stamp did not say. */
    readonly builtAt: string | null;
    /** The jar this provenance describes, shown so a person can go and look at it. */
    readonly jarPath: string;
}

/** Where the newest upstream release stands relative to the commit the jars came from. */
export type BlueMapComparison = "level" | "behind" | "ahead" | "diverged";

export interface BlueMapUpstreamRelease {
    /** The release tag, such as `v5.23`. */
    readonly ref: string;
    /** The commit that tag resolves to, peeled through the tag object when annotated. */
    readonly commit: string;
    readonly shortCommit: string;
    /** When the release was published, as GitHub reported it. Null when it did not say. */
    readonly publishedAt: string | null;
    readonly comparison: BlueMapComparison;
    /** How many commits the vendored pin is behind that release. */
    readonly commitsBehind: number;
    readonly commitsAhead: number;
}

/**
 * Everything the settings section shows, with the two halves failing independently.
 *
 * A null half always comes with a reason, and the reason is what the surface renders. This is
 * the whole point of the shape: "we could not ask" and "you are up to date" are different
 * claims, and a report that could only express the second would have to lie to express the
 * first.
 */
export interface BlueMapSourceReport {
    readonly jars: BlueMapJarProvenance | null;
    /** Why there is no provenance, when there is none. Null when `jars` is present. */
    readonly jarsReason: string | null;
    readonly upstream: BlueMapUpstreamRelease | null;
    /** Why upstream could not be asked, or was not asked at all. Null when `upstream` is present. */
    readonly upstreamReason: string | null;
    /** When this report was produced, so a stale one on screen is visibly stale. */
    readonly checkedAt: string;
}

function shorten(commit: string): string {
    return commit.slice(0, 12);
}

/** True for a plausible full git object name, so a stamp holding a branch name is rejected. */
function isCommitSha(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

export interface JarProvenanceOptions extends JarLookupOptions {
    /** Injected in tests. Defaults to reading the real file. */
    readonly readStamp?: (path: string) => string;
}

/**
 * The provenance of the CLI jar this installation would actually run, or why there is none.
 *
 * Every failure here is expected rather than exceptional: a checkout that has not built the
 * jars yet, a jar somebody copied in by hand, a stamp truncated by an interrupted write. Each
 * one produces a sentence rather than a throw, because the section that shows this exists
 * precisely to be readable when the situation is imperfect.
 */
export function readJarProvenance(
    options: JarProvenanceOptions = {},
): { readonly jars: BlueMapJarProvenance | null; readonly jarsReason: string | null } {
    const read = options.readStamp ?? ((path: string) => readFileSync(path, "utf8"));

    let jarPath: string;
    let version: string | null;
    try {
        const jar = resolveCliJar(options);
        jarPath = jar.path;
        version = jar.version;
    } catch {
        return {
            jars: null,
            jarsReason:
                "No BlueMap CLI jar was found in this installation, so there is nothing to report the origin of.",
        };
    }

    const stampPath = join(dirname(jarPath), JAR_STAMP_NAME);
    let parsed: unknown;
    try {
        parsed = JSON.parse(read(stampPath));
    } catch {
        return {
            jars: null,
            jarsReason:
                "The jar is here, but the build record beside it is missing or unreadable, so this jar " +
                "cannot be shown to have come from any particular BlueMap commit.",
        };
    }

    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    if (!isCommitSha(record["commit"])) {
        return {
            jars: null,
            jarsReason:
                "The build record beside the jar does not name a commit, so this jar cannot be shown to " +
                "have come from any particular BlueMap commit.",
        };
    }

    const commit = record["commit"];
    const builtAt = typeof record["builtAt"] === "string" ? record["builtAt"] : null;
    const stampVersion = typeof record["version"] === "string" ? record["version"] : null;
    return {
        jars: {
            commit,
            shortCommit: shorten(commit),
            version: version ?? stampVersion,
            builtAt,
            jarPath,
        },
        jarsReason: null,
    };
}

/**
 * GitHub's compare status, read from the vendored pin's point of view.
 *
 * The API phrases `compare/<base>...<head>` from the head's side, so `ahead` there means the
 * release is ahead of us, which is us being behind. Inverting it in one named function rather
 * than at each call site is the difference between a report that is wrong in one place and one
 * that is wrong everywhere, and an inverted comparison reads perfectly plausibly either way.
 */
export function classifyComparison(status: string): BlueMapComparison {
    switch (status) {
        case "ahead":
            return "behind";
        case "behind":
            return "ahead";
        case "diverged":
            return "diverged";
        default:
            return "level";
    }
}

/** The one network shape this module needs, so a test can answer it without a network. */
export type FetchJson = (url: string) => Promise<unknown>;

const nodeFetchJson: FetchJson = async (url) => {
    const response = await fetch(url, {
        headers: {
            accept: "application/vnd.github+json",
            // Named so a rate-limit investigation on GitHub's side can tell who is asking.
            "user-agent": "worldlens",
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub answered ${String(response.status)} for ${url}`);
    }
    return response.json();
};

function stringField(value: unknown, field: string): string | null {
    if (typeof value !== "object" || value === null) return null;
    const found = (value as Record<string, unknown>)[field];
    return typeof found === "string" ? found : null;
}

function numberField(value: unknown, field: string): number {
    if (typeof value !== "object" || value === null) return 0;
    const found = (value as Record<string, unknown>)[field];
    return typeof found === "number" && Number.isFinite(found) ? found : 0;
}

/**
 * The newest upstream release, and where the vendored pin sits relative to it.
 *
 * Releases rather than the default branch, deliberately, and the reasoning is in
 * `docs/bluemap-upstream.md`: the default branch moves several times a week with work that is
 * mid-flight, so measuring against it would report this installation as permanently behind and
 * teach everybody to ignore the number. A release is a point upstream has chosen to stand
 * behind, so being behind one is a fact somebody can act on.
 *
 * An annotated tag is peeled to its commit before comparing. `v5.23`'s ref object is the tag
 * object, not the release commit, and reporting the former would print a hash nobody can check
 * out.
 */
export async function readUpstreamRelease(
    pinnedCommit: string,
    fetchJson: FetchJson = nodeFetchJson,
): Promise<BlueMapUpstreamRelease> {
    const api = `https://api.github.com/repos/${BLUEMAP_REPOSITORY}`;
    const release = await fetchJson(`${api}/releases/latest`);
    const tag = stringField(release, "tag_name");
    if (tag === null) throw new Error("GitHub did not name a tag for the newest release");
    const publishedAt = stringField(release, "published_at");

    const ref = await fetchJson(`${api}/git/ref/tags/${encodeURIComponent(tag)}`);
    const object = typeof ref === "object" && ref !== null ? (ref as Record<string, unknown>)["object"] : null;
    const objectSha = stringField(object, "sha");
    if (objectSha === null) throw new Error(`GitHub did not resolve the tag ${tag} to an object`);

    // A lightweight tag points straight at the commit; an annotated one points at a tag object
    // that has to be peeled. Which of the two a release used is upstream's choice, not ours.
    let commit = objectSha;
    if (stringField(object, "type") === "tag") {
        const tagObject = await fetchJson(`${api}/git/tags/${objectSha}`);
        const peeled = stringField(
            typeof tagObject === "object" && tagObject !== null
                ? (tagObject as Record<string, unknown>)["object"]
                : null,
            "sha",
        );
        if (peeled === null) throw new Error(`GitHub did not peel the annotated tag ${tag} to a commit`);
        commit = peeled;
    }

    const comparison = await fetchJson(`${api}/compare/${pinnedCommit}...${commit}`);
    /*
     * No status means the question was never answered, and that is thrown rather than defaulted.
     *
     * Defaulting to "identical" here read as harmless and was the one mistake this whole module
     * exists to avoid: an unrecognised status falls through `classifyComparison` to "level", so a
     * body with no status at all - a rewritten response, a future change to the API's shape -
     * rendered the settings row as "These jars were built from the newest BlueMap release.
     * Nothing to do." That is an up-to-date verdict established from a field nobody read. Throwing
     * hands it to the caller's own catch, which says plainly that GitHub could not be asked and
     * that this is not the same as being up to date. `scripts/check-bluemap-upstream.mjs` already
     * refuses the same shape for the same reason.
     */
    const status = stringField(comparison, "status");
    if (status === null) {
        throw new Error("GitHub's comparison returned no usable status");
    }
    return {
        ref: tag,
        commit,
        shortCommit: shorten(commit),
        publishedAt,
        comparison: classifyComparison(status),
        // GitHub's own field names are head-relative too: `ahead_by` counts commits the head
        // has that the base does not, which from the pin's side is how far behind it is.
        commitsBehind: numberField(comparison, "ahead_by"),
        commitsAhead: numberField(comparison, "behind_by"),
    };
}

/** The local half alone, which is what opening the settings screen asks for. */
export function localSourceReport(options: JarProvenanceOptions = {}): BlueMapSourceReport {
    const local = readJarProvenance(options);
    return {
        jars: local.jars,
        jarsReason: local.jarsReason,
        upstream: null,
        upstreamReason: "Upstream has not been checked in this session yet.",
        checkedAt: new Date().toISOString(),
    };
}

/**
 * Both halves, which is what the Check now button asks for.
 *
 * A failed upstream check keeps whatever the local half found. The two are independent facts
 * and one of them being unavailable is never a reason to stop reporting the other.
 */
export async function checkSourceReport(
    options: JarProvenanceOptions & { readonly fetchJson?: FetchJson } = {},
): Promise<BlueMapSourceReport> {
    const local = readJarProvenance(options);
    const checkedAt = new Date().toISOString();

    if (local.jars === null) {
        return {
            jars: null,
            jarsReason: local.jarsReason,
            upstream: null,
            upstreamReason:
                "There is no recorded commit for these jars, so there is nothing to compare an upstream " +
                "release against.",
            checkedAt,
        };
    }

    try {
        const upstream = await readUpstreamRelease(local.jars.commit, options.fetchJson);
        return { jars: local.jars, jarsReason: null, upstream, upstreamReason: null, checkedAt };
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            jars: local.jars,
            jarsReason: null,
            upstream: null,
            // Phrased so it can never be mistaken for the up-to-date answer, which is the one
            // failure this section exists to avoid.
            upstreamReason:
                "GitHub could not be asked, so whether a newer BlueMap release exists is unknown. " +
                "This is not the same as being up to date. " + detail,
            checkedAt,
        };
    }
}
