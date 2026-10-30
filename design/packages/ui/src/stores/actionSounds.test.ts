// @vitest-environment jsdom

/**
 * The action sound path: persistence, every reason it stays silent, and the real events it
 * is wired to. Web Audio is replaced by a recording fake, so "a cue played" means an
 * oscillator was actually started on the context, not that a function was called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = { quietHours: false, lowStimulation: false };
vi.mock("../components/runtimeSettings/store.js", () => ({
    loadRuntimeSettings: () => ({
        values: {
            narrator: { quietHours: runtime.quietHours },
            accommodations: { lowStimulation: runtime.lowStimulation },
        },
    }),
}));

import { memoryStorage, setSetupStorage, setupStorage } from "../components/setup/setupPrefs.js";
import { createRenderRun } from "../components/world/renderRun.js";
import type { RenderEvent, WorldBridge } from "../components/world/worldBridge.js";
import { createSuperConfirmGate, GATE_TRAVEL_END } from "../components/confirm/superConfirmGate.js";
import {
    ACTION_SOUNDS_KEY,
    CUE_GAP_MS,
    actionSoundPrefs,
    playActionCue,
    playRenderOutcomeCue,
    reloadActionSoundPrefs,
    resetActionSoundsForTests,
    setActionSoundsEnabled,
    setActionSoundsVolume,
} from "./actionSounds.js";
import { notices, raiseNotice } from "./notices.js";
import { notify } from "../components/config/notifications.js";

/** Every oscillator started, with the frequency it was given. */
let started: number[] = [];
let constructed = 0;

class FakeParam {
    setValueAtTime(): void {}
    exponentialRampToValueAtTime(): void {}
}

class FakeAudioContext {
    currentTime = 0;
    state = "running";
    destination = {};
    constructor() {
        constructed++;
    }
    resume(): Promise<void> {
        return Promise.resolve();
    }
    createOscillator(): unknown {
        let frequency = 0;
        return {
            type: "sine",
            frequency: {
                setValueAtTime: (value: number) => {
                    frequency = value;
                },
            },
            connect: () => {},
            start: () => {
                started.push(frequency);
            },
            stop: () => {},
        };
    }
    createGain(): unknown {
        return { gain: new FakeParam(), connect: () => {} };
    }
}

let clock = 1_000_000;

