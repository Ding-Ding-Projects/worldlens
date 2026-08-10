<script setup lang="ts">
/**
 * The one map-node home for the render-mask editor.
 *
 * `ConfigMaskField.vue` remains the authority for the ordered BlueMap mask value. This card
 * only gives that editor a stable, map-level place above the rest of the generated settings;
 * a FieldMeta route opens this same card rather than mounting a second editor with a second
 * draft. That is important for shape order: a mask is a program, not five independent form
 * controls that happen to look alike.
 */
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp, mdiMapMarkerPath } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip } from "vuetify/components";
import type { PlainValue } from "@worldlens/config";
import ConfigMaskField from "./ConfigMaskField.vue";
import { UNKNOWN_WORLD, type WorldOrientation } from "./maskCanvas.js";

const props = withDefaults(
    defineProps<{
        modelValue: readonly PlainValue[];
        /** The selected map's real dimension, kept visible beside its measured guide data. */
        dimension: string;
        world?: WorldOrientation;
        disabled?: boolean;
        /** Whether this map file has an explicit `render-mask` key to remove. */
        explicit?: boolean;
    }>(),
    { world: () => UNKNOWN_WORLD, disabled: false, explicit: false },
);

const emit = defineEmits<{
    "update:modelValue": [value: PlainValue[]];
    clear: [];
}>();

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const open = ref(false);
const isDisabled = computed(() => props.disabled === true);
// Keep the optional source prop definite for the template under exactOptionalPropertyTypes.
const worldOrientation = computed<WorldOrientation>(() => props.world ?? UNKNOWN_WORLD);
const maskValue = computed<PlainValue[]>(() => [...props.modelValue]);
const layerCount = computed(() => props.modelValue.length);
const layerSummary = computed(() =>
    t("project.mask.layerCount", { count: layerCount.value }, "{count} ordered layer(s)"),
);

async function openAndFocus(): Promise<void> {
    open.value = true;
    await nextTick();
    const reducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.value?.scrollIntoView({
        block: "center",
        behavior: reducedMotion ? "auto" : "smooth",
    });
    root.value?.querySelector<HTMLButtonElement>("button")?.focus();
}

defineExpose({ openAndFocus });
</script>

<template>
    <section
        ref="root"
        class="mb-render-mask-card"
        data-render-mask-card
        tabindex="-1"
        :aria-label="t('project.mask.cardLabel', 'Render mask for this map')"
    >
        <v-card variant="tonal">
            <v-card-title class="mb-render-mask-card__title mb-responsive-card-title">
                <span>{{ t("project.mask.title", "Render mask") }}</span>
                <v-chip size="small" variant="outlined">{{ layerSummary }}</v-chip>
                <v-chip size="small" variant="outlined" :prepend-icon="mdiMapMarkerPath">
                    {{ dimension }}
                </v-chip>
                <v-chip
                    v-if="worldOrientation.regionCount !== null"
                    size="small"
                    variant="outlined"
                >
                    {{
                        t(
                            "project.mask.regionCount",
                            { count: worldOrientation.regionCount },
                            "{count} measured region files",
                        )
                    }}
                </v-chip>
                <v-btn
                    class="mb-responsive-card-title__action"
                    :append-icon="open ? mdiChevronUp : mdiChevronDown"
                    :aria-expanded="open ? 'true' : 'false'"
                    aria-controls="project-render-mask-editor"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="open = !open"
                >
                    {{
                        open
                            ? t("project.mask.hide", "Hide editor")
                            : t("project.mask.open", "Edit mask")
                    }}
                </v-btn>
            </v-card-title>

            <v-card-text>
                <p class="mb-render-mask-card__summary">
                    {{
                        t(
                            "project.mask.summary",
                            "Each ordered layer either renders an area or cuts it out. This is the same map-config value used by local and GitHub Actions renders.",
                        )
                    }}
                </p>

                <v-alert
                    v-if="worldOrientation.extent === null"
                    type="info"
                    density="compact"
                    variant="tonal"
                >
                    {{
                        t(
                            "project.mask.measurementUnavailable",
                            { reason: worldOrientation.extentUnavailableReason ?? "" },
                            "Measured region bounds are unavailable ({reason}). You can still draw with real block coordinates.",
                        )
                    }}
                </v-alert>

                <div
                    v-if="open"
                    id="project-render-mask-editor"
                    class="mb-render-mask-card__editor"
                >
                    <ConfigMaskField
                        :model-value="maskValue"
                        :label="t('project.mask.editorLabel', 'Render mask editor')"
                        :world="worldOrientation"
                        :disabled="isDisabled"
                        @update:model-value="(value) => emit('update:modelValue', value)"
                    />
                </div>

                <v-btn
                    v-if="explicit"
                    :disabled="isDisabled"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="emit('clear')"
                >
                    {{ t("project.mask.clear", "Revert entire mask to inherited default") }}
                </v-btn>
            </v-card-text>
        </v-card>
    </section>
</template>

<style>
.mb-render-mask-card {
    min-inline-size: 0;
    scroll-margin-block: 24px;
}

.mb-render-mask-card:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 4px;
}

.mb-render-mask-card__title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-render-mask-card__title > .mb-responsive-card-title__action {
    margin-inline-start: auto;
}

.mb-render-mask-card__summary {
    margin: 0 0 8px;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-render-mask-card__editor {
    margin-block: 12px;
}
</style>
