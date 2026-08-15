<script setup lang="ts">
/**
 * The one route out of Kid Mode: a grown-up gate that ends, on success, in Adult Mode.
 *
 * ### It reads the SHARED restricted-mode record, never a credential of its own
 *
 * `useRestrictedMode()` does not exist anywhere in this repository - it was never a real export
 * (kid-mode drop-in audit, defect 1). The real shared credential this whole application already
 * has is School mode's own record, `components/setup/schoolMode.ts`: `useSchoolMode()` for the
 * reactive view (`ready`, `source`, `enabled`, `chosenName`, `credentialConfigured`, `error`), and
 * the bare function `disableSchoolMode(credential)` to verify a typed code against it. Neither is
 * re-exported from `components/setup/index.ts` today, so this file imports them from the real
 * module directly - the same "import the file, not the barrel" pattern `CataloguePage.vue` already
 * uses for `ResolvedCatalogue`.
 *
 * `disableSchoolMode` is also the only verification primitive the shared record exposes: there is
 * no separate "check this code without changing anything" call. Calling it here means a correct
 * code, entered here, also turns School mode's own language-restriction feature off if a household
 * happens to have both features enabled at once - which is the accepted behaviour, not a bug: the
 * shared credential is one "prove you are the grown-up" code for every one of these apps, by
 * design, and this gate is explicitly told never to invent a second one of its own.
 *
 * ### Kid Mode must never become a one-way door
 *
 * Kid Mode now ships **on** by default (`kidMode.ts`). A fresh install therefore has Kid Mode
 * active and, ordinarily, no shared restricted-mode credential configured at all - `enable()` is
 * the only thing that ever creates one, and nothing in first-run setup calls it. If this gate
 * unconditionally demanded a code, a fresh install would have no way to reach Adult Mode, ever:
 * the one screen that could set a code lives inside Settings, which is on the far side of the very
 * gate that needs one. That is a trap, not a feature, so the gate reads `credentialConfigured`
 * before deciding what to ask for:
 *
 *  - `credentialConfigured === false` - nobody has ever set a shared code on this computer. The
 *    gate says so plainly and lets the press of one button through to Adult Mode. No credential is
 *    invented, nothing is silently unlocked "for real" - there was never anything locked.
 *  - `credentialConfigured === true` - a grown-up already set the shared code (on this app or on
 *    a sibling one). The gate asks for it, exactly the way `SchoolModeSettingsRow.vue`'s own
 *    disable flow does, and a wrong code changes nothing and leaves Kid Mode on.
 *
 * Either way, the honesty statement is on screen: this is a user-experience lock, not a security
 * boundary, and the real recovery route - resetting the shared record from Adult Mode's own
 * Settings - is named rather than gestured at, per this project's toy-lock contract
 * (`components/locks/`).
 *
 * ### What happens once the code (or the lack of one) is accepted
 *
 * The earlier draft of this file revealed `AppSettings` and the options editor inline, still
 * inside the kid-mode shell - which needed an `updates: UpdatesController` prop that `KidShell.vue`
 * never actually passed down, so it could never have rendered correctly. This version does the
 * simpler, correct thing the amended requirement actually asks for: it emits `switchToAdult`, and
 * `KidShell.vue` (which already holds `useKidMode()`) sets `kid.enabled.value = false` in response.
 * The whole kid-mode shell then unmounts on its own, the same way any `v-if="kid.enabled"` in the
 * application root reacts to the flag - Adult Mode already has its own Settings, its own options
 * editor and its own problems panel, so nothing needs re-hosting here to reach them.
 */
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiLockOutline } from "@mdi/js";
import { VIcon } from "vuetify/components";
import { disableSchoolMode, ensureSchoolModeReady, useSchoolMode } from "../components/setup/schoolMode.js";

const emit = defineEmits<{
    /** The grown-up gate was passed - by an explicit press with no code configured, or by a
     * correct shared code. `KidShell.vue` is the one that actually leaves Kid Mode. */
    switchToAdult: [];
}>();

const { t } = useI18n();
const school = useSchoolMode();

const entered = ref("");
const failed = ref(false);
const busy = ref(false);

/*
 * Every component that reads `useSchoolMode()` calls this defensively, matching
 * `SchoolModeSettingsRow.vue`'s own doc comment on why: this component can mount directly in a
 * focused test or an embedded page outside `main.ts`'s own bootstrap, and it is idempotent, so
 * calling it again after `App.vue` already has is a no-op rather than a second read.
 */
onMounted(() => {
    void ensureSchoolModeReady();
});

