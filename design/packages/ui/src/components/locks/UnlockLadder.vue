<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VTextField } from "vuetify/components";

import { resolveDimSumCatalog, type DimSumDish } from "../dimsum/dimSumCatalog.js";
import { schoolModeEnabled } from "../setup/schoolMode.js";
import {
    DISH_MISS_LIMIT,
    MOLE_CELLS,
    MOLE_HITS_NEEDED,
    MOLE_ROUND_MS,
    SUM_COUNT,
    type Ladder,
    type LadderResult,
    type LadderView,
} from "./ladderModel.js";
import { useLockStore } from "./useLocks.js";

/**
 * Something to do while a lock makes somebody wait: the unlock ladder.
 *
 * The rungs and their rules live in `ladderModel.ts`, and the store owns the only path from
 * a won ladder to a shorter wait. This surface renders questions and passes answers through;
 * it never sees an answer key and cannot end a wait on its own. Winning returns the person to
 * the ordinary prompt, which still needs the lock's credential.
 */
const props = defineProps<{
    lockId: string;
    /** Supplied by tests. Otherwise the public catalogue, never fetched under School mode. */
    dishes?: readonly DimSumDish[] | undefined;
    /** Supplied by tests. Otherwise the live School mode state. */
    schoolMode?: boolean | undefined;
    /** Supplied by tests, to drive the clock. Real callers leave it alone. */
    tickMs?: number | undefined;
}>();

const emit = defineEmits<{
    /** Back to the prompt: the ladder was won, fell to the clock, or was left. */
    close: [];
}>();

const { t } = useI18n();
const store = useLockStore();

const ladder = shallowRef<Ladder | null>(null);
const view = shallowRef<LadderView | null>(null);
const unavailable = ref(false);
const loading = ref(true);
const sumAnswer = ref("");
const feedback = ref("");
const visible = ref<readonly number[]>([]);
const clock = ref(Date.now());
const heading = ref<HTMLElement | null>(null);
const sumField = ref<{ focus: () => void } | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

const waitSeconds = computed(() => {
    void clock.value;
    return Math.ceil(store.waitMs(props.lockId) / 1000);
});

const moleSecondsLeft = computed(() => {
    const current = view.value;
    if (current?.rung !== "moles" || current.round.endsAt === 0) return null;
    return Math.max(0, Math.ceil((current.round.endsAt - clock.value) / 1000));
});

function refresh(): void {
    if (ladder.value === null) return;
    view.value = ladder.value.view();
    const current = view.value;
    visible.value = current.rung === "moles" ? ladder.value.visibleMoles(current.round.nonce) : [];
}

async function focusHeading(): Promise<void> {
    await nextTick();
    heading.value?.focus();
}

function say(result: LadderResult): void {
    switch (result) {
        case "right":
            feedback.value = t("locks.ladder.right", "Right.");
            break;
        case "wrong":
            feedback.value = t("locks.ladder.wrong", "Not that one.");
            break;
        case "expired":
            feedback.value = t(
                "locks.ladder.expired",
                "That question timed out, so it counts as a miss.",
            );
            break;
        case "invalid":
            feedback.value = t(
                "locks.ladder.invalid",
                "That answer is not one this question accepts.",
            );
            break;
        case "stale":
            feedback.value = t("locks.ladder.stale", "That question has already been answered.");
            break;
        case "too-early":
            feedback.value = t("locks.ladder.tooEarly", "The round is still running.");
            break;
        case "capped":
            feedback.value = t(
                "locks.ladder.capped",
                "The ladder has been used as often as it can be this hour, so the wait stands.",
            );
            break;
    }
}

function after(result: LadderResult): void {
    const before = view.value?.rung;
    say(result);
    refresh();
    if (view.value?.rung !== before) void focusHeading();
}

function chooseDish(choiceId: string): void {
    const current = view.value;
    if (ladder.value === null || current?.rung !== "dimsum") return;
    after(ladder.value.answerDish(current.question.nonce, choiceId));
}

