import "virtual:worldlens-archive-runtime";
import {
    downloadAccessibleName,
    downloadButtonLabel,
    downloadCopy,
    formatBytes,
    formatDate,
    releaseAvailability,
} from "./content/release.js";

const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

const overlayTriggerStack: HTMLElement[] = [];
let lastBuilderTrigger: HTMLElement | null = null;
let lastVisibleDialog: HTMLElement | null = null;

function rendered(element: HTMLElement): boolean {
    if (!element.isConnected || element.getClientRects().length === 0) return false;
    let current: HTMLElement | null = element;
    while (current) {
        const style = getComputedStyle(current);
        if (current.hidden || style.display === "none" || style.visibility === "hidden") return false;
        current = current.parentElement;
    }
    return true;
}

function visible(element: HTMLElement): boolean {
    if (!rendered(element)) return false;
    let current: HTMLElement | null = element;
    while (current) {
        if (current.inert) return false;
        current = current.parentElement;
    }
    return true;
}

function useStaticWalkthroughs(root: ParentNode): void {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const image of root.querySelectorAll<HTMLImageElement>('img[src$=".gif"]')) {
        image.src = image.src.replace(/\.gif(?:$|\?)/u, ".png");
        image.dataset["reducedMotionFallback"] = "true";
    }
}

function labelTabControls(root: ParentNode): void {
    const panel = root.querySelector<HTMLElement>("#wl-tabpanel");
    let selectedTabId: string | null = null;
    const lists = [...root.querySelectorAll<HTMLElement>('[data-wl-tablist="true"]')];
    for (const [listIndex, list] of lists.entries()) {
        const shown = visible(list);
        if (shown) {
            list.setAttribute("role", "tablist");
            list.setAttribute("aria-label", "Open documentation pages");
            const direction = getComputedStyle(list).flexDirection;
            list.setAttribute("aria-orientation", direction.startsWith("row") ? "horizontal" : "vertical");
        } else {
            list.removeAttribute("role");
            list.removeAttribute("aria-label");
            list.removeAttribute("aria-orientation");
        }
        const rows = [...list.querySelectorAll<HTMLButtonElement>('button[data-action="close-tab"]')]
            .map((button) => button.parentElement)
            .filter((row): row is HTMLElement => row instanceof HTMLElement);
        for (const [rowIndex, row] of rows.entries()) {
            const tab = row.querySelector<HTMLButtonElement>('button[data-action="activate-tab"]');
            if (!tab) continue;
            tab.id = `wl-tab-${listIndex}-${rowIndex}`;
            if (!shown) {
                tab.removeAttribute("role");
                tab.removeAttribute("aria-selected");
                tab.removeAttribute("aria-controls");
                tab.tabIndex = 0;
                continue;
            }
            const selected = row.dataset["active"] === "true";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", String(selected));
            tab.setAttribute("aria-controls", "wl-tabpanel");
            tab.tabIndex = selected ? 0 : -1;
            if (selected) selectedTabId = tab.id;
        }
    }
    if (panel && selectedTabId) {
        panel.setAttribute("aria-labelledby", selectedTabId);
        panel.removeAttribute("aria-label");
    } else if (panel) {
        panel.removeAttribute("aria-labelledby");
        panel.setAttribute("aria-label", "Active documentation page");
    }
}

function labelExpandedControls(root: ParentNode): void {
    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
        const text = button.textContent?.trim() ?? "";
        if (/^(Application|Rendering engine|Delivery and CI|Interface contracts)$/u.test(text)) {
            const region = button.nextElementSibling as HTMLElement | null;
            button.setAttribute("aria-expanded", String(Boolean(region && visible(region))));
        }
    }
}

