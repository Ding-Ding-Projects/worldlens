// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../setup/schoolMode.js", () => ({ schoolModeEnabled: () => false }));
vi.mock("../runtimeSettings/store.js", () => ({
    loadRuntimeSettings: () => ({
        values: { narrator: { quietHours: false }, accommodations: { lowStimulation: false } },
    }),
}));
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { actionSoundPrefs, reloadActionSoundPrefs } from "../../stores/actionSounds.js";
import { playVocabularyOutcome, vocabularySounds } from "./vocabularySounds.js";
beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadActionSoundPrefs();
});
afterEach(() => {
    vi.unstubAllGlobals();
    delete window.worldlens;
    vocabularySounds.muted = false;
});
it("uses the host's outcome cue and current app volume", async () => {
    const play = vi.fn(async () => {});
    const sound = { volume: 1, play };
    vi.stubGlobal(
        "Audio",
        vi.fn(function () {
            return sound;
        }),
    );
    const outcomeSound = vi.fn(async () => ({
        available: true,
        dataUrl: "data:audio/wav;base64,",
    }));
    Object.defineProperty(window, "worldlens", {
        configurable: true,
        value: { vocabulary: { outcomeSound } },
    });
    vocabularySounds.volume = 0.25;
    await playVocabularyOutcome(true);
    expect(outcomeSound).toHaveBeenCalledWith("success");
    expect(sound.volume).toBe(0.25);
    expect(play).toHaveBeenCalledOnce();
    vocabularySounds.muted = true;
    await playVocabularyOutcome(false);
    expect(outcomeSound).toHaveBeenCalledOnce();
});
it("shares one preference with the app-wide action sound switch", () => {
    vocabularySounds.muted = true;
    expect(actionSoundPrefs.enabled).toBe(false);
    vocabularySounds.muted = false;
    expect(actionSoundPrefs.enabled).toBe(true);
});
it("migrates the older vocabulary-only mute and volume", () => {
    setSetupStorage(
        memoryStorage({
            "worldlens-vocabulary-sounds": JSON.stringify({ muted: true, volume: 0.3 }),
        }),
    );
    reloadActionSoundPrefs();
    expect(vocabularySounds.muted).toBe(true);
    expect(vocabularySounds.volume).toBe(0.3);
});
it("does not invent a sound when the host has none", async () => {
    const audio = vi.fn();
    vi.stubGlobal("Audio", audio);
    Object.defineProperty(window, "worldlens", {
        configurable: true,
        value: { vocabulary: { outcomeSound: async () => ({ available: false }) } },
    });
    await playVocabularyOutcome(false);
    expect(audio).not.toHaveBeenCalled();
});
