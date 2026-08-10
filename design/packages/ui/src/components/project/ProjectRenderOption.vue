<script setup lang="ts">
import { mdiBackupRestore } from "@mdi/js";
import { VBtn } from "vuetify/components";

/**
 * One render option, wearing the same row the rest of the application's settings wear.
 *
 * The six options on the editor's "How it renders" tab are the only settings in this feature
 * with no `FieldMeta` behind them: they are project-level render arguments rather than keys in
 * a BlueMap config file, so `../config/ConfigField.vue` cannot render them and they spent a
 * long time as bare Vuetify controls with a sentence underneath. That is why the tab looked
 * like a different application to the map and storage tabs beside it, which is exactly the
 * complaint the rewrite exists to answer.
 *
 * So this is `ConfigField.vue`'s anatomy, restated for a value the schema does not describe:
 * a badge row above the control, the control itself in the default slot, what changing it
 * costs, and the state line with the revert beside it. Nothing here decides anything - every
 * string is handed in by the caller, which is what keeps the six options' real facts in the
 * one file that knows them.
 *
 * ## Why the cost is a sentence rather than only a badge
 *
 * `Worldlens.dc.html` marks a setting that forces already-rendered tiles to be drawn again
 * with a small red pill, and a pill alone is a thing somebody either already understands or
 * cannot look up. The pill is the scanning affordance and the sentence is the answer, because
 * the difference between a cheap edit and an hour of rendering is worth a line of prose. It is
 * also why the sentence is rendered rather than hidden in a tooltip: a tooltip is unreachable
 * by touch, easy to miss by keyboard, and this is the one fact on the row somebody most needs
 * before they press the control above it.
 */
withDefaults(
    defineProps<{
        /** The option's own key, shown the way `ConfigField.vue` shows a config path. */
        path: string;
        /** What changing this costs, in real words. Null for the options that cost nothing. */
        cost?: string | null;
        /** The badge beside the cost, e.g. "re-renders tiles". Required whenever `cost` is set. */
        costBadge?: string;
        /** The sentence naming the current value and BlueMap's own default. */
        state: string;
        /** True while the value already is the default, which is when there is nothing to revert. */
        atDefault?: boolean;
        /**
         * The revert action's label, which names the value it would restore rather than the
         * word "default" - "Revert to off" tells somebody what the button does before they
         * press it, and "Revert to default" only tells them that a default exists.
         */
        revertLabel: string;
    }>(),
    { cost: null, costBadge: "", atDefault: false },
);

const emit = defineEmits<{ revert: [] }>();
</script>

<template>
    <div class="mb-render-option">
        <div class="mb-render-option__badges">
            <span v-if="cost" class="mb-badge-pill mb-render-option__pill">{{ costBadge }}</span>
            <span class="mb-path mb-render-option__path">{{ path }}</span>
        </div>

        <slot />

        <p v-if="cost" class="mb-render-option__cost">{{ cost }}</p>

        <div class="mb-render-option__state">
            <span>{{ state }}</span>
            <v-btn
                v-if="!atDefault"
                :prepend-icon="mdiBackupRestore"
                variant="text"
                size="x-small"
                density="comfortable"
                @click="emit('revert')"
            >
                {{ revertLabel }}
            </v-btn>
        </div>
    </div>
</template>

<style>
/*
 * `padding: 14px 0` and the hairline underneath are the prototype's own field row, and they
 * are also what `ConfigField.vue` already draws, so a project's render options and a map's
 * config settings sit on the same rhythm rather than two.
 */
.mb-render-option {
    padding: 14px 0;
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
    min-inline-size: 0;
}

.mb-render-option:last-child {
    border-block-end: none;
}

.mb-render-option__badges {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    margin-block-end: 6px;
    min-inline-size: 0;
}

/*
 * The prototype's re-render pill is the one badge on the screen drawn in the error container
 * rather than the secondary one, because it is the only badge that reports a cost. Composed
 * with `.mb-badge-pill` so the shape, the size and the radius still come from the one place
 * that decides them.
 */
.mb-render-option__pill {
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
}

.mb-render-option__path {
    margin-inline-start: auto;
}

.mb-render-option__cost {
    margin-block-start: 6px;
    max-inline-size: 70ch;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-render-option__state {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 6px;
    font-size: 0.6875rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-outline));
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

/* The revert is a real target rather than a 20px strip of text, at every density. */
.mb-render-option__state .v-btn {
    min-block-size: 44px;
    block-size: auto;
    max-inline-size: 100%;
}

.mb-render-option__state .v-btn .v-btn__content {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: start;
}
</style>
