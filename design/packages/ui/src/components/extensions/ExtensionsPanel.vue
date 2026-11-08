<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDownload, mdiFolderOpenOutline, mdiMicrosoftVisualStudioCode, mdiPlay, mdiPlus, mdiRefresh } from "@mdi/js";
import { VAlert, VBtn, VChip, VSwitch } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { openTextInVsCode } from "../editors/editorBridge.js";
import { extensionBridge, inputFor, type ExtensionInfo, type ExtensionRun } from "./extensionBridge.js";

/**
 * Settings → Extensions: every installed extension with what it may read, a consent step when
 * its permissions are new or changed, its commands, and what a run produced. Built-ins are on
 * from the start; anything added stays off until the person agrees to its permissions.
 */
const { t } = useI18n();
const bridge = extensionBridge();
const items = ref<readonly ExtensionInfo[]>([]);
const query = ref("");
const regex = ref(false);
const flags = ref("i");
const consenting = ref<string | null>(null);
const running = ref<string | null>(null);
const results = ref<Record<string, ExtensionRun>>({});
const notice = ref<{ kind: "success" | "info" | "error"; text: string } | null>(null);

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const shown = computed(() => items.value.filter((e) => matcher.value.test([e.name, e.description, ...e.commands.map((c) => c.title), ...e.permissions.map((p) => p.text)].join("\n"))));

async function refresh(): Promise<void> {
    if (bridge) items.value = await bridge.list();
}

async function toggle(e: ExtensionInfo, on: boolean | null): Promise<void> {
    if (!bridge) return;
    // Turning on anything that is not a built-in shows its permissions first.
    if (on && !e.builtIn && consenting.value !== e.id) {
        consenting.value = e.id;
        return;
    }
    consenting.value = null;
    await bridge.setEnabled(e.id, on === true);
    await refresh();
}

async function run(e: ExtensionInfo, commandId: string): Promise<void> {
    if (!bridge || running.value) return;
    const command = e.commands.find((c) => c.id === commandId);
    if (!command) return;
    const input = inputFor(command.input);
    if (input === undefined) {
        notice.value = { kind: "info", text: t("extensions.needMap", "Open a map first: this command reads the open map.") };
        return;
    }
    running.value = `${e.id}:${commandId}`;
    try {
        const result = await bridge.run(e.id, commandId, input);
        results.value = { ...results.value, [e.id]: result };
    } finally {
        running.value = null;
    }
}

