import { isInsideRoot } from "../main/files/reveal.js";

/**
 * The folders a hosted deployment is allowed to touch, and nothing else.
 *
 * ## Why this replaces the folder picker rather than sitting beside it
 *
 * On a desktop the answer to "which folder?" is a native dialog: the person choosing already
 * has the run of the machine, so the dialog is a convenience rather than a boundary. Neither
 * half of that survives a container. There is no desktop to draw a dialog on, and the person
 * choosing is on the far side of a network from the filesystem they would be choosing from.
 *
 * So the operator declares the folders when they start the container - the same folders they
 * bind-mounted, named - and every path the application resolves is confined to them. That
 * makes the mount list two things at once, which is the neat part: the browsing surface the
 * interface offers instead of a dialog, and the boundary a request cannot argue its way past.
 *
 * ## The failure this is written against
 *
 * A symlink inside a mounted folder that points outside it. Comparing resolved strings does
 * not catch it, because the string is inside the root right up until the operating system
 * follows it. `reveal.ts` already learned this and resolves both sides through `realpath`
 * *before* comparing; this reuses its `isInsideRoot` rather than writing a second, subtly
 * different version of the same check. `mountRoots.test.ts` ports its symlink case, and it
 * has been watched fail against a naive prefix comparison before being trusted.
 */
export interface MountRoot {
    /** Stable name used in settings and in the interface. */
    readonly id: string;
    /** What a person sees. The operator's own words for the folder. */
    readonly label: string;
    /** Absolute path inside the container. */
    readonly path: string;
    /** Whether the application may write here. */
    readonly writable: boolean;
}

export type MountResolution =
    | { readonly ok: true; readonly root: MountRoot; readonly path: string }
    | { readonly ok: false; readonly reason: string };

/** Fixed at construction so tests need no real filesystem and no real symlinks. */
export interface MountRootOptions {
    readonly realPath?: (path: string) => Promise<string>;
    readonly platform?: NodeJS.Platform;
}

const defaultRealPath = async (path: string): Promise<string> => {
    const { realpath } = await import("node:fs/promises");
    return await realpath(path);
};

/** Whether an operator's declaration is usable, and what is wrong with it when it is not. */
export function validateMountRoots(roots: readonly MountRoot[]): string[] {
    const problems: string[] = [];
    const seenIds = new Set<string>();
    for (const root of roots) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(root.id))
            problems.push(
                `"${root.id}" is not a usable mount id; use lower-case letters, digits and hyphens.`,
            );
        if (seenIds.has(root.id))
            problems.push(`"${root.id}" is declared twice, and the second would shadow the first.`);
        seenIds.add(root.id);
        if (root.label.trim() === "")
            problems.push(`"${root.id}" has no label, so nobody could tell what it is.`);
        if (root.path.trim() === "") problems.push(`"${root.id}" has no path.`);
    }
    return problems;
}

export class MountRoots {
    readonly #roots: readonly MountRoot[];
    readonly #realPath: (path: string) => Promise<string>;
    readonly #platform: NodeJS.Platform | undefined;

    constructor(roots: readonly MountRoot[], options: MountRootOptions = {}) {
        this.#roots = roots;
        this.#realPath = options.realPath ?? defaultRealPath;
        this.#platform = options.platform;
    }

    /** What the interface offers instead of a folder picker. */
    list(): readonly MountRoot[] {
        return this.#roots;
    }

    /**
     * Resolve a path against the declared roots, or say why it is refused.
     *
     * `forWriting` is a separate argument rather than a property of the path because the same
     * folder is legitimately readable and not writable, and collapsing the two would mean
     * either refusing reads from a read-only mount or permitting writes to it.
     */
    async resolve(candidate: string, forWriting: boolean): Promise<MountResolution> {
        if (this.#roots.length === 0)
            return {
                ok: false,
                reason: "This deployment has no folders mounted, so there is nothing it can read or write.",
            };
        if (candidate.trim() === "") return { ok: false, reason: "No path was given." };
        // A NUL byte truncates the path at the operating-system boundary, so a string that
        // passes every check here can name a different file by the time it is opened.
        if (candidate.includes("\0"))
            return { ok: false, reason: "That path contains a character a path cannot contain." };

        let resolved: string;
        try {
            resolved = await this.#realPath(candidate);
        } catch {
            // A path that does not exist yet is legitimate - it is where a render is about to
            // write - so fall back to the nearest ancestor that does, and confine that. What
            // is never done is skipping the check because the target is absent.
            const nearest = await this.#nearestExisting(candidate);
            if (nearest === null)
                return {
                    ok: false,
                    reason: "That path could not be resolved, so it cannot be checked against the mounted folders.",
                };
            resolved = nearest;
        }

        for (const root of this.#roots) {
            let realRoot: string;
            try {
                realRoot = await this.#realPath(root.path);
            } catch {
                // A declared root that is not mounted is the operator's problem to see, not a
                // reason to fall through to a different root that happens to match.
                continue;
            }
            if (!isInsideRoot(realRoot, resolved, this.#platform)) continue;
            if (forWriting && !root.writable)
                return {
                    ok: false,
                    reason: `"${root.label}" is mounted read-only, so nothing can be written into it.`,
                };
            return { ok: true, root, path: candidate };
        }

        return {
            ok: false,
            reason:
                this.#roots.length === 1
                    ? `That path is outside "${this.#roots[0]?.label ?? ""}", the only folder this deployment can reach.`
                    : `That path is outside every folder this deployment can reach: ${this.#roots
                          .map((root) => `"${root.label}"`)
                          .join(", ")}.`,
        };
    }

    /**
     * The closest existing ancestor of a path that does not exist yet.
     *
     * Walks up rather than giving up, so that writing a new file into a mounted folder is
     * allowed while writing one into an unmounted folder is not - which is the distinction
     * that would be lost by simply permitting anything that does not exist.
     */
    async #nearestExisting(candidate: string): Promise<string | null> {
        const separator = candidate.includes("\\") ? "\\" : "/";
        const parts = candidate.split(/[\\/]+/);
        for (let depth = parts.length - 1; depth > 0; depth--) {
            const ancestor = parts.slice(0, depth).join(separator);
            if (ancestor === "") continue;
            try {
                return await this.#realPath(ancestor);
            } catch {
                continue;
            }
        }
        return null;
    }
}
