<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VRadio, VRadioGroup, VSelect, VTextField } from "vuetify/components";

import {
    MAX_LOCK_MINUTES,
    type LockDuration,
    type LockMethod,
    type LockTarget,
} from "./lockModel.js";
import { generateSecret, otpauthUri } from "./totp.js";
import { useLockStore } from "./useLocks.js";

/**
 * Putting a lock on one element: which element, which credential, how long an unlock lasts.
 *
 * ## One wizard per element, and no shared state between two of them
 *
 * The component may be reused, but a run of it never is. Every lock is created with its own
 * credential and nothing is carried over from the last element somebody locked - not the
 * password, not the method, not the duration. Two locks that happened to be made in a row
 * are as unrelated as two made a year apart, which is the whole design and the one thing a
 * "convenient" wizard would quietly destroy.
 *
 * ## The disclosure is not fine print
 *
 * It is stated before the credential is chosen, in ordinary words, in the same size as
 * everything else. Somebody deciding whether to lock a thing should know it is a for-fun
 * lock while they are deciding, not after they have set a password they will have to
 * remember.
 *
 * ## Why the authenticator route can be absent
 *
 * A TOTP secret belongs in the operating system credential vault, and a build without one
 * cannot keep it anywhere honest. The option is then shown as unavailable *with the reason*
 * rather than hidden, per the guided-form rule: a control that vanishes teaches nothing,
 * and a control that says why teaches exactly one thing.
 */
/**
 * `changing` carries the id of the lock whose credential is being replaced, or is absent for
 * an ordinary new lock.
 *
 * One component for both because they ask the person exactly the same questions - method,
 * credential, confirmation, duration - and the only difference is which store call the
 * answers go to at the end. A second near-identical wizard would be the copy that stops
 * validating the confirmation field the day somebody fixes it in only one of them.
 */
// `| undefined` explicitly, not just `?`: this workspace runs
// `exactOptionalPropertyTypes`, under which an optional prop and a prop that may be
// passed an explicit `undefined` are different types - and the caller binds
// `:changing="changingLockId ?? undefined"`, which is the second one.
const props = defineProps<{ target: LockTarget; changing?: string | undefined }>();

const emit = defineEmits<{
    /** A lock now exists on this element, or its credential has just been replaced. */
    created: [];
    cancel: [];
}>();

/** True while this wizard is replacing an existing credential rather than making a lock. */
const changing = computed(() => props.changing !== undefined);

const { t } = useI18n();
const store = useLockStore();
const uid = useId();

const method = ref<LockMethod>("password");
const password = ref("");
const confirmation = ref("");
const secret = ref(generateSecret());
const pairingCode = ref("");
const durationKind = ref<LockDuration["kind"]>("surface");
const minutes = ref("15");
const busy = ref(false);
const problem = ref<string | null>(null);

/** Why the authenticator route cannot be taken here, or null when it can. */
const authenticatorUnavailable = computed<string | null>(() =>
    store.canUseAuthenticator
        ? null
        : t(
              "locks.wizard.noVault",
              "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password.",
          ),
);

/** The URI an authenticator scans. Rendered as text beside the QR the host draws. */
const pairing = computed(() =>
    otpauthUri({
        issuer: "Worldlens",
        account: `${props.target.surface}/${props.target.path}`,
        secret: secret.value,
        parameters: { algorithm: "SHA-1", digits: 6, period: 30 },
    }),
);

const durationItems = computed(() => [
    { value: "surface", title: t("locks.duration.surface", "This surface only") },
    { value: "session", title: t("locks.duration.session", "Until the app closes") },
    { value: "minutes", title: t("locks.duration.minutes", "For a set number of minutes") },
]);

/**
 * Why the create button will not go yet, in the order somebody fills the form in.
 *
 * The same discipline every guided form here follows: a disabled button always names the
 * unmet condition rather than merely going grey.
 */
