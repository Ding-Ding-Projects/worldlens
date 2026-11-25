<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownload, mdiFolderOpenOutline } from "@mdi/js";
import { VAlert, VBtn, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle, VProgressLinear, VSelect, VSwitch, VTextarea, VTextField } from "vuetify/components";
import AppearanceChoiceField from "../appearance/AppearanceChoiceField.vue";
import InfoButton from "../info/InfoButton.vue";
import TypeGenCodeView from "./TypeGenCodeView.vue";
import TypeGenOptionControl from "./TypeGenOptionControl.vue";
import { createTypeGenClient, type TypeGenClient } from "./typeGenClient.js";
import type { TypeGenSettings } from "./typeGenSettings.js";
import {
    DEFAULT_INFERENCE,
    INFERENCE_KEYS,
    MAX_INPUT_CHARS,
    type GenerateFailure,
    type GenerateSuccess,
    type InferenceSettings,
    type LanguageInfo,
    type OptionValue,
    type SourceKind,
} from "./typeGenTypes.js";

/**
 * The Generate surface: a source on one side, generated types on the other.
 *
 * Generation runs in a worker as the person types, so the interface never waits on it. Only the
 * newest request counts, so a slow earlier reply cannot overwrite a fresher result. The language
 * list and every option control are taken from the engine, so nothing here is a hand-kept copy of
 * what quicktype supports.
 */
const props = withDefaults(
    defineProps<{
        settings: TypeGenSettings;
        docText: string;
        schemaText: string;
        client?: TypeGenClient | null;
        /** How long typing must pause before the engine runs. */
        debounceMs?: number;
    }>(),
    { client: null, debounceMs: 250 },
);
const emit = defineEmits<{
    "update:settings": [settings: TypeGenSettings];
    "update:docText": [text: string];
    "update:schemaText": [text: string];
}>();

const { t } = useI18n();

const engine = props.client ?? createTypeGenClient();
const ownsEngine = props.client === null;
const languages = ref<readonly LanguageInfo[]>([]);
const loadFailed = ref<string | null>(null);
const graphqlSchema = ref("");
const graphqlQuery = ref("");
const pending = ref(false);
const result = ref<GenerateSuccess | GenerateFailure | null>(null);
const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

const typescriptReason = computed(() =>
    t(
        "typegen.source.typescript.reason",
        "TypeScript input needs the TypeScript compiler reading files from disk, which a browser or renderer cannot do. Use JSON Schema or JSON instead.",
    ),
);

const kindItems = computed(() => [
    { title: t("typegen.source.json", "JSON"), value: "json" },
    { title: t("typegen.source.schema", "JSON Schema"), value: "schema" },
    { title: t("typegen.source.typescript", "TypeScript (unavailable)"), value: "typescript", props: { disabled: true } },
    { title: t("typegen.source.graphql", "GraphQL"), value: "graphql" },
]);

const selectedLanguage = computed(() => languages.value.find((language) => language.name === props.settings.language) ?? null);
const languageItems = computed(() => languages.value.map((language) => ({ title: language.displayName, value: language.name })));
const changedOptions = computed(() => props.settings.options[props.settings.language] ?? {});
const primaryOptions = computed(() => selectedLanguage.value?.options.filter((option) => option.primary) ?? []);
const secondaryOptions = computed(() => selectedLanguage.value?.options.filter((option) => !option.primary) ?? []);

const text = computed({
    get: () => (props.settings.kind === "schema" ? props.schemaText : props.settings.kind === "graphql" ? graphqlSchema.value : props.docText),
    set: (value: string) => {
        if (props.settings.kind === "schema") emit("update:schemaText", value);
        else if (props.settings.kind === "graphql") graphqlSchema.value = value;
        else emit("update:docText", value);
    },
});
const sourceChars = computed(() => text.value.length + (props.settings.kind === "graphql" ? graphqlQuery.value.length : 0));
const tooLarge = computed(() => sourceChars.value > MAX_INPUT_CHARS);
const ready = computed(() => text.value.trim() !== "" && (props.settings.kind !== "graphql" || graphqlQuery.value.trim() !== ""));

