<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from "vue";
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
const props = defineProps<{
    /**
     * Any section the surface renders, not only the four a render can point at: the
     * GitHub sign-in is listed and searched here and nothing in the bridge can link to it.
     */
    anchor: SettingsSectionAnchor;
    title: string;
    description: string;
}>();

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
            <h3 :id="titleId" class="mb-setting__title">{{ props.title }}</h3>
            <slot name="status" />
        </header>

        <p class="mb-setting__description">{{ props.description }}</p>

        <slot />
    </section>
</template>

<style>
/*
 * M3 card group anatomy.
 *
 * `.mb-setting` is the card, `.mb-setting__header` is its title/status row, and
 * `.mb-setting__list` (below) is the optional M3 list a card wraps its rows in
 * when it holds more than one control. Every dimension here is a token or a
 * value straight off the M3 spacing scale (8 / 16 / 24), never an ad-hoc number
 * chosen by eye - that is what made this dialog read as "a bit cramped" the
 * first time and it is not getting reintroduced by a second ad-hoc value.
 */
.mb-setting {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    /* The M3 surface-container role, not a hand-mixed tint: it already answers
       both themes and any accent, because it is the same token the rest of the
       app's M3 surfaces read from. */
    background: var(--md-sys-color-surface-container, rgba(var(--v-theme-on-surface), 0.04));
    /* Reserved so the flash outline does not reflow the column when it appears. */
    outline: 2px solid transparent;
    outline-offset: 2px;
    scroll-margin-block: 16px;
}

/* A divider between stacked cards, drawn from the M3 outline-variant token
   rather than a bare grey rule, so it survives both themes and any accent. */
.mb-setting + .mb-setting {
    border-top: 1px solid var(--md-sys-color-outline-variant, rgba(var(--v-theme-on-surface), 0.4));
    margin-block-start: 8px;
}

.mb-setting:focus-visible,
.mb-setting--flash {
    outline-color: rgb(var(--v-theme-primary));
}

/* The outline itself is never animated away — it is the cue. Only its fade is. */
@media (prefers-reduced-motion: no-preference) {
    .mb-setting {
        transition: outline-color 240ms ease;
    }
}

.mb-setting__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
}

/* Title-medium: the M3 typescale role for a card/list-group header, read from
   the same tokens `MenuSideSheet.vue` already draws its own title from, rather
   than a hand-picked 1rem/500 that happened to look right on one screen. */
.mb-setting__title {
    margin: 0;
    font-size: var(--md-sys-typescale-title-medium-size, 1rem);
    line-height: var(--md-sys-typescale-title-medium-line-height, 1.4);
    font-weight: var(--md-sys-typescale-title-medium-weight, 500);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking, normal);
    color: rgb(var(--v-theme-on-surface));
    overflow-wrap: anywhere;
}

/* Body-medium: the M3 typescale role for supporting text under a title. */
.mb-setting__description {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size, 0.8125rem);
    line-height: var(--md-sys-typescale-body-medium-line-height, 1.5);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking, normal);
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
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
    margin-inline: -24px;
}

.mb-setting__row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 16px;
    min-height: 56px;
    padding-inline: 24px;
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
    overflow-wrap: anywhere;
}

.mb-setting__row-label {
    font-size: var(--md-sys-typescale-body-large-size, 1rem);
    line-height: var(--md-sys-typescale-body-large-line-height, 1.5);
    color: rgb(var(--v-theme-on-surface));
}

.mb-setting__row-supporting {
    font-size: var(--md-sys-typescale-body-medium-size, 0.8125rem);
    line-height: var(--md-sys-typescale-body-medium-line-height, 1.4);
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
    transition: opacity 120ms ease;
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
