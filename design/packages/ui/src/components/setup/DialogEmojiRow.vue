<script setup lang="ts">
import { computed } from "vue";
import { VSwitch } from "vuetify/components";
import SetupText from "./SetupText.vue";
import { useSetupI18n } from "./setupI18n.js";
import { dialogEmojiChoice, setDialogEmojiEnabled } from "./dialogEmoji.js";

/**
 * The **Show emojis in dialogs** switch, beside the funny levels in Language and tone.
 *
 * It sits with the funny levels because it answers the same question, how playful the app
 * should look, and like them it is suppressed (not just disabled) while School mode is on:
 * `LanguageSettingsRow.vue` omits this row with the rest of the language controls.
 *
 * The switch label is plain words with no emoji in it, as the setting itself requires.
 */
const i18n = useSetupI18n();

const enabled = computed(() => dialogEmojiChoice());

function onToggle(value: boolean | null): void {
    setDialogEmojiEnabled(value === true);
}
</script>

<template>
    <div class="mb-dialog-emoji-row" data-testid="dialog-emoji-row">
        <v-switch
            :model-value="enabled"
            color="primary"
            hide-details
            inset
            :label="i18n.t('language.dialogEmoji.label')"
            @update:model-value="(value: boolean | null) => onToggle(value)"
        />
        <SetupText text-key="language.dialogEmoji.summary" class="mb-dialog-emoji-row__summary" />
    </div>
</template>

<style>
.mb-dialog-emoji-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-dialog-emoji-row__summary {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}
</style>
