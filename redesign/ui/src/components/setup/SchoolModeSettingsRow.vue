<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { VBtn, VTextField } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import {
    disableSchoolMode,
    enableSchoolMode,
    ensureSchoolModeReady,
    reloadSchoolMode,
    renameSchoolMode,
    resetSchoolModeRecord,
    schoolModeName,
    useSchoolMode,
} from "./schoolMode.js";
import { useSetupI18n } from "./setupI18n.js";

/**
 * The visible School-mode owner.  It does not inspect a local file or a verifier: packaged
 * Electron reaches the five-method preload bridge, while the only no-bridge path is visibly
 * marked as a browser/test-local fallback.  PIN/password values live only in password fields
 * and are cleared immediately after each request.
 */
const i18n = useSetupI18n();
const school = useSchoolMode();
const editName = ref("");
const enableCredential = ref("");
const disableCredential = ref("");
const busy = ref(false);
const operationMessage = ref<string | null>(null);

const shippedName = computed(() => i18n.t("school.shippedName"));
const name = computed(() => schoolModeName(shippedName.value));
const isShared = computed(() => school.source.value === "shared");
const isFallback = computed(() => school.source.value === "local-fallback");

watch(
    school.chosenName,
    (value) => {
        editName.value = value ?? "";
    },
    { immediate: true },
);

onMounted(() => {
    // Components also mount directly in focused tests and embedded browser pages, outside
    // `main.ts`'s bootstrap. This keeps that seam truthful without making those callers guess.
    void ensureSchoolModeReady();
});

function showResult(result: { readonly ok: boolean; readonly message?: string }): boolean {
    operationMessage.value = result.ok ? null : (result.message ?? i18n.t("school.hostUnavailable"));
    return result.ok;
}

async function saveName(): Promise<boolean> {
    if (editName.value === (school.chosenName.value ?? "")) return true;
    busy.value = true;
    try {
        return showResult(await renameSchoolMode(editName.value));
    } finally {
        busy.value = false;
    }
}

async function enable(): Promise<void> {
    busy.value = true;
    operationMessage.value = null;
    const credential = enableCredential.value;
    try {
        showResult(await enableSchoolMode({ name: editName.value.trim() || null, credential }));
    } finally {
        // The model holds the user input only while they are editing; never keep it after IPC.
        enableCredential.value = "";
        busy.value = false;
    }
}

async function disable(): Promise<void> {
    busy.value = true;
    operationMessage.value = null;
    const credential = disableCredential.value;
    try {
        showResult(await disableSchoolMode(credential));
    } finally {
        disableCredential.value = "";
        busy.value = false;
    }
}

async function resetRecord(): Promise<void> {
    busy.value = true;
    operationMessage.value = null;
    try {
        if (showResult(await resetSchoolModeRecord())) editName.value = "";
    } finally {
        enableCredential.value = "";
        disableCredential.value = "";
        busy.value = false;
    }
}

async function retrySharedRecord(): Promise<void> {
    busy.value = true;
    operationMessage.value = null;
    try {
        await reloadSchoolMode();
        operationMessage.value = school.error.value;
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <section class="mb-school-mode" :aria-label="name">
        <div class="mb-school-mode__heading">
            <h3>{{ name }}</h3>
            <p role="status" aria-live="polite">
                <template v-if="!school.ready.value">Loading the shared mode record…</template>
                <template v-else-if="isFallback">
                    {{
                        school.enabled.value
                            ? i18n.t("school.localFallbackOn", { name })
                            : i18n.t("school.localFallbackStatus")
                    }}
                </template>
                <template v-else-if="school.source.value === 'unavailable'">
                    {{ i18n.t("school.hostUnavailable") }}
                </template>
                <template v-else>
                    {{
                        school.enabled.value
                            ? i18n.t("school.status.on", { name })
                            : i18n.t("school.status.off", { name })
                    }}
                </template>
            </p>
        </div>

        <template v-if="!school.ready.value">
            <p class="mb-school-mode__lead">Loading before this app reports shared mode state.</p>
        </template>

        <template v-else-if="school.source.value === 'unavailable'">
            <p class="mb-school-mode__boundary" role="alert">
                {{ school.error.value ?? i18n.t("school.hostUnavailable") }}
            </p>
            <v-btn
                variant="outlined"
                density="comfortable"
                :disabled="busy"
                :text="i18n.t('school.retry')"
                @click="retrySharedRecord"
            />
        </template>

        <template v-else>
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
                :disabled="busy"
                @change="saveName"
            />

            <template v-if="!school.enabled.value">
                <p class="mb-school-mode__lead">
                    <template v-if="isShared">{{ i18n.t("school.beforeEnable", { name }) }}</template>
                    <template v-else>{{ i18n.t("school.localFallbackStatus") }}</template>
                </p>
                <v-text-field
                    v-if="isShared && !school.credentialConfigured.value"
                    v-model="enableCredential"
                    :label="i18n.t('school.enableCredential')"
                    :hint="i18n.t('school.enableCredentialHint')"
                    :aria-label="i18n.t('school.enableCredential')"
                    type="password"
                    autocomplete="new-password"
                    density="comfortable"
                    persistent-hint
                    :disabled="busy"
                />
                <v-btn
                    variant="tonal"
                    density="comfortable"
                    :disabled="busy"
                    :text="isShared ? i18n.t('school.enable', { name }) : i18n.t('school.enableLocal', { name })"
                    @click="enable"
                />
            </template>

            <template v-else>
                <p class="mb-school-mode__lead">
                    <template v-if="isShared">{{ i18n.t("school.activeLead", { name }) }}</template>
                    <template v-else>{{ i18n.t("school.localFallbackStatus") }}</template>
                </p>
                <v-text-field
                    v-if="isShared"
                    v-model="disableCredential"
                    :label="i18n.t('school.disableCredential', { name })"
                    :aria-label="i18n.t('school.disableCredential', { name })"
                    type="password"
                    autocomplete="current-password"
                    density="comfortable"
                    :disabled="busy"
                />
                <v-btn
                    variant="outlined"
                    density="comfortable"
                    :disabled="busy"
                    :text="isShared ? i18n.t('school.disable', { name }) : i18n.t('school.disableLocal', { name })"
                    @click="disable"
                />
            </template>

            <ConfigSuperConfirm
                v-if="isShared"
                :title="i18n.t('school.resetTitle')"
                :action="i18n.t('school.resetAction')"
                :affected="[name]"
                :confirm-label="i18n.t('school.resetConfirm')"
                :disabled="busy"
                @confirm="resetRecord"
            >
                <template #activator="{ props: activatorProps }">
                    <v-btn v-bind="activatorProps" color="error" variant="outlined" density="comfortable">
                        {{ i18n.t("school.reset", { name }) }}
                    </v-btn>
                </template>
            </ConfigSuperConfirm>

            <p v-if="operationMessage !== null" class="mb-school-mode__error" role="alert">
                {{ operationMessage }}
            </p>

            <p class="mb-school-mode__boundary" role="note">
                {{
                    isShared
                        ? i18n.t("school.boundary", { name })
                        : i18n.t("school.localFallbackBoundary")
                }}
            </p>
        </template>
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
.mb-school-mode__boundary,
.mb-school-mode__error {
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

.mb-school-mode__boundary,
.mb-school-mode__error {
    padding: 8px 10px;
    border-inline-start: 3px solid rgb(var(--v-theme-error));
    border-radius: 8px;
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
    font-size: 0.8125rem;
    line-height: 1.45;
}

.mb-school-mode__error {
    border-inline-start-color: rgb(var(--v-theme-warning));
}
</style>