const blocked = computed<string | null>(() => {
    if (!store.canList) {
        return t(
            "locks.wizard.noHost",
            "This build cannot keep locks, so nothing can be locked here.",
        );
    }
    if (method.value === "password") {
        if (password.value === "") {
            return t("locks.wizard.needPassword", "Choose a password for this lock.");
        }
        if (confirmation.value !== password.value) {
            return t(
                "locks.wizard.confirm",
                "The two passwords do not match. A lock made from a typo is a lock nothing opens.",
            );
        }
    } else {
        if (authenticatorUnavailable.value !== null) return authenticatorUnavailable.value;
        if (pairingCode.value.trim() === "") {
            return t(
                "locks.wizard.needCode",
                "Type one current code from your authenticator, so the pairing is proven before the lock arms.",
            );
        }
    }
    if (durationKind.value === "minutes") {
        const value = Number(minutes.value);
        if (!Number.isInteger(value) || value < 1 || value > MAX_LOCK_MINUTES) {
            return t(
                "locks.wizard.badMinutes",
                { max: MAX_LOCK_MINUTES },
                "Enter a whole number of minutes from 1 to {max}.",
            );
        }
    }
    return null;
});

function chosenDuration(): LockDuration {
    return durationKind.value === "minutes"
        ? { kind: "minutes", minutes: Number(minutes.value) }
        : { kind: durationKind.value };
}

/**
 * Creates the lock, proving an authenticator pairing first.
 *
 * The proof is the step that matters: without it, a mistyped or mis-scanned secret makes a
 * lock whose owner discovers it cannot be opened at the exact moment they need it, and the
 * only remedy left is deleting the data folder. One typed code costs five seconds and
 * removes that entire failure.
 */
