<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { hexDump, previewKind, sniffMime } from "@worldlens/shared/base64";

/**
 * Safe preview of decoded bytes. The element is chosen from the bytes' signature, never from a
 * name or a claimed type: images, audio and video play from a blob URL in plain media elements,
 * text is shown as text, and anything else (SVG and HTML included) is a hex dump. Nothing is run,
 * opened or embedded in a frame.
 */
const props = defineProps<{ readonly bytes: Uint8Array | null; readonly truncated?: boolean }>();
const { t } = useI18n();

const LIMIT_TEXT = 64 * 1024;
const detected = computed(() => (props.bytes && props.bytes.length > 0 ? sniffMime(props.bytes) : null));
const kind = computed(() => (detected.value ? previewKind(detected.value.mime) : null));
const url = ref<string | null>(null);

watch(
    () => [props.bytes, kind.value] as const,
    ([bytes, k]) => {
        if (url.value) URL.revokeObjectURL(url.value);
        url.value = null;
        if (bytes && (k === "image" || k === "audio" || k === "video")) {
            url.value = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type: detected.value?.mime ?? "application/octet-stream" }));
        }
    },
    { immediate: true },
);
onBeforeUnmount(() => {
    if (url.value) URL.revokeObjectURL(url.value);
});

const text = computed(() => {
    if (!props.bytes || kind.value !== "text") return "";
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(props.bytes.slice(0, LIMIT_TEXT));
    } catch {
        return "";
    }
});
const dump = computed(() => (props.bytes && (kind.value === "hex" || (kind.value === "text" && !text.value)) ? hexDump(props.bytes, 4096) : ""));
</script>

<template>
    <figure class="wl-b64-preview" data-test="base64-preview">
        <figcaption class="wl-b64-preview__cap">
            <template v-if="detected">{{ t("base64.preview.detected", { mime: detected.mime, bytes: bytes?.length ?? 0 }, "Detected {mime} · {bytes} bytes") }}</template>
            <template v-else>{{ t("base64.preview.none", "Nothing to preview yet.") }}</template>
            <span v-if="truncated"> · {{ t("base64.preview.truncated", "showing the start only") }}</span>
        </figcaption>
        <img v-if="kind === 'image' && url" :src="url" :alt="t('base64.preview.imageAlt', 'Decoded image')" class="wl-b64-preview__media" />
        <audio v-else-if="kind === 'audio' && url" :src="url" controls preload="metadata" class="wl-b64-preview__media" />
        <video v-else-if="kind === 'video' && url" :src="url" controls preload="metadata" class="wl-b64-preview__media" />
        <pre v-else-if="text" class="wl-b64-preview__text">{{ text }}</pre>
        <pre v-else-if="dump" class="wl-b64-preview__text" :aria-label="t('base64.preview.hex', 'Hex dump')">{{ dump }}</pre>
    </figure>
</template>

<style scoped>
.wl-b64-preview { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.wl-b64-preview__cap { font-size: 13px; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-b64-preview__media { max-width: 100%; max-height: 320px; border-radius: var(--md-sys-shape-corner-medium, 12px); }
.wl-b64-preview__text { margin: 0; max-height: 320px; overflow: auto; padding: 12px; border-radius: var(--md-sys-shape-corner-medium, 12px); background: rgb(var(--v-theme-surface-container-lowest, var(--v-theme-background))); font: 12px/18px "Roboto Mono", monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
