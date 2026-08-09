import { DARK_SCHEME, LIGHT_SCHEME, schemeToCustomProperties } from "@worldlens/shared";
import type { MapInteractionEventDetail } from "./MapViewer";

type Pin = {
    id: string;
    x: number;
    y: number;
    z: number;
    label: string;
    screenX?: number;
    screenY?: number;
};

/**
 * The public map is normally opened on a phone, not in the desktop application's 800 px shell.
 * These are the concrete widths the redesign contract calls out, kept exported so a focused
 * browser-shell test cannot quietly turn "compact" back into an untested adjective.
 */
export const SERVED_PHONE_VIEWPORTS = [360, 390, 414] as const;
export const SERVED_COMPACT_LAYOUT_MAX_WIDTH = 680;

/**
 * The shell's colours, emitted from the one canonical scheme rather than transcribed beside it.
 *
 * This file used to carry twelve hex values of its own - six roles for light, six for dark - and
 * not one of them matched what the desktop application renders. The same product looked like two
 * products depending on whether you opened it or visited it, and nothing could ever have caught
 * that, because there was nothing to compare against.
 *
 * `@worldlens/shared` is where the schemes live now: plain data, no Vue, no Vuetify, no DOM, which
 * is exactly what lets this framework-neutral shell read them without growing a runtime it has no
 * business carrying. `materialShell.tokenIdentity.test.ts` asserts what is emitted here is what
 * the desktop renders, so a colour cannot change in one place and not the other.
 *
 * The `--bm-` prefix stays: it is already in a published stylesheet and renaming it would be a
 * breaking change for no gain.
 */
const SHELL_BASE = `.bm-m3-shell{position:relative;width:100%;height:100%;font:500 14px/1.4 Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;color:${LIGHT_SCHEME["on-surface"]};${schemeToCustomProperties(LIGHT_SCHEME)}--bm-shadow:0 3px 12px ${LIGHT_SCHEME.shadow}33;}`;

const SHELL_DARK = `.bm-m3-shell[data-theme="dark"]{color:${DARK_SCHEME["on-surface"]};${schemeToCustomProperties(DARK_SCHEME)}--bm-shadow:0 3px 12px ${DARK_SCHEME.shadow}55;}`;

