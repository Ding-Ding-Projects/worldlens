<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertOutline,
    mdiCheckCircle,
    mdiChevronRight,
    mdiExitRun,
    mdiKeyOutline,
} from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VIcon,
    VMenu,
    VProgressLinear,
    VSlider,
    VSwitch,
} from "vuetify/components";
import {
    createSuperConfirmGate,
    returnFocusTo,
    GATE_COMPLETION_HOLD_MS,
    GATE_TRAVEL_END,
    GATE_TRAVEL_START,
} from "../confirm/superConfirmGate.js";
import { useDialogEmoji } from "../setup/dialogEmoji.js";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import type { ActionArtworkId } from "../actionArtwork/actionArtwork.js";
import { playActionCue } from "../../stores/actionSounds.js";

/**
 * Super confirmation for a destructive action, anchored beside the control that
 * starts it.
 *
 * The contract asks for an anchored surface where the layout can host one, and
 * this one can: the delete control sits in a card with room beneath it. Two
 * independent keys arm a full-range slider, and nothing happens until both keys
 * are on and the slider has travelled its whole range. Emergency exit and Escape
 * cancel without touching anything, and focus returns to the control that opened
 * the gate.
 *
 * The facts are props, not decoration. Whatever tone the surrounding copy takes,
 * `action` and `affected` still name exactly what is destroyed and that it
 * cannot be undone. That is the one part of this component that no language mode
 * and no funny level is allowed to soften, because the caller supplies it and the
 * caller is the screen that knows which file is about to go.
 *
 * The arithmetic of the gate itself lives in `../confirm/superConfirmGate.ts`, shared
 * with `MenuSuperConfirm.vue`. This file is the anchored presentation of it and
 * nothing else; a rule that needs changing is changed there, once, for both.
 */
const props = withDefaults(
    defineProps<{
        title: string;
        /** One sentence naming exactly what happens. */
        action: string;
        /** The data that will actually be affected, item by item. */
        affected?: readonly string[];
        confirmLabel: string;
        disabled?: boolean;
        /**
         * A more specific decorative emoji for this dialog's heading, or null for none.
         * Shown only while the Show emojis in dialogs setting is on.
         */
        emoji?: string | null;
        /**
         * Optional artwork drawn across the top of the gate, as the approved design shows for
         * a configuration deletion. Decorative framing only: the facts stay in `action` and
         * `affected`, so a gate without artwork says exactly as much.
         */
        artwork?: ActionArtworkId | null;
    }>(),
    { affected: () => [], disabled: false, artwork: null },
);

const emit = defineEmits<{
    confirm: [];
    open: [];
    progress: [{ keyOne: boolean; keyTwo: boolean; travel: number }];
    authorized: [{ keyOne: true; keyTwo: true; travel: 100 }];
}>();

const { t } = useI18n();

const open = ref(false);
const activator = ref<HTMLElement | null>(null);
const headingEmoji = useDialogEmoji(
    () => "destructive",
    () => props.emoji,
);

const gate = createSuperConfirmGate(() => {
    playActionCue("destructive");
    emit("authorized", { keyOne: true, keyTwo: true, travel: 100 });
    emit("confirm");
});

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);
const affectedList = computed<readonly string[]>(() => props.affected ?? []);

const armed = gate.armed;

/** The word under each key's name: whether it has been turned yet. */
function keyState(turned: boolean): string {
    return turned
        ? t("config.confirm.keyTurned", "turned")
        : t("config.confirm.keyNotYet", "not yet");
}
const done = computed(() => gate.authorized.value);

/**
 * The completion hold, cleared on unmount.
 *
 * Every consumer of this gate deletes the thing the gate was anchored to, so the usual
 * outcome of authorizing is that this component is torn down while the timer is still
 * pending. A timer that survives that would call into a dead component.
 */
let holdTimer: ReturnType<typeof setTimeout> | null = null;

function clearHold(): void {
    if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
    }
}

onBeforeUnmount(clearHold);

watch(open, (value) => {
    if (value) {
        clearHold();
        gate.reset();
        return;
    }
    clearHold();
    // Focus goes back where it came from, whether the gate completed or not.
    returnFocusTo(activator.value);
});

function onTravel(value: number): void {
    gate.travelTo(value);
    emit("progress", {
        keyOne: gate.keyOne.value,
        keyTwo: gate.keyTwo.value,
        travel: gate.travel.value,
    });
    if (!gate.authorized.value) return;

    // Authorized. Hold the completion state long enough to be seen, then close, which is
    // what puts focus back on the control the user was standing on.
    clearHold();
    holdTimer = setTimeout(() => {
        holdTimer = null;
        open.value = false;
    }, GATE_COMPLETION_HOLD_MS);
}

