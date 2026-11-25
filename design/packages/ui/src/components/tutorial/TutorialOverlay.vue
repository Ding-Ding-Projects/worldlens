<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose } from "@mdi/js";
import { VBtn, VIcon } from "vuetify/components";
import { prefersReducedMotion } from "../controlbar/useControlBarApp.js";
import { createTutorialController } from "./tutorialController.js";
import { onTutorialLaunchRequested } from "./tutorialLaunch.js";
import { onTutorialSignal } from "./tutorialSignals.js";
import { placeTutorialCard, placeTutorialHighlight, type TutorialPoint, type TutorialRect } from "./tutorialPlacement.js";
import {
    tutorialMissingText,
    tutorialProgressText,
    tutorialRevealLabel,
    tutorialStepBody,
    tutorialStepTitle,
    tutorialTourHeading,
    tutorialTourName,
} from "./tutorialCopy.js";

/**
 * The guided tour itself: a highlighted control and a small card of text beside it, neither
 * of which ever blocks the application underneath.
 *
 * Mounted once at the shell, exactly like `CommandPalette.vue` and `ConfigNotifications.vue`
 * - see `tutorialLaunch.ts` for why three unrelated surfaces (Info, Docs, the command
 * palette) can all open this without any of them being its parent. Every step names a real
 * shell page and a real CSS selector (`tutorialSteps.ts`); this component's whole job is to
 * ask the shell to show that page, find that element, and put a highlight ring and a card of
 * words next to it, moving both as the window scrolls or resizes.
 *
 * ## Why there is no backdrop
 *
 * A coach mark that dims the rest of the screen reads as a dialog, and a dialog is exactly
 * what this must not become: the requirement is that it "must never trap the user or block
 * the control it points at," and the surest way to keep that promise is to never paint
 * anything that would. The highlight ring is `pointer-events: none`; nothing here intercepts
 * a click anywhere outside the card. Choosing a world while step three is open still chooses
 * it, and (see `tutorialSteps.ts`) that is exactly the signal that step is listening for.
 *
 * ## Focus, not a trap
 *
 * `role="dialog"` with `aria-modal="false"`: a screen reader announces it as a dialog, but
 * Tab is never intercepted, so focus can leave the card into the running application at any
 * time. What *is* managed deliberately: focus moves to the card itself the moment a step
 * becomes active (announcing its title and, via `aria-describedby`, the progress line and
 * body together), and moves back to whatever had focus when the tour was opened once it
 * closes - by completion, by Exit, or by Escape.
 */
const props = defineProps<{
    /** Switches the shell to a page, exactly as clicking its tab would. */
    revealPage: (pageId: string) => void;
}>();

const { t } = useI18n();

const controller = createTutorialController();

const titleId = useId();
const progressId = useId();
const bodyId = useId();

const cardEl = ref<HTMLElement | null>(null);
const highlightRect = ref<TutorialRect | null>(null);
const cardPoint = ref<TutorialPoint>({ top: 24, left: 24 });

const stepTitle = computed(() => tutorialStepTitle(controller.currentStep.value.id, t));
const stepBody = computed(() => tutorialStepBody(controller.currentStep.value.id, t));
const progressText = computed(() =>
    tutorialProgressText(controller.stepNumber.value, controller.stepCount.value, t),
);
const tourName = computed(() => tutorialTourName(controller.tourId.value, t));
const tourHeading = computed(() => tutorialTourHeading(tourName.value, t));

/**
 * True while the current step's control is not on screen: absent from the page, or present but
 * hidden by the window size or a collapsed parent. The card says so and offers {@link onReveal}
 * instead of pointing at nothing or silently moving on.
 */
const missing = ref(false);
/** Whether the person has already pressed "Show it" for this step, which changes the wording. */
const revealTried = ref(false);
const missingText = computed(() => tutorialMissingText(revealTried.value, t));
const revealLabel = computed(() => tutorialRevealLabel(t));

