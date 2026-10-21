import { reactive, watch } from "vue";
import { schoolModeEnabled } from "../setup/schoolMode.js";
import { loadRuntimeSettings } from "../runtimeSettings/index.js";

const KEY = "worldlens-vocabulary-sounds";
function readPreferences(): { muted: boolean; volume: number } {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
            muted?: unknown;
            volume?: unknown;
        } | null;
        return {
            muted: value?.muted === true,
            volume:
                typeof value?.volume === "number" && Number.isFinite(value.volume)
                    ? Math.max(0, Math.min(1, value.volume))
                    : 0.5,
        };
    } catch {
        return { muted: false, volume: 0.5 };
    }
}
export const vocabularySounds = reactive(readPreferences());
watch(vocabularySounds, (value) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        /* Preferences are best effort; vocabulary persistence remains explicit. */
    }
});

type SoundBridge = {
    outcomeSound?: (
        cue: "success" | "invalid",
    ) => Promise<{ available: boolean; dataUrl?: string }>;
};
export async function playVocabularyOutcome(success: boolean): Promise<void> {
    const suppressed = (): boolean =>
        vocabularySounds.muted ||
        vocabularySounds.volume === 0 ||
        schoolModeEnabled() ||
        loadRuntimeSettings().values.narrator.quietHours;
    if (suppressed()) return;
    const bridge = window.worldlens?.vocabulary as SoundBridge | undefined;
    if (bridge?.outcomeSound === undefined) return;
    try {
        const result = await bridge.outcomeSound(success ? "success" : "invalid");
        if (!result.available || result.dataUrl === undefined || suppressed()) return;
        const audio = new Audio(result.dataUrl);
        audio.volume = vocabularySounds.volume;
        await audio.play();
    } catch {
        /* Muted devices and blocked playback never block the operation. */
    }
}
