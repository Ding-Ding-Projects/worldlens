<script setup lang="ts">
import {
    onBeforeUnmount,
    onMounted,
    ref,
    shallowReactive,
    watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { createDockview, type DockviewApi, type IDockviewPanel } from "dockview";
import "dockview/dist/styles/dockview.css";
import { layoutMatchesStrips, type DockLayoutJson } from "./dockLayoutStorage.js";
import type { SplitDirection } from "./workLayout.js";

/**
 * The layout engine under the Work workspace.
 *
 * ### What it is, and what it is not
 *
 * One dockview *group* per tab **strip**, each holding exactly one panel whose
 * content is the whole existing pane (the strip and its tabpanel). Dockview owns
 * only the arrangement: splits, sashes, floating windows, maximise and the saved
 * layout JSON. Every tab behaviour stays in `TabStrip.vue` and `tabModel.ts`,
 * where it was, because the group header dockview would draw is hidden and the
 * existing strip is drawn inside the pane instead. That is the whole of "added
 * underneath, never a swap": no tab feature has been reimplemented in terms of
 * dockview, so none can have been lost.
 *
 * ### Why the panes are teleported
 *
 * Dockview creates plain elements and knows nothing about Vue. Each pane's
 * element is registered here when dockview asks for it, and the parent's slot is
 * teleported into it, so the page components keep their one Vue app, their
 * provide/inject context and their reactivity. Panels use the `always` renderer,
 * so a pane that scrolls out of view is never detached: one of the pages owns a
 * map renderer, and tearing its canvas out of the document loses the GL context.
 *
 * ### Dragging
 *
 * Dockview's own tab drag is not used (its tab headers are hidden). The strip's
 * own tabs are already draggable, so a tab drag that starts anywhere in this
 * surface raises a five-zone overlay on every pane: the four edges split the
 * target pane, the centre moves the tab into it. Every drag has a keyboard and
 * menu equivalent in the parent; the overlay is only the pointer route.
 *
 * ### Popout windows
 *
 * Not offered. A popout opens a second browser window, and this application's
 * shell is an Electron window whose child windows are not verified here. A saved
 * layout that mentions one is not trusted (see `layoutMatchesStrips`).
 */
const props = defineProps<{
    /** False draws the first strip alone with no docking at all, exactly as before. */
    enabled: boolean;
    strips: readonly { readonly id: string; readonly label: string }[];
    /** A previously saved arrangement, already checked against the strips by the caller. */
    initial: DockLayoutJson | null;
    /** Spoken to assistive technology after an arrangement command; never drawn. */
    announcement?: string;
}>();

const emit = defineEmits<{
    /** The arrangement changed; the parent decides when to persist it. */
    "layout-change": [layout: DockLayoutJson];
    /** A pane became the focused one. */
    focus: [stripId: string];
    /** A tab was dropped on a zone of a pane. */
    "drop-tab": [
        fromStripId: string,
        tabId: string,
        toStripId: string,
        zone: "centre" | SplitDirection,
    ];
    /** The arrangement of floating and maximised panes changed. */
    "state-change": [];
}>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
/** Pane elements by strip id; reactive so the teleports follow dockview's own lifecycle. */
const hosts = shallowReactive<Record<string, HTMLElement>>({});

let api: DockviewApi | null = null;
const disposers: Array<() => void> = [];
let emitTimer: ReturnType<typeof setTimeout> | null = null;
const placements = new Map<string, { reference: string; direction: SplitDirection }>();

const floating = ref<ReadonlySet<string>>(new Set());
const maximised = ref<string | null>(null);

function refreshState(): void {
    if (api === null) return;
    const next = new Set<string>();
    let max: string | null = null;
    for (const panel of api.panels) {
        if (panel.group.api.location.type === "floating") next.add(panel.id);
        if (panel.group.api.isMaximized()) max = panel.id;
    }
    floating.value = next;
    maximised.value = max;
    emit("state-change");
}

function scheduleEmit(): void {
    if (emitTimer !== null) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
        emitTimer = null;
        if (api === null) return;
        emit("layout-change", api.toJSON() as unknown as DockLayoutJson);
        refreshState();
    }, 120);
}

/**
 * The element a strip's pane is drawn into, made on first need and then kept.
 *
 * Pane elements exist before dockview does: they are created here at setup for every strip, so
 * the first render already has somewhere to put each pane and the workspace is on screen the
 * moment the component is mounted rather than a tick later. Dockview is then handed the same
 * element when it asks for the pane. Keeping the element across a layout reload also keeps the
 * page inside it mounted, which matters because one page owns a map renderer.
 */
