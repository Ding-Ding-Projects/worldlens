<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VTextField } from "vuetify/components";

import PinEntry from "./PinEntry.vue";
import UnlockLadder from "./UnlockLadder.vue";
import { LOCK_RECOVERY, lockFactors, type LockRecord, type UnlockAnswer } from "./lockModel.js";
import { useLockStore } from "./useLocks.js";

/**
 * The prompt in front of a locked element: one field, one honest failure, one way out.
 *
 * ## Every line here is written for somebody who has forgotten
 *
 * Forgetting is a *normal* outcome for a for-fun lock, not an edge case, so the recovery
 * route is on the prompt itself rather than buried in a help page - and it is named
 * concretely, with the real folder, because "clear your app data" is not an instruction
 * somebody can act on. A person must never be stuck in front of their own content with no
 * way through.
 *
 * ## What this never does
 *
 * It never says how long the password was, never says how close the answer came, never
 * hints, and never wipes anything after repeated attempts. A wrong answer is one sentence
 * and a slightly longer wait; that is the entire consequence, because the entire point is a
 * speed bump. Anything harsher would be punishing exactly the person the feature exists to
 * gently slow down.
 *
 * The one refusal that is *not* the person's fault gets its own wording: a TOTP lock whose
 * secret is missing from the vault says so, because telling somebody their code is wrong
 * when their authenticator is working perfectly sends them to check the one thing that is
 * fine.
 */
const props = defineProps<{
    lock: LockRecord;
    /** The exact application-data folder, when the shell could say. Null is said plainly. */
    dataFolder?: string | null;
}>();

const emit = defineEmits<{
    /** The lock opened. The host reveals whatever was behind it. */
    unlocked: [];
    /** Escape, or the cancel action. Focus goes back to the element the host came from. */
    cancel: [];
    /** Somebody asked for the recovery desk. The shell opens Support Tickets. */
    support: [];
}>();

const { t } = useI18n();
const store = useLockStore();
const uid = useId();
const answerId = `${uid}-answer`;

const answer = ref("");
const pin = ref("");
const code = ref("");
const busy = ref(false);
const problem = ref<string | null>(null);
const field = ref<{ focus: () => void } | null>(null);
const pinField = ref<{ focus: () => void } | null>(null);
const codeField = ref<{ focus: () => void } | null>(null);
/** True while the unlock ladder is showing in place of the fields. */
const laddering = ref(false);
/** Bumped after an attempt so the ladder offer re-reads the store. */
const attempts = ref(0);

const factors = computed(() => lockFactors(props.lock.method));
const needsPassword = computed(() => factors.value.includes("password"));
const needsPin = computed(() => factors.value.includes("pin"));
const needsCode = computed(() => factors.value.includes("totp"));
/** Kept for the wording of a refusal: a code-only lock says "code", anything else "answer". */
const isCode = computed(() => factors.value.length === 1 && needsCode.value);

const complete = computed(
    () =>
        (!needsPassword.value || answer.value !== "") &&
        (!needsPin.value || pin.value !== "") &&
        (!needsCode.value || code.value.trim() !== ""),
);

/** Whether the ladder can be offered right now: only while this lock is making somebody wait. */
const ladderOffer = computed(() => {
    void attempts.value;
    return store.ladderState(props.lock.id);
});

function focusFirst(): void {
    if (needsPassword.value) field.value?.focus();
    else if (needsPin.value) pinField.value?.focus();
    else codeField.value?.focus();
}

function clearAnswers(): void {
    answer.value = "";
    pin.value = "";
    code.value = "";
}

/** The lock's own name for what it is guarding, so the prompt is about something. */
const title = computed(() =>
    t("locks.unlock.title", { label: props.lock.target.label }, "{label} is locked"),
);

watch(
    () => props.lock.id,
    async () => {
        clearAnswers();
        problem.value = null;
        laddering.value = false;
        await nextTick();
        focusFirst();
    },
    { immediate: true },
);