const nextLabel = computed(() =>
    controller.isLastStep.value
        ? t("tutorial.controls.finish", "Finish")
        : t("tutorial.controls.next", "Next"),
);

/* -------------------------------------------------------------------------- */
/* Placement                                                                   */
/* -------------------------------------------------------------------------- */

const HIGHLIGHT_FALLBACK_MARGIN = 24;

function rectOf(el: HTMLElement): TutorialRect {
    const box = el.getBoundingClientRect();
    return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * Whether an element is actually showing: not `hidden`, and neither it nor an ancestor is
 * `display: none` or `visibility: hidden`. Layout size is deliberately not consulted, because a
 * control can legitimately measure zero in a headless test while still being the right target;
 * what matters is that nothing is hiding it from a person.
 */
function isShown(el: HTMLElement): boolean {
    for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
        if (node.hidden) return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none") return false;
        if (node === el && style.visibility === "hidden") return false;
    }
    return true;
}

/**
 * Finds the current step's anchor, scrolls it into view, and places the ring and the card.
 *
 * Never throws on a missing anchor. `tutorialAnchors.test.ts` is what proves every shipped
 * step's selector resolves against the real owning surface; this is the runtime fallback for
 * the case that guard exists to make unreachable, and it degrades to an unhighlighted card
 * in the viewport's own corner rather than to nothing on screen at all.
 */
