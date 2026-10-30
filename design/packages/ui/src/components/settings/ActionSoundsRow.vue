<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VSlider, VSwitch } from "vuetify/components";
import {
    actionSoundPrefs,
    setActionSoundsEnabled,
    setActionSoundsVolume,
} from "../../stores/actionSounds.js";

/**
 * The **Play action sounds** switch and its volume, in the Notifications section.
 *
 * Both read and write `stores/actionSounds.ts`'s one shared preference, the same one the
 * command palette row and the vocabulary row's mute switch change, so every control agrees.
 * Changes apply to the very next cue; nothing needs a restart.
 *
 * The slider's accessible name comes from its `name` prop (see `SetupLanguagePanel.vue` on
 * why `aria-label` would land on the wrapper instead), and the current percentage is shown
 * as text beside it rather than only as a thumb position.
 */
const { t } = useI18n();

const enabled = computed(() => actionSoundPrefs.enabled);
const percent = computed(() => Math.round(actionSoundPrefs.volume * 100));

function onToggle(value: boolean | null): void {
    setActionSoundsEnabled(value === true);
}

function onVolume(value: number | number[]): void {
    const level = Array.isArray(value) ? value[0] : value;
    if (typeof level === "number") setActionSoundsVolume(level / 100);
}
</script>

<template>
    <div class="mb-action-sounds-row" data-testid="action-sounds-row">
        <v-switch
            :model-value="enabled"
            color="primary"
            hide-details
            inset
            :label="t('settings.sounds.enabled', 'Play action sounds')"
            @update:model-value="(value: boolean | null) => onToggle(value)"
        />
        <div class="mb-action-sounds-row__volume">
            <p class="mb-action-sounds-row__volume-label">
                {{ t("settings.sounds.volume", "Action sound volume") }}
            </p>
            <v-slider
                :model-value="percent"
                :name="t('settings.sounds.volume', 'Action sound volume')"
                :min="0"
                :max="100"
                :step="5"
                :disabled="!enabled"
                density="comfortable"
                hide-details
                @update:model-value="onVolume"
            />
            <span class="mb-action-sounds-row__percent" aria-hidden="true">{{ percent }}%</span>
        </div>
        <p class="mb-action-sounds-row__summary">
            {{
                t(
                    "settings.sounds.summary",
                    "Short tones play when a save finishes, a render completes or fails, a success or error message arrives, and a destructive action is confirmed. Every result is still shown on screen. Quiet hours and the low-stimulation accommodation silence them too.",
                )
            }}
        </p>
    </div>
</template>

<style>
.mb-action-sounds-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-action-sounds-row__volume {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 16px;
}

.mb-action-sounds-row__volume-label {
    grid-column: 1 / -1;
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
}

.mb-action-sounds-row__percent {
    min-width: 48px;
    text-align: end;
    font-variant-numeric: tabular-nums;
    font-size: var(--md-sys-typescale-body-medium-size);
    white-space: nowrap;
}

.mb-action-sounds-row__summary {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}
</style>
