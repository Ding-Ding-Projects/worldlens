<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCheckCircle, mdiExitRun, mdiKeyOutline } from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VDialog,
    VDivider,
    VIcon,
    VProgressLinear,
    VSlider,
    VSpacer,
    VSwitch,
} from "vuetify/components";
import {
    createSuperConfirmGate,
    returnFocusTo,
    GATE_COMPLETION_HOLD_MS,
    GATE_TRAVEL_END,
    GATE_TRAVEL_START,
} from "../confirm/superConfirmGate.js";

/**
 * Super confirmation gate for a destructive action, built in the app's own renderer.
 *
 * Two independently operated keys arm a full-range slider; nothing happens until both keys
 * are on and the slider has travelled its whole range. Emergency exit and Escape cancel
 * without touching anything. The wording around it may be styled, but the facts it states
 * (what is destroyed, and that it cannot be undone) are fixed props, not decoration.
 *
 * This is the modal half of the pair. `ConfigSuperConfirm.vue` anchors itself beside the
 * control it guards, which the contract prefers and the config screens can host; the
 * surfaces that reach for this one cannot. The settings menu is a narrow side sheet whose
 * own width is the whole surface, so an anchored card beside a row in it would either
 * overhang the sheet or be narrower than the sentence it has to say. Where there is nowhere
 * to anchor, the contract allows a dialog, and this is that case rather than a second
 * default.
 *
 * The rule the two share lives once, in `../confirm/superConfirmGate.ts`. Everything in
 * this file is presentation: which surface, which class names, which animation.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Dialog heading, e.g. "Reset all settings". */
        title: string;
        /** One sentence naming exactly what happens. */
        action: string;
        /** Bullet list of the data that will actually be affected. */
        affected?: readonly string[];
        /** Label of the final confirm affordance. */
        confirmLabel: string;
    }>(),
    { affected: () => [] },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirm: [] }>();

const { t } = useI18n();

const gate = createSuperConfirmGate(() => emit("confirm"));

const armed = gate.armed;
const done = computed(() => gate.authorized.value);
const affectedList = computed<readonly string[]>(() => props.affected ?? []);

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

/**
 * Where focus was when the gate opened, so cancelling can put it back.
 *
 * A modal has no activator slot to read it from, so it is remembered instead. The contract
 * asks for the return in both outcomes, and nothing about a dialog gives it for free: a
 * cancelled overlay drops focus onto `<body>`, and the next Tab restarts from the top of
 * the page rather than from the row the user was on.
 */
let opener: HTMLElement | null = null;

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
        const active = document.activeElement;
        opener = active instanceof HTMLElement ? active : null;
        return;
    }
    clearHold();
    returnFocusTo(opener);
    opener = null;
});

function onTravel(value: number): void {
    if (!gate.travelTo(value)) return;

    // Authorized. The completion state is held long enough to be seen, then the dialog
    // closes itself, which is what returns focus.
    clearHold();
    holdTimer = setTimeout(() => {
        holdTimer = null;
        open.value = false;
    }, GATE_COMPLETION_HOLD_MS);
}

function onRelease(): void {
    gate.release();
}

function cancel(): void {
    open.value = false;
}
</script>

<template>
    <v-dialog v-model="open" max-width="440" scrollable>
        <v-card
            class="mb-super-confirm"
            :class="{ 'mb-super-confirm--authorized': done }"
            :aria-label="title"
            @keydown.esc.stop="cancel"
        >
            <v-card-text>
                <div class="mb-super-confirm__head">
                    <v-icon :icon="mdiAlertOutline" color="error" size="28" aria-hidden="true" />
                    <h2 class="mb-super-confirm__title">{{ title }}</h2>
                </div>

                <p class="mb-super-confirm__action">{{ action }}</p>

                <ul v-if="affectedList.length" class="mb-super-confirm__affected">
                    <li v-for="item in affectedList" :key="item">{{ item }}</li>
                </ul>

                <v-divider class="my-3" />

                <p class="mb-super-confirm__step">
                    {{ t("superConfirm.keys", "Turn both keys, then drag the slider all the way.") }}
                </p>

                <div class="mb-super-confirm__keys">
                    <v-switch
                        v-model="gate.keyOne.value"
                        class="mb-super-confirm__key mb-super-confirm__key--one"
                        :label="t('superConfirm.keyOne', 'Key 1')"
                        :prepend-icon="mdiKeyOutline"
                        color="error"
                        density="compact"
                        hide-details
                        inset
                    />
                    <v-switch
                        v-model="gate.keyTwo.value"
                        class="mb-super-confirm__key mb-super-confirm__key--two"
                        :label="t('superConfirm.keyTwo', 'Key 2')"
                        :prepend-icon="mdiKeyOutline"
                        color="error"
                        density="compact"
                        hide-details
                        inset
                    />
                </div>

                <v-slider
                    class="mb-super-confirm__slider"
                    :model-value="gate.travel.value"
                    :min="GATE_TRAVEL_START"
                    :max="GATE_TRAVEL_END"
                    :step="1"
                    :disabled="!armed || done"
                    :aria-label="confirmLabel"
                    :aria-valuetext="
                        t('superConfirm.travel', { percent: gate.percent.value }, '{percent} percent of the way across')
                    "
                    color="error"
                    hide-details
                    @update:model-value="onTravel"
                    @end="onRelease"
                />

                <v-progress-linear
                    class="mb-super-confirm__progress"
                    :class="{ 'mb-super-confirm__progress--live': gate.phase.value === 'moving' }"
                    :model-value="gate.travel.value"
                    :color="done ? 'success' : 'error'"
                    height="6"
                    rounded
                    striped
                    aria-hidden="true"
                />

                <p class="mb-super-confirm__status" role="status" aria-live="polite">
                    <template v-if="done">
                        <v-icon :icon="mdiCheckCircle" color="success" size="18" class="mb-super-confirm__tick" />
                        {{ t("superConfirm.done", "Authorized.") }}
                    </template>
                    <template v-else-if="!armed">
                        {{ t("superConfirm.locked", "Both keys are needed before the slider moves.") }}
                    </template>
                    <template v-else>
                        {{ t("superConfirm.armed", "Armed. Drag the slider to the end to confirm.") }}
                    </template>
                </p>
            </v-card-text>

            <v-card-actions>
                <v-btn
                    class="mb-super-confirm__exit"
                    :prepend-icon="mdiExitRun"
                    color="primary"
                    variant="tonal"
                    @click="cancel"
                >
                    {{ t("superConfirm.exit", "Emergency exit") }}
                </v-btn>
                <v-spacer />
                <span class="mb-super-confirm__label">{{ confirmLabel }}</span>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style>
