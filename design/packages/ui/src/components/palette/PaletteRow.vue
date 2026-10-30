<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowRightCircleOutline,
    mdiFlashOutline,
    mdiKeyboardReturn,
    mdiStar,
    mdiStarOutline,
    mdiTuneVariant,
} from "@mdi/js";
import { VIcon, VSwitch, VTextField } from "vuetify/components";
import { parseNumberInput, roundToStep } from "../config/fieldValue.js";
import type { PaletteItem } from "./paletteItems.js";
import PaletteChoiceField from "./PaletteChoiceField.vue";

/**
 * One row of the palette, and the place the "no decorative controls" rule is actually kept.
 *
 * A row is drawn from what its item *is*, never from what it looks like it should be. A
 * command or a destination is a single full-width button, because the whole row does one
 * thing when it is pressed and nothing inside it is separately operable. A setting is not a
 * button at all - it is a label beside the real control, so pressing Enter on the switch
 * flips the setting rather than "activating the row", and the palette stays open because
 * somebody adjusting a value usually wants to see it take effect and then adjust it again.
 *
 * **The number box commits, it does not stream.** Typing "1" on the way to "150" would
 * otherwise apply a render distance of one block, redraw, and save that to storage. So the
 * text is held locally while it is being typed and applied on `change` - blur or Enter -
 * which is one write per edit. The value is parsed and rounded through the same helpers the
 * options editor's own numeric fields use, so a value the palette accepts is a value that
 * surface would have accepted; anything that is not a number at all is discarded and the box
 * snaps back to the setting's real value rather than silently writing NaN.
 *
 * **A live value that changes underneath is followed, except while it is being edited.**
 * A theme changed from the viewer's own settings page must show here immediately. A number
 * box the user is halfway through typing into must not be rewritten under the cursor, which
 * is why the watch below refuses to touch a focused field.
 */
const props = withDefaults(
    defineProps<{
        item: PaletteItem;
        favourite?: boolean;
        /** The row Enter in the search box acts on: drawn selected, with the Enter glyph. */
        first?: boolean;
    }>(),
    { favourite: false, first: false },
);

const emit = defineEmits<{
    /** A command was run or a destination chosen. The palette closes on this. */
    activate: [item: PaletteItem];
    /** A setting was written. The palette stays open and announces it. */
    changed: [item: PaletteItem];
    /** The user changed the local favourite marker, not the feature itself. */
    toggleFavourite: [item: PaletteItem];
}>();

const { t } = useI18n();

const descriptionId = useId();

/**
 * The supporting line under the title, as the approved design draws it: where the thing
 * lives ("Work · the guide"), falling back to its own explanation when it has no location.
 * A disabled row's reason always wins, because a disabled control names its unmet condition
 * next to itself, in words.
 */
const supporting = computed(() => {
    const item = props.item;
    if (item.disabled !== undefined) {
        return [item.disabled.reason, item.disabled.recovery ?? ""].filter(Boolean).join(" ");
    }
    if (item.location !== undefined && item.location.length > 0) return item.location.join(" · ");
    return item.description;
});

/**
 * The hover tooltip: the full explanation, and the related actions the catalogue suggests
 * next, which the 52px row has no room to draw. The same words are read to assistive
 * technology through the row's `aria-describedby`.
 */
const tooltip = computed(() => {
    const related = props.item.relatedLabels ?? [];
    if (related.length === 0) return props.item.description;
    return `${props.item.description}\n${t("palette.row.related", "Related actions")}: ${related.join(", ")}`;
});

const icon = computed(() => {
    switch (props.item.kind) {
        case "command":
            return mdiFlashOutline;
        case "setting":
            return mdiTuneVariant;
        case "destination":
            return mdiArrowRightCircleOutline;
    }
});

/**
 * What kind of row this is, in a word, for the badge and for a screen reader.
 *
 * It is part of the accessible name rather than decoration: "Theme, setting" and "Theme,
 * opens" are different promises, and somebody listening rather than looking has no other
 * way to tell which of the two they have landed on.
 */
const kindLabel = computed(() => {
    if (props.item.resultClass !== undefined) {
        const labels: Record<string, string> = {
            tab: t("palette.kind.tab", "Tab"),
            group: t("palette.kind.group", "Group"),
            article: t("palette.kind.article", "Article"),
            recovery: t("palette.kind.recovery", "Recovery"),
            appearance: t("palette.kind.appearance", "Appearance"),
        };
        return labels[props.item.resultClass] ?? t("palette.kind.destination", "Opens");
    }
    switch (props.item.kind) {
        case "command":
            return t("palette.kind.command", "Command");
        case "setting":
            return t("palette.kind.setting", "Setting");
        case "destination":
            return t("palette.kind.destination", "Opens");
    }
});

function activate(): void {
    const item = props.item;
    if (item.disabled !== undefined) return;
    if (item.kind === "command") item.run();
    else if (item.kind === "destination") item.go();
    else return;
    emit("activate", item);
}