const STYLE = `
${SHELL_BASE}
${SHELL_DARK}
.bm-m3-appbar{position:absolute;z-index:20;inset:12px 12px auto 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;border-radius:24px;background:color-mix(in srgb,var(--bm-surface-container) 94%,transparent);box-shadow:var(--bm-shadow);backdrop-filter:blur(16px);}
.bm-m3-map-rail{display:flex;flex:0 0 auto}.bm-m3-rail-menu,.bm-m3-icon{display:grid;place-items:center;flex:0 0 48px;box-sizing:border-box;width:48px;height:48px;min-width:48px;min-height:48px;border:0;background:transparent;color:inherit;border-radius:50%;cursor:pointer;font-size:20px}.bm-m3-rail-menu:hover,.bm-m3-rail-menu:focus-visible,.bm-m3-icon:hover,.bm-m3-icon:focus-visible{background:var(--bm-surface-container-high);outline:2px solid var(--bm-primary);outline-offset:2px}
.bm-m3-brand-group{flex:1 1 10rem;min-width:0}.bm-m3-brand{overflow:hidden;font-weight:750;letter-spacing:.01em;text-overflow:ellipsis;white-space:nowrap}.bm-m3-subtitle{font-size:12px;opacity:.7}.bm-m3-search{box-sizing:border-box;flex:0 1 min(28vw,260px);min-width:10rem;min-height:48px;border:1px solid var(--bm-outline);border-radius:24px;padding:10px 14px;background:var(--bm-surface);color:inherit}.bm-m3-search:focus{outline:2px solid var(--bm-primary);border-color:transparent}
.bm-m3-coordinates{display:grid;grid-template-columns:repeat(2,minmax(68px,1fr));flex:0 1 160px;gap:4px;min-width:0}.bm-m3-coordinate{display:flex;align-items:center;min-height:48px;padding:0 10px;border:1px solid var(--bm-outline-variant);border-radius:12px;background:var(--bm-surface);font-family:ui-monospace,"Roboto Mono",monospace;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.bm-m3-menu{position:fixed;z-index:40;box-sizing:border-box;width:min(280px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow-y:auto;padding:8px;border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-menu[hidden],.bm-m3-map-menu[hidden],.bm-m3-settings[hidden]{display:none}.bm-m3-menu button,.bm-m3-map-menu button,.bm-m3-settings button{display:block;box-sizing:border-box;width:100%;min-height:48px;border:0;background:transparent;color:inherit;text-align:left;padding:11px 12px;border-radius:12px;cursor:pointer}.bm-m3-menu button:hover,.bm-m3-menu button:focus-visible,.bm-m3-map-menu button:hover,.bm-m3-map-menu button:focus-visible,.bm-m3-settings button:hover{background:var(--bm-surface-container-high);outline:0}
.bm-m3-map-menu{position:fixed;z-index:41;left:18px;top:76px;bottom:18px;display:flex;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);flex-direction:column;border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-map-menu__header{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 16px;border-bottom:1px solid var(--bm-surface-container)}.bm-m3-map-menu__header h2{flex:1;margin:0;font-size:18px}.bm-m3-map-menu__header button{width:auto;min-width:48px}.bm-m3-map-menu__body{overflow-y:auto;padding:8px}
.bm-m3-settings{position:fixed;z-index:42;right:18px;top:76px;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);overflow-y:auto;padding:16px;border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-settings h2{font-size:18px;margin:0 0 12px}.bm-m3-setting{display:grid;gap:6px;margin:12px 0}.bm-m3-setting select,.bm-m3-setting input[type=range]{width:100%;min-height:48px}.bm-m3-setting select{padding:9px;border-radius:10px;border:1px solid var(--bm-outline);background:var(--bm-surface);color:inherit}
.bm-m3-pin{position:fixed;z-index:25;transform:translate(-50%,-100%);padding:7px 10px;border-radius:12px;background:var(--bm-primary);color:var(--bm-on-primary);box-shadow:var(--bm-shadow);font-size:12px;pointer-events:none}.bm-m3-pin::after{content:"";position:absolute;left:50%;bottom:-7px;border:7px solid transparent;border-top-color:var(--bm-primary);border-bottom:0;transform:translateX(-50%)}
.bm-m3-toast{position:fixed;z-index:50;left:8px;bottom:8px;box-sizing:border-box;max-width:min(420px,calc(100vw - 16px));padding:12px 16px;border-radius:14px;background:var(--bm-surface-container);box-shadow:var(--bm-shadow);}
@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px){.bm-m3-control-bar{inset:8px 8px auto 8px;display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:8px;padding:8px;border-radius:20px}.bm-m3-map-rail{grid-column:1}.bm-m3-brand-group{grid-column:2}.bm-m3-subtitle,.bm-m3-command{display:none}.bm-m3-settings-control{grid-column:3}.bm-m3-search{grid-column:1/-1;width:100%;min-width:0}.bm-m3-coordinates{grid-column:1/-1;width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}.bm-m3-map-menu{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-width:none;max-height:min(70dvh,calc(100dvh - 16px));border-radius:24px 24px 16px 16px}.bm-m3-settings{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:calc(100dvh - 16px)}}
`;

export class MaterialShell {
    readonly root: HTMLElement;
    private readonly menu: HTMLDivElement;
    private readonly mapMenu: HTMLElement;
    private readonly mapMenuButton: HTMLButtonElement;
    private readonly settings: HTMLDivElement;
    private readonly search: HTMLInputElement;
    private readonly coordinates: HTMLDivElement;
    private readonly pinsLayer: HTMLDivElement;
    private pins: Pin[] = [];
    private pinCounter = 0;
    private toastTimer: number | undefined;