async function submitSum(): Promise<void> {
    const current = view.value;
    if (ladder.value === null || current?.rung !== "sums" || sumAnswer.value.trim() === "") return;
    const result = ladder.value.answerSum(current.question.nonce, sumAnswer.value);
    if (result !== "invalid") sumAnswer.value = "";
    after(result);
    if (view.value?.rung === "sums") {
        await nextTick();
        sumField.value?.focus();
    }
}

function startRound(): void {
    const current = view.value;
    if (ladder.value === null || current?.rung !== "moles") return;
    after(ladder.value.startMoles(current.round.nonce));
}

function whack(cell: number): void {
    const current = view.value;
    if (ladder.value === null || current?.rung !== "moles") return;
    const outcome = ladder.value.hitMole(current.round.nonce, cell);
    feedback.value =
        outcome === "hit"
            ? t("locks.ladder.hit", "Hit.")
            : outcome === "miss"
              ? t("locks.ladder.miss", "Nothing there.")
              : t("locks.ladder.outside", "The round is not running.");
    refresh();
}

/** Number keys 1 to 9 hit the cells in keypad order, so the round is playable without a pointer. */
function onGridKey(event: KeyboardEvent): void {
    if (!/^[1-9]$/.test(event.key)) return;
    event.preventDefault();
    whack(Number(event.key) - 1);
}

function tick(): void {
    clock.value = Date.now();
    const current = view.value;
    if (ladder.value !== null && current?.rung === "moles" && current.round.endsAt !== 0) {
        if (clock.value >= current.round.endsAt) {
            after(ladder.value.finishMoles(current.round.nonce));
            return;
        }
    }
    refresh();
}

function cellLabel(cell: number): string {
    return visible.value.includes(cell)
        ? t("locks.ladder.cellMole", { cell: cell + 1 }, "Cell {cell}: mole showing")
        : t("locks.ladder.cellEmpty", { cell: cell + 1 }, "Cell {cell}: empty");
}

onMounted(async () => {
    const schoolMode = props.schoolMode ?? schoolModeEnabled();
    // Under School mode the catalogue is not even fetched: the dim-sum rung is absent.
    const dishes = props.dishes ?? (schoolMode ? [] : await resolveDimSumCatalog().catch(() => []));
    ladder.value = store.startLadder(props.lockId, { schoolMode, dishes });
    loading.value = false;
    if (ladder.value === null) {
        unavailable.value = true;
    } else {
        refresh();
        timer = setInterval(tick, props.tickMs ?? 250);
    }
    await focusHeading();
});

onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
});
</script>

