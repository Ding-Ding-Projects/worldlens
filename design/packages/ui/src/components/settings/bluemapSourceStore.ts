/**
 * The one copy of "which BlueMap is in this installation" the interface holds.
 *
 * Module-level and reactive, the same shape `vocabularyStore.ts` uses, for a reason specific
 * to this section: two things read the answer and they must not disagree. The row renders it,
 * and the settings surface's own search bar puts its facts into the haystack so that typing a
 * commit hash or a version finds this section. A component-local ref would leave the search
 * matching whatever was true when the surface opened.
 *
 * Nothing here decides anything. The main process reads the build record beside the jars and
 * asks GitHub; this file holds what it answered, plus the two flags a button needs (in
 * flight, and whether there is anything to press at all).
 */

import { reactive } from "vue";
import { blueMapSourceHostFrom, type BlueMapSourceHost, type BlueMapSourceReport } from "./bluemapSourceBridge.js";

interface BlueMapSourceState {
    /** Null before the first read has come back, and in a build with no bridge at all. */
    report: BlueMapSourceReport | null;
    /** True while a read or a check is in flight, so the button can disable itself. */
    busy: boolean;
    /**
     * False in a browser tab and under Vitest, where there is no main process to ask. The row
     * says so rather than drawing a Check now button that cannot do anything.
     */
    available: boolean;
}

export const blueMapSourceStore = reactive<BlueMapSourceState>({
    report: null,
    busy: false,
    available: false,
});

let host: BlueMapSourceHost | null = null;

/**
 * Points the store at a host.
 *
 * Called by the row on mount with the real bridge, and by a test with a stand-in. Resolving
 * `window` here rather than at module load keeps this file importable from a Node test, where
 * touching `window` at import time would throw before any test had run.
 */
export function setBlueMapSourceHost(next: BlueMapSourceHost | null): void {
    host = next;
    blueMapSourceStore.available = next !== null;
}

/** The desktop shell's own bridge, when there is one. */
export function attachBlueMapSourceBridge(): void {
    setBlueMapSourceHost(blueMapSourceHostFrom(typeof window === "undefined" ? null : window.worldlens));
}

async function run(request: (ready: BlueMapSourceHost) => Promise<BlueMapSourceReport>): Promise<void> {
    if (host === null || blueMapSourceStore.busy) return;
    blueMapSourceStore.busy = true;
    try {
        blueMapSourceStore.report = await request(host);
    } catch (error) {
        // A rejected invoke reaches here as an opaque Error, and the main-process handlers are
        // written never to throw, so this is a broken bridge rather than a failed check. It is
        // still reported as a sentence, because the alternative is a button that visibly does
        // nothing at all.
        const detail = error instanceof Error ? error.message : String(error);
        blueMapSourceStore.report = {
            jars: null,
            jarsReason: "The app could not ask its own main process: " + detail,
            upstream: null,
            upstreamReason: "The app could not ask its own main process: " + detail,
            checkedAt: new Date().toISOString(),
        };
    } finally {
        blueMapSourceStore.busy = false;
    }
}

/** The local half: what the build recorded beside the jars. No network. */
export async function refreshBlueMapSource(): Promise<void> {
    await run((ready) => ready.read());
}

/** The local half plus an upstream release lookup. This is the one that can be slow. */
export async function checkBlueMapUpstream(): Promise<void> {
    await run((ready) => ready.check());
}

/**
 * The facts this section puts on screen, for the settings search bar.
 *
 * Facts rather than sentences, deliberately: a commit hash, a version, a release tag and the
 * reason text are the things somebody would type. The prose around them is already searchable
 * through the section's own title and description.
 */
export function blueMapSourceSearchValues(): string[] {
    const report = blueMapSourceStore.report;
    if (report === null) return [];
    return [
        report.jars?.shortCommit ?? "",
        report.jars?.version ?? "",
        report.jarsReason ?? "",
        report.upstream?.ref ?? "",
        report.upstream?.shortCommit ?? "",
        report.upstreamReason ?? "",
    ].filter((value) => value.length > 0);
}
