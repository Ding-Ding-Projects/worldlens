import { reactive, shallowRef } from "vue";
import { CoreProtectDb, type CoreProtectMeta } from "./coreprotectDb.js";
import { DEFAULT_FILTER, advance, happenedBy, type BlockChange, type ChangeFilter } from "./coreprotectModel.js";

/**
 * The inspector's state at shell lifetime, so the highlight layer and the replay keep running
 * on the map while the inspector tab is closed. The database itself is held only in memory.
 */

/** A file the inspector can read again, for watching a database a server is still writing. */
interface Source {
    readonly name: string;
    read(): Promise<{ bytes: Uint8Array; modified: number }>;
    readonly rereadable: boolean;
}

export const coreprotect = reactive({
    fileName: null as string | null,
    meta: null as CoreProtectMeta | null,
    filter: { ...DEFAULT_FILTER } as ChangeFilter,
    changes: [] as readonly BlockChange[],
    more: false,
    loading: false,
    error: null as string | null,
    showOnMap: true,
    /** How long a change stays bright, in database seconds. */
    fadeSeconds: 3600,
    replay: { playing: false, cursor: null as number | null, speed: 60 },
    watching: false,
    lastRead: null as number | null,
    /** The change the inspector last focused, for the teleport action. */
    focus: null as BlockChange | null,
});

const db = shallowRef<CoreProtectDb | null>(null);
let source: Source | null = null;
let modified = 0;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let playTimer: ReturnType<typeof setInterval> | null = null;

/** The changes the map shows now: all of them, or those that have happened by the replay cursor. */
export function visibleChanges(): readonly BlockChange[] {
    return coreprotect.replay.cursor === null ? coreprotect.changes : happenedBy(coreprotect.changes, coreprotect.replay.cursor);
}

/** "Now" for fading: the replay cursor while replaying, the newest change otherwise. */
export function clockNow(): number {
    return coreprotect.replay.cursor ?? coreprotect.meta?.last ?? Math.floor(Date.now() / 1000);
}

export function requery(): void {
    if (!db.value) return;
    try {
        const result = db.value.query(coreprotect.filter);
        coreprotect.changes = Object.freeze(result.changes);
        coreprotect.more = result.more;
        coreprotect.error = null;
    } catch (error) {
        coreprotect.error = error instanceof Error ? error.message : String(error);
    }
}

async function load(next: Source, keepFilter: boolean): Promise<void> {
    coreprotect.loading = true;
    try {
        const read = await next.read();
        const opened = await CoreProtectDb.open(read.bytes);
        db.value?.close();
        db.value = opened;
        source = next;
        modified = read.modified;
        coreprotect.fileName = next.name;
        coreprotect.meta = opened.meta;
        coreprotect.lastRead = Date.now();
        if (!keepFilter) {
            const world = opened.meta.worlds.includes("world") ? "world" : (opened.meta.worlds[0] ?? null);
            // Start on the last day of activity, which is usually what someone opens this for.
            const to = opened.meta.last;
            coreprotect.filter = { ...DEFAULT_FILTER, world, from: to === null ? null : to - 86400, to };
            coreprotect.replay.cursor = null;
            coreprotect.replay.playing = false;
        } else if (coreprotect.filter.to !== null && opened.meta.last !== null && coreprotect.filter.to < opened.meta.last && followingLive()) {
            // Following live: widen the window to include what arrived.
            coreprotect.filter = { ...coreprotect.filter, to: opened.meta.last };
        }
        coreprotect.error = null;
        requery();
    } catch (error) {
        coreprotect.error = error instanceof Error ? error.message : String(error);
    } finally {
        coreprotect.loading = false;
    }
}

/** True while the time window ends at the newest change, so new rows extend it. */
function followingLive(): boolean {
    return coreprotect.watching;
}

export async function openFile(file: File): Promise<void> {
    stopWatching();
    await load({ name: file.name, rereadable: false, read: async () => ({ bytes: new Uint8Array(await file.arrayBuffer()), modified: file.lastModified }) }, false);
}

interface PickerHandle {
    readonly name: string;
    getFile(): Promise<File>;
}

/** Whether this window can keep a file open to read it again (Chromium's file system access). */
export const canWatch = (): boolean => typeof (globalThis as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === "function";

/** Opens a file through the system picker with a handle that can be read again for watching. */
export async function pickAndOpen(): Promise<boolean> {
    const picker = (globalThis as unknown as { showOpenFilePicker?: (o: unknown) => Promise<PickerHandle[]> }).showOpenFilePicker;
    if (!picker) return false;
    let handle: PickerHandle | undefined;
    try {
        [handle] = await picker({ multiple: false, types: [{ description: "CoreProtect database", accept: { "application/vnd.sqlite3": [".db", ".sqlite", ".sqlite3"] } }] });
    } catch {
        return true; // cancelled
    }
    if (!handle) return true;
    const h = handle;
    stopWatching();
    await load(
        {
            name: h.name,
            rereadable: true,
            read: async () => {
                const file = await h.getFile();
                return { bytes: new Uint8Array(await file.arrayBuffer()), modified: file.lastModified };
            },
        },
        false,
    );
    return true;
}

export const canRereadSource = (): boolean => source?.rereadable === true;

/** Reads the file again every few seconds and shows new changes as they are written. */
export function startWatching(intervalMs = 5000): void {
    if (!source?.rereadable || watchTimer) return;
    coreprotect.watching = true;
    watchTimer = setInterval(() => {
        const current = source;
        if (!current || coreprotect.loading) return;
        void current.read().then(async (read) => {
            if (read.modified === modified) {
                coreprotect.lastRead = Date.now();
                return;
            }
            await load({ ...current, read: async () => read }, true);
            source = current;
        });
    }, intervalMs);
}

export function stopWatching(): void {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    coreprotect.watching = false;
}

/** Plays the filtered changes back in time order at `speed` database seconds per second. */
export function play(): void {
    const first = coreprotect.changes[0]?.time;
    const last = coreprotect.changes.at(-1)?.time;
    if (first === undefined || last === undefined) return;
    if (coreprotect.replay.cursor === null || coreprotect.replay.cursor >= last) coreprotect.replay.cursor = first - 1;
    coreprotect.replay.playing = true;
    let then = performance.now();
    playTimer ??= setInterval(() => {
        const now = performance.now();
        const end = coreprotect.changes.at(-1)?.time ?? 0;
        coreprotect.replay.cursor = advance(coreprotect.replay.cursor ?? end, now - then, coreprotect.replay.speed, end);
        then = now;
        if (coreprotect.replay.cursor >= end) pause();
    }, 250);
}

export function pause(): void {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    coreprotect.replay.playing = false;
}

/** Leaves replay and shows every filtered change again. */
export function stopReplay(): void {
    pause();
    coreprotect.replay.cursor = null;
}

export function closeDatabase(): void {
    stopWatching();
    stopReplay();
    db.value?.close();
    db.value = null;
    source = null;
    Object.assign(coreprotect, { fileName: null, meta: null, changes: [], more: false, error: null, focus: null, lastRead: null });
}
