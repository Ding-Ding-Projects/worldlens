/**
 * Refuses to photograph a build that is older than the code.
 *
 * The identical trap `packages/app/test/freshBundle.ts` guards against, and for the identical
 * reason: what the capture actually shows is a *built* bundle, and this package's own main/preload
 * build (`node build.mjs`) is a completely different command from the one that builds the renderer
 * it serves (`packages/ui`'s own `vite build`). Editing a `.vue` file under `kid/`, rebuilding only
 * this package, and re-running the capture would photograph the *previous* interface, silently, with
 * every capture "succeeding" - which is precisely how that bug's own history reads: a fix captured
 * and looking unchanged, twice, before anyone thought to check the timestamps instead of the pixels.
 *
 * Checked here, before Electron is ever launched, rather than left to be noticed by eye.
 */

import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** `packages/kid-check/test` -> `packages/` */
const packages = join(here, "..", "..");

interface Built {
    /** For the message: what a person calls this. */
    readonly what: string;
    readonly sources: string;
    readonly output: string;
    /** What to run when it is stale. */
    readonly command: string;
}

const BUILT: readonly Built[] = [
    {
        what: "the user interface (every kid surface this harness photographs)",
        sources: join(packages, "ui", "src"),
        output: join(packages, "ui", "dist"),
        command: "pnpm --filter @worldlens/ui run build",
    },
    {
        what: "the kid-check main process",
        sources: join(packages, "kid-check", "src", "main"),
        output: join(packages, "kid-check", "dist", "main"),
        command: "pnpm --filter @worldlens/kid-check run build",
    },
    {
        what: "the kid-check preload bridge",
        sources: join(packages, "kid-check", "src", "preload"),
        output: join(packages, "kid-check", "dist", "preload"),
        command: "pnpm --filter @worldlens/kid-check run build",
    },
];

/**
 * A test file changing does not change what the application renders. Excluding `.test.ts` here
 * matches `packages/app/test/freshBundle.ts`'s own `ships()` exactly, for the same reason: without
 * it this would cry wolf on every unit-test edit under `packages/ui/src` until somebody disabled it.
 */
function ships(name: string): boolean {
    return !name.endsWith(".test.ts") && !name.endsWith(".test.tsx") && !name.endsWith(".spec.ts");
}

interface Newest {
    readonly at: number;
    readonly file: string;
}

async function newestUnder(directory: string, accept: (name: string) => boolean): Promise<Newest | null> {
    let best: Newest | null = null;
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        // Missing entirely - reported by the caller as "never built", which is a clearer thing to
        // say than "no files found".
        return null;
    }

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            const deeper = await newestUnder(path, accept);
            if (deeper !== null && (best === null || deeper.at > best.at)) best = deeper;
            continue;
        }
        if (!entry.isFile() || !accept(entry.name)) continue;
        const info = await stat(path);
        if (best === null || info.mtimeMs > best.at) best = { at: info.mtimeMs, file: path };
    }
    return best;
}

function ago(milliseconds: number): string {
    const minutes = Math.round(milliseconds / 60_000);
    if (minutes < 1) return "less than a minute";
    if (minutes < 120) return `${String(minutes)} minutes`;
    return `${String(Math.round(minutes / 60))} hours`;
}

export default async function assertBuiltFromCurrentSource(): Promise<void> {
    const complaints: string[] = [];

    for (const target of BUILT) {
        const source = await newestUnder(target.sources, ships);
        const built = await newestUnder(target.output, () => true);

        if (built === null) {
            complaints.push(
                `${target.what} has never been built.\n` +
                    `    expected output in: ${target.output}\n` +
                    `    build it with:      ${target.command}`,
            );
            continue;
        }
        if (source === null) continue;

        if (source.at > built.at) {
            complaints.push(
                `${target.what} was built ${ago(source.at - built.at)} before its sources were last changed.\n` +
                    `    newest source: ${source.file}\n` +
                    `    newest output: ${built.file}\n` +
                    `    rebuild with:  ${target.command}`,
            );
        }
    }

    if (complaints.length === 0) return;

    throw new Error(
        "The captures would be of an older build than the code being checked.\n\n" +
            complaints.map((complaint) => `  - ${complaint}`).join("\n\n") +
            "\n\nThis is checked because it is invisible otherwise: a stale bundle produces " +
            "captures that pass\nwhile showing the previous version of the interface, so a " +
            "correct fix looks like it did nothing.\n",
    );
}
