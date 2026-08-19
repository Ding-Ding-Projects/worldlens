import {
    CONTRAST_SCHEME,
    DARK_SCHEME,
    LIGHT_SCHEME,
    schemeToCustomProperties,
} from "@worldlens/shared";
import type { MapInteractionEventDetail } from "./MapViewer";
import { MeasurementWaypointModel, measurementValue, type MeasurementKind, type MeasurementWaypointScope } from "./measurementWaypointModel";
import {
    materialShellCopy,
    type MaterialShellCopyKey,
    type MaterialShellCopyValues,
} from "./materialShellPresentation";
import {
    normaliseViewerLanguageMode,
    ViewerPresentationPolicy,
    type ViewerLanguageMode,
    type ViewerPresentationLanguage,
} from "./presentationPolicy";

type ThemeName = "dark" | "light" | "contrast";
type SearchScopeName = "map-controls" | "command-palette";
type SearchActionId =
    "map-menu" | "appearance" | "command-palette" | "map-search" | "notification-history" | "measurement-tools";

type ViewerNoticeLevel = "status" | "alert";

type ViewerNotice = {
    readonly id: number;
    readonly messageKey: MaterialShellCopyKey;
    readonly values: MaterialShellCopyValues;
    readonly createdAt: string;
    readonly level: ViewerNoticeLevel;
};

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
    readonly copyKey: MaterialShellCopyKey;
};

const REGEX_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
const MAX_REGEX_PATTERN_LENGTH = 512;
const MAX_REGEX_SAMPLE_LENGTH = 4_000;
const MAX_REGEX_MATCHES = 40;
const NOTICE_HISTORY_LIMIT = 50;
const PRESENTATION_LANGUAGE_STORAGE_KEY = "bluemap-presentation-language-mode";
const FUNNY_LEVEL_STORAGE_KEY: Readonly<Record<ViewerPresentationLanguage, string>> = {
    en: "bluemap-funny-level-en",
    yue: "bluemap-funny-level-yue",
};

