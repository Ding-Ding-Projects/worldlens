/**
 * The project's whole version history, carried inside the one file the project is.
 *
 * The history engine in `../history/` keeps a real, isolated git repository beside the
 * application's own data - never inside the world - and that placement is right for the
 * machine the edits happen on. What it cannot do is travel: copy `worldlens.project.json`
 * to another computer, or restore it from a backup, and every revision stays behind.
 *
 * This module closes that gap without moving the repository. After each successful save,
 * the repository is exported as a git *bundle* - git's own single-file transport format,
 * containing every ref and every object - and that bundle is embedded, base64-encoded,
 * under the `history` key of the project file itself. The file becomes its own archive:
 * one JSON document that carries both the current state and every state it has ever been
 * saved in.
 *
 * On open, the direction reverses. A project file arriving with an embedded bundle on a
 * machine whose repository for that world is empty seeds the repository *from* the bundle,
 * so the History tab shows the full record the file brought with it rather than starting
 * from nothing.
 *
 * ## The bundle never contains itself
 *
 * The snapshot the history records is the *canonical* project text - the serializer's own
 * output, which spells only the keys it knows and therefore never includes `history`. The
 * embedded bundle is bookkeeping wrapped around that canonical text at write time, exactly
 * like a checksum trailer: it rides in the file without being part of what the file means.
 * Were the bundle part of the snapshot, every save would re-record the previous bundle
 * inside the next one, and the file would grow with the square of its own history.
 *
 * ## A failed embed never fails the save
 *
 * The same clause `save.ts` already holds for a failed history write. By the time an embed
 * is attempted the project is saved and its revision is recorded; the bundle is a copy of
 * that record, and a copy that could veto the original would have the priorities backwards.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureRepository, listRevisions, probeGit, repoGit, runGit } from "../history/index.js";

import {
    projectHistoryRoot,
    projectRepositoryPath,
    type ProjectHistoryOptions,
} from "./history.js";

/** The one embedded-history format this build writes and understands. */
export const EMBEDDED_HISTORY_FORMAT = "git-bundle-v1";

/** What rides under the project file's `history` key. */
export interface EmbeddedProjectHistory {
    readonly format: typeof EMBEDDED_HISTORY_FORMAT;
    /** A complete `git bundle` of the project's history repository, base64-encoded. */
    readonly bundle: string;
}

export type EmbedOutcome =
    | { readonly ok: true; readonly history: EmbeddedProjectHistory }
    | { readonly ok: false; readonly message: string };

export type SeedOutcome =
    | { readonly ok: true; readonly seeded: boolean; readonly message: string }
    | { readonly ok: false; readonly message: string };

/** The embedded record parsed off a raw project object, or null when there is none. */
export function readEmbeddedHistory(raw: unknown): EmbeddedProjectHistory | null {
    if (typeof raw !== "object" || raw === null) return null;
    const record = (raw as { history?: unknown }).history;
    if (typeof record !== "object" || record === null) return null;
    const candidate = record as { format?: unknown; bundle?: unknown };
    if (candidate.format !== EMBEDDED_HISTORY_FORMAT) return null;
    if (typeof candidate.bundle !== "string" || candidate.bundle === "") return null;
    return { format: EMBEDDED_HISTORY_FORMAT, bundle: candidate.bundle };
}

async function withRepo<T>(
    options: ProjectHistoryOptions,
    worldFolder: string,
    body: (git: ReturnType<typeof repoGit>) => Promise<T>,
    unavailable: (message: string) => T,
): Promise<T> {
    const run = options.git ?? runGit;
    const root = projectHistoryRoot(options.dataDir);
    const repository = projectRepositoryPath(options.dataDir, worldFolder);

    const availability = await probeGit(run, process.cwd());
    if (!availability.available) {
        return unavailable(availability.reason ?? "Git is unavailable.");
    }
    const git = repoGit(run, root, repository);
    const ready = await ensureRepository(git);
    if (!ready.ok) return unavailable(ready.message);
    return await body(git);
}

/**
 * Exports the world's project history as an embeddable bundle.
 *
 * `--all` because the bundle is the whole repository or it is nothing: a partial bundle
 * would seed a partial history on the next machine and present it as complete.
 */
