import { schoolModeEnabled } from "../setup/schoolMode.js";
import {
    actionSoundPrefs,
    playHostOutcomeSound,
    setActionSoundsEnabled,
    setActionSoundsVolume,
} from "../../stores/actionSounds.js";

/**
 * The personal-vocabulary outcome sounds, now one client of the application-wide action
 * sound path in `stores/actionSounds.ts`.
 *
 * `muted` and `volume` are views onto the shared preference rather than a second copy of
 * it, so the mute switch on the vocabulary row and the **Play action sounds** switch in
 * Display settings are the same setting and can never disagree. The older vocabulary-only
 * record is migrated by `readActionSoundPrefs()` the first time the shared one is read.
 */
export const vocabularySounds = {
    get muted(): boolean {
        return !actionSoundPrefs.enabled;
    },
    set muted(value: boolean) {
        setActionSoundsEnabled(value !== true);
    },
    get volume(): number {
        return actionSoundPrefs.volume;
    },
    set volume(value: number) {
        setActionSoundsVolume(value);
    },
};

/** Plays the host's success or invalid-input sound for a vocabulary drop, when allowed. */
export async function playVocabularyOutcome(success: boolean): Promise<void> {
    await playHostOutcomeSound(success, () => schoolModeEnabled());
}
