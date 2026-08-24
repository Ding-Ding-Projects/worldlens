<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VBtnToggle, VCard, VCardText, VChip, VDivider } from "vuetify/components";
import { mdiContentCopy, mdiDownload, mdiUpload } from "@mdi/js";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    RENDER_ENGINE_DESCRIPTORS,
    descriptorForRenderEngine,
    exportRenderEngineChoice,
    globalRenderEngineDefault,
    importRenderEngineChoice,
    renderEngineChoiceSearchValues,
    resolveRenderEngine,
    setGlobalRenderEngineDefault,
    type RenderEngineId,
    type RenderEngineSelection,
} from "./engineChoice.js";

const props = withDefaults(
    defineProps<{
        /** A stable project-file path or id. Omit for the global new-project default. */
        projectKey?: string | null;
        projectName?: string | null;
        /** Controlled project value from ProjectFile.render.engine. */
        projectEngine?: RenderEngineId | null;
        /** The Java probe is owned by the existing settings controller. */
        javaAvailable?: boolean | null;
        javaVersion?: string | null;
        renderEngineAvailable?: boolean | null;
        renderEngineVersion?: string | null;
        renderEngineSource?: string | null;
        renderEngineReason?: string | null;
    }>(),
    {
        projectKey: null,
        projectName: null,
        projectEngine: null,
        javaAvailable: null,
        javaVersion: null,
        renderEngineAvailable: null,
        renderEngineVersion: null,
        renderEngineSource: null,
        renderEngineReason: null,
    },
);

const { t } = useI18n();
const query = ref("");
const regex = ref(false);
const flags = ref("im");
const copied = ref(false);
const importMessage = ref<string | null>(null);

const emit = defineEmits<{
    "update:project-engine": [value: RenderEngineId];
}>();

const selection = computed<RenderEngineSelection>({
    get: () =>
        props.projectKey === null
            ? globalRenderEngineDefault()
            : (props.projectEngine ?? "typescript"),
    set: (value) => {
        if (props.projectKey === null) setGlobalRenderEngineDefault(value);
        else if (value !== "automatic") emit("update:project-engine", value);
    },
});

const resolved = computed<RenderEngineId>(() =>
    props.projectKey !== null && selection.value !== "automatic"
        ? selection.value
        : resolveRenderEngine(
              selection.value,
              props.javaAvailable === true,
              props.renderEngineAvailable === true,
          ),
);
const resolvedDescriptor = computed(() => descriptorForRenderEngine(resolved.value));
function descriptorVersion(descriptor: (typeof RENDER_ENGINE_DESCRIPTORS)[number]): string {
    if (descriptor.id === "upstream-java" && props.javaVersion !== null) {
        return `Java ${props.javaVersion}`;
    }
    return descriptor.version;
}
const sample = computed(() =>
    RENDER_ENGINE_DESCRIPTORS.map((descriptor) =>
        [
            descriptor.id,
            descriptor.name,
            descriptorVersion(descriptor),
            descriptor.provenance,
            ...descriptor.capabilities,
            ...descriptor.unsupported,
        ].join(" "),
    ).join("\n"),
);
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const visibleDescriptors = computed(() =>
    RENDER_ENGINE_DESCRIPTORS.filter((descriptor) =>
        matcher.value.test(
            [
                descriptor.id,
                descriptor.name,
                descriptorVersion(descriptor),
                descriptor.provenance,
                ...descriptor.capabilities,
                ...descriptor.unsupported,
            ].join("\n"),
        ),
    ),
);
const searchSummary = computed(() => {
    if (matcher.value.error !== null)
        return t(
            "settings.engineChoice.searchBad",
            "The pattern is not valid, so no engines are listed.",
        );
    return matcher.value.active
        ? t(
              "settings.engineChoice.searchFound",
              { shown: visibleDescriptors.value.length, total: RENDER_ENGINE_DESCRIPTORS.length },
              "{shown} of {total} engines match.",
          )
        : t(
              "settings.engineChoice.searchTotal",
              { total: RENDER_ENGINE_DESCRIPTORS.length },
              "{total} engines are available to compare.",
          );
});

