<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtnToggle, VBtn, VTextField } from "vuetify/components";
import { makeAxis, type Coord3, type CoordMode } from "./commandBuilderModel.js";

/**
 * Three numeric steppers plus an explicit absolute/relative(`~`)/local(`^`) toggle per axis -
 * never a single text box the user has to type `~5 ^-1 12` into by hand. Every command that
 * takes a position in the builder uses this same control, so a map-supplied point and a
 * hand-typed one go through the identical, testable coordinate model.
 */
const props = defineProps<{ modelValue: Coord3; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: Coord3] }>();
const { t } = useI18n();

const AXES = ["x", "y", "z"] as const;

function setMode(axis: (typeof AXES)[number], mode: CoordMode): void {
    const current = props.modelValue[axis];
    emit("update:modelValue", { ...props.modelValue, [axis]: makeAxis(mode, current.value) });
}
function setValue(axis: (typeof AXES)[number], value: number): void {
    const current = props.modelValue[axis];
    emit("update:modelValue", { ...props.modelValue, [axis]: makeAxis(current.mode, Number.isFinite(value) ? value : 0) });
}

const modeLabels: Record<CoordMode, string> = {
    abs: t("mcserver.commandBuilder.coordAbsolute", "Absolute"),
    rel: t("mcserver.commandBuilder.coordRelative", "Relative (~)"),
    local: t("mcserver.commandBuilder.coordLocal", "Local (^)"),
};

const axisLabel = computed(() => ({ x: "X", y: "Y", z: "Z" }));
</script>

<template>
    <fieldset class="wl-mcserver-coord">
        <legend class="text-caption text-medium-emphasis">{{ label }}</legend>
        <div v-for="axis in AXES" :key="axis" class="wl-mcserver-coord__axis">
            <span class="wl-mcserver-coord__axis-label">{{ axisLabel[axis] }}</span>
            <VTextField
                :model-value="modelValue[axis].value"
                type="number"
                density="compact"
                hide-details
                style="max-width: 110px"
                :aria-label="t('mcserver.commandBuilder.axisValue', { axis: axisLabel[axis] }, '{axis} value')"
                @update:model-value="(v) => setValue(axis, Number(v))"
            />
            <VBtnToggle
                :model-value="modelValue[axis].mode"
                mandatory
                density="compact"
                variant="outlined"
                divided
                @update:model-value="(mode) => setMode(axis, mode as CoordMode)"
            >
                <VBtn value="abs" size="small" :title="modeLabels.abs">{{ t("mcserver.commandBuilder.coordAbsoluteShort", "abs") }}</VBtn>
                <VBtn value="rel" size="small" :title="modeLabels.rel">~</VBtn>
                <VBtn value="local" size="small" :title="modeLabels.local">^</VBtn>
            </VBtnToggle>
        </div>
    </fieldset>
</template>

<style scoped>
.wl-mcserver-coord {
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
    padding: 8px 12px 12px;
    margin: 0 0 8px;
}
.wl-mcserver-coord__axis {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    flex-wrap: wrap;
}
.wl-mcserver-coord__axis-label {
    width: 16px;
    font-weight: 600;
}
</style>