const noLockConfigured = computed(() => school.ready.value && !school.credentialConfigured.value);
const lockConfigured = computed(() => school.ready.value && school.credentialConfigured.value);

function goStraightThrough(): void {
    emit("switchToAdult");
}

async function unlock(): Promise<void> {
    if (busy.value || entered.value.trim() === "") return;
    busy.value = true;
    failed.value = false;
    try {
        const result = await disableSchoolMode(entered.value);
        if (result.ok) emit("switchToAdult");
        else failed.value = true;
    } finally {
        // The credential lives only in this field, and only for the one call it was typed for.
        entered.value = "";
        busy.value = false;
    }
}
</script>

<template>
    <section class="wl-kid-gate">
        <span class="wl-kid-gate__icon" aria-hidden="true"><v-icon :icon="mdiLockOutline" size="34" /></span>
        <h1>{{ t("kid.gate.heading", "Grown-ups only") }}</h1>

        <p v-if="!school.ready.value" role="status" aria-live="polite">
            {{ t("kid.gate.loading", "Checking for a grown-up code…") }}
        </p>

        <template v-else-if="noLockConfigured">
            <p>{{ t("kid.gate.noLock.blurb", "No grown-up code is set on this computer yet, so anyone can switch to Adult Mode.") }}</p>
            <button class="wl-kid-gate__go" type="button" @click="goStraightThrough">
                {{ t("kid.gate.noLock.action", "Go to Adult Mode") }}
            </button>
        </template>

        <template v-else-if="lockConfigured">
            <p>{{ t("kid.gate.locked.blurb", "A grown-up types the shared code to switch to Adult Mode. It is the same code across these apps.") }}</p>
            <label class="wl-kid-gate__field">
                <span>{{ t("kid.gate.credential", "Shared code") }}</span>
                <!--
                    No `inputmode="numeric"`: the shared credential is documented as "a PIN or
                    password" (`SchoolModeStore.enable()`'s own copy), never restricted to digits,
                    so pinning the on-screen keyboard to numbers would make a text password
                    untypeable on a touch device.
                -->
                <input
                    v-model="entered"
                    type="password"
                    autocomplete="current-password"
                    :disabled="busy"
                    @keyup.enter="unlock"
                />
            </label>
            <button class="wl-kid-gate__go" type="button" :disabled="busy || entered.trim() === ''" @click="unlock">
                {{ t("kid.gate.unlock", "Switch to Adult Mode") }}
            </button>
            <p v-if="failed" role="alert">{{ t("kid.gate.failed", "That code did not match. Kid Mode stays on.") }}</p>
        </template>

        <!--
            Present at every state, per the toy-lock contract: it is a user-experience lock, not a
            security boundary, and the real recovery route (Adult Mode's own Settings, once
            somebody genuinely reaches it) is named rather than gestured at.
        -->
        <p v-if="school.ready.value" class="wl-kid-gate__honesty">
            {{
                t(
                    "kid.gate.honesty",
                    "This is a user-experience lock, not a security lock. A grown-up who has already reached Adult Mode can reset the shared code from Settings, in Shared restricted mode.",
                )
            }}
        </p>
    </section>
</template>

<style scoped>
.wl-kid-gate { padding: 24px; max-width: 560px; }
.wl-kid-gate__icon {
    display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 10px;
    border-radius: var(--wl-kid-radius-md); background: rgb(var(--v-theme-secondary-container));
    color: rgb(var(--v-theme-on-secondary-container));
}
.wl-kid-gate h1 { margin: 0 0 6px; font-size: 32px; font-weight: 800; }
.wl-kid-gate > p { font-size: 17px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-kid-gate__field { display: flex; flex-direction: column; gap: 6px; max-width: 420px; font-size: 17px; margin-block: 12px; }
.wl-kid-gate__field input { min-height: var(--wl-kid-target-min); border: 3px solid rgb(var(--v-theme-outline-variant)); border-radius: var(--wl-kid-radius-md); padding: 0 16px; font: inherit; font-size: 24px; }
.wl-kid-gate__go { min-height: var(--wl-kid-target-min); padding: 0 24px; border: 0; border-radius: var(--wl-kid-radius-full); background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); font: inherit; font-size: 20px; font-weight: 800; cursor: pointer; }
.wl-kid-gate__go:disabled { opacity: 0.5; cursor: not-allowed; }
.wl-kid-gate__honesty { margin-top: 18px; font-size: 14px; color: rgb(var(--v-theme-outline)); }
</style>