/** A slider let go before the end springs back, so a slip cannot destroy anything. */
function onRelease(): void {
    gate.release();
}
function onKeyOne(value: boolean | null): void {
    gate.keyOne.value = value === true;
    emit("progress", {
        keyOne: gate.keyOne.value,
        keyTwo: gate.keyTwo.value,
        travel: gate.travel.value,
    });
}
function onKeyTwo(value: boolean | null): void {
    gate.keyTwo.value = value === true;
    emit("progress", {
        keyOne: gate.keyOne.value,
        keyTwo: gate.keyTwo.value,
        travel: gate.travel.value,
    });
}

/**
 * The Escape path, spelled out rather than left to the overlay.
 *
 * Vuetify closes a menu on Escape by itself, but only while focus is inside the overlay's
 * own content tree, and the contract asks for Escape and the platform back path as a
 * guarantee rather than as a default that happens to hold. Handling it here means the card
 * cancels from wherever inside it the key is pressed, including from the slider, which is
 * exactly where somebody having second thoughts will be.
 */
function cancel(): void {
    open.value = false;
}
</script>

<template>
    <span ref="activator" class="mb-config-confirm__anchor">
        <slot
            name="activator"
            :props="{
                onClick: () => {
                    open = true;
                    emit('open');
                },
                disabled: isDisabled,
            }"
        />

        <!--
            `target` anchors the gate to the control without also binding a click
            handler to it. `activator` would do both, and the slot's own onClick
            already opens the gate, so the two would fight over every click.
        -->
        <v-menu
            v-model="open"
            target="parent"
            :close-on-content-click="false"
            location="bottom end"
            offset="8"
        >
            <v-card
                class="mb-config-confirm"
                :class="{ 'mb-config-confirm--authorized': done }"
                role="dialog"
                :aria-label="title"
                @keydown.esc.stop="cancel"
            >
                <ActionArtwork
                    v-if="props.artwork !== null && props.artwork !== undefined"
                    class="mb-config-confirm__artwork"
                    :artwork="props.artwork"
                    eager
                />
                <v-card-text>
                    <div class="mb-config-confirm__head">
                        <v-icon
                            :icon="mdiAlertOutline"
                            color="error"
                            size="26"
                            aria-hidden="true"
                        />
                        <h3 class="mb-config-confirm__title">
                            <span
                                v-if="headingEmoji !== null"
                                class="mb-config-confirm__emoji mb-dialog-emoji"
                                aria-hidden="true"
                                >{{ headingEmoji }}</span
                            >{{ title }}
                        </h3>
                    </div>

                    <p class="mb-config-confirm__action">{{ action }}</p>

                    <ul v-if="affectedList.length" class="mb-config-confirm__affected">
                        <li v-for="item in affectedList" :key="item">{{ item }}</li>
                    </ul>

                    <p class="mb-config-confirm__step">
                        {{
                            t(
                                "config.confirm.keys",
                                "Turn both keys, then drag the slider all the way across.",
                            )
                        }}
                    </p>

                    <!--
                        Two key cards side by side, each an outlined tile holding a real switch and the
                        word for its state underneath. The tile turns primary when its key is on, so the
                        pair reads at a glance as one turned and one not, as in the approved design.
                    -->
                    <div class="mb-config-confirm__keys">
                        <div
                            class="mb-config-confirm__key-card"
                            :class="{ 'mb-config-confirm__key-card--on': gate.keyOne.value }"
                        >
                            <v-switch
                                :model-value="gate.keyOne.value"
                                class="mb-config-confirm__key mb-config-confirm__key--one"
                                :label="t('config.confirm.keyOne', 'Key 1')"
                                :prepend-icon="mdiKeyOutline"
                                color="primary"
                                density="compact"
                                hide-details
                                inset
                                @update:model-value="onKeyOne"
                            />
                            <span class="mb-config-confirm__key-state" aria-hidden="true">{{
                                keyState(gate.keyOne.value)
                            }}</span>
                        </div>
                        <div
                            class="mb-config-confirm__key-card"
                            :class="{ 'mb-config-confirm__key-card--on': gate.keyTwo.value }"
                        >
                            <v-switch
                                :model-value="gate.keyTwo.value"
                                class="mb-config-confirm__key mb-config-confirm__key--two"
                                :label="t('config.confirm.keyTwo', 'Key 2')"
                                :prepend-icon="mdiKeyOutline"
                                color="primary"
                                density="compact"
                                hide-details
                                inset
                                @update:model-value="onKeyTwo"
                            />
                            <span class="mb-config-confirm__key-state" aria-hidden="true">{{
                                keyState(gate.keyTwo.value)
                            }}</span>
                        </div>
                    </div>

                    <!--
                        The full-range slider, drawn as the design's pill track: the progress fill runs
                        behind the thumb while it travels, the chevron rides on the thumb, and the words
                        in the middle say what the track is waiting for. The slider is the real control;
                        everything else in the pill is decoration hidden from assistive technology,
                        because the status sentence below already says the same thing.
                    -->
                    <div
                        class="mb-config-confirm__track"
                        :class="{
                            'mb-config-confirm__track--armed': armed && !done,
                            'mb-config-confirm__track--done': done,
                        }"
                        :style="{ '--mb-config-confirm-travel': `${gate.percent.value}%` }"
                    >
                        <v-progress-linear
                            class="mb-config-confirm__progress"
                            :class="{
                                'mb-config-confirm__progress--live': gate.phase.value === 'moving',
                            }"
                            :model-value="gate.travel.value"
                            :color="done ? 'success' : 'error'"
                            bg-opacity="0"
                            height="36"
                            rounded
                            striped
                            aria-hidden="true"
                        />
                        <span class="mb-config-confirm__track-label" aria-hidden="true">{{
                            done
                                ? t("config.confirm.done", "Authorized.")
                                : armed
                                  ? confirmLabel
                                  : t("config.confirm.trackLocked", "Turn both keys first")
                        }}</span>
                        <v-slider
                            class="mb-config-confirm__slider"
                            :model-value="gate.travel.value"
                            :min="GATE_TRAVEL_START"
                            :max="GATE_TRAVEL_END"
                            :step="1"
                            :disabled="!armed || done"
                            :aria-label="confirmLabel"
                            :aria-valuetext="
                                t(
                                    'config.confirm.travel',
                                    { percent: gate.percent.value },
                                    '{percent} percent of the way across',
                                )
                            "
                            :thumb-size="36"
                            :track-size="0"
                            color="error"
                            hide-details
                            @update:model-value="onTravel"
                            @end="onRelease"
                        />
                        <v-icon
                            class="mb-config-confirm__chevron"
                            :icon="done ? mdiCheckCircle : mdiChevronRight"
                            size="20"
                            aria-hidden="true"
                        />
                    </div>

                    <p class="mb-config-confirm__status" role="status" aria-live="polite">
                        <template v-if="done">
                            <v-icon
                                :icon="mdiCheckCircle"
                                color="success"
                                size="18"
                                class="mb-config-confirm__tick"
                            />
                            {{ t("config.confirm.done", "Authorized.") }}
                        </template>
                        <template v-else-if="!armed">
                            {{
                                t(
                                    "config.confirm.locked",
                                    "Both keys are needed before the slider will move.",
                                )
                            }}
                        </template>
                        <template v-else>
                            {{
                                t(
                                    "config.confirm.armed",
                                    "Armed. Drag the slider to the end to confirm.",
                                )
                            }}
                        </template>
                    </p>
                </v-card-text>

                <v-card-actions class="mb-config-confirm__actions">
                    <v-btn
                        class="mb-config-confirm__exit"
                        :prepend-icon="mdiExitRun"
                        variant="outlined"
                        @click="cancel"
                    >
                        {{ t("config.confirm.exit", "Emergency exit") }}
                    </v-btn>
                    <span
                        class="mb-config-confirm__label"
                        :class="{ 'mb-config-confirm__label--done': done }"
                        >{{ confirmLabel }}</span
                    >
                </v-card-actions>
            </v-card>
        </v-menu>
    </span>
