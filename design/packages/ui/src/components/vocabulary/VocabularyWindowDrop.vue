<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { beginVocabularyImport, loadVocabularyFile, vocabularyStore } from "./vocabularyStore.js";
import { playVocabularyOutcome } from "./vocabularySounds.js";
import { VOCABULARY_MAX_BYTES } from "./vocabularySchema.js";

const props = defineProps<{ restricted: boolean }>();
const emit = defineEmits<{ outcome: [success: boolean] }>();
const { t } = useI18n();
const headline = ref("");
const refusal = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let request = 0;
function dismiss(): void {
    clearTimeout(timer);
    headline.value = "";
    refusal.value = "";
}
watch(
    () => props.restricted,
    () => {
        request += 1;
        dismiss();
    },
);
watch(
    () => vocabularyStore.status,
    (status) => {
        if (status !== "loaded") dismiss();
    },
);

async function onDrop(event: DragEvent): Promise<void> {
    const files = Array.from(event.dataTransfer?.files ?? []);
    // Claim JSON before nested schematic/world handlers can consume the same event.
    // Other supported application file formats retain their own drop routes.
    if (!files.some((file) => /\.json$/iu.test(file.name) || file.type === "application/json"))
        return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (props.restricted) return;
    const current = ++request;
    const generation = beginVocabularyImport();
    dismiss();
    const file = files[0];
    let ok = false;
    if (files.length === 1 && file !== undefined && file.size <= VOCABULARY_MAX_BYTES) {
        try {
            const bytes = await file.text();
            if (current !== request || props.restricted) return;
            const result = await loadVocabularyFile(bytes, generation);
            if (result.reason === "superseded") return;
            ok = result.ok;
        } catch {
            /* Report only generic copy; never expose file metadata or payload. */
        }
    }
    if (current !== request || props.restricted) return;
    if (ok) {
        headline.value =
            vocabularyStore.entries["private vocabulary"]?.trim() ||
            t("vocabulary.drop.applied", "Personal wording applied");
    } else {
        refusal.value = t(
            "vocabulary.drop.refused",
            "The file was not applied. Drop one valid personal-vocabulary JSON file, up to 256 KiB, and ensure local storage is available. Your previous wording remains active.",
        );
    }
    emit("outcome", ok);
    void playVocabularyOutcome(ok);
    if (ok) timer = setTimeout(dismiss, 3400);
    else refusal.value = ""; // The application notification centre owns error dismissal.
}
onMounted(() => window.addEventListener("drop", onDrop, true));
onUnmounted(() => {
    request += 1;
    dismiss();
    window.removeEventListener("drop", onDrop, true);
});
</script>

<template>
    <div
        v-if="!restricted"
        class="mb-vocabulary-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
    >
        <div v-if="headline" :key="headline" class="mb-vocabulary-feedback__headline">
            {{ headline }}
        </div>
        <div v-if="refusal" class="mb-vocabulary-feedback__refusal">{{ refusal }}</div>
    </div>
</template>

<style scoped>
.mb-vocabulary-feedback {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    pointer-events: none;
    padding: 24px;
}
.mb-vocabulary-feedback__headline,
.mb-vocabulary-feedback__refusal {
    max-inline-size: min(100%, 48rem);
    padding: 24px;
    border-radius: 24px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: var(--md-sys-elevation-shadow-level3);
    overflow-wrap: anywhere;
    text-align: center;
}
.mb-vocabulary-feedback__headline {
    font-size: clamp(1.5rem, 5vw, 3rem);
    font-weight: 700;
    animation: vocabulary-level-up 3.4s ease both;
}
@keyframes vocabulary-level-up {
    0% {
        opacity: 0;
        transform: scale(0.85) translateY(16px);
    }
    6%,
    94% {
        opacity: 1;
        transform: none;
    }
    100% {
        opacity: 0;
        transform: translateY(-12px);
    }
}
@media (prefers-reduced-motion: reduce) {
    .mb-vocabulary-feedback__headline {
        animation: none;
    }
}
</style>
