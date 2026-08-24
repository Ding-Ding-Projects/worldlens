import type { NarratorSettings } from "./model.js";

export interface VoiceInfo {
    readonly id: string;
    readonly name: string;
    readonly lang: string;
    readonly localService: boolean;
    readonly networkBacked: boolean;
}

export interface SpeechAdapter {
    getVoices(): readonly SpeechSynthesisVoice[];
    speak(utterance: SpeechSynthesisUtterance): void;
    cancel(): void;
    onvoiceschanged: ((event: Event) => void) | null;
}

export function stableVoiceId(
    voice: Pick<SpeechSynthesisVoice, "voiceURI" | "lang" | "name">,
): string {
    return voice.voiceURI.trim() || `${voice.lang.trim().toLowerCase()}:${voice.name.trim()}`;
}

export function listVoices(adapter: SpeechAdapter | null): VoiceInfo[] {
    if (adapter === null) return [];
    return adapter
        .getVoices()
        .map((voice) => ({
            id: stableVoiceId(voice),
            name: voice.name,
            lang: voice.lang,
            localService: voice.localService,
            networkBacked: !voice.localService,
        }))
        .sort(
            (a, b) =>
                a.lang.localeCompare(b.lang) ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        );
}

function languageMatches(voice: VoiceInfo, language: "en" | "yue"): boolean {
    const lower = voice.lang.toLowerCase();
    return language === "yue"
        ? lower.startsWith("yue") || lower.startsWith("zh-hk")
        : lower.startsWith("en");
}

export interface VoiceStatus {
    readonly chosenId: string | null;
    readonly installed: boolean;
    readonly networkBacked: boolean;
    readonly effective: VoiceInfo | null;
}

export function resolveVoiceStatus(
    voices: readonly VoiceInfo[],
    chosenId: string | null,
    language: "en" | "yue",
): VoiceStatus {
    const chosen =
        chosenId === null ? null : (voices.find((voice) => voice.id === chosenId) ?? null);
    const effective =
        chosen !== null && languageMatches(chosen, language)
            ? chosen
            : (voices.find((voice) => languageMatches(voice, language)) ?? null);
    return {
        chosenId,
        installed: chosen !== null,
        networkBacked: chosen?.networkBacked ?? false,
        effective,
    };
}

export interface NarratorController {
    readonly voices: () => readonly VoiceInfo[];
    readonly refresh: () => void;
    readonly subscribe: (listener: () => void) => () => void;
    readonly speak: (
        settings: NarratorSettings,
        text: { en: string; yue: string },
        category: string,
        context?: { screenReaderActive?: boolean; reducedSound?: boolean },
    ) => void;
    readonly dispose: () => void;
}

export function createNarratorController(input?: SpeechAdapter | null): NarratorController {
    const adapter = input ?? (typeof speechSynthesis === "undefined" ? null : speechSynthesis);
    let current = listVoices(adapter);
    const listeners = new Set<() => void>();
    const lastSpoken = new Map<string, number>();
    const queue: Array<{
        settings: NarratorSettings;
        text: { en: string; yue: string };
        category: string;
        priority: number;
    }> = [];
    let speaking = false;
    const previousVoicesChanged = adapter?.onvoiceschanged ?? null;
    const onVoicesChanged = (): void => {
        current = listVoices(adapter);
        listeners.forEach((listener) => listener());
        previousVoicesChanged?.(new Event("voiceschanged"));
    };
    if (adapter !== null) adapter.onvoiceschanged = onVoicesChanged;

    const consume = (): void => {
        if (speaking || adapter === null || queue.length === 0) return;
        const next = queue.shift();
        if (next === undefined) return;
        speaking = true;
        const parts =
            next.settings.language === "both"
                ? [next.text.en, next.text.yue]
                : [next.settings.language === "yue" ? next.text.yue : next.text.en];
        let index = 0;
        const speakPart = (): void => {
            const utterance = new SpeechSynthesisUtterance(parts[index] ?? "");
            const language: "en" | "yue" =
                next.settings.language === "both"
                    ? index === 0
                        ? "en"
                        : "yue"
                    : next.settings.language;
            const selected = resolveVoiceStatus(
                current,
                language === "yue" ? next.settings.cantoneseVoiceId : next.settings.englishVoiceId,
                language,
            ).effective;
            if (selected !== null) {
                const real = adapter
                    .getVoices()
                    .find((voice) => stableVoiceId(voice) === selected.id);
                if (real !== undefined) utterance.voice = real;
            }
            utterance.rate = next.settings.rate;
            utterance.pitch = next.settings.pitch;
            utterance.lang = language === "yue" ? "yue-HK" : "en-US";
            const done = (): void => {
                index += 1;
                if (index < parts.length) speakPart();
                else {
                    speaking = false;
                    consume();
                }
            };
            utterance.onend = done;
            utterance.onerror = done;
            adapter.speak(utterance);
        };
        speakPart();
    };

    return {
        voices: () => current,
        refresh: onVoicesChanged,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        speak: (settings, text, category, context = {}) => {
            if (
                !settings.enabled ||
                settings.quietHours ||
                context.screenReaderActive ||
                context.reducedSound ||
                adapter === null
            )
                return;
            const now = Date.now();
            const priority = category.toLowerCase().startsWith("error") ? 2 : 1;
            if (priority < 2 && now - (lastSpoken.get(category) ?? 0) < settings.cooldownMs) return;
            lastSpoken.set(category, now);
            const existing = queue.findIndex((item) => item.category === category);
            if (existing >= 0) queue.splice(existing, 1);
            if (priority >= 2) queue.splice(0, queue.length);
            queue.push({ settings, text, category, priority });
            if (queue.length > 8) queue.splice(0, queue.length - 8);
            consume();
        },
        dispose: () => {
            if (adapter !== null) {
                adapter.cancel();
                adapter.onvoiceschanged = previousVoicesChanged;
            }
            queue.length = 0;
            listeners.clear();
            speaking = false;
        },
    };
}
