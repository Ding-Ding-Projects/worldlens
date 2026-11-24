/**
 * The live console on the management site, for transports whose log can only be read again.
 *
 * The Docker transport's `attach` is a one-shot replay of the last lines, by design: the
 * desktop app's session layer re-reads it on an interval. The site used to attach once and
 * forward that replay, so the console showed the lines from when the first browser connected
 * and never another, and a second browser got nothing at all. This re-reads the tail every
 * couple of seconds while anyone is watching, forwards only the lines that are new, and keeps
 * the recent history so a browser that connects later starts with it.
 */
import type { ConsoleLine, ServerTransport } from "../transport/types.js";

/** Lines of `current` that come after what `previous` already showed. */
export function newLines(previous: readonly string[], current: readonly string[]): string[] {
    const max = Math.min(previous.length, current.length);
    for (let k = max; k > 0; k -= 1) {
        let same = true;
        for (let i = 0; i < k; i += 1) {
            if (previous[previous.length - k + i] !== current[i]) {
                same = false;
                break;
            }
        }
        if (same) return current.slice(k);
    }
    return [...current];
}

/** Reads the tail once, stopping after `limitMs` for a transport that follows forever. */
export async function readTail(
    transport: Pick<ServerTransport, "attach">,
    tail: number,
    limitMs = 3000,
): Promise<ConsoleLine[] | null> {
    const attached = await transport.attach({ tail });
    if (!attached.ok) return null;
    const out: ConsoleLine[] = [];
    const iterator = attached.value.lines[Symbol.asyncIterator]();
    const deadline = Date.now() + limitMs;
    try {
        while (Date.now() < deadline) {
            const next = await Promise.race([
                iterator.next(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))),
            ]);
            if (next === null || next.done === true) break;
            out.push(next.value);
        }
    } finally {
        attached.value.detach();
    }
    return out;
}

export interface ConsoleFeed {
    /** The recent lines, oldest first, for a browser that has just connected. */
    readonly history: () => readonly ConsoleLine[];
    /** Settles once the first read is in, so the first browser also starts with history. */
    readonly ready: Promise<void>;
    stop(): void;
}

/**
 * Polls while `watching()` is true. `emit` gets each new line once. The first read fills the
 * history without emitting, because a browser that connects is sent the history directly.
 */
export function startConsoleFeed(options: {
    read: () => Promise<ConsoleLine[] | null>;
    emit: (line: ConsoleLine) => void;
    intervalMs?: number;
    keep?: number;
}): ConsoleFeed {
    const keep = options.keep ?? 200;
    let previous: string[] = [];
    let history: ConsoleLine[] = [];
    let stopped = false;
    let first = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (): Promise<void> => {
        if (stopped) return;
        const lines = await options.read().catch(() => null);
        if (lines !== null && !stopped) {
            const texts = lines.map((l) => l.text);
            const fresh = newLines(previous, texts);
            const freshLines = lines.slice(lines.length - fresh.length);
            previous = texts;
            history = [...history, ...freshLines].slice(-keep);
            if (!first) for (const line of freshLines) options.emit(line);
            first = false;
        }
        if (!stopped) timer = setTimeout(() => void tick(), options.intervalMs ?? 2000);
    };
    const ready = tick();
    return {
        history: () => history,
        ready,
        stop(): void {
            stopped = true;
            if (timer !== null) clearTimeout(timer);
        },
    };
}
