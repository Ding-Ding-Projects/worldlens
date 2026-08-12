<script setup lang="ts">
/**
 * The generated `render-mask` FieldMeta row, reduced to a route into the map card above.
 *
 * It deliberately owns no editable draft. The card is the one renderer of `ConfigMaskField`;
 * this keeps a palette/search deep link and a map-node click on the same ordered mask value.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiOpenInNew, mdiRestore } from "@mdi/js";
import { VBtn, VChip } from "vuetify/components";
import type { FieldMeta } from "@worldlens/config";
import { fieldValue, isExplicit, type EditableConfigFile } from "./configModel.js";

const props = withDefaults(
    defineProps<{
        field: FieldMeta;
        file: EditableConfigFile;
        disabled?: boolean;
        highlighted?: boolean;
    }>(),
    { disabled: false, highlighted: false },
);

const emit = defineEmits<{ open: []; clear: [] }>();
const { t } = useI18n();
const explicit = computed(() => isExplicit(props.file, props.field));
const layerCount = computed(() => {
    const value = fieldValue(props.file, props.field);
    return Array.isArray(value) ? value.length : 0;
});
const isDisabled = computed(() => props.disabled === true);
const controlType = computed(() =>
    t("config.field.type", { type: props.field.control.kind }, "Type: {type}"),
);
const documentationProvenance = computed(() =>
    props.field.docSource === "authored"
        ? t("config.field.sourceAuthored", "Docs: BlueMap source-derived explanation")
        : t("config.field.sourceUpstream", "Docs: BlueMap generated template"),
);
</script>

<template>
    <section
        class="mb-render-mask-launcher"
        :class="{
            'mb-render-mask-launcher--highlight': highlighted,
            'mb-render-mask-launcher--changed': explicit,
        }"
        :data-field-path="field.path"
        :aria-label="field.label"
    >
        <div class="mb-render-mask-launcher__badges">
            <v-chip size="x-small" variant="outlined" data-field-type>
                {{ controlType }}
            </v-chip>
            <v-chip size="x-small" variant="outlined" data-field-provenance>
                {{ documentationProvenance }}
            </v-chip>
            <span class="mb-render-mask-launcher__path">{{ field.path }}</span>
        </div>
        <h3 class="mb-render-mask-launcher__title">{{ field.label }}</h3>
        <p class="mb-render-mask-launcher__description">{{ field.doc.split("\n")[0] }}</p>
        <p class="mb-render-mask-launcher__state">
            {{
                explicit
                    ? t(
                          "project.mask.launcherSet",
                          { count: layerCount },
                          "This map sets {count} ordered layer(s).",
                      )
                    : t(
                          "project.mask.launcherInherited",
                          "This map inherits no mask, so BlueMap renders the whole world.",
                      )
            }}
        </p>
        <div class="mb-render-mask-launcher__actions">
            <v-btn
                :prepend-icon="mdiOpenInNew"
                :disabled="isDisabled"
                variant="tonal"
                size="small"
                density="comfortable"
                @click="emit('open')"
            >
                {{ t("project.mask.launcherOpen", "Open the shared Render mask card") }}
            </v-btn>
            <v-btn
                v-if="explicit"
                :prepend-icon="mdiRestore"
                :disabled="isDisabled"
                variant="text"
                size="small"
                density="comfortable"
                @click="emit('clear')"
            >
                {{ t("project.mask.launcherClear", "Revert to inherited default") }}
            </v-btn>
        </div>
        <p class="mb-render-mask-launcher__note">
            {{
                t(
                    "project.mask.launcherNote",
                    "This field opens the map node's one editor; it does not create a second mask draft.",
                )
            }}
        </p>
    </section>
</template>

<style>
.mb-render-mask-launcher {
    padding: 12px;
    margin-block: 8px;
    border: 1px solid rgba(var(--v-theme-outline), 0.35);
    border-radius: 12px;
    background: rgba(var(--v-theme-surface-variant), 0.28);
}

.mb-render-mask-launcher--highlight {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-render-mask-launcher--changed {
    border-color: rgb(var(--v-theme-primary));
}

.mb-render-mask-launcher__badges,
.mb-render-mask-launcher__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-render-mask-launcher__path,
.mb-render-mask-launcher__description,
.mb-render-mask-launcher__state,
.mb-render-mask-launcher__note {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-render-mask-launcher__path {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.mb-render-mask-launcher__title {
    margin: 8px 0 2px;
    font-size: 1rem;
    font-weight: 500;
}

.mb-render-mask-launcher__description,
.mb-render-mask-launcher__state,
.mb-render-mask-launcher__note {
    margin: 4px 0;
}
</style>