function patch(next: Partial<TypeGenSettings>): void {
    emit("update:settings", { ...props.settings, ...next });
}
const setKind = (value: SourceKind): void => patch({ kind: value });
const setLanguage = (value: string): void => patch({ language: value });
const setTopLevel = (value: string): void => patch({ topLevelName: value });
function setInference(key: keyof InferenceSettings, value: boolean): void {
    patch({ inference: { ...props.settings.inference, [key]: value } });
}
function setOption(name: string, value: OptionValue | undefined): void {
    const current = { ...(props.settings.options[props.settings.language] ?? {}) };
    if (value === undefined) delete current[name];
    else current[name] = value;
    patch({ options: { ...props.settings.options, [props.settings.language]: current } });
}
const resetInference = (): void => patch({ inference: DEFAULT_INFERENCE });

const inferenceLabels = computed<Record<keyof InferenceSettings, { label: string; purpose: string }>>(() => ({
    inferEnums: {
        label: t("typegen.infer.enums", "Detect enums"),
        purpose: t("typegen.infer.enums.purpose", "Treat a string property whose values repeat from a small set as an enum rather than a plain string."),
    },
    inferMaps: {
        label: t("typegen.infer.maps", "Detect maps"),
        purpose: t("typegen.infer.maps.purpose", "Treat an object whose keys all look like data (ids, names) as a map from string to one value type instead of a class."),
    },
    inferDateTimes: {
        label: t("typegen.infer.dates", "Detect dates and times"),
        purpose: t("typegen.infer.dates.purpose", "Give a string that looks like a date, time or date and time its language's date type."),
    },
    inferUuids: {
        label: t("typegen.infer.uuids", "Detect UUIDs"),
        purpose: t("typegen.infer.uuids.purpose", "Give a string that looks like a UUID the UUID type where the language has one."),
    },
    inferIntegerStrings: {
        label: t("typegen.infer.integerStrings", "Detect numbers in strings"),
        purpose: t("typegen.infer.integerStrings.purpose", "Treat a string that always holds an integer, such as \"42\", as an integer that is written as a string."),
    },
    inferBooleanStrings: {
        label: t("typegen.infer.booleanStrings", "Detect booleans in strings"),
        purpose: t("typegen.infer.booleanStrings.purpose", "Treat a string that is always \"true\" or \"false\" as a boolean written as a string."),
    },
    combineClasses: {
        label: t("typegen.infer.combine", "Merge similar classes"),
        purpose: t("typegen.infer.combine.purpose", "Fold classes whose properties are nearly the same into one, instead of one class for every shape seen."),
    },
    ignoreJsonRefs: {
        label: t("typegen.infer.ignoreRefs", "Ignore $ref in JSON"),
        purpose: t("typegen.infer.ignoreRefs.purpose", "Do not follow a property called $ref as a JSON Schema reference when the input is plain JSON."),
    },
    allPropertiesOptional: {
        label: t("typegen.infer.optional", "Make every property optional"),
        purpose: t("typegen.infer.optional.purpose", "Mark every property as optional, whether or not every sample had it."),
    },
    alphabetizeProperties: {
        label: t("typegen.infer.alphabetize", "Sort properties alphabetically"),
        purpose: t("typegen.infer.alphabetize.purpose", "List properties in alphabetical order rather than in the order they first appear."),
    },
}));

/* ----------------------------- generation ----------------------------- */

async function run(): Promise<void> {
    if (props.settings.kind === "typescript" || !ready.value) {
        result.value = null;
        pending.value = false;
        return;
    }
    if (tooLarge.value) {
        result.value = {
            type: "generated",
            id: 0,
            ok: false,
            failure: "tooLarge",
            message: t("typegen.error.tooLarge", { max: MAX_INPUT_CHARS.toLocaleString("en-US") }, "The input is larger than {max} characters. Trim it or generate from a smaller sample."),
        };
        pending.value = false;
        return;
    }
    pending.value = true;
    const reply = await engine.generate({
        kind: props.settings.kind,
        topLevelName: props.settings.topLevelName,
        text: text.value,
        query: graphqlQuery.value,
        language: props.settings.language,
        rendererOptions: changedOptions.value,
        inference: props.settings.inference,
    });
    if (reply === null) return;
    result.value = reply;
    pending.value = false;
}

function schedule(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void run(), props.debounceMs);
}

