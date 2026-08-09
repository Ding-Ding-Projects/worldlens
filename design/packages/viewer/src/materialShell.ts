import {
    CONTRAST_SCHEME,
    DARK_SCHEME,
    LIGHT_SCHEME,
    schemeToCustomProperties,
} from "@worldlens/shared";
import type { MapInteractionEventDetail } from "./MapViewer";
import { ViewerPresentationPolicy } from "./presentationPolicy";

type Pin = {
    id: string;
    x: number;
    y: number;
    z: number;
    label: string;
    screenX?: number;
    screenY?: number;
};

type ThemeName = "dark" | "light" | "contrast";
type SearchScopeName = "map-controls" | "command-palette";
type SearchActionId = "map-menu" | "appearance" | "command-palette" | "map-search";

type SearchScope = {
    readonly name: SearchScopeName;
    readonly input: HTMLInputElement;
    readonly regexToggle: HTMLButtonElement;
    readonly builderToggle: HTMLButtonElement;
    readonly builder: HTMLElement;
    readonly results: HTMLElement;
    regex: boolean;
    flags: string;
    sample: string;
};

type RegexMatch = {
    readonly text: string;
    readonly index: number;
    readonly groups: readonly string[];
};

type RegexPreview = {
    readonly error: string | null;
    readonly matches: readonly RegexMatch[];
    readonly sampleTruncated: boolean;
};

type RegexToken = {
    readonly label: string;
    readonly before: string;
    readonly after?: string;
    readonly hint: string;
};

const REGEX_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
const MAX_REGEX_PATTERN_LENGTH = 512;
const MAX_REGEX_SAMPLE_LENGTH = 4_000;
const MAX_REGEX_MATCHES = 40;

const REGEX_TOKENS: readonly RegexToken[] = [
    { label: "[abc]", before: "[", after: "]", hint: "Character class" },
    { label: "^", before: "^", hint: "Start anchor" },
    { label: "( )", before: "(", after: ")", hint: "Capturing group" },
    { label: "|", before: "|", hint: "Alternation" },
    { label: "+", before: "+", hint: "One or more" },
];

/**
 * The public map is normally opened on a phone, not in the desktop application's 800 px shell.
 * These are the concrete widths the redesign contract calls out, kept exported so a focused
 * browser-shell test cannot quietly turn "compact" back into an untested adjective.
 */
export const SERVED_PHONE_VIEWPORTS = [360, 390, 414] as const;
export const SERVED_COMPACT_LAYOUT_MAX_WIDTH = 680;

/**
 * The served shell deliberately owns its small regex adapter rather than importing a Vue surface.
 * It uses the browser's ECMAScript `RegExp` — the same engine which filters the controls — and
 * keeps the pattern and sample bounded so a public map cannot be frozen by an accidental giant
 * expression. The nested-quantifier check rejects the practical catastrophic-backtracking shape
 * before compiling; syntax errors are then rendered directly beside the field that owns them.
 */
function normaliseRegexFlags(flags: string): string {
    const requested = new Set(flags);
    return REGEX_FLAGS.filter((flag) => requested.has(flag)).join("");
}

