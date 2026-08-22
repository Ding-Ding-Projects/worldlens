/**
 * The one place a path is checked before it reaches a machine.
 *
 * Every file call on every transport funnels through `resolveInScope` first. That is the
 * whole design: three implementations reaching three different machines, one function
 * deciding what they are allowed to touch. Spread the same check across `localProcess.ts`,
 * `localDocker.ts` and `sshDocker.ts` and it becomes three checks that agree today and
 * drift apart the first time one of them is fixed - and the one that drifts is the one
 * running as root inside somebody's production container over SSH.
 *
 * A path that escapes is REFUSED, never clamped. Clamping turns a caller bug into a write
 * at a different path than the caller asked for, which is worse than the error: the caller
 * carries on believing it wrote `plugins/EssentialsX/config.yml` while the bytes landed
 * somewhere else entirely, and nothing says so.
 *
 * Resolution here is purely lexical and does not touch the filesystem, for two reasons.
 * The path may live inside a container this process cannot see, so there is nothing local
 * to stat. And a check that resolves symlinks before comparing has already lost: `realpath`
 * follows existing link components, so the ancestor walk then inspects the *resolved*
 * destination and never sees the link that redirected it. Symlinks are handled by refusing
 * to follow them at the transport layer, not by resolving them here.
 */

import { fail, ok, type Answer } from "./types.js";

/** Container paths are POSIX, and a server root is normalised to POSIX before comparison. */
const SEPARATOR = "/";

/**
 * Characters that must never appear in a path we are about to hand to a machine.
 *
 * A NUL truncates the path in most C APIs, so `world/level.dat\0.txt` is written as
 * `world/level.dat`. A newline or carriage return can forge an extra argument or an extra
 * line in anything that parses output line by line - `docker` output included.
 */
const FORBIDDEN = /[\0\r\n]/;

export interface ScopeOptions {
    /**
     * The server root. Everything permitted lives at or under this.
     */
    readonly root: string;
    /**
     * Directories, relative to `root`, that a write is allowed to land in.
     *
     * Empty means the whole of `root` is writable, which is right for a server WorldLens
     * created. An adopted container narrows it to exactly what the user consented to, and
     * the narrowing is enforced here rather than remembered by each caller.
     */
    readonly writeScope?: readonly string[];
}

export interface ResolvedPath {
    /** Absolute POSIX path, safe to hand to a transport. */
    readonly absolute: string;
    /** The same path relative to `root`, with no leading separator. */
    readonly relative: string;
}

/** Normalises a root into an absolute path with forward slashes and no trailing separator. */
export function normaliseRoot(root: string): string {
    const posix = root.replace(/\\/g, SEPARATOR);
    const trimmed = posix.replace(/\/+$/, "");
    return trimmed === "" ? SEPARATOR : trimmed;
}

/**
 * Splits a root into the part that anchors it and the segments beneath.
 *
 * Two kinds of root reach this. A container path is POSIX (`/data`), and a local server
 * folder on Windows is drive-rooted (`C:/Users/.../servers/paper`). They have to be kept
 * apart, because rebuilding an absolute path by pasting a separator on the front turns
 * `C:/servers/paper` into `/C:/servers/paper`, which no Windows API will open.
 *
 * That is not a hypothetical: the local transport's own tests run against a real temporary
 * directory, and every file operation failed on exactly this while the out-of-scope
 * refusals kept passing - the refusals never needed to rebuild a usable path.
 */
function splitRoot(root: string): { readonly prefix: string; readonly segments: string[] } | null {
    const drive = /^([a-zA-Z]:)(\/|$)/.exec(root);
    const drivePrefix = drive?.[1];
    if (drivePrefix !== undefined) {
        const rest = root.slice(drivePrefix.length);
        const segments = collapse(rest.split(SEPARATOR));
        return segments === null ? null : { prefix: drivePrefix, segments };
    }
    const segments = collapse(root.split(SEPARATOR));
    return segments === null ? null : { prefix: "", segments };
}

/**
 * Collapses `.` and `..` without consulting the filesystem.
 *
 * Returns null when the path climbs above its own start, which is the case the caller must
 * refuse. Doing this by counting rather than by string matching is what makes
 * `a/../../b`, `a/b/../../..`, and a hundred `..` segments all fall out the same way.
 */
function collapse(segments: readonly string[]): string[] | null {
    const out: string[] = [];
    for (const segment of segments) {
        if (segment === "" || segment === ".") continue;
        if (segment !== "..") {
            out.push(segment);
            continue;
        }
        if (out.length === 0) return null;
        out.pop();
    }
    return out;
}

