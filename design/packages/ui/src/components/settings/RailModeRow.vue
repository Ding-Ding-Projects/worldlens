<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VSwitch } from "vuetify/components";
import { changeRailMode, currentRailMode } from "../shell/railPrefs.js";

/**
 * Whether the navigation rail is drawn expanded, with full labels, or as the compact icon rail.
 *
 * A switch because the value is a boolean. It reads and writes `railPrefs.ts`'s one shared
 * readout, the same value the rail's own footer toggle and the command palette row change, so
 * the three controls always agree.
 */
const { t } = useI18n();

const expanded = computed(() => currentRailMode.value === "expanded");

function onToggle(value: boolean | null): void {
    changeRailMode(value === true ? "expanded" : "compact");
}
</script>

<template>
    <div class="mb-rail-mode-row">
        <v-switch
            :model-value="expanded"
            color="primary"
            hide-details
            inset
            :label="t('settings.display.railExpanded', 'Show navigation labels in full')"
            @update:model-value="(value: boolean | null) => onToggle(value)"
        />
        <p class="mb-rail-mode-row__summary">
            {{
                t(
                    "settings.display.railSummary",
                    "On, the navigation rail is a wide column with every destination and job named in full. Off, it is the compact icon rail with short labels. The collapse button at the foot of the rail changes the same setting.",
                )
            }}
        </p>
    </div>
</template>

<style>
.mb-rail-mode-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-rail-mode-row__summary {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}
</style>