<template>
    <section
        class="mb-ladder"
        :aria-label="t('locks.ladder.title', 'Play instead of waiting')"
        data-test="unlock-ladder"
    >
        <h4 ref="heading" class="mb-ladder__title" tabindex="-1">
            {{ t("locks.ladder.title", "Play instead of waiting") }}
        </h4>

        <!-- The honest line, before any game: what winning gets you, and what it does not. -->
        <p class="mb-ladder__note" data-test="ladder-honest">
            {{
                t(
                    "locks.ladder.honest",
                    "Winning ends this wait and nothing more. The lock stays locked, you still need its credential, and your remaining tries are not topped up.",
                )
            }}
        </p>
        <p class="mb-ladder__note" data-test="ladder-wait" aria-live="off">
            {{
                t(
                    "locks.ladder.waitLeft",
                    { seconds: waitSeconds },
                    "Wait left: {seconds} seconds.",
                )
            }}
        </p>

        <p v-if="loading" class="mb-ladder__note">
            {{ t("locks.ladder.loading", "Setting up...") }}
        </p>

        <VAlert
            v-else-if="unavailable"
            type="info"
            variant="tonal"
            density="compact"
            data-test="ladder-unavailable"
        >
            {{
                t(
                    "locks.ladder.unavailable",
                    "The ladder cannot be played for this wait. The countdown is the way through.",
                )
            }}
        </VAlert>

        <template v-else-if="view !== null">
            <!-- Rung 1: one dish, four names. -->
            <div v-if="view.rung === 'dimsum'" data-test="ladder-dimsum">
                <p class="mb-ladder__prompt">
                    {{ t("locks.ladder.dishPrompt", "Which dish is this?") }}
                </p>
                <img
                    v-if="view.question.imageUrl !== null"
                    :src="view.question.imageUrl"
                    :alt="t('locks.ladder.dishAlt', 'The dish in question')"
                    class="mb-ladder__photo"
                    loading="lazy"
                />
                <p class="mb-ladder__clue" lang="zh-HK" data-test="ladder-dish-clue">
                    {{ view.question.clue }}
                </p>
                <div
                    class="mb-ladder__choices"
                    role="group"
                    :aria-label="t('locks.ladder.dishChoices', 'Four possible names')"
                >
                    <VBtn
                        v-for="choice in view.question.choices"
                        :key="choice.id"
                        variant="tonal"
                        class="mb-ladder__choice"
                        :data-test="`ladder-dish-choice`"
                        @click="chooseDish(choice.id)"
                    >
                        {{ choice.label }}
                    </VBtn>
                </div>
                <p class="mb-ladder__note" data-test="ladder-dish-misses">
                    {{
                        t(
                            "locks.ladder.dishMisses",
                            { misses: view.dishMisses, limit: DISH_MISS_LIMIT },
                            "Misses: {misses} of {limit}. After {limit}, the ladder moves on to sums.",
                        )
                    }}
                </p>
            </div>

            <!-- Rung 2: ten easy sums. -->
            <form
                v-else-if="view.rung === 'sums'"
                data-test="ladder-sums"
                @submit.prevent="submitSum"
            >
                <p class="mb-ladder__prompt" data-test="ladder-sum-progress">
                    {{
                        t(
                            "locks.ladder.sumProgress",
                            { done: view.sumsRight, total: SUM_COUNT },
                            "{done} of {total} right. Every one has to be right.",
                        )
                    }}
                </p>
                <p class="mb-ladder__sum" data-test="ladder-sum-question">
                    {{ view.question.left }} {{ view.question.operator }}
                    {{ view.question.right }} = ?
                </p>
                <VTextField
                    ref="sumField"
                    v-model="sumAnswer"
                    :label="t('locks.ladder.sumAnswer', 'Your answer')"
                    inputmode="numeric"
                    autocomplete="off"
                    density="compact"
                    data-test="ladder-sum-answer"
                />
                <VBtn
                    type="submit"
                    color="primary"
                    :disabled="sumAnswer.trim() === ''"
                    data-test="ladder-sum-submit"
                >
                    {{ t("locks.ladder.sumSubmit", "Check") }}
                </VBtn>
            </form>

            <!-- Rung 3: whack-a-mole. -->
            <div v-else-if="view.rung === 'moles'" data-test="ladder-moles">
                <p class="mb-ladder__prompt">
                    {{
                        t(
                            "locks.ladder.molePrompt",
                            { needed: MOLE_HITS_NEEDED, seconds: MOLE_ROUND_MS / 1000 },
                            "Hit {needed} moles in {seconds} seconds. Number keys 1 to 9 hit the cells in keypad order.",
                        )
                    }}
                </p>
                <VBtn
                    v-if="view.round.endsAt === 0"
                    color="primary"
                    data-test="ladder-mole-start"
                    @click="startRound"
                >
                    {{ t("locks.ladder.moleStart", "Start the round") }}
                </VBtn>
                <template v-else>
                    <p class="mb-ladder__note" data-test="ladder-mole-score" aria-live="polite">
                        {{
                            t(
                                "locks.ladder.moleScore",
                                { hits: view.round.hits, seconds: moleSecondsLeft ?? 0 },
                                "Hits: {hits}. {seconds} seconds left.",
                            )
                        }}
                    </p>
                    <div
                        class="mb-ladder__grid"
                        role="group"
                        :aria-label="t('locks.ladder.moleGrid', 'Mole grid')"
                        data-test="ladder-mole-grid"
                        @keydown="onGridKey"
                    >
                        <button
                            v-for="cell in MOLE_CELLS"
                            :key="cell"
                            type="button"
                            class="mb-ladder__cell"
                            :class="{ 'mb-ladder__cell--up': visible.includes(cell - 1) }"
                            :aria-label="cellLabel(cell - 1)"
                            :data-test="`ladder-mole-cell-${cell - 1}`"
                            @click="whack(cell - 1)"
                        >
                            <span aria-hidden="true">{{
                                visible.includes(cell - 1)
                                    ? t("locks.ladder.moleGlyph", "Mole")
                                    : cell
                            }}</span>
                        </button>
                    </div>
                </template>
            </div>

            <!-- Rung 4: the clock. -->
            <div v-else-if="view.rung === 'clock'" data-test="ladder-clock">
                <p class="mb-ladder__prompt">
                    {{
                        t(
                            "locks.ladder.clock",
                            "That was the last rung. The ladder is done for this wait, so the countdown is the way through.",
                        )
                    }}
                </p>
            </div>

            <div v-else data-test="ladder-cleared">
                <p class="mb-ladder__prompt">
                    {{
                        t(
                            "locks.ladder.cleared",
                            "The wait is over. The lock is still locked: go back and enter its credential.",
                        )
                    }}
                </p>
            </div>
        </template>

        <p class="mb-ladder__feedback" role="status" aria-live="polite" data-test="ladder-feedback">
            {{ feedback }}
        </p>

        <VBtn variant="text" data-test="ladder-close" @click="emit('close')">
            {{ t("locks.ladder.back", "Back to the lock") }}
        </VBtn>
    </section>