function labelDialogs(root: ParentNode): void {
    const builder = root.querySelector<HTMLElement>('[role="dialog"][aria-label="Regular expression builder"]');
    if (builder) builder.setAttribute("aria-modal", "true");

    const paletteInput = root.querySelector<HTMLInputElement>('input[placeholder*="command"]');
    const palette = paletteInput?.closest<HTMLElement>("div[style*='position: fixed'], div[style*='position:fixed']");
    if (palette) {
        palette.setAttribute("role", "dialog");
        palette.setAttribute("aria-modal", "true");
        palette.setAttribute("aria-label", "Command palette");
    }

    const drawer = root.querySelector<HTMLElement>('aside[aria-label="Documentation navigation"]');
    if (drawer) {
        const compact = window.matchMedia("(max-width: 899px)").matches;
        const open = drawer.dataset["mobileDrawer"] === "true";
        drawer.inert = compact && !open;
        if (compact) drawer.setAttribute("aria-hidden", String(!open));
        else drawer.removeAttribute("aria-hidden");
        if (compact && open) {
            drawer.setAttribute("role", "dialog");
            drawer.setAttribute("aria-modal", "true");
        } else {
            drawer.removeAttribute("role");
            drawer.removeAttribute("aria-modal");
        }
    }

    const moreSheet = root.querySelector<HTMLElement>("#wl-more-sheet");
    const moreTrigger = root.querySelector<HTMLButtonElement>('button[data-action="more"]');
    if (moreTrigger) {
        moreTrigger.setAttribute("aria-controls", "wl-more-sheet");
        moreTrigger.setAttribute("aria-expanded", String(Boolean(moreSheet && visible(moreSheet))));
    }
    const drawerTrigger = root.querySelector<HTMLButtonElement>('button[data-action="drawer"]');
    if (drawerTrigger && drawer) {
        drawerTrigger.setAttribute("aria-controls", "wl-doc-navigation");
        drawerTrigger.setAttribute("aria-expanded", String(drawer.dataset["mobileDrawer"] === "true"));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-active]")) {
        if (button.dataset["action"] === "more") continue;
        if (button.dataset["active"] === "true") button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    }
}

function setTextContent(element: HTMLElement | null, value: string): void {
    if (element && element.textContent !== value) element.textContent = value;
}

function hydrateReleaseDownloads(root: ParentNode): void {
    const links = [...root.querySelectorAll<HTMLAnchorElement>("[data-worldlens-download-link]")];
    const unavailable = [
        ...root.querySelectorAll<HTMLElement>("[data-worldlens-download-unavailable]"),
    ];
    const summary = root.querySelector<HTMLElement>("[data-worldlens-release-summary]");

    if (!releaseAvailability.available) {
        for (const link of links) {
            link.removeAttribute("href");
            link.hidden = true;
        }
        for (const message of unavailable) {
            setTextContent(message, downloadCopy.unavailableLead);
            message.hidden = false;
        }
        setTextContent(summary, downloadCopy.unavailableHeading);
        return;
    }

    const release = releaseAvailability.release;
    const size = formatBytes(release.installer.sizeBytes);
    for (const link of links) {
        link.href = release.installer.url;
        link.hidden = false;
        link.setAttribute("aria-label", downloadAccessibleName(release));
    }
    for (const message of unavailable) message.hidden = true;

    const heroLabel = root.querySelector<HTMLElement>('[data-worldlens-download-label="hero"]');
    setTextContent(heroLabel, `${downloadButtonLabel(release)} · ${release.version} · ${size}`);
    const latestLabel = root.querySelector<HTMLElement>('[data-worldlens-download-label="latest"]');
    setTextContent(latestLabel, `${release.installer.assetName} · ${size}`);
    setTextContent(summary, `${release.version} · ${formatDate(release.publishedAt)}`);
}

function enhance(root: ParentNode = document): void {
    useStaticWalkthroughs(root);
    labelTabControls(root);
    labelExpandedControls(root);
    labelDialogs(root);
    hydrateReleaseDownloads(root);
    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
        if (!button.getAttribute("aria-label") && !button.textContent?.trim()) {
            button.setAttribute("aria-label", button.title || "Site action");
        }
    }
}

function visibleModal(): HTMLElement | null {
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
    return (
        dialogs
            .filter(visible)
            .sort((left, right) => {
                const leftZ = Number.parseInt(getComputedStyle(left).zIndex, 10) || 0;
                const rightZ = Number.parseInt(getComputedStyle(right).zIndex, 10) || 0;
                return leftZ - rightZ;
            })
            .at(-1) ?? null
    );
}

function syncBackgroundInert(modal: HTMLElement | null): void {
    for (const element of document.querySelectorAll<HTMLElement>('[data-wl-overlay-inert="true"]')) {
        element.inert = false;
        delete element.dataset["wlOverlayInert"];
    }
    if (!modal) return;

    let current: HTMLElement = modal;
    while (current.parentElement) {
        const parent = current.parentElement;
        for (const sibling of parent.children) {
            if (!(sibling instanceof HTMLElement) || sibling === current || sibling.contains(modal)) continue;
            if (sibling.classList.contains("wl-overlay-scrim") || sibling.inert) continue;
            sibling.inert = true;
            sibling.dataset["wlOverlayInert"] = "true";
        }
        if (parent === document.body) break;
        current = parent;
    }
}

