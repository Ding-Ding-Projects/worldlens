/**
 * The screenshot lightbox: a single, page-level dialog every capture figure on the site opens
 * into, so a reader can actually see what a capture shows rather than squinting at a cropped,
 * fixed-size thumbnail.
 *
 * One instance is built once (in `boot()`) and reused for every capture on every page --
 * the home showcase, the Screenshots page's committed and CI-fetched galleries, and the
 * walkthrough cards all call the same `open()`. That is what makes it a genuine fix rather
 * than three separate half-fixes: the focus trap, the Escape/backdrop-click/close-button
 * paths, the zoom and pan arithmetic and its clamping, and the reduced-motion handling are
 * all written and tested in exactly one place.
 *
 * This is deliberately not a native `<dialog>` opened with `.showModal()`, even though
 * `tabs/BulkCloseDialog.ts` elsewhere in this package uses exactly that. jsdom 30 -- what
 * every test in this package runs under -- does not implement `HTMLDialogElement.showModal`
 * at all (`dialog.showModal is not a function`, confirmed directly), so a native dialog here
 * would leave every behaviour this file exists to prove -- the focus trap, Escape, focus
 * return -- entirely unverified by anything that runs in CI. A hand-built `role="dialog"
 * aria-modal="true"` layer, with its own explicit Tab-cycling, Escape handling and focus
 * management, is provably correct instead of hopefully correct.
 *
 * Because this becomes application-modal (`aria-modal="true"`, matching the exact marker
 * `notifications/notificationPolicy.test.ts` scans this whole package for), it is declared
 * in that file's `BLOCKING_SURFACES` inventory with the decision it is entitled to ask: look
 * closely at one capture, at whatever zoom the reader needs, before returning to the page.
 */

import { el, icon } from "../platform/dom.js";
import type { I18n } from "../i18n/I18n.js";
import {
    clampPan,
    clampScale,
    computeFitScale,
    computeMaxScale,
    computeMinScale,
    zoomPercent,
    type Offset,
    type Size,
} from "./zoomMath.js";

export interface LightboxItem {
    readonly src: string;
    readonly alt: string;
    /** The capture's own name, read into the dialog's accessible label and its caption. */
    readonly name: string;
    /**
     * Real (or, for a capture whose pixel size is not recorded, ratio-shaped) dimensions,
     * known before the `<img>` has finished loading. Used for the very first frame the
     * dialog paints; superseded the moment the real image reports its own `naturalWidth`/
     * `naturalHeight`, which is the authoritative size from then on.
     */
    readonly naturalWidth?: number;
    readonly naturalHeight?: number;
}

export interface Lightbox {
    /** The dialog's own root element. Hidden (`[hidden]`) whenever nothing is open. */
    readonly element: HTMLElement;
    readonly isOpen: boolean;
    /** The current zoom scale: 1 means the image's own natural pixels, 2 means twice that. */
    readonly scale: number;
    open(item: LightboxItem, trigger: HTMLElement): void;
    close(): void;
    destroy(): void;
}

const WHEEL_SENSITIVITY = 0.0015;
const BUTTON_ZOOM_STEP = 1.25;
const KEY_PAN_STEP = 60;
/** How long a run of zoom changes has to settle before the live region speaks once. */
const ANNOUNCE_DEBOUNCE_MS = 400;

function arrowDelta(key: string): Offset | null {
    if (key === "ArrowLeft") return { x: -1, y: 0 };
    if (key === "ArrowRight") return { x: 1, y: 0 };
    if (key === "ArrowUp") return { x: 0, y: -1 };
    if (key === "ArrowDown") return { x: 0, y: 1 };
    return null;
}

