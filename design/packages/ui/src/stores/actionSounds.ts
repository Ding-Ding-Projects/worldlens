/**
 * Short action sound cues, played through one shared path for the whole application.
 *
 * Every cue is synthesized with the Web Audio API at the moment it plays: a couple of sine or
 * triangle notes under a soft attack and release. No audio file is bundled and nothing is
 * fetched, so there is nothing to license, nothing to download and nothing to go missing.
 *
 * ## When a cue plays
 *
 * | Cue              | Event                                                               |
 * | ---------------- | ------------------------------------------------------------------- |
 * | `success`        | A success notice is added to the shared notification history.       |
 * | `error`          | An error notice is added to the shared notification history.        |
 * | `save`           | Files were actually written by the options editor's save.           |
 * | `renderComplete` | A render reported `finished` (once per render id).                  |
 * | `renderFailed`   | A render reported `failed` (once per render id).                    |
 * | `destructive`    | A super-confirmation gate was fully authorized.                     |
 *
 * ## When a cue never plays
 *
 * - The **Play action sounds** switch is off, or the volume is zero.
 * - The narrator's quiet-hours setting is on, or the low-stimulation accommodation (this
 *   app's reduced-sound preference) is on.
 * - Another cue started less than {@link CUE_GAP_MS} ago. One action often produces two
 *   events (a save writes files and then raises a success notice), and two overlapping cues
 *   for one action is noise rather than feedback. The first cue wins.
 * - Web Audio is unavailable or refuses to start. Playback is wrapped so that a missing
 *   device or a blocked context can never change the outcome of the action it accompanies.
 *
 * Sound is supplementary. Every event above already has a visible result and an accessible
 * announcement of its own; nothing here replaces either.
 *
 * ## Persistence
 *
 * The switch and the volume are stored through `setupStorage()` (so unit tests and private
 * windows degrade instead of throwing) and mirrored into the settings history under
 * `actionSounds`. The first read migrates the older vocabulary-only preference, whose mute
 * and volume now govern every cue.
 */

import { reactive } from "vue";
import { setupStorage } from "../components/setup/setupPrefs.js";
import { loadRuntimeSettings } from "../components/runtimeSettings/store.js";
import { recordAppSetting } from "./appSettingsHistorySync.js";

export const ACTION_CUES = [
    "success",
    "error",
    "save",
    "renderComplete",
    "renderFailed",
    "destructive",
] as const;

export type ActionCue = (typeof ACTION_CUES)[number];

/** Where the preference is remembered. */
export const ACTION_SOUNDS_KEY = "worldlens.sounds.actionCues";

/** The vocabulary-only preference this module replaced, read once for migration. */
export const LEGACY_VOCABULARY_SOUNDS_KEY = "worldlens-vocabulary-sounds";

/** On by default: the cues are short, quiet and turned off with one switch. */
export const DEFAULT_ACTION_SOUNDS_ENABLED = true;
export const DEFAULT_ACTION_SOUNDS_VOLUME = 0.5;

/** Minimum time between two cues, in milliseconds. */
export const CUE_GAP_MS = 250;

export interface ActionSoundPrefs {
    enabled: boolean;
    volume: number;
}

function clampVolume(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : fallback;
}

