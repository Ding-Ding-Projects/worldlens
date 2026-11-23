/**
 * What stands between an edit and a corrupted world: the live-world check, the backup, and
 * the atomic write.
 */

import { copyFile, mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

/** Answers "is this world folder in use right now", with a reason fit to show the person. */
export type WorldInUseCheck = (projectDir: string) => Promise<string | null> | string | null;

const LOCK_ERRORS = new Set(["EBUSY", "EPERM", "EACCES", "EAGAIN"]);

/**
 * Looks at `session.lock`.
 *
 * Minecraft holds that file open for as long as the world is loaded. On Windows the hold is
 * a mandatory lock, so even reading a byte fails while a server has the world; elsewhere the
 * lock is advisory and a read succeeds. This probe therefore catches the Windows case and
 * is only half the story, which is why the application also passes the folders its own
 * managed servers are running in (see {@link combineWorldChecks}).
 */
export async function probeSessionLock(projectDir: string): Promise<string | null> {
    const lock = join(projectDir, "session.lock");
    let handle;
    try {
        handle = await open(lock, "r");
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        return LOCK_ERRORS.has(code) ? "A server has this world open (session.lock is locked)." : null;
    }
    try {
        await handle.read(Buffer.alloc(1), 0, 1, 0);
        return null;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        return LOCK_ERRORS.has(code) ? "A server has this world open (session.lock is locked)." : null;
    } finally {
        await handle.close().catch(() => undefined);
    }
}

function inside(parent: string, child: string): boolean {
    const a = resolve(parent).toLowerCase();
    const b = resolve(child).toLowerCase();
    return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
}

/**
 * Combines the lock probe with the folders the application's own running servers use.
 * A world is refused when it sits inside, or contains, a running server's folder.
 */
export function combineWorldChecks(runningServerFolders: () => readonly string[] | Promise<readonly string[]>): WorldInUseCheck {
    return async (projectDir) => {
        for (const folder of await runningServerFolders()) {
            if (inside(folder, projectDir) || inside(projectDir, folder))
                return "A managed server is running this world. Stop the server before saving, so the file is not overwritten under it.";
        }
        return probeSessionLock(projectDir);
    };
}

/** Writes through a temporary file in the same folder and renames it over the target. */
export async function writeFileAtomically(target: string, bytes: Uint8Array): Promise<void> {
    const temporary = join(dirname(target), `.${basename(target)}.worldlens-${process.pid}-${Date.now()}.tmp`);
    try {
        const handle = await open(temporary, "w");
        try {
            await handle.writeFile(bytes);
            await handle.sync();
        } finally {
            await handle.close();
        }
        await rename(temporary, target);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}

const KEEP_BACKUPS = 10;

/** Copies `file` into `backupDirectory` with a timestamp and trims old copies. Returns the copy's path. */
export async function backUpFile(file: string, backupDirectory: string, label: string): Promise<string | null> {
    const exists = await stat(file).then(
        () => true,
        () => false,
    );
    if (!exists) return null;
    await mkdir(backupDirectory, { recursive: true });
    const safe = label.replace(/[^\w.-]+/gu, "_");
    const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
    const destination = join(backupDirectory, `${stamp}-${safe}`);
    await copyFile(file, destination);
    const siblings = (await readdir(backupDirectory)).filter((name) => name.endsWith(`-${safe}`)).sort();
    for (const stale of siblings.slice(0, Math.max(0, siblings.length - KEEP_BACKUPS))) await rm(join(backupDirectory, stale), { force: true });
    return destination;
}

export async function fileSignature(file: string): Promise<string> {
    const info = await stat(file);
    return `${info.size}:${Math.floor(info.mtimeMs)}`;
}