function distance(a: Offset, b: Offset): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createLightbox(i18n: I18n): Lightbox {
    const element = el("div", {
        class: "mb-lightbox",
        attrs: { role: "dialog", "aria-modal": "true", hidden: true },
    });

    const toolbar = el("div", { class: "mb-lightbox__toolbar" });
    const zoomOutButton = el("button", { class: "md-icon-button", attrs: { type: "button" } }, icon("remove"));
    const level = el("span", { class: "mb-lightbox__level" });
    const zoomInButton = el("button", { class: "md-icon-button", attrs: { type: "button" } }, icon("add"));
    const spacer = el("div", { class: "mb-lightbox__spacer" });
    const resetButton = el("button", { class: "md-icon-button", attrs: { type: "button" } }, icon("restore"));
    const closeButton = el("button", { class: "md-icon-button", attrs: { type: "button" } }, icon("close"));
    i18n.bindAttr(zoomOutButton, "aria-label", "shots.zoomOut");
    i18n.bindAttr(zoomOutButton, "title", "shots.zoomOut");
    i18n.bindAttr(zoomInButton, "aria-label", "shots.zoomIn");
    i18n.bindAttr(zoomInButton, "title", "shots.zoomIn");
    i18n.bindAttr(resetButton, "aria-label", "shots.resetZoom");
    i18n.bindAttr(resetButton, "title", "shots.resetZoom");
    i18n.bindAttr(closeButton, "aria-label", "common.close");
    i18n.bindAttr(closeButton, "title", "common.close");
    toolbar.append(zoomOutButton, level, zoomInButton, spacer, resetButton, closeButton);

    const stage = el("div", { class: "mb-lightbox__stage" });
    const image = el("img", { class: "mb-lightbox__image", attrs: { draggable: "false" } });
    stage.append(image);

    const caption = el("p", { class: "mb-lightbox__caption" });
    const status = el("p", { class: "mb-lightbox__status", attrs: { role: "status", "aria-live": "polite" } });

    element.append(toolbar, stage, caption, status);
    document.body.append(element);

    let isOpenFlag = false;
    let trigger: HTMLElement | null = null;
    let naturalSize: Size = { width: 0, height: 0 };
    let hintSize: Size | null = null;
    let fitScale = 1;
    let minScale = 1;
    let maxScale = 1;
    let scale = 1;
    let pan: Offset = { x: 0, y: 0 };
    let userHasZoomed = false;
    let announceTimer: number | null = null;
    let restoreInert: (() => void) | null = null;

    /** Every one of the dialog's own Tab stops, in document order, skipping disabled buttons. */
    function focusTargets(): HTMLElement[] {
        return [...element.querySelectorAll<HTMLElement>("button:not([disabled])")];
    }

    function measureViewport(): Size {
        const rect = stage.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    function measureNaturalSize(): Size {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            return { width: image.naturalWidth, height: image.naturalHeight };
        }
        return hintSize ?? { width: 0, height: 0 };
    }

    function applyTransform(): void {
        if (naturalSize.width > 0 && naturalSize.height > 0) {
            image.style.width = `${naturalSize.width}px`;
            image.style.height = `${naturalSize.height}px`;
        }
        image.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
        image.classList.toggle("mb-lightbox__image--zoomed", scale > fitScale + 0.001);
    }

    function updateReadout(): void {
        const percent = zoomPercent(scale);
        i18n.bindText(level, "shots.zoomLevel", { percent });
        zoomOutButton.disabled = scale <= minScale + 0.001;
        zoomInButton.disabled = scale >= maxScale - 0.001;
    }

    function scheduleAnnounce(): void {
        if (announceTimer !== null) window.clearTimeout(announceTimer);
        announceTimer = window.setTimeout(() => {
            announceTimer = null;
            i18n.bindText(status, "shots.zoomAnnounce", { percent: zoomPercent(scale) });
        }, ANNOUNCE_DEBOUNCE_MS);
    }

    /**
     * Re-derives fit/min/max/scale/pan from whatever is currently known about the image and
     * the stage. `snapToFit` jumps back to a whole-image view (used on open, and on the real
     * image's `load` event as long as the visitor has not already zoomed by hand); otherwise
     * the visitor's current scale and pan are kept, only re-clamped against the -- possibly
     * now more accurate -- real geometry.
     */
    function recomputeGeometry(snapToFit: boolean): void {
        const viewport = measureViewport();
        naturalSize = measureNaturalSize();
        fitScale = computeFitScale(naturalSize, viewport);
        minScale = computeMinScale(fitScale);
        maxScale = computeMaxScale(fitScale);
        if (snapToFit) {
            scale = fitScale;
            pan = { x: 0, y: 0 };
        } else {
            scale = clampScale(scale, minScale, maxScale);
            pan = clampPan(pan, naturalSize, viewport, scale);
        }
        applyTransform();
        updateReadout();
    }

    function zoomTo(nextScale: number, fromVisitor: boolean): void {
        if (fromVisitor) userHasZoomed = true;
        scale = clampScale(nextScale, minScale, maxScale);
        pan = clampPan(pan, naturalSize, measureViewport(), scale);
        applyTransform();
        updateReadout();
        scheduleAnnounce();
    }

    function panBy(deltaX: number, deltaY: number): void {
        pan = clampPan({ x: pan.x + deltaX, y: pan.y + deltaY }, naturalSize, measureViewport(), scale);
        applyTransform();
    }

    function resetToFit(): void {
        zoomTo(fitScale, true);
        pan = { x: 0, y: 0 };
        applyTransform();
    }

    function toggleFitNatural(): void {
        // Already zoomed away from fit: the second click of a double-click/tap returns to it.
        // At fit already: the first click jumps to natural (actual) size instead.
        zoomTo(Math.abs(scale - fitScale) < 0.01 ? 1 : fitScale, true);
    }

    /* ---- Focus and background isolation --------------------------------------------- */

    function setBackgroundInert(inert: boolean): void {
        if (inert) {
            const touched: HTMLElement[] = [];
            for (const child of Array.from(document.body.children)) {
                if (child === element || !(child instanceof HTMLElement)) continue;
                if (child.hasAttribute("inert")) continue;
                child.setAttribute("inert", "");
                touched.push(child);
            }
            restoreInert = () => {
                for (const node of touched) node.removeAttribute("inert");
            };
        } else {
            restoreInert?.();
            restoreInert = null;
        }
    }

    /* ---- Keyboard: Escape, the focus trap, zoom and pan shortcuts -------------------- */

    element.addEventListener("keydown", (event) => {
        if (!isOpenFlag) return;

        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if (event.key === "Tab") {
            const targets = focusTargets();
            if (targets.length === 0) return;
            const first = targets[0] as HTMLElement;
            const last = targets[targets.length - 1] as HTMLElement;
            const active = document.activeElement;
            const outside = !(active instanceof Node) || !element.contains(active);
            if (event.shiftKey) {
                if (outside || active === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (outside || active === last) {
                event.preventDefault();
                first.focus();
            }
            return;
        }

        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomTo(scale * BUTTON_ZOOM_STEP, true);
            return;
        }
        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            zoomTo(scale / BUTTON_ZOOM_STEP, true);
            return;
        }
        if (event.key === "0") {
            event.preventDefault();
            resetToFit();
            return;
        }

        const arrow = arrowDelta(event.key);
        if (arrow !== null) {
            event.preventDefault();
            panBy(arrow.x * KEY_PAN_STEP, arrow.y * KEY_PAN_STEP);
        }
    });

    /* ---- Buttons ---------------------------------------------------------------------- */

    zoomInButton.addEventListener("click", () => zoomTo(scale * BUTTON_ZOOM_STEP, true));
    zoomOutButton.addEventListener("click", () => zoomTo(scale / BUTTON_ZOOM_STEP, true));
    resetButton.addEventListener("click", () => resetToFit());
    closeButton.addEventListener("click", () => close());

    /* ---- Backdrop click: the stage's own empty space, never the image itself --------- */

    stage.addEventListener("click", (event) => {
        if (event.target === stage) close();
    });

    /* ---- Wheel / trackpad zoom ---------------------------------------------------------
     *
     * Chromium and Safari report a trackpad pinch as a `wheel` event with `ctrlKey: true`
     * and a synthetic `deltaY`, so this one handler already covers "mouse wheel / trackpad"
     * without a second code path for the pinch case specifically.
     */
    stage.addEventListener(
        "wheel",
        (event) => {
            if (!isOpenFlag) return;
            event.preventDefault();
            const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
            zoomTo(scale * factor, true);
        },
        { passive: false },
    );

    /* ---- Double-click / double-tap: toggle fit vs natural size ------------------------ */

    image.addEventListener("dblclick", () => toggleFitNatural());

    /* ---- Pointer drag-to-pan and two-finger pinch --------------------------------------
     *
     * Pointer Events unify mouse, pen and touch, so "drag with the pointer" and "one-finger
     * drag on touch" are the same code path here rather than two. A second simultaneous
     * pointer turns the same gesture into a pinch: its start distance and the scale at that
     * moment are recorded, and every subsequent move scales relative to that ratio.
     */
    const activePointers = new Map<number, Offset>();
    let dragStart: { pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | null =
        null;
    let pinchStart: { distance: number; scale: number } | null = null;

    image.addEventListener("pointerdown", (event) => {
        if (!isOpenFlag) return;
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        image.setPointerCapture?.(event.pointerId);
        if (activePointers.size === 2) {
            const [a, b] = [...activePointers.values()] as [Offset, Offset];
            pinchStart = { distance: Math.max(1, distance(a, b)), scale };
            dragStart = null;
        } else if (activePointers.size === 1) {
            dragStart = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                panX: pan.x,
                panY: pan.y,
            };
            image.classList.add("mb-lightbox__image--dragging");
        }
    });

    image.addEventListener("pointermove", (event) => {
        if (!isOpenFlag || !activePointers.has(event.pointerId)) return;
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (activePointers.size === 2 && pinchStart !== null) {
            const [a, b] = [...activePointers.values()] as [Offset, Offset];
            const factor = Math.max(1, distance(a, b)) / pinchStart.distance;
            zoomTo(pinchStart.scale * factor, true);
            return;
        }

        if (dragStart !== null && event.pointerId === dragStart.pointerId) {
            pan = clampPan(
                {
                    x: dragStart.panX + (event.clientX - dragStart.clientX),
                    y: dragStart.panY + (event.clientY - dragStart.clientY),
                },
                naturalSize,
                measureViewport(),
                scale,
            );
            applyTransform();
        }
    });

    function endPointer(event: PointerEvent): void {
        activePointers.delete(event.pointerId);
        if (dragStart !== null && event.pointerId === dragStart.pointerId) {
            dragStart = null;
            image.classList.remove("mb-lightbox__image--dragging");
        }
        if (activePointers.size < 2) pinchStart = null;
        // One finger lifted off a two-finger pinch: resume panning from the finger left down,
        // rather than dropping the gesture entirely until every finger has been lifted.
        if (activePointers.size === 1) {
            const [[pointerId, position]] = [...activePointers.entries()] as [[number, Offset]];
            dragStart = { pointerId, clientX: position.x, clientY: position.y, panX: pan.x, panY: pan.y };
        }
    }
    image.addEventListener("pointerup", endPointer);
    image.addEventListener("pointercancel", endPointer);

    /* ---- Real image load: the authoritative geometry, once it is known --------------- */

    image.addEventListener("load", () => {
        if (!isOpenFlag) return;
        recomputeGeometry(!userHasZoomed);
    });

    function open(item: LightboxItem, openTrigger: HTMLElement): void {
        trigger = openTrigger;
        userHasZoomed = false;
        hintSize =
            item.naturalWidth !== undefined && item.naturalHeight !== undefined
                ? { width: item.naturalWidth, height: item.naturalHeight }
                : null;

        image.src = item.src;
        image.alt = item.alt;
        caption.textContent = item.name;
        i18n.bindAttr(element, "aria-label", "shots.dialogLabel", { name: item.name });

        element.hidden = false;
        isOpenFlag = true;
        setBackgroundInert(true);
        recomputeGeometry(true);
        closeButton.focus();
    }

    function close(): void {
        if (!isOpenFlag) return;
        isOpenFlag = false;
        element.hidden = true;
        setBackgroundInert(false);
        if (announceTimer !== null) {
            window.clearTimeout(announceTimer);
            announceTimer = null;
        }
        activePointers.clear();
        dragStart = null;
        pinchStart = null;
        const returnTo = trigger;
        trigger = null;
        if (returnTo !== null && returnTo.isConnected) returnTo.focus();
    }

    function destroy(): void {
        if (announceTimer !== null) window.clearTimeout(announceTimer);
        setBackgroundInert(false);
        element.remove();
    }

    return {
        element,
        get isOpen() {
            return isOpenFlag;
        },
        get scale() {
            return scale;
        },
        open,
        close,
        destroy,
    };
}