function paneElement(id: string): HTMLElement {
    const existing = hosts[id];
    if (existing !== undefined) return existing;
    const element = document.createElement("div");
    element.className = "mb-dock-pane";
    element.dataset["stripId"] = id;
    hosts[id] = element;
    return element;
}

if (props.enabled) for (const strip of props.strips) paneElement(strip.id);

function createPane(id: string): { element: HTMLElement; init: () => void; dispose: () => void } {
    const element = paneElement(id);
    return {
        element,
        init: () => undefined,
        dispose: () => {
            // Only a strip that is gone loses its element; a reload keeps it.
            if (!props.strips.some((strip) => strip.id === id) && hosts[id] === element)
                delete hosts[id];
        },
    };
}

function hideHeaders(): void {
    if (api === null) return;
    for (const group of api.groups) {
        group.header.hidden = true;
        group.locked = "no-drop-target";
        neutraliseAria(group.element);
    }
}

/**
 * Takes dockview's own tab roles out of the accessibility tree.
 *
 * Dockview draws a tab header and a tabpanel wrapper for every group, and with the header
 * hidden they are empty shells that still carry `tab`, `tablist` and `tabpanel` roles. The
 * real tabs and the real tabpanel are the strip's and the pane's, and a second set of those
 * roles above them would give assistive technology two tab lists for one pane.
 */
function neutraliseAria(groupElement: HTMLElement): void {
    for (const node of groupElement.querySelectorAll<HTMLElement>(
        ".dv-tabs-and-actions-container [role], .dv-content-container[role]",
    )) {
        node.removeAttribute("role");
        node.removeAttribute("aria-selected");
        node.removeAttribute("aria-controls");
        node.removeAttribute("aria-labelledby");
        node.setAttribute("tabindex", "-1");
    }
    groupElement
        .querySelector<HTMLElement>(".dv-tabs-and-actions-container")
        ?.setAttribute("aria-hidden", "true");
}

function addStripPanel(index: number): void {
    if (api === null) return;
    const strip = props.strips[index];
    if (strip === undefined || api.getPanel(strip.id) !== undefined) return;
    const planned = placements.get(strip.id);
    placements.delete(strip.id);
    const reference =
        planned !== undefined && api.getPanel(planned.reference) !== undefined
            ? planned
            : null;
    const previous = props.strips
        .slice(0, index)
        .map((candidate) => candidate.id)
        .reverse()
        .find((id) => api?.getPanel(id) !== undefined);
    api.addPanel({
        id: strip.id,
        title: strip.label,
        component: "strip",
        renderer: "always",
        ...(reference !== null
            ? { position: { referencePanel: reference.reference, direction: reference.direction } }
            : previous !== undefined
              ? { position: { referencePanel: previous, direction: "right" as const } }
              : {}),
    });
    hideHeaders();
}

/** One panel per strip and no others, in the arrangement dockview currently holds. */
function reconcilePanels(): void {
    if (api === null) return;
    const wanted = new Set(props.strips.map((strip) => strip.id));
    for (const panel of [...api.panels]) {
        if (!wanted.has(panel.id)) api.removePanel(panel);
    }
    props.strips.forEach((_, index) => addStripPanel(index));
    hideHeaders();
}

function buildDefault(): void {
    if (api === null) return;
    api.clear();
    props.strips.forEach((_, index) => addStripPanel(index));
    hideHeaders();
}

function consistent(): boolean {
    if (api === null) return false;
    const ids = props.strips.map((strip) => strip.id);
    return (
        api.panels.length === ids.length &&
        ids.every((id) => api?.getPanel(id) !== undefined && hosts[id] !== undefined)
    );
}

/**
 * Loads an arrangement, or builds the default one when it cannot be loaded.
 *
 * The outcome is never an empty surface: a layout that does not account for
 * exactly the current strips is refused before dockview sees it, one dockview
 * rejects is caught, and one it accepts but that leaves a strip without a pane is
 * detected afterwards. All three end in the default arrangement. Returns whether
 * the given layout is what ended up on screen.
 */
function load(layout: DockLayoutJson | null): boolean {
    if (api === null) return false;
    const ids = props.strips.map((strip) => strip.id);
    if (layout !== null && layoutMatchesStrips(layout, ids)) {
        try {
            api.fromJSON(layout as never);
            hideHeaders();
            if (consistent()) {
                refreshState();
                return true;
            }
        } catch {
            // Falls through to the default arrangement below.
        }
    }
    buildDefault();
    refreshState();
    scheduleEmit();
    return false;
}