    constructor(root: Element) {
        this.root = root as HTMLElement;
        this.root.classList.add("bm-m3-shell");
        if (!document.getElementById("bm-m3-style")) {
            const style = document.createElement("style");
            style.id = "bm-m3-style";
            style.textContent = STYLE;
            document.head.appendChild(style);
        }
        this.pins = this.readPins();
        const bar = document.createElement("header");
        bar.className = "bm-m3-appbar bm-m3-control-bar";
        bar.innerHTML = `<nav class="bm-m3-map-rail" aria-label="Map navigation"><button class="bm-m3-rail-menu" type="button" data-action="map-menu" aria-label="Open map menu" aria-controls="bm-m3-map-menu" aria-expanded="false" title="Open map menu">☰</button></nav><div class="bm-m3-brand-group"><div class="bm-m3-brand">BlueMap</div><div class="bm-m3-subtitle">Material map server</div></div><input class="bm-m3-search" type="search" aria-label="Search map controls" placeholder="Search controls…"><div class="bm-m3-coordinates" role="status" aria-label="Current map coordinates"><output class="bm-m3-coordinate" data-coordinate="x" aria-label="Current X coordinate: unavailable">x —</output><output class="bm-m3-coordinate" data-coordinate="z" aria-label="Current Z coordinate: unavailable">z —</output></div><button class="bm-m3-icon bm-m3-settings-control" type="button" data-action="settings" aria-label="Open settings">⚙</button><button class="bm-m3-icon bm-m3-command" type="button" data-action="command" aria-label="Open command palette" title="Ctrl+Shift+F">⌘</button>`;
        this.root.appendChild(bar);
        this.mapMenuButton = bar.querySelector<HTMLButtonElement>('[data-action="map-menu"]')!;
        this.search = bar.querySelector<HTMLInputElement>("input")!;
        this.coordinates = bar.querySelector<HTMLDivElement>(".bm-m3-coordinates")!;
        const settingsButton = bar.querySelector<HTMLButtonElement>('[data-action="settings"]')!;
        settingsButton.addEventListener(
            "click",
            () => (this.settings.hidden = !this.settings.hidden),
        );
        this.mapMenuButton.addEventListener("click", () => this.toggleMapMenu());
        bar.querySelector<HTMLButtonElement>('[data-action="command"]')!.addEventListener(
            "click",
            () => this.showCommandPaletteToast(),
        );
        this.search.addEventListener("input", (event) => {
            const value = (event.target as HTMLInputElement).value.trim();
            if (value)
                this.showToast(`Search is ready for “${value}”. Use the map or open settings.`);
        });

        this.menu = document.createElement("div");
        this.menu.className = "bm-m3-menu";
        this.menu.hidden = true;
        this.menu.innerHTML = `<button type="button" data-action="pin">📍 Add pinpoint here</button><button type="button" data-action="copy">Copy coordinates</button><button type="button" data-action="cancel">Cancel</button>`;
        this.root.appendChild(this.menu);
        this.menu.addEventListener("click", (event) => this.handleMenuClick(event));

        this.mapMenu = document.createElement("aside");
        this.mapMenu.id = "bm-m3-map-menu";
        this.mapMenu.className = "bm-m3-map-menu";
        this.mapMenu.hidden = true;
        this.mapMenu.setAttribute("aria-label", "Map menu");
        this.mapMenu.setAttribute("data-presentation", "side-sheet");
        this.mapMenu.innerHTML = `<div class="bm-m3-map-menu__header"><h2>Map menu</h2><button type="button" data-map-action="close" aria-label="Close map menu">Close</button></div><div class="bm-m3-map-menu__body"><button type="button" data-map-action="search">Search map controls</button><button type="button" data-map-action="appearance">Map appearance</button><button type="button" data-map-action="palette">Open command palette</button></div>`;
        this.root.appendChild(this.mapMenu);
        this.mapMenu.addEventListener("click", (event) => this.handleMapMenuClick(event));

        this.settings = document.createElement("div");
        this.settings.className = "bm-m3-settings";
        this.settings.hidden = true;
        this.settings.innerHTML = `<h2>Map appearance</h2><div class="bm-m3-setting"><label for="bm-theme">Theme</label><select id="bm-theme"><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="bm-m3-setting"><label for="bm-density">Density</label><input id="bm-density" type="range" min="1" max="5" value="3"><small>Controls spacing without changing map data.</small></div><div class="bm-m3-setting"><label for="bm-funny">Message style</label><input id="bm-funny" type="range" min="1" max="5" value="2"><small>Styles notifications only; facts stay exact.</small></div>`;
        this.root.appendChild(this.settings);
        this.settings
            .querySelector("select")!
            .addEventListener("change", (event) =>
                this.setTheme((event.target as HTMLSelectElement).value),
            );
        this.settings
            .querySelector("input#bm-density")!
            .addEventListener(
                "input",
                (event) => (this.root.dataset.density = (event.target as HTMLInputElement).value),
            );
        this.settings
            .querySelector("input#bm-funny")!
            .addEventListener("input", (event) =>
                localStorage.setItem(
                    "bluemap-funny-level-en",
                    (event.target as HTMLInputElement).value,
                ),
            );

        this.pinsLayer = document.createElement("div");
        this.pinsLayer.setAttribute("aria-label", "Saved pinpoints");
        this.root.appendChild(this.pinsLayer);
        this.renderPins();
        this.setTheme(localStorage.getItem("bluemap-theme") || "dark");
        this.syncViewportLayout();
        document.addEventListener("click", this.dismiss);
        document.addEventListener("keydown", this.dismissMapMenuWithEscape);
        window.addEventListener("resize", this.syncViewportLayout);
    }