function choose(value: RenderEngineSelection | null): void {
    if (value !== null) selection.value = value;
}

function resetProject(): void {
    if (props.projectKey !== null) {
        const global = globalRenderEngineDefault();
        if (global === "automatic" && props.javaAvailable === null) {
            importMessage.value = t(
                "settings.engineChoice.globalPending",
                "The global default is Automatic, but Java availability is still pending here. Keep the explicit project choice until the render probe resolves it.",
            );
            return;
        }
        const next = resolveRenderEngine(
            global,
            props.javaAvailable === true,
            props.renderEngineAvailable === true,
        );
        emit("update:project-engine", next);
    }
}

async function copyExport(): Promise<void> {
    copied.value = false;
    try {
        await navigator.clipboard?.writeText(exportRenderEngineChoice());
        copied.value = true;
    } catch {
        copied.value = false;
    }
}

function downloadExport(): void {
    const blob = new Blob([exportRenderEngineChoice()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "worldlens-render-engine-choice-v1.json";
    link.click();
    URL.revokeObjectURL(url);
}

async function importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;
    try {
        importMessage.value = importRenderEngineChoice(await file.text())
            ? t("settings.engineChoice.imported", "Engine choices imported.")
            : t(
                  "settings.engineChoice.importInvalid",
                  "That file is not a supported engine-choice export.",
              );
    } catch {
        importMessage.value = t(
            "settings.engineChoice.importInvalid",
            "That file is not a supported engine-choice export.",
        );
    } finally {
        input.value = "";
    }
}

function descriptorText(descriptor: (typeof RENDER_ENGINE_DESCRIPTORS)[number]): string {
    return (
        renderEngineChoiceSearchValues(
            selection.value,
            props.javaAvailable === true,
            props.renderEngineAvailable === true,
        ).join(" ") +
        " " +
        descriptor.name
    );
}
</script>

<template>
    <AppearanceTarget
        id="settings.render-engine-choice"
        :label="t('settings.engineChoice.appearanceLabel', 'Render engine choice')"
        as="section"
        class="mb-engine-choice"
    >
        <div class="mb-engine-choice__header">
            <div>
                <p class="mb-engine-choice__eyebrow">
                    {{
                        props.projectKey === null
                            ? t("settings.engineChoice.globalEyebrow", "New-project default")
                            : t("settings.engineChoice.projectEyebrow", "Project render engine")
                    }}
                </p>
                <h3 class="mb-engine-choice__title">
                    {{
                        props.projectName ??
                        t("settings.engineChoice.title", "Choose the render engine")
                    }}
                </h3>
            </div>
            <VChip size="small" color="primary" variant="tonal">
                {{ resolvedDescriptor.name }}
            </VChip>
        </div>

        <p class="mb-engine-choice__summary">
            {{
                props.projectKey === null
                    ? t(
                          "settings.engineChoice.globalSummary",
                          "This versioned setting is used for new projects. Existing projects keep their explicit choice or their recorded legacy behavior.",
                      )
                    : t(
                          "settings.engineChoice.projectSummary",
                          "This choice is stored with the project key. Automatic keeps Java when it is available and uses the app engine when no suitable JVM exists.",
                      )
            }}
        </p>

        <div
            class="mb-engine-choice__picker"
            role="group"
            :aria-label="t('settings.engineChoice.pickerLabel', 'Render engine selection')"
        >
            <VBtnToggle
                :model-value="selection"
                color="primary"
                variant="outlined"
                divided
                mandatory
                density="comfortable"
                @update:model-value="(value: RenderEngineSelection | null) => choose(value)"
            >
                <VBtn v-if="props.projectKey === null" value="automatic">{{
                    t("settings.engineChoice.automatic", "Automatic")
                }}</VBtn>
                <VBtn
                    value="upstream-java"
                    :disabled="props.projectKey !== null && props.javaAvailable === false"
                    >{{ t("settings.engineChoice.bluemap", "BlueMap original") }}</VBtn
                >
                <VBtn value="typescript">{{
                    t("settings.engineChoice.worldlens", "Worldlens app engine")
                }}</VBtn>
            </VBtnToggle>
            <VBtn v-if="props.projectKey !== null" variant="text" @click="resetProject">
                {{ t("settings.engineChoice.resetProject", "Use global default") }}
            </VBtn>
        </div>

        <VAlert
            v-if="
                props.projectKey !== null &&
                selection === 'upstream-java' &&
                (props.javaAvailable === null || props.renderEngineAvailable === null)
            "
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
        >
            {{
                t(
                    "settings.engineChoice.jvmPending",
                    "Java availability is not measured on this surface yet. The project keeps its explicit BlueMap choice; rendering will verify the runtime and report any refusal before starting.",
                )
            }}
        </VAlert>
        <VAlert
            v-else-if="
                props.projectKey !== null &&
                selection === 'upstream-java' &&
                (props.javaAvailable === false || props.renderEngineAvailable === false)
            "
            type="warning"
            variant="tonal"
            density="comfortable"
            role="alert"
        >
            {{
                props.renderEngineReason ??
                t(
                    "settings.engineChoice.jvmUnavailable",
                    "This project explicitly asks for the BlueMap engine, but no suitable JVM or verified engine artifact is available. The render is blocked until both are available; it will not silently switch engines.",
                )
            }}
        </VAlert>
        <VAlert
            v-else-if="
                selection === 'automatic' &&
                (props.javaAvailable === null || props.renderEngineAvailable === null)
            "
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
        >
            {{
                t(
                    "settings.engineChoice.jvmDeferred",
                    "Automatic will resolve after Java and the verified engine artifact are measured; the renderer will report the exact engine, version and capability record before it starts.",
                )
            }}
        </VAlert>
        <VAlert
            v-else-if="selection === 'automatic' && resolved === 'typescript'"
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
        >
            {{
                props.javaAvailable === false
                    ? t(
                          "settings.engineChoice.noJvm",
                          "No suitable JVM is available, so Automatic selects the Worldlens app engine. Nothing is downloaded and no silent fallback occurs.",
                      )
                    : (props.renderEngineReason ??
                      t(
                          "settings.engineChoice.noArtifact",
                          "The packaged BlueMap engine is unavailable, so Automatic selects the Worldlens app engine while repair remains available.",
                      ))
            }}
        </VAlert>
        <VAlert
            v-else-if="selection === 'automatic'"
            type="info"
            variant="tonal"
            density="comfortable"
            role="status"
        >
            {{
                t(
                    "settings.engineChoice.jvmAvailable",
                    { version: props.javaVersion ?? "available Java" },
                    "Automatic currently selects the BlueMap original engine because Java {version} and a verified engine artifact are available.",
                )
            }}
        </VAlert>

        <dl class="mb-engine-choice__facts">
            <div>
                <dt>{{ t("settings.engineChoice.resolved", "Resolved engine") }}</dt>
                <dd>{{ resolvedDescriptor.name }}</dd>
            </div>
            <div>
                <dt>{{ t("settings.engineChoice.version", "Version") }}</dt>
                <dd>{{ descriptorVersion(resolvedDescriptor) }}</dd>
            </div>
            <div>
                <dt>{{ t("settings.engineChoice.provenance", "Provenance") }}</dt>
                <dd>{{ resolvedDescriptor.provenance }}</dd>
            </div>
        </dl>

        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="t('settings.engineChoice.searchLabel', 'Search engines')"
            :placeholder="
                t(
                    'settings.engineChoice.searchHint',
                    'name, version, capability, or unsupported setting',
                )
            "
            :sample="sample"
            :summary="searchSummary"
            density="comfortable"
        />

        <div
            class="mb-engine-choice__cards"
            role="list"
            :aria-label="t('settings.engineChoice.comparison', 'Engine comparison')"
        >
            <VCard
                v-for="descriptor in visibleDescriptors"
                :key="descriptor.id"
                class="mb-engine-choice__card"
                variant="outlined"
                role="listitem"
                :data-engine="descriptor.id"
            >
                <VCardText>
                    <div class="mb-engine-choice__card-title">
                        <strong>{{ descriptor.name }}</strong>
                        <VChip
                            v-if="descriptor.id === resolved"
                            size="x-small"
                            color="primary"
                            variant="tonal"
                            >{{ t("settings.engineChoice.active", "Selected") }}</VChip
                        >
                    </div>
                    <p class="mb-engine-choice__version">{{ descriptorVersion(descriptor) }}</p>
                    <p class="mb-engine-choice__provenance">{{ descriptor.provenance }}</p>
                    <p class="mb-engine-choice__label">
                        {{ t("settings.engineChoice.capabilities", "Capabilities") }}
                    </p>
                    <ul>
                        <li v-for="capability in descriptor.capabilities" :key="capability">
                            {{ capability }}
                        </li>
                    </ul>
                    <p class="mb-engine-choice__label">
                        {{ t("settings.engineChoice.unsupported", "Unsupported or conditional") }}
                    </p>
                    <ul>
                        <li v-for="item in descriptor.unsupported" :key="item">{{ item }}</li>
                    </ul>
                    <span class="sr-only">{{ descriptorText(descriptor) }}</span>
                </VCardText>
            </VCard>
        </div>

        <VDivider />
        <div class="mb-engine-choice__exports">
            <VBtn :prepend-icon="mdiDownload" variant="tonal" @click="downloadExport">{{
                t("settings.engineChoice.export", "Export choices")
            }}</VBtn>
            <VBtn :prepend-icon="mdiContentCopy" variant="text" @click="copyExport">{{
                copied
                    ? t("settings.engineChoice.copied", "Copied")
                    : t("settings.engineChoice.copy", "Copy JSON")
            }}</VBtn>
            <label class="mb-engine-choice__import">
                <VBtn :prepend-icon="mdiUpload" variant="text" tag="span">{{
                    t("settings.engineChoice.import", "Import choices")
                }}</VBtn>
                <input type="file" accept="application/json,.json" @change="importFile" />
            </label>
        </div>
        <p
            v-if="importMessage !== null"
            class="mb-engine-choice__status"
            role="status"
            aria-live="polite"
        >
            {{ importMessage }}
        </p>
    </AppearanceTarget>
</template>

<style>
.mb-engine-choice {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.mb-engine-choice__header,
.mb-engine-choice__card-title,
.mb-engine-choice__exports {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.mb-engine-choice__header {
    justify-content: space-between;
}
.mb-engine-choice__eyebrow,
.mb-engine-choice__summary,
.mb-engine-choice__provenance,
.mb-engine-choice__version,
.mb-engine-choice__status {
    margin: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
}
.mb-engine-choice__eyebrow,
.mb-engine-choice__label {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.mb-engine-choice__title {
    margin: 0;
    font-size: 1rem;
}
.mb-engine-choice__summary,
.mb-engine-choice__provenance,
.mb-engine-choice__version,
.mb-engine-choice__status {
    font-size: 0.8125rem;
    line-height: 1.5;
}
.mb-engine-choice__picker {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}
.mb-engine-choice__picker .v-btn-toggle {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    width: 100%;
    max-width: 100%;
    height: auto;
}
.mb-engine-choice__picker .v-btn {
    min-height: 46px;
    white-space: normal;
}
.mb-engine-choice__facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 10px 16px;
    margin: 0;
}
.mb-engine-choice__facts dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}
.mb-engine-choice__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
}
.mb-engine-choice__cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
    gap: 10px;
}
.mb-engine-choice__card {
    min-width: 0;
}
.mb-engine-choice__card ul {
    margin: 4px 0 8px;
    padding-inline-start: 1.2rem;
    font-size: 0.78rem;
    line-height: 1.45;
}
.mb-engine-choice__import {
    position: relative;
    display: inline-flex;
    overflow: hidden;
}
.mb-engine-choice__import input {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