/* -------------------------------------------------------------------------- */
/* The live controls                                                          */
/* -------------------------------------------------------------------------- */

const control = computed(() => (props.item.kind === "setting" ? props.item.control : null));

function announce(): void {
    emit("changed", props.item);
}

function setToggle(value: boolean | null): void {
    const live = control.value;
    if (live === null || live.kind !== "toggle") return;
    live.set(value === true);
    announce();
}

function setChoice(value: unknown): void {
    const live = control.value;
    if (live === null || live.kind !== "choice" || typeof value !== "string") return;
    live.set(value);
    announce();
}

/** The number box's own text, so a half-typed value is never written to the setting. */
const draft = ref("");
const editing = ref(false);

watch(
    control,
    (live) => {
        if (live === null || live.kind !== "number") return;
        if (editing.value) return;
        draft.value = String(live.value);
    },
    { immediate: true },
);

function commitNumber(): void {
    const live = control.value;
    if (live === null || live.kind !== "number") return;

    const parsed = parseNumberInput(draft.value, false);
    if (parsed === "invalid" || parsed === null) {
        // Not a number, or emptied. The setting keeps the value it had and the box says so
        // again, because leaving the box blank would read as "this setting has no value".
        draft.value = String(live.value);
        return;
    }

    const clamped = Math.min(live.max, Math.max(live.min, parsed));
    const rounded = roundToStep(clamped, live.step);
    draft.value = String(rounded);
    if (rounded === live.value) return;

    live.set(rounded);
    announce();
}

function endEditing(): void {
    editing.value = false;
    commitNumber();
}
</script>

<template>
    <li
        class="mb-palette-row"
        :class="{ 'mb-palette-row--first': props.first }"
        data-palette-row
        :aria-disabled="props.item.disabled !== undefined ? 'true' : undefined"
    >
        <!--
            Everything the row says beyond its title and one supporting line - the full
            explanation, where a destination goes, what to try next - is read with the row
            through `aria-describedby` rather than drawn, which is what keeps a row the
            design's 52px. The search still matches all of it.
        -->
        <span :id="descriptionId" class="mb-palette-row__described">
            {{ props.item.description }}
            <template v-if="props.item.kind === 'destination'"
                >{{ " " }}{{ props.item.where }}</template
            >
            <template v-if="props.item.disabled !== undefined">
                {{ " " }}{{ props.item.disabled.reason }}
                <template v-if="props.item.disabled.recovery !== undefined">
                    {{ " " }}{{ props.item.disabled.recovery }}
                </template>
            </template>
            <template v-if="props.item.relatedLabels?.length">
                {{ " " }}{{ t("palette.row.suggestedNext", "Suggested next") }}:
                {{ props.item.relatedLabels.join(", ") }}
            </template>
        </span>

        <!--
            A command and a destination are one button covering the whole row: there is
            nothing inside either of them that is separately operable, so a nested control
            would be a second tab stop leading to the same action.
        -->
        <button
            v-if="props.item.kind !== 'setting'"
            type="button"
            class="mb-palette-row__go"
            :title="tooltip"
            :aria-describedby="descriptionId"
            :disabled="props.item.disabled !== undefined"
            :aria-disabled="props.item.disabled !== undefined ? 'true' : undefined"
            @click="activate"
        >
            <v-icon class="mb-palette-row__icon" :icon="icon" size="20" aria-hidden="true" />

            <span class="mb-palette-row__text">
                <span class="mb-palette-row__title">{{ props.item.title }}</span>
                <span
                    class="mb-palette-row__location"
                    :aria-label="
                        props.item.location?.length
                            ? `${t('palette.row.location', 'Location')}: ${supporting}`
                            : undefined
                    "
                    >{{ supporting }}</span
                >
            </span>

            <span class="mb-palette-row__kind">{{ kindLabel }}</span>
            <v-icon
                v-if="props.first"
                class="mb-palette-row__enter"
                :icon="mdiKeyboardReturn"
                size="16"
                aria-hidden="true"
            />
        </button>

        <div v-else class="mb-palette-row__setting" :title="tooltip">
            <v-icon class="mb-palette-row__icon" :icon="icon" size="20" aria-hidden="true" />

            <span class="mb-palette-row__text">
                <span class="mb-palette-row__title">{{ props.item.title }}</span>
                <span
                    class="mb-palette-row__location"
                    :aria-label="
                        props.item.location?.length
                            ? `${t('palette.row.location', 'Location')}: ${supporting}`
                            : undefined
                    "
                    >{{ supporting }}</span
                >
            </span>

            <!--
                The control itself, wired straight to the setting. `hide-details` keeps a
                row one line tall; the accessible name comes from the row's own title rather
                than a second visible label beside it, which would read the title twice.
            -->
            <div class="mb-palette-row__control">
                <v-switch
                    v-if="props.item.control.kind === 'toggle'"
                    class="mb-palette-row__switch"
                    :model-value="props.item.control.value"
                    :aria-label="props.item.title"
                    :aria-describedby="descriptionId"
                    :disabled="props.item.disabled !== undefined"
                    color="primary"
                    density="compact"
                    hide-details
                    inset
                    @update:model-value="setToggle"
                />

                <PaletteChoiceField
                    v-else-if="props.item.control.kind === 'choice'"
                    :model-value="props.item.control.value"
                    :options="props.item.control.options"
                    :label="props.item.title"
                    :disabled="props.item.disabled !== undefined"
                    @update:model-value="setChoice"
                />

                <v-text-field
                    v-else
                    v-model="draft"
                    class="mb-palette-row__number"
                    type="number"
                    :min="props.item.control.min"
                    :max="props.item.control.max"
                    :step="props.item.control.step"
                    :suffix="props.item.control.unit"
                    :aria-label="props.item.title"
                    :aria-describedby="descriptionId"
                    :disabled="props.item.disabled !== undefined"
                    variant="outlined"
                    density="compact"
                    hide-details
                    @focus="editing = true"
                    @blur="endEditing"
                    @change="commitNumber"
                    @keydown.enter="commitNumber"
                />
            </div>
        </div>

        <button
            type="button"
            class="mb-palette-row__favourite"
            :class="{ 'mb-palette-row__favourite--on': props.favourite }"
            :aria-label="
                props.favourite
                    ? t(
                          'palette.row.removeFavourite',
                          { title: props.item.title },
                          'Remove {title} from favourites',
                      )
                    : t(
                          'palette.row.addFavourite',
                          { title: props.item.title },
                          'Add {title} to favourites',
                      )
            "
            :aria-pressed="props.favourite ? 'true' : 'false'"
            @click.stop="emit('toggleFavourite', props.item)"
        >
            <v-icon
                :icon="props.favourite ? mdiStar : mdiStarOutline"
                size="18"
                aria-hidden="true"
            />
        </button>
    </li>