async function submit(): Promise<void> {
    if (busy.value || !complete.value) return;
    busy.value = true;
    problem.value = null;
    try {
        const given: UnlockAnswer = {
            ...(needsPassword.value ? { password: answer.value } : {}),
            ...(needsPin.value ? { pin: pin.value } : {}),
            ...(needsCode.value ? { code: code.value } : {}),
        };
        const outcome = await store.attempt(props.lock.id, given);
        attempts.value += 1;
        scheduleWaitEnd();
        if (outcome.ok) {
            clearAnswers();
            emit("unlocked");
            return;
        }
        if (outcome.reason === "rate-limited") {
            problem.value = t(
                "locks.unlock.slowDown",
                { seconds: Math.ceil(outcome.retryInMs / 1000) },
                "Too many tries. Wait {seconds} seconds and try again - nothing has been lost.",
            );
        } else if (outcome.reason === "no-secret") {
            problem.value = t(
                "locks.unlock.noSecret",
                "This lock's authenticator secret is not on this computer any more, so no code can open it. Your authenticator is fine; the stored half is gone.",
            );
        } else if (factors.value.length > 1) {
            problem.value = t(
                "locks.unlock.wrongCombined",
                "Those answers did not match. Every part has to be right at once.",
            );
        } else {
            problem.value = isCode.value
                ? t("locks.unlock.wrongCode", "That code did not match.")
                : t("locks.unlock.wrongPassword", "That password did not match.");
        }
        clearAnswers();
        await nextTick();
        focusFirst();
    } finally {
        busy.value = false;
    }
}

let waitTimer: ReturnType<typeof setTimeout> | null = null;

/** Re-reads the ladder offer when the wait runs out, so it never offers to skip nothing. */
function scheduleWaitEnd(): void {
    if (waitTimer !== null) clearTimeout(waitTimer);
    const wait = store.waitMs(props.lock.id);
    if (wait <= 0) return;
    waitTimer = setTimeout(() => {
        waitTimer = null;
        attempts.value += 1;
    }, wait + 50);
}

onBeforeUnmount(() => {
    if (waitTimer !== null) clearTimeout(waitTimer);
});

function openLadder(): void {
    laddering.value = true;
}

async function closeLadder(): Promise<void> {
    laddering.value = false;
    attempts.value += 1;
    // The wait may be gone now; the old "wait N seconds" line would then be false.
    if (store.waitMs(props.lock.id) === 0) problem.value = null;
    await nextTick();
    focusFirst();
}
</script>

