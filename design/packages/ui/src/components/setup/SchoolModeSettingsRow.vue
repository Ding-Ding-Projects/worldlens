<script setup lang="ts">
import { computed, ref } from "vue";
import { VBtn, VTextField } from "vuetify/components";
import {
    deleteSchoolModeLocalRecord,
    enableSchoolMode,
    renameSchoolMode,
    schoolModeName,
    useSchoolMode,
} from "./schoolMode.js";
import { useSetupI18n } from "./setupI18n.js";

/**
 * The visible, renderer-local School mode control.
 *
 * It never asks for or handles a PIN: the renderer has no privileged shared-record/credential
 * bridge. The disclosure is therefore a product fact, not a temporary warning: this policy is
 * local to this app and deleting its record resets it. The underlying language/tone settings are
 * not reset; `setupI18n.ts` only applies an effective override while this record is enabled.
 */
const i18n = useSetupI18n();
const school = useSchoolMode();
const editName = ref(school.chosenName.value ?? "");

const shippedName = computed(() => i18n.t("school.shippedName"));
const name = computed(() => schoolModeName(shippedName.value));

function saveName(value: string): void {
    renameSchoolMode(value);
    editName.value = school.chosenName.value ?? "";
}

function enable(): void {
    saveName(editName.value);
    enableSchoolMode();
}

function resetLocalRecord(): void {
    deleteSchoolModeLocalRecord();
    editName.value = "";
}
</script>

<template>
    <section class="mb-school-mode" :aria-label="name">
        <div class="mb-school-mode__heading">
            <h3>{{ name }}</h3>
            <p role="status" aria-live="polite">
                {{
                    school.enabled.value
                        ? i18n.t("school.status.on", { name })
                        : i18n.t("school.status.off", { name })
                }}
            </p>
        </div>

        <v-text-field
            v-model="editName"
            :label="i18n.t('school.renameLabel')"
            :hint="i18n.t('school.renameHint')"
            :aria-label="i18n.t('school.renameLabel')"
            autocomplete="off"
            counter="48"
            maxlength="48"
            density="comfortable"
            persistent-hint
            @change="saveName(editName)"
        />

        <template v-if="!school.enabled.value">
            <p class="mb-school-mode__lead">
                {{ i18n.t("school.beforeEnable", { name }) }}
            </p>
            <v-btn
                variant="tonal"
                density="comfortable"
                :text="i18n.t('school.enable', { name })"
                @click="enable"
            />
        </template>

        <template v-else>
            <p class="mb-school-mode__lead">
                {{ i18n.t("school.activeLead", { name }) }}
            </p>
            <v-btn
                variant="outlined"
                density="comfortable"
                :text="i18n.t('school.deleteLocalRecord', { name })"
                @click="resetLocalRecord"
            />
        </template>

        <p class="mb-school-mode__boundary" role="note">
            {{ i18n.t("school.boundary", { name }) }}
        </p>
    </section>
</template>

<style>
.mb-school-mode {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(var(--v-theme-outline), 0.44);
    border-radius: 16px;
    background: rgb(var(--v-theme-surface-container-low));
}

.mb-school-mode__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
}

.mb-school-mode__heading h3,
.mb-school-mode__heading p,
.mb-school-mode__lead,
.mb-school-mode__boundary {
    margin: 0;
}

.mb-school-mode__heading h3 {
    font-size: 1rem;
    line-height: 1.3;
}

.mb-school-mode__heading p,
.mb-school-mode__lead {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
    line-height: 1.45;
}

.mb-school-mode__boundary {
    padding: 8px 10px;
    border-inline-start: 3px solid rgb(var(--v-theme-error));
    border-radius: 8px;
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
    font-size: 0.8125rem;
    line-height: 1.45;
}
</style>
