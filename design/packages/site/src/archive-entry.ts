import "virtual:worldlens-archive-runtime";

const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

let lastOverlayTrigger: HTMLElement | null = null;
let lastVisibleDialog: HTMLElement | null = null;

function visible(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    return !element.hidden && style.display !== "none" && style.visibility !== "hidden";
}

function useStaticWalkthroughs(root: ParentNode): void {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const image of root.querySelectorAll<HTMLImageElement>('img[src$=".gif"]')) {
        image.src = image.src.replace(/\.gif(?:$|\?)/u, ".png");
        image.dataset["reducedMotionFallback"] = "true";
    }
}

function labelTabControls(root: ParentNode): void {
    const closeButtons = [...root.querySelectorAll<HTMLButtonElement>('button[aria-label="Close tab"]')];
    if (!closeButtons.length) return;
    const rows = closeButtons
        .map((button) => button.parentElement)
        .filter((row): row is HTMLElement => row instanceof HTMLElement);
    const list = rows[0]?.parentElement;
    if (list) {
        list.setAttribute("role", "tablist");
        list.setAttribute("aria-label", "Open documentation pages");
        list.setAttribute("aria-orientation", "vertical");
    }
    for (const row of rows) {
        const tab = row.querySelector<HTMLButtonElement>("button:not([aria-label])");
        if (!tab) continue;
        const selected = row.style.background.includes("--s-high");
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
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
}

function enhance(root: ParentNode = document): void {
    useStaticWalkthroughs(root);
    labelTabControls(root);
    labelExpandedControls(root);
    labelDialogs(root);
    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
        if (!button.getAttribute("aria-label") && !button.textContent?.trim()) {
            button.setAttribute("aria-label", button.title || "Site action");
        }
    }
}

function visibleModal(): HTMLElement | null {
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
    return dialogs.find(visible) ?? null;
}

document.addEventListener(
    "click",
    (event) => {
        const trigger = (event.target as Element | null)?.closest<HTMLElement>(
            'button[aria-label*="Regex builder"],button[aria-label="Search"],button[aria-label="Open navigation"]',
        );
        if (trigger) lastOverlayTrigger = trigger;
    },
    true,
);

document.addEventListener("keydown", (event) => {
    const modal = visibleModal();
    if (!modal) return;
    if (event.key === "Escape") {
        const close = modal.querySelector<HTMLButtonElement>(
            'button[aria-label*="Close"],button[aria-label*="close"]',
        );
        if (close) {
            event.preventDefault();
            close.click();
            lastOverlayTrigger?.focus();
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
    enhance();
    const modal = visibleModal();
    if (modal && modal !== lastVisibleDialog) {
        lastVisibleDialog = modal;
        modal.querySelector<HTMLElement>(focusableSelector)?.focus();
    } else if (!modal && lastVisibleDialog) {
        lastVisibleDialog = null;
        lastOverlayTrigger?.focus();
    }
});
observer.observe(document.body, { childList: true, subtree: true });
enhance();
