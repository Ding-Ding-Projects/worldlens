/**
 * The workflow files this application ships for CI rendering, read fresh off disk.
 *
 * `bootstrap.ts` never reads a file itself - every template it writes arrives as plain
 * text through its options, so its whole test suite runs against fakes with no filesystem
 * in sight (see `bootstrap.test.ts`). This is the one module that actually goes and gets
 * that text for the real application: all three workflow files a render or scheduled check
 * needs. A manually incremented monotonic template version provides ordering, while the
 * repository marker records exact per-file content hashes.
 *
 * ## Where the files live
 *
 * A packaged build ships them under `resourcesPath/workflows/` - see
 * `electron-builder.config.cjs`'s `extraResources` entry, which copies them there verbatim
 * from this repository's own `.github/workflows/` at build time, the same way the UI
 * bundle and the renderer jar are staged for a shipped installer. A development checkout
 * has no `resourcesPath` worth reading, so {@link loadCiWorkflowTemplates} falls back to
 * walking up from this file's own directory until it finds a `.github/workflows` folder,
 * which is always there in a checkout of this repository.
 *
 * All three files are read from the **same** directory, never one from each: a
 * `resourcesPath/workflows/` left half-populated by an interrupted build is a real failure
 * mode. A packaged build fails closed rather than falling through to checkout files; only a
 * development run may discover `.github/workflows/` from the checkout.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CiWorkflowTemplate } from "./bootstrap.js";

/**
 * Monotonic version of the managed workflow set. Increment this whenever any managed YAML
 * file changes. It is deliberately independent of a content digest: ordering numbers is
 * what lets an older installed application refuse to downgrade workflows from a newer one.
 */
export const CI_WORKFLOW_TEMPLATE_VERSION = 2;

/** Every workflow file a render or scheduled check needs, relative to `.github/workflows/`. */
export const CI_WORKFLOW_FILE_NAMES = [
    "render-world.yml",
    "render-shard-wave.yml",
    "scheduled-render.yml",
] as const;

/** How many parent directories are walked looking for a checkout's `.github/workflows`. */
const MAX_WALK_DEPTH = 12;

export class CiWorkflowTemplateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CiWorkflowTemplateError";
    }
}

export interface LoadCiWorkflowTemplatesOptions {
    /** A packaged build's own resources directory - `process.resourcesPath` in production. */
    readonly resourcesDir?: string | undefined;
    /** True only for an installed build. Packaged mode never falls back to checkout files. */
    readonly packaged?: boolean | undefined;
    /** Overridable so a test never walks the real checkout looking for `.github`. */
    readonly checkoutWorkflowsDir?: string | undefined;
}

export interface LoadedCiWorkflowTemplates {
    readonly templates: readonly CiWorkflowTemplate[];
    /** Monotonic managed-template version written to the repository marker. */
    readonly version: number;
}

/**
 * Reads the workflow files this application ships with their monotonic set version.
 *
 * Packaged mode reads only `resourcesPath/workflows/` and rejects an incomplete set.
 * Development mode reads the supplied checkout directory or finds `.github/workflows/` by
 * walking up from this module. No invocation mixes files from different directories.
 */
export async function loadCiWorkflowTemplates(
    options: LoadCiWorkflowTemplatesOptions = {},
): Promise<LoadedCiWorkflowTemplates> {
    const candidates: string[] = [];
    if (options.packaged === true) {
        if (options.resourcesDir === undefined) {
            throw new CiWorkflowTemplateError(
                "This packaged build did not provide a resources directory, so its managed workflow set cannot be trusted.",
            );
        }
        candidates.push(join(options.resourcesDir, "workflows"));
    } else if (options.checkoutWorkflowsDir !== undefined) {
        candidates.push(options.checkoutWorkflowsDir);
    } else {
        const found = await findCheckoutWorkflowsDir();
        if (found !== null) candidates.push(found);
    }

    const problems: string[] = [];
    for (const dir of candidates) {
        try {
            const templates: CiWorkflowTemplate[] = [];
            for (const name of CI_WORKFLOW_FILE_NAMES) {
                const content = await readFile(join(dir, name), "utf8");
                templates.push({ path: `.github/workflows/${name}`, content });
            }
            return { templates, version: CI_WORKFLOW_TEMPLATE_VERSION };
        } catch (error) {
            problems.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const mode = options.packaged === true ? "packaged" : "development";
    throw new CiWorkflowTemplateError(
        `The complete managed workflow set for this ${mode} build could not be read, so no repository was changed.` +
            `${problems.length === 0 ? "" : ` Tried: ${problems.join("; ")}`}`,
    );
}

/** Walks up from this module's own directory looking for `.github/workflows`. */
async function findCheckoutWorkflowsDir(): Promise<string | null> {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth += 1) {
        const candidate = join(dir, ".github", "workflows");
        try {
            await Promise.all(
                CI_WORKFLOW_FILE_NAMES.map((name) => readFile(join(candidate, name), "utf8")),
            );
            return candidate;
        } catch {
            // Not here; keep walking up towards the repository root.
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}
