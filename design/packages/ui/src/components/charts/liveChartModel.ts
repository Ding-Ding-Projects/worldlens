/**
 * The arithmetic behind a live chart in the Liveline style: easing, the y range, trend,
 * scrubbing and the honest states. Pure, so the rules are tested without a canvas.
 *
 * A live chart never invents a point. Easing moves only what is drawn between two real
 * readings (the range, the badge and the newest point arriving); the line itself only ever
 * joins samples the source actually sent.
 */

export interface LiveSample {
    /** Milliseconds since the epoch. */
    readonly t: number;
    readonly v: number;
}

export type LiveState = "loading" | "live" | "paused" | "stale" | "empty";

/** Liveline eases about eight percent of the remaining distance per frame. */
export const EASE_PER_FRAME = 0.08;

/** Moves `from` toward `to` by the per-frame share, snapping when it is close enough. */
export function ease(from: number, to: number, share = EASE_PER_FRAME): number {
    const next = from + (to - from) * share;
    return Math.abs(to - next) < Math.max(1e-6, Math.abs(to) * 1e-4) ? to : next;
}

/** The samples inside the visible window, oldest first. */
export function visible(samples: readonly LiveSample[], now: number, windowMs: number): LiveSample[] {
    return samples.filter((s) => s.t >= now - windowMs && s.t <= now);
}

/** A y range with breathing room, never zero tall, that starts at zero for positive data. */
export function range(samples: readonly LiveSample[]): { readonly min: number; readonly max: number } {
    if (samples.length === 0) return { min: 0, max: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of samples) {
        lo = Math.min(lo, s.v);
        hi = Math.max(hi, s.v);
    }
    if (lo >= 0) lo = 0;
    if (hi === lo) hi = lo + (Math.abs(lo) || 1);
    const pad = (hi - lo) * 0.12;
    return { min: lo < 0 ? lo - pad : lo, max: hi + pad };
}

/** Three quiet grid values across the range, rounded to a readable step. */
export function gridValues(min: number, max: number, count = 3): number[] {
    const raw = (max - min) / count;
    const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
}

export type Trend = "up" | "down" | "flat";

/** Momentum from the last few readings: a change under two percent of the level is flat. */
export function trend(samples: readonly LiveSample[]): Trend {
    if (samples.length < 2) return "flat";
    const last = samples.at(-1)!.v;
    const before = samples.at(-Math.min(samples.length, 4))!.v;
    const delta = last - before;
    if (Math.abs(delta) <= Math.max(Math.abs(before), Math.abs(last)) * 0.02) return "flat";
    return delta > 0 ? "up" : "down";
}

/** The sample nearest a time, for pointer scrubbing. */
export function nearestIndex(samples: readonly LiveSample[], t: number): number {
    let best = -1;
    let distance = Infinity;
    samples.forEach((s, i) => {
        const d = Math.abs(s.t - t);
        if (d < distance) {
            distance = d;
            best = i;
        }
    });
    return best;
}

/**
 * The honest state. No samples yet while the source runs is loading, not empty; a running
 * source that has gone quiet past `staleMs` is stale; a stopped source is paused.
 */
export function stateOf(input: { readonly samples: readonly LiveSample[]; readonly running: boolean; readonly now: number; readonly staleMs: number; readonly started: boolean }): LiveState {
    const last = input.samples.at(-1);
    if (!input.running) return last ? "paused" : "empty";
    if (!last) return input.started ? "loading" : "empty";
    return input.now - last.t > input.staleMs ? "stale" : "live";
}

/** Keeps a bounded history so a long session never grows without limit. */
export function pushSample(samples: readonly LiveSample[], next: LiveSample, keep = 600): LiveSample[] {
    const last = samples.at(-1);
    if (last && next.t <= last.t) return samples.slice();
    const out = samples.concat(next);
    return out.length > keep ? out.slice(out.length - keep) : out;
}
