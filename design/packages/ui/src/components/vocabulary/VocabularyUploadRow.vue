<script setup lang="ts">
/**
 * The always-present personal-vocabulary upload control.
 *
 * "Always present" is the point: this row renders in every one of its four states -
 * no file, loaded, just-rejected, and cleared - rather than appearing only once a file
 * exists, because the contract requires the control itself to be discoverable before
 * anybody has ever used it. Picking, replacing and clearing all route through
 * `vocabularyStore.ts`, which is the one place bytes are validated, cached and purged;
 * this component never touches `localStorage` or the schema directly.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiUpload } from "@mdi/js";
import { VAlert, VBtn } from "vuetify/components";
import { clearVocabulary, loadVocabularyFile, vocabularyStore } from "./vocabularyStore.js";
import type { VocabularyRejectionReason } from "./vocabularySchema.js";

const { t } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);

/** Set only while a just-picked file has been rejected, cleared by the next pick or clear. */
const rejection = ref<VocabularyRejectionReason | null>(null);

const entryCount = computed(() => Object.keys(vocabularyStore.entries).length);

/**
 * One rejection reason, in words.
 *
 * A literal `t()` call per branch rather than a key assembled from `reason`, because the
 * catalogue coverage guard reads the source for literal calls and cannot follow a key built
 * at runtime. Assembled, every one of these reads as an entry nobody calls, and the guard
 * cannot tell that from a key somebody deleted the call site of.
 */
function reasonText(reason: VocabularyRejectionReason): string {
    switch (reason) {
        case "too-large":
            return t("vocabulary.reason.too-large", "too large");
        case "malformed-json":
            return t("vocabulary.reason.malformed-json", "malformed json");
        case "not-an-object":
            return t("vocabulary.reason.not-an-object", "not an object");
        case "unexpected-field":
            return t("vocabulary.reason.unexpected-field", "unexpected field");
        case "missing-schema-version":
            return t("vocabulary.reason.missing-schema-version", "missing schema version");
        case "unknown-schema-version":
            return t("vocabulary.reason.unknown-schema-version", "unknown schema version");
        case "missing-entries":
            return t("vocabulary.reason.missing-entries", "missing entries");
        case "entries-not-an-object":
            return t("vocabulary.reason.entries-not-an-object", "entries not an object");
        case "too-many-entries":
            return t("vocabulary.reason.too-many-entries", "too many entries");
        case "too-deeply-nested":
            return t("vocabulary.reason.too-deeply-nested", "too deeply nested");
        case "unsafe-key":
            return t("vocabulary.reason.unsafe-key", "unsafe key");
        case "key-too-long":
            return t("vocabulary.reason.key-too-long", "key too long");
        case "empty-key":
            return t("vocabulary.reason.empty-key", "empty key");
        case "duplicate-key":
            return t("vocabulary.reason.duplicate-key", "duplicate key");
        case "value-not-a-string":
            return t("vocabulary.reason.value-not-a-string", "value not a string");
        case "value-too-long":
            return t("vocabulary.reason.value-too-long", "value too long");
        case "read-failed":
            return t("vocabulary.reason.read-failed", "read failed");
        default:
            return t(
                "vocabulary.reason.unknown",
                "the file does not match the expected format",
            );
    }
}

const description = computed(() =>
    t(
        "vocabulary.upload.description",
        "Upload your own local JSON file to replace specific words with your own, everywhere this app shows text. Nothing is sent anywhere, and nothing changes until you supply a file.",
    ),
);

const statusMessage = computed(() => {
    if (rejection.value !== null) {
        return t(
            "vocabulary.upload.invalid",
            { reason: reasonText(rejection.value) },
            "That file was not applied: {reason} Nothing already on screen was changed.",
        );
    }
    if (vocabularyStore.status === "cache-unreadable") {
        return t(
            "vocabulary.upload.cacheUnreadable",
            "The saved vocabulary could not be read back, so original wording is in effect. Upload it again to restore it.",
        );
    }
    if (vocabularyStore.status === "loaded") {
        return t(
            "vocabulary.upload.loaded",
            { count: entryCount.value },
            "Loaded: {count} words replaced. Cleared, this reverts to the original wording.",
        );
    }
    return t(
        "vocabulary.upload.noFile",
        "No vocabulary file supplied. Everything is shown in its original wording.",
    );
});

const statusSeverity = computed<"success" | "warning" | "info">(() => {
    if (rejection.value !== null) return "warning";
    if (vocabularyStore.status === "cache-unreadable") return "warning";
    if (vocabularyStore.status === "loaded") return "success";
    return "info";
});

const pickLabel = computed(() =>
    vocabularyStore.status === "loaded"
        ? t("vocabulary.upload.replaceFile", "Replace the vocabulary file...")
        : t("vocabulary.upload.chooseFile", "Choose a vocabulary file..."),
);

function openPicker(): void {
    fileInput.value?.click();
}

async function onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the input's own value so choosing the same filename twice in a row still
    // fires a change event the second time, which browsers otherwise suppress.
    input.value = "";
    if (file === undefined) return;

    let bytes: string;
    try {
        bytes = await file.text();
    } catch {
        rejection.value = "read-failed";
        return;
    }

    const result = loadVocabularyFile(bytes);
    if (!result.ok) {
        rejection.value = (result.reason ?? "malformed-json") as VocabularyRejectionReason;
        return;
    }
    rejection.value = null;
}

function onClear(): void {
    clearVocabulary();
    rejection.value = null;
}
</script>

<template>
    <div class="mb-vocabulary-row">
        <p class="mb-vocabulary-row__description">{{ description }}</p>

        <VAlert
            :type="statusSeverity"
            variant="tonal"
            density="comfortable"
            role="status"
            class="mb-vocabulary-row__status"
        >
            {{ statusMessage }}
        </VAlert>

        <div class="mb-vocabulary-row__actions">
            <VBtn :prepend-icon="mdiUpload" size="small" variant="tonal" @click="openPicker">
                {{ pickLabel }}
            </VBtn>
            <VBtn
                v-if="vocabularyStore.status === 'loaded'"
                :prepend-icon="mdiClose"
                size="small"
                variant="text"
                @click="onClear"
            >
                {{ t("vocabulary.upload.clear", "Clear") }}
            </VBtn>
            <input
                ref="fileInput"
                class="mb-vocabulary-row__file"
                type="file"
                accept="application/json,.json"
                :aria-label="t('vocabulary.upload.fileInputLabel', 'Personal vocabulary JSON file')"
                @change="onFileChosen"
            />
        </div>
    </div>
</template>

<style>
.mb-vocabulary-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mb-vocabulary-row__description {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-vocabulary-row__status {
    overflow-wrap: anywhere;
}

.mb-vocabulary-row__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

/*
 * Kept in the accessibility tree and reachable by keyboard through the visible button
 * above that clicks it, rather than `display: none`, which some assistive tech treats
 * as removed entirely. Same pattern as `AppearanceEditor.vue`'s own file input.
 */
.mb-vocabulary-row__file {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
}
</style>