/**
 * Decides whether `candidate` is inside `root`, and where.
 *
 * `candidate` may be relative (resolved against `root`) or absolute (required to be at or
 * under `root`). Either way the answer is a path that is definitely inside, or a refusal.
 */
export function resolveInScope(candidate: string, options: ScopeOptions): Answer<ResolvedPath> {
    if (typeof candidate !== "string" || candidate === "") {
        return fail("invalid-request", "A path is required.");
    }
    if (FORBIDDEN.test(candidate)) {
        return fail("invalid-request", "That path contains a character that is not allowed in a file name.");
    }

    const root = normaliseRoot(options.root);
    const posix = candidate.replace(/\\/g, SEPARATOR);

    const parsedRoot = splitRoot(root);
    if (parsedRoot === null) {
        return fail("invalid-request", "The server root is not a usable path.");
    }

    // A UNC share is always somewhere else. There is no root this could be inside of, and
    // pasting it onto one would produce a path pointing at a machine nobody asked for.
    if (posix.startsWith("//")) {
        return fail("out-of-scope", "That path points at a network share, which is outside this server.");
    }

    const candidateDrive = /^([a-zA-Z]:)(\/|$)/.exec(posix)?.[1];
    let segments: string[];

    if (candidateDrive !== undefined) {
        // Drive-rooted input is allowed only when it is the SAME drive as the root. A
        // different letter is a different disk, and comparing case-insensitively matters
        // because Windows treats `c:` and `C:` as one drive while string equality does not.
        if (candidateDrive.toLowerCase() !== parsedRoot.prefix.toLowerCase()) {
            return fail("out-of-scope", "That path points at another drive, which is outside this server.");
        }
        const collapsedInput = collapse(posix.slice(candidateDrive.length).split(SEPARATOR));
        if (collapsedInput === null) return fail("out-of-scope", "That path climbs above the server folder.");
        segments = collapsedInput;
    } else if (posix.startsWith(SEPARATOR)) {
        const collapsedInput = collapse(posix.split(SEPARATOR));
        if (collapsedInput === null) return fail("out-of-scope", "That path climbs above the server folder.");
        segments = collapsedInput;
    } else {
        const collapsedInput = collapse([...parsedRoot.segments, ...posix.split(SEPARATOR)]);
        if (collapsedInput === null) return fail("out-of-scope", "That path climbs above the server folder.");
        segments = collapsedInput;
    }

    // Inside means: starts with every segment of the root, segment by segment. Comparing
    // strings with `startsWith` instead would accept `/srv/minecraft-other` as being inside
    // `/srv/minecraft`, because the prefix matches and the boundary is not a separator.
    const rootSegments = parsedRoot.segments;
    if (segments.length < rootSegments.length) {
        return fail("out-of-scope", "That path is outside the server folder.");
    }
    for (let index = 0; index < rootSegments.length; index += 1) {
        if (segments[index] !== rootSegments[index]) {
            return fail("out-of-scope", "That path is outside the server folder.");
        }
    }

    const relative = segments.slice(rootSegments.length).join(SEPARATOR);
    const absolute = `${parsedRoot.prefix}${SEPARATOR}${segments.join(SEPARATOR)}`;
    return ok({ absolute, relative });
}

/**
 * The same check, plus the narrower question of whether this path may be *written*.
 *
 * Kept separate from `resolveInScope` so that reading and writing cannot be confused for
 * one another at a call site. An adopted container is routinely readable everywhere under
 * its root and writable in two directories, and a function that answered both questions at
 * once would make that distinction invisible.
 */
export function resolveForWrite(candidate: string, options: ScopeOptions): Answer<ResolvedPath> {
    const resolved = resolveInScope(candidate, options);
    if (!resolved.ok) return resolved;

    const scope = options.writeScope ?? [];
    if (scope.length === 0) return resolved;

    const relative = resolved.value.relative;
    for (const entry of scope) {
        const prefix = entry.replace(/\\/g, SEPARATOR).replace(/^\/+|\/+$/g, "");
        if (prefix === "") return resolved;
        if (relative === prefix) return resolved;
        if (relative.startsWith(`${prefix}${SEPARATOR}`)) return resolved;
    }

    return fail(
        "out-of-scope",
        "This server has not been given permission to write there.",
        `Writable: ${scope.join(", ")}`,
    );
}
