<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";

const { t } = useI18n();
const addons = ref<AddonRecord[]>([]);
const busy = ref(false);
const error = ref<string | null>(null);
const query = ref("");
const regexMode = ref(false);
const flags = ref("im");
const diagnostics = ref<Array<{ addonId: string; phase: string; message: string }>>([]);
const safeMode = ref(false);
const bridge = typeof window !== "undefined" ? window.worldlens : undefined;

const filtered = computed(() => {
    const matcher = createSettingMatcher(query.value, regexMode.value, flags.value);
    if (!matcher.active) return addons.value;
    return addons.value.filter((addon) => matcher.test([addon.name, addon.id, addon.version, addon.description, addon.capabilities.join(" ")].join("\n")));
});

async function refresh(): Promise<void> {
    if (!bridge?.addons) return;
    try {
        const result = await bridge.addons.list();
        if (!result.ok) { error.value = result.message ?? t("settings.addons.listFailed", "The add-on list could not be read."); return; }
        addons.value = result.value ?? [];
        diagnostics.value = await bridge.addons.diagnostics();
        error.value = null;
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : t("settings.addons.listFailed", "The add-on list could not be read.");
    }
}

async function toggleCapability(addon: AddonRecord, capability: string, granted: boolean): Promise<void> {
    if (!bridge?.addons) return;
    busy.value = true;
    try {
        const result = granted
            ? await bridge.addons.grant(addon.id, [...addon.grantedCapabilities, capability])
            : await bridge.addons.revoke(addon.id, capability);
        if (!result.ok) error.value = result.message ?? t("settings.addons.consentFailed", "Capability consent could not be saved.");
        else await refresh();
    } finally { busy.value = false; }
}

async function toggleSafeMode(enabled: boolean): Promise<void> {
    if (!bridge?.addons) return;
    busy.value = true;
    try {
        const result = await bridge.addons.setSafeMode(enabled);
        if (!result.ok) error.value = result.message ?? t("settings.addons.safeModeFailed", "Safe mode could not be changed.");
        else { safeMode.value = result.value === true; await refresh(); }
    } finally { busy.value = false; }
}

async function removeAddon(addon: AddonRecord): Promise<void> {
    if (!bridge?.addons) return;
    busy.value = true;
    try {
        const result = await bridge.addons.remove(addon.id);
        if (!result.ok) { error.value = result.message ?? t("settings.addons.removeFailed", "The add-on could not be removed."); await refresh(); }
        else await refresh();
    } finally { busy.value = false; }
}

async function importAddon(): Promise<void> {
    if (!bridge?.addons) {
        error.value = t("settings.addons.unavailable", "Add-on import is unavailable in this build.");
        return;
    }
    busy.value = true;
    try {
        const result = await bridge.addons.importPackage();
        if (!result.ok) error.value = result.message ?? t("settings.addons.importFailed", "The add-on could not be imported.");
        else { error.value = null; await refresh(); }
    } finally { busy.value = false; }
}

async function setEnabled(addon: AddonRecord, enabled: boolean): Promise<void> {
    if (!bridge?.addons) return;
    busy.value = true;
    try {
        const result = await bridge.addons.setEnabled(addon.id, enabled);
        if (!result.ok) { error.value = result.message ?? t("settings.addons.changeFailed", "The add-on state could not be changed."); await refresh(); }
        else await refresh();
    } finally { busy.value = false; }
}

onMounted(() => { void refresh(); void bridge?.addons.safeModeState().then((value) => { safeMode.value = value; }).catch((cause) => { error.value = cause instanceof Error ? cause.message : t("settings.addons.safeModeFailed", "Safe mode state could not be read."); }); });
</script>