onMounted(() => {
    if (!props.enabled || root.value === null) return;
    api = createDockview(root.value, {
        theme: { name: "worldlens", className: "dockview-theme-worldlens", gap: 0 },
        createComponent: (options: { id: string }) => createPane(options.id),
        // Without a header of its own to carry it, a floating group needs its titlebar.
        floatingGroupDragHandle: "titlebar",
    } as never);
    const live = api;
    const subscriptions = [
        live.onDidLayoutChange(scheduleEmit),
        live.onDidMaximizedGroupChange(refreshState),
        live.onDidActivePanelChange((event: { panel: IDockviewPanel | undefined }) => {
            if (event.panel !== undefined) emit("focus", event.panel.id);
        }),
        live.onDidAddGroup(hideHeaders),
    ];
    disposers.push(...subscriptions.map((subscription) => () => subscription.dispose()));
    load(props.initial);
});

onBeforeUnmount(() => {
    if (emitTimer !== null) clearTimeout(emitTimer);
    for (const dispose of disposers.splice(0)) dispose();
    api?.dispose();
    api = null;
});

watch(
    () => props.strips.map((strip) => `${strip.id}\u0000${strip.label}`).join("\u0001"),
    () => {
        if (api === null) return;
        reconcilePanels();
        for (const strip of props.strips) api.getPanel(strip.id)?.setTitle(strip.label);
        scheduleEmit();
    },
    { flush: "post" },
);

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** Remembers where a strip that is about to appear belongs. */
function place(stripId: string, reference: string, direction: SplitDirection): void {
    placements.set(stripId, { reference, direction });
}

function floatBox(): { x: number; y: number; width: number; height: number } {
    const box = root.value?.getBoundingClientRect();
    const width = Math.max(320, Math.round((box?.width ?? 960) * 0.6));
    const height = Math.max(240, Math.round((box?.height ?? 640) * 0.6));
    return { x: 48, y: 48, width, height };
}

/** Lifts a pane out of the grid into a floating window. False where it cannot. */
function float(stripId: string): boolean {
    if (api === null || props.strips.length < 2) return false;
    const panel = api.getPanel(stripId);
    if (panel === undefined || panel.group.api.location.type === "floating") return false;
    api.addFloatingGroup(panel, floatBox());
    hideHeaders();
    refreshState();
    return true;
}

/** Puts a floating pane back into the grid, beside the first pane that is in it. */
function dock(stripId: string): boolean {
    if (api === null) return false;
    const panel = api.getPanel(stripId);
    if (panel === undefined || panel.group.api.location.type !== "floating") return false;
    const anchor = api.panels.find(
        (candidate) => candidate.id !== stripId && candidate.group.api.location.type === "grid",
    );
    if (anchor === undefined) return false;
    panel.api.moveTo({ group: anchor.group, position: "right" });
    hideHeaders();
    refreshState();
    return true;
}

/** Maximises a pane to the whole surface, or restores it when it already is. */
function toggleMaximise(stripId: string): boolean {
    if (api === null) return false;
    const panel = api.getPanel(stripId);
    if (panel === undefined) return false;
    if (panel.group.api.isMaximized()) panel.group.api.exitMaximized();
    else panel.group.api.maximize();
    refreshState();
    return true;
}

/** Brings a pane forward, which is also what a click on it does. */
function activate(stripId: string): void {
    api?.getPanel(stripId)?.api.setActive();
}

function toJSON(): DockLayoutJson | null {
    return api === null ? null : (api.toJSON() as unknown as DockLayoutJson);
}

defineExpose({ place, float, dock, toggleMaximise, activate, toJSON, load, floating, maximised });

/* -------------------------------------------------------------------------- */
/* The pointer drag overlay                                                   */
/* -------------------------------------------------------------------------- */

interface TabDrag {
    readonly stripId: string;
    readonly tabId: string;
}

const drag = ref<TabDrag | null>(null);

function onDragStart(event: DragEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest("[role='tab'][data-tab-id]") ?? null;
    const pane = tab?.closest("[data-strip-id]") ?? null;
    const tabId = tab?.getAttribute("data-tab-id") ?? null;
    const stripId = pane?.getAttribute("data-strip-id") ?? null;
    drag.value = tabId !== null && stripId !== null ? { stripId, tabId } : null;
}

function endDrag(): void {
    drag.value = null;
}

const ZONES: readonly { zone: "centre" | SplitDirection }[] = [
    { zone: "left" },
    { zone: "right" },
    { zone: "above" },
    { zone: "below" },
    { zone: "centre" },
];