function save(r: ExtensionRun): void {
    if (!r.output) return;
    const url = URL.createObjectURL(new Blob([r.output.text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.output.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function inVsCode(r: ExtensionRun): Promise<void> {
    if (!r.output) return;
    const answer = await openTextInVsCode(r.output.name, r.output.text);
    notice.value = { kind: answer.ok ? "success" : "info", text: answer.message + (answer.downloadUrl ? ` ${answer.downloadUrl}` : "") };
}

async function importFolder(): Promise<void> {
    if (!bridge) return;
    const answer = await bridge.import();
    notice.value = { kind: answer.ok ? "success" : "info", text: answer.message };
    await refresh();
}

onMounted(() => void refresh());
</script>

<template>
    <div class="wl-ext" data-test="extensions-panel">
        <VAlert v-if="!bridge" type="info" variant="tonal">{{ t("extensions.noBridge", "Extensions run in the desktop app, as programs on your computer.") }}</VAlert>
        <template v-else>
            <ConfigSearchField v-model="query" v-model:regex="regex" v-model:flags="flags" :label="t('extensions.search', 'Search extensions, commands and permissions')" :sample="items.map((e) => e.name).join('\n')" />
            <div class="wl-ext__actions">
                <VBtn variant="tonal" :prepend-icon="mdiPlus" @click="importFolder">{{ t("extensions.import", "Add an extension folder") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiFolderOpenOutline" @click="bridge.openFolder()">{{ t("extensions.openFolder", "Open the extensions folder") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiRefresh" @click="refresh">{{ t("extensions.refresh", "Look again") }}</VBtn>
            </div>
            <VAlert v-if="notice" type="info" :color="notice.kind === 'error' ? 'error' : undefined" variant="tonal" density="compact" closable @click:close="notice = null">{{ notice.text }}</VAlert>
            <p v-if="items.length && shown.length === 0" class="wl-ext__empty" role="status">{{ t("extensions.noMatch", "No extension matches this search.") }}</p>
            <article v-for="e in shown" :key="e.id" class="wl-ext__card" :aria-labelledby="`ext-${e.id}`">
                <header class="wl-ext__head">
                    <div>
                        <h3 :id="`ext-${e.id}`">{{ e.name }} <span class="wl-ext__version">{{ e.version }}</span></h3>
                        <p class="wl-ext__desc">{{ e.description }}</p>
                    </div>
                    <VChip size="small" variant="tonal">{{ e.builtIn ? t("extensions.builtIn", "Built in") : t("extensions.added", "Added by you") }}</VChip>
                    <VSwitch :model-value="e.enabled" :disabled="e.problems.length > 0" color="primary" base-color="on-surface-variant" inset density="compact" hide-details :label="e.enabled ? t('extensions.on', 'On') : t('extensions.off', 'Off')" @update:model-value="toggle(e, $event)" />
                </header>
                <p v-if="e.problems.length" class="wl-ext__problem" role="alert">{{ t("extensions.problems", "This extension cannot run until its manifest is fixed:") }} {{ e.problems.join(" ") }}</p>
                <VAlert v-if="e.needsConsent && consenting !== e.id" type="warning" variant="tonal" density="compact">
                    {{ t("extensions.consentNeeded", "Its permissions are new or changed, so it is off until you agree to them.") }}
                </VAlert>
                <section v-if="consenting === e.id" class="wl-ext__consent" :aria-label="t('extensions.consentTitle', 'Agree to these permissions?')">
                    <strong>{{ t("extensions.consentTitle", "Agree to these permissions?") }}</strong>
                    <p>{{ t("extensions.consentBody", "It runs as a program on this computer with your rights, one request at a time, and is stopped at its limits. It receives only what is listed here; no passwords, tokens or other files.") }}</p>
                    <ul>
                        <li v-for="p in e.permissions" :key="p.id">{{ p.text }}</li>
                        <li v-if="e.permissions.length === 0">{{ t("extensions.noPermissions", "No permissions: it receives no map data.") }}</li>
                    </ul>
                    <div class="wl-ext__actions">
                        <VBtn color="primary" @click="toggle(e, true)">{{ t("extensions.agree", "Agree and turn on") }}</VBtn>
                        <VBtn variant="text" @click="consenting = null">{{ t("extensions.cancel", "Not now") }}</VBtn>
                    </div>
                </section>
                <ul v-else-if="e.permissions.length" class="wl-ext__perms" :aria-label="t('extensions.permissions', 'Permissions')">
                    <li v-for="p in e.permissions" :key="p.id">{{ p.text }}</li>
                </ul>
                <p v-if="e.limits" class="wl-ext__limits">{{ t("extensions.limits", { seconds: Math.round(e.limits.timeoutMs / 1000), kb: Math.round(e.limits.maxOutputBytes / 1024) }, "Stopped after {seconds} s or {kb} KB of output.") }}</p>
                <div class="wl-ext__actions">
                    <VBtn
                        v-for="c in e.commands"
                        :key="c.id"
                        size="small"
                        variant="tonal"
                        :prepend-icon="mdiPlay"
                        :disabled="!e.enabled"
                        :loading="running === `${e.id}:${c.id}`"
                        @click="run(e, c.id)"
                    >
                        {{ c.title }}
                    </VBtn>
                </div>
                <p v-if="!e.enabled && !e.problems.length" class="wl-ext__limits">{{ t("extensions.offReason", "Turn it on to run its commands.") }}</p>
                <div v-if="results[e.id]" class="wl-ext__result" role="status">
                    <span :class="results[e.id]!.ok ? 'is-ok' : 'is-bad'">{{ results[e.id]!.message }}</span>
                    <span class="wl-ext__limits"> · {{ results[e.id]!.ms }} ms</span>
                    <div v-if="results[e.id]!.output" class="wl-ext__actions">
                        <VBtn size="small" variant="text" :prepend-icon="mdiDownload" @click="save(results[e.id]!)">{{ t("extensions.save", { name: results[e.id]!.output!.name }, "Save {name}") }}</VBtn>
                        <VBtn size="small" variant="text" :prepend-icon="mdiMicrosoftVisualStudioCode" @click="inVsCode(results[e.id]!)">{{ t("editors.openInVsCode", "Open in VS Code") }}</VBtn>
                    </div>
                    <pre v-if="results[e.id]!.stderr" class="wl-ext__stderr">{{ results[e.id]!.stderr }}</pre>
                </div>
            </article>
        </template>
    </div>
</template>

<style scoped>
.wl-ext { display: flex; flex-direction: column; gap: 12px; }
.wl-ext__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.wl-ext__card { padding: 16px; border-radius: 16px; background: rgba(var(--v-theme-on-surface), 0.05); border: 1px solid rgba(var(--v-theme-on-surface), 0.12); display: flex; flex-direction: column; gap: 8px; }
.wl-ext__head { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.wl-ext__head > div { flex: 1; min-width: 200px; }
.wl-ext__head h3 { margin: 0; font-size: 16px; }
.wl-ext__version, .wl-ext__limits { font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-ext__desc { margin: 4px 0 0; }
.wl-ext__perms, .wl-ext__consent ul { margin: 0; padding-left: 20px; font-size: 13px; }
.wl-ext__consent { padding: 12px; border-radius: 12px; border: 1px solid rgb(var(--v-theme-warning)); }
.wl-ext__consent p { margin: 4px 0 8px; font-size: 13px; }
.wl-ext__problem { margin: 0; color: rgb(var(--v-theme-error)); }
.wl-ext__empty { margin: 0; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-ext__result .is-ok { color: rgb(var(--v-theme-success)); }
.wl-ext__result .is-bad { color: rgb(var(--v-theme-error)); }
.wl-ext__stderr { margin: 4px 0 0; max-height: 120px; overflow: auto; font-size: 12px; white-space: pre-wrap; }
</style>