document.addEventListener(
    "click",
    (event) => {
        const target = event.target as Element | null;
        const builderTrigger = target?.closest<HTMLElement>('button[aria-label*="Regex builder"]');
        if (builderTrigger) {
            lastBuilderTrigger = builderTrigger;
            return;
        }
        if (target?.closest<HTMLElement>('[data-palette-navigation="true"]')) {
            overlayTriggerStack.length = 0;
            return;
        }
        const trigger = target?.closest<HTMLElement>(
            'button[aria-label="Open navigation"],button[data-action="more"],button[data-action="open-palette"]',
        );
        if (trigger && trigger.getAttribute("aria-expanded") !== "true" && overlayTriggerStack.at(-1) !== trigger) {
            overlayTriggerStack.push(trigger);
        }
    },
    true,
);

document.addEventListener("keydown", (event) => {
    if (event.key === "F" && event.shiftKey && (event.ctrlKey || event.metaKey)) {
        const palette = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Command palette"]');
        const paletteAlreadyOpen = Boolean(palette && rendered(palette));
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!paletteAlreadyOpen && active && overlayTriggerStack.at(-1) !== active) overlayTriggerStack.push(active);
    }
    const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]');
    if (tab) {
        const tablist = tab.closest<HTMLElement>('[role="tablist"]');
        const tabs = tablist ? [...tablist.querySelectorAll<HTMLElement>('[role="tab"]')].filter(visible) : [];
        const current = tabs.indexOf(tab);
        const vertical = tablist?.getAttribute("aria-orientation") === "vertical";
        let next = current;
        let handled = true;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (tabs.length && ((vertical && event.key === "ArrowDown") || (!vertical && event.key === "ArrowRight"))) {
            next = (current + 1) % tabs.length;
        } else if (tabs.length && ((vertical && event.key === "ArrowUp") || (!vertical && event.key === "ArrowLeft"))) {
            next = (current - 1 + tabs.length) % tabs.length;
        } else handled = false;
        if (handled) {
            event.preventDefault();
            const nextTab = tabs[next];
            if (next !== current && nextTab) {
                nextTab.focus();
                nextTab.click();
            }
            return;
        }
    }

    const modal = visibleModal();
    if (!modal) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
        const close = modal.querySelector<HTMLButtonElement>(
            'button[aria-label*="Close"],button[aria-label*="close"],button[data-action="close-overlay"]',
        );
        if (close) {
            event.preventDefault();
            event.stopImmediatePropagation();
            close.click();
        }
        return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll<HTMLElement>(focusableSelector)].filter(visible);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

const observer = new MutationObserver(() => {
    syncBackgroundInert(null);
    enhance();
    const modal = visibleModal();
    syncBackgroundInert(modal);
    if (modal && modal !== lastVisibleDialog) {
        const previousDialog = lastVisibleDialog;
        lastVisibleDialog = modal;
        const returningFromBuilder = previousDialog?.getAttribute("aria-label")?.includes("Regular expression");
        const previousZ = previousDialog ? Number.parseInt(getComputedStyle(previousDialog).zIndex, 10) || 0 : 0;
        const modalZ = Number.parseInt(getComputedStyle(modal).zIndex, 10) || 0;
        const returningToParent = Boolean(previousDialog && previousZ > modalZ);
        if (returningFromBuilder && lastBuilderTrigger && modal.contains(lastBuilderTrigger) && visible(lastBuilderTrigger)) {
            lastBuilderTrigger.focus();
        } else if (returningToParent) {
            const returnTarget = overlayTriggerStack.pop();
            if (returnTarget && modal.contains(returnTarget) && visible(returnTarget)) returnTarget.focus();
            else [...modal.querySelectorAll<HTMLElement>(focusableSelector)].find(visible)?.focus();
        } else {
            [...modal.querySelectorAll<HTMLElement>(focusableSelector)].find(visible)?.focus();
        }
    } else if (!modal && lastVisibleDialog) {
        const closedDialog = lastVisibleDialog;
        lastVisibleDialog = null;
        const returnTarget = closedDialog.getAttribute("aria-label")?.includes("Regular expression")
            ? lastBuilderTrigger
            : overlayTriggerStack.pop();
        if (returnTarget && visible(returnTarget)) returnTarget.focus();
    }
});
observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-mobile-drawer", "style"],
});
syncBackgroundInert(null);
enhance();
syncBackgroundInert(visibleModal());
