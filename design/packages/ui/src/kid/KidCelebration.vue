<script setup lang="ts">
/**
 * The level-up and sticker moment.
 *
 * Fired only from `KidShell.vue`'s own `award()`, which only calls `useKidProgress().award()` from
 * a real completion event, so this can never celebrate something that did not happen. It is a
 * notice, not a dialog: it never blocks, it dismisses itself on the notice-duration level the whole
 * notification system already reads, and with reduced motion it appears without animating - the
 * animation class is gated internally, on `mayAnimate` alone, which is why `KidShell.vue` mounts
 * this component unconditionally rather than behind `v-if="mayAnimate"` (kid-mode drop-in audit,
 * defect 15: gating the whole component on that flag meant a user with celebrations on but the OS
 * asking for reduced motion never saw a celebration at all).
 *
 * Sound is a short synthesised chime through the Web Audio API, played only when kid mode's own
 * `sound` preference is on. This checkout bundles no audio asset for a celebration chime and adds
 * no network fetch to get one, so a synthesised tone is the honest way to keep the doc comment this
 * file used to carry ("sound is off unless kid mode's sound preference is on") actually true rather
 * than aspirational; there is no separate "reduced sound" or "quiet hours" setting anywhere in this
 * checkout to also consult; if one is added later, it belongs beside `kid.sound` in `kidMode.ts`.
 */
import { onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { noticeDurationLevelByNumber } from "../components/config/noticeDurationLevels.js";
import { readNoticeDurationLevel } from "../components/config/noticeDurationPrefs.js";
import { useKidMode, useMayAnimate } from "./kidMode.js";

const { t } = useI18n();
const kid = useKidMode();
const mayAnimate = useMayAnimate(kid);
const shown = ref<{ title: string; body: string } | null>(null);

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer(): void {
    if (dismissTimer !== null) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }
}

/**
 * A short, synthesised two-note chime - never a bundled or fetched audio file, per this file's own
 * doc comment. Wrapped defensively: `AudioContext` does not exist in the Vitest/jsdom environment
 * this component is unit-tested in, and a browser may refuse to create one before any user gesture
 * has occurred on the page, neither of which should ever turn "celebrate a finished job" into a
 * thrown error.
 */
function chime(): void {
    if (!kid.sound.value) return;
    try {
        const AudioContextCtor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor === undefined) return;
        const context = new AudioContextCtor();
        const now = context.currentTime;
        for (const [frequency, start] of [[880, 0], [1175, 0.12]] as const) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(frequency, now + start);
            gain.gain.setValueAtTime(0.0001, now + start);
            gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.28);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(now + start);
            oscillator.stop(now + start + 0.3);
        }
        // The context is disposable: nothing here keeps it alive beyond the chime, and closing it
        // frees the audio hardware handle rather than leaving one open per celebration.
        setTimeout(() => void context.close().catch(() => undefined), 500);
    } catch {
        /* A refused or unavailable AudioContext means silence, never a broken celebration. */
    }
}

defineExpose({
    /** Called from a real completion event only - see `KidShell.vue`'s own `award()`. */
    celebrate(title: string, body: string): void {
        // "Whether a celebration shows at all" is `kid.celebrations` alone; "whether it animates
        // once shown" is `mayAnimate` (celebrations AND not-reduced-motion), read in the template
        // below. Combining both into one gate on the whole component's existence - the earlier
        // version of this file's mistake - meant a user with celebrations on but the OS asking for
        // reduced motion never saw a celebration at all (kid-mode drop-in audit, defect 15).
        if (!kid.celebrations.value) return;
        shown.value = { title, body };
        chime();
        clearDismissTimer();
        // The same "how long does a toast stay" dial the rest of the notification system reads,
        // treating a celebration as the success case: `null` at level 5 means "stays until
        // dismissed", exactly as a warning or an error already does.
        const timeoutMs = noticeDurationLevelByNumber(readNoticeDurationLevel()).successTimeoutMs;
        if (timeoutMs !== null) {
            dismissTimer = setTimeout(() => {
                shown.value = null;
                dismissTimer = null;
            }, timeoutMs);
        }
    },
});

onBeforeUnmount(clearDismissTimer);

function dismiss(): void {
    clearDismissTimer();
    shown.value = null;
}
</script>

<template>
    <div v-if="shown !== null" class="wl-kid-celebrate" :class="{ 'wl-kid-celebrate--animate': mayAnimate }" role="status">
        <strong>{{ shown.title }}</strong>
        <span>{{ shown.body }}</span>
        <button type="button" @click="dismiss">{{ t("kid.celebrate.close", "Yay!") }}</button>
    </div>
</template>

<style scoped>
.wl-kid-celebrate {
    position: absolute; inset: auto 24px 24px auto; display: flex; flex-direction: column; gap: 6px;
    padding: 20px 24px; border-radius: var(--wl-kid-radius-lg);
    background: rgb(var(--v-theme-tertiary-container)); color: rgb(var(--v-theme-on-tertiary-container));
}
.wl-kid-celebrate strong { font-size: 26px; }
.wl-kid-celebrate button { min-height: var(--wl-kid-target-min); border: 0; border-radius: var(--wl-kid-radius-full); font: inherit; font-size: 20px; font-weight: 800; cursor: pointer; }
@media (prefers-reduced-motion: no-preference) {
    .wl-kid-celebrate--animate { animation: wl-kid-pop 0.4s ease-out; }
    @keyframes wl-kid-pop { 0% { transform: scale(0.7); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
}
</style>