/* ===========================================================================
 * Appearance only. Nothing below reaches the gate.
 *
 * The two keys, the full-range slider, the emergency exit, Escape, and the focus that goes
 * back where it came from are all in the script above and in
 * `../confirm/superConfirmGate.ts`; not one of them is expressible in CSS and not one of them
 * is touched here. What is touched is that this dialog used to arrive in stock Vuetify - a
 * Material 2 corner, a three-shadow elevation and a heading a point and a half above its own
 * body copy - because, exactly as `MenuRegexBuilder.vue` explains at length, Vuetify teleports
 * `.v-overlay-container` to `<body>` and every rule in `prototypeSurface.scss` is scoped
 * under `.v-application` or `.mb-shell-layer`, so none of them can see a dialog.
 *
 * One thing the styling must never do is soften what the gate says. The heading names the
 * destructive action, the sentence under it names what happens, the list names what is
 * affected, and every one of those keeps a full-strength `on-surface`: quieting a warning to
 * make a dialog look calmer is the failure this whole surface exists to prevent.
 * ------------------------------------------------------------------------- */
.mb-super-confirm.v-card {
    /*
     * M3's dialog corner - the one shape in the scale reserved for a surface that takes the
     * whole screen's attention, which is what this one is for.
     */
    border-radius: var(--md-sys-shape-corner-xl);
    background: rgb(var(--v-theme-surface-container-high));
    color: rgb(var(--v-theme-on-surface));
    border: 1px solid rgb(var(--v-theme-outline-variant));
    /* M3 puts a dialog at level 3, a step above the anchored menus at level 2. */
    box-shadow: var(--md-sys-elevation-shadow-level3);
}

.mb-super-confirm .v-card-text {
    padding: 24px 24px 8px;
}

.mb-super-confirm .v-card-actions {
    padding: 8px 24px 24px;
    gap: 8px;
}