const REGEX_TOKENS: readonly RegexToken[] = [
    { label: "[abc]", before: "[", after: "]", copyKey: "characterClass" },
    { label: "^", before: "^", copyKey: "startAnchor" },
    { label: "( )", before: "(", after: ")", copyKey: "capturingGroup" },
    { label: "|", before: "|", copyKey: "alternation" },
    { label: "+", before: "+", copyKey: "oneOrMore" },
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
    if (error !== null || pattern.length === 0) return { error, matches: [], sampleTruncated };

    const previewFlags = normaliseRegexFlags(flags).replace(/[gy]/g, "") + "g";
    const expression = new RegExp(pattern, previewFlags);
    const matches: RegexMatch[] = [];
    let result: RegExpExecArray | null;
    while (
        (result = expression.exec(boundedSample)) !== null &&
        matches.length < MAX_REGEX_MATCHES
    ) {
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
.bm-m3-menu{position:fixed;z-index:40;box-sizing:border-box;width:min(280px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow-y:auto;padding:8px;border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-menu[hidden],.bm-m3-map-menu[hidden],.bm-m3-settings[hidden],.bm-m3-notification-history[hidden]{display:none}.bm-m3-menu button,.bm-m3-map-menu button,.bm-m3-settings button,.bm-m3-notification-history button{display:block;box-sizing:border-box;width:100%;min-height:48px;border:0;background:transparent;color:inherit;text-align:left;padding:11px 12px;border-radius:12px;cursor:pointer}.bm-m3-menu button:hover,.bm-m3-menu button:focus-visible,.bm-m3-map-menu button:hover,.bm-m3-map-menu button:focus-visible,.bm-m3-settings button:hover,.bm-m3-settings button:focus-visible,.bm-m3-notification-history button:hover,.bm-m3-notification-history button:focus-visible{background:var(--bm-surface-container-high);outline:2px solid var(--bm-primary);outline-offset:-2px}
.bm-m3-map-menu{position:fixed;z-index:41;left:18px;top:76px;bottom:18px;display:flex;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);flex-direction:column;border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-map-menu__header{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 16px;border-bottom:1px solid var(--bm-surface-container)}.bm-m3-map-menu__header h2{flex:1;margin:0;font-size:18px}.bm-m3-map-menu__header button{width:auto;min-width:48px}.bm-m3-map-menu__body{overflow-y:auto;padding:8px}
.bm-m3-tools{position:fixed;z-index:42;right:18px;top:76px;box-sizing:border-box;width:min(460px,calc(100vw - 36px));max-height:calc(100dvh - 94px);overflow-y:auto;padding:16px;border:1px solid var(--bm-outline-variant);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-tools[hidden]{display:none}.bm-m3-tools__header,.bm-m3-tools__actions,.bm-m3-tools__tabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bm-m3-tools__header h2{flex:1;margin:0}.bm-m3-tools__tabs button[aria-selected=true]{background:var(--bm-primary-container);color:var(--bm-on-primary-container)}.bm-m3-tools button,.bm-m3-tools input,.bm-m3-tools select{min-height:44px}.bm-m3-tools button{border:1px solid var(--bm-outline-variant);border-radius:12px;background:var(--bm-surface-container);color:inherit;padding:8px 12px;cursor:pointer}.bm-m3-tools button:focus-visible,.bm-m3-tools input:focus-visible,.bm-m3-tools select:focus-visible{outline:2px solid var(--bm-primary);outline-offset:2px}.bm-m3-tools input,.bm-m3-tools select{box-sizing:border-box;border:1px solid var(--bm-outline);border-radius:10px;background:var(--bm-surface);color:inherit;padding:8px}.bm-m3-tools__search{display:flex;gap:4px;margin:12px 0}.bm-m3-tools__search input{flex:1;min-width:0}.bm-m3-tools__list{display:grid;gap:8px;list-style:none;padding:0;margin:8px 0}.bm-m3-tools__row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;padding:10px;border-radius:12px;background:var(--bm-surface-container-low)}.bm-m3-tools__row p{margin:0}.bm-m3-tools__meta{display:block;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-tools__empty{color:var(--bm-on-surface-variant)}.bm-m3-tools__form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.bm-m3-tools__form label{display:grid;gap:4px;font-size:12px}.bm-m3-tools__form label:first-child{grid-column:1/-1}.bm-m3-tools__notice{min-height:1.4em;color:var(--bm-on-surface-variant)}
.bm-m3-settings{position:fixed;z-index:42;right:18px;top:76px;box-sizing:border-box;width:min(340px,calc(100vw - 36px));max-height:calc(100dvh - 94px);overflow-y:auto;padding:16px;border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow);border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent)}.bm-m3-settings__header{display:flex;align-items:center;gap:8px;margin:0 0 12px}.bm-m3-settings__header h2{flex:1;margin:0;font-size:18px;overflow-wrap:anywhere}.bm-m3-settings__header button{width:auto;min-width:48px}.bm-m3-settings__subheading{margin:18px 0 0;font-size:14px}.bm-m3-setting{display:grid;gap:6px;margin:12px 0}.bm-m3-setting select,.bm-m3-setting input[type=range]{width:100%;min-height:48px}.bm-m3-setting select{padding:9px;border-radius:10px;border:1px solid var(--bm-outline);background:var(--bm-surface);color:inherit}.bm-m3-settings small{overflow-wrap:anywhere}
.bm-m3-notification-history{position:fixed;z-index:42;right:18px;top:76px;box-sizing:border-box;width:min(360px,calc(100vw - 36px));max-height:calc(100dvh - 94px);overflow-y:auto;padding:10px;border:1px solid color-mix(in srgb,var(--bm-outline) 35%,transparent);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-notification-history__header{display:flex;align-items:center;gap:8px;padding:0 0 8px 6px;border-bottom:1px solid var(--bm-surface-container)}.bm-m3-notification-history__header h2{flex:1;margin:0;font-size:18px}.bm-m3-notification-history__header button{width:auto;min-width:48px}.bm-m3-notification-history__empty{margin:14px 6px;color:var(--bm-on-surface-variant)}.bm-m3-notification-history__list{display:grid;gap:8px;margin:10px 0 0;padding:0;list-style:none}.bm-m3-notification-history__item{padding:10px;border-radius:14px;background:var(--bm-surface-container-low)}.bm-m3-notification-history__item[data-level="alert"]{border-left:4px solid var(--bm-error)}.bm-m3-notification-history__item p{margin:0}.bm-m3-notification-history__meta{display:block;margin-top:4px;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-notification-announcer{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.bm-m3-shell[data-theme="contrast"] .bm-m3-appbar{background:var(--bm-surface);backdrop-filter:none}.bm-m3-subtitle{color:var(--bm-on-surface-variant);opacity:1}.bm-m3-search-wrap{display:flex;align-items:stretch;flex:0 1 min(32vw,340px);min-width:13rem}.bm-m3-search-wrap .bm-m3-search{flex:1 1 auto;min-width:0;border-radius:24px 0 0 24px}.bm-m3-regex-button{display:grid;place-items:center;min-width:48px;min-height:48px;border:1px solid var(--bm-outline);border-left:0;background:var(--bm-surface);color:var(--bm-on-surface);cursor:pointer}.bm-m3-regex-button:last-child{border-radius:0 24px 24px 0}.bm-m3-regex-button:focus-visible,.bm-m3-regex-button[aria-pressed="true"]{outline:2px solid var(--bm-primary);outline-offset:-2px;background:var(--bm-primary-container);color:var(--bm-on-primary-container)}.bm-m3-search-results{position:fixed;z-index:43;top:76px;right:12px;box-sizing:border-box;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 96px);overflow-y:auto;padding:8px;border:1px solid var(--bm-outline-variant);border-radius:16px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-search-results[hidden],.bm-m3-regex-builder[hidden],.bm-m3-command-palette[hidden]{display:none}.bm-m3-search-results__summary{margin:4px 8px 8px;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-search-results button{display:block;box-sizing:border-box;width:100%;min-height:48px;border:0;border-radius:12px;background:transparent;color:var(--bm-on-surface);cursor:pointer;text-align:left;padding:11px 12px}.bm-m3-search-results button:hover,.bm-m3-search-results button:focus-visible{background:var(--bm-surface-container-high);outline:2px solid var(--bm-primary);outline-offset:-2px}.bm-m3-regex-builder{position:fixed;z-index:44;top:76px;right:12px;box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 96px);overflow-y:auto;padding:16px;border:1px solid var(--bm-outline-variant);border-radius:20px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-regex-builder h3{margin:0 0 6px}.bm-m3-regex-builder p{margin:0 0 12px;color:var(--bm-on-surface-variant);font-size:12px}.bm-m3-regex-builder label,.bm-m3-regex-builder legend{display:block;color:var(--bm-on-surface);font-size:13px}.bm-m3-regex-builder textarea{box-sizing:border-box;width:100%;min-height:72px;margin:4px 0 10px;padding:8px;border:1px solid var(--bm-outline);border-radius:12px;background:var(--bm-surface-container-low);color:var(--bm-on-surface);font:inherit}.bm-m3-regex-builder fieldset{margin:0 0 10px;border:0;padding:0}.bm-m3-regex-builder__flags{display:flex;flex-wrap:wrap;gap:8px}.bm-m3-regex-builder__tokens{display:flex;flex-wrap:wrap;gap:6px}.bm-m3-regex-builder button{min-height:40px;border:1px solid var(--bm-outline-variant);border-radius:20px;background:var(--bm-surface-container);color:var(--bm-on-surface);cursor:pointer;padding:6px 10px}.bm-m3-regex-builder button:hover,.bm-m3-regex-builder button:focus-visible{background:var(--bm-primary-container);color:var(--bm-on-primary-container);outline:2px solid var(--bm-primary);outline-offset:2px}.bm-m3-regex-builder__feedback{margin:8px 0;white-space:pre-wrap;color:var(--bm-on-surface-variant)}.bm-m3-regex-builder__feedback[data-state="error"]{color:var(--bm-error)}.bm-m3-regex-builder__actions{display:flex;flex-wrap:wrap;gap:8px}.bm-m3-command-palette{position:fixed;z-index:45;inset:0;display:grid;place-items:start center;box-sizing:border-box;padding:clamp(8px,10dvh,80px) 12px 12px;background:color-mix(in srgb,var(--bm-scrim) 48%,transparent)}.bm-m3-command-palette__card{box-sizing:border-box;width:min(680px,100%);max-height:calc(100dvh - 24px);overflow-y:auto;padding:20px;border:1px solid var(--bm-outline-variant);border-radius:28px;background:var(--bm-surface);box-shadow:var(--bm-shadow)}.bm-m3-command-palette__heading{display:flex;align-items:center;gap:8px;margin-bottom:12px}.bm-m3-command-palette__heading h2{flex:1;margin:0;font-size:22px}.bm-m3-command-palette__heading button{min-width:48px;min-height:48px;border:0;border-radius:50%;background:transparent;color:var(--bm-on-surface);cursor:pointer}.bm-m3-command-palette .bm-m3-search-wrap{width:100%;max-width:none}.bm-m3-command-palette .bm-m3-search-results{position:static;width:auto;max-height:none;margin-top:8px;box-shadow:none}.bm-m3-command-palette .bm-m3-regex-builder{position:static;width:auto;max-height:none;margin-top:8px;box-shadow:none}
@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px){.bm-m3-control-bar{inset:8px 8px auto 8px;display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:8px;padding:8px;border-radius:20px}.bm-m3-map-rail{grid-column:1}.bm-m3-brand-group{grid-column:2}.bm-m3-subtitle,.bm-m3-command,.bm-m3-settings-control{display:none}.bm-m3-notification-control{grid-column:3}.bm-m3-search{grid-column:1/-1;width:100%;min-width:0}.bm-m3-coordinates{grid-column:1/-1;width:100%;grid-template-columns:repeat(2,minmax(0,1fr))}.bm-m3-map-menu{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-width:none;max-height:min(70dvh,calc(100dvh - 16px));border-radius:24px 24px 16px 16px}.bm-m3-settings{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:calc(100dvh - 16px)}.bm-m3-notification-history{left:8px;right:8px;top:166px;width:auto;max-height:calc(100dvh - 174px)}}
@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px){.bm-m3-search-wrap{grid-column:1/-1;width:100%;min-width:0}.bm-m3-search-wrap .bm-m3-search{width:0}.bm-m3-search-results[data-search-results="map-controls"],.bm-m3-regex-builder[data-search-scope="map-controls"]{top:166px;right:8px;left:8px;width:auto;max-height:calc(100dvh - 174px)}.bm-m3-command-palette{padding:8px}.bm-m3-command-palette__card{border-radius:20px}}
`;

export class MaterialShell {
    readonly root: HTMLElement;
    private readonly presentationPolicy: ViewerPresentationPolicy;
    private readonly menu: HTMLDivElement;
    private readonly mapMenu: HTMLElement;
    private readonly mapMenuButton: HTMLButtonElement;
    private readonly settings: HTMLDivElement;
    private readonly tools: HTMLElement;
    private measurementModel: MeasurementWaypointModel;
    private readonly settingsButton: HTMLButtonElement;
    private readonly search: HTMLInputElement;
    private readonly mapSearch: SearchScope;
    private readonly commandPalette: HTMLElement;
    private readonly commandSearch: SearchScope;
    private readonly commandPaletteButton: HTMLButtonElement;
    private readonly notificationBell: HTMLButtonElement;
    private readonly notificationHistory: HTMLElement;
    private readonly notificationAnnouncer: HTMLElement;
    private readonly coordinates: HTMLDivElement;
    private unsubscribePresentation: (() => void) | null = null;
    private notices: ViewerNotice[] = [];
    private nextNoticeId = 1;
    private reviewedNoticeId = 0;
    /** The canvas that asked for keyboard terrain actions, restored on Escape. */
    private contextMenuInvoker: HTMLElement | null = null;
    /** The exact palette opener, restored when the command card closes. */
    private commandPaletteInvoker: HTMLElement | null = null;
    /** The exact settings opener, restored after close or Escape. */
    private settingsInvoker: HTMLElement | null = null;

    /**
     * True when the page around this viewer draws its own chrome.
     *
     * Everything the shell builds is still built - the map menu, the settings panel, the
     * notification history, the search scopes and the command palette are all real surfaces
     * a host may open through the viewer's own API - but the *app bar* is not appended,
     * because the host has one. Building it anyway is what put two search fields, two
     * coordinate readouts and two settings buttons on top of each other in the desktop app.
     */
    private readonly embedded: boolean;

    constructor(
        root: Element,
        presentationPolicy = new ViewerPresentationPolicy(),
        options: { chrome?: "served" | "embedded" } = {},
    ) {
        this.root = root as HTMLElement;
        this.presentationPolicy = presentationPolicy;
        this.embedded = options.chrome === "embedded";
        this.root.classList.add("bm-m3-shell");
        this.measurementModel = new MeasurementWaypointModel();
        if (options.chrome === "embedded") this.root.classList.add("bm-m3-shell--embedded");
        if (!document.getElementById("bm-m3-style")) {
            const style = document.createElement("style");
            style.id = "bm-m3-style";
            style.textContent = STYLE;
            document.head.appendChild(style);
        }
        const bar = document.createElement("header");
        bar.className = "bm-m3-appbar bm-m3-control-bar";
        bar.innerHTML = `<nav class="bm-m3-map-rail" data-copy-aria-label="mapNavigation"><button class="bm-m3-rail-menu" type="button" data-action="map-menu" data-copy-aria-label="openMapMenu" data-copy-title="openMapMenu" aria-controls="bm-m3-map-menu" aria-expanded="false" title="Open map menu">☰</button></nav><div class="bm-m3-brand-group"><div class="bm-m3-brand">BlueMap</div><div class="bm-m3-subtitle" data-copy="materialMapServer">Material map server</div></div><div class="bm-m3-search-wrap" role="search" data-search-scope="map-controls"><input class="bm-m3-search" type="search" data-copy-aria-label="searchMapControls" data-copy-placeholder="searchControlsPlaceholder" autocomplete="off" spellcheck="false"><button class="bm-m3-regex-button" type="button" data-search-action="toggle-regex" data-copy-aria-label="regexSearch" aria-pressed="false">Regex</button><button class="bm-m3-regex-button" type="button" data-search-action="builder" data-copy-aria-label="openMapRegexBuilder" aria-expanded="false">.*</button></div><div class="bm-m3-coordinates" role="status" data-copy-aria-label="currentMapCoordinates"><output class="bm-m3-coordinate" data-coordinate="x">x —</output><output class="bm-m3-coordinate" data-coordinate="z">z —</output></div><button class="bm-m3-icon bm-m3-notification-control" type="button" data-action="notifications" aria-controls="bm-m3-notification-history" aria-expanded="false">🔔</button><button class="bm-m3-icon bm-m3-settings-control" type="button" data-action="settings" data-copy-aria-label="openSettings" aria-controls="bm-m3-settings" aria-expanded="false">⚙</button><button class="bm-m3-icon bm-m3-command" type="button" data-action="command" data-copy-aria-label="openCommandPalette" title="Ctrl+Shift+F">⌘</button>`;
        // Built either way, so every querySelector below finds what it expects and the
        // shell's own API keeps working; appended only when nothing else draws a bar.
        if (!this.embedded) this.root.appendChild(bar);
        this.mapMenuButton = bar.querySelector<HTMLButtonElement>('[data-action="map-menu"]')!;
        this.commandPaletteButton =
            bar.querySelector<HTMLButtonElement>('[data-action="command"]')!;
        this.notificationBell = bar.querySelector<HTMLButtonElement>(
            '[data-action="notifications"]',
        )!;
        this.search = bar.querySelector<HTMLInputElement>("input")!;
        this.coordinates = bar.querySelector<HTMLDivElement>(".bm-m3-coordinates")!;
        const mapSearchResults = document.createElement("section");
        mapSearchResults.className = "bm-m3-search-results";
        mapSearchResults.dataset.searchResults = "map-controls";
        mapSearchResults.dataset.copyAriaLabel = "mapControlSearchResults";
        mapSearchResults.hidden = true;
        this.root.appendChild(mapSearchResults);
        this.mapSearch = this.createSearchScope("map-controls", bar, mapSearchResults);
        this.settingsButton = bar.querySelector<HTMLButtonElement>('[data-action="settings"]')!;
        this.settingsButton.addEventListener("click", () =>
            this.toggleSettings(this.settingsButton),
        );
        this.mapMenuButton.addEventListener("click", () => this.toggleMapMenu());

        this.menu = document.createElement("div");
        this.menu.className = "bm-m3-menu";
        this.menu.hidden = true;
        this.menu.setAttribute("role", "menu");
        this.menu.dataset.copyAriaLabel = "terrainActions";
        this.menu.innerHTML = `<button type="button" role="menuitem" data-action="pin">📍 <span data-copy="addPinpoint">Add pinpoint here</span></button><button type="button" role="menuitem" data-action="copy" data-copy="copyCoordinates">Copy coordinates</button><button type="button" role="menuitem" data-action="cancel" data-copy="cancel">Cancel</button>`;
        this.root.appendChild(this.menu);
        this.menu.addEventListener("click", (event) => void this.handleMenuClick(event));
        this.menu.addEventListener("keydown", this.handleContextMenuKeydown);

        this.mapMenu = document.createElement("aside");
        this.mapMenu.id = "bm-m3-map-menu";
        this.mapMenu.className = "bm-m3-map-menu";
        this.mapMenu.hidden = true;
        this.mapMenu.dataset.copyAriaLabel = "mapMenu";
        this.mapMenu.setAttribute("data-presentation", "side-sheet");
        this.mapMenu.innerHTML = `<div class="bm-m3-map-menu__header"><h2 data-copy="mapMenu">Map menu</h2><button type="button" data-map-action="close" data-copy="close" data-copy-aria-label="closeMapMenu">Close</button></div><div class="bm-m3-map-menu__body"><button type="button" data-map-action="tools">Measurement and waypoints</button><button type="button" data-map-action="search" data-copy="searchMapControls">Search map controls</button><button type="button" data-map-action="appearance" data-copy="mapAppearance">Map appearance</button><button type="button" data-map-action="notifications" data-copy="notificationHistory">Notification history</button><button type="button" data-map-action="palette" data-copy="openCommandPalette">Open command palette</button></div>`;
        this.root.appendChild(this.mapMenu);
        this.mapMenu.addEventListener("click", (event) => this.handleMapMenuClick(event));

        this.tools = document.createElement("aside");
        this.tools.id = "bm-m3-measurement-tools";
        this.tools.className = "bm-m3-tools";
        this.tools.hidden = true;
        this.tools.setAttribute("role", "dialog");
        this.tools.setAttribute("aria-modal", "false");
        this.root.appendChild(this.tools);
        this.renderMeasurementTools();
        this.tools.addEventListener("click", (event) => this.handleToolsClick(event));
        this.tools.addEventListener("input", () => this.renderMeasurementTools());

        this.notificationHistory = document.createElement("aside");
        this.notificationHistory.id = "bm-m3-notification-history";
        this.notificationHistory.className = "bm-m3-notification-history";
        this.notificationHistory.hidden = true;
        this.notificationHistory.setAttribute("role", "region");
        this.notificationHistory.dataset.copyAriaLabel = "notificationHistory";
        this.root.appendChild(this.notificationHistory);
        this.notificationHistory.addEventListener("click", (event) => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")
                ?.dataset.notificationAction;
            if (action === "close") this.closeNotificationHistory();
        });

        this.notificationAnnouncer = document.createElement("div");
        this.notificationAnnouncer.className = "bm-m3-notification-announcer";
        this.notificationAnnouncer.setAttribute("aria-live", "polite");
        this.notificationAnnouncer.setAttribute("aria-atomic", "true");
        this.notificationAnnouncer.setAttribute("role", "status");
        this.root.appendChild(this.notificationAnnouncer);
        this.notificationBell.addEventListener("click", () => this.toggleNotificationHistory());
        this.renderNotificationHistory();

        this.settings = document.createElement("div");
        this.settings.id = "bm-m3-settings";
        this.settings.className = "bm-m3-settings";
        this.settings.hidden = true;
        this.settings.setAttribute("role", "dialog");
        this.settings.setAttribute("aria-modal", "false");
        this.settings.setAttribute("aria-labelledby", "bm-m3-settings-title");
        this.settings.innerHTML = `<div class="bm-m3-settings__header"><h2 id="bm-m3-settings-title" data-copy="mapAppearance">Map appearance</h2><button type="button" data-settings-action="close" data-copy="close" data-copy-aria-label="closeSettings">Close</button></div><div class="bm-m3-setting"><label for="bm-theme" data-copy="theme">Theme</label><select id="bm-theme"><option value="light" data-copy="light">Light</option><option value="dark" data-copy="dark">Dark</option><option value="contrast" data-copy="contrast">Contrast</option></select></div><div class="bm-m3-setting"><label for="bm-density" data-copy="density">Density</label><input id="bm-density" type="range" min="1" max="5" value="3"><small data-copy="densityDescription">Controls spacing without changing map data.</small></div><div data-message-style-slot></div>`;
        this.root.appendChild(this.settings);
        this.settings.addEventListener("click", (event) => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")
                ?.dataset.settingsAction;
            if (action === "close") this.closeSettings();
        });
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

        this.commandPalette = document.createElement("section");
        this.commandPalette.className = "bm-m3-command-palette";
        this.commandPalette.hidden = true;
        this.commandPalette.innerHTML = `<div class="bm-m3-command-palette__card" role="dialog" aria-modal="true" data-copy-aria-label="commandPalette"><div class="bm-m3-command-palette__heading"><h2 data-copy="commandPalette">Command palette</h2><button type="button" data-command-action="close" data-copy="close" data-copy-aria-label="closeCommandPalette">Close</button></div><p data-copy="commandPaletteDescription">Type a map command, then choose the real control to run. Ctrl+Shift+F opens this palette.</p><div class="bm-m3-search-wrap" role="search" data-search-scope="command-palette"><input class="bm-m3-search" type="search" data-copy-aria-label="searchCommands" data-copy-placeholder="searchCommandsPlaceholder" autocomplete="off" spellcheck="false"><button class="bm-m3-regex-button" type="button" data-search-action="toggle-regex" data-copy-aria-label="searchCommandsRegex" aria-pressed="false">Regex</button><button class="bm-m3-regex-button" type="button" data-search-action="builder" data-copy-aria-label="openCommandRegexBuilder" aria-expanded="false">.*</button></div><section class="bm-m3-search-results" data-search-results="command-palette" data-copy-aria-label="commandResults"></section></div>`;
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
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")
                ?.dataset.commandAction;
            if (action === "close") this.closeCommandPalette();
        });

        this.setTheme(localStorage.getItem("bluemap-theme") || "dark");
        this.syncViewportLayout();
        document.addEventListener("click", this.dismiss);
        document.addEventListener("keydown", this.dismissMapMenuWithEscape);
        document.addEventListener("keydown", this.dismissContextMenuWithEscape);
        document.addEventListener("keydown", this.handleGlobalShortcut);
        window.addEventListener("resize", this.syncViewportLayout);
        this.root.addEventListener("bluemapAlert", this.handleBlueMapAlert as EventListener);
        this.unsubscribePresentation = this.presentationPolicy.subscribePresentation(() =>
            this.refreshPresentation(),
        );
        this.refreshPresentation();
    }

    /** Keeps annotations isolated to the active profile/map/dimension; records remain world-space. */
    setMeasurementScope(scope: MeasurementWaypointScope): void {
        this.measurementModel = new MeasurementWaypointModel(scope);
        this.renderMeasurementTools();
    }

    /** Re-renders host-restricted controls without coupling this standalone shell to a UI package. */
    refreshPresentation(): void {
        const languageMode = this.languageMode();
        const funnyLevels = this.funnyLevels();
        this.root.dataset.languageMode = languageMode;
        this.root.dataset.funnyLevelEn = String(funnyLevels.en);
        this.root.dataset.funnyLevelYue = String(funnyLevels.yue);
        // Keep the original one-value data hook useful to existing standalone host themes.
        this.root.dataset.funnyLevel = String(funnyLevels.en);
        this.root.lang = languageMode === "yue" ? "yue-Hant-HK" : "en";
        this.applyPresentationCopy();
        this.renderMessageStyleControl();
        this.renderNotificationHistory();
        this.renderSearchResults(this.mapSearch);
        this.renderSearchResults(this.commandSearch);
    }

    private languageMode(): ViewerLanguageMode {
        const raw = normaliseViewerLanguageMode(
            localStorage.getItem(PRESENTATION_LANGUAGE_STORAGE_KEY),
        );
        return this.presentationPolicy.effectiveLanguageMode(raw);
    }

    private funnyLevels(): Readonly<Record<ViewerPresentationLanguage, number>> {
        return {
            en: this.presentationPolicy.effectiveFunnyLevel(this.readFunnyLevel("en")),
            yue: this.presentationPolicy.effectiveFunnyLevel(this.readFunnyLevel("yue")),
        };
    }

    private readFunnyLevel(language: ViewerPresentationLanguage): 1 | 2 | 3 | 4 | 5 {
        const parsed = Number.parseInt(
            localStorage.getItem(FUNNY_LEVEL_STORAGE_KEY[language]) ?? "2",
            10,
        );
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5
            ? (parsed as 1 | 2 | 3 | 4 | 5)
            : 2;
    }

    private copy(key: MaterialShellCopyKey, values: MaterialShellCopyValues = {}): string {
        return materialShellCopy(
            key,
            this.languageMode(),
            this.funnyLevels(),
            values,
            this.presentationPolicy.presentationAdapter,
        );
    }

    private applyPresentationCopy(): void {
        for (const element of this.root.querySelectorAll<HTMLElement>("[data-copy]")) {
            const key = element.dataset.copy as MaterialShellCopyKey;
            element.textContent =
                key === "regexBuilderDescription"
                    ? this.copy(key, {
                          patternLimit: MAX_REGEX_PATTERN_LENGTH,
                          sampleLimit: MAX_REGEX_SAMPLE_LENGTH,
                      })
                    : this.copy(key);
        }
        for (const element of this.root.querySelectorAll<HTMLElement>("[data-copy-aria-label]")) {
            element.setAttribute(
                "aria-label",
                this.copy(element.dataset.copyAriaLabel as MaterialShellCopyKey),
            );
        }
        for (const element of this.root.querySelectorAll<HTMLElement>("[data-copy-title]")) {
            element.setAttribute(
                "title",
                this.copy(element.dataset.copyTitle as MaterialShellCopyKey),
            );
        }
        for (const input of this.root.querySelectorAll<HTMLInputElement>(
            "[data-copy-placeholder]",
        )) {
            input.placeholder = this.copy(input.dataset.copyPlaceholder as MaterialShellCopyKey);
        }
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-regex-token]")) {
            const token = REGEX_TOKENS[Number(button.dataset.regexToken)];
            if (token === undefined) continue;
            const hint = this.copy(token.copyKey);
            button.title = hint;
            button.setAttribute("aria-label", `${token.label}: ${hint}`);
        }
        for (const field of this.coordinates.querySelectorAll<HTMLOutputElement>(
            "[data-coordinate]",
        )) {
            const axis = field.dataset.coordinate?.toUpperCase() ?? "";
            if (field.textContent?.endsWith("—"))
                field.setAttribute("aria-label", this.copy("coordinateUnavailable", { axis }));
        }
    }

    /**
     * Removes the control rather than disabling it while the host restricts language and tone.
     * The raw value is left in the existing storage key so it comes back when the policy ends.
     */
    private renderMessageStyleControl(): void {
        const slot = this.settings.querySelector<HTMLElement>("[data-message-style-slot]")!;
        slot.replaceChildren();
        if (this.presentationPolicy.languageAndToneRestricted) return;

        const languageSetting = document.createElement("div");
        languageSetting.className = "bm-m3-setting";
        const languageLabel = document.createElement("label");
        languageLabel.htmlFor = "bm-language-mode";
        languageLabel.textContent = this.copy("languageMode");
        const languageMode = document.createElement("select");
        languageMode.id = "bm-language-mode";
        for (const [value, key] of [
            ["en", "languageEnglish"],
            ["yue", "languageYue"],
            ["bilingual", "languageBilingual"],
        ] as const) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = this.copy(key);
            languageMode.appendChild(option);
        }
        languageMode.value = normaliseViewerLanguageMode(
            localStorage.getItem(PRESENTATION_LANGUAGE_STORAGE_KEY),
        );
        languageMode.addEventListener("change", () => {
            localStorage.setItem(PRESENTATION_LANGUAGE_STORAGE_KEY, languageMode.value);
            this.refreshPresentation();
            this.settings.querySelector<HTMLSelectElement>("#bm-language-mode")?.focus();
        });
        languageSetting.append(languageLabel, languageMode);

        const toneHeading = document.createElement("h3");
        toneHeading.className = "bm-m3-settings__subheading";
        toneHeading.textContent = this.copy("languageTone");
        slot.append(languageSetting, toneHeading);
        for (const language of ["en", "yue"] as const) {
            const setting = document.createElement("div");
            setting.className = "bm-m3-setting";
            const label = document.createElement("label");
            label.htmlFor = `bm-funny-${language}`;
            label.textContent = this.copy(language === "en" ? "funnyEn" : "funnyYue");
            const input = document.createElement("input");
            input.id = `bm-funny-${language}`;
            input.type = "range";
            input.min = "1";
            input.max = "5";
            input.value = String(this.readFunnyLevel(language));
            input.setAttribute(
                "aria-valuetext",
                this.copy("funnyLevelValue", { level: input.value }),
            );
            const detail = document.createElement("small");
            detail.textContent = this.copy("funnyDescription");
            input.addEventListener("input", () => {
                const level = Math.max(1, Math.min(5, Number(input.value)));
                localStorage.setItem(FUNNY_LEVEL_STORAGE_KEY[language], String(level));
                this.refreshPresentation();
                this.settings.querySelector<HTMLInputElement>(`#bm-funny-${language}`)?.focus();
            });
            setting.append(label, input, detail);
            slot.appendChild(setting);
        }
    }

    private createSearchScope(
        name: SearchScopeName,
        host: ParentNode,
        results: HTMLElement,
    ): SearchScope {
        const scopeElement = host.querySelector<HTMLElement>('[data-search-scope="' + name + '"]')!;
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
            if (action !== undefined) {
                event.stopPropagation();
                this.activateSearchAction(action);
            }
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
        builder.dataset.copyAriaLabel = "regexBuilder";
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
                '">' +
                token.label +
                "</button>",
        ).join("");
        builder.innerHTML =
            '<h3 data-copy="regexBuilder">Regex builder</h3>' +
            '<p data-copy="regexBuilderDescription">ECMAScript RegExp runs locally against this search.</p>' +
            '<label><span data-copy="pattern">Pattern</span><textarea data-regex-pattern rows="2" maxlength="' +
            MAX_REGEX_PATTERN_LENGTH +
            '" spellcheck="false"></textarea></label>' +
            '<fieldset><legend data-copy="flags">Flags</legend><div class="bm-m3-regex-builder__flags">' +
            flags +
            "</div></fieldset>" +
            '<fieldset><legend data-copy="buildPattern">Build pattern</legend><div class="bm-m3-regex-builder__tokens">' +
            tokens +
            '<button type="button" data-regex-action="escape" data-copy="escapeLiteral">Escape literal</button></div></fieldset>' +
            '<label><span data-copy="sampleText">Sample text</span><textarea data-regex-sample rows="3" maxlength="' +
            MAX_REGEX_SAMPLE_LENGTH +
            '" spellcheck="false"></textarea></label>' +
            '<output class="bm-m3-regex-builder__feedback" data-regex-feedback aria-live="polite"></output>' +
            '<p data-regex-copy-status aria-live="polite"></p>' +
            '<div class="bm-m3-regex-builder__actions"><button type="button" data-regex-action="copy" data-copy="copyPattern">Copy pattern</button><button type="button" data-regex-action="export" data-copy="exportPattern">Export pattern</button><button type="button" data-regex-action="close" data-copy="close">Close</button></div>';
        return builder;
    }

    private readonly searchActions = (): readonly {
        readonly id: SearchActionId;
        readonly label: string;
        readonly keywords: string;
    }[] => [
        {
            id: "map-menu",
            label: this.copy("actionMapMenu"),
            keywords: this.copy("actionMapMenuKeywords"),
        },
        {
            id: "appearance",
            label: this.copy("actionAppearance"),
            keywords: this.copy("actionAppearanceKeywords"),
        },
        {
            id: "command-palette",
            label: this.copy("actionPalette"),
            keywords: this.copy("actionPaletteKeywords"),
        },
        {
            id: "map-search",
            label: this.copy("actionMapSearch"),
            keywords: this.copy("actionMapSearchKeywords"),
        },
        {
            id: "notification-history",
            label: this.copy("actionNotifications"),
            keywords: this.copy("actionNotificationsKeywords"),
        },
        { id: "measurement-tools", label: "Measurement and waypoints", keywords: "distance polyline area coordinates bookmarks markers" },
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
            this.copy(
                scope.regex
                    ? "regexPlainSearch"
                    : scope.name === "command-palette"
                      ? "searchCommandsRegex"
                      : "regexSearch",
            ),
        );
        const patternField =
            scope.builder.querySelector<HTMLTextAreaElement>("[data-regex-pattern]")!;
        if (patternField.value !== pattern) patternField.value = pattern;
        for (const flag of REGEX_FLAGS) {
            const field = scope.builder.querySelector<HTMLInputElement>(
                '[data-regex-flag="' + flag + '"]',
            )!;
            field.checked = scope.flags.includes(flag);
        }
        const sampleField =
            scope.builder.querySelector<HTMLTextAreaElement>("[data-regex-sample]")!;
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
            scope.flags = REGEX_FLAGS.filter(
                (flag) =>
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
            pattern.slice(0, start) +
            before +
            pattern.slice(start, end) +
            after +
            pattern.slice(end);
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
        const feedback = scope.builder.querySelector<HTMLOutputElement>("[data-regex-feedback]")!;
        const preview = previewRegex(scope.input.value, scope.flags, scope.sample);
        feedback.dataset.state = preview.error === null ? "ready" : "error";
        if (preview.error !== null) {
            feedback.textContent = this.copy("patternError", { error: preview.error });
            return;
        }
        if (scope.input.value.length === 0) {
            feedback.textContent = this.copy("noPatternYet");
            return;
        }
        const captureLines = preview.matches
            .map((match) =>
                match.groups.length > 0
                    ? "“" + match.text + "” at " + match.index + "; " + match.groups.join(", ")
                    : "“" + match.text + "” at " + match.index,
            )
            .join("\n");
        feedback.textContent =
            this.copy("liveMatches", {
                count: preview.matches.length,
                matchWord: this.copy(
                    preview.matches.length === 1 ? "liveMatch" : "liveMatchesPlural",
                ),
            }) +
            (preview.sampleTruncated
                ? ` ${this.copy("sampleLimited", { limit: MAX_REGEX_SAMPLE_LENGTH })}`
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
            summary.textContent = this.copy("patternError", { error });
            summary.setAttribute("role", "alert");
            scope.results.appendChild(summary);
            return;
        }

        const actions = this.searchActions().filter((action) => {
            const searchable = action.label + " " + action.keywords;
            if (query.length === 0) return true;
            if (!scope.regex)
                return searchable.toLocaleLowerCase().includes(query.toLocaleLowerCase());
            const expression = new RegExp(
                query,
                normaliseRegexFlags(scope.flags).replace(/[gy]/g, ""),
            );
            return expression.test(searchable);
        });
        summary.textContent = this.copy(scope.regex ? "controlsMatchRegex" : "controlsMatchPlain", {
            count: actions.length,
            controlWord: this.copy(actions.length === 1 ? "control" : "controls"),
        });
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
                this.closeSettings(false);
                this.mapMenu.hidden = false;
                this.mapMenuButton.setAttribute("aria-expanded", "true");
                this.mapMenuButton.focus();
                break;
            case "appearance":
                this.closeMapMenu();
                this.openSettings(this.search);
                break;
            case "command-palette":
                this.openCommandPalette(this.search);
                break;
            case "map-search":
                this.search.focus();
                break;
            case "notification-history":
                this.openNotificationHistory();
                break;
            case "measurement-tools":
                this.openMeasurementTools(this.search);
                break;
        }
    }

    private openCommandPalette(invoker: HTMLElement): void {
        this.closeMapMenu();
        this.closeSettings(false);
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
            status.textContent = this.copy("clipboardUnavailable");
            return;
        }
        void navigator.clipboard
            .writeText("/" + scope.input.value + "/" + scope.flags)
            .then(() => (status.textContent = this.copy("patternCopied")))
            .catch(() => (status.textContent = this.copy("patternCopyFailed")));
    }

    private exportRegexPattern(scope: SearchScope): void {
        const status = scope.builder.querySelector<HTMLElement>("[data-regex-copy-status]")!;
        if (typeof URL.createObjectURL !== "function") {
            status.textContent = this.copy("exportUnavailable");
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
        status.textContent = this.copy("exportStarted");
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
        if (!this.notificationHistory.hidden) {
            event.preventDefault();
            this.closeNotificationHistory();
            return;
        }
        if (!this.settings.hidden) {
            event.preventDefault();
            this.closeSettings();
            return;
        }
        if (!this.tools.hidden) {
            event.preventDefault();
            this.closeMeasurementTools();
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
        if (
            !this.notificationHistory.contains(event.target as Node) &&
            !this.notificationBell.contains(event.target as Node)
        )
            this.closeNotificationHistory(false);
        if (
            !this.settings.contains(event.target as Node) &&
            !this.settingsButton.contains(event.target as Node)
        )
            this.closeSettings(false);
        if (!this.tools.contains(event.target as Node) && !this.mapMenu.contains(event.target as Node))
            this.closeMeasurementTools(false);
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
        const actions = [
            ...this.menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
        ];
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
            this.closeSettings(false);
            this.mapMenu.hidden = false;
            this.mapMenuButton.setAttribute("aria-expanded", "true");
            return;
        }
        this.closeMapMenu();
    }

    private openMeasurementTools(invoker: HTMLElement): void {
        this.closeMapMenu();
        this.closeSettings(false);
        this.closeNotificationHistory(false);
        this.closeCommandPalette(false);
        this.tools.hidden = false;
        this.tools.dataset.tab = this.tools.dataset.tab || "waypoints";
        this.renderMeasurementTools();
        this.tools.querySelector<HTMLInputElement>("[data-tools-search]")?.focus();
        this.tools.dataset.invoker = invoker === this.mapMenuButton ? "map-menu" : "search";
    }

    private closeMeasurementTools(restoreFocus = true): void {
        if (this.tools.hidden) return;
        this.tools.hidden = true;
        if (restoreFocus && this.tools.dataset.invoker === "map-menu") this.mapMenuButton.focus();
    }

    private renderMeasurementTools(): void {
        const tab = this.tools.dataset.tab === "measure" ? "measure" : "waypoints";
        const dimension = this.measurementModel.currentScope.dimension;
        const query = this.tools.querySelector<HTMLInputElement>("[data-tools-search]")?.value ?? "";
        const regex = this.tools.querySelector<HTMLInputElement>("[data-tools-regex]")?.checked ?? false;
        const records = this.measurementModel.search(query, regex);
        const selected = new Set([...this.tools.querySelectorAll<HTMLInputElement>("[data-tools-select]:checked")].map((field) => field.value));
        const rows = records.map((item) => {
            const waypoint = "name" in item;
            const title = waypoint ? item.name : item.kind;
            const detail = waypoint ? `${item.coordinate.x}, ${item.coordinate.y}, ${item.coordinate.z} · ${item.dimension}` : `${measurementValue(item)?.toFixed(2) ?? "—"} blocks · ${item.points.length} points · ${item.dimension}`;
            return `<li class="bm-m3-tools__row"><input type="checkbox" data-tools-select value="${item.id}" aria-label="Select ${title}" ${selected.has(item.id) ? "checked" : ""}><div><p>${title}</p><span class="bm-m3-tools__meta">${detail} · ${dimension}</span></div><button type="button" data-tools-focus="${item.id}">Focus</button></li>`;
        }).join("");
        this.tools.innerHTML = `<div class="bm-m3-tools__header"><h2 id="bm-m3-tools-title">Map tools</h2><button type="button" data-tools-action="close" aria-label="Close map tools">Close</button></div><div class="bm-m3-tools__tabs" role="tablist" aria-label="Map tools"><button type="button" role="tab" aria-selected="${tab === "measure"}" data-tools-tab="measure">Measure</button><button type="button" role="tab" aria-selected="${tab === "waypoints"}" data-tools-tab="waypoints">Waypoints</button></div><div class="bm-m3-tools__search" role="search"><input type="search" data-tools-search placeholder="Search tools and waypoints" aria-label="Search tools and waypoints"><label><input type="checkbox" data-tools-regex ${regex ? "checked" : ""}> Regex</label></div>${tab === "measure" ? `<div class="bm-m3-tools__form"><label>Tool<select data-tools-kind><option value="distance">Distance</option><option value="polyline">Polyline (3 points)</option><option value="horizontal">Horizontal delta</option><option value="vertical">Vertical delta</option><option value="area">Area (3 points)</option></select></label><label>X1<input data-tools-x1 type="number" step="any" value="0"></label><label>Y1<input data-tools-y1 type="number" step="any" value="0"></label><label>Z1<input data-tools-z1 type="number" step="any" value="0"></label><label>X2<input data-tools-x2 type="number" step="any" value="0"></label><label>Y2<input data-tools-y2 type="number" step="any" value="0"></label><label>Z2<input data-tools-z2 type="number" step="any" value="0"></label></div><div class="bm-m3-tools__actions"><button type="button" data-tools-action="measure-current">Add measurement</button></div>` : `<div class="bm-m3-tools__form"><label>Name<input data-tools-name placeholder="Waypoint name"></label><label>X<input data-tools-x type="number" step="any" value="0"></label><label>Y<input data-tools-y type="number" step="any" value="0"></label><label>Z<input data-tools-z type="number" step="any" value="0"></label><label>Group<input data-tools-group value="General"></label><label>Tags<input data-tools-tags placeholder="base, portal"></label></div><div class="bm-m3-tools__actions"><button type="button" data-tools-action="waypoint-current">Save waypoint</button></div>`}<div class="bm-m3-tools__actions"><button type="button" data-tools-action="select-all">Select all</button><button type="button" data-tools-action="invert">Invert selection</button><button type="button" data-tools-action="delete" ${selected.size ? "" : "disabled"}>Delete selected</button><button type="button" data-tools-action="export">Export JSON</button></div><p class="bm-m3-tools__notice" aria-live="polite">${records.length} matching item${records.length === 1 ? "" : "s"}; ${selected.size} selected.</p><ul class="bm-m3-tools__list" aria-label="Map tool results">${rows || `<li class="bm-m3-tools__empty">No measurements or waypoints match this search.</li>`}</ul>`;
        const searchField = this.tools.querySelector<HTMLInputElement>("[data-tools-search]")!;
        searchField.value = query;
        this.tools.querySelector<HTMLSelectElement>("[data-tools-kind]")?.setAttribute("aria-label", "Measurement type");
    }

    private handleToolsClick(event: Event): void {
        const target = event.target as HTMLElement;
        const action = target.closest<HTMLElement>("[data-tools-action]")?.dataset.toolsAction;
        const tab = target.closest<HTMLElement>("[data-tools-tab]")?.dataset.toolsTab;
        if (tab) { this.tools.dataset.tab = tab; this.renderMeasurementTools(); return; }
        if (action === "close") { this.closeMeasurementTools(); return; }
        if (action === "select-all" || action === "invert") {
            const fields = [...this.tools.querySelectorAll<HTMLInputElement>("[data-tools-select]")];
            fields.forEach((field) => { field.checked = action === "select-all" ? true : !field.checked; });
            this.renderMeasurementTools(); return;
        }
        if (action === "delete") {
            const ids = [...this.tools.querySelectorAll<HTMLInputElement>("[data-tools-select]:checked")].map((field) => field.value);
            this.measurementModel.remove(ids); this.renderMeasurementTools(); this.recordNotice("externalAlert", "status", { message: `Deleted ${ids.length} map tool item(s).` }); return;
        }
        if (action === "export") {
            const link = document.createElement("a"); const href = URL.createObjectURL(new Blob([this.measurementModel.exportJson()], { type: "application/json" }));
            link.href = href; link.download = "bluemap-measurements-waypoints.json"; link.click(); URL.revokeObjectURL(href); return;
        }
        if (action === "waypoint-current") {
            const value = (name: string) => this.tools.querySelector<HTMLInputElement>(`[data-tools-${name}]`)?.value ?? "";
            try { this.measurementModel.addWaypoint({ name: value("name") || "Waypoint", coordinate: { x: Number(value("x")), y: Number(value("y")), z: Number(value("z")) }, dimension: this.measurementModel.currentDimension, group: value("group") || "General", tags: value("tags").split(",").map((tag) => tag.trim()).filter(Boolean) }); this.renderMeasurementTools(); }
            catch (error) { this.recordNotice("externalAlert", "alert", { message: String(error) }); }
            return;
        }
        if (action === "measure-current") {
            const value = (name: string) => Number(this.tools.querySelector<HTMLInputElement>(`[data-tools-${name}]`)?.value ?? 0);
            const kind = (this.tools.querySelector<HTMLSelectElement>("[data-tools-kind]")?.value ?? "distance") as MeasurementKind;
            const points = [{ x: value("x1"), y: value("y1"), z: value("z1") }, { x: value("x2"), y: value("y2"), z: value("z2") }];
            if (kind === "polyline" || kind === "area") { this.recordNotice("externalAlert", "alert", { message: "Polyline and area measurements require at least three world-coordinate points." }); return; }
            try { this.measurementModel.addMeasurement({ kind, points, dimension: this.measurementModel.currentDimension }); this.renderMeasurementTools(); }
            catch (error) { this.recordNotice("externalAlert", "alert", { message: String(error) }); }
        }
    }

    private closeMapMenu(): void {
        this.mapMenu.hidden = true;
        this.mapMenuButton.setAttribute("aria-expanded", "false");
    }

    private toggleSettings(invoker: HTMLElement): void {
        if (this.settings.hidden) {
            this.openSettings(invoker);
            return;
        }
        this.closeSettings();
    }

    private openSettings(invoker: HTMLElement): void {
        this.closeMapMenu();
        this.closeNotificationHistory(false);
        this.closeCommandPalette(false);
        this.closeRegexBuilder(this.mapSearch, false);
        this.mapSearch.results.hidden = true;
        this.settingsInvoker = invoker;
        this.settings.hidden = false;
        this.settingsButton.setAttribute("aria-expanded", "true");
        this.settings.querySelector<HTMLSelectElement>("#bm-theme")!.focus();
    }

    private closeSettings(restoreFocus = true): void {
        if (this.settings.hidden) return;
        this.settings.hidden = true;
        this.settingsButton.setAttribute("aria-expanded", "false");
        if (restoreFocus) this.settingsInvoker?.focus();
        this.settingsInvoker = null;
    }

    /**
     * Opens the one place where served-map notifications are read. Recording a notice never
     * opens this panel by itself: a map interaction must not cover the map with a live overlay.
     */
    private toggleNotificationHistory(): void {
        if (this.notificationHistory.hidden) {
            this.openNotificationHistory();
            return;
        }
        this.closeNotificationHistory();
    }

    private openNotificationHistory(): void {
        this.closeMapMenu();
        this.closeSettings(false);
        this.notificationHistory.hidden = false;
        const newest = this.notices.at(0);
        if (newest !== undefined) this.reviewedNoticeId = newest.id;
        this.renderNotificationHistory();
        this.notificationHistory
            .querySelector<HTMLButtonElement>('[data-notification-action="close"]')
            ?.focus();
    }

    private closeNotificationHistory(restoreFocus = true): void {
        if (this.notificationHistory.hidden) return;
        this.notificationHistory.hidden = true;
        this.renderNotificationHistory();
        if (restoreFocus) this.notificationBell.focus();
    }

    private notificationBellLabel(): string {
        const unread = this.notices.filter((notice) => notice.id > this.reviewedNoticeId).length;
        if (this.notices.length === 0) return this.copy("notificationBellEmpty");
        return this.copy("notificationBellCount", { count: this.notices.length, unread });
    }

    private renderNotificationHistory(): void {
        this.notificationBell.setAttribute("aria-label", this.notificationBellLabel());
        this.notificationBell.setAttribute(
            "aria-expanded",
            String(!this.notificationHistory.hidden),
        );
        this.notificationHistory.replaceChildren();

        const header = document.createElement("div");
        header.className = "bm-m3-notification-history__header";
        const title = document.createElement("h2");
        title.textContent = this.copy("notificationHistory");
        const close = document.createElement("button");
        close.type = "button";
        close.dataset.notificationAction = "close";
        close.setAttribute("aria-label", this.copy("closeNotificationHistory"));
        close.textContent = this.copy("close");
        header.append(title, close);
        this.notificationHistory.appendChild(header);

        if (this.notices.length === 0) {
            const empty = document.createElement("p");
            empty.className = "bm-m3-notification-history__empty";
            empty.textContent = this.copy("noNotificationsRecorded");
            this.notificationHistory.appendChild(empty);
            return;
        }

        const list = document.createElement("ol");
        list.className = "bm-m3-notification-history__list";
        for (const notice of this.notices) {
            const item = document.createElement("li");
            item.className = "bm-m3-notification-history__item";
            item.dataset.level = notice.level;
            const message = document.createElement("p");
            message.textContent = this.copy(notice.messageKey, notice.values);
            const meta = document.createElement("time");
            meta.className = "bm-m3-notification-history__meta";
            meta.dateTime = notice.createdAt;
            meta.textContent = this.copy("notificationMeta", {
                kind: this.copy(notice.level === "alert" ? "alert" : "notice"),
                time: notice.createdAt,
            });
            item.append(message, meta);
            list.appendChild(item);
        }
        this.notificationHistory.appendChild(list);
    }

    /** Records feedback for the bell/history and announces it without drawing over map content. */
    private recordNotice(
        messageKey: MaterialShellCopyKey,
        level: ViewerNoticeLevel = "status",
        values: MaterialShellCopyValues = {},
    ): void {
        const notice: ViewerNotice = {
            id: this.nextNoticeId++,
            messageKey,
            values,
            createdAt: new Date().toISOString(),
            level,
        };
        this.notices.unshift(notice);
        if (this.notices.length > NOTICE_HISTORY_LIMIT) this.notices.pop();
        if (!this.notificationHistory.hidden) this.reviewedNoticeId = notice.id;
        this.notificationAnnouncer.setAttribute("role", level === "alert" ? "alert" : "status");
        this.notificationAnnouncer.textContent = this.copy(messageKey, values);
        this.renderNotificationHistory();
    }

    /** Routes native BlueMap feedback into history only; it never opens an overlay over the map. */
    private readonly handleBlueMapAlert = (event: Event): void => {
        const detail = (event as CustomEvent<{ message?: unknown; level?: unknown }>).detail;
        const message = detail?.message;
        const text = message instanceof Error ? message.message : String(message ?? "");
        if (text.length === 0) return;
        const level = detail?.level === "error" || detail?.level === "warning" ? "alert" : "status";
        this.recordNotice("externalAlert", level, { message: text });
    };

    private handleMapMenuClick(event: Event): void {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset
            .mapAction;
        if (action !== undefined) event.stopPropagation();
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
            this.openSettings(this.mapMenuButton);
            return;
        }
        if (action === "tools") {
            this.openMeasurementTools(this.mapMenuButton);
            return;
        }
        if (action === "notifications") {
            this.closeMapMenu();
            this.openNotificationHistory();
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
            this.recordNotice("noTerrain", "alert");
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

    private async handleMenuClick(event: Event): Promise<void> {
        const action = (event.target as HTMLElement).dataset.action;
        if (action === "cancel") this.closeContextMenu();
        if (action === "copy") {
            const coords = `${this.menu.dataset.x}, ${this.menu.dataset.y}, ${this.menu.dataset.z}`;
            try {
                if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
                await navigator.clipboard.writeText(coords);
                this.recordNotice("coordinatesCopied", "status", { coordinates: coords });
            } catch (error) {
                this.recordNotice("externalAlert", "alert", { message: `Could not copy coordinates: ${String(error)}` });
            }
            this.closeContextMenu();
        }
        if (action === "pin") {
            const waypoint = this.measurementModel.addWaypoint({
                name: this.copy("pinpoint", { count: this.measurementModel.waypoints.length + 1 }),
                coordinate: { x: Number(this.menu.dataset.x), y: Number(this.menu.dataset.y), z: Number(this.menu.dataset.z) },
                dimension: this.measurementModel.currentDimension,
                group: "General",
                tags: ["pinpoint"],
            });
            this.recordNotice("pinSaved", "status", {
                label: waypoint.name,
                x: waypoint.coordinate.x.toFixed(0),
                y: waypoint.coordinate.y.toFixed(0),
                z: waypoint.coordinate.z.toFixed(0),
            });
            this.closeContextMenu();
        }
    }

    private closeContextMenu(): void {
        this.menu.hidden = true;
        this.contextMenuInvoker?.focus();
        this.contextMenuInvoker = null;
    }

    /** Releases document, window, host-copy, and BlueMap-alert subscriptions for discarded maps. */
    dispose(): void {
        document.removeEventListener("click", this.dismiss);
        document.removeEventListener("keydown", this.dismissMapMenuWithEscape);
        document.removeEventListener("keydown", this.dismissContextMenuWithEscape);
        document.removeEventListener("keydown", this.handleGlobalShortcut);
        window.removeEventListener("resize", this.syncViewportLayout);
        this.closeMeasurementTools(false);
        this.root.removeEventListener("bluemapAlert", this.handleBlueMapAlert as EventListener);
        this.unsubscribePresentation?.();
        this.unsubscribePresentation = null;
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
                this.copy("currentCoordinate", { axis: axis.toUpperCase(), value: rounded }),
            );
        }
    }
    private setTheme(theme: string): void {
        const selectedTheme: ThemeName = theme === "light" || theme === "contrast" ? theme : "dark";
        this.root.dataset.theme = selectedTheme;
        this.settings.querySelector<HTMLSelectElement>("#bm-theme")!.value = selectedTheme;
        localStorage.setItem("bluemap-theme", selectedTheme);
    }
}
