<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from "vue";
import { VChip, VIcon } from "vuetify/components";
import type { SettingsSectionAnchor } from "./settingsSections.js";

/**
 * One setting on the settings surface, and the thing a failed render actually lands on.
 *
 * `reveal()` is the whole reason this is a component rather than a `<div>`. A render that
 * stops for a fixable reason names the setting that would fix it, and the shell opens
 * this surface at that anchor; landing somebody on the right page and leaving them to
 * find the row is a hint, not a remedy. So revealing does three things together: it
 * scrolls the section into view, it moves focus onto it so the next keystroke acts on
 * the right control and a screen reader announces where it arrived, and it outlines it
 * briefly so an eye that was reading an error message knows where to look.
 *
 * The outline is drawn either way; only its fade is animated, and only when the person
 * has not asked for reduced motion. An attention cue that a reduced-motion setting
 * removes entirely leaves that person with no cue at all, which is the opposite of what
 * the setting is for. The scroll drops to an instant jump for the same reason: it still
 * arrives, it just does not slide.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Any section the surface renders, not only the four a render can point at: the
         * GitHub sign-in is listed and searched here and nothing in the bridge can link to it.
         */
        anchor: SettingsSectionAnchor;
        title: string;
        description: string;
        /**
         * The leading glyph beside the title, an `@mdi/js` path. Decorative: the title is
         * the name, so the icon is hidden from assistive technology.
         */
        icon?: string | null;
        /**
         * The current value in a word or two, drawn as the trailing chip the approved design
         * puts at the end of every section header ("Declined", "Bundled 21", "Set"). Null
         * draws nothing; a host with richer status uses the `status` slot instead.
         */
        status?: string | null;
        /** The chip's colour role: a neutral readout, a good state, or one needing action. */
        statusTone?: "neutral" | "good" | "attention";
    }>(),
    { icon: null, status: null, statusTone: "neutral" },
);

const STATUS_COLOR = { neutral: undefined, good: "primary", attention: "error" } as const;

const titleId = useId();
const root = ref<HTMLElement | null>(null);
const flash = ref(false);

/** Cleared before each new flash so two reveals in a row do not cancel each other early. */
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function prefersReducedMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * `focus: false` when the section delegates focus to a control inside it — the consent
 * row focuses itself, and two elements fighting over focus is how the ring ends up on
 * whichever won the race rather than on the thing that was asked for.
 */
function reveal(options: { focus?: boolean } = {}): void {
    const element = root.value;
    if (element === null) return;

    // jsdom has no layout and therefore no `scrollIntoView`, and neither does an
    // element that has not been attached yet. Optional call rather than a guard clause:
    // failing to scroll must not cost the focus and the outline underneath it.
    element.scrollIntoView?.({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    if (options.focus !== false) element.focus();

    if (flashTimer !== null) clearTimeout(flashTimer);
    flash.value = true;
    flashTimer = setTimeout(() => {
        flash.value = false;
        flashTimer = null;
    }, 2200);
}

onBeforeUnmount(() => {
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = null;
});

defineExpose({ reveal, element: root });
</script>

<template>
    <section
        :id="`mb-setting-${props.anchor}`"
        ref="root"
        class="mb-setting"
        :class="{ 'mb-setting--flash': flash }"
        tabindex="-1"
        :aria-labelledby="titleId"
        :data-anchor="props.anchor"
    >
        <header class="mb-setting__header">
            <v-icon
                v-if="props.icon !== null"
                class="mb-setting__icon"
                :icon="props.icon"
                size="20"
                aria-hidden="true"
            />
            <h3 :id="titleId" class="mb-setting__title">{{ props.title }}</h3>
            <span class="mb-setting__status"
                ><v-chip
                    v-if="props.status !== null"
                    class="mb-setting__chip"
                    :class="`mb-setting__chip--${props.statusTone}`"
                    :color="STATUS_COLOR[props.statusTone]"
                    size="small"
                    variant="tonal"
                    >{{ props.status }}</v-chip
                ><slot name="status"
            /></span>
        </header>

        <p class="mb-setting__description">{{ props.description }}</p>

        <slot />
    </section>
</template>

<style>
/*
 * M3 list-section anatomy, per the approved design's settings sheet.
 *
 * A section is one entry in a flat list rather than a card of its own: a header row (leading
 * icon, title-medium heading, a trailing status chip), the supporting text under it, and
 * the typed control. Sections are separated by an outline-variant divider instead of each
 * painting a container, which is what lets the sheet read as one list of settings rather
 * than a stack of boxes. Every dimension is a token or a step on the 4/8 grid.
 */
.mb-setting {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0;
    border-block-end: 1px solid rgb(var(--v-theme-outline-variant));
    /* Reserved so the flash outline does not reflow the column when it appears. */
    outline: 2px solid transparent;
    outline-offset: 4px;
    border-radius: var(--md-sys-shape-corner-extra-small);
    scroll-margin-block: 16px;
}

.mb-setting:focus-visible,
.mb-setting--flash {
    outline-color: rgb(var(--v-theme-primary));
}

/* The outline itself is never animated away — it is the cue. Only its fade is. */
@media (prefers-reduced-motion: no-preference) {
    .mb-setting {
        transition: outline-color var(--md-sys-motion-duration-medium1) ease;
    }
}

.mb-setting__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-setting__icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
}

/* Title-medium: the M3 typescale role for a list-section header. */
.mb-setting__title {
    flex: 1 1 auto;
    min-inline-size: 0;
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size, 1rem);
    line-height: var(--md-sys-typescale-title-medium-line-height, 1.5rem);
    font-weight: var(--md-sys-typescale-title-medium-weight, 500);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking, 0.009375rem);
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: break-word;
}