<template>
    <section class="mb-addon-manager" aria-labelledby="addon-manager-title">
        <h2 id="addon-manager-title" class="sr-only">{{ t("settings.addons.title", "Design add-ons") }}</h2>
        <div class="mb-addon-manager__toolbar">
            <ConfigSearchField v-model="query" v-model:regex="regexMode" v-model:flags="flags" :label="t('settings.addons.search', 'Search add-ons')" :sample="addons.map((addon) => `${addon.name} ${addon.id} ${addon.version}`).join('\n')" :summary="t('settings.addons.searchSummary', { shown: filtered.length, total: addons.length }, '{shown} of {total} add-ons shown.')" />
            <v-btn color="primary" :loading="busy" prepend-icon="mdi-package-variant-plus" @click="importAddon">{{ t("settings.addons.import", "Import add-on package") }}</v-btn>
        </div>
        <v-switch :model-value="safeMode" color="warning" :disabled="busy" :label="t('settings.addons.safeMode', 'Safe mode: keep add-ons disabled')" @update:model-value="toggleSafeMode(Boolean($event))" />
        <p v-if="error" class="mb-addon-manager__error" role="alert">{{ error }}</p>
        <p v-if="filtered.length === 0" class="mb-addon-manager__empty">{{ t("settings.addons.empty", "No add-ons have been imported yet.") }}</p>
        <v-list v-else lines="three" class="mb-addon-manager__list">
            <v-list-item v-for="addon in filtered" :key="addon.id" :title="addon.name" :subtitle="`${addon.id} · v${addon.version} · API ${addon.apiVersion}`">
                <template #prepend><v-icon :color="addon.error ? 'error' : addon.enabled ? 'success' : undefined">{{ addon.error ? 'mdi-alert-circle-outline' : addon.enabled ? 'mdi-puzzle-check' : 'mdi-puzzle-outline' }}</v-icon></template>
                <template #default><p class="mb-addon-manager__description">{{ addon.description }}</p><p class="mb-addon-manager__capabilities">{{ addon.capabilities.length ? addon.capabilities.join(' · ') : t('settings.addons.noCapabilities', 'No capabilities requested') }}</p><div v-if="addon.capabilities.length" class="mb-addon-manager__consent"><span>{{ t('settings.addons.capabilityReview', 'Review and grant each requested capability before enabling this add-on. Clearing one revokes it and disables the add-on.') }}</span><v-checkbox v-for="capability in addon.capabilities" :key="capability" :model-value="addon.grantedCapabilities.includes(capability)" :label="capability" :disabled="busy" density="compact" hide-details @update:model-value="toggleCapability(addon, capability, Boolean($event))" /></div><p v-if="addon.error" class="mb-addon-manager__error">{{ addon.error }}</p><div v-if="diagnostics.some((item) => item.addonId === addon.id)" class="mb-addon-manager__diagnostics"><strong>{{ t('settings.addons.diagnostics', 'Runtime diagnostics') }}</strong><p v-for="item in diagnostics.filter((entry) => entry.addonId === addon.id)" :key="`${item.phase}-${item.message}`">{{ item.phase }}: {{ item.message }}</p></div></template>
                <template #append><v-switch :model-value="addon.enabled" color="primary" hide-details :disabled="busy || safeMode" :label="addon.enabled ? t('settings.addons.disable', 'Disable') : t('settings.addons.enable', 'Enable')" @update:model-value="setEnabled(addon, Boolean($event))" /><v-btn variant="text" size="small" :disabled="busy" @click="importAddon">{{ t('settings.addons.update', 'Update') }}</v-btn><ConfigSuperConfirm :title="t('settings.addons.removeTitle', 'Remove add-on')" :action="t('settings.addons.removeWarning', 'This removes the installed package and its saved state.')" :affected="[addon.id]" :confirm-label="t('settings.addons.remove', 'Remove')" :disabled="busy" @confirm="removeAddon(addon)"><template #activator="{ props: activatorProps }"><v-btn v-bind="activatorProps" icon="mdi-delete-outline" variant="text" :aria-label="t('settings.addons.remove', 'Remove add-on')" :disabled="busy" /></template></ConfigSuperConfirm></template>
            </v-list-item>
        </v-list>
    </section>
</template>

<style scoped>
.mb-addon-manager { display: grid; gap: 16px; }
.mb-addon-manager__toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.mb-addon-manager__toolbar .v-text-field { flex: 1 1 220px; }
.mb-addon-manager__description, .mb-addon-manager__capabilities { margin: 2px 0; }
.mb-addon-manager__consent { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.mb-addon-manager__diagnostics { margin-top: 6px; font-size: .85rem; }
.mb-addon-manager__capabilities { opacity: .72; font-size: .82rem; }
.mb-addon-manager__error { color: rgb(var(--v-theme-error)); }
.mb-addon-manager__empty { opacity: .78; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
