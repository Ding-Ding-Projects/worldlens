/**
 * The ADHD modes: five accommodations, each turned on by itself.
 *
 * They are modes, plural, and independently toggleable, which is the whole design. Attention
 * difficulties do not arrive as one setting - somebody may want the page quieter without
 * wanting to be told how long they have been reading, or want the time reminder precisely
 * because they are hyperfocusing. A single master switch forces them to accept the part that
 * does not suit them, and most people respond to that by turning the whole thing off.
 *
 * ## Every one is off by default
 *
 * These are accommodations, not an opinion about how anybody should read. A mode that
 * switched itself on would have decided something about the visitor it has no standing to
 * decide, and would have done it on the basis of nothing.
 *
 * ## What Focus is not allowed to do
 *
 * It dims and de-emphasises. It never hides anything the visitor cannot get back in one
 * obvious action, because a page that makes content disappear is a worse problem than a busy
 * page, and from the visitor's side "dimmed" and "gone" are indistinguishable once it is gone.
 *
 * ## Tone, which matters more here than anywhere else on this site
 *
 * The copy states facts and nothing else. It says how long, never what to feel about how
 * long. No streaks, no counts of good days, no congratulation, and nothing that reads as
 * scolding. The funny-level sliders style this copy like any other, and the facts inside it
 * stay exact at every level.
 *
 * ## Not medical, and named so nobody has to disclose anything
 *
 * These are interface accommodations. No diagnosis, no assessment, no advice, no claim of
 * benefit. Each mode is named for what it does, so a visitor can switch one on with somebody
 * reading over their shoulder without that telling anyone anything about them.
 */

import type { Preferences } from "../platform/Preferences.js";

/** Every mode, in the order a settings surface should offer them. */
export const ADHD_MODE_IDS = [
    "focus",
    "low-stimulation",
    "time-awareness",
    "one-thing",
    "momentum",
] as const;

export type AdhdModeId = (typeof ADHD_MODE_IDS)[number];

export interface AdhdModeDescription {
    readonly id: AdhdModeId;
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly summaryKey: string;
    readonly summaryFallback: string;
}

/**
 * What each mode is called and what it actually does.
 *
 * Named for the behaviour rather than for who it is for. "Focus" and "Low stimulation" say
 * what changes on screen; a label naming a condition would make switching one on a
 * disclosure, which is not a thing an interface should ask of anybody.
 */
export const ADHD_MODES: Readonly<Record<AdhdModeId, AdhdModeDescription>> = {
    focus: {
        id: "focus",
        labelKey: "adhd.mode.focus.label",
        labelFallback: "Focus",
        summaryKey: "adhd.mode.focus.summary",
        summaryFallback:
            "Brings the section you are reading forward and pushes the rest back. Nothing is " +
            "hidden - everything stays one click away.",
    },
    "low-stimulation": {
        id: "low-stimulation",
        labelKey: "adhd.mode.lowStimulation.label",
        labelFallback: "Low stimulation",
        summaryKey: "adhd.mode.lowStimulation.summary",
        summaryFallback:
            "Fewer moving things, quieter colour, and only the notifications that genuinely " +
            "need you.",
    },
    "time-awareness": {
        id: "time-awareness",
        labelKey: "adhd.mode.timeAwareness.label",
        labelFallback: "Time awareness",
        summaryKey: "adhd.mode.timeAwareness.summary",
        summaryFallback: "Shows how long this page has been open, where you are reading it.",
    },
    "one-thing": {
        id: "one-thing",
        labelKey: "adhd.mode.oneThing.label",
        labelFallback: "One thing at a time",
        summaryKey: "adhd.mode.oneThing.summary",
        summaryFallback:
            "Keeps one next action visible, chosen by you, so it survives leaving and coming back.",
    },
    momentum: {
        id: "momentum",
        labelKey: "adhd.mode.momentum.label",
        labelFallback: "Momentum",
        summaryKey: "adhd.mode.momentum.summary",
        summaryFallback:
            "A quiet, dismissible note when nothing has changed here for a while. Dismissing " +
            "it is respected for the rest of the visit.",
    },
};

const KEY_PREFIX = "site.adhd.";
const NEXT_ACTION_KEY = "site.adhd.nextAction";
const MAX_NEXT_ACTION = 200;

/** How long "a while" is, for Momentum. Long enough not to nag. */
export const MOMENTUM_QUIET_MS = 40 * 60 * 1000;