</template>

<style>
.mb-config-confirm__anchor {
    display: inline-flex;
}

/*
 * Bounded by the viewport rather than by a fixed width alone. At 200% display scale on a
 * small laptop the anchored card is most of the screen, and a fixed 420px there is a card
 * whose Emergency exit sits off the edge.
 */
.mb-config-confirm.v-card {
    width: min(560px, calc(100vw - 32px));
    max-width: 560px;
    overflow: hidden;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-extra-large);
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: var(--md-sys-elevation-shadow-level3);
}

.mb-config-confirm .v-card-text {
    padding: 22px 26px 8px;
}

.mb-config-confirm .v-card-actions {
    padding: 8px 26px 24px;
}

.mb-config-confirm.v-card .v-btn {
    border-radius: var(--md-sys-shape-corner-full);
    text-transform: none;
    letter-spacing: normal;
}

.mb-config-confirm__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-config-confirm__title {
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: 500;
    line-height: var(--md-sys-typescale-title-large-line-height, 1.75rem);
}

.mb-config-confirm__emoji {
    margin-inline-end: 8px;
}

.mb-config-confirm__action {
    margin-block-start: 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
}

.mb-config-confirm__affected {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.mb-config-confirm__step,
.mb-config-confirm__status {
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-confirm__status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    margin-block-start: 4px;
}

/* Both keys stay operable side by side down to the narrowest supported width. */
.mb-config-confirm__key {
    flex: 1 1 8rem;
}

.mb-config-confirm__exit {
    min-height: 40px;
}

.mb-config-confirm__progress {
    transition: none;
}

.mb-config-confirm__progress--live {
    animation: mb-config-confirm-pulse var(--md-sys-motion-duration-extra-long3) ease-in-out
        infinite;
}

.mb-config-confirm--authorized {
    animation: mb-config-confirm-flash var(--md-sys-motion-duration-medium4) ease-out;
}

.mb-config-confirm__tick {
    animation: mb-config-confirm-pop var(--md-sys-motion-duration-medium1) ease-out;
}

.mb-config-confirm__label {
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
}

/* ---------------------------------------------------------------------------
 * The approved design's gate anatomy: optional artwork across the top, the warning heading,
 * the affected list in mono, two key cards, the pill track the slider rides in, and the
 * Emergency exit beside the name of what the slider authorises.
 * ------------------------------------------------------------------------- */
.mb-config-confirm__artwork {
    margin: 0;
    border-style: none;
    border-radius: 0;
    aspect-ratio: auto;
    block-size: 150px;
}

.mb-config-confirm__affected {
    list-style: none;
}

.mb-config-confirm__step {
    margin-block-start: 16px;
}

.mb-config-confirm__keys {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-block: 12px 0;
}

.mb-config-confirm__key-card {
    display: flex;
    flex: 1 1 10rem;
    flex-direction: column;
    justify-content: center;
    min-block-size: 56px;
    padding: 4px 14px 6px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-medium);
}

