<script setup lang="ts">
/**
 * One surface in focus.
 *
 * ## Why this exists
 *
 * Version 1.0.2130 could show the appearance editor, the settings surface and an element's lock
 * wizard at the same time, each as a scrim-less popover anchored somewhere else, and two of them
 * painted no background of their own. The result was three layers of text printed over each
 * other: the lock wizard's paragraphs ran straight through the settings list and the updates card.
 *
 * The rule this component carries is the one the Contour design is built on: an editor takes the
 * whole window, and anything that asks a question (a lock, an unlock, a confirmation) is a modal
 * dialog on a scrim with an opaque surface. Nothing stacks translucently, and the thing in focus is
 * always the only thing that can be read.
 *
 * - `fullscreen` is the editor shape: the whole window, a top app bar with a close button, the
 *   content scrolling under it.
 * - Without it, the Material 3 basic dialog shape: surface-container-high, extra-large corners,
 *   elevation level 3, bounded and scrollable.
 *
 * Escape and the scrim close it through Vuetify's own `VDialog`, which also traps focus and returns
 * it to whatever opened the dialog.
 */
import { mdiClose } from "@mdi/js";
import { useI18n } from "vue-i18n";
import { VBtn, VDialog } from "vuetify/components";

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        /** Names the dialog for assistive technology, and titles the full-window app bar. */
        label: string;
        fullscreen?: boolean;
        maxWidth?: number | string;
    }>(),
    { fullscreen: false, maxWidth: 560 },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const { t } = useI18n();

function close(): void {
    emit("update:modelValue", false);
}
</script>

<template>
    <VDialog
        :model-value="props.modelValue"
        :fullscreen="props.fullscreen"
        :max-width="props.fullscreen ? undefined : props.maxWidth"
        :aria-label="props.label"
        data-test="focus-dialog"
        @update:model-value="(value: boolean) => emit('update:modelValue', value)"
    >
        <div
            class="mb-focus-dialog"
            :class="{ 'mb-focus-dialog--full': props.fullscreen }"
            role="document"
        >
            <header v-if="props.fullscreen" class="mb-focus-dialog__bar">
                <VBtn
                    :icon="mdiClose"
                    variant="text"
                    :aria-label="
                        t('shell.focusDialog.close', { label: props.label }, 'Close {label}')
                    "
                    data-test="focus-dialog-close"
                    @click="close"
                />
                <span class="mb-focus-dialog__bar-title">{{ props.label }}</span>
            </header>
            <div class="mb-focus-dialog__body">
                <slot :close="close" />
            </div>
        </div>
    </VDialog>
</template>

<style>
/*
 * Opaque by construction. The surface colour comes from the design system's role, never from
 * whatever the slotted component happens to paint, because the defect this replaces was exactly a
 * slotted component that painted nothing.
 */
.mb-focus-dialog {
    display: flex;
    flex-direction: column;
    max-block-size: min(90vh, 880px);
    overflow: hidden;
    border-radius: var(--md-sys-shape-corner-xl);
    background: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface);
    box-shadow: var(--md-sys-elevation-shadow-level3);
}

.mb-focus-dialog__body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    padding: 24px;
}

/* The full-window editor shape: no corners, no shadow, the window is the surface. */
.mb-focus-dialog--full {
    block-size: 100%;
    max-block-size: none;
    border-radius: var(--md-sys-shape-corner-none);
    background: var(--md-sys-color-surface-container-low);
    box-shadow: var(--md-sys-elevation-shadow-level0);
}

.mb-focus-dialog--full .mb-focus-dialog__body {
    padding: 12px 16px 16px;
}

.mb-focus-dialog__bar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 64px;
    padding: 8px 16px 8px 8px;
    box-sizing: border-box;
    background: var(--md-sys-color-surface-container-low);
}

.mb-focus-dialog__bar-title {
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
}

/*
 * The surfaces that used to float as popovers carried their own box: a fixed width, a cap on
 * their height, a border and a shadow. Inside a dialog that box is the dialog's job, so it goes.
 */
.mb-focus-dialog .mb-focus-dialog__body .mb-lock-wizard,
.mb-focus-dialog .mb-focus-dialog__body .mb-unlock {
    max-width: none;
    max-height: none;
    padding: 0;
}

.mb-focus-dialog--full .mb-appearance-editor {
    inline-size: 100%;
    max-inline-size: 1120px;
    max-block-size: none;
    margin-inline: auto;
    border: 0;
    border-radius: var(--md-sys-shape-corner-xl);
    background: var(--md-sys-color-surface);
    box-shadow: var(--md-sys-elevation-shadow-level0);
    padding: 24px;
}
</style>