</template>

<style>
/*
 * The approved design's palette row: 52px, 22px side padding, a 20px leading glyph in
 * on-surface-variant, a body-medium title over a label-small supporting line in outline, and
 * a quiet trailing meta. The row under the keyboard's Enter is drawn selected, on
 * surface-container-high, with the Enter glyph at its end.
 */
.mb-palette-row {
    list-style: none;
    position: relative;
    display: flex;
    align-items: center;
}

.mb-palette-row--first {
    background: rgb(var(--v-theme-surface-container-high));
}

.mb-palette-row__described {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

.mb-palette-row__go,
.mb-palette-row__setting {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 14px;
    min-inline-size: 0;
    min-block-size: 52px;
    padding: 6px 4px 6px 22px;
    text-align: start;
    color: rgb(var(--v-theme-on-surface));
}

.mb-palette-row__go:disabled {
    cursor: not-allowed;
    opacity: 0.62;
}

.mb-palette-row__go {
    background: transparent;
    border: none;
    cursor: pointer;
}

/* The M3 hover state layer, drawn on the whole row rather than the button alone. */
@media (hover: hover) {
    .mb-palette-row:hover {
        background: rgb(var(--v-theme-surface-container-high));
    }
}

/* Vuetify marks focus with a low-opacity overlay, which is a tint rather than an indicator.
   The rows carry a real ring, on the button and on whatever control a setting row holds. */
.mb-palette-row__go:focus-visible,
.mb-palette-row .v-btn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-palette-row .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-palette-row__icon {
    flex: none;
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-palette-row__text {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    flex: 1 1 auto;
}

.mb-palette-row__title {
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height, 1.25rem);
    overflow-wrap: anywhere;
}

.mb-palette-row__location {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height, 1rem);
    color: rgb(var(--v-theme-outline));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mb-palette-row__kind {
    flex: none;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-small-size);
    color: rgb(var(--v-theme-outline));
    white-space: nowrap;
}

.mb-palette-row__enter {
    flex: none;
    color: rgb(var(--v-theme-outline));
}

.mb-palette-row__favourite {
    flex: none;
    inline-size: 40px;
    block-size: 40px;
    margin-inline-end: 12px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: rgb(var(--v-theme-outline));
    cursor: pointer;
}

.mb-palette-row__favourite--on {
    color: rgb(var(--v-theme-primary));
}

.mb-palette-row__favourite:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-palette-row__favourite:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -1px;
}

.mb-palette-row__control {
    flex: none;
    display: flex;
    align-items: center;
}

.mb-palette-row__select {
    min-width: 190px;
}

.mb-palette-row__number {
    min-width: 140px;
}

/* At a narrow window, and at 200% scale where the viewport is effectively half as wide, the
   control drops below the text instead of squeezing the title into one word per line. */
@media (max-width: 560px) {
    .mb-palette-row__setting {
        flex-wrap: wrap;
    }

    .mb-palette-row__control {
        flex: 1 1 100%;
        padding-inline-start: 34px;
    }

    .mb-palette-row__select,
    .mb-palette-row__number {
        min-width: 0;
        width: 100%;
    }
}
</style>
