<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "vuetify";
import type { Editor, RawEditorOptions } from "tinymce";
import { languageMode } from "../setup/setupI18n.js";
import { sanitizeRichText, toEditorHtml } from "./sanitizeRichText.js";
import { loadTinymce, TINYMCE_CANTONESE_LANGUAGE } from "./tinymceLoader.js";

/**
 * The one rich text box. Every field where a person formats text (bold, lists, links, tables)
 * uses this component and therefore the bundled, self-hosted TinyMCE; nothing else in the
 * application may host a formatting editor (`richTextInventory.test.ts` enforces that).
 *
 *  - It follows the application theme: the editor's own light or dark skin and the colours of
 *    the writing area are taken from the Vuetify theme in use, and a theme change rebuilds the
 *    editor around the same content.
 *  - It follows the language mode. TinyMCE can show one interface language at a time, so
 *    Cantonese mode loads its Cantonese pack and English and bilingual modes use English.
 *  - What it emits is always sanitized. The editor is never the only defence: the same
 *    DOMPurify pass runs again where the value is saved.
 *  - The editor loads on first use. While it loads, and if it cannot load at all, the field
 *    stays usable as a plain box holding the formatted text, and says so.
 */

const props = withDefaults(
    defineProps<{
        /** The stored value: formatted text, or a legacy plain note. */
        modelValue: string;
        /** The visible label, also the editor frame's accessible name. */
        label: string;
        disabled?: boolean;
        /** Why the field is disabled, shown beside it in words. */
        disabledReason?: string;
        /** The writing area's minimum height in pixels. */
        minHeight?: number;
    }>(),
    { disabled: false, disabledReason: "", minHeight: 160 },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();
const theme = useTheme();

const uid = Math.random().toString(36).slice(2, 9);
const sourceId = `mb-rich-text-${uid}`;
const reasonId = `mb-rich-text-reason-${uid}`;
const statusId = `mb-rich-text-status-${uid}`;

const root = ref<HTMLElement | null>(null);
const source = ref<HTMLTextAreaElement | null>(null);
const status = ref<"loading" | "ready" | "failed">("loading");

let editor: Editor | null = null;
let generation = 0;
let disposed = false;
/** The last value this component emitted or accepted, so its own echo is not applied twice. */
let lastValue = props.modelValue;

const dark = computed(() => theme.global.current.value.dark);
const language = computed(() => (languageMode() === "yue" ? TINYMCE_CANTONESE_LANGUAGE : "en"));
const readOnly = computed(() => props.disabled || status.value === "loading");

/** A theme colour as a CSS colour, read from the Vuetify variables the app already sets. */
function themeColour(name: string, fallback: string): string {
    if (typeof getComputedStyle !== "function" || root.value === null) return fallback;
    const triplet = getComputedStyle(root.value).getPropertyValue(`--v-theme-${name}`).trim();
    return triplet === "" ? fallback : `rgb(${triplet})`;
}

function contentStyle(): string {
    const surface = themeColour("surface", dark.value ? "#1c1b1f" : "#fffbfe");
    const onSurface = themeColour("on-surface", dark.value ? "#e6e1e5" : "#1c1b1f");
    const primary = themeColour("primary", dark.value ? "#d0bcff" : "#6750a4");
    const family =
        typeof getComputedStyle === "function" && root.value !== null
            ? getComputedStyle(root.value).fontFamily
            : "";
    return [
        `body { background: ${surface}; color: ${onSurface}; margin: 8px 12px;`,
        `font-family: ${family || "Roboto, sans-serif"}; font-size: 16px; line-height: 1.5; }`,
        `a { color: ${primary}; }`,
        "table { border-collapse: collapse; } td, th { border: 1px solid currentColor; padding: 4px 8px; }",
    ].join(" ");
}

function editorConfig(target: HTMLElement): RawEditorOptions {
    const config: RawEditorOptions = {
        target,
        license_key: "gpl",
        promotion: false,
        skin: dark.value ? "oxide-dark" : "oxide",
        content_css: dark.value ? "dark" : "default",
        content_style: contentStyle(),
        // Everything is bundled: no language file, skin, plugin or icon pack is fetched.
        language_load: false,
        plugins: "lists link autolink table charmap searchreplace wordcount fullscreen help",
        menubar: false,
        toolbar:
            "undo redo | blocks | bold italic underline strikethrough | forecolor | " +
            "bullist numlist outdent indent | link table charmap | alignleft aligncenter alignright | " +
            "removeformat searchreplace fullscreen help",
        // Narrow layouts keep every action: whatever does not fit folds into the overflow.
        toolbar_mode: "sliding",
        min_height: props.minHeight,
        resize: true,
        statusbar: true,
        elementpath: false,
        browser_spellcheck: true,
        iframe_aria_text: props.label,
        // Links stay as written and open safely; no image or media plugin is loaded, so there
        // is nothing to upload and nothing that can fetch from a third party.
        convert_urls: false,
        relative_urls: false,
        link_default_protocol: "https",
        link_assume_external_targets: "https",
        target_list: false,
        rel_list: [{ title: "No referrer", value: "noopener noreferrer" }],
        paste_data_images: false,
        entity_encoding: "raw",
        readonly: props.disabled,
        disabled: props.disabled,
    };
    if (language.value !== "en") config.language = language.value;
    return config;
}

/** The editor's content, cleaned, with an empty editor stored as an empty note. */
function currentValue(): string {
    if (editor === null) return lastValue;
    const html = sanitizeRichText(editor.getContent());
    return editor.getContent({ format: "text" }).trim() === "" && !/<(img|hr|table)\b/i.test(html)
        ? ""
        : html;
}

function publish(): void {
    const next = currentValue();
    if (next === lastValue) return;
    lastValue = next;
    emit("update:modelValue", next);
}

function destroyEditor(): void {
    const current = editor;
    editor = null;
    if (current === null) return;
    try {
        current.remove();
    } catch {
        // The frame may already be gone with its host; nothing is left to clean up.
    }
}

async function startEditor(): Promise<void> {
    const mine = ++generation;
    const textarea = source.value;
    if (textarea === null) return;
    textarea.value = toEditorHtml(lastValue);
    status.value = "loading";

    let tinymce;
    try {
        tinymce = await loadTinymce();
    } catch {
        if (mine === generation && !disposed) status.value = "failed";
        return;
    }
    if (disposed || mine !== generation || source.value === null) return;

    try {
        const [created] = await tinymce.init({
            ...editorConfig(source.value),
            setup(instance: Editor) {
                instance.on("input change undo redo ExecCommand", publish);
            },
        });
        if (disposed || mine !== generation) {
            created?.remove();
            return;
        }
        editor = created ?? null;
        status.value = editor === null ? "failed" : "ready";
    } catch {
        if (mine === generation && !disposed) status.value = "failed";
    }
}

async function restartEditor(): Promise<void> {
    if (editor !== null) {
        lastValue = currentValue();
        if (source.value !== null) source.value.value = toEditorHtml(lastValue);
    }
    destroyEditor();
    await startEditor();
}

/** The plain box shown while the editor loads and when it cannot load. */
function onFallbackInput(event: Event): void {
    if (status.value === "ready") return;
    const next = sanitizeRichText((event.target as HTMLTextAreaElement).value);
    if (next === lastValue) return;
    lastValue = next;
    emit("update:modelValue", next);
}

onMounted(() => void startEditor());

onBeforeUnmount(() => {
    disposed = true;
    generation++;
    destroyEditor();
});

watch(
    () => props.modelValue,
    (incoming) => {
        if (incoming === lastValue) return;
        lastValue = incoming;
        if (editor !== null) editor.setContent(toEditorHtml(incoming));
        else if (source.value !== null) source.value.value = toEditorHtml(incoming);
    },
);

watch(
    () => props.disabled,
    (disabled) => {
        if (editor === null) return;
        try {
            editor.options.set("disabled", disabled);
        } catch {
            // Read-only mode below still stops editing if the option cannot change live.
        }
        editor.mode.set(disabled ? "readonly" : "design");
    },
);

watch([dark, language], () => void restartEditor());
</script>

<template>
    <div
        ref="root"
        class="mb-rich-text"
        :class="{ 'mb-rich-text--disabled': disabled, 'mb-rich-text--failed': status === 'failed' }"
        :data-state="status"
        :data-theme="dark ? 'dark' : 'light'"
    >
        <label class="mb-rich-text__label" :for="sourceId">{{ label }}</label>
        <textarea
            :id="sourceId"
            ref="source"
            class="mb-rich-text__source"
            :readonly="readOnly"
            :disabled="disabled"
            :aria-describedby="[disabled && disabledReason ? reasonId : '', status !== 'ready' ? statusId : ''].filter(Boolean).join(' ') || undefined"
            :rows="Math.max(4, Math.round((minHeight ?? 160) / 24))"
            spellcheck="true"
            @input="onFallbackInput"
        />
        <p v-if="status === 'loading'" :id="statusId" class="mb-rich-text__status" role="status">
            {{ t("richText.loading", "Loading the text editor...") }}
        </p>
        <p v-else-if="status === 'failed'" :id="statusId" class="mb-rich-text__status mb-rich-text__status--error" role="alert">
            {{
                t(
                    "richText.failed",
                    "The text editor could not load, so the note is shown as raw formatted text. It can still be edited and saved.",
                )
            }}
        </p>
        <p v-if="disabled && disabledReason" :id="reasonId" class="mb-rich-text__reason" data-test="rich-text-disabled-reason">
            {{ disabledReason }}
        </p>
    </div>
</template>

<style scoped>
.mb-rich-text {
    display: grid;
    gap: 6px;
    min-inline-size: 0;
}
.mb-rich-text__label {
    font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity, 0.7));
}
.mb-rich-text__source {
    inline-size: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.38);
    border-radius: 4px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
}
.mb-rich-text--disabled .mb-rich-text__source {
    opacity: 0.6;
}
.mb-rich-text__status,
.mb-rich-text__reason {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size, 0.75rem);
}
.mb-rich-text__status--error {
    color: rgb(var(--v-theme-error));
}
.mb-rich-text :deep(.tox-tinymce) {
    border-radius: 4px;
    border-color: rgba(var(--v-theme-on-surface), 0.38);
    inline-size: 100%;
}
</style>