async function recompute(): Promise<void> {
    await nextTick();
    const step = controller.currentStep.value;
    const anchor = document.querySelector<HTMLElement>(step.anchor);

    missing.value = anchor === null || !isShown(anchor);
    if (anchor === null || missing.value) {
        highlightRect.value = null;
    } else {
        anchor.scrollIntoView?.({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        await nextTick();
        highlightRect.value = rectOf(anchor);
    }

    const viewport = {
        width: typeof window === "undefined" ? 0 : window.innerWidth,
        height: typeof window === "undefined" ? 0 : window.innerHeight,
    };
    const cardBox = cardEl.value?.getBoundingClientRect();
    const cardSize = {
        width: cardBox !== undefined && cardBox.width > 0 ? cardBox.width : 320,
        height: cardBox !== undefined && cardBox.height > 0 ? cardBox.height : 180,
    };

    cardPoint.value =
        highlightRect.value === null
            ? {
                  top: Math.max(viewport.height - cardSize.height - HIGHLIGHT_FALLBACK_MARGIN, 8),
                  left: Math.max(viewport.width - cardSize.width - HIGHLIGHT_FALLBACK_MARGIN, 8),
              }
            : placeTutorialCard(highlightRect.value, cardSize, viewport);
}

const highlightStyle = computed(() => {
    if (highlightRect.value === null) return { display: "none" };
    const box = placeTutorialHighlight(highlightRect.value);
    return {
        top: `${box.top}px`,
        left: `${box.left}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
    };
});

const cardStyle = computed(() => ({
    top: `${cardPoint.value.top}px`,
    left: `${cardPoint.value.left}px`,
}));

/* -------------------------------------------------------------------------- */
/* Focus                                                                       */
/* -------------------------------------------------------------------------- */

let launchedFrom: HTMLElement | null = null;

function restoreFocus(): void {
    if (launchedFrom !== null && document.contains(launchedFrom)) {
        launchedFrom.focus();
    }
    launchedFrom = null;
}

async function afterStepBecameActive(): Promise<void> {
    revealTried.value = false;
    props.revealPage(controller.currentStep.value.pageId);
    await recompute();
    await nextTick();
    cardEl.value?.focus();
}

/**
 * "Show it": asks the shell to open the step's page again, gives the page a few frames to
 * mount, and measures once more. If the control is still not showing the card says so in
 * different words rather than repeating itself.
 */
async function onReveal(): Promise<void> {
    props.revealPage(controller.currentStep.value.pageId);
    for (let frame = 0; frame < 3; frame++) await nextTick();
    await recompute();
    revealTried.value = missing.value;
    cardEl.value?.focus();
}

watch(
    () => controller.open.value,
    (isOpen) => {
        if (isOpen) {
            launchedFrom =
                typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            void afterStepBecameActive();
        } else {
            restoreFocus();
        }
    },
);

watch(
    () => controller.stepIndex.value,
    () => {
        if (controller.open.value) void afterStepBecameActive();
    },
);

/* -------------------------------------------------------------------------- */
/* Opening on request, and advancing on a real action                         */
/* -------------------------------------------------------------------------- */

onTutorialLaunchRequested((tour) => {
    const wasOpen = controller.open.value;
    controller.start(tour);
    // Asking for a tour while one is already showing swaps it in place: the open flag does not
    // change, so the watchers below would never notice the new first step.
    if (wasOpen) void afterStepBecameActive();
});

onTutorialSignal("world-chosen", () => {
    if (controller.open.value && controller.currentStep.value.signal === "world-chosen") {
        controller.next();
    }
});

function onViewportChange(): void {
    if (controller.open.value) void recompute();
}

onMounted(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", onViewportChange, { passive: true });
    window.addEventListener("scroll", onViewportChange, { passive: true, capture: true });
    window.addEventListener("keydown", onWindowKeydown);
});

onBeforeUnmount(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("keydown", onWindowKeydown);
});

function onExit(): void {
    controller.exit();
}

/**
 * Keys on the card. Escape closes; Left and Right are Back and Next. Modified arrows are left
 * alone so a browser or screen-reader shortcut is never swallowed.
 */
function onCardKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        onExit();
        return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        controller.back();
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        controller.next();
    }
}

/** Escape also closes the tour when focus has wandered out of the card into the application. */
function onWindowKeydown(event: KeyboardEvent): void {
    if (!controller.open.value || event.defaultPrevented) return;
    if (event.key === "Escape" && !cardEl.value?.contains(event.target as Node | null)) onExit();
}
</script>

<template>
    <Teleport to="body">
        <div v-if="controller.open.value" class="mb-tutorial">
            <div class="mb-tutorial__highlight" :style="highlightStyle" aria-hidden="true" />

            <div
                ref="cardEl"
                class="mb-tutorial__card"
                :style="cardStyle"
                role="dialog"
                aria-modal="false"
                tabindex="-1"
                :aria-labelledby="titleId"
                :aria-describedby="`${progressId} ${bodyId}`"
                :aria-label="t('tutorial.region.label', 'Interactive tour')"
                :data-tour="controller.tourId.value"
                @keydown="onCardKeydown"
            >
                <div class="mb-tutorial__head">
                    <!--
                        The live region carries the whole announcement for a step: the counter,
                        the tour's name and the step's title, so a screen reader hears where it
                        is each time the step changes. The title is also the visible heading
                        below, so it is visually hidden here rather than shown twice.
                    -->
                    <p :id="progressId" class="mb-tutorial__progress" aria-live="polite">
                        <span>{{ progressText }}</span>
                        <span class="mb-tutorial__tour">{{ tourHeading }}</span>
                        <span class="mb-tutorial__sr">{{ stepTitle }}</span>
                    </p>
                    <button
                        type="button"
                        class="mb-tutorial__exit"
                        :aria-label="t('tutorial.controls.exit', 'Exit the tour')"
                        @click="onExit"
                    >
                        <VIcon :icon="mdiClose" size="18" />
                    </button>
                </div>

                <h2 :id="titleId" class="mb-tutorial__title">{{ stepTitle }}</h2>
                <p :id="bodyId" class="mb-tutorial__body">{{ stepBody }}</p>

                <div v-if="missing" class="mb-tutorial__missing" role="status">
                    <p class="mb-tutorial__missing-text">{{ missingText }}</p>
                    <VBtn
                        class="mb-tutorial__reveal"
                        variant="tonal"
                        size="small"
                        @click="onReveal"
                    >
                        {{ revealLabel }}
                    </VBtn>
                </div>

                <div class="mb-tutorial__actions">
                    <VBtn
                        variant="text"
                        size="small"
                        :disabled="!controller.canGoBack.value"
                        @click="controller.back()"
                    >
                        {{ t("tutorial.controls.back", "Back") }}
                    </VBtn>
                    <VBtn variant="text" size="small" @click="controller.skip()">
                        {{ t("tutorial.controls.skip", "Skip this step") }}
                    </VBtn>
                    <VBtn variant="flat" color="primary" size="small" @click="controller.next()">
                        {{ nextLabel }}
                    </VBtn>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style>
.mb-tutorial {
    position: fixed;
    inset: 0;
    z-index: 2500;
    pointer-events: none;
}

.mb-tutorial__highlight {
    position: fixed;
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow:
        0 0 0 3px rgb(var(--v-theme-primary)),
        0 0 0 9999px rgba(var(--v-theme-on-surface), 0.35);
    transition:
        top var(--md-sys-motion-duration-short3) ease,
        left var(--md-sys-motion-duration-short3) ease,
        width var(--md-sys-motion-duration-short3) ease,
        height var(--md-sys-motion-duration-short3) ease;
    pointer-events: none;
}

.mb-tutorial__card {
    position: fixed;
    max-width: 22rem;
    padding: 14px 16px 12px;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: var(--md-sys-elevation-shadow-level3);
    pointer-events: auto;
    transition:
        top var(--md-sys-motion-duration-short3) ease,
        left var(--md-sys-motion-duration-short3) ease;
}

.mb-tutorial__card:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-tutorial__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}

.mb-tutorial__progress {
    margin: 0;
    font-size: var(--md-sys-typescale-label-small-size);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tutorial__exit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    cursor: pointer;
}

.mb-tutorial__exit:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-tutorial__exit:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-tutorial__title {
    margin-block: 6px 4px;
    font-size: var(--md-sys-typescale-body-large-size);
    font-weight: 500;
    line-height: 1.3;
}

.mb-tutorial__body {
    margin: 0;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-tutorial__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-block-start: 12px;
}

.mb-tutorial__tour {
    display: block;
    margin-block-start: 2px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
}

.mb-tutorial__sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.mb-tutorial__missing {
    margin-block-start: 10px;
    padding: 8px 10px;
    border-radius: var(--md-sys-shape-corner-medium);
    background: rgba(var(--v-theme-on-surface), 0.06);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
}

.mb-tutorial__missing-text {
    margin: 0;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 1.4;
}

/* A short pulse on the ring when a step lands, so the eye finds the control. */
@keyframes mb-tutorial-ring-pulse {
    from {
        outline: 3px solid rgb(var(--v-theme-primary));
        outline-offset: 2px;
    }
    to {
        outline: 3px solid transparent;
        outline-offset: 10px;
    }
}

.mb-tutorial__highlight {
    animation: mb-tutorial-ring-pulse 700ms ease-out 1;
}

@media (prefers-reduced-motion: reduce) {
    .mb-tutorial__highlight,
    .mb-tutorial__card {
        transition: none;
        animation: none;
    }
}

/*
 * Forced colours (Windows high contrast) removes box shadows, which would delete the ring and
 * the card edge. Use real outlines in system colours so both stay visible.
 */
@media (forced-colors: active) {
    .mb-tutorial__highlight {
        box-shadow: none;
        outline: 3px solid Highlight;
        outline-offset: 2px;
        animation: none;
    }

    .mb-tutorial__card {
        border: 2px solid CanvasText;
        box-shadow: none;
    }

    .mb-tutorial__missing {
        border: 1px solid CanvasText;
    }
}
</style>