/* The trailing state chip. Empty when the host has nothing to say about the value. */
.mb-setting__status {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
}

.mb-setting__status:empty {
    display: none;
}

/* The neutral readout chip sits on surface-container-highest, as the design's state pills do. */
.mb-setting__chip--neutral.v-chip {
    background: rgb(var(--v-theme-surface-container-highest));
    color: rgb(var(--v-theme-on-surface-variant));
}

.mb-setting__chip--attention.v-chip {
    background: rgb(var(--v-theme-error-container));
    color: rgb(var(--v-theme-on-error-container));
}

/* Body-medium in on-surface-variant: the M3 role for supporting text under a title. */
.mb-setting__description {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size, 0.875rem);
    line-height: var(--md-sys-typescale-body-medium-line-height, 1.25rem);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking, 0.015625rem);
    color: rgb(var(--v-theme-on-surface-variant));
    text-wrap: pretty;
}

/* Vuetify marks focus with a low-opacity overlay, which is a background tint rather than
   a focus indicator. These add a real ring on top of it, on every control a section holds. */
.mb-setting .v-btn:focus-visible,
.mb-setting a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-setting .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

/*
 * M3 list anatomy, for a card whose body is one or more discrete rows rather
 * than a single free-form control (a toggle, a select, a slider). A row
 * component opts in by putting `mb-setting__row` on its own root element; this
 * card never reaches into a child component's internals to impose it.
 *
 * Each row is a real M3 list-item: 56px minimum height (the M3 one-line list
 * item spec, so a row is never shorter than a comfortable touch target), an
 * 8/16/24 spacing rhythm inside it, an optional leading-icon column
 * (`mb-setting__row-icon`), a content column that grows to fill the row, and
 * an optional trailing column (`mb-setting__row-trailing`) for the control
 * itself - a switch, a select, a segmented button - so the label and the
 * control it operates are never squeezed onto the same visual line by
 * accident. The hover/focus state layer is drawn from the M3 state-opacity
 * tokens rather than a bespoke tint, exactly like every other interactive M3
 * surface in this app.
 */
.mb-setting__list {
    display: flex;
    flex-direction: column;
    /* The M3 list-item divider inset - it starts after the leading icon
       column, not at the row's own edge, which is what keeps a stack of rows
       reading as one list rather than as a stack of unrelated cards. */
    margin-inline: -16px;
}

.mb-setting__row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 16px;
    min-height: 56px;
    padding-inline: 16px;
    padding-block: 8px;
    border-radius: var(--md-sys-shape-corner-small, 8px);
}

.mb-setting__list .mb-setting__row + .mb-setting__row {
    border-top: 1px solid var(--md-sys-color-outline-variant, rgba(var(--v-theme-on-surface), 0.4));
}

/* A row with no leading icon still gets the same grid, so its content column
   lines up with a sibling row that does have one. */
.mb-setting__row:not(:has(.mb-setting__row-icon)) {
    grid-template-columns: minmax(0, 1fr) auto;
}

.mb-setting__row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 24px;
    block-size: 24px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setting__row-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow-wrap: break-word;
}

.mb-setting__row-label {
    font-size: var(--md-sys-typescale-body-large-size, 1rem);
    line-height: var(--md-sys-typescale-body-large-line-height, 1.5rem);
    color: rgb(var(--v-theme-on-surface));
}

.mb-setting__row-supporting {
    font-size: var(--md-sys-typescale-body-medium-size, 0.875rem);
    line-height: var(--md-sys-typescale-body-medium-line-height, 1.25rem);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-setting__row-trailing {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
}

/* The M3 state layer: an overlay the same shape as the row, drawn at the
   spec's hover/pressed opacities against on-surface, sitting under the row's
   own content so it never fights the control's own focus ring. */
.mb-setting__row::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgb(var(--v-theme-on-surface));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--md-sys-motion-duration-short2) ease;
}

@media (hover: hover) {
    .mb-setting__row:hover::before {
        opacity: var(--md-sys-state-hover-opacity, 8%);
    }
}

.mb-setting__row:focus-within::before {
    opacity: var(--md-sys-state-pressed-opacity, 10%);
}
</style>