function zoneLabel(zone: "centre" | SplitDirection): string {
    switch (zone) {
        case "left":
            return t("workLayout.zone.left", "Drop here to split this pane to the left");
        case "right":
            return t("workLayout.zone.right", "Drop here to split this pane to the right");
        case "above":
            return t("workLayout.zone.above", "Drop here to split this pane above");
        case "below":
            return t("workLayout.zone.below", "Drop here to split this pane below");
        default:
            return t("workLayout.zone.centre", "Drop here to move the tab into this pane");
    }
}

function onDrop(targetStripId: string, zone: "centre" | SplitDirection): void {
    const current = drag.value;
    drag.value = null;
    if (current === null) return;
    emit("drop-tab", current.stripId, current.tabId, targetStripId, zone);
}

</script>

<template>
    <div
        v-if="props.enabled"
        class="mb-dock"
        @dragstart.capture="onDragStart"
        @dragend.capture="endDrag"
    >
        <!-- Dockview owns this element's children; Vue owns everything else in the wrapper. -->
        <div ref="root" class="mb-dock__engine dockview-theme-worldlens"></div>
        <div class="mb-dock__live" role="status" aria-live="polite">
            {{ props.announcement ?? "" }}
        </div>
        <template v-for="strip in props.strips" :key="strip.id">
            <Teleport v-if="hosts[strip.id] !== undefined" :to="hosts[strip.id]">
                <div class="mb-dock-pane__content">
                    <slot :strip-id="strip.id" />
                </div>
                <div v-if="drag !== null" class="mb-dock-drop" data-dock-drop-overlay>
                    <div
                        v-for="zone in ZONES"
                        :key="zone.zone"
                        class="mb-dock-drop__zone"
                        :class="`mb-dock-drop__zone--${zone.zone}`"
                        :data-dock-zone="zone.zone"
                        :title="zoneLabel(zone.zone)"
                        aria-hidden="true"
                        @dragover.prevent
                        @drop.prevent.stop="onDrop(strip.id, zone.zone)"
                    />
                </div>
            </Teleport>
        </template>
    </div>
    <!-- Docking off: the first strip's pane alone, with no wrapper element of this component's own. -->
    <slot v-else :strip-id="props.strips[0]?.id ?? ''" />
</template>

<style>
.mb-dock {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    height: 100%;
    width: 100%;
    position: relative;
}

.mb-dock__engine {
    position: absolute;
    inset: 0;
}

.mb-dock__live {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

/* The app's own tokens, so the layout engine never brings a theme of its own. */
.dockview-theme-worldlens {
    color-scheme: inherit;
    --dv-group-view-background-color: rgb(var(--v-theme-surface));
    --dv-tabs-and-actions-container-background-color: rgb(var(--v-theme-surface));
    --dv-separator-border: rgba(var(--v-theme-on-surface), var(--v-border-opacity, 0.12));
    --dv-sash-color: rgba(var(--v-theme-on-surface), 0.08);
    --dv-active-sash-color: rgb(var(--v-theme-primary));
    --dv-drag-over-background-color: rgba(var(--v-theme-primary), 0.18);
    --dv-drag-over-border-color: rgb(var(--v-theme-primary));
    --dv-floating-box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.2);
    --dv-floating-border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
    --dv-floating-titlebar-height: 28px;
    --dv-floating-titlebar-background-color: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));
    --dv-overlay-z-index: 20;
}

.mb-dock-pane,
.mb-dock-pane__content {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    min-width: 0;
}

.mb-dock-pane__content > .mb-tabs {
    flex: 1 1 auto;
}

.mb-dock-drop {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: 25% 1fr 25%;
    grid-template-rows: 25% 1fr 25%;
}

.mb-dock-drop__zone {
    border: 2px dashed rgba(var(--v-theme-primary), 0.55);
    background: rgba(var(--v-theme-primary), 0.06);
    margin: 2px;
    border-radius: 6px;
}

.mb-dock-drop__zone:hover {
    background: rgba(var(--v-theme-primary), 0.24);
}

.mb-dock-drop__zone--left {
    grid-column: 1;
    grid-row: 2;
}

.mb-dock-drop__zone--right {
    grid-column: 3;
    grid-row: 2;
}

.mb-dock-drop__zone--above {
    grid-column: 1 / 4;
    grid-row: 1;
}

.mb-dock-drop__zone--below {
    grid-column: 1 / 4;
    grid-row: 3;
}

.mb-dock-drop__zone--centre {
    grid-column: 2;
    grid-row: 2;
}

@media (prefers-reduced-motion: reduce) {
    .dockview-theme-worldlens {
        --dv-transition-duration: 0ms;
        --dv-active-sash-transition-duration: 0s;
        --dv-active-sash-transition-delay: 0s;
    }
}
</style>