.mb-super-confirm .v-divider {
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

/*
 * Three classes deep, and the `.v-card` half of the compound is load-bearing rather than
 * tidy. `copy/bilingual.css` grows every button in the application for a second language with
 * `html[data-language-mode="bilingual"] .v-btn { height: auto; min-height: 36px }`, which is
 * right and which out-ranks a two-class rule here; a logical `min-block-size` and a physical
 * `min-height` cascade as one property, so this floor would have dropped to 36px in bilingual
 * mode. On the surface that gates a destructive action, the buttons quietly shrinking in one
 * language mode is not a cosmetic difference.
 */
.mb-super-confirm.v-card .v-btn {
    border-radius: var(--md-sys-shape-corner-full);
    min-block-size: 40px;
    font-size: var(--md-sys-typescale-label-large-size);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    text-transform: none;
}

.mb-super-confirm__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

/*
 * M3's headline-small, which is the ramp a dialog title takes. The old 1.125rem sat one
 * eighth of a rem above the 0.875rem sentence beneath it - close enough that the two read as
 * one paragraph, on the one surface where a person has to notice the heading before they read
 * anything else.
 */
.mb-super-confirm__title {
    font-size: var(--md-sys-typescale-headline-small-size);
    line-height: var(--md-sys-typescale-headline-small-line-height);
    font-weight: var(--md-sys-typescale-headline-small-weight);
    letter-spacing: var(--md-sys-typescale-headline-small-tracking);
}

/*
 * The sentence that names what is about to happen, and the list of what it happens to. Both
 * at body-medium in full-strength `on-surface`: this is the text the decision is made from,
 * so it is deliberately the one thing on the surface that is not dimmed.
 */
.mb-super-confirm__action {
    margin-block-start: 8px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
    color: rgb(var(--v-theme-on-surface));
}

.mb-super-confirm__affected {
    margin: 8px 0 0 1.2em;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

/*
 * The instruction and the live status are about how to operate the gate rather than about
 * what it does, so they drop a step to body-small in the variant colour - the same pair every
 * other piece of supporting text in this design uses.
 */
.mb-super-confirm__step,
.mb-super-confirm__status {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-super-confirm__status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    margin-block-start: 4px;
}

.mb-super-confirm__keys {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-block: 4px 8px;
}

/* Both keys stay operable side by side down to the narrowest supported width. */
.mb-super-confirm__key {
    flex: 1 1 8rem;
}

/*
 * The way out, always available and never smaller than the floor. It is the only control on
 * this surface a person may need in a hurry, so it keeps its own height rule even though the
 * `.v-btn` block above already grants it - a later retune of that block must not be able to
 * shrink the emergency exit by accident.
 *
 * That is also why it is written three deep rather than as the bare `.mb-super-confirm__exit`
 * it used to be. A single class loses to `copy/bilingual.css`'s `html[data-language-mode=
 * "bilingual"] .v-btn { min-height: 36px }` at (0,2,1), so the one control on this surface
 * that is described as never being smaller than the floor was the one control actually below
 * it, in one language mode, with nothing on screen to say so.
 */
.mb-super-confirm.v-card .mb-super-confirm__exit {
    min-height: 40px;
}

/* ---------------------------------------------------------------------------
 * The three animations, on the token ladder rather than on numbers typed here.
 *
 * These were the last hand-written durations and curves left in the menu directory, and they
 * are the ones that matter most: this is the only surface in the application where motion is
 * carrying information rather than polish. The slider is being held, the gate has opened, the
 * decision has been taken - a person watching those three moments is reading them, so they
 * have to keep their character while still moving to the same clock as everything else. A
 * global retune of the motion scale now reaches them too, which is the point of a scale.
 * ------------------------------------------------------------------------- */

/*
 * No transition at all, deliberately: the bar is a readout of exactly where the slider is,
 * and a bar easing towards a thumb that has already stopped is a bar reporting a position
 * the gate is not in. On this surface that is a lie about how far through a destructive
 * authorization somebody is.
 */
.mb-super-confirm__progress {
    transition: none;
}

/*
 * The breathing pulse while the slider is being dragged - an ambient loop rather than a
 * transition, which is why its duration is the only one on this surface that is not a bare
 * token: M3's ladder describes how long a change takes and stops at 600ms, and a loop is not
 * a change. It is written as a multiple of the longest step instead of as a fourth number
 * nobody can trace, so it still moves when the scale does.
 *
 * `easing-standard` is M3's symmetric in-and-out curve, which is what a breath is; an
 * accelerate or decelerate curve would give the loop a direction and make it read as
 * something repeatedly arriving.
 */
.mb-super-confirm__progress--live {
    animation: mb-super-confirm-pulse calc(var(--md-sys-motion-duration-long4) * 1.5)
        var(--md-sys-motion-easing-standard) infinite;
}

/*
 * The ring that goes out from the dialog once both keys and the full travel are in. An
 * expanding ring is a thing leaving, and `medium4` is the longest single step - long enough
 * to be seen finishing on the frame the gate opens, short enough not to delay the action it
 * is announcing. The decelerate curve is what makes it dissipate rather than snap.
 */
.mb-super-confirm--authorized {
    animation: mb-super-confirm-flash var(--md-sys-motion-duration-medium4)
        var(--md-sys-motion-easing-emphasized-decelerate);
}

/*
 * The tick appearing beside "Authorized." A small element arriving takes the short end of
 * the ladder on the decelerate curve - M3's own enter pattern, and the same pairing the
 * drawer's rows and the search field's unrolling already use.
 */
.mb-super-confirm__tick {
    animation: mb-super-confirm-pop var(--md-sys-motion-duration-medium1)
        var(--md-sys-motion-easing-emphasized-decelerate);
}

/*
 * The name of what the slider authorises, sitting where a confirm button would be on any
 * other dialog - which is the point: there is deliberately nothing to press there. It takes a
 * button's own label ramp so it reads as the thing the slider is aimed at rather than as a
 * caption, at full `on-surface` strength, because it names a destructive action.
 */
.mb-super-confirm__label {
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    color: rgb(var(--v-theme-on-surface));
}

@keyframes mb-super-confirm-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.55;
    }
}

@keyframes mb-super-confirm-pop {
    from {
        transform: scale(0.4);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes mb-super-confirm-flash {
    from {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-success), 0.55);
    }
    to {
        box-shadow: 0 0 0 14px rgba(var(--v-theme-success), 0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-super-confirm__progress--live,
    .mb-super-confirm--authorized,
    .mb-super-confirm__tick {
        animation: none !important;
    }

    .mb-super-confirm,
    .mb-super-confirm * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