/** How long a dismissal lasts: the rest of the visit, not thirty seconds. */
export const MOMENTUM_DISMISSAL_MS = 24 * 60 * 60 * 1000;

export type AdhdListener = () => void;

/**
 * The visitor's ADHD-mode choices, in browser storage.
 *
 * Per visitor and per browser, like every other preference here, and it never leaves the
 * machine. Which accommodations somebody uses is nobody else's business, so it is not
 * exported, not synced, and not placed in a capture.
 */
export class AdhdModes {
    private readonly prefs: Preferences;
    private readonly listeners = new Set<AdhdListener>();
    private momentumDismissedUntil: number | null = null;

    constructor(prefs: Preferences) {
        this.prefs = prefs;
    }

    /** Whether one mode is on. Off is the answer whenever storage cannot be read. */
    isOn(id: AdhdModeId): boolean {
        return this.prefs.readBoolean(KEY_PREFIX + id, false);
    }

    /** Every mode that is currently on, in offer order. */
    get active(): readonly AdhdModeId[] {
        return ADHD_MODE_IDS.filter((id) => this.isOn(id));
    }

    setOn(id: AdhdModeId, on: boolean): void {
        this.prefs.write(KEY_PREFIX + id, on ? "true" : "false");
        this.announce();
    }

    /**
     * Turns every mode off.
     *
     * A single "off" exists because a visitor who wants their ordinary page back should not
     * have to find five switches. There is deliberately no matching "all on": these are five
     * different accommodations, and switching them all on is not a thing anybody wants.
     */
    reset(): void {
        for (const id of ADHD_MODE_IDS) this.prefs.write(KEY_PREFIX + id, "false");
        this.prefs.write(NEXT_ACTION_KEY, "");
        this.momentumDismissedUntil = null;
        this.announce();
    }

    /** The visitor's own next action, or null when they have not set one. */
    get nextAction(): string | null {
        const raw = this.prefs.read(NEXT_ACTION_KEY, "").trim().slice(0, MAX_NEXT_ACTION).trim();
        return raw === "" ? null : raw;
    }

    /**
     * Records the next action.
     *
     * Never inferred from what the visitor was reading. The value of this is that it is
     * theirs; a guess would be one more thing on screen that is subtly wrong.
     */
    setNextAction(value: string | null): void {
        this.prefs.write(
            NEXT_ACTION_KEY,
            value === null ? "" : value.trim().slice(0, MAX_NEXT_ACTION),
        );
        this.announce();
    }

    /**
     * Whether Momentum should show its note.
     *
     * False whenever the mode is off, whenever the page has not actually been quiet, and for
     * the rest of the visit once the visitor has dismissed it. A "not now" that is respected
     * for thirty seconds is worse than never asking.
     */
    momentumDue(quietSinceMs: number, now: number): boolean {
        if (!this.isOn("momentum")) return false;
        if (this.momentumDismissedUntil !== null && now < this.momentumDismissedUntil) return false;
        return now - quietSinceMs >= MOMENTUM_QUIET_MS;
    }

    /** Dismisses the Momentum note for the rest of this visit. */
    dismissMomentum(now: number): void {
        this.momentumDismissedUntil = now + MOMENTUM_DISMISSAL_MS;
        this.announce();
    }

    /**
     * How long the page has been open, as a plain sentence.
     *
     * States the number and stops. No judgement, no comparison with other days, and nothing
     * that reads as a target somebody has missed.
     */
    elapsedSentence(openedAtMs: number, now: number): string {
        const minutes = Math.max(0, Math.floor((now - openedAtMs) / 60_000));
        if (minutes < 1) return "Open for less than a minute.";
        if (minutes === 1) return "Open for 1 minute.";
        if (minutes < 60) return `Open for ${String(minutes)} minutes.`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        const hourPart = hours === 1 ? "1 hour" : `${String(hours)} hours`;
        return rest === 0
            ? `Open for ${hourPart}.`
            : `Open for ${hourPart} and ${String(rest)} minutes.`;
    }

    /**
     * The classes a surface applies for the modes that are on.
     *
     * Returned rather than applied, so this module owns no DOM. Low stimulation composes with
     * the platform's own reduced-motion preference and never overrides it: somebody who has
     * already told their operating system they want less motion has asked once, and should
     * not have to ask again here.
     */
    bodyClasses(): readonly string[] {
        return this.active.map((id) => `adhd-${id}`);
    }

    onChange(listener: AdhdListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private announce(): void {
        for (const listener of this.listeners) listener();
    }
}