beforeEach(() => {
    started = [];
    constructed = 0;
    runtime.quietHours = false;
    runtime.lowStimulation = false;
    setSetupStorage(memoryStorage());
    reloadActionSoundPrefs();
    resetActionSoundsForTests();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    clock += 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

/** Moves the clock past the gap between cues, so the next one is not merged. */
function later(): void {
    clock += CUE_GAP_MS + 1;
}

describe("the preference", () => {
    it("ships on at half volume", () => {
        expect(actionSoundPrefs.enabled).toBe(true);
        expect(actionSoundPrefs.volume).toBe(0.5);
    });

    it("persists the switch and the volume and reads them back after a restart", () => {
        setActionSoundsEnabled(false);
        setActionSoundsVolume(0.8);
        const stored = setupStorage().read(ACTION_SOUNDS_KEY);
        expect(JSON.parse(stored ?? "{}")).toEqual({ enabled: false, volume: 0.8 });

        actionSoundPrefs.enabled = true;
        actionSoundPrefs.volume = 0.1;
        reloadActionSoundPrefs();
        expect(actionSoundPrefs.enabled).toBe(false);
        expect(actionSoundPrefs.volume).toBe(0.8);
    });

    it("ignores a stored value that is not the expected shape", () => {
        setSetupStorage(memoryStorage({ [ACTION_SOUNDS_KEY]: "not json" }));
        reloadActionSoundPrefs();
        expect(actionSoundPrefs.enabled).toBe(true);
    });

    it("mirrors a change into the settings history", async () => {
        const save = vi.fn(async () => {});
        Object.defineProperty(window, "worldlens", {
            configurable: true,
            value: { appSettingsHistory: { read: async () => ({ values: {} }), save } },
        });
        setActionSoundsEnabled(false);
        await vi.waitFor(() => expect(save).toHaveBeenCalled());
        expect(save).toHaveBeenCalledWith({
            version: 1,
            values: { actionSounds: { enabled: false, volume: 0.5 } },
        });
        delete window.worldlens;
    });
});

describe("playback", () => {
    it("synthesizes the cue with Web Audio when enabled", () => {
        expect(playActionCue("success")).toBe(true);
        expect(started.length).toBeGreaterThan(0);
    });

    it("never plays while the switch is off, and applies the change immediately", () => {
        setActionSoundsEnabled(false);
        expect(playActionCue("success")).toBe(false);
        expect(started).toEqual([]);
        expect(constructed).toBe(0);

        setActionSoundsEnabled(true);
        expect(playActionCue("success")).toBe(true);
    });

    it("stays silent at zero volume, in quiet hours, and under low stimulation", () => {
        setActionSoundsVolume(0);
        expect(playActionCue("error")).toBe(false);
        setActionSoundsVolume(0.5);

        runtime.quietHours = true;
        expect(playActionCue("error")).toBe(false);
        runtime.quietHours = false;

        runtime.lowStimulation = true;
        expect(playActionCue("error")).toBe(false);
        expect(started).toEqual([]);
    });

    it("plays one cue for two events that arrive together", () => {
        expect(playActionCue("save")).toBe(true);
        expect(playActionCue("success")).toBe(false);
        later();
        expect(playActionCue("success")).toBe(true);
    });

    it("does nothing, and does not throw, where Web Audio is unavailable", () => {
        vi.unstubAllGlobals();
        const scope = globalThis as { AudioContext?: unknown };
        const saved = scope.AudioContext;
        delete scope.AudioContext;
        try {
            expect(playActionCue("success")).toBe(false);
        } finally {
            if (saved !== undefined) scope.AudioContext = saved;
        }
    });

    it("sounds a render outcome once per render id", () => {
        expect(playRenderOutcomeCue("r1", "finished")).toBe(true);
        later();
        expect(playRenderOutcomeCue("r1", "finished")).toBe(false);
        expect(playRenderOutcomeCue("r2", "failed")).toBe(true);
    });
});

describe("the wired events", () => {
    it("plays for a success or error notice, whichever way it was raised, and not for info", () => {
        raiseNotice("success", "Saved.");
        expect(started.length).toBeGreaterThan(0);

        started = [];
        later();
        notify(notices, "error", "The files were not written.");
        expect(started.length).toBeGreaterThan(0);

        started = [];
        later();
        raiseNotice("info", "Nothing to report.");
        raiseNotice("warning", "Check this.");
        expect(started).toEqual([]);
    });

    it("plays nothing for a notice while the switch is off", () => {
        setActionSoundsEnabled(false);
        raiseNotice("success", "Saved.");
        raiseNotice("error", "Failed.");
        expect(started).toEqual([]);
    });

    it("plays when a render finishes, from the run that is watching it", () => {
        let listener: ((event: RenderEvent) => void) | null = null;
        const bridge = {
            onRenderEvent: (fn: (event: RenderEvent) => void) => {
                listener = fn;
                return () => undefined;
            },
        } as unknown as WorldBridge;
        const run = createRenderRun(bridge, { now: () => clock });
        run.expect("render-a");
        const emit = listener as unknown as (event: RenderEvent) => void;
        emit({
            type: "finished",
            renderId: "render-a",
            dataRoot: "/maps",
            mapIds: ["world"],
            engine: { id: "upstream-java", label: "BlueMap", version: "5", javaVersion: null },
            durationMs: 1000,
            at: new Date(clock).toISOString(),
        });
        expect(run.state.value).toBe("finished");
        expect(started.length).toBeGreaterThan(0);
        run.dispose();
    });

    it("plays when a destructive gate is authorized, and not before", () => {
        // The gate itself is presentation-free; the two confirm components call the cue from
        // their authorize callback, which is what this reproduces.
        const gate = createSuperConfirmGate(() => playActionCue("destructive"));
        gate.travelTo(GATE_TRAVEL_END);
        expect(started).toEqual([]);
        gate.keyOne.value = true;
        gate.keyTwo.value = true;
        gate.travelTo(GATE_TRAVEL_END);
        expect(started.length).toBeGreaterThan(0);
    });
});