watch(
    () => [props.settings, props.docText, props.schemaText, graphqlSchema.value, graphqlQuery.value] as const,
    schedule,
    { deep: true },
);

onMounted(async () => {
    try {
        languages.value = await engine.languages();
        if (languages.value.length > 0 && !languages.value.some((language) => language.name === props.settings.language)) {
            setLanguage(languages.value[0]?.name ?? "typescript");
        }
    } catch (error) {
        loadFailed.value = error instanceof Error ? error.message : String(error);
    }
    schedule();
});
onBeforeUnmount(() => {
    if (timer !== null) clearTimeout(timer);
    if (ownsEngine) engine.dispose();
});

/* ----------------------------- output actions ----------------------------- */

const code = computed(() => (result.value?.ok ? result.value.code : ""));
const lineCount = computed(() => (code.value === "" ? 0 : code.value.split("\n").length));

async function copyCode(): Promise<void> {
    try {
        await navigator.clipboard.writeText(code.value);
        notice.value = { kind: "success", text: t("typegen.output.copied", "Copied the generated code.") };
    } catch {
        notice.value = { kind: "error", text: t("typegen.output.noClipboard", "The clipboard is not available here. Use Save instead.") };
    }
}
function saveCode(): void {
    const extension = selectedLanguage.value?.extension ?? "txt";
    const url = URL.createObjectURL(new Blob([code.value], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${props.settings.topLevelName.trim() || "Root"}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
}
async function openSource(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_INPUT_CHARS * 2) {
        notice.value = { kind: "error", text: t("typegen.source.fileTooBig", "That file is larger than the generator accepts, so it was not opened.") };
        return;
    }
    text.value = await file.text();
}

defineExpose({ run });
</script>

<template>
    <div class="wl-tg" data-test="generate-panel">
        <section class="wl-tg__col" :aria-label="t('typegen.source.label', 'Source')">
            <h2 class="wl-tg__h">{{ t("typegen.source.label", "Source") }}</h2>
            <div class="wl-tg__row">
                <VSelect
                    :model-value="settings.kind"
                    :items="kindItems"
                    :label="t('typegen.source.kind', 'Input kind')"
                    density="compact"
                    hide-details
                    data-test="kind-select"
                    @update:model-value="(value: SourceKind) => setKind(value)"
                />
                <VTextField
                    :model-value="settings.topLevelName"
                    :label="t('typegen.source.name', 'Top-level type name')"
                    density="compact"
                    hide-details
                    data-test="top-level-name"
                    @update:model-value="(value: string) => setTopLevel(value)"
                />
            </div>
            <p class="wl-tg__hint" data-test="typescript-reason">{{ typescriptReason }}</p>

            <template v-if="settings.kind === 'graphql'">
                <VTextarea
                    v-model="graphqlSchema"
                    :label="t('typegen.source.graphqlSchema', 'GraphQL schema (introspection JSON or SDL)')"
                    rows="8"
                    auto-grow
                    max-rows="16"
                    hide-details
                    spellcheck="false"
                    class="wl-tg__mono"
                    data-test="source-text"
                />
                <VTextarea
                    v-model="graphqlQuery"
                    :label="t('typegen.source.graphqlQuery', 'GraphQL query')"
                    rows="5"
                    auto-grow
                    max-rows="12"
                    hide-details
                    spellcheck="false"
                    class="wl-tg__mono"
                    data-test="graphql-query"
                />
            </template>
            <VTextarea
                v-else
                v-model="text"
                :label="settings.kind === 'schema' ? t('typegen.source.schemaText', 'JSON Schema') : t('typegen.source.jsonText', 'JSON')"
                :placeholder="t('typegen.source.placeholder', 'Paste or type here, or open a file. Types appear as you type.')"
                rows="10"
                auto-grow
                max-rows="20"
                hide-details
                spellcheck="false"
                class="wl-tg__mono"
                data-test="source-text"
            />
            <div class="wl-tg__row">
                <VBtn variant="text" :prepend-icon="mdiFolderOpenOutline" @click="fileInput?.click()">{{ t("typegen.source.open", "Open file") }}</VBtn>
                <VBtn variant="text" :disabled="text === ''" @click="text = ''">{{ t("typegen.source.clear", "Clear") }}</VBtn>
                <span class="wl-tg__hint" :class="{ 'wl-tg__bad': tooLarge }" data-test="size">
                    {{ t("typegen.source.size", { count: sourceChars.toLocaleString("en-US"), max: MAX_INPUT_CHARS.toLocaleString("en-US") }, "{count} of {max} characters") }}
                </span>
                <input ref="fileInput" class="wl-tg__file" type="file" accept=".json,.graphql,.gql,.txt,application/json" tabindex="-1" aria-hidden="true" @change="openSource" />
            </div>

            <h2 class="wl-tg__h">{{ t("typegen.infer.title", "Inference") }}</h2>
            <div class="wl-tg__grid">
                <div v-for="key in INFERENCE_KEYS" :key="key" class="wl-tg__with-info">
                    <VSwitch
                        :model-value="settings.inference[key]"
                        :label="inferenceLabels[key].label"
                        density="compact"
                        hide-details
                        color="primary"
                        :data-test="`infer-${key}`"
                        @update:model-value="(value: unknown) => setInference(key, value === true)"
                    />
                    <InfoButton
                        :control="inferenceLabels[key].label"
                        :guide="{ purpose: inferenceLabels[key].purpose, defaultValue: DEFAULT_INFERENCE[key] ? t('typegen.option.on', 'On') : t('typegen.option.off', 'Off') }"
                        resettable
                        @reset="setInference(key, DEFAULT_INFERENCE[key])"
                    />
                </div>
            </div>
            <div><VBtn size="small" variant="text" @click="resetInference">{{ t("typegen.infer.reset", "Reset inference") }}</VBtn></div>
        </section>

        <section class="wl-tg__col" :aria-label="t('typegen.output.label', 'Generated code')">
            <h2 class="wl-tg__h">{{ t("typegen.output.label", "Generated code") }}</h2>
            <div class="wl-tg__row">
                <AppearanceChoiceField
                    v-if="languages.length > 0"
                    :model-value="settings.language"
                    :items="languageItems"
                    :label="t('typegen.language', 'Language')"
                    @update:model-value="(value: string) => setLanguage(value)"
                />
                <span v-else-if="loadFailed === null" class="wl-tg__hint" role="status">{{ t("typegen.language.loading", "Loading the languages…") }}</span>
                <VBtn variant="tonal" :prepend-icon="mdiContentCopy" :disabled="code === ''" data-test="copy-code" @click="copyCode">{{ t("typegen.output.copy", "Copy") }}</VBtn>
                <VBtn variant="tonal" :prepend-icon="mdiDownload" :disabled="code === ''" @click="saveCode">{{ t("typegen.output.save", "Save") }}</VBtn>
                <span v-if="code === ''" class="wl-tg__hint">{{ t("typegen.output.nothing", "Copy and Save turn on once there is generated code.") }}</span>
            </div>

            <VAlert v-if="loadFailed !== null" type="error" variant="tonal" role="alert">{{ t("typegen.language.failed", { reason: loadFailed }, "The generator could not start: {reason}") }}</VAlert>
            <VAlert v-if="notice" :type="notice.kind" variant="tonal" closable role="status" @click:close="notice = null">{{ notice.text }}</VAlert>
            <VProgressLinear v-if="pending" indeterminate :aria-label="t('typegen.output.working', 'Generating…')" />

            <VAlert v-if="result && !result.ok" type="error" variant="tonal" role="alert" data-test="generate-error">
                <strong>{{ result.failure === "parse" ? t("typegen.error.parse", "The source could not be read.") : result.failure === "unsupported" ? t("typegen.error.unsupported", "This is not available here.") : result.failure === "tooLarge" ? t("typegen.error.large", "The source is too large.") : t("typegen.error.engine", "The generator stopped.") }}</strong>
                <span class="wl-tg__msg">{{ result.message }}</span>
            </VAlert>

            <p v-if="!ready && !result" class="wl-tg__empty" data-test="empty">{{ t("typegen.output.empty", "Add a source on the left and the generated types appear here.") }}</p>

            <template v-if="result && result.ok">
                <p class="wl-tg__hint" role="status" data-test="status">
                    {{ t("typegen.output.done", { lines: lineCount, ms: result.elapsedMs }, "Generated {lines} lines in {ms} ms.") }}
                </p>
                <TypeGenCodeView :code="result.code" :label="t('typegen.output.code', 'Generated code')" />

                <details v-if="result.inferred.length > 0" class="wl-tg__inspector" open data-test="inspector">
                    <summary>{{ t("typegen.inspector.title", { count: result.inferred.length }, "Inferred types ({count})") }}</summary>
                    <ul>
                        <li v-for="type in result.inferred" :key="type.name">
                            <strong>{{ type.name }}</strong>
                            <span class="wl-tg__hint"> {{ type.kind === "object" ? t("typegen.inspector.object", "object") : type.kind === "enum" ? t("typegen.inspector.enum", "enum") : type.kind === "union" ? t("typegen.inspector.union", "union") : t("typegen.inspector.other", "alias") }}</span>
                            <ul v-if="type.properties.length > 0" class="wl-tg__props">
                                <li v-for="property in type.properties" :key="property.name">
                                    <code>{{ property.name }}{{ property.required ? "" : "?" }}</code>: <code>{{ property.type }}</code>
                                </li>
                            </ul>
                            <code v-else-if="type.values.length > 0" class="wl-tg__values">{{ type.values.join(" | ") }}</code>
                        </li>
                    </ul>
                </details>
            </template>

            <h2 class="wl-tg__h">{{ t("typegen.options.title", { language: selectedLanguage?.displayName ?? '' }, "{language} options") }}</h2>
            <p v-if="selectedLanguage && selectedLanguage.options.length === 0" class="wl-tg__hint">{{ t("typegen.options.none", "This language has no options of its own.") }}</p>
            <div v-else class="wl-tg__grid" data-test="language-options">
                <TypeGenOptionControl
                    v-for="option in primaryOptions"
                    :key="`${settings.language}-${option.name}`"
                    :option="option"
                    :model-value="changedOptions[option.name]"
                    @update:model-value="(value: OptionValue | undefined) => setOption(option.name, value)"
                />
            </div>
            <VExpansionPanels v-if="secondaryOptions.length > 0" variant="accordion">
                <VExpansionPanel>
                    <VExpansionPanelTitle>{{ t("typegen.options.more", { count: secondaryOptions.length }, "More options ({count})") }}</VExpansionPanelTitle>
                    <VExpansionPanelText>
                        <div class="wl-tg__grid" data-test="language-options-more">
                            <TypeGenOptionControl
                                v-for="option in secondaryOptions"
                                :key="`${settings.language}-${option.name}`"
                                :option="option"
                                :model-value="changedOptions[option.name]"
                                @update:model-value="(value: OptionValue | undefined) => setOption(option.name, value)"
                            />
                        </div>
                    </VExpansionPanelText>
                </VExpansionPanel>
            </VExpansionPanels>
        </section>
    </div>
</template>

<style scoped>
.wl-tg { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; align-items: start; }
.wl-tg__col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.wl-tg__h { margin: 0; font: var(--md-sys-typescale-title-medium-font, 500 16px/24px Roboto, sans-serif); }
.wl-tg__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.wl-tg__row > * { min-width: 0; }
.wl-tg__row :deep(.v-select), .wl-tg__row :deep(.v-text-field) { flex: 1 1 180px; }
.wl-tg__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; }
.wl-tg__with-info { display: flex; align-items: center; gap: 2px; min-width: 0; }
.wl-tg__with-info > :first-child { flex: 1 1 auto; min-width: 0; }
.wl-tg__hint { margin: 0; font-size: 12px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-tg__bad { color: rgb(var(--v-theme-error)); }
.wl-tg__empty { padding: 16px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); color: rgb(var(--v-theme-on-surface-variant)); }
.wl-tg__mono :deep(textarea) { font-family: "Roboto Mono", monospace; font-size: 13px; }
.wl-tg__file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.wl-tg__msg { display: block; margin-top: 4px; font: 13px "Roboto Mono", monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.wl-tg__inspector { padding: 8px 12px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-low, var(--v-theme-surface))); }
.wl-tg__inspector summary { cursor: pointer; font-weight: 500; }
.wl-tg__inspector ul { margin: 6px 0 0; padding-inline-start: 18px; }
.wl-tg__props { list-style: none; padding-inline-start: 8px !important; }
.wl-tg__values { overflow-wrap: anywhere; }
</style>