    private readonly dismiss = (event: MouseEvent): void => {
        if (!this.menu.contains(event.target as Node)) this.menu.hidden = true;
        if (
            !this.mapMenu.contains(event.target as Node) &&
            !this.mapMenuButton.contains(event.target as Node)
        )
            this.closeMapMenu();
    };

    private readonly dismissMapMenuWithEscape = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || this.mapMenu.hidden) return;
        this.closeMapMenu();
        this.mapMenuButton.focus();
    };

    private readonly syncViewportLayout = (): void => {
        const compact = window.innerWidth <= SERVED_COMPACT_LAYOUT_MAX_WIDTH;
        this.root.dataset.layout = compact ? "compact" : "wide";
        this.mapMenu.dataset.presentation = compact ? "bottom-sheet" : "side-sheet";
    };

    private toggleMapMenu(): void {
        if (this.mapMenu.hidden) {
            this.settings.hidden = true;
            this.mapMenu.hidden = false;
            this.mapMenuButton.setAttribute("aria-expanded", "true");
            return;
        }
        this.closeMapMenu();
    }

    private closeMapMenu(): void {
        this.mapMenu.hidden = true;
        this.mapMenuButton.setAttribute("aria-expanded", "false");
    }

    private handleMapMenuClick(event: Event): void {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset
            .mapAction;
        if (action === "close") {
            this.closeMapMenu();
            this.mapMenuButton.focus();
            return;
        }
        if (action === "search") {
            this.closeMapMenu();
            this.search.focus();
            return;
        }
        if (action === "appearance") {
            this.closeMapMenu();
            this.settings.hidden = false;
            return;
        }
        if (action === "palette") {
            this.closeMapMenu();
            this.showCommandPaletteToast();
        }
    }

    private showCommandPaletteToast(): void {
        this.showToast("Command palette: search, settings, pins, and map controls");
    }

    openContextMenu(detail: MapInteractionEventDetail, screenX: number, screenY: number): void {
        const point = detail.hit?.point;
        if (!point) {
            this.showToast("No terrain at that point; move over a loaded map tile first.");
            return;
        }
        this.menu.dataset.x = String(point.x);
        this.menu.dataset.y = String(point.y);
        this.menu.dataset.z = String(point.z);
        this.menu.style.left = `${Math.max(8, Math.min(screenX, window.innerWidth - 240))}px`;
        this.menu.style.top = `${Math.max(8, Math.min(screenY, window.innerHeight - 160))}px`;
        this.updateCoordinates(point.x, point.z);
        this.menu.hidden = false;
    }

    private handleMenuClick(event: Event): void {
        const action = (event.target as HTMLElement).dataset.action;
        if (action === "cancel") this.menu.hidden = true;
        if (action === "copy") {
            const coords = `${this.menu.dataset.x}, ${this.menu.dataset.y}, ${this.menu.dataset.z}`;
            void navigator.clipboard?.writeText(coords);
            this.showToast(`Coordinates copied: ${coords}`);
            this.menu.hidden = true;
        }
        if (action === "pin") {
            const pin: Pin = {
                id: `pin-${++this.pinCounter}`,
                x: Number(this.menu.dataset.x),
                y: Number(this.menu.dataset.y),
                z: Number(this.menu.dataset.z),
                label: `Pinpoint ${this.pinCounter}`,
                screenX: Number(this.menu.style.left.replace("px", "")),
                screenY: Number(this.menu.style.top.replace("px", "")),
            };
            this.pins.push(pin);
            this.writePins();
            this.showToast(
                `${pin.label} saved at ${pin.x.toFixed(0)}, ${pin.y.toFixed(0)}, ${pin.z.toFixed(0)}.`,
            );
            this.menu.hidden = true;
        }
    }

    private renderPins(): void {
        this.pinsLayer.replaceChildren(
            ...this.pins.map((pin) => {
                const el = document.createElement("div");
                el.className = "bm-m3-pin";
                el.textContent = `${pin.label} · ${pin.x.toFixed(0)}, ${pin.y.toFixed(0)}, ${pin.z.toFixed(0)}`;
                el.dataset.x = String(pin.x);
                el.dataset.z = String(pin.z);
                if (pin.screenX !== undefined && pin.screenY !== undefined) {
                    el.style.left = `${pin.screenX}px`;
                    el.style.top = `${pin.screenY}px`;
                } else el.hidden = true;
                return el;
            }),
        );
    }

    private readPins(): Pin[] {
        try {
            return JSON.parse(localStorage.getItem("bluemap-pinpoints") || "[]") as Pin[];
        } catch {
            return [];
        }
    }
    private writePins(): void {
        localStorage.setItem("bluemap-pinpoints", JSON.stringify(this.pins));
        this.renderPins();
    }
    private updateCoordinates(x: number, z: number): void {
        for (const [axis, value] of [
            ["x", x],
            ["z", z],
        ] as const) {
            const field = this.coordinates.querySelector<HTMLOutputElement>(
                `[data-coordinate="${axis}"]`,
            )!;
            const rounded = value.toFixed(0);
            field.textContent = `${axis} ${rounded}`;
            field.setAttribute(
                "aria-label",
                `Current ${axis.toUpperCase()} coordinate: ${rounded}`,
            );
        }
    }
    private setTheme(theme: string): void {
        const selectedTheme = theme === "dark" ? "dark" : "light";
        this.root.dataset.theme = selectedTheme;
        this.settings.querySelector<HTMLSelectElement>("#bm-theme")!.value = selectedTheme;
        localStorage.setItem("bluemap-theme", selectedTheme);
    }
    private showToast(message: string): void {
        let toast = this.root.querySelector<HTMLDivElement>(".bm-m3-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "bm-m3-toast";
            this.root.appendChild(toast);
        }
        toast.textContent = message;
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => toast?.remove(), 4200);
    }
}
