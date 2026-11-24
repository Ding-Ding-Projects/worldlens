<script setup lang="ts">
/**
 * A form of one registry part's fields, from `PART_FORMS`. Each control patches its own
 * field into the part's JSON; everything else in the file is kept as written.
 * Design: `design-sources/datapacks-and-chunks/RegistryForms.dc.html`.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VSelect, VSlider, VSwitch, VTextField } from "vuetify/components";
import ColorField from "../appearance/ColorField.vue";
import { PART_FORMS, type PartField } from "./partForms.js";
import { getAt, parseObject, setAt } from "./worldgenParts.js";

const props = defineProps<{ kind: string; text: string }>();
const emit = defineEmits<{ "update:text": [text: string] }>();
const { t } = useI18n();

const doc = computed(() => parseObject(props.text));
const fields = computed(() => PART_FORMS[props.kind] ?? []);
const value = (f: PartField): unknown => (doc.value === null ? undefined : getAt(doc.value, f.path));
const label = (f: PartField): string => t(`datapack.form.${props.kind}.${f.path}`, f.label);
function set(f: PartField, v: unknown): void {
    emit("update:text", setAt(props.text, f.path, v));
}
const numberOf = (f: PartField & { kind: "number" }): number => {
    const v = value(f);
    return typeof v === "number" ? v : f.fallback;
};
const textOf = (f: PartField): string => {
    const v = value(f);
    return typeof v === "string" ? v : "";
};
/** A colour the game stores as "#RRGGBB" text or as a packed number. */
const colourOf = (f: PartField): string => {
    const v = value(f);
    if (typeof v === "number") return `#${v.toString(16).padStart(6, "0")}`;
    return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff";
};
</script>

<template>
    <section class="wl-pf" :aria-label="t('datapack.form.title', 'Fields of this part')">
        <p v-if="doc === null" class="wl-pf__note">{{ t("datapack.wg.invalid", "Fix the JSON below to edit this here.") }}</p>
        <div v-else class="wl-pf__grid">
            <template v-for="f in fields" :key="f.path">
                <v-slider
                    v-if="f.kind === 'number'"
                    :model-value="numberOf(f)"
                    :min="f.min"
                    :max="f.max"
                    :step="f.step"
                    thumb-label
                    hide-details
                    :label="label(f)"
                    @update:model-value="(v: number) => set(f, v)"
                />
                <v-text-field
                    v-else-if="f.kind === 'text'"
                    :model-value="textOf(f)"
                    :label="label(f)"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="(v: string) => set(f, v)"
                />
                <v-select
                    v-else-if="f.kind === 'choice'"
                    :model-value="textOf(f) || null"
                    :items="[...f.options]"
                    :label="label(f)"
                    density="comfortable"
                    variant="outlined"
                    hide-details
                    @update:model-value="(v: string) => set(f, v)"
                />
                <v-switch
                    v-else-if="f.kind === 'switch'"
                    :model-value="value(f) === true"
                    :label="label(f)"
                    color="primary"
                    density="compact"
                    hide-details
                    @update:model-value="(v: boolean | null) => set(f, v === true)"
                />
                <ColorField v-else :model-value="colourOf(f)" :label="label(f)" @update:model-value="(v: string) => set(f, v.slice(0, 7))" />
            </template>
        </div>
        <p class="wl-pf__note">
            {{ t("datapack.form.kept", "Fields without a control here are kept in the JSON below exactly as written.") }}
        </p>
    </section>
</template>

<style scoped>
.wl-pf {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.wl-pf__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 12px;
    align-items: center;
}
.wl-pf__note {
    margin: 0;
    color: rgb(var(--v-theme-on-surface-variant, var(--v-theme-on-surface)));
}
</style>