<template>
    <section class="mb-unlock" :aria-label="title" data-test="unlock-prompt">
        <h3 class="mb-unlock__title">{{ title }}</h3>

        <!--
            Said before the field, not after a failure. Somebody who knows from the outset
            that this is a toy lock treats it as one; somebody who finds out only after
            being refused three times has already had a bad minute.
        -->
        <p class="mb-unlock__toy" data-test="unlock-toy-note">
            {{
                t(
                    "locks.unlock.forFun",
                    "This lock is just for fun. It is not encryption and it does not protect anything from anybody else who has this computer.",
                )
            }}
        </p>

        <UnlockLadder v-if="laddering" :lock-id="props.lock.id" @close="closeLadder" />

        <template v-else>
            <VTextField
                v-if="needsPassword"
                :id="answerId"
                ref="field"
                v-model="answer"
                :label="t('locks.unlock.password', 'Password for this lock')"
                type="password"
                autocomplete="current-password"
                density="compact"
                autofocus
                data-test="unlock-answer"
                @keydown.enter.prevent="submit"
                @keydown.esc.prevent="emit('cancel')"
            />
            <PinEntry
                v-if="needsPin"
                ref="pinField"
                v-model="pin"
                :label="t('locks.unlock.pin', 'PIN for this lock')"
                autocomplete="current-password"
                test-id="unlock-pin"
                @submit="submit"
                @cancel="emit('cancel')"
            />
            <VTextField
                v-if="needsCode"
                :id="needsPassword ? `${answerId}-code` : answerId"
                ref="codeField"
                v-model="code"
                :label="t('locks.unlock.code', 'Six-digit code from your authenticator')"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                density="compact"
                :data-test="factors.length === 1 ? 'unlock-answer' : 'unlock-code'"
                @keydown.enter.prevent="submit"
                @keydown.esc.prevent="emit('cancel')"
            />

            <div class="d-flex ga-2 flex-wrap">
                <VBtn
                    color="primary"
                    :loading="busy"
                    :disabled="!complete"
                    data-test="unlock-submit"
                    @click="submit"
                >
                    {{ t("locks.unlock.open", "Unlock") }}
                </VBtn>
                <VBtn variant="text" data-test="unlock-cancel" @click="emit('cancel')">
                    {{ t("locks.unlock.cancel", "Leave it locked") }}
                </VBtn>
            </div>
        </template>

        <VAlert
            v-if="problem !== null"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3"
            data-test="unlock-problem"
            role="alert"
        >
            {{ problem }}
        </VAlert>

        <!--
            Offered only while this lock is making somebody wait, which is the one moment it
            has anything to give. It shortens the wait and never opens the lock.
        -->
        <div
            v-if="!laddering && ladderOffer !== 'not-waiting'"
            class="mt-2"
            data-test="unlock-ladder-offer"
        >
            <VBtn
                v-if="ladderOffer === 'available'"
                variant="tonal"
                size="small"
                data-test="unlock-ladder-open"
                @click="openLadder"
            >
                {{ t("locks.unlock.ladder", "Play instead of waiting") }}
            </VBtn>
            <p v-else class="mb-unlock__toy" data-test="unlock-ladder-unavailable">
                {{
                    ladderOffer === "capped"
                        ? t(
                              "locks.unlock.ladderCapped",
                              "The ladder has been used as often as it can be this hour, so the countdown is the way through.",
                          )
                        : t(
                              "locks.unlock.ladderSpent",
                              "The ladder is done for this wait, so the countdown is the way through.",
                          )
                }}
            </p>
        </div>

        <!--
            The way out, always present rather than appearing after N failures. A lock the
            owner cannot get past is the one thing this feature must never become, so the
            route is visible before it is needed.
        -->
        <p class="mb-unlock__recovery mt-3" data-test="unlock-recovery">
            {{ t("locks.unlock.forgotten", "Forgotten it?") }}
            <template v-if="props.dataFolder">
                {{
                    t(
                        "locks.unlock.recoveryPath",
                        { folder: props.dataFolder, action: LOCK_RECOVERY.action },
                        "Every lock on this computer is reset by deleting {folder}. Nothing else in it is a lock, so {action} takes your other settings with it.",
                    )
                }}
            </template>
            <template v-else>
                {{
                    t(
                        "locks.unlock.recoveryUnknown",
                        "Every lock on this computer is reset by deleting this application's local data folder. This build cannot say where that folder is.",
                    )
                }}
            </template>
            <VBtn size="small" variant="text" data-test="unlock-support" @click="emit('support')">
                {{ t("locks.unlock.support", "Open Support Tickets") }}
            </VBtn>
        </p>
    </section>
</template>

<style scoped>
.mb-unlock {
    /* Bounded so a long label cannot stretch the anchored popover past the viewport, and
       scrolling rather than clipping when the recovery paragraph is long in bilingual mode. */
    max-width: 26rem;
    max-height: min(32rem, 80vh);
    overflow-y: auto;
    padding: 1rem;
}

.mb-unlock__title {
    font: var(--mb-title-medium, inherit);
    margin-bottom: 0.5rem;
}

.mb-unlock__toy,
.mb-unlock__recovery {
    font: var(--mb-body-small, inherit);
    color: rgb(var(--v-theme-on-surface-variant, 0 0 0));
    margin-bottom: 0.75rem;
}
</style>
