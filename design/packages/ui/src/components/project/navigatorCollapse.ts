/**
 * Whether the project editor's structure column is collapsed, remembered between sessions.
 *
 * The editor is three columns - the project tree, the settings for whatever is selected in it,
 * and the consequences of saving - and the middle one is the one somebody is actually reading.
 * The tree earns its place while you are moving between maps and storages and stops earning it
 * the moment you settle into a screen full of settings, so it collapses, and the settings take
 * the width back.
 *
 * It is stored rather than reset per launch for the ordinary reason: somebody who collapses it
 * is telling you how they work, and asking again every launch is not remembering.
 *
 * `storage` is injectable so a test can supply its own, and `null` means "keep nothing", which
 * is what a test wants when it is asserting the default rather than the persistence.
 */

/** The one key. Prefixed like every other of this application's keys. */
export const NAVIGATOR_COLLAPSE_KEY = "worldlens-project-editor-navigator-collapsed";

/**
 * `undefined` means "use `localStorage`". A missing or unreadable store is not an error: the
 * editor opens with the tree showing, which is the safe direction - a collapsed tree that
 * nobody asked for reads as a missing feature.
 */
function resolve(storage: Storage | null | undefined): Storage | null {
    if (storage === null) return null;
    if (storage !== undefined) return storage;
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        // A locked-down or partitioned store throws on access rather than returning null.
        return null;
    }
}

/** Reads the remembered state. Anything that is not exactly the stored `"true"` is false. */
export function readNavigatorCollapsed(storage?: Storage | null): boolean {
    const store = resolve(storage);
    if (store === null) return false;
    try {
        return store.getItem(NAVIGATOR_COLLAPSE_KEY) === "true";
    } catch {
        return false;
    }
}

/**
 * Records the state. A failed write is deliberately silent: the collapse itself has already
 * happened in the interface, and an error notice about a preference nobody can save is worse
 * than the preference not surviving a restart.
 */
export function writeNavigatorCollapsed(collapsed: boolean, storage?: Storage | null): void {
    const store = resolve(storage);
    if (store === null) return;
    try {
        store.setItem(NAVIGATOR_COLLAPSE_KEY, collapsed ? "true" : "false");
    } catch {
        /* nothing to do, and nothing worth interrupting anybody over */
    }
}
