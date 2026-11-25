<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VTab, VTabs } from "vuetify/components";
import JsonEditorPanel from "./JsonEditorPanel.vue";
import TypeGenGeneratePanel from "./TypeGenGeneratePanel.vue";
import type { TypeGenClient } from "./typeGenClient.js";
import { defaultStorage, loadSettings, saveSettings, type TypeGenSettings } from "./typeGenSettings.js";

/**
 * The type generator: turn JSON, JSON Schema or a GraphQL query into typed models for any of
 * quicktype's languages, and edit the JSON they came from. Everything runs on this computer, in
 * a worker, with no network request. The Generate and JSON editor tabs share one document, so an
 * edit in either is the input of the other.
 */
defineProps<{ client?: TypeGenClient | null; debounceMs?: number }>();

const { t } = useI18n();

const storage = defaultStorage();
const tab = ref<"generate" | "editor">("generate");
const settings = ref<TypeGenSettings>(loadSettings(storage));
const docText = ref("");
const schemaText = ref("");

watch(settings, (value) => saveSettings(storage, value), { deep: true });
</script>

<template>
    <section class="wl-tgs" data-test="type-generator-screen" aria-labelledby="tgs-title">
        <header class="wl-tgs__head">
            <h1 id="tgs-title">{{ t("typegen.title", "Type generator") }}</h1>
            <p>{{ t("typegen.intro", "Turn JSON, JSON Schema or a GraphQL query into typed models for any language, and edit the JSON they come from. Everything runs on this computer; nothing is uploaded.") }}</p>
        </header>

        <VTabs v-model="tab" :aria-label="t('typegen.sections', 'Type generator sections')">
            <VTab value="generate">{{ t("typegen.tab.generate", "Generate") }}</VTab>
            <VTab value="editor">{{ t("typegen.tab.editor", "JSON editor") }}</VTab>
        </VTabs>

        <div class="wl-tgs__panel">
            <TypeGenGeneratePanel
                v-show="tab === 'generate'"
                v-model:settings="settings"
                v-model:doc-text="docText"
                v-model:schema-text="schemaText"
                :client="client ?? null"
                :debounce-ms="debounceMs ?? 250"
            />
            <JsonEditorPanel v-show="tab === 'editor'" v-model="docText" v-model:schema-text="schemaText" />
        </div>
    </section>
</template>

<style scoped>
.wl-tgs { max-width: 1480px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.wl-tgs__head h1 { margin: 0; font: var(--md-sys-typescale-headline-medium-font, 400 28px/36px Roboto, sans-serif); }
.wl-tgs__head p { margin: 4px 0 0; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-tgs__panel { padding: 20px; border-radius: var(--md-sys-shape-corner-extra-large, 28px); background: rgb(var(--v-theme-surface-container, var(--v-theme-surface))); }
@media (max-width: 600px) { .wl-tgs { padding: 12px; } .wl-tgs__panel { padding: 12px; } }
</style>
