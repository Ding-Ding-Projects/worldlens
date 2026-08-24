import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createNarratorController,
    listVoices,
    resolveVoiceStatus,
    stableVoiceId,
    type SpeechAdapter,
} from "./narrator.js";
import { DEFAULT_RUNTIME_VALUES, type NarratorSettings } from "./model.js";

class FakeUtterance {
    text: string;
    voice?: SpeechSynthesisVoice;
    rate = 1;
    pitch = 1;
    lang = "";
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
        this.text = text;
    }
}

function fakeVoice(
    uri: string,
    lang: string,
    name: string,
    localService = true,
): SpeechSynthesisVoice {
    return { voiceURI: uri, lang, name, localService, default: false } as SpeechSynthesisVoice;
}

function adapter(): SpeechAdapter & { spoken: FakeUtterance[] } {
    const value: SpeechAdapter & { spoken: FakeUtterance[] } = {
        voices: [fakeVoice("en-1", "en-US", "English")],
        spoken: [],
        onvoiceschanged: null,
        getVoices() {
            return this.voices;
        },
        speak(utterance) {
            this.spoken.push(utterance as FakeUtterance);
        },
        cancel() {},
    } as unknown as SpeechAdapter & { spoken: FakeUtterance[] };
    return value;
}

const enabled: NarratorSettings = {
    ...DEFAULT_RUNTIME_VALUES.narrator,
    enabled: true,
    cooldownMs: 0,
};

beforeEach(() => {
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});

describe("runtime narrator", () => {
    it("uses stable voice ids and reports unavailable or network-backed choices", () => {
        const voice = fakeVoice("network-yue", "yue-HK", "Cantonese", false);
        expect(stableVoiceId(voice)).toBe("network-yue");
        expect(listVoices({ getVoices: () => [voice] } as SpeechAdapter)[0]?.networkBacked).toBe(
            true,
        );
        const status = resolveVoiceStatus(
            listVoices({ getVoices: () => [voice] } as SpeechAdapter),
            "missing",
            "en",
        );
        expect(status.installed).toBe(false);
        expect(status.effective).toBeNull();
    });

    it("watches late voice enumeration and serializes Both", () => {
        const speech = adapter();
        const controller = createNarratorController(speech);
        expect(controller.voices()).toHaveLength(1);
        speech.voices = [
            fakeVoice("en-1", "en-US", "English"),
            fakeVoice("yue-1", "yue-HK", "Cantonese"),
        ];
        speech.onvoiceschanged?.(new Event("voiceschanged"));
        expect(controller.voices()).toHaveLength(2);
        controller.speak(
            { ...enabled, language: "both" },
            { en: "English", yue: "廣東話" },
            "status",
        );
        expect(speech.spoken).toHaveLength(1);
        expect(speech.spoken[0]?.text).toBe("English");
        speech.spoken[0]?.onend?.();
        expect(speech.spoken).toHaveLength(2);
        expect(speech.spoken[1]?.text).toBe("廣東話");
        controller.dispose();
    });

    it("skips speech during quiet or assistive-technology conditions and applies cooldown", () => {
        const speech = adapter();
        const controller = createNarratorController(speech);
        controller.speak({ ...enabled, quietHours: true }, { en: "a", yue: "b" }, "quiet");
        controller.speak(enabled, { en: "a", yue: "b" }, "screen", { screenReaderActive: true });
        controller.speak(enabled, { en: "a", yue: "b" }, "reduced", { reducedSound: true });
        expect(speech.spoken).toHaveLength(0);
        controller.speak({ ...enabled, cooldownMs: 60_000 }, { en: "a", yue: "b" }, "same");
        controller.speak({ ...enabled, cooldownMs: 60_000 }, { en: "new", yue: "b" }, "same");
        expect(speech.spoken).toHaveLength(1);
        expect(speech.spoken[0]?.text).toBe("a");
        controller.dispose();
    });
});
