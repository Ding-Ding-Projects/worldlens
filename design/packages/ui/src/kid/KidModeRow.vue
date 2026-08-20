<script setup lang="ts">
/**
 * The `kid-mode` settings row: the only new row this feature adds to `SETTINGS_SECTIONS`.
 *
 * It presents a choice between two named modes - **Kid Mode** and **Adult Mode** - rather than a
 * bare on/off switch: "off" is not the name of a mode, and a grown-up searching settings or the
 * command palette for "adult" has to find real matching text somewhere, which is exactly what the
 * two option labels below give it. Turning Kid Mode on removes no capability, so this row makes no
 * claim that it does - the grown-up gate a child meets when leaving Kid Mode reads the *shared
 * restricted mode* record instead of inventing a lock of its own, and that shared record has its
 * own row elsewhere in Settings.
 *
 * This row is an editor rather than a toggle for the same reason the pre-existing draft already
 * was: the underlying feature has structure beyond the mode itself - the child's name, whether
 * celebrations animate, whether they make a sound, and how labels are paired.
 */
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { VRadioGroup, VRadio, VTextField, VSwitch } from "vuetify/components";
import { ensureSchoolModeReady, useSchoolMode } from "../components/setup/schoolMode.js";
import { useKidMode } from "./kidMode.js";

const { t } = useI18n();
const kid = useKidMode();
const school = useSchoolMode();
const emit = defineEmits<{ requestAdult: [] }>();

/* Defensive and idempotent, matching `SchoolModeSettingsRow.vue`'s own doc comment on why: this
 * row can be the first place in a given session that reads the shared record. */
onMounted(() => {
    void ensureSchoolModeReady();
});

/** Vuetify's `VRadioGroup` wants one bound value, not two independent booleans. */
const mode = computed<"kid" | "adult">({
    get: () => (kid.enabled.value ? "kid" : "adult"),
    set: (value) => {
        if (value === "kid") {
            kid.enabled.value = true;
            return;
        }
        if (kid.enabled.value) emit("requestAdult");
    },
});

const noLockConfigured = computed(
    () =>
        school.ready.value &&
        school.source.value !== "unavailable" &&
        !school.credentialConfigured.value,
);
</script>

<template>
    <div class="wl-kid-row">
        <h3>{{ t("settings.kidMode.title", "Kid Mode and Adult Mode") }}</h3>
        <p>{{ t("settings.kidMode.blurb", "Picture-first labels, bigger controls, XP and stickers. Every feature stays exactly where it is; only the way it is drawn changes.") }}</p>

        <v-radio-group v-model="mode" :label="t('settings.kidMode.modeLabel', 'Which mode should open?')" hide-details>
            <v-radio value="kid">
                <template #label>
                    <span class="wl-kid-row__option">
                        <strong>{{ t("settings.kidMode.kidModeOption", "Kid Mode") }}</strong>
                        <small>{{ t("settings.kidMode.kidModeOptionHint", "Picture-first labels, bigger buttons, stickers") }}</small>
                    </span>
                </template>
            </v-radio>
            <v-radio value="adult">
                <template #label>
                    <span class="wl-kid-row__option">
                        <strong>{{ t("settings.kidMode.adultModeOption", "Adult Mode") }}</strong>
                        <small>{{ t("settings.kidMode.adultModeOptionHint", "The full application, exactly as it always was") }}</small>
                    </span>
                </template>
            </v-radio>
        </v-radio-group>

        <p v-if="noLockConfigured" class="wl-kid-row__note" role="note">
            {{ t("settings.kidMode.noLockNote", "No grown-up code is set on this computer yet. Anyone can switch between Kid Mode and Adult Mode.") }}
        </p>

        <v-text-field
            v-model="kid.childName.value"
            :label="t('settings.kidMode.name', 'What to call the child')"
            density="comfortable"
            hide-details
        />
        <v-switch v-model="kid.celebrations.value" :label="t('settings.kidMode.celebrations', 'Celebrate finished jobs')" density="comfortable" hide-details />
        <v-switch v-model="kid.sound.value" :label="t('settings.kidMode.sound', 'Play a sound with a celebration')" density="comfortable" hide-details />

        <v-radio-group v-model="kid.labelStyle.value" :label="t('settings.kidMode.labelStyle', 'Labels')" hide-details>
            <v-radio value="kid-first" :label="t('settings.kidMode.kidFirst', 'Kid words first, real name underneath')" />
            <v-radio value="name-first" :label="t('settings.kidMode.nameFirst', 'Real name first, kid words underneath')" />
            <v-radio value="name-only" :label="t('settings.kidMode.nameOnly', 'Real names only')" />
        </v-radio-group>

        <p class="wl-kid-row__note">
            {{
                t(
                    "settings.kidMode.accessibleNote",
                    "The accessible name of every control keeps the real feature name at all three settings, so a screen reader and every screenshot still identify it.",
                )
            }}
        </p>
    </div>
</template>

<style scoped>
.wl-kid-row { display: flex; flex-direction: column; gap: 14px; padding: 18px 0; }
.wl-kid-row__option { display: flex; flex-direction: column; padding-block: 6px; }
.wl-kid-row__option small { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.wl-kid-row__note { font-size: 14px; color: rgb(var(--v-theme-outline)); margin: 0; }
</style>