function parse(raw: string | null): Record<string, unknown> | null {
    if (raw === null) return null;
    try {
        const value: unknown = JSON.parse(raw);
        return typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

/** The stored preference, the migrated legacy one, or the defaults. */
export function readActionSoundPrefs(): ActionSoundPrefs {
    const storage = setupStorage();
    const current = parse(storage.read(ACTION_SOUNDS_KEY));
    if (current !== null) {
        return {
            enabled:
                typeof current.enabled === "boolean"
                    ? current.enabled
                    : DEFAULT_ACTION_SOUNDS_ENABLED,
            volume: clampVolume(current.volume, DEFAULT_ACTION_SOUNDS_VOLUME),
        };
    }
    const legacy = parse(storage.read(LEGACY_VOCABULARY_SOUNDS_KEY));
    if (legacy !== null) {
        return {
            enabled: legacy.muted !== true,
            volume: clampVolume(legacy.volume, DEFAULT_ACTION_SOUNDS_VOLUME),
        };
    }
    return { enabled: DEFAULT_ACTION_SOUNDS_ENABLED, volume: DEFAULT_ACTION_SOUNDS_VOLUME };
}

/** The one shared readout every control and every cue reads. */
export const actionSoundPrefs = reactive<ActionSoundPrefs>(readActionSoundPrefs());

/** Re-reads the stored preference. Tests call it after swapping the backing store. */
export function reloadActionSoundPrefs(): void {
    Object.assign(actionSoundPrefs, readActionSoundPrefs());
}

function persist(): void {
    setupStorage().write(
        ACTION_SOUNDS_KEY,
        JSON.stringify({ enabled: actionSoundPrefs.enabled, volume: actionSoundPrefs.volume }),
    );
}

let historyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Mirrors into the settings history. A switch flip is recorded at once; a volume drag is
 * recorded once it settles, so one gesture is one revision rather than dozens.
 */
function recordHistory(immediate: boolean): void {
    if (historyTimer !== null) {
        clearTimeout(historyTimer);
        historyTimer = null;
    }
    const record = (): void => {
        recordAppSetting("actionSounds", {
            enabled: actionSoundPrefs.enabled,
            volume: actionSoundPrefs.volume,
        });
    };
    if (immediate) {
        record();
        return;
    }
    historyTimer = setTimeout(() => {
        historyTimer = null;
        record();
    }, 600);
}

/** Turns every action cue on or off. Applies immediately and is remembered. */
export function setActionSoundsEnabled(enabled: boolean): void {
    actionSoundPrefs.enabled = enabled === true;
    persist();
    recordHistory(true);
}

/** Sets the cue volume, 0 to 1. Applies immediately and is remembered. */
export function setActionSoundsVolume(volume: number): void {
    actionSoundPrefs.volume = clampVolume(volume, actionSoundPrefs.volume);
    persist();
    recordHistory(false);
}

/**
 * True while the person's other preferences ask for quiet: the switch, a zero volume, the
 * narrator's quiet hours, or the low-stimulation accommodation.
 */
export function actionSoundsSuppressed(): boolean {
    if (!actionSoundPrefs.enabled || actionSoundPrefs.volume <= 0) return true;
    try {
        const values = loadRuntimeSettings().values;
        return values.narrator.quietHours || values.accommodations.lowStimulation;
    } catch {
        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Synthesis                                                                  */
/* -------------------------------------------------------------------------- */

interface Note {
    /** Hertz. */
    readonly frequency: number;
    /** Seconds after the cue starts. */
    readonly at: number;
    /** Seconds. */
    readonly duration: number;
    readonly type: OscillatorType;
    /** Relative loudness, multiplied by the volume setting. */
    readonly gain: number;
}

/**
 * Each cue's notes. Kept short (under half a second) and soft, rising for a good outcome,
 * falling for a bad one, and a low double tap for an authorized destructive action.
 */
export const CUE_NOTES: Readonly<Record<ActionCue, readonly Note[]>> = {
    success: [
        { frequency: 659.25, at: 0, duration: 0.12, type: "sine", gain: 0.5 },
        { frequency: 987.77, at: 0.09, duration: 0.18, type: "sine", gain: 0.45 },
    ],
    error: [
        { frequency: 392, at: 0, duration: 0.14, type: "triangle", gain: 0.5 },
        { frequency: 311.13, at: 0.12, duration: 0.22, type: "triangle", gain: 0.45 },
    ],
    save: [{ frequency: 880, at: 0, duration: 0.1, type: "sine", gain: 0.4 }],
    renderComplete: [
        { frequency: 523.25, at: 0, duration: 0.12, type: "sine", gain: 0.45 },
        { frequency: 659.25, at: 0.1, duration: 0.12, type: "sine", gain: 0.45 },
        { frequency: 783.99, at: 0.2, duration: 0.24, type: "sine", gain: 0.45 },
    ],
    renderFailed: [
        { frequency: 349.23, at: 0, duration: 0.16, type: "triangle", gain: 0.5 },
        { frequency: 261.63, at: 0.14, duration: 0.26, type: "triangle", gain: 0.45 },
    ],
    destructive: [
        { frequency: 220, at: 0, duration: 0.09, type: "triangle", gain: 0.55 },
        { frequency: 220, at: 0.13, duration: 0.12, type: "triangle", gain: 0.5 },
    ],
};

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;
let lastCueAt = -Infinity;
const settledRenders = new Set<string>();

function audioContext(): AudioContext | null {
    if (context !== null) return context;
    const scope = globalThis as unknown as {
        AudioContext?: AudioContextConstructor;
        webkitAudioContext?: AudioContextConstructor;
    };
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    if (Ctor === undefined) return null;
    try {
        context = new Ctor();
    } catch {
        context = null;
    }
    return context;
}

function schedule(ctx: AudioContext, notes: readonly Note[], volume: number): void {
    const start = ctx.currentTime + 0.01;
    for (const note of notes) {
        const oscillator = ctx.createOscillator();
        const envelope = ctx.createGain();
        const begin = start + note.at;
        const end = begin + note.duration;
        const peak = Math.max(0.0001, note.gain * volume * 0.4);
        oscillator.type = note.type;
        oscillator.frequency.setValueAtTime(note.frequency, begin);
        envelope.gain.setValueAtTime(0.0001, begin);
        envelope.gain.exponentialRampToValueAtTime(peak, begin + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope);
        envelope.connect(ctx.destination);
        oscillator.start(begin);
        oscillator.stop(end + 0.02);
    }
}

/**
 * Plays one cue, unless anything above says not to. Never throws and never blocks.
 *
 * Returns whether the cue was handed to the audio device, which is what the tests assert;
 * callers have no reason to read it.
 */
export function playActionCue(cue: ActionCue): boolean {
    if (actionSoundsSuppressed()) return false;
    const now = Date.now();
    if (now - lastCueAt < CUE_GAP_MS) return false;
    const ctx = audioContext();
    if (ctx === null) return false;
    lastCueAt = now;
    try {
        if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
        schedule(ctx, CUE_NOTES[cue], actionSoundPrefs.volume);
        return true;
    } catch {
        return false;
    }
}

/**
 * The render-outcome cue, at most once per render id.
 *
 * Several watchers can follow the same render (the open map screen and the shell's
 * background render list each build their own run), and all of them see the same
 * `finished` event. Only the first one sounds.
 */
export function playRenderOutcomeCue(renderId: string, outcome: "finished" | "failed"): boolean {
    if (settledRenders.has(renderId)) return false;
    settledRenders.add(renderId);
    if (settledRenders.size > 200) {
        const oldest = settledRenders.values().next().value;
        if (oldest !== undefined) settledRenders.delete(oldest);
    }
    return playActionCue(outcome === "finished" ? "renderComplete" : "renderFailed");
}

/** Forgets the audio context, the cue spacing and the render ids. Tests only. */
export function resetActionSoundsForTests(): void {
    context = null;
    lastCueAt = -Infinity;
    settledRenders.clear();
    if (historyTimer !== null) {
        clearTimeout(historyTimer);
        historyTimer = null;
    }
}

/* -------------------------------------------------------------------------- */
/* Host-provided outcome sounds                                               */
/* -------------------------------------------------------------------------- */

type OutcomeSoundBridge = {
    outcomeSound?: (
        cue: "success" | "invalid",
    ) => Promise<{ available: boolean; dataUrl?: string }>;
};

/**
 * The personal-vocabulary drop outcome, played with the operating system's own success or
 * invalid-input sound when the desktop host supplies one. Same switch, same volume, same
 * quiet preferences as every synthesized cue; `extraSuppressed` lets the caller add a
 * condition of its own (restricted mode, for vocabulary).
 */
export async function playHostOutcomeSound(
    success: boolean,
    extraSuppressed: () => boolean = () => false,
): Promise<void> {
    const suppressed = (): boolean => actionSoundsSuppressed() || extraSuppressed();
    if (suppressed()) return;
    const bridge =
        typeof window === "undefined"
            ? undefined
            : (window.worldlens?.vocabulary as OutcomeSoundBridge | undefined);
    if (bridge?.outcomeSound === undefined) return;
    try {
        const result = await bridge.outcomeSound(success ? "success" : "invalid");
        if (!result.available || result.dataUrl === undefined || suppressed()) return;
        const audio = new Audio(result.dataUrl);
        audio.volume = actionSoundPrefs.volume;
        await audio.play();
    } catch {
        /* Muted devices and blocked playback never block the operation. */
    }
}
