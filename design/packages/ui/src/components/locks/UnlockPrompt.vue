<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VTextField } from "vuetify/components";

import { LOCK_RECOVERY, type LockRecord } from "./lockModel.js";
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
const busy = ref(false);
const problem = ref<string | null>(null);
const field = ref<{ focus: () => void } | null>(null);

const isCode = computed(() => props.lock.method === "totp");

const label = computed(() =>
    isCode.value
        ? t("locks.unlock.code", "Six-digit code from your authenticator")
        : t("locks.unlock.password", "Password for this lock"),
);

/** The lock's own name for what it is guarding, so the prompt is about something. */
const title = computed(() =>
    t("locks.unlock.title", { label: props.lock.target.label }, "{label} is locked"),
);

watch(
    () => props.lock.id,
    async () => {
        answer.value = "";
        problem.value = null;
        await nextTick();
        field.value?.focus();
    },
    { immediate: true },
);

async function submit(): Promise<void> {
    if (busy.value || answer.value === "") return;
    busy.value = true;
    problem.value = null;
    try {
        const outcome = await store.attempt(props.lock.id, answer.value);
        if (outcome.ok) {
            answer.value = "";
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
        } else {
            problem.value = isCode.value
                ? t("locks.unlock.wrongCode", "That code did not match.")
                : t("locks.unlock.wrongPassword", "That password did not match.");
        }
        answer.value = "";
        await nextTick();
        field.value?.focus();
    } finally {
        busy.value = false;
    }
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

        <VTextField
            :id="answerId"
            ref="field"
            v-model="answer"
            :label="label"
            :type="isCode ? 'text' : 'password'"
            :inputmode="isCode ? 'numeric' : undefined"
            :autocomplete="isCode ? 'one-time-code' : 'current-password'"
            density="compact"
            autofocus
            data-test="unlock-answer"
            @keydown.enter.prevent="submit"
            @keydown.esc.prevent="emit('cancel')"
        />

        <div class="d-flex ga-2 flex-wrap">
            <VBtn
                color="primary"
                :loading="busy"
                :disabled="answer === ''"
                data-test="unlock-submit"
                @click="submit"
            >
                {{ t("locks.unlock.open", "Unlock") }}
            </VBtn>
            <VBtn variant="text" data-test="unlock-cancel" @click="emit('cancel')">
                {{ t("locks.unlock.cancel", "Leave it locked") }}
            </VBtn>
        </div>

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
