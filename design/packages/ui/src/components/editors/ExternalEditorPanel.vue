<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiOpenInNew, mdiPlus, mdiRefresh, mdiTrashCanOutline } from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VRadio, VRadioGroup } from "vuetify/components";
import { editorBridge, type EditorInfo } from "./editorBridge.js";

/**
 * Settings → External editor: every editor found on this computer, the one in use, and a way
 * to add another. Anything the app exports opens in Visual Studio Code in one action whatever
 * is chosen here; this choice is for opening project folders and files.
 */
const { t } = useI18n();
const bridge = editorBridge();
const editors = ref<readonly EditorInfo[]>([]);
const chosen = ref<string | null>(null);
const loaded = ref(false);
const message = ref<{ kind: "success" | "error" | "info"; text: string } | null>(null);

async function refresh(): Promise<void> {
    if (!bridge) return;
    const answer = await bridge.list();
    editors.value = answer.editors;
    chosen.value = answer.chosen;
    loaded.value = true;
}

async function choose(id: unknown): Promise<void> {
    if (!bridge || typeof id !== "string") return;
    if (await bridge.choose(id)) {
        chosen.value = id;
        message.value = { kind: "success", text: t("editors.chosen", { name: editors.value.find((e) => e.id === id)?.name ?? id }, "{name} opens project folders and files from now on.") };
    }
}

async function add(): Promise<void> {
    if (!bridge) return;
    const answer = await bridge.add();
    message.value = { kind: answer.ok ? "success" : "info", text: answer.message };
    await refresh();
}

async function remove(id: string): Promise<void> {
    if (!bridge) return;
    await bridge.remove(id);
    await refresh();
}

onMounted(() => void refresh());
const hasVsCode = (): boolean => editors.value.some((e) => e.kind === "vscode");
</script>

<template>
    <div class="wl-editors" data-test="external-editor-panel">
        <VAlert v-if="!bridge" type="info" variant="tonal">{{ t("editors.noBridge", "External editors are chosen in the desktop app, where they can be started.") }}</VAlert>
        <template v-else>
            <p v-if="loaded && editors.length === 0" class="wl-editors__empty" role="status">
                {{ t("editors.none", "No external editor was found on this computer. Add the program you use, or install Visual Studio Code.") }}
            </p>
            <VRadioGroup v-else :model-value="chosen" :label="t('editors.use', 'Open project folders and files in')" hide-details @update:model-value="choose">
                <div v-for="e in editors" :key="e.id" class="wl-editors__row">
                    <VRadio :value="e.id" :label="e.name" />
                    <span class="wl-editors__path">{{ e.path }}</span>
                    <VChip size="x-small" variant="tonal">{{ e.source === "added" ? t("editors.added", "Added by you") : t("editors.detected", "Found") }}</VChip>
                    <VBtn v-if="e.source === 'added'" icon size="x-small" variant="text" :aria-label="t('editors.remove', { name: e.name }, 'Remove {name}')" @click="remove(e.id)"><v-icon :icon="mdiTrashCanOutline" /></VBtn>
                </div>
            </VRadioGroup>
            <div class="wl-editors__actions">
                <VBtn variant="tonal" :prepend-icon="mdiPlus" @click="add">{{ t("editors.add", "Add an editor") }}</VBtn>
                <VBtn variant="text" :prepend-icon="mdiRefresh" @click="refresh">{{ t("editors.refresh", "Look again") }}</VBtn>
                <VBtn v-if="loaded && !hasVsCode()" variant="text" :prepend-icon="mdiOpenInNew" href="https://code.visualstudio.com/download" target="_blank" rel="noopener noreferrer">
                    {{ t("editors.getVsCode", "Get Visual Studio Code") }}
                </VBtn>
            </div>
            <p class="wl-editors__hint">{{ t("editors.vscodeNote", "Exports open in Visual Studio Code in one action, from its per-user, machine, Insiders or VSCodium install, whichever is found first.") }}</p>
            <VAlert v-if="message" class="mt-2" :type="message.kind" variant="tonal" density="compact" closable @click:close="message = null">{{ message.text }}</VAlert>
        </template>
    </div>
</template>

<style scoped>
.wl-editors { display: flex; flex-direction: column; gap: 8px; }
.wl-editors__row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wl-editors__path { font-family: "Roboto Mono", ui-monospace, monospace; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); overflow-wrap: anywhere; min-width: 0; flex: 1; }
.wl-editors__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.wl-editors__hint, .wl-editors__empty { margin: 0; font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); }
</style>