function regexError(pattern: string, flags: string): string | null {
    if (pattern.length > MAX_REGEX_PATTERN_LENGTH)
        return `Pattern is longer than ${MAX_REGEX_PATTERN_LENGTH} characters.`;
    if (/\((?:[^\\)]|\\.)*[+*](?:[^\\)]|\\.)*\)[+*]/.test(pattern))
        return "This pattern nests unbounded repetition and could freeze the map controls.";
    try {
        // Search predicates must not inherit `lastIndex` between control labels.
        new RegExp(pattern, normaliseRegexFlags(flags).replace(/[gy]/g, ""));
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

function previewRegex(pattern: string, flags: string, sample: string): RegexPreview {
    const error = regexError(pattern, flags);
    const sampleTruncated = sample.length > MAX_REGEX_SAMPLE_LENGTH;
    const boundedSample = sample.slice(0, MAX_REGEX_SAMPLE_LENGTH);
    if (error !== null || pattern.length === 0)
        return { error, matches: [], sampleTruncated };

    const previewFlags = normaliseRegexFlags(flags).replace(/[gy]/g, "") + "g";
    const expression = new RegExp(pattern, previewFlags);
    const matches: RegexMatch[] = [];
    let result: RegExpExecArray | null;
    while ((result = expression.exec(boundedSample)) !== null && matches.length < MAX_REGEX_MATCHES) {
        const groups = result.slice(1).map((group, index) => `${index + 1}: ${group ?? ""}`);
        if (result.groups)
            for (const [name, value] of Object.entries(result.groups))
                groups.push(`${name}: ${value ?? ""}`);
        matches.push({ text: result[0], index: result.index, groups });
        // `exec()` does not advance in every engine for a zero-width global match.
        if (result.index === expression.lastIndex) expression.lastIndex++;
    }
    return { error: null, matches, sampleTruncated };
}

function escapeRegexLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

const SHELL_CONTRAST = `.bm-m3-shell[data-theme="contrast"]{color:${CONTRAST_SCHEME["on-surface"]};${schemeToCustomProperties(CONTRAST_SCHEME)}--bm-shadow:0 3px 12px ${CONTRAST_SCHEME.shadow}66;}`;

const STYLE = `
${SHELL_BASE}
${SHELL_DARK}
${SHELL_CONTRAST}
.bm-m3-appbar{position:absolute;z-index:20;inset:12px 12px auto 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;border-radius:24px;background:color-mix(in srgb,var(--bm-surface-container) 94%,transparent);box-shadow:var(--bm-shadow);backdrop-filter:blur(16px);}
.bm-m3-map-rail{display:flex;flex:0 0 auto}.bm-m3-rail-menu,.bm-m3-icon{display:grid;place-items:center;flex:0 0 48px;box-sizing:border-box;width:48px;height:48px;min-width:48px;min-height:48px;border:0;background:transparent;color:inherit;border-radius:50%;cursor:pointer;font-size:20px}.bm-m3-rail-menu:hover,.bm-m3-rail-menu:focus-visible,.bm-m3-icon:hover,.bm-m3-icon:focus-visible{background:var(--bm-surface-container-high);outline:2px solid var(--bm-primary);outline-offset:2px}
.bm-m3-brand-group{flex:1 1 10rem;min-width:0}.bm-m3-brand{overflow:hidden;font-weight:750;letter-spacing:.01em;text-overflow:ellipsis;white-space:nowrap}.bm-m3-subtitle{font-size:12px;opacity:.7}.bm-m3-search{box-sizing:border-box;flex:0 1 min(28vw,260px);min-width:10rem;min-height:48px;border:1px solid var(--bm-outline);border-radius:24px;padding:10px 14px;background:var(--bm-surface);color:inherit}.bm-m3-search:focus{outline:2px solid var(--bm-primary);border-color:transparent}
.bm-m3-coordinates{display:grid;grid-template-columns:repeat(2,minmax(68px,1fr));flex:0 1 160px;gap:4px;min-width:0}.bm-m3-coordinate{display:flex;align-items:center;min-height:48px;padding:0 10px;border:1px solid var(--bm-outline-variant);border-radius:12px;background:var(--bm-surface);font-family:ui-monospace,"Roboto Mono",monospace;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.bm-m3-menu{position:fixed;z-index:40;box-sizing:border-box;width:min(280px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow-y:auto;padding:8px;border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-menu[hidden],.bm-m3-map-menu[hidden],.bm-m3-settings[hidden]{display:none}.bm-m3-menu button,.bm-m3-map-menu button,.bm-m3-settings button{display:block;box-sizing:border-box;width:100%;min-height:48px;border:0;background:transparent;color:inherit;text-align:left;padding:11px 12px;border-radius:12px;cursor:pointer}.bm-m3-menu button:hover,.bm-m3-menu button:focus-visible,.bm-m3-map-menu button:hover,.bm-m3-map-menu button:focus-visible,.bm-m3-settings button:hover{background:var(--bm-surface-container-high);outline:0}
.bm-m3-map-menu{position:fixed;z-index:41;left:18px;top:76px;bottom:18px;display:flex;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);flex-direction:column;border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-map-menu__header{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 16px;border-bottom:1px solid var(--bm-surface-container)}.bm-m3-map-menu__header h2{flex:1;margin:0;font-size:18px}.bm-m3-map-menu__header button{width:auto;min-width:48px}.bm-m3-map-menu__body{overflow-y:auto;padding:8px}
.bm-m3-settings{position:fixed;z-index:42;right:18px;top:76px;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);overflow-y:auto;padding:16px;border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-settings h2{font-size:18px;margin:0 0 12px}.bm-m3-setting{display:grid;gap:6px;margin:12px 0}.bm-m3-setting select,.bm-m3-setting input[type=range]{width:100%;min-height:48px}.bm-m3-setting select{padding:9px;border-radius:10px;border:1px solid var(--bm-outline);background:var(--bm-surface);color:inherit}
.bm-m3-pin{position:fixed;z-index:25;transform:translate(-50%,-100%);padding:7px 10px;border-radius:12px;background:var(--bm-primary);color:var(--bm-on-primary);box-shadow:var(--bm-shadow);font-size:12px;pointer-events:none}.bm-m3-pin::after{content:"";position:absolute;left:50%;bottom:-7px;border:7px solid transparent;border-top-color:var(--bm-primary);border-bottom:0;transform:translateX(-50%)}
.bm-m3-toast{position:fixed;z-index:50;left:8px;bottom:8px;box-sizing:border-box;max-width:min(420px,calc(100vw - 16px));padding:12px 16px;border-radius:14px;background:var(--bm-surface-container);box-shadow:var(--bm-shadow);}
.bm-m3-shell[data-theme="contrast"] .bm-m3-appbar{background:var(--bm-surface);backdrop-filter:none}.bm-m3-subtitle{color:var(--bm-on-surface-variant);opacity:1}.bm-m3-search-wrap{display:flex;align-items:stretch;flex:0 1 min(32vw,340px);min-width:13rem}.bm-m3-search-wrap .bm-m3-search{flex:1 1 auto;min-width:0;border-radius:24px 0 0 24px}.bm-m3-regex-button{display:grid;place-items:center;min-width:48px;min-height:48px;border:1px solid var(--bm-outline);border-left:0;background:var(--bm-surface);color:var(--bm-on-surface);cursor:pointer}.bm-m3-regex-button:last-child{border-radius:0 24px 24px 0}.bm-m3-regex-button:focus-visible,.bm-m3-regex-button[aria-pressed="true"]{outline:2px solid var(--bm-primary);outline-offset:-2px;background:var(--bm-primary-container);color:var(--bm-on-primary-container)}.bm-m3-search-results{position:fixed;z-index:43;top:76px;right:12px;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 96px);overflow-y:auto;padding:8px;border:1px solid var(--bm-outline-variant);border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-search-results[hidden],.bm-m3-regex-builder[hidden],.bm-m3-command-palette[hidden]{display:none}.bm-m3-search-results__summary{margin:4px 8px 8px;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-search-results button{display:block;box-sizing:border-box;width:100%;min-height:48px;border:0;border-radius:12px;background:transparent;color:var(--bm-on-surface);cursor:pointer;text-align:left;padding:11px 12px}.bm-m3-search-results button:hover,.bm-m3-search-results button:focus-visible{background:var(--bm-surface-container-high);outline:2px solid var(--bm-primary);outline-offset:-2px}.bm-m3-regex-builder{position:fixed;z-index:44;top:76px;right:12px;box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 96px);overflow-y:auto;padding:16px;border:1px solid var(--bm-outline-variant);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-regex-builder h3{margin:0 0 6px}.bm-m3-regex-builder p{margin:0 0 12px;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-regex-builder label,.bm-m3-regex-builder legend{display:block;color:var(--bm-on-surface);font-size:13px}.bm-m3-regex-builder textarea{box-sizing:border-box;width:100%;min-height:72px;margin:4px 0 10px;padding:8px;border:1px solid var(--bm-outline);border-radius:12px;background:var(--bm-surface-container-low);color:var(--bm-on-surface);font:inherit}.bm-m3-regex-builder fieldset{margin:0 0 10px;border:0;padding:0}.bm-m3-regex-builder__flags{display:flex;flex-wrap:wrap;gap:8px}.bm-m3-regex-builder__tokens{display:flex;flex-wrap:wrap;gap:6px}.bm-m3-regex-builder button{min-height:40px;border:1px solid var(--bm-outline-variant);border-radius:20px;background:var(--bm-surface-container);color:var(--bm-on-surface);cursor:pointer;padding:6px 10px}.bm-m3-regex-builder button:hover,.bm-m3-regex-builder button:focus-visible{background:var(--bm-primary-container);color:var(--bm-on-primary-container);outline:2px solid var(--bm-primary);outline-offset:2px}.bm-m3-regex-builder__feedback{margin:8px 0;white-space:pre-wrap;color:var(--bm-on-surface-variant)}.bm-m3-regex-builder__feedback[data-state="error"]{color:var(--bm-error)}.bm-m3-regex-builder__actions{display:flex;flex-wrap:wrap;gap:8px}.bm-m3-command-palette{position:fixed;z-index:45;inset:0;display:grid;place-items:start center;box-sizing:border-box;padding:clamp(8px,10dvh,80px) 12px 12px;background:color-mix(in srgb,var(--bm-scrim) 48%,transparent)}.bm-m3-command-palette__card{box-sizing:border-box;width:min(680px,100%);max-height:calc(100dvh - 24px);overflow-y:auto;padding:20px;border:1px solid var(--bm-outline-variant);border-radius:28px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-command-palette__heading{display:flex;align-items:center;gap:8px;margin-bottom:12px}.bm-m3-command-palette__heading h2{flex:1;margin:0;font-size:22px}.bm-m3-command-palette__heading button{min-width:48px;min-height:48px;border:0;border-radius:50%;background:transparent;color:var(--bm-on-surface);cursor:pointer}.bm-m3-command-palette .bm-m3-search-wrap{width:100%;max-width:none}.bm-m3-command-palette .bm-m3-search-results{position:static;width:auto;max-height:none;margin-top:8px;box-shadow:none}.bm-m3-command-palette .bm-m3-regex-builder{position:static;width:auto;max-height:none;margin-top:8px;box-shadow:none}
@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px){.bm-m3-control-bar{inset:8px 8px auto 8px;display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:8px;padding:8px;border-radius:20px}.bm-m3-map-rail{grid-column:1}.bm-m3-brand-group{grid-column:2}.bm-m3-subtitle,.bm-m3-command{display:none}.bm-m3-settings-control{grid-column:3}.bm-m3-search{grid-column:1/-1;width:100%;min-width:0}.bm-m3-coordinates{grid-column:1/-1;width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}.bm-m3-map-menu{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-width:none;max-height:min(70dvh,calc(100dvh - 16px));border-radius:24px 24px 16px 16px}.bm-m3-settings{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:calc(100dvh - 16px)}}
@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px){.bm-m3-search-wrap{grid-column:1/-1;width:100%;min-width:0}.bm-m3-search-wrap .bm-m3-search{width:0}.bm-m3-search-results[data-search-results="map-controls"],.bm-m3-regex-builder[data-search-scope="map-controls"]{top:166px;right:8px;left:8px;width:auto;max-height:calc(100dvh - 174px)}.bm-m3-command-palette{padding:8px}.bm-m3-command-palette__card{border-radius:20px}}
`;

export class MaterialShell {
    readonly root: HTMLElement;
    private readonly presentationPolicy: ViewerPresentationPolicy;
    private readonly menu: HTMLDivElement;
    private readonly mapMenu: HTMLElement;
    private readonly mapMenuButton: HTMLButtonElement;
    private readonly settings: HTMLDivElement;
    private readonly search: HTMLInputElement;
    private readonly mapSearch: SearchScope;
    private readonly commandPalette: HTMLElement;
    private readonly commandSearch: SearchScope;
    private readonly commandPaletteButton: HTMLButtonElement;
    private readonly coordinates: HTMLDivElement;
    private readonly pinsLayer: HTMLDivElement;
    private pins: Pin[] = [];
    private pinCounter = 0;
    private toastTimer: number | undefined;
    /** The canvas that asked for keyboard terrain actions, restored on Escape. */
    private contextMenuInvoker: HTMLElement | null = null;
    /** The exact palette opener, restored when the command card closes. */
    private commandPaletteInvoker: HTMLElement | null = null;

    constructor(root: Element, presentationPolicy = new ViewerPresentationPolicy()) {
        this.root = root as HTMLElement;
        this.presentationPolicy = presentationPolicy;
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
        bar.innerHTML = `<nav class="bm-m3-map-rail" aria-label="Map navigation"><button class="bm-m3-rail-menu" type="button" data-action="map-menu" aria-label="Open map menu" aria-controls="bm-m3-map-menu" aria-expanded="false" title="Open map menu">☰</button></nav><div class="bm-m3-brand-group"><div class="bm-m3-brand">BlueMap</div><div class="bm-m3-subtitle">Material map server</div></div><div class="bm-m3-search-wrap" role="search" data-search-scope="map-controls"><input class="bm-m3-search" type="search" aria-label="Search map controls" placeholder="Search controls…" autocomplete="off" spellcheck="false"><button class="bm-m3-regex-button" type="button" data-search-action="toggle-regex" aria-label="Search with a regular expression" aria-pressed="false">Regex</button><button class="bm-m3-regex-button" type="button" data-search-action="builder" aria-label="Open the regex builder for map controls" aria-expanded="false">.*</button></div><div class="bm-m3-coordinates" role="status" aria-label="Current map coordinates"><output class="bm-m3-coordinate" data-coordinate="x" aria-label="Current X coordinate: unavailable">x —</output><output class="bm-m3-coordinate" data-coordinate="z" aria-label="Current Z coordinate: unavailable">z —</output></div><button class="bm-m3-icon bm-m3-settings-control" type="button" data-action="settings" aria-label="Open settings">⚙</button><button class="bm-m3-icon bm-m3-command" type="button" data-action="command" aria-label="Open command palette" title="Ctrl+Shift+F">⌘</button>`;
        this.root.appendChild(bar);
        this.mapMenuButton = bar.querySelector<HTMLButtonElement>('[data-action="map-menu"]')!;
        this.commandPaletteButton = bar.querySelector<HTMLButtonElement>('[data-action="command"]')!;
        this.search = bar.querySelector<HTMLInputElement>("input")!;
        this.coordinates = bar.querySelector<HTMLDivElement>(".bm-m3-coordinates")!;
        const mapSearchResults = document.createElement("section");
        mapSearchResults.className = "bm-m3-search-results";
        mapSearchResults.dataset.searchResults = "map-controls";
        mapSearchResults.setAttribute("aria-label", "Map control search results");
        mapSearchResults.hidden = true;
        this.root.appendChild(mapSearchResults);
        this.mapSearch = this.createSearchScope("map-controls", bar, mapSearchResults);
        const settingsButton = bar.querySelector<HTMLButtonElement>('[data-action="settings"]')!;
        settingsButton.addEventListener(
            "click",
            () => (this.settings.hidden = !this.settings.hidden),
        );
        this.mapMenuButton.addEventListener("click", () => this.toggleMapMenu());

        this.menu = document.createElement("div");
        this.menu.className = "bm-m3-menu";
        this.menu.hidden = true;
        this.menu.setAttribute("role", "menu");
        this.menu.setAttribute("aria-label", "Terrain actions");
        this.menu.innerHTML = `<button type="button" role="menuitem" data-action="pin">📍 Add pinpoint here</button><button type="button" role="menuitem" data-action="copy">Copy coordinates</button><button type="button" role="menuitem" data-action="cancel">Cancel</button>`;
        this.root.appendChild(this.menu);
        this.menu.addEventListener("click", (event) => this.handleMenuClick(event));
        this.menu.addEventListener("keydown", this.handleContextMenuKeydown);

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
        this.settings.innerHTML = `<h2>Map appearance</h2><div class="bm-m3-setting"><label for="bm-theme">Theme</label><select id="bm-theme"><option value="light">Light</option><option value="dark">Dark</option><option value="contrast">Contrast</option></select></div><div class="bm-m3-setting"><label for="bm-density">Density</label><input id="bm-density" type="range" min="1" max="5" value="3"><small>Controls spacing without changing map data.</small></div><div data-message-style-slot></div>`;
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
        this.refreshPresentation();

        this.commandPalette = document.createElement("section");
        this.commandPalette.className = "bm-m3-command-palette";
        this.commandPalette.hidden = true;
        this.commandPalette.innerHTML = `<div class="bm-m3-command-palette__card" role="dialog" aria-modal="true" aria-label="Command palette"><div class="bm-m3-command-palette__heading"><h2>Command palette</h2><button type="button" data-command-action="close" aria-label="Close command palette">Close</button></div><p>Type a map command, then choose the real control to run. Ctrl+Shift+F opens this palette.</p><div class="bm-m3-search-wrap" role="search" data-search-scope="command-palette"><input class="bm-m3-search" type="search" aria-label="Search commands" placeholder="Search commands…" autocomplete="off" spellcheck="false"><button class="bm-m3-regex-button" type="button" data-search-action="toggle-regex" aria-label="Search commands with a regular expression" aria-pressed="false">Regex</button><button class="bm-m3-regex-button" type="button" data-search-action="builder" aria-label="Open the regex builder for commands" aria-expanded="false">.*</button></div><section class="bm-m3-search-results" data-search-results="command-palette" aria-label="Command results"></section></div>`;
        this.root.appendChild(this.commandPalette);
        const commandSearchResults = this.commandPalette.querySelector<HTMLElement>(
            '[data-search-results="command-palette"]',
        )!;
        this.commandSearch = this.createSearchScope(
            "command-palette",
            this.commandPalette,
            commandSearchResults,
        );
        this.commandPaletteButton.addEventListener("click", () =>
            this.openCommandPalette(this.commandPaletteButton),
        );
        this.commandPalette.addEventListener("click", (event) => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset
                .commandAction;
            if (action === "close") this.closeCommandPalette();
        });

        this.pinsLayer = document.createElement("div");
        this.pinsLayer.setAttribute("aria-label", "Saved pinpoints");
        this.root.appendChild(this.pinsLayer);
        this.renderPins();
        this.setTheme(localStorage.getItem("bluemap-theme") || "dark");
        this.syncViewportLayout();
        document.addEventListener("click", this.dismiss);
        document.addEventListener("keydown", this.dismissMapMenuWithEscape);
        document.addEventListener("keydown", this.dismissContextMenuWithEscape);
        document.addEventListener("keydown", this.handleGlobalShortcut);
        window.addEventListener("resize", this.syncViewportLayout);
    }

    /** Re-renders host-restricted controls without coupling this standalone shell to a UI package. */
    refreshPresentation(): void {
        const funnyLevel = this.presentationPolicy.effectiveFunnyLevel(this.readFunnyLevel());
        this.root.dataset.funnyLevel = String(funnyLevel);
        this.renderMessageStyleControl();
    }

    private readFunnyLevel(): number {
        const parsed = Number.parseInt(localStorage.getItem("bluemap-funny-level-en") ?? "2", 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 2;
    }

    /**
     * Removes the control rather than disabling it while the host restricts language and tone.
     * The raw value is left in the existing storage key so it comes back when the policy ends.
     */
    private renderMessageStyleControl(): void {
        const slot = this.settings.querySelector<HTMLElement>("[data-message-style-slot]")!;
        slot.replaceChildren();
        if (this.presentationPolicy.languageAndToneRestricted) return;

        const setting = document.createElement("div");
        setting.className = "bm-m3-setting";
        const label = document.createElement("label");
        label.htmlFor = "bm-funny";
        label.textContent = "Message style";
        const input = document.createElement("input");
        input.id = "bm-funny";
        input.type = "range";
        input.min = "1";
        input.max = "5";
        input.value = String(this.readFunnyLevel());
        const detail = document.createElement("small");
        detail.textContent = "Styles notifications only; facts stay exact.";
        input.addEventListener("input", () => {
            const level = this.presentationPolicy.effectiveFunnyLevel(Number(input.value));
            input.value = String(level);
            this.root.dataset.funnyLevel = String(level);
            localStorage.setItem("bluemap-funny-level-en", String(level));
        });
        setting.append(label, input, detail);
        slot.appendChild(setting);
    }

    private createSearchScope(
        name: SearchScopeName,
        host: ParentNode,
        results: HTMLElement,
    ): SearchScope {
        const scopeElement = host.querySelector<HTMLElement>(
            '[data-search-scope="' + name + '"]',
        )!;
        const input = scopeElement.querySelector<HTMLInputElement>(".bm-m3-search")!;
        const regexToggle = scopeElement.querySelector<HTMLButtonElement>(
            '[data-search-action="toggle-regex"]',
        )!;
        const builderToggle = scopeElement.querySelector<HTMLButtonElement>(
            '[data-search-action="builder"]',
        )!;
        const builder = this.createRegexBuilder(name);
        const builderHost =
            name === "command-palette"
                ? host.querySelector<HTMLElement>(".bm-m3-command-palette__card")!
                : this.root;
        builderHost.appendChild(builder);
        const scope: SearchScope = {
            name,
            input,
            regexToggle,
            builderToggle,
            builder,
            results,
            regex: false,
            flags: "i",
            sample: this.searchableActionText(),
        };

        input.addEventListener("input", () => this.syncSearchScope(scope));
        input.addEventListener("keydown", (event) => this.handleSearchInputKeydown(event, scope));
        regexToggle.addEventListener("click", () => this.toggleRegex(scope));
        builderToggle.addEventListener("click", () => this.toggleRegexBuilder(scope));
        results.addEventListener("click", (event) => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>(
                "[data-search-result]",
            )?.dataset.searchResult as SearchActionId | undefined;
            if (action !== undefined) this.activateSearchAction(action);
        });
        builder.addEventListener("input", (event) => this.handleRegexBuilderInput(event, scope));
        builder.addEventListener("change", (event) => this.handleRegexBuilderInput(event, scope));
        builder.addEventListener("click", (event) => this.handleRegexBuilderClick(event, scope));
        builder.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                this.closeRegexBuilder(scope);
            }
        });

        this.syncSearchScope(scope);
        return scope;
    }

    private createRegexBuilder(name: SearchScopeName): HTMLElement {
        const builder = document.createElement("section");
        builder.className = "bm-m3-regex-builder";
        builder.dataset.searchScope = name;
        builder.setAttribute("role", "dialog");
        builder.setAttribute("aria-label", "Regex builder");
        builder.hidden = true;
        const flags = REGEX_FLAGS.map(
            (flag) =>
                '<label><input type="checkbox" data-regex-flag="' +
                flag +
                '" value="' +
                flag +
                '"> ' +
                flag +
                "</label>",
        ).join("");
        const tokens = REGEX_TOKENS.map(
            (token, index) =>
                '<button type="button" data-regex-token="' +
                index +
                '" title="' +
                token.hint +
                '" aria-label="' +
                token.label +
                ": " +
                token.hint +
                '">' +
                token.label +
                "</button>",
        ).join("");
        builder.innerHTML =
            "<h3>Regex builder</h3>" +
            "<p>ECMAScript RegExp runs locally against this search. Pattern " +
            MAX_REGEX_PATTERN_LENGTH +
            " characters; sample " +
            MAX_REGEX_SAMPLE_LENGTH +
            " characters.</p>" +
            '<label>Pattern<textarea data-regex-pattern rows="2" maxlength="' +
            MAX_REGEX_PATTERN_LENGTH +
            '" spellcheck="false"></textarea></label>' +
            '<fieldset><legend>Flags</legend><div class="bm-m3-regex-builder__flags">' +
            flags +
            "</div></fieldset>" +
            '<fieldset><legend>Build pattern</legend><div class="bm-m3-regex-builder__tokens">' +
            tokens +
            '<button type="button" data-regex-action="escape">Escape literal</button></div></fieldset>' +
            '<label>Sample text<textarea data-regex-sample rows="3" maxlength="' +
            MAX_REGEX_SAMPLE_LENGTH +
            '" spellcheck="false"></textarea></label>' +
            '<output class="bm-m3-regex-builder__feedback" data-regex-feedback aria-live="polite"></output>' +
            '<p data-regex-copy-status aria-live="polite"></p>' +
            '<div class="bm-m3-regex-builder__actions"><button type="button" data-regex-action="copy">Copy pattern</button><button type="button" data-regex-action="export">Export pattern</button><button type="button" data-regex-action="close">Close</button></div>';
        return builder;
    }

    private readonly searchActions = (): readonly {
        readonly id: SearchActionId;
        readonly label: string;
        readonly keywords: string;
    }[] => [
        {
            id: "map-menu",
            label: "Open map menu",
            keywords: "navigation control layers markers map",
        },
        {
            id: "appearance",
            label: "Open map appearance",
            keywords: "settings theme light dark contrast density",
        },
        {
            id: "command-palette",
            label: "Open command palette",
            keywords: "commands keyboard Ctrl Shift F",
        },
        {
            id: "map-search",
            label: "Focus map control search",
            keywords: "find search controls regex",
        },
    ];

    private searchableActionText(): string {
        return this.searchActions()
            .map((action) => action.label + "\n" + action.keywords)
            .join("\n");
    }

    private syncSearchScope(scope: SearchScope): void {
        const pattern = scope.input.value.slice(0, MAX_REGEX_PATTERN_LENGTH);
        if (scope.input.value !== pattern) scope.input.value = pattern;
        scope.regexToggle.setAttribute("aria-pressed", String(scope.regex));
        scope.regexToggle.setAttribute(
            "aria-label",
            scope.regex
                ? "Search plain text instead of a regular expression"
                : "Search with a regular expression",
        );
        const patternField = scope.builder.querySelector<HTMLTextAreaElement>(
            "[data-regex-pattern]",
        )!;
        if (patternField.value !== pattern) patternField.value = pattern;
        for (const flag of REGEX_FLAGS) {
            const field = scope.builder.querySelector<HTMLInputElement>(
                '[data-regex-flag="' + flag + '"]',
            )!;
            field.checked = scope.flags.includes(flag);
        }
        const sampleField = scope.builder.querySelector<HTMLTextAreaElement>(
            "[data-regex-sample]",
        )!;
        if (sampleField.value !== scope.sample) sampleField.value = scope.sample;
        this.renderRegexFeedback(scope);
        this.renderSearchResults(scope);
    }

    private toggleRegex(scope: SearchScope): void {
        scope.regex = !scope.regex;
        if (!scope.regex) this.closeRegexBuilder(scope, false);
        this.syncSearchScope(scope);
        scope.input.focus();
    }

    private toggleRegexBuilder(scope: SearchScope): void {
        if (scope.builder.hidden) {
            scope.builder.hidden = false;
            scope.builderToggle.setAttribute("aria-expanded", "true");
            scope.builder.querySelector<HTMLTextAreaElement>("[data-regex-pattern]")!.focus();
            return;
        }
        this.closeRegexBuilder(scope);
    }

    private closeRegexBuilder(scope: SearchScope, restoreFocus = true): void {
        if (scope.builder.hidden) return;
        scope.builder.hidden = true;
        scope.builderToggle.setAttribute("aria-expanded", "false");
        if (restoreFocus) scope.input.focus();
    }

    private handleSearchInputKeydown(event: KeyboardEvent, scope: SearchScope): void {
        if (event.key === "ArrowDown") {
            const first = scope.results.querySelector<HTMLButtonElement>("[data-search-result]");
            if (first) {
                event.preventDefault();
                first.focus();
            }
            return;
        }
        if (event.key !== "Enter") return;
        const first = scope.results.querySelector<HTMLButtonElement>("[data-search-result]");
        if (first) {
            event.preventDefault();
            first.click();
        }
    }

    private handleRegexBuilderInput(event: Event, scope: SearchScope): void {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        if (target.matches("[data-regex-pattern]")) {
            scope.input.value = target.value.slice(0, MAX_REGEX_PATTERN_LENGTH);
            scope.regex = true;
            this.syncSearchScope(scope);
            return;
        }
        if (target.matches("[data-regex-sample]")) {
            scope.sample = target.value.slice(0, MAX_REGEX_SAMPLE_LENGTH);
            this.renderRegexFeedback(scope);
            return;
        }
        if (target.matches("[data-regex-flag]")) {
            scope.flags = REGEX_FLAGS.filter((flag) =>
                scope.builder.querySelector<HTMLInputElement>(
                    '[data-regex-flag="' + flag + '"]',
                )!.checked,
            ).join("");
            scope.regex = true;
            this.syncSearchScope(scope);
        }
    }

    private handleRegexBuilderClick(event: Event, scope: SearchScope): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
        if (!button) return;
        const tokenIndex = button.dataset.regexToken;
        if (tokenIndex !== undefined) {
            const token = REGEX_TOKENS[Number(tokenIndex)];
            if (token !== undefined) this.insertRegexToken(scope, token.before, token.after ?? "");
            return;
        }
        switch (button.dataset.regexAction) {
            case "escape":
                this.escapeRegexSelection(scope);
                break;
            case "copy":
                this.copyRegexPattern(scope);
                break;
            case "export":
                this.exportRegexPattern(scope);
                break;
            case "close":
                this.closeRegexBuilder(scope);
                break;
        }
    }

    private insertRegexToken(scope: SearchScope, before: string, after: string): void {
        const field = scope.builder.querySelector<HTMLTextAreaElement>("[data-regex-pattern]")!;
        const pattern = scope.input.value;
        const start = field.selectionStart ?? pattern.length;
        const end = field.selectionEnd ?? start;
        const next =
            pattern.slice(0, start) + before + pattern.slice(start, end) + after + pattern.slice(end);
        scope.input.value = next.slice(0, MAX_REGEX_PATTERN_LENGTH);
        scope.regex = true;
        this.syncSearchScope(scope);
        const caret = Math.min(start + before.length + (end - start), scope.input.value.length);
        field.focus();
        field.setSelectionRange(caret, caret);
    }

    private escapeRegexSelection(scope: SearchScope): void {
        const field = scope.builder.querySelector<HTMLTextAreaElement>("[data-regex-pattern]")!;
        const pattern = scope.input.value;
        const start = field.selectionStart ?? 0;
        const end = field.selectionEnd ?? pattern.length;
        const selected = pattern.slice(start, end);
        const escaped = escapeRegexLiteral(selected.length > 0 ? selected : pattern);
        scope.input.value =
            selected.length > 0
                ? (pattern.slice(0, start) + escaped + pattern.slice(end)).slice(
                      0,
                      MAX_REGEX_PATTERN_LENGTH,
                  )
                : escaped.slice(0, MAX_REGEX_PATTERN_LENGTH);
        scope.regex = true;
        this.syncSearchScope(scope);
        field.focus();
    }

    private renderRegexFeedback(scope: SearchScope): void {
        const feedback = scope.builder.querySelector<HTMLOutputElement>(
            "[data-regex-feedback]",
        )!;
        const preview = previewRegex(scope.input.value, scope.flags, scope.sample);
        feedback.dataset.state = preview.error === null ? "ready" : "error";
        if (preview.error !== null) {
            feedback.textContent = "Pattern error: " + preview.error;
            return;
        }
        if (scope.input.value.length === 0) {
            feedback.textContent = "No pattern yet. Plain-text search remains the default.";
            return;
        }
        const captureLines = preview.matches
            .map((match) =>
                match.groups.length > 0
                    ? "“" +
                      match.text +
                      "” at " +
                      match.index +
                      "; " +
                      match.groups.join(", ")
                    : "“" + match.text + "” at " + match.index,
            )
            .join("\n");
        feedback.textContent =
            preview.matches.length +
            " live match" +
            (preview.matches.length === 1 ? "" : "es") +
            "." +
            (preview.sampleTruncated
                ? " Sample limited to " + MAX_REGEX_SAMPLE_LENGTH + " characters."
                : "") +
            (captureLines ? "\n" + captureLines : "");
    }

    private renderSearchResults(scope: SearchScope): void {
        const query = scope.input.value.trim();
        const error = scope.regex && query ? regexError(query, scope.flags) : null;
        const shouldShow = scope.name === "command-palette" || query.length > 0;
        scope.results.hidden = !shouldShow;
        scope.results.replaceChildren();
        if (!shouldShow) return;

        const summary = document.createElement("p");
        summary.className = "bm-m3-search-results__summary";
        if (error !== null) {
            summary.textContent = "Pattern error: " + error;
            summary.setAttribute("role", "alert");
            scope.results.appendChild(summary);
            return;
        }

        const actions = this.searchActions().filter((action) => {
            const searchable = action.label + " " + action.keywords;
            if (query.length === 0) return true;
            if (!scope.regex) return searchable.toLocaleLowerCase().includes(query.toLocaleLowerCase());
            const expression = new RegExp(
                query,
                normaliseRegexFlags(scope.flags).replace(/[gy]/g, ""),
            );
            return expression.test(searchable);
        });
        summary.textContent =
            actions.length +
            " control" +
            (actions.length === 1 ? "" : "s") +
            (scope.regex
                ? " match this regular expression."
                : " match this plain-text search.");
        scope.results.appendChild(summary);
        for (const action of actions) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.searchResult = action.id;
            button.textContent = action.label;
            scope.results.appendChild(button);
        }
    }

    private activateSearchAction(action: SearchActionId): void {
        if (action !== "command-palette") this.closeCommandPalette(false);
        this.mapSearch.results.hidden = true;
        switch (action) {
            case "map-menu":
                this.settings.hidden = true;
                this.mapMenu.hidden = false;
                this.mapMenuButton.setAttribute("aria-expanded", "true");
                this.mapMenuButton.focus();
                break;
            case "appearance":
                this.closeMapMenu();
                this.settings.hidden = false;
                this.settings.querySelector<HTMLSelectElement>("#bm-theme")!.focus();
                break;
            case "command-palette":
                this.openCommandPalette(this.search);
                break;
            case "map-search":
                this.search.focus();
                break;
        }
    }

    private openCommandPalette(invoker: HTMLElement): void {
        this.closeMapMenu();
        this.settings.hidden = true;
        this.mapSearch.results.hidden = true;
        this.closeRegexBuilder(this.mapSearch, false);
        this.commandPaletteInvoker = invoker;
        this.commandPalette.hidden = false;
        this.renderSearchResults(this.commandSearch);
        this.commandSearch.input.focus();
    }

    private closeCommandPalette(restoreFocus = true): void {
        if (this.commandPalette.hidden) return;
        this.commandPalette.hidden = true;
        this.closeRegexBuilder(this.commandSearch, false);
        if (restoreFocus) this.commandPaletteInvoker?.focus();
        this.commandPaletteInvoker = null;
    }

    private copyRegexPattern(scope: SearchScope): void {
        const status = scope.builder.querySelector<HTMLElement>("[data-regex-copy-status]")!;
        if (!navigator.clipboard?.writeText) {
            status.textContent = "Clipboard access is unavailable in this browser.";
            return;
        }
        void navigator.clipboard
            .writeText("/" + scope.input.value + "/" + scope.flags)
            .then(() => (status.textContent = "Pattern copied."))
            .catch(() => (status.textContent = "Could not copy the pattern."));
    }

    private exportRegexPattern(scope: SearchScope): void {
        const status = scope.builder.querySelector<HTMLElement>("[data-regex-copy-status]")!;
        if (typeof URL.createObjectURL !== "function") {
            status.textContent = "Download export is unavailable in this browser.";
            return;
        }
        const payload = JSON.stringify(
            {
                version: 1,
                engine: "ECMAScript RegExp",
                pattern: scope.input.value,
                flags: scope.flags,
                sample: scope.sample,
            },
            null,
            2,
        );
        const link = document.createElement("a");
        const href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
        link.href = href;
        link.download = "bluemap-regex.json";
        link.click();
        URL.revokeObjectURL(href);
        status.textContent = "Pattern export started.";
    }

    private readonly handleGlobalShortcut = (event: KeyboardEvent): void => {
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f") {
            event.preventDefault();
            const active = document.activeElement;
            this.openCommandPalette(
                active instanceof HTMLElement ? active : this.commandPaletteButton,
            );
            return;
        }
        if (event.key !== "Escape") return;
        if (!this.commandPalette.hidden) {
            event.preventDefault();
            this.closeCommandPalette();
            return;
        }
        if (!this.mapSearch.builder.hidden) {
            event.preventDefault();
            this.closeRegexBuilder(this.mapSearch);
        }
    };

    private readonly dismiss = (event: MouseEvent): void => {
        if (!this.menu.contains(event.target as Node)) this.closeContextMenu();
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

    private readonly dismissContextMenuWithEscape = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || this.menu.hidden) return;
        this.closeContextMenu();
    };

    private readonly handleContextMenuKeydown = (event: KeyboardEvent): void => {
        const actions = [...this.menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
        const current = actions.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeContextMenu();
            return;
        }
        if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            actions.at(event.key === "Home" ? 0 : -1)?.focus();
            return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const next = (current + direction + actions.length) % actions.length;
        actions.at(next)?.focus();
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
            this.openCommandPalette(this.mapMenuButton);
        }
    }

    openContextMenu(
        detail: MapInteractionEventDetail,
        screenX: number,
        screenY: number,
        contextMenuInvoker: HTMLElement | null = null,
    ): void {
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
        this.contextMenuInvoker = contextMenuInvoker;
        if (contextMenuInvoker !== null)
            this.menu.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
    }

    private handleMenuClick(event: Event): void {
        const action = (event.target as HTMLElement).dataset.action;
        if (action === "cancel") this.closeContextMenu();
        if (action === "copy") {
            const coords = `${this.menu.dataset.x}, ${this.menu.dataset.y}, ${this.menu.dataset.z}`;
            void navigator.clipboard?.writeText(coords);
            this.showToast(`Coordinates copied: ${coords}`);
            this.closeContextMenu();
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
            this.closeContextMenu();
        }
    }

    private closeContextMenu(): void {
        this.menu.hidden = true;
        this.contextMenuInvoker?.focus();
        this.contextMenuInvoker = null;
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
        const selectedTheme: ThemeName =
            theme === "light" || theme === "contrast" ? theme : "dark";
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