</template>

<style scoped>
.mb-ladder {
    padding-top: 8px;
}

.mb-ladder__title {
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
    font-weight: var(--md-sys-typescale-title-small-weight);
    margin-bottom: 8px;
}

.mb-ladder__title:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-ladder__note,
.mb-ladder__feedback {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    color: rgb(var(--v-theme-on-surface-variant));
    margin-bottom: 8px;
}

.mb-ladder__prompt {
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    margin-bottom: 8px;
}

.mb-ladder__photo {
    display: block;
    width: 100%;
    max-width: 240px;
    border-radius: var(--md-sys-shape-corner-medium);
    margin-bottom: 8px;
}

.mb-ladder__clue {
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
    margin-bottom: 8px;
}

.mb-ladder__choices {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-bottom: 8px;
}

.mb-ladder__choice {
    min-height: 48px;
    justify-content: flex-start;
    white-space: normal;
}

.mb-ladder__sum {
    font-size: var(--md-sys-typescale-headline-small-size);
    line-height: var(--md-sys-typescale-headline-small-line-height);
    font-variant-numeric: tabular-nums;
    margin-bottom: 8px;
}

.mb-ladder__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(48px, 1fr));
    gap: 8px;
    max-width: 240px;
    margin-bottom: 8px;
}

.mb-ladder__cell {
    min-height: 56px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgb(var(--v-theme-surface-container-high));
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-label-large-size);
    transition: transform var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard);
}

.mb-ladder__cell:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

/* A showing mole is marked by its word and a border, not by colour or motion alone. */
.mb-ladder__cell--up {
    border: 2px solid rgb(var(--v-theme-on-tertiary-container));
    background: rgb(var(--v-theme-tertiary-container));
    color: rgb(var(--v-theme-on-tertiary-container));
    font-weight: var(--md-sys-typescale-label-large-weight);
    transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
    .mb-ladder__cell {
        transition: none;
    }

    .mb-ladder__cell--up {
        transform: none;
    }
}
</style>