.mb-config-confirm__key-card--on {
    border-color: rgb(var(--v-theme-primary));
}

.mb-config-confirm__key-state {
    padding-inline-start: 40px;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
}

.mb-config-confirm__track {
    position: relative;
    block-size: 48px;
    margin-block-start: 16px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-full);
    background: rgb(var(--v-theme-surface));
}

.mb-config-confirm__track--armed {
    border-color: rgb(var(--v-theme-error));
}

.mb-config-confirm__track--done {
    border-color: rgb(var(--v-theme-success));
}

.mb-config-confirm__track .mb-config-confirm__progress {
    position: absolute;
    inset: 5px;
    inline-size: auto;
    block-size: 36px;
    opacity: 0.32;
}

.mb-config-confirm__track-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding-inline: 56px;
    font-size: var(--md-sys-typescale-body-medium-size);
    color: rgb(var(--v-theme-on-surface-variant));
    pointer-events: none;
    text-align: center;
}

.mb-config-confirm__slider.v-input {
    position: absolute;
    inset-block: 0;
    inset-inline: 23px;
    margin: 0;
}

.mb-config-confirm__slider .v-input__control {
    min-block-size: 46px;
}

.mb-config-confirm__slider .v-slider-thumb__surface {
    background: rgb(var(--v-theme-surface-container-highest));
}

.mb-config-confirm__track--armed .mb-config-confirm__slider .v-slider-thumb__surface {
    background: rgb(var(--v-theme-error));
}

.mb-config-confirm__chevron {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: calc(23px + (100% - 46px) * var(--mb-config-confirm-travel, 0%) / 100%);
    translate: -50% -50%;
    color: rgb(var(--v-theme-on-surface-variant));
    pointer-events: none;
}

.mb-config-confirm__track--armed .mb-config-confirm__chevron {
    color: rgb(var(--v-theme-on-error));
}

.mb-config-confirm__actions {
    display: flex;
    gap: 10px;
}

.mb-config-confirm__actions .mb-config-confirm__exit {
    flex: 1 1 0;
    min-block-size: 44px;
}

.mb-config-confirm__label {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-block-size: 44px;
    text-align: center;
}

.mb-config-confirm__label--done {
    color: rgb(var(--v-theme-success));
}

@keyframes mb-config-confirm-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.55;
    }
}

@keyframes mb-config-confirm-pop {
    from {
        transform: scale(0.4);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes mb-config-confirm-flash {
    from {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.55);
    }
    to {
        box-shadow: 0 0 0 14px rgba(var(--v-theme-success), 0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-confirm__progress--live,
    .mb-config-confirm--authorized,
    .mb-config-confirm__tick {
        animation: none !important;
    }

    .mb-config-confirm,
    .mb-config-confirm * {
        transition-duration: 0.01ms !important;
    }
}
</style>