async function create(): Promise<void> {
    if (busy.value || blocked.value !== null) return;
    busy.value = true;
    problem.value = null;
    try {
        if (method.value === "totp") {
            const { decodeBase32, verifyTotp } = await import("./totp.js");
            const decoded = decodeBase32(secret.value);
            const paired =
                decoded.ok &&
                (await verifyTotp(decoded.bytes, pairingCode.value.trim(), Date.now()));
            if (!paired) {
                problem.value = t(
                    "locks.wizard.pairingFailed",
                    "That code does not match this secret, so no lock was made. Check the authenticator scanned this exact secret.",
                );
                return;
            }
        }

        const creation =
            method.value === "password"
                ? ({ method: "password", password: password.value } as const)
                : ({ method: "totp", secretBase32: secret.value } as const);
        const made =
            props.changing === undefined
                ? await store.add(props.target, creation, chosenDuration())
                : await store.changeAuth(props.changing, creation, chosenDuration());
        if (!made.ok) {
            problem.value = made.message;
            return;
        }
        password.value = "";
        confirmation.value = "";
        pairingCode.value = "";
        emit("created");
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <section
        class="mb-lock-wizard"
        :aria-label="t('locks.wizard.label', { label: props.target.label }, 'Lock {label}')"
        data-test="lock-wizard"
    >
        <h3 class="mb-lock-wizard__title">
            {{
                changing
                    ? t(
                          "locks.wizard.changeTitle",
                          { label: props.target.label },
                          "Change the lock on {label}",
                      )
                    : t("locks.wizard.title", { label: props.target.label }, "Lock {label}")
            }}
        </h3>

        <!-- Before the credential is chosen, deliberately. See the note in the script. -->
        <p class="mb-lock-wizard__toy" data-test="lock-wizard-toy-note">
            {{
                t(
                    "locks.wizard.forFun",
                    "This is a for-fun lock: a speed bump you are putting in front of yourself. It is not encryption, it protects nothing from anybody else who has this computer, and forgetting the answer means deleting this application's local data folder to clear every lock on the machine.",
                )
            }}
        </p>

        <VRadioGroup
            v-model="method"
            :label="t('locks.wizard.method', 'How this one opens')"
            inline
        >
            <VRadio
                :label="t('locks.wizard.methodPassword', 'A password')"
                value="password"
                data-test="lock-method-password"
            />
            <VRadio
                :label="t('locks.wizard.methodTotp', 'A code from an authenticator')"
                value="totp"
                :disabled="authenticatorUnavailable !== null"
                data-test="lock-method-totp"
            />
        </VRadioGroup>
        <p
            v-if="authenticatorUnavailable !== null"
            class="text-medium-emphasis mb-2"
            data-test="lock-no-vault"
        >
            {{ authenticatorUnavailable }}
        </p>

        <template v-if="method === 'password'">
            <VTextField
                :id="`${uid}-password`"
                v-model="password"
                :label="t('locks.wizard.password', 'Password for this lock')"
                type="password"
                autocomplete="new-password"
                density="compact"
                data-test="lock-password"
            />
            <VTextField
                :id="`${uid}-confirm`"
                v-model="confirmation"
                :label="t('locks.wizard.passwordAgain', 'The same password again')"
                type="password"
                autocomplete="new-password"
                density="compact"
                data-test="lock-password-confirm"
            />
            <p class="mb-lock-wizard__note" data-test="lock-own-credential">
                {{
                    t(
                        "locks.wizard.ownCredential",
                        "This password opens this one element and nothing else. Every lock carries its own; there is no master password anywhere in this application.",
                    )
                }}
            </p>
        </template>

        <template v-else>
            <p class="mb-lock-wizard__note">
                {{
                    t(
                        "locks.wizard.pairing",
                        "Scan this in your authenticator, or type the secret in by hand, then prove the pairing with one current code.",
                    )
                }}
            </p>
            <!--
                The secret in text beside whatever the host draws as a QR. A QR alone is
                useless to somebody who cannot see it, and useless again to somebody pairing
                an authenticator on the very device displaying it.
            -->
            <VTextField
                :model-value="secret"
                :label="t('locks.wizard.secret', 'The secret, in case you are typing it')"
                readonly
                density="compact"
                data-test="lock-secret"
            />
            <p class="mb-lock-wizard__uri" data-test="lock-pairing-uri">{{ pairing }}</p>
            <VTextField
                v-model="pairingCode"
                :label="t('locks.wizard.code', 'One current code, to prove the pairing')"
                inputmode="numeric"
                autocomplete="one-time-code"
                density="compact"
                data-test="lock-pairing-code"
            />
        </template>

        <VSelect
            v-model="durationKind"
            :items="durationItems"
            :label="t('locks.wizard.duration', 'How long an unlock lasts')"
            density="compact"
            data-test="lock-duration"
        />
        <VTextField
            v-if="durationKind === 'minutes'"
            v-model="minutes"
            :label="t('locks.wizard.minutes', 'Minutes')"
            inputmode="numeric"
            density="compact"
            data-test="lock-minutes"
        />

        <div class="d-flex ga-2 flex-wrap mt-2">
            <VBtn
                color="primary"
                :disabled="blocked !== null"
                :loading="busy"
                data-test="lock-create"
                @click="create"
            >
                {{ t("locks.wizard.create", "Lock it") }}
            </VBtn>
            <VBtn variant="text" data-test="lock-cancel" @click="emit('cancel')">
                {{ t("locks.wizard.cancel", "Never mind") }}
            </VBtn>
        </div>
        <p v-if="blocked !== null" class="text-medium-emphasis mt-2" data-test="lock-blocked">
            {{ blocked }}
        </p>
        <VAlert
            v-if="problem !== null"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-2"
            data-test="lock-problem"
            role="alert"
        >
            {{ problem }}
        </VAlert>
    </section>
</template>

<style scoped>
.mb-lock-wizard {
    max-width: 28rem;
    max-height: min(36rem, 80vh);
    overflow-y: auto;
    padding: 1rem;
}

.mb-lock-wizard__title {
    font: var(--mb-title-medium, inherit);
    margin-bottom: 0.5rem;
}

.mb-lock-wizard__toy,
.mb-lock-wizard__note {
    font: var(--mb-body-small, inherit);
    color: rgb(var(--v-theme-on-surface-variant, 0 0 0));
    margin-bottom: 0.75rem;
}

.mb-lock-wizard__uri {
    font-family: var(--mb-font-mono, monospace);
    font-size: 0.75rem;
    /* An otpauth URI has no spaces, so it needs to be told it may break. */
    overflow-wrap: anywhere;
    margin-bottom: 0.75rem;
}
</style>
