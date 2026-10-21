// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../setup/schoolMode.js", () => ({ schoolModeEnabled: () => false }));
vi.mock("../runtimeSettings/index.js", () => ({
    loadRuntimeSettings: () => ({ values: { narrator: { quietHours: false } } }),
}));
import { playVocabularyOutcome, vocabularySounds } from "./vocabularySounds.js";
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