export async function bundleProjectHistory(
    options: ProjectHistoryOptions,
    worldFolder: string,
): Promise<EmbedOutcome> {
    return withRepo(
        options,
        worldFolder,
        async (git) => {
            const revisions = await listRevisions(git, 1);
            if (revisions.length === 0) {
                return { ok: false as const, message: "The history holds no revisions yet, so there is nothing to embed." };
            }
            const scratch = await mkdtemp(join(tmpdir(), "worldlens-history-bundle-"));
            const bundlePath = join(scratch, "history.bundle");
            try {
                const bundled = await git.run(["bundle", "create", bundlePath, "--all"]);
                if (!bundled.ok) {
                    return {
                        ok: false as const,
                        message: `git bundle failed: ${bundled.stderr.trim() || bundled.stdout.trim() || `exit ${bundled.code}`}`,
                    };
                }
                const bytes = await readFile(bundlePath);
                return {
                    ok: true as const,
                    history: { format: EMBEDDED_HISTORY_FORMAT, bundle: bytes.toString("base64") },
                };
            } finally {
                await rm(scratch, { recursive: true, force: true });
            }
        },
        (message) => ({ ok: false as const, message }),
    );
}

/**
 * Seeds an empty repository from a project file's embedded bundle.
 *
 * A repository that already holds revisions is left exactly as it is: the machine's own
 * record is the authority here, and quietly merging a file's bundle into it would let a
 * stale copy of a project rewrite the history of the live one. Seeding is for the machine
 * that has nothing - a fresh install, a restored backup, a copied world.
 */
export async function seedProjectHistory(
    options: ProjectHistoryOptions,
    worldFolder: string,
    embedded: EmbeddedProjectHistory,
): Promise<SeedOutcome> {
    return withRepo(
        options,
        worldFolder,
        async (git) => {
            const revisions = await listRevisions(git, 1);
            if (revisions.length > 0) {
                return {
                    ok: true as const,
                    seeded: false,
                    message: "This machine already holds a history for the project, so the file's embedded copy was left alone.",
                };
            }
            const scratch = await mkdtemp(join(tmpdir(), "worldlens-history-seed-"));
            const bundlePath = join(scratch, "history.bundle");
            try {
                await writeFile(bundlePath, Buffer.from(embedded.bundle, "base64"));
                const verified = await git.run(["bundle", "verify", bundlePath]);
                if (!verified.ok) {
                    return {
                        ok: false as const,
                        message: `The embedded history did not verify as a git bundle: ${verified.stderr.trim() || `exit ${verified.code}`}`,
                    };
                }
                // `--update-head-ok` because the repository keeps its history branch checked
                // out and this fetch is the branch's first content; the reset right after
                // brings the work tree and index up to the head the fetch just wrote, so the
                // repository is left exactly as a local snapshot would have left it.
                const fetched = await git.run([
                    "fetch",
                    "--update-head-ok",
                    bundlePath,
                    "refs/*:refs/*",
                ]);
                if (!fetched.ok) {
                    return {
                        ok: false as const,
                        message: `Reading the embedded history failed: ${fetched.stderr.trim() || `exit ${fetched.code}`}`,
                    };
                }
                const synced = await git.run(["reset", "--hard", "HEAD"]);
                if (!synced.ok) {
                    return {
                        ok: false as const,
                        message: `The seeded history could not be checked out: ${synced.stderr.trim() || `exit ${synced.code}`}`,
                    };
                }
                return {
                    ok: true as const,
                    seeded: true,
                    message: "The project file carried its own history, and this machine's copy was seeded from it.",
                };
            } finally {
                await rm(scratch, { recursive: true, force: true });
            }
        },
        (message) => ({ ok: false as const, message }),
    );
}

/**
 * The on-disk text: the canonical serialization with the history trailer appended.
 *
 * Parsed and re-stringified rather than spliced, so the result is always valid JSON with
 * the same 4-space indentation and trailing newline the serializer promises - and `history`
 * lands last, after every key a person might read, because a page of base64 above the
 * settings would make the file unreadable to exactly the people plain JSON is for.
 */
export function withEmbeddedHistory(canonicalText: string, history: EmbeddedProjectHistory): string {
    const raw = JSON.parse(canonicalText) as Record<string, unknown>;
    delete raw["history"];
    raw["history"] = { format: history.format, bundle: history.bundle };
    return `${JSON.stringify(raw, null, 4)}\n`;
}

/**
 * The disk text as the history must see it: with the trailer stripped.
 *
 * Snapshots deliberately record raw disk text, and the one exception is the trailer this
 * module itself writes. Left in, the first save after an embed would see the trailer as an
 * outside edit, and every restore would record a phantom drift revision for bookkeeping
 * the history's own subsystem appended - the self-inclusion this module promises never
 * happens. Text that does not parse, or carries no valid trailer, passes through unchanged,
 * so a genuinely foreign file is still recorded exactly as it is.
 */
export function canonicalDiskText(text: string): string {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return text;
    }
    if (readEmbeddedHistory(raw) === null) return text;
    const record = { ...(raw as Record<string, unknown>) };
    delete record["history"];
    return `${JSON.stringify(record, null, 4)}\n`;
}
