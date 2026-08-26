/**
 * Screenshot harness.
 *
 * Captures the real built app through Playwright attached over CDP to the one app cheap
 * Lowlevel launched on an off-screen Win32 desktop, so every image is the actual shipped
 * artifact rather than a mockup, a design file, or a hand-edited picture.
 * This is the only sanctioned way to produce a capture for an issue comment or a release:
 * if a surface cannot be captured here, the honest report is that it has no capture yet.
 *
 * Runs only after Worldlens has been launched through the cheap Lowlevel hidden-desktop
 * route. Output lands in `screenshots/`; the caller may publish that directory as evidence.
 *
 * ## The map is local, and the harness cannot reach the internet
 *
 * The capture used to open the app's default profile, which pointed at the public BlueMap
 * demo somebody else maintains, and pulled real tiles off it on every push (issue #17).
 * It now serves its own map over loopback - a world `packages/worldgen` generated and
 * upstream's BlueMap engine rendered, both in the same CI run - and a network guard
 * refuses and records anything that is not loopback, so the old behaviour cannot come
 * back by accident. See `captureTarget.ts` and the CDP route installed in `beforeAll`.
 *
 * ## Every capture is captioned
 *
 * Each image gets a `<name>.caption.txt` beside it, an entry in `manifest.json`, and a
 * row in `captions.md` that is ready to paste into an issue comment. The caption names
 * what rendered the map, because a screenshot of a rendered world otherwise reads as
 * proof that this project renders worlds, and today it proves the viewer port.
 *
 * Every capture records the window size and display scale in its filename, so a reviewer
 * can tell at a glance which configuration a defect appears in.
 *
 * ## Every surface, or an honest note saying why not
 *
 * The set used to be the shell at four window sizes, four display scales and two colour
 * schemes: ten pictures of the same screen. A reader could not see the settings drawer,
 * the options editor, the wizard or a single dialog, so the documentation described
 * surfaces nobody outside the repository had ever seen.
 *
 * So the harness now opens each of them and photographs it. Two rules keep that honest:
 *
 *   1. **Nothing is staged.** Every surface is opened by driving the real application:
 *      real clicks, real files on disk, the app's own state. No value is planted to make
 *      a screen look populated, and no screen stands in for a different one.
 *   2. **What cannot be reached is recorded, not substituted.** A surface that genuinely
 *      needs a signed-in account, live network traffic or a running render is listed in
 *      `manifest.json` under `skipped`, with the reason. An empty `skipped` is the claim
 *      that everything was captured; a filled one is the claim that it was not.
 *
 * The surfaces are enumerated from the running application rather than from a list kept
 * here - the settings sections from their own `data-anchor` attributes, the options
 * editor's tabs from its tab strip, the wizard's steps from the step each one lands on.
 * A section added in `packages/ui` therefore arrives in this set on its own, instead of
 * being silently missing until somebody notices.
 *
 * ## Three things to know before adding a capture
 *
 * **Do not select a button by its accessible name.** Vuetify upper-cases button labels in
 * CSS, and an accessible name is computed after `text-transform`, so `getByRole("button",
 * { name: "Next" })` matches nothing while the button plainly reads Next. It fails as a
 * thirty-second timeout rather than as a not-found, which reads like a hang. Use
 * `locator(selector, { hasText })`, which matches the text in the DOM, or a class.
 *
 * **A failing test costs the whole manifest.** Playwright discards the worker after a
 * failure and starts a new one, which re-runs `beforeAll` and empties the list of
 * captures this file has accumulated - so the run ends by publishing a manifest that
 * describes only whatever happened after the failure. Every surface is therefore opened
 * inside `attempt`, which records a gap instead of throwing.
 *
 * **`.mb-eula` is not a unique selector, and a bare wait on it hangs forever.**
 * `EulaViewer.vue` is mounted in two places at once once first-run reaches its licence
 * step: the standalone `EulaSurface` panel, always in the DOM behind `v-show` even while
 * closed (see that component's own doc comment on why it is `v-show` and not `v-if`), and
 * the compact copy inside the wizard's `SetupEulaStep`. `page.waitForSelector(".mb-eula",
 * { state: "visible" })` resolves `document.querySelector(".mb-eula")` - the first match
 * in DOM order, which is the always-hidden standalone panel mounted earlier in `App.vue`'s
 * template - and polls *that* element's visibility, never the wizard's. It cannot become
 * visible while closed, so the wait times out no matter how long the budget is; run
 * 31003307669's trace shows exactly that (a clean 15000.0ms timeout, three times, once per
 * worker launch that run spawned) and a diagnostic screenshot moments later shows the real
 * step fully rendered - it was never slow, the wait was watching the wrong element the
 * whole time. Scope the wait to the dialog (`card.locator(".mb-eula")`) and it resolves in
 * about two seconds. Confirmed directly: `page.locator(".mb-eula").count()` is 2 once the
 * step mounts, and `.first().isVisible()` is `false`.
 *
 * **First-run setup is not "one surface" like the others.** It is the one dialog in the
 * whole application that is `persistent` - no Escape, no backdrop dismiss - which is
 * correct product behaviour for the one decision that genuinely must be made before
 * continuing, and exactly why a broken capture of it is not survivable the way a broken
 * capture of, say, the changelog viewer is. If `captureFirstRun` gives up mid-flow (from
 * the bug above, or anything else), the dialog stays open and its scrim blocks every click
 * anywhere else in the shell - not just for the rest of `beforeAll`, but for the first
 * click after every later `page.reload()`, because a reload remounts the app and asks
 * `needsFirstRun()` again, and the answer is still "yes" until the flow's own Finish
 * button has actually been reached. `captureFirstRun` therefore keeps photography and
 * flow-progress on separate failure paths - a failed screenshot must never stop the flow
 * from being driven to completion - and `beforeAll` checks afterwards, in
 * `ensureFirstRunClosed`, that the dialog is really gone before handing control to the
 * rest of the suite.
 */

import { test, expect, chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
    COLOR_SCHEMES,
    CONTRAST_SCHEME,
    DARK_SCHEME,
    LIGHT_SCHEME,
    type SchemeName,
} from "@worldlens/shared";
import { migrationEnvironment, resolveCaptureTarget } from "./captureTarget.js";
import type { CaptureTarget } from "./captureTarget.js";
import { CAPTURE_MATRIX, validateCaptureMatrix } from "./captureMatrix.js";
import {
    appendLedger,
    coverageVerdict,
    readLedger,
    resetLedger,
    type RequiredSurface,
} from "./captureLedger.js";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const shotDir = join(appRoot, "screenshots");

/**
 * The key `packages/ui/src/stores/profiles.ts` persists its profiles under.
 *
 * Hard-coded rather than imported: that module is a Vue store and this process has no
 * Vue. If the key ever changes there, this seeds a value nothing reads and the harness
 * captures an app with no map - which the manifest would then report as `mapDrew: false`
 * rather than passing silently.
 */
const PROFILE_STORAGE_KEY = "worldlens-profiles";

/**
 * The key `packages/ui/src/kid/kidMode.ts` persists the Kid Mode flag under.
 *
 * Hard-coded for the same reason `PROFILE_STORAGE_KEY` above is: `kidMode.ts` is a Vue module
 * this plain Playwright/Node process has no access to. It matters more here than it does for the
 * profile key, because this one defaults to **`true`** - `persisted(KEY_ENABLED, true)` in that
 * file - so a fresh throwaway profile with this key never written opens in Kid Mode, not Adult
 * Mode. Every capture in this file before the dedicated Kid Mode section below was written
 * against the adult shell's own class names (`.wl-home`, `.wl-rail`, `.mb-*`), none of which exist
 * anywhere in the Kid Mode tree - so `pointAppAtCaptureTarget` and `pointAppAtNoMap` write this
 * key explicitly to `"false"` on every reload, exactly as they already write the profile key
 * explicitly rather than trusting an implicit default. Without that, every one of those captures
 * would silently open Kid Mode's shell instead, and every `attempt()` in this file would time out
 * looking for a class Kid Mode never renders - which is a genuinely different failure from "the
 * adult shell broke": it is "the harness never looked at the adult shell at all".
 */
const KID_MODE_STORAGE_KEY = "bluemap-kid-mode";

/**
 * The keys `packages/ui/src/components/setup/setupI18n.ts` persists language mode and the two
 * funny-level sliders under (`MODE_KEY`, `FUNNY_EN_KEY`, `FUNNY_YUE_KEY` there). Hard-coded for
 * the same reason `PROFILE_STORAGE_KEY` and `KID_MODE_STORAGE_KEY` above are: that module is a
 * Vue module this plain Playwright/Node process has no access to, and its own `state` is a
 * module-level `reactive` populated once, at import time, from `readOneOf`/`readInt` - so a
 * value written from outside the page only takes effect on the next fresh mount, exactly like
 * the kid mode flag above.
 *
 * Values are raw strings, not JSON - confirmed against `setupPrefs.ts`'s own `readOneOf`/
 * `readInt` before writing this, rather than assumed from the JSON shape every other seed in
 * this file happens to use: `readOneOf` compares `localStorage.getItem` verbatim against
 * `LANGUAGE_MODES` (`"en" | "yue" | "bilingual"`), and `readInt` runs `Number.parseInt` on the
 * raw string for the funny levels (`"1"`-`"5"`).
 */
const LANGUAGE_MODE_KEY = "worldlens.language.mode";
const LANGUAGE_FUNNY_EN_KEY = "worldlens.language.funny.en";
const LANGUAGE_FUNNY_YUE_KEY = "worldlens.language.funny.yue";

/**
 * The key `packages/ui/src/kid/useKidProgress.ts` persists the sticker/XP ledger under
 * (`KEY_LEDGER` there), for the one capture in the Kid Mode section below that seeds a won
 * sticker rather than photographing the always-empty fresh-install book. Hard-coded for the
 * same reason every other cross-package key above is.
 *
 * Format is `{ xp: number, won: { id: StickerId, at: string }[] }`, read once per
 * `useKidProgress()` call through that module's own defensive `read()`. The sticker id strings
 * this file seeds are copied from `STICKER_DEFINITIONS` there rather than imported - `StickerId`
 * is a union this plain Playwright/Node process cannot import either - which is exactly why the
 * one capture that uses this key says plainly, in its own caption, that the state was planted
 * rather than earned: a renamed sticker id there would silently stop matching anything here, and
 * the honest caption is what stops that silent drift from also becoming a silent false claim.
 */
const KID_PROGRESS_LEDGER_KEY = "bluemap-kid-progress";

/** Window geometries worth proving, including the narrow widths where labels clip. */
const VIEWPORTS = [
    { name: "1280x800", width: 1280, height: 800 },
    { name: "1920x1080", width: 1920, height: 1080 },
    { name: "1024x768", width: 1024, height: 768 },
    { name: "800x600-narrow", width: 800, height: 600 },
];

/**
 * Phone-sized CSS viewports from the redesign contract.
 *
 * The 390px Docker-world-source capture below is deliberately not reused as this proof: that
 * panel is a wizard detail, while these are the rewritten shell's real Home and catalogue
 * surfaces. Keeping the values in one named list makes the capture names, ledger steps and
 * manifest describe the same contract instead of three almost-identical magic numbers drifting
 * apart.
 */
const COMPACT_PHONE_VIEWPORTS = [
    { name: "360x800", width: 360, height: 800 },
    { name: "390x844", width: 390, height: 844 },
    { name: "414x896", width: 414, height: 896 },
] as const;

/** Display scales the sizing rules call out explicitly. */
const SCALES = [1, 1.25, 1.5, 2];

/** The window every surface capture is taken at, so they can be read side by side. */
const SURFACE_VIEWPORT = { width: 1280, height: 800 };

/** Opening a surface involves several waits; the default per-test budget is too small. */
/*
 * Sized so the largest spec can actually attempt every surface it owns.
 *
 * One spec holds 34 surfaces. At the 20s surface budget that needs 680s of attempts in the worst
 * case, against the 300s this used to be, so 17 surfaces were recorded as "the spec ran out of
 * time before this surface was reached" - a gap created by arithmetic rather than by anything
 * wrong with the application. Another 18 hit the surface budget itself. Between them they were
 * 35 of the 37 surfaces the coverage verdict reported as unopenable.
 *
 * Raising this is only safe because each spec now runs against a freshly launched application,
 * so renderer exhaustion cannot accumulate across specs and a longer spec cannot poison its
 * successors. The surface budget deliberately stays at 20s: it is what keeps an abandoned run()
 * short, and overlapping abandoned runs are what crash the renderer.
 */
const SURFACE_TIMEOUT = 900_000;

/** How long to wait for one element. Short enough that a wrong selector is not a hang. */
const ELEMENT_TIMEOUT = 45_000;

/* Opening a surface, as distinct from waiting for one to render. A healthy open is sub-second. */
const OPEN_TIMEOUT = 12_000;

/**
 * How long one step of *reaching* a surface may take, as opposed to rendering it.
 *
 * Deliberately far shorter than {@link ELEMENT_TIMEOUT}, because a miss here is an ordinary
 * outcome rather than an error. Ten of the eleven jobs have no tab at all on a throwaway
 * profile, and a workspace with no maps and no servers genuinely cannot reach some of them.
 *
 * The old value cost the whole manifest. `openJob` chains five of these waits, so on an
 * unreachable surface each spent its full forty-five seconds and the total passed
 * `SURFACE_TIMEOUT`. Playwright then killed the test before `attempt` could catch anything,
 * so the gap-recording path that exists precisely to stop one missing screen costing the
 * other hundred-odd never ran. That is how `captures the map and server profile manager`
 * came to strand all 117 images, and why they had been stale for so long: anybody who
 * changed the interface and tried to refresh them met the same wall.
 *
 * Five steps at this value is well inside the surface budget, which leaves `attempt` the
 * room it needs to do its job.
 */
const REACH_TIMEOUT = 15_000;

let browser: Browser;
let page: Page;
let target: CaptureTarget;
let mapDrew = false;
let rendererNetworkGuardInstalled = false;
const rendererNetworkViolations: string[] = [];

/** What the map area of the window holds while a capture is being taken. */
type MapArea =
    /** A map is loaded and the window shows it. */
    | "map"
    /** A map is loaded, but this surface paints over the whole of it. */
    | "covered"
    /**
     * No profile is active, and this is `pointAppAtNoMap`'s own doing: the active profile was
     * deliberately cleared so the make-a-map wizard would be truthful, per that function's own
     * doc comment. `mapNote()` therefore names the wizard by name for this value - correctly,
     * every time, because nothing else in this file ever sets it.
     */
    | "none"
    /**
     * No profile is active, but not because of the wizard: this run genuinely has no map to
     * serve (`target.mode === "none"`, e.g. `WORLDLENS_CAPTURE_MAP` was never set), and the
     * surface being captured is not the wizard either. Kid Home is the first caller: reusing
     * `"none"` here would have `mapNote()` say a Kid Home capture "is showing the wizard for
     * making one", which is false - Kid Home is not the wizard, and the wizard is not reachable
     * from inside Kid Mode's own tree at all. This value exists so that false clause never gets
     * written, rather than trusting every future caller to remember the distinction.
     */
    | "empty-not-wizard";

let mapArea: MapArea = "map";

/**
 * Where every image, every named gap and every completed step is recorded as it happens.
 *
 * This used to be two arrays in this module, and swapping them for a file is not a tidying: a
 * worker that fails is discarded, the fresh worker re-imports this file with both arrays empty,
 * and the closing tests always run in that *final* worker. So they described only whatever had
 * happened since the last failure. On the run that prompted the change that meant a
 * `manifest.json` claiming five captures and zero gaps sitting beside thirty-four diagnostic
 * images, and a coverage assertion that passed against a list emptied by the very failures it
 * exists to catch. A file survives the restart; an array does not. `captureLedger.ts` carries
 * the rest of the argument, including why it is JSON Lines rather than one document.
 */
const LEDGER = join(shotDir, "capture-ledger.jsonl");

/**
 * True when this invocation is one chunk of a run split across several fresh application
 * launches, per `WORLDLENS_LEDGER_KEEP` above. Read once, here, so `coverageVerdict()` itself
 * stays pure and takes the decision as a plain argument rather than reaching into the
 * environment - see that function's own doc comment in captureLedger.ts.
 */
const CHUNKED_RUN = Boolean(process.env.WORLDLENS_LEDGER_KEEP);

const CAPTURE_BY_NAME = new Map(CAPTURE_MATRIX.map((entry) => [entry.name, entry]));
const CAPTURE_COMMIT = process.env.WORLDLENS_CAPTURE_COMMIT ?? process.env.GITHUB_SHA ?? "";

function resolvedCaptureMetadata(name: string) {
    const entry = CAPTURE_BY_NAME.get(name);
    if (entry === undefined) throw new Error(`capture '${name}' is absent from captureMatrix.ts`);
    if (entry.classification !== "required" || entry.file === null) {
        throw new Error(`capture '${name}' is classified as a soft skip and cannot write an image`);
    }
    if (entry.file !== `${name}.png`) {
        throw new Error(`capture '${name}' is contracted to write ${entry.file}`);
    }
    return {
        alt: entry.alt,
        category: entry.category,
        theme: entry.theme,
        viewport: entry.viewport,
        state: entry.state,
        expectedSurface: entry.expectedSurface,
        commit: CAPTURE_COMMIT,
    };
}

/**
 * A PNG of a single flat colour compresses to almost nothing. The map canvas starting out
 * black means an all-black capture is tiny, which is a cheap and reliable "nothing has
 * drawn yet" signal without decoding pixels.
 */
const EMPTY_FRAME_BYTES = 40_000;

/**
 * Waits until the map has actually drawn something.
 *
 * The viewer streams tiles, so a capture taken the instant the interface mounts
 * photographs an empty scene. That is how a run once produced a full set of screenshots
 * showing black, with the chrome correct and the map missing, which reads as a rendering
 * bug rather than a timing one.
 *
 * Returns whether content arrived, so a caller can record that a capture is of an empty
 * map instead of quietly publishing it as if it were the product.
 */
async function waitForMapContent(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const buffer = await page.screenshot();
        if (buffer.length > EMPTY_FRAME_BYTES) return true;
        await page.waitForTimeout(1000);
    }
    return false;
}

/** What the map area of an image actually contains, in one phrase. */
function mapNote(): string {
    if (mapArea === "none") {
        return "no map is loaded, so the application is showing the wizard for making one";
    }
    if (mapArea === "covered") {
        return "an opaque surface fills the window, so none of the map behind it is visible";
    }
    if (mapArea === "empty-not-wizard" || target.mode === "none") {
        return "no map is loaded; the map area is the app's empty state";
    }
    if (!mapDrew) return "the map had drawn nothing when this was taken, so the map area is empty";
    return target.mode === "remote"
        ? "the map area shows tiles fetched from the remote server named above"
        : "the map area shows the locally rendered world named above";
}

/**
 * A label read off a control, in sentence case.
 *
 * Vuetify upper-cases tab and button labels in CSS, so `innerText` comes back as "WEB
 * SERVER" and a caption written from it shouts. The source calls it "Web server", and
 * that is what a caption should say.
 */
function readableLabel(text: string): string {
    const trimmed = text.trim().toLowerCase();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** A file-name-safe form of a label read off the running interface. */
function slug(text: string): string {
    return (
        text
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "unnamed"
    );
}

/** A control whose direct hit area is part of the compact-shell contract. */
interface CompactTarget {
    /** Human-readable name written into an assertion failure and metrics sidecar. */
    readonly name: string;
    /** Selector for the actual hit target, rather than a text node inside it. */
    readonly selector: string;
    /** Material's compact-target floor for this control's direct hit area. */
    readonly minWidth: number;
    readonly minHeight: number;
}

interface CompactSurfaceMetrics {
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
    readonly documentOverflowX: number;
    readonly bodyOverflowX: number;
    readonly surfaceOverflowX: number;
    /** A missing target is different from a target that happens to be too small. */
    readonly missingTargets: readonly string[];
    /** Target names and measured rectangles for the controls that shrink below their floor. */
    readonly undersizedTargets: readonly string[];
    /** Any visible interactive control that has left the CSS viewport horizontally. */
    readonly clippedControls: readonly string[];
    /** Visible text/content that is still inside a control but cannot be read or reached. */
    readonly internallyClippedControls: readonly string[];
    /** Guards the selectors above against becoming an empty, vacuous assertion. */
    readonly visibleControlCount: number;
}

/**
 * Reads the compact layout from the real renderer.
 *
 * Screenshot pixels can show that a page looks plausible but cannot prove that a control still
 * has a usable hit rectangle, and a rule that checks only selectors it happened to find would
 * pass after a whole row vanished. This reports both directions: every visible interactive
 * control stays in the viewport and every hand-picked primary target still exists and meets its
 * minimum direct size.
 */
async function inspectCompactSurface(
    surface: Locator,
    targets: readonly CompactTarget[],
): Promise<CompactSurfaceMetrics> {
    return surface.evaluate((element, requiredTargets) => {
        const visible = (candidate: HTMLElement): boolean => candidate.getClientRects().length > 0;
        const label = (candidate: HTMLElement): string =>
            candidate.getAttribute("data-test") ??
            candidate.getAttribute("data-destination") ??
            candidate.getAttribute("aria-label") ??
            candidate.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ??
            candidate.tagName.toLowerCase();
        const rectangle = (candidate: HTMLElement): string => {
            const rect = candidate.getBoundingClientRect();
            return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
        };

        // The rail stays beside every shell destination. It is intentionally included even when
        // Home or a catalogue is the surface under test: a phone-width content pane is only usable
        // if its persistent navigation did not become a clipped, unreachable column.
        const roots = [element, document.querySelector<HTMLElement>(".wl-rail")].filter(
            (root): root is HTMLElement => root !== null,
        );
        const controls = new Set<HTMLElement>();
        for (const root of roots) {
            for (const candidate of root.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), [role='button']:not([aria-disabled='true']), [role='combobox']:not([aria-disabled='true'])",
            )) {
                if (visible(candidate)) controls.add(candidate);
            }
        }

        const clippedControls = [...controls]
            .filter((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return rect.left < 0 || rect.right > window.innerWidth;
            })
            .map(label);
        const internallyClippedControls = [...controls]
            .filter((candidate) => {
                const content =
                    candidate.querySelector<HTMLElement>(".v-btn__content") ?? candidate;
                return (
                    content.scrollWidth > content.clientWidth + 1 ||
                    content.scrollHeight > content.clientHeight + 1
                );
            })
            .map(label);

        const missingTargets: string[] = [];
        const undersizedTargets: string[] = [];
        for (const target of requiredTargets) {
            const matches = [...document.querySelectorAll<HTMLElement>(target.selector)].filter(
                visible,
            );
            if (matches.length === 0) {
                missingTargets.push(target.name);
                continue;
            }
            for (const candidate of matches) {
                const rect = candidate.getBoundingClientRect();
                if (rect.width < target.minWidth || rect.height < target.minHeight) {
                    undersizedTargets.push(
                        `${target.name} (${label(candidate)}: ${rectangle(candidate)}; ` +
                            `minimum ${target.minWidth}x${target.minHeight})`,
                    );
                }
            }
        }

        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentOverflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
            surfaceOverflowX: element.scrollWidth - element.clientWidth,
            missingTargets,
            undersizedTargets,
            clippedControls,
            internallyClippedControls,
            visibleControlCount: controls.size,
        };
    }, targets);
}

function expectCompactSurfaceMetrics(
    metrics: CompactSurfaceMetrics,
    viewport: (typeof COMPACT_PHONE_VIEWPORTS)[number],
): void {
    expect(metrics.viewport).toEqual({ width: viewport.width, height: viewport.height });
    expect(metrics.documentOverflowX).toBe(0);
    expect(metrics.bodyOverflowX).toBe(0);
    expect(metrics.surfaceOverflowX).toBe(0);
    expect(metrics.visibleControlCount).toBeGreaterThan(0);
    expect(metrics.missingTargets).toEqual([]);
    expect(metrics.undersizedTargets).toEqual([]);
    expect(metrics.clippedControls).toEqual([]);
    expect(metrics.internallyClippedControls).toEqual([]);
}

async function writeCompactMetrics(name: string, metrics: CompactSurfaceMetrics): Promise<void> {
    await writeFile(
        join(shotDir, `${name}.metrics.json`),
        `${JSON.stringify(metrics, null, 2)}\n`,
        "utf8",
    );
}

const COMPACT_HOME_TARGETS: readonly CompactTarget[] = [
    {
        name: "application-rail destinations",
        selector: ".wl-rail-item",
        minWidth: 44,
        minHeight: 44,
    },
    { name: "application-rail actions", selector: ".wl-rail-action", minWidth: 44, minHeight: 44 },
    { name: "Home search field", selector: ".wl-home .v-field", minWidth: 44, minHeight: 44 },
    {
        name: "Home hero catalogue",
        selector: ".wl-home .wl-hero__body",
        minWidth: 44,
        minHeight: 44,
    },
    {
        name: "Home primary action",
        selector: ".wl-home .wl-hero__primary",
        minWidth: 44,
        minHeight: 44,
    },
    {
        name: "Home catalogue cards",
        selector: ".wl-home .wl-card__body",
        minWidth: 44,
        minHeight: 44,
    },
];

const COMPACT_CATALOGUE_TARGETS: readonly CompactTarget[] = [
    {
        name: "application-rail destinations",
        selector: ".wl-rail-item",
        minWidth: 44,
        minHeight: 44,
    },
    { name: "application-rail actions", selector: ".wl-rail-action", minWidth: 44, minHeight: 44 },
    {
        name: "catalogue search field",
        selector: ".wl-catalogue .v-field",
        minWidth: 44,
        minHeight: 44,
    },
    {
        name: "catalogue feature rows",
        selector: ".wl-catalogue .wl-row",
        minWidth: 44,
        minHeight: 44,
    },
];

interface ShotOptions {
    /**
     * Crop to this element instead of photographing the whole window. Used where the
     * surface is self-contained and a full window would bury it in map pixels.
     */
    readonly crop?: Locator;
    /** What the cropped region is, in words, for the caption. */
    readonly cropped?: string;
    /** Overrides what the caption says about the map area for this one image. */
    readonly mapArea?: MapArea;
    /** Appended to the caption, for anything the picture alone would misrepresent. */
    readonly note?: string;
    /**
     * A renderer-backed image source for a CSS viewport the Electron window itself cannot be
     * resized down to. It still photographs the real page; only Chromium supplies the pixels
     * instead of Playwright's window-level convenience method.
     */
    readonly capture?: () => Promise<Buffer>;
}

/**
 * Moves the pointer somewhere harmless and waits for tooltips to close.
 *
 * Playwright leaves the pointer wherever it last clicked, so the button that opened a
 * surface is still hovered when the surface is photographed and its tooltip sits on top
 * of the thing the capture is of. That tooltip is an artefact of how the harness drives
 * the app, not something a person would see, and publishing it makes the interface look
 * like it has a floating black box over its own search field.
 *
 * The corner of the title bar's drag region is the destination: it is always present, it
 * is not a control, and it has nothing to hover.
 */
async function parkPointer(): Promise<void> {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(350);
}

async function shoot(name: string, surface: string, options: ShotOptions = {}): Promise<void> {
    await mkdir(shotDir, { recursive: true });
    await parkPointer();
    const metadata = resolvedCaptureMetadata(name);

    const previousArea = mapArea;
    if (options.mapArea !== undefined) mapArea = options.mapArea;

    const buffer =
        options.capture !== undefined
            ? await options.capture()
            : options.crop === undefined
              ? await page.screenshot()
              : await options.crop.screenshot();

    // A zero-byte or absent capture is a silent failure; assert it landed. The floor is
    // low because a crop can legitimately be tiny: three window buttons on a flat bar
    // compress to a few hundred bytes, and a threshold set for a full window rejects a
    // perfectly good capture of them.
    expect(buffer.length, `capture ${name} produced no bytes`).toBeGreaterThan(200);
    await writeFile(join(shotDir, `${name}.png`), buffer);
    /*
     * Progress, for `attempt`'s idle watchdog - stamped here, on a file that exists, rather than
     * on entry to this function.
     *
     * Stamping at entry would have counted "started taking a picture" as progress, so an attempt
     * that reached this function and then hung inside it would be reported as having captured
     * something when it had not, and the watchdog's own message would say so. A byte on disk is
     * the only claim worth making.
     */
    lastProgressAt = Date.now();

    const where =
        options.cropped === undefined
            ? `In this image, ${mapNote()}.`
            : `This image is cropped to ${options.cropped} rather than showing the whole window.`;
    const caption = [`${surface}.`, target.caption, where, options.note].filter(Boolean).join(" ");
    await writeFile(join(shotDir, `${name}.caption.txt`), `${caption}\n`, "utf8");
    // The moment this image was taken, recorded per capture rather than per run: a run takes
    // tens of minutes, so one run-level stamp would misdate everything it did not start with,
    // and "how old is this picture" is the question a reader of the gallery is really asking.
    appendLedger(LEDGER, {
        kind: "capture",
        name,
        file: `${name}.png`,
        surface,
        caption,
        ...metadata,
        capturedAt: new Date().toISOString(),
    });

    mapArea = previousArea;
}

/**
 * Runs a step that only tidies up after a capture, and swallows its failure.
 *
 * Housekeeping is not a surface. Reporting a failed one as a missing screen puts a false
 * statement in the manifest beside an image that plainly exists.
 */
async function attemptQuietly(run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch {
        // Deliberately silent: nothing published depends on this succeeding.
    }
}

/** Records a surface this run deliberately did not photograph. */
function skip(surface: string, reason: string): void {
    appendLedger(LEDGER, { kind: "skip", surface, reason });
    console.log(`[harness] skipped ${surface}: ${reason}`);
}

/**
 * Runs one surface's capture sequence, and records a gap rather than failing the run if
 * the surface never appeared.
 *
 * A thrown selector timeout here means one screen is missing from the set. Failing for it
 * would take the other forty with it - see the note at the top of this file about what a
 * failure does to the manifest - and an artifact of forty good captures plus a named gap
 * is far more useful than no artifact at all. The gap is loud: it is in `manifest.json`,
 * in `captions.md`, printed by the final test, and a diagnostic capture of whatever was
 * on screen at the time is written beside the rest.
 *
 * A step that finishes records that it finished, and that entry is not bookkeeping either. Without
 * it the ledger can only see failures, so a step that never ran at all - a worker killed between
 * two tests, or a capture somebody deleted while editing - is indistinguishable from one that ran
 * perfectly. That is precisely the shape of blind spot this whole mechanism exists to close, so
 * closing it in one direction and leaving it open in the other would be no use.
 */
/**
 * The longest one surface may take before it is recorded as a gap.
 *
 * Deliberately well under `SURFACE_TIMEOUT` (300s), because the whole point is to fail inside the
 * test's budget rather than be killed by it.
 *
 * Sixty rather than two hundred, because the abandoned `run()` keeps working after the race is
 * lost, and at two hundred seconds two such surfaces accumulated enough in-flight work to drop
 * the debugging connection outright. A surface that cannot be reached in a minute is not going to
 * be reached in three, so the longer budget bought nothing and cost the run.
 */
/*
 * Sized from what a healthy surface actually costs. Across five full runs the slowest surface
 * that SUCCEEDED took 8.1s, and not one of forty successes exceeded 20s, so a 60s ceiling was
 * roughly ten times the worst real case. The extra fifty seconds only ever bought a longer
 * orphan: `attempt` stops waiting for an abandoned surface, but nothing stops the `run()` it
 * abandoned. Twenty seconds is still 2.5x the worst observed success; a surface that genuinely
 * needs longer should carry its own timeout rather than borrow headroom from every other one.
 */
const SURFACE_BUDGET = 20_000;

/*
 * The budget above is an IDLE budget, not a total one, and the difference is the whole reason
 * this variable exists.
 *
 * Read as a total it starves every attempt that takes more than one picture. "Settings sections"
 * walks nineteen sections and captures each; "Options editor tabs" walks its tabs the same way.
 * Twenty seconds cannot cover nineteen searches, clicks and screenshots however healthy the
 * application is, so those attempts were recorded as unreachable surfaces while the application
 * was answering perfectly - which is precisely the false report `attempt` exists to avoid. It
 * cost the settings sections, both settings rows and the options editor tabs in one run, and it
 * was self-inflicted: this number was 60_000 until 076bedb6 lowered it this morning.
 *
 * What the bound is actually for is a surface that is not coming: a click into an inert shell, a
 * selector that will never match. Those produce no pictures at all, so measuring from the last
 * picture rather than from the start of the attempt keeps that guarantee exactly while letting a
 * working multi-capture attempt run to the end. The spec's own remaining time is still the hard
 * ceiling, so this cannot reintroduce a spec that overruns and discards its worker.
 */
let lastProgressAt = Date.now();

/*
 * A ceiling on the SPEC, not only on each surface inside it.
 *
 * SURFACE_BUDGET promises that one unreachable surface costs one image. It cannot promise
 * that a spec finishes, and the two numbers were chosen independently: the settings spec holds
 * six surfaces at 60s each against a 300s test budget, so six honest gaps overran the test by a
 * minute and it died with every gap correctly recorded. The worst spec in this file holds 34
 * surfaces, which no test timeout could ever absorb, so raising SURFACE_TIMEOUT is not a fix.
 *
 * That mattered far more than one spec: a test killed this way discards its worker, and the
 * next spec's beforeAll then cannot reattach, so the run stops and the finalizers never
 * publish. Twelve specs did not run for exactly this reason while 15 passed and 8 recorded
 * honest gaps. The evidence was complete and none of it reached disk.
 *
 * So each surface takes the smaller of its own budget and whatever the spec has left, and a
 * surface reached with no time left is recorded as a gap immediately instead of spending a
 * budget the spec cannot afford. Gaps stay honest; the run survives to write them down.
 */
const SPEC_RESERVE = 25_000;
const RESET_BUDGET = 45_000;
const MIN_SURFACE_BUDGET = 8_000;

let specStartedAt = Date.now();

/*
 * The start instant only. The budget is read later, at each `attempt`, because specs raise
 * their own ceiling with `test.setTimeout(SURFACE_TIMEOUT)` INSIDE the test body - which runs
 * after this hook. Reading `testInfo.timeout` here yields the 120s config default and produced
 * a deadline of 95s against a real budget of 300s, so surfaces with 105s still available were
 * recorded as out of time. Honest gaps, wrong arithmetic.
 */
/*
 * Reset the renderer between specs, while it is still healthy.
 *
 * One renderer serves the whole file and is never restarted, and it degrades until it stops
 * responding. Instrumenting the first line of `ensureOptionsEditor` showed a bare `isVisible()`
 * taking 147.2s, and three consecutive calls reporting 147.2s, 87.2s and 27.2s: exactly 60s
 * apart, so all three resolved at the same instant. The renderer had frozen and released every
 * queued call at once, then crashed. On a fresh application that same surface opens in 293ms.
 *
 * Measured with this in place: renderer crashes stop, and specs completing rose from 15 to 17.
 *
 * Deliberately here rather than after a failure. Reloading a page that had just failed dropped
 * the debugging connection and turned a passing settings spec back into a failing one, the same
 * fragility this file already records for taking a diagnostic screenshot after a gap. Reloading
 * a page that still answers is a different proposition, and it is what the surrounding helpers
 * are built for: every spec establishes what it needs through its own `ensure*` helper.
 */
test.beforeEach(async () => {
    // Stamped BEFORE the reset, never after. Playwright's test timeout covers beforeEach, so
    // restamping afterwards gave the spec a deadline of start+45s+275s against a 300s budget,
    // and five surfaces at 60s each then overran by exactly that margin.
    specStartedAt = Date.now();
    if (!page) return;
    await Promise.race([
        pointAppAtCaptureTarget(),
        new Promise<void>((resolve) => setTimeout(resolve, RESET_BUDGET).unref?.()),
    ]).catch(() => {});
});

async function attempt(surface: string, run: () => Promise<void>): Promise<void> {
    /*
     * Timed, because "this spec used its whole budget" is not a diagnosis. It was per-surface
     * timings that finally showed nine Home captures each stopping at exactly the action timeout,
     * which is what identified a retired screen rather than a slow one.
     */
    const startedAt = Date.now();
    try {
        /*
         * A hard ceiling on the whole surface, not just on the steps inside it.
         *
         * This function's entire promise is that one unreachable surface costs one image. That
         * promise only holds if it gets to catch, and a test killed by `SURFACE_TIMEOUT` never
         * lets it: the worker is discarded, and this application's debugging endpoint then
         * refuses every later connection for the rest of its life, so a single slow surface has
         * repeatedly cost all 117 images. Measured at 305.1s inside one `openJob` call, against a
         * 300s test budget.
         *
         * Bounding the individual waits was not enough, because there is always one more await
         * with no timeout of its own, and hunting them one run at a time is a losing game. This
         * bounds the sum instead, so the guarantee stops depending on that hunt.
         *
         * The cost, stated plainly: the abandoned `run()` keeps going. That is why this must stay
         * comfortably under the test budget rather than hugging it, and it is survivable only
         * because `actionTimeout` bounds every Playwright action at 45s, so whatever is still in
         * flight gives up on its own shortly after. A surface that trips this is reported as a
         * gap, which is exactly what it is.
         */
        const specBudget = test.info().timeout || SURFACE_TIMEOUT;
        const remaining = specStartedAt + specBudget - SPEC_RESERVE - Date.now();
        if (remaining < MIN_SURFACE_BUDGET) {
            throw new Error(
                `the spec ran out of time before this surface was reached, so it was not ` +
                    `attempted rather than attempted badly. Earlier surfaces in this spec used ` +
                    `the budget; their own gap reasons say why.`,
            );
        }
        const budget = Math.min(SURFACE_BUDGET, remaining);

        /*
         * Two deadlines, and they answer different questions.
         *
         * `hardDeadline` is the spec's: whatever happens, this attempt stops in time for the spec
         * to record its gaps and finish, because a spec killed by the test timeout discards its
         * worker and takes every later spec with it.
         *
         * The idle deadline is the surface's, and it is measured from the last picture rather
         * than from the start. An attempt that has just captured something is demonstrably not
         * hung; an attempt that has captured nothing for `budget` is. Polling at a second is
         * plenty for a bound measured in tens of seconds, and it keeps this to one timer that
         * clears on every exit path instead of a chain of them.
         */
        const hardDeadline = Date.now() + remaining;
        lastProgressAt = Date.now();
        let watchdog: ReturnType<typeof setInterval> | undefined;
        try {
            await Promise.race([
                run(),
                new Promise<never>((_resolve, reject) => {
                    watchdog = setInterval(() => {
                        const idleFor = Date.now() - lastProgressAt;
                        if (idleFor >= budget) {
                            reject(
                                new Error(
                                    `the surface did not finish within ${budget}ms, and captured ` +
                                        `nothing in that time`,
                                ),
                            );
                        } else if (Date.now() >= hardDeadline) {
                            reject(
                                new Error(
                                    `the spec's own budget ran out while this surface was still ` +
                                        `working; it was making progress ${idleFor}ms ago`,
                                ),
                            );
                        }
                    }, 1_000);
                    watchdog.unref?.();
                }),
            ]);
        } finally {
            if (watchdog !== undefined) clearInterval(watchdog);
        }
        console.log(`[harness] ${surface}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        appendLedger(LEDGER, { kind: "step", surface });
    } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        /*
         * Stripped of terminal colour before it goes anywhere near the published record.
         *
         * A locator timeout is plain text, but a failed `expect` is not: its message arrives
         * wrapped in ANSI escape sequences, and `manifest.json` and `captions.md` are read in a
         * browser and a Markdown viewer rather than in a terminal. Left in, a gap's reason renders
         * as `[2mexpect([22m[31mreceived[39m...`, which tells a reader nothing except that
         * something went wrong somewhere - and this is the one field whose whole job is to say
         * what.
         */
        const reason = details.split("\n")[0]?.replace(/\[[0-9;]*m/g, "");
        /*
         * The first line, plus where the rest of it went.
         *
         * One line is the right length for a manifest entry a person skims, and it is enough for
         * the common case - a locator timeout names the thing that was not found. It is useless
         * for the other case: a failed assertion's first line is `expect(received).toEqual(...)`,
         * which says nothing at all about which controls were clipped or undersized. Naming the
         * file that holds the whole failure costs one clause and turns a dead end into a lookup.
         */
        console.log(
            `[harness] ${surface}: gave up after ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
                `, connection ${browser?.isConnected() === true ? "alive" : "GONE"}`,
        );
        skip(
            surface,
            `the harness could not open it in this run: ${reason ?? "unknown error"} ` +
                `(the whole failure is in diagnostic-${slug(surface)}.txt, beside the images)`,
        );
        await writeFile(
            join(shotDir, `diagnostic-${slug(surface)}.txt`),
            `${details}\n`,
            "utf8",
        ).catch(() => undefined);
        /*
         * Bounded, because this is the line that cost the whole manifest.
         *
         * `.catch()` handles a rejection and does nothing at all for a hang, and this config sets
         * no `actionTimeout`, so Playwright's default here is no limit. A page that cannot be
         * photographed therefore stopped the run dead: the gap above was recorded in fifteen
         * seconds and this then sat for the remaining four and a half minutes until the surface
         * timeout killed the test, which is precisely the failure `attempt` exists to prevent,
         * arriving through `attempt`'s own error path.
         *
         * A page that just refused to yield a surface is exactly the page most likely to refuse a
         * screenshot too, so this is the common case rather than a corner. The diagnostic is
         * best-effort by design - `skip` has already recorded what matters, and the text file
         * beside it holds the whole failure - so losing the picture costs a little context and
         * losing the run costs a hundred and seventeen images.
         */
        /*
         * No diagnostic screenshot. It cost the entire run.
         *
         * Photographing a page that has just failed to yield a surface turned out to drop the
         * debugging connection outright, and the run's own log shows it happening between two
         * specs rather than at teardown:
         *
         *     skipped Profile manager: locator.click: Timeout 15000ms exceeded
         *     debugging connection dropped at 15:24:30.048Z
         *     skipped Backup screen: Target page, context or browser has been closed
         *
         * Everything after that dies at `connectOverCDP`, so one unreachable surface still took
         * the whole manifest with it. Bounding the call stopped it hanging and did not stop it
         * being fatal, because the problem was never the wait.
         *
         * The loss is small and the text is the useful half anyway: `diagnostic-<surface>.txt`
         * beside the images already holds the entire failure, call log included, which is what
         * actually names the selector that was not found.
         */
    }
}

/**
 * {@link attempt}, for a surface that cannot exist at all until a map is loaded.
 *
 * Everything reached through the viewer's side sheet is in this category, because the only door to
 * that sheet is the control bar's Menu button and the control bar renders behind `v-if="app"`. A
 * run with no rendered map therefore has no such surface to photograph - not "a surface the
 * harness struggled with", which is what `attempt` would have written after a fifteen-second wait
 * on a button that was never in the document.
 *
 * The distinction is load-bearing rather than cosmetic. The gap this writes is what the coverage
 * assertion reads to decide whether a required surface was excused or genuinely missed, and a run
 * that *does* serve a map is held to the full standard by exactly the same code.
 */
async function attemptOnMap(surface: string, run: () => Promise<void>): Promise<void> {
    if (!hasLoadedMap()) {
        skip(surface, NO_MAP_REASON);
        return;
    }
    await attempt(surface, run);
}

/* -------------------------------------------------------------------------- */
/* Driving the app                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Points the app at the capture target and reloads so it takes effect.
 *
 * The profiles store reads localStorage once, at module load, so the value has to be in
 * place before the document that uses it. Writing it and reloading is what makes the
 * capture deterministic: the same profile, the same map and the same camera in every run,
 * instead of whatever the app happened to remember.
 *
 * Also pins Kid Mode to `"false"`, for the reason `KID_MODE_STORAGE_KEY`'s own doc comment
 * gives: every capture this function points the app at is written against the adult shell, and
 * Kid Mode ships on by default, so leaving this key unwritten would silently point every one of
 * them at a shell they have no selectors for instead. `pointAppAtKidMode()`, in the dedicated Kid
 * Mode section near the end of this file, is the one place that writes the opposite value.
 */
/**
 * Wait for the interface to have actually mounted after a reload.
 *
 * These sites waited for `#app`, the empty div `index.html` ships. It is in the document before a
 * line of the application has run, so the wait returned instantly whether or not anything mounted.
 * `beforeAll` already knew better and waits on `.mb-app`, the class `App.vue` puts on its root;
 * that knowledge just never reached the eight reload sites.
 */
async function waitForAppMounted(): Promise<void> {
    await page.waitForSelector(".mb-app", { timeout: 30_000 });
}

async function pointAppAtCaptureTarget(): Promise<void> {
    const state = JSON.stringify({
        profiles: target.profile === null ? [] : [target.profile],
        activeId: target.profile?.id ?? null,
    });

    await page.evaluate(
        (seed: { profileKey: string; profileValue: string; hash: string; kidModeKey: string }) => {
            window.localStorage.setItem(seed.profileKey, seed.profileValue);
            window.localStorage.setItem(seed.kidModeKey, "false");
            if (seed.hash.length > 0) window.location.hash = seed.hash;
        },
        {
            profileKey: PROFILE_STORAGE_KEY,
            profileValue: state,
            hash: target.locationHash,
            kidModeKey: KID_MODE_STORAGE_KEY,
        },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppMounted();

    /*
     * Back to what the map area of this run actually holds, because `pointAppAtNoMap` took a map
     * away and only this restores it. Leaving the note behind was not a cosmetic slip: `mapNote`
     * is what every caption after that point reads, so a run captioned the rendered-map hero shot
     * itself with "no map is loaded, so the application is showing the wizard for making one",
     * and the README led with that image. A caption that contradicts its own picture discredits
     * the whole manifest rather than only the one line it is wrong about, which is why this is
     * derived from the target here rather than assumed to still be right from the run setup.
     */
    mapArea = target.profile === null ? "none" : "map";
}

/**
 * Clears the active profile and reloads, so the shell shows the make-a-map wizard.
 *
 * The wizard and the map are separate pages in the persistent tab strip. Clearing the
 * active profile makes the wizard page truthful, but a fresh shell still lands on the map
 * tab, so the harness follows the same visible navigation a person would use before it
 * waits for the wizard. It never forces the component into the DOM over another page.
 *
 * Also pins Kid Mode to `"false"`, for the same reason `pointAppAtCaptureTarget` above does:
 * `openJob` below drives the adult Work destination's own tab strip, which does not exist at all
 * inside Kid Mode's tree.
 */
async function pointAppAtNoMap(): Promise<void> {
    await page.evaluate(
        (seed: { profileKey: string; kidModeKey: string }) => {
            window.localStorage.setItem(
                seed.profileKey,
                JSON.stringify({ profiles: [], activeId: null }),
            );
            window.localStorage.setItem(seed.kidModeKey, "false");
            window.location.hash = "";
        },
        { profileKey: PROFILE_STORAGE_KEY, kidModeKey: KID_MODE_STORAGE_KEY },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppMounted();
    /*
     * The wizard is a job in the Work workspace, and this helper has now been wrong about where it
     * lives twice, in the same direction both times.
     *
     * First it assumed an empty profile list put the wizard on screen, which was true only while
     * the shell rendered it whenever `activeId` was null. Then it assumed the wizard's tab was in
     * a strip that existed from the first frame, which was true only while the strip was the
     * shell's top-level navigation. It is now two moves in: the application opens on Home, the
     * strip lives inside the Work destination, and the tab has to be reached through it.
     *
     * Both failures read identically - a thirty-second wait on `.mb-world-wizard` - and both were
     * describing an application that was working perfectly. That is the argument for
     * {@link openJob}: one place that knows how a job is reached, so the next move costs one edit
     * rather than one per caller.
     */
    await openJob("world", /make a map/i, "Make a map");
    await page.waitForSelector(".mb-world-wizard", { timeout: 30_000 });
    mapArea = "none";
}

/* -------------------------------------------------------------------------- */
/* Getting anywhere in the Material Design 3 shell                            */
/* -------------------------------------------------------------------------- */

/**
 * Presses one of the rail's three destinations.
 *
 * `data-destination` is the rail's own stable hook, and it is chosen over the two obvious
 * alternatives for reasons that are not stylistic. The visible label is translated and moves with
 * the language mode, so a text match is a selector that stops working when somebody switches to
 * bilingual. `aria-current` says which destination is *already* active rather than naming the one
 * this wants, so it can be read but never searched by.
 *
 * A class would work today and is exactly what the last three navigation rewrites broke: a class
 * is a styling decision, and styling decisions move. `.mb-shell-fabs`, `.mb-shell-tabs` and
 * `.mb-cb` were each a perfectly good selector on the day it was written.
 */
async function selectDestination(id: "home" | "map" | "work"): Promise<void> {
    /*
     * The options editor first, because while it is open the rail is not a control at all.
     *
     * `App.vue` gives the editor a full-bleed host and marks `.mb-shell-body` - the rail included -
     * `inert` behind it, which is correct product behaviour: the thing behind an opaque surface
     * must not still be reachable with Tab. It also means a click on a rail button is delivered to
     * an inert element and does nothing, silently, while the button remains perfectly visible and
     * `click()` reports success.
     *
     * The failure therefore surfaces several steps later and somewhere else entirely. Two captures
     * were lost to exactly that: an earlier step left the editor open, this pressed Work to no
     * effect, and the run then timed out waiting for a new-tab menu that had never been asked to
     * open - a message about a tab menu, describing a problem with a screen three tests earlier.
     */
    await ensureOptionsEditorClosed();
    const button = page.locator(`[data-destination="${id}"]`);
    await button.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    if ((await button.getAttribute("aria-current")) === "page") return;
    await button.click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(300);

    /*
     * Confirm the destination changed. The comment above describes how a click on an inert shell
     * reports success and goes nowhere; closing the options editor covers one cause, not all. Left
     * unchecked, the failure surfaces much later as a missing selector describing the screen we
     * never reached rather than the navigation that never happened.
     */
    await button
        .and(page.locator('[aria-current="page"]'))
        .waitFor({ state: "visible", timeout: REACH_TIMEOUT })
        .catch(() => {
            throw new Error(
                `the rail did not move to "${id}": the button was clicked and reported success, ` +
                    `but nothing became the current destination.`,
            );
        });
}

/**
 * Work's own tab strip, and nothing else's.
 *
 * Three `TabbedNavigation` instances can be in the document at once - Work's, the settings
 * surface's, and the options editor's - and two of them keep their strip mounted behind `v-show`
 * while closed, which means an unscoped `[role="tab"]` or `[aria-label="Find a tab"]` resolves to
 * elements that are in the DOM and can never be clicked. `.wl-work__tabs` is the class `WorkPane`
 * passes to its own instance, so it names exactly one of the three.
 */
function workTabs(): Locator {
    return page.locator(".wl-work__tabs");
}

/**
 * A tab that is on screen no matter what else the strip is holding.
 *
 * Every capture that right-clicks a tab needs one, and "the tab for the job I just opened" is not
 * it. `openJob` guarantees the job's *panel* is in front, which is what almost every caller wants,
 * but it cannot guarantee the tab itself is visible: `TabStrip.vue` decides what fits by index
 * (`v-show="index < visibleCount"`), not by which tab is active, so by the time this file has
 * opened eight jobs the one it wants is legitimately behind the overflow control. Two captures
 * were lost to exactly that, both reporting a fifteen-second wait for a tab that was working
 * correctly and simply not on screen.
 *
 * The pinned wizard is the answer, and by contract rather than by luck: `TabStrip.vue` measures
 * the pinned region out of the budget before the ordinary tabs, in its own words "so it never
 * overflows and a pinned tab is always reachable". It is also the one tab a fresh workspace has,
 * so this needs nothing opened first.
 *
 * It is right-clicked directly rather than through a label, because a pinned tab draws compact:
 * icon only, no label span, and - the part that matters here - no close button to right-click by
 * accident.
 */
function pinnedWizardTab(): Locator {
    return workTabs().locator('[data-tutorial-anchor="tab-world"]').first();
}

/**
 * Activates a tab, aiming at whatever part of it is safe to press.
 *
 * An ordinary tab carries its own close button over part of its area, so a click on the tab's
 * geometric centre is a coin toss between selecting it and closing it - and when the close button
 * wins, Playwright reports a click timeout on a locator it had already resolved, which reads like
 * a hung application rather than like a tab that has just been removed.
 *
 * A pinned tab renders compact: `TabButton.vue` draws its icon alone, with no label span and no
 * close button at all. So the label cannot be aimed at, and does not need to be. Choosing per tab
 * rather than assuming one shape is what keeps this working for the wizard, which is the one tab
 * a fresh workspace pins.
 */
async function activateTab(tab: Locator): Promise<void> {
    if ((await tab.getAttribute("aria-selected")) === "true") return;
    const label = tab.locator(".mb-tabs-strip__label");
    const aim = (await label.count()) > 0 ? label.first() : tab;
    await aim.click({ timeout: REACH_TIMEOUT });
    await page.waitForTimeout(300);
}

/**
 * Opens a job through the strip's own new-tab menu, which is what that gesture is for.
 *
 * A fresh Work workspace seeds exactly one tab - the pinned wizard - because the strip holds the
 * jobs somebody actually started rather than every destination the application has. Ten of the
 * eleven jobs therefore have no tab at all on a throwaway profile, and no amount of expanding
 * groups or opening overflow menus will find one. This is the route a person uses, and the tab it
 * creates persists in the workspace, so a later capture of the same job finds it already there.
 *
 * The sheet is matched with `:visible` rather than `.first()`. The strip has four menus that each
 * render a `.mb-tabs-strip__sheet` - placement, new tab, overflow and the finder - and while only
 * one can be open at a time, the finder's `v-menu` carries `eager`, so its sheet is mounted from
 * the first frame whether or not anybody has opened it.
 */
async function openJobThroughNewTabMenu(name: string): Promise<void> {
    await workTabs()
        .locator('[aria-label="Open a new tab"]')
        .first()
        .click({ timeout: REACH_TIMEOUT });
    // `hasText` with a plain string, never a regular expression. Playwright normalises whitespace
    // when the matcher is a string and deliberately does not when it is a regex, and a Vuetify
    // list item wraps its label in enough markup to leave newlines either side of it - so an
    // anchored `/^Projects$/` matches a label reading exactly "Projects" not at all, and fails as
    // a fifteen-second timeout on a menu that is open and correct on screen.
    const item = page
        .locator(".mb-tabs-strip__sheet:visible .v-list-item")
        .filter({ hasText: name })
        .first();
    await item.waitFor({ state: "visible", timeout: REACH_TIMEOUT });
    await item.click({ timeout: REACH_TIMEOUT });
    await page.waitForTimeout(400);
}

/**
 * Puts one job's screen in front, however far from the surface it currently is.
 *
 * The one place in this file that knows how a job is reached, so a fourth shell rewrite costs one
 * edit here rather than one per capture.
 *
 * It takes three things because they are matched against three different surfaces and none can do
 * another's work. `pageId` is what `data-tutorial-anchor` carries, which is how this asks "does a
 * tab for this exist at all" without depending on a translated string. `name` is matched against
 * the tab's *accessible name*, which is the only description a pinned tab has - it draws as its
 * icon alone, with no text for a text matcher to find. `label` is a plain string for the new-tab
 * menu, which is the one place a job with no tab yet can be found, and which needs a string rather
 * than a regex for the whitespace reason `openJobThroughNewTabMenu` records.
 *
 * The order matters. A tab that exists is revealed rather than opened again, because the new-tab
 * gesture genuinely means "another one" - `TabbedNavigation.openPage` adds a tab every time it is
 * called - and a harness that reached for it first would leave a strip of duplicates growing
 * across the run and photograph it.
 */
/**
 * How long every route to a surface may take in total.
 *
 * Bounding each step was not enough. `openJob` tries five routes in sequence, each with its own
 * bounded waits, and nothing bounded the sum: a measured run spent 305 seconds here before the
 * test's own 300s budget killed it. That is the difference between losing one image and losing the
 * whole manifest, because a killed test discards its worker and this application's debugging
 * endpoint then refuses every later connection for the rest of its life.
 *
 * At sixty seconds `attempt` catches the throw with time to spare and records its gap, which is
 * exactly what it exists to do.
 */
const REACH_BUDGET = 60_000;

/** Whether the whole reach has spent its budget, so the remaining routes are not worth trying. */
function reachExhausted(startedAt: number): boolean {
    return Date.now() - startedAt >= REACH_BUDGET;
}

async function openJob(pageId: string, name: RegExp, label: string): Promise<void> {
    const reachStartedAt = Date.now();
    await selectDestination("work");
    const strip = workTabs();
    const tab = strip.locator(`[data-tutorial-anchor="tab-${pageId}"]`).first();

    // `count()`, not visibility. An overflowed segment stays in the DOM under `v-show`, so the
    // difference between "this job has no tab" and "its tab does not currently fit" is exactly
    // the difference between opening one and going to find it.
    if ((await tab.count()) === 0) {
        await openJobThroughNewTabMenu(label);
        // `attached`, not `visible`. Opening a job makes its tab the active one but does not
        // promise it fits: the strip's overflow arithmetic runs on the whole row, so on a narrow
        // window a brand-new tab can arrive already behind the overflow control. Falling through
        // to the reveal below handles that rather than asserting a layout this cannot control.
        await tab.waitFor({ state: "attached", timeout: REACH_TIMEOUT });
    }

    if (reachExhausted(reachStartedAt))
        throw new Error(`no route to the "${pageId}" job within ${REACH_BUDGET}ms.`);
    if (await tab.isVisible().catch(() => false)) {
        await activateTab(tab);
        return;
    }

    // Present but off screen, which on a seeded workspace means one of two things: inside a
    // collapsed group, or - once opening a group has made the strip taller - behind the overflow
    // control. Both are the strip working correctly, and both have a route a person would use.
    if (await revealTabInGroups(name)) {
        await activateTab(tab);
        return;
    }

    if (reachExhausted(reachStartedAt))
        throw new Error(`no route to the "${pageId}" job within ${REACH_BUDGET}ms.`);
    await expandShellTabGroups();
    if (reachExhausted(reachStartedAt))
        throw new Error(`no route to the "${pageId}" job within ${REACH_BUDGET}ms.`);
    if (await tab.isVisible().catch(() => false)) {
        await activateTab(tab);
        return;
    }

    if (reachExhausted(reachStartedAt))
        throw new Error(`no route to the "${pageId}" job within ${REACH_BUDGET}ms.`);
    const overflowButton = strip.locator('[aria-label*="do not fit"]').first();
    const hasOverflow = await overflowButton
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    if (!hasOverflow) {
        // Every route failed. Say what the strip actually held rather than reporting a timeout on
        // a locator, which names the thing that was not found and nothing about why - and on a run
        // that mostly happens in CI, that difference is the whole diagnosis.
        throw new Error(`no route to the "${pageId}" job. ` + (await describeShellStrip()));
    }

    await overflowButton.click({ timeout: ELEMENT_TIMEOUT });
    // The plain string again, for the same whitespace reason `openJobThroughNewTabMenu` gives.
    const item = page
        .locator(".mb-tabs-strip__sheet:visible .v-list-item")
        .filter({ hasText: label })
        .first();
    const listed = await item
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    if (!listed) {
        throw new Error(
            `the overflow menu does not list the "${pageId}" job. ` + (await describeShellStrip()),
        );
    }
    await item.click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
}

const CONVERTER_STEP_IDS = [
    "chunker-step-source",
    "chunker-step-target",
    "chunker-step-trim",
    "chunker-step-blocks",
    "chunker-step-settings",
    "chunker-step-review",
    "chunker-step-run",
] as const;

type ConverterStepId = (typeof CONVERTER_STEP_IDS)[number];

/**
 * Opens Convert and walks its own Back/Next controls to one exact step.
 *
 * Each capture is isolated in `attempt()`. A failed earlier capture must not leave every later
 * one on the wrong step, so this reads the step currently rendered and moves from there rather
 * than assuming the previous capture completed.
 */
async function openConverterStep(targetStep: ConverterStepId): Promise<Locator> {
    await openJob("chunker", /^Convert$/i, "Convert");
    const chunker = page.locator('[data-test="chunker-screen"]');
    await chunker.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    const targetIndex = CONVERTER_STEP_IDS.indexOf(targetStep);

    for (let guard = 0; guard < CONVERTER_STEP_IDS.length + 1; guard += 1) {
        const current = await chunker
            .locator('section[data-test^="chunker-step-"]:visible')
            .first()
            .getAttribute("data-test");
        const currentIndex = CONVERTER_STEP_IDS.indexOf(current as ConverterStepId);
        if (current === targetStep) return chunker;
        if (currentIndex < 0)
            throw new Error(`Convert exposed an unknown step: ${String(current)}`);

        const direction = currentIndex < targetIndex ? "Next" : "Back";
        await chunker
            .locator(".mb-chunker-nav .v-btn", { hasText: direction })
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(150);
    }

    throw new Error(`Convert did not reach ${targetStep}`);
}

/** Presses Escape and lets the closing transition finish. */
/*
 * Bounded, because `keyboard.press` has no timeout of its own and `actionTimeout` does not
 * cover it. That is not a theoretical gap: a spec whose surfaces had all finished by ~96s
 * still burned its full 300s test budget here, and the reported error was this exact call
 * (`keyboard.press: Target page, context or browser has been closed`, which is the teardown
 * closing the connection underneath a press that never returned).
 *
 * Why it stalls is the documented cost of the surface race: an abandoned `run()` keeps
 * executing after `attempt` stops waiting for it, so several orphaned surfaces can still be
 * driving the page when the spec reaches its tail. An unbounded press behind that traffic
 * never completes, the test times out, its worker is discarded, and every later spec in the
 * run is lost. Twelve specs did not run for exactly this reason.
 *
 * Escape is a courtesy here, not evidence: nothing is asserted about it, so failing to send it
 * costs nothing, while waiting forever to send it costs the whole run.
 */
const DISMISS_BUDGET = 10_000;

async function dismiss(): Promise<void> {
    await Promise.race([
        page.keyboard.press("Escape"),
        new Promise<void>((resolve) => setTimeout(resolve, DISMISS_BUDGET).unref?.()),
    ]).catch(() => {});
    await page.waitForTimeout(400);
}

/** True when a selector is present and actually visible, without throwing on absence. */
async function visible(selector: string): Promise<boolean> {
    return page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
}

/** The one control in this application that cancels a super confirmation. */
function emergencyExit(): Locator {
    return page.locator(".v-btn", { hasText: "Emergency exit" }).first();
}

/**
 * What the shell's tab strip holds right now, as one line for a failure message.
 *
 * Every tab label, every group header with whether it is open, and whether an overflow
 * button exists at all. A capture that cannot reach a destination is either looking at a
 * strip that never had it, a group that would not open, or an overflow menu that is not
 * there - and those are three different bugs that a locator timeout reports identically.
 *
 * The labels are read from `aria-label` rather than from text content, because a pinned tab draws
 * as its icon alone and has no text at all. Listing it as an empty string would make the one tab a
 * fresh workspace always has look like it was missing, in the message written to explain why
 * something was missing.
 */
async function describeShellStrip(): Promise<string> {
    const shellTabs = workTabs();
    const tabs = await shellTabs
        .locator('[role="tab"]')
        .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("aria-label") ?? node.textContent ?? ""),
        )
        .catch(() => []);
    const heads = shellTabs.locator(".mb-tabs-strip__group-head");
    const groups: string[] = [];
    const count = await heads.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
        const head = heads.nth(index);
        const text = (await head.textContent().catch(() => ""))?.trim() ?? "";
        const open = await head.getAttribute("aria-expanded").catch(() => null);
        groups.push(`${text}=${open ?? "?"}`);
    }
    const overflow = await shellTabs
        .locator('[aria-label*="do not fit"]')
        .count()
        .catch(() => 0);
    return (
        `strip had tabs [${tabs.map((t) => t.trim().replace(/\s+/g, " ")).join(" | ")}], ` +
        `groups [${groups.join(" | ")}], overflow buttons: ${overflow}`
    );
}

/**
 * Presses the command palette's own shortcut and waits for it to render.
 *
 * `Control+Shift+F`, not `Control+K`: the palette used to answer to Ctrl+K, and that
 * shortcut is what this drove until the palette's own module changed its mind about which
 * chord it owns (see `palettePrefs.ts`). Driving the real shortcut here, rather than a
 * selector for a button that opens it, is what would have caught that change - a capture
 * that finds another way in would keep passing the day the documented shortcut stopped
 * working.
 */
async function openPalette(): Promise<void> {
    // Pressed and released one key at a time, rather than as a `"Control+Shift+F"` chord:
    // Playwright tracks modifier state on the page for as long as this run lives, and a
    // chord that left Shift or Control reporting as still held would turn the very next
    // right-click in the suite into a Shift+right-click - which every `AppearanceTarget`
    // and every tab treats as "skip the menu, open the editor" - so a later assertion
    // would fail with a confusing timeout on a menu that was never going to appear.
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("F");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await page.waitForSelector(".mb-palette", { state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
}

/**
 * True when a Vuetify navigation drawer is actually open.
 *
 * A `temporary` drawer stays in the document when it is closed and is slid out of the
 * window with a transform, so it keeps a bounding box and `isVisible()` reports it as on
 * screen. That is how a run concluded the side sheet was already open, never pressed the
 * button that opens it, and then spent fifteen seconds waiting for a page inside a drawer
 * nobody had opened. `v-navigation-drawer--active` is the class Vuetify actually toggles.
 */
async function drawerOpen(selector: string): Promise<boolean> {
    return page
        .locator(`${selector}.v-navigation-drawer--active`)
        .first()
        .isVisible()
        .catch(() => false);
}

/**
 * Whether this run has a rendered map to serve, and therefore whether the viewer exists.
 *
 * More than a caption detail. `ControlBar.vue` renders behind `v-if="app"`, where `app` is the
 * live BlueMap instance, so with no profile there is no control bar - and the control bar's Menu
 * button is the only door to the side sheet. Everything behind that door (the menu pages, the
 * marker filters, the reset-settings gate, the changelog fold inside the Info page) is therefore
 * genuinely not on screen for anybody, not merely hard for a harness to find. `App.vue` says the
 * same thing from the other end: `openChangelog()` returns early when `blueMapApp` is null, and
 * its own comment notes the command palette does not even offer the row without a viewer running.
 *
 * A run with no map records those surfaces as unreachable, with that reason. It does not pretend
 * to have photographed them, and it does not report a working application as broken.
 */
function hasLoadedMap(): boolean {
    return target.profile !== null;
}

/** The reason a map-dependent surface is out of reach, written once so every gap says it. */
const NO_MAP_REASON =
    "this run served no rendered map, so no BlueMap instance exists, so the viewer's control bar " +
    "is not rendered at all - and its Menu button is the only way into the side sheet this " +
    "surface lives in. Set WORLDLENS_CAPTURE_MAP to a rendered web root to capture it";

/**
 * Opens the side sheet and walks back to its root page.
 *
 * The menu button re-opens whatever page was last on the stack, not the root, so a second
 * surface captured after the first would otherwise photograph the first one again.
 *
 * The map destination is selected first. It used to be the map *tab*, back when the strip was the
 * shell's top-level navigation; it is a rail destination now, and the three destinations are
 * stacked layers rather than mounted one at a time - Home and Work are opaque and painted over
 * the map rather than replacing it. So this is a genuine change of what is on screen and not a
 * formality, and skipping it leaves `.mb-cb` present in the tree and covered, which is the one
 * state that reads as "the control bar is missing" while it is working perfectly.
 */
async function openMenuRoot(): Promise<void> {
    await selectDestination("map");
    if (!(await drawerOpen(".mb-side-sheet"))) {
        await page.locator(".mb-cb-menu").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-side-sheet.v-navigation-drawer--active", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
    }
    for (let guard = 0; guard < 6; guard += 1) {
        if (await visible(".mb-main-menu__root")) return;
        const back = page.locator('.mb-side-sheet [aria-label="Back"]');
        if ((await back.count()) === 0) break;
        await back.first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(300);
    }
    await page.waitForSelector(".mb-main-menu__root", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
}

/** Opens one page of the side sheet by the label on its row in the root list. */
async function openMenuPage(label: string, waits: string): Promise<void> {
    await openMenuRoot();
    await page
        .locator(".mb-main-menu__root .mb-menu-option", { hasText: label })
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(waits, { state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
}

/**
 * Makes sure the options editor is not painted over the window before a step that needs
 * the tab strip, a shell button, or the side sheet menu underneath it.
 *
 * The editor's own test closes it by pressing Escape with its host region focused, and an
 * earlier step inside that same test timing out can leave focus somewhere else entirely -
 * which leaves `.mb-config-screen` open, covering the tab strip and everything under it,
 * for every test that runs after it. That is a fact about how a previous step's cleanup
 * can fail, not about the surface a later step means to capture, so closing it here first
 * is what keeps a capture from being reported as an unopenable surface when the real
 * problem was a screen left open by something else.
 */
/**
 * Close the options editor, and prove it closed.
 *
 * The old version pressed Escape once, swallowed every failure, waited a flat 700ms and returned
 * unconditionally without ever re-checking. That made it the single most expensive line in this
 * file, because Escape does not always close the editor: `requestConfigClose` in `App.vue` opens a
 * confirmation instead when the workspace has unsaved changes, and that dialog is Vuetify
 * `persistent`, which ignores Escape and backdrop clicks by design. So a second Escape cannot
 * dismiss it either, and the editor stays open with `.mb-shell-body` inert behind it.
 *
 * Everything downstream then fails identically, because `selectDestination` and
 * `openSettingsSurface` both call this first: clicks land on an inert element, report success, and
 * do nothing. The measured signature is unmistakable - 31 consecutive surfaces each giving up at
 * 20.00 to 20.02 seconds, for over ten minutes, with no variance at all. Cumulative slowdown would
 * have produced rising times; a flat line that starts at the very first surface is one operation
 * blocked the same way every time.
 *
 * So this now answers the confirmation when it appears, and verifies the editor is actually gone
 * rather than assuming a keypress was enough. A helper that cannot fail cannot report, and this one
 * silently cost 32 captures a run.
 */
async function ensureOptionsEditorClosed(): Promise<void> {
    if (!(await visible(".mb-config-screen"))) return;

    await page
        .locator('[role="region"][aria-label="Server configuration"]')
        .press("Escape")
        .catch(() => undefined);
    await page.waitForTimeout(400);

    // The unsaved-changes confirmation, if Escape raised one. Discarding is right here: the
    // harness's throwaway profile has nothing worth keeping, and leaving it open blocks the run.
    const discard = page.getByRole("button", { name: /discard and close/i }).first();
    if (await discard.isVisible().catch(() => false)) {
        await discard.click({ timeout: ELEMENT_TIMEOUT }).catch(() => undefined);
        await page.waitForTimeout(400);
    }

    await page
        .waitForSelector(".mb-config-screen", { state: "hidden", timeout: ELEMENT_TIMEOUT })
        .catch(() => {
            throw new Error(
                "the options editor would not close, so the shell behind it is inert and every " +
                    "later click will be swallowed silently. Escape was pressed and any " +
                    "unsaved-changes confirmation was answered, and `.mb-config-screen` is still " +
                    "visible.",
            );
        });
}

/**
 * Closes the side sheet if it is open.
 *
 * Escape is not enough on its own: the sheet treats it as Back, so from a page two deep
 * it pops one page and stays open. It is 320 pixels wide on the left, which is exactly
 * where the three shell buttons live, so a sheet left open makes the settings and profile
 * captures fail with a click timeout on a button nothing is wrong with. Its own close
 * button is unambiguous, so use that.
 */
/**
 * Expands every collapsed group in the shell's tab strip.
 *
 * A fresh workspace no longer opens as twelve flat tabs: it seeds four loose tabs plus
 * three named, collapsed groups, so most destinations are one disclosure away rather than
 * on screen from the first frame. Every capture that reaches a page by clicking its tab
 * therefore has to open the groups first - without this, `[role="tab"]` matching "Backups"
 * is genuinely not visible and the wait times out on a tab that is working exactly as
 * designed.
 *
 * The same shape of failure this file already documents for the profile manager, whose
 * capture went on clicking a floating button the shell had deliberately deleted. A harness
 * that navigates by clicking has to be told when navigation changes; it cannot infer it,
 * and it fails slowly and quietly when nobody does.
 *
 * Idempotent, cheap, and safe to call before any tab click: a group already expanded is
 * left alone, and a strip with no groups at all - which is what a saved workspace from an
 * earlier build restores - simply finds nothing to do.
 */
/**
 * Opens one group header, and insists.
 *
 * Playwright's `click()` runs actionability checks first - visible, stable, hit-testable,
 * enabled - and in CI those checks fail on a header that is, by every other measure, a
 * perfectly ordinary button: the instrumented run reported the three groups present, named,
 * collapsed and unobstructed, with no overflow button, and still could not press one. The
 * checks are the right default for a test that is asserting a control is usable; they are
 * the wrong default for a harness that is only trying to get somewhere in order to
 * photograph it, and a swallowed failure there turns into "the harness could not open
 * Projects", which is a sentence about a screen that works.
 *
 * So: the real click first, because where it works it exercises the real thing, then a DOM
 * `click()` through `evaluate`, which dispatches straight at the element and cannot be
 * blocked by a hit-test or a stability wait. `TabStrip.vue` binds an ordinary `@click`, so
 * the handler runs identically either way.
 */
async function pressGroupHead(head: import("@playwright/test").Locator): Promise<boolean> {
    const clicked = await head
        .click({ timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
    if (clicked) return true;
    return head
        .evaluate((element) => {
            (element as HTMLElement).click();
        })
        .then(() => true)
        .catch(() => false);
}

async function expandShellTabGroups(): Promise<void> {
    // Re-queried every pass rather than iterated over a snapshot, because expanding one
    // group changes the strip: the tabs it reveals take height, and on a short window that
    // pushes a later group out of the strip and into the overflow menu, where its header no
    // longer exists. A loop holding a stale handle then waits the full timeout on an element
    // that has been gone since the first click.
    for (let guard = 0; guard < 8; guard += 1) {
        const collapsed = workTabs()
            .locator('.mb-tabs-strip__group-head[aria-expanded="false"]')
            .first();
        if ((await collapsed.count()) === 0) return;
        // Short timeout and swallowed: a header that scrolls or overflows away mid-click is
        // the strip behaving correctly, and the caller has its own overflow fallback for the
        // tab it actually wants.
        if (!(await pressGroupHead(collapsed))) return;
        await page.waitForTimeout(150);
    }
}

/**
 * Opens collapsed groups one at a time, looking for `label`, and closes each one again when
 * it is not the one holding it.
 *
 * Expanding every group at once is what a first attempt did, and it works on a roomy window
 * and fails in CI: the seeded strip is vertical, a short viewport fits only so many rows, and
 * three groups' worth of revealed tabs push the later tabs - and then the group headers
 * themselves - into the overflow menu, so the very control the search depends on goes out of
 * reach. Opening one at a time keeps the strip about as tall as it started, which is the
 * state the overflow fallback was written against.
 *
 * Returns true when the tab is on screen and can be clicked.
 */
async function revealTabInGroups(label: RegExp): Promise<boolean> {
    const shellTabs = workTabs();
    // By accessible name, not by text content. A pinned tab renders as its icon alone with no
    // label span at all, so `hasText` matches nothing for it however plainly the strip shows it -
    // which is exactly how the wizard tab, the one tab a fresh workspace always has, became
    // invisible to this harness while being perfectly visible on screen.
    const tab = shellTabs.getByRole("tab", { name: label }).first();

    for (let guard = 0; guard < 8; guard += 1) {
        const collapsed = shellTabs
            .locator('.mb-tabs-strip__group-head[aria-expanded="false"]')
            .first();
        if ((await collapsed.count()) === 0) return false;

        if (!(await pressGroupHead(collapsed))) return false;
        await page.waitForTimeout(150);

        const visible = await tab
            .waitFor({ state: "visible", timeout: 1_000 })
            .then(() => true)
            .catch(() => false);
        if (visible) return true;

        // Not this one: put it back, so the strip stays short for the next attempt and the
        // capture that follows photographs a strip in its seeded shape rather than one this
        // harness quietly unfolded.
        const justOpened = shellTabs
            .locator('.mb-tabs-strip__group-head[aria-expanded="true"]')
            .first();
        await pressGroupHead(justOpened);
        await page.waitForTimeout(100);
    }
    return false;
}

async function closeSideSheet(): Promise<void> {
    for (let guard = 0; guard < 6; guard += 1) {
        if (!(await drawerOpen(".mb-side-sheet"))) return;
        const close = page.locator('.mb-side-sheet [aria-label="Close the menu"]');
        if ((await close.count()) === 0) {
            await dismiss();
            continue;
        }
        await close.first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
    }
}

/**
 * A real Minecraft world folder for the wizard, generating one if nothing was supplied.
 *
 * The wizard's first step probes the folder it is given through the main process, so a
 * made-up path fails the probe and the step never advances - correctly. Only a real world
 * satisfies it, and this repository can write one, so a run with nothing to point at makes
 * its own rather than recording four captures as skipped. It is small on purpose: these
 * captures need a world the wizard accepts, not a world worth rendering.
 *
 * A supplied path still wins, and a generator that fails still yields null - the skip is
 * the honest outcome then, and it says which command failed.
 */
function captureWorldFolder(): string | null {
    const explicit = migrationEnvironment(
        process.env,
        "WORLDLENS_CAPTURE_WORLD",
        "MATERIAL_BLUEMAP_CAPTURE_WORLD",
    );
    if (explicit !== null && existsSync(explicit)) return explicit;

    const cli = resolve(here, "../../worldgen/dist/cli.js");
    if (!existsSync(cli)) return null;

    const out = join(tmpdir(), "worldlens-capture-world");
    try {
        // Deterministic seed: the same world every run, so a capture that changes is a
        // change in the application rather than in the terrain behind it.
        execFileSync(process.execPath, [cli, "--seed", "1", "--size", "64", "--out", out], {
            stdio: "pipe",
            timeout: 240_000,
        });
    } catch (error) {
        console.log(
            `[harness] could not generate a capture world: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
        );
        return null;
    }

    const world = readdirSync(out, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(out, entry.name))
        .find((folder) => existsSync(join(folder, "level.dat")));
    return world ?? null;
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Takes one first-run step's screenshot(s) without letting a failed capture stop the flow
 * from being driven to completion.
 *
 * Every other surface in this file costs only itself when its capture fails, because
 * `attempt` isolates it. First-run setup cannot be isolated the same way: the dialog it
 * lives inside is `persistent`, so the only thing that ever gets it off screen is actually
 * reaching Finish, and a photography failure - a bad crop, a write error, a stray
 * assertion - must never be allowed to leave the click sequence stalled partway through.
 */
async function captureFirstRunStep(surface: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
        skip(surface, `the harness could not capture it in this run: ${reason}`);
    }
}

/**
 * Photographs the first-run flow, then completes it.
 *
 * It has to run before anything else, because it is a blocking dialog over every other
 * surface - which is exactly why the app shows it once, on a fresh profile, and never
 * again. The harness launches with a throwaway user-data directory so it is genuinely a
 * first run, and follows the repository owner's standing verification choice: it accepts
 * the Mojang download consent, which is a real answer and is remembered by the throwaway profile.
 */
async function captureFirstRun(): Promise<void> {
    const appeared = await page
        .waitForSelector(".mb-setup-card", { state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!appeared) {
        skip(
            "First-run setup",
            "the application did not ask: this launch was not a first run, which happens when " +
                "WORLDLENS_ACCEPT_DOWNLOAD is set or the user-data directory already " +
                "records a completed setup",
        );
        return;
    }

    const card = page.locator(".mb-setup-card");
    const actions = page.locator(".mb-setup-card__actions .v-btn");

    await captureFirstRunStep("First-run setup: welcome", async () => {
        await shoot(
            "firstrun-1-welcome",
            "First-run setup, the welcome step, with the three language modes and a separate funny level for each language",
            { crop: card, cropped: "the first-run dialog" },
        );
        await shoot(
            "firstrun-1-welcome-window",
            "First-run setup as it appears over the whole application window on a fresh profile",
        );
    });

    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    // The licence became its own step. Keep the capture honest: wait for that real
    // viewer, then press its Next control before looking for the consent question. The
    // old harness clicked once and waited for `.mb-setup-outcomes`, which left the EULA
    // dialog open and made every later tab click hit Vuetify's overlay scrim.
    //
    // Scoped to `card`, not `page`: `EulaViewer.vue` is also mounted, always, inside the
    // standalone `EulaSurface` panel (`v-show`-hidden while closed, never removed from the
    // DOM), so an unscoped `.mb-eula` matches that permanently-hidden copy first and a wait
    // on it never resolves - see the module doc comment for how this was confirmed.
    await card.locator(".mb-eula").waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: licence", async () => {
        await shoot(
            "firstrun-2-eula",
            "First-run setup, the Minecraft licence step, with the document provenance and its anchored search",
            { crop: card, cropped: "the first-run dialog" },
        );
    });
    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-outcomes", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: consent", async () => {
        await shoot(
            "firstrun-2-consent",
            "First-run setup, the Minecraft files step, which asks once whether the application may download from Mojang and says what each answer means",
            { crop: card, cropped: "the first-run dialog" },
        );
    });

    // Accept is the repository owner's explicit standing choice for Worldlens verification.
    // The answer remains confined to this run's throwaway profile.
    await page.locator(".mb-setup-card__answer").nth(0).click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-storage", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(400);
    await captureFirstRunStep("First-run setup: storage", async () => {
        await shoot(
            "firstrun-3-storage",
            "First-run setup, the map storage step, which asks where rendered maps should be written",
            { crop: card, cropped: "the first-run dialog" },
        );
    });

    await actions.last().click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-setup-card", { state: "detached", timeout: 20_000 });
}

/**
 * Last-resort recovery when `captureFirstRun` could not drive the dialog to completion.
 *
 * `attempt` keeps a thrown step from failing the whole run, but for this one surface that
 * is not the same as making it safe to continue: the dialog is still open, still
 * `persistent`, and about to survive the `page.reload()` that follows - because
 * `needsFirstRun()` is asked fresh on every mount and the answer is still "yes" until
 * `completeFirstRun()` has actually been called. Left alone, that reload does not clear
 * the dialog, it recreates it, open, at the welcome step, for whichever test runs next.
 *
 * So this checks for exactly that: the card still attached after `captureFirstRun`
 * returned. If it is, the run is told so - this is a real gap, not a silent recovery -
 * and the harness calls the app's own `completeFirstRun()` bridge method directly, the
 * same call the flow's own Finish button makes. That is not a fake dismissal: nothing
 * here touches the scrim, the dialog's `visible` state, or any CSS. It is the one honest
 * way left to make "first run is over" true without repeating the same click sequence
 * that just failed for a reason this function does not know.
 */
async function ensureFirstRunClosed(): Promise<void> {
    const stillOpen = await page.locator(".mb-setup-card").count();
    if (stillOpen === 0) return;

    skip(
        "First-run setup: completion",
        "the flow did not reach Finish in this run; completing it directly through the " +
            "bridge so the dialog does not reopen after the reload that " +
            "follows",
    );
    await page
        .evaluate(async () => {
            const bridge = (
                window as unknown as {
                    worldlens?: { completeFirstRun?: () => Promise<unknown> };
                }
            ).worldlens;
            await bridge?.completeFirstRun?.();
        })
        .catch(() => {
            // Nothing left to try from here; `pointAppAtCaptureTarget` still reloads next,
            // and if the dialog reopens the affected tests will report it honestly rather
            // than hang silently, exactly as they did before this recovery existed.
        });
}

/* -------------------------------------------------------------------------- */
/* Setup and teardown                                                         */
/* -------------------------------------------------------------------------- */

test.beforeAll(async () => {
    await mkdir(shotDir, { recursive: true });
    /*
     * Emptied by the first worker only, and that condition is the whole mechanism rather than a
     * detail of it.
     *
     * Playwright gives every worker process a unique, increasing `workerIndex`, and a worker
     * started to replace one that failed gets a *new* index rather than reusing the old one. So
     * index zero is the one worker that is genuinely the start of the run. A reset that ran in
     * every `beforeAll` would erase everything recorded before the crash on precisely the runs
     * this file exists to keep evidence from - reintroducing the lost-record bug through the door
     * marked "housekeeping".
     *
     * `WORLDLENS_LEDGER_KEEP` opts out of the reset entirely, for a run split into chunks.
     * That is not a convenience: a page reload does NOT restart the renderer PROCESS, so
     * process-level exhaustion survives every in-run reset and the renderer still crashes part
     * way through. A fresh application per chunk is the only true reset, and each chunk is its
     * own `playwright test` invocation whose first worker is also index zero - so without this,
     * every chunk erases the evidence the chunks before it recorded. The caller truncates the
     * ledger once before the first chunk, which is the whole run's real starting point.
     *
     * The same flag also tells the closing coverage assertion, through `CHUNKED_RUN` below, that
     * a surface skipped in one chunk and completed in another is not a contradiction: the
     * completed step is a real capture written by a later, independent attempt, not a second
     * reading of the same one. See `coverageVerdict()`'s `chunked` parameter in captureLedger.ts.
     */
    if (test.info().workerIndex === 0 && !process.env.WORLDLENS_LEDGER_KEEP)
        resetLedger(LEDGER);
    expect(validateCaptureMatrix(CAPTURE_MATRIX), "captureMatrix.ts is incomplete").toEqual([]);
    expect(
        CAPTURE_COMMIT,
        "WORLDLENS_CAPTURE_COMMIT must be the exact lowercase candidate commit",
    ).toMatch(/^[0-9a-f]{40}$/u);

    target = await resolveCaptureTarget();
    console.log(`[harness] capture mode: ${target.mode}`);
    console.log(`[harness] caption: ${target.caption}`);

    /*
     * The app is already running on a named off-screen Win32 desktop. This harness never
     * launches it: `.claude/skills/run-worldlens/launch-headless.cmd` is invoked only through
     * cheap Lowlevel's `launch_on_headless_desktop`, with a fresh profile and a task-scoped CDP
     * port, then this process attaches to that exact hidden process.
     *
     * Failing closed on a missing port is deliberate. The old `_electron.launch()` fallback put
     * a real window on the user's visible desktop, so a convenience fallback here would turn a
     * capture command into a focus-stealing privacy defect.
     */
    const cdpPort = process.env.WORLDLENS_CDP_PORT;
    if (cdpPort === undefined || !/^\d{2,5}$/u.test(cdpPort)) {
        throw new Error(
            "WORLDLENS_CDP_PORT is required. Launch Worldlens first through cheap Lowlevel " +
                "launch_on_headless_desktop and the committed run-worldlens launcher; this " +
                "harness will not open a visible fallback.",
        );
    }

    /*
     * One attempt, deliberately, and the failure message says why a retry is not coming.
     *
     * When a spec fails, Playwright discards the worker and re-runs this hook, and that second
     * connect times out against an application that is provably still running: liveness sampled
     * every ten seconds across a whole failing run, always answering, no crash event, nothing in
     * its own log. `/json/list` keeps replying throughout, because that is plain HTTP; it is the
     * browser-level websocket that never completes its handshake again.
     *
     * A retry was tried and measured: both attempts time out, two seconds apart. So the refusal
     * is permanent for the life of that application, not a race, and no amount of reconnecting
     * inside one run will recover it. Anything that fixes this has to either stop the first spec
     * failing or relaunch the application between workers, which this harness deliberately
     * cannot do: it never launches the app, on purpose, so that a capture command can never put
     * a window on somebody's visible desktop. See issue #171.
     */
    browser = await chromium
        .connectOverCDP(`http://127.0.0.1:${cdpPort}`)
        .catch((error: unknown) => {
            throw new Error(
                `could not attach to the hidden Worldlens on port ${cdpPort}. If an earlier spec ` +
                    `failed in this run, its worker was discarded and the debugging endpoint will ` +
                    `refuse every later connection for the life of that application, however ` +
                    `healthy it looks. Relaunch it before running again. Original: ` +
                    `${error instanceof Error ? error.message.slice(0, 120) : String(error)}`,
            );
        });
    const contexts = browser.contexts();
    const pages = contexts.flatMap((context) => context.pages());
    expect(
        pages.length,
        "the hidden Worldlens CDP endpoint must expose exactly one page target",
    ).toBe(1);
    page = pages[0]!;

    /*
     * Every downstream failure reads `Target page, context or browser has been closed`, and that
     * one sentence covers three different bugs: the app quit, its renderer died, or only this
     * process's socket dropped. `crash` fires only for the renderer, so a line here means the
     * application broke and no line means the socket did.
     */
    page.on("crash", () => console.log(`[harness] RENDERER CRASHED at ${new Date().toISOString()}`));
    browser.on("disconnected", () =>
        console.log(`[harness] debugging connection dropped at ${new Date().toISOString()}`),
    );

    const windowUrl = new URL(page.url());
    expect(
        ["127.0.0.1", "localhost", "[::1]"],
        "the sole CDP page target is not the hidden Worldlens loopback renderer",
    ).toContain(windowUrl.hostname);

    /*
     * Refuse renderer requests beyond the app's own loopback origin and the explicitly selected
     * capture target. The old ElectronApplication route installed the same rule through the main
     * process; CDP owns this hidden renderer instead, so its route is the boundary available here.
     */
    const allowedOrigins = new Set([windowUrl.origin, ...target.allowedOrigins]);
    await page.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());
        if (
            (requestUrl.protocol === "http:" || requestUrl.protocol === "https:") &&
            !allowedOrigins.has(requestUrl.origin)
        ) {
            rendererNetworkViolations.push(`${route.request().method()} ${requestUrl.origin}`);
            await route.abort("blockedbyclient");
            return;
        }
        await route.continue();
    });
    rendererNetworkGuardInstalled = true;

    page.on("console", (msg) => console.log(`[renderer:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[renderer:pageerror] ${err.message}`));
    page.on("requestfailed", (req) =>
        console.log(`[renderer:requestfailed] ${req.url()} ${req.failure()?.errorText ?? ""}`),
    );

    await page.waitForLoadState("domcontentloaded");
    console.log(`[harness] window url: ${page.url()}`);

    // Wait on the Vue mount point, which index.html always contains, rather than on a
    // Vuetify class that only exists once the app has successfully mounted. If mounting
    // failed we still want a capture of the broken state.
    await waitForAppMounted();
    await mkdir(shotDir, { recursive: true });
    await page.setViewportSize(SURFACE_VIEWPORT);

    // `.mb-app` is the class App.vue puts on its `<v-app>` root. Do NOT wait on
    // `.v-application`: Vuetify 3.13 does not emit it, so that selector reports a
    // perfectly mounted app as broken, and a false alarm here would mask a real one.
    const mounted = await page
        .waitForSelector(".mb-app", { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!mounted) {
        // Bounded for the same reason as the one in `attempt`: an application that never mounted
        // is the one most likely to refuse a screenshot as well, and an unbounded wait here would
        // turn a diagnosable startup failure into a run that simply stops with nothing to read.
        await page.screenshot({
            path: join(shotDir, "diagnostic-unmounted.png"),
            timeout: REACH_TIMEOUT,
        });
        const html = await page.content();
        await writeFile(join(shotDir, "diagnostic-unmounted.html"), html);
        console.log(`[harness] Vuetify root never appeared; captured the broken state instead.`);
        console.log(`[harness] body length: ${html.length}`);
    }

    // First, because it is a blocking dialog over everything else. Guarded, because a
    // failure here must cost this one surface rather than the whole set - which
    // `ensureFirstRunClosed` right after is what actually makes true, since `attempt` on
    // its own only stops the exception, not the dialog it left open.
    await attempt("First-run setup", captureFirstRun);
    await ensureFirstRunClosed();

    await pointAppAtCaptureTarget();

    // Give the map a chance to draw before anything is captured. Recorded rather than
    // asserted: a capture of an empty map is still useful evidence, but it must be
    // labelled as one instead of being published as the product.
    mapDrew = target.profile === null ? false : await waitForMapContent();
    mapArea = target.profile === null ? "none" : "map";
    if (target.profile === null) {
        console.log("[harness] no map to capture; the app is captured with an empty map area");
    } else {
        console.log(
            mapDrew
                ? "[harness] map drew content before capturing"
                : "[harness] WARNING: no map content appeared; captures show an empty scene",
        );
    }
});

test.afterAll(async () => {
    await browser?.close();
    await target?.close();
});

test("captures the render location choice for routing evidence", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    /*
     * The render-location card belongs to the Make a map job and is deliberately absent while a
     * render is in flight (`WorldScreen.vue` gates it on `wizardOpen`), so the truthful
     * empty-profile state is restored before the job is opened.
     *
     * `pointAppAtNoMap` already opens that job and waits for the wizard, so re-finding the tab
     * here was redundant even before it was wrong - and it was wrong in a way worth recording,
     * because the tab it looked for is on screen the whole time. `page.locator('[role="tab"]', {
     * hasText: /Make a map/i })` matches on DOM text, and this particular tab has none: it is the
     * one tab a fresh workspace pins, `TabButton.vue` draws a pinned tab compact - icon only, no
     * label span - and its name lives in `aria-label` and `title` instead. So the wait was for
     * text that never renders, on an element measuring 36 by 38 pixels in plain sight, and it
     * failed as a thirty-second timeout that reads like a hung application.
     *
     * That is the argument for preferring an accessible name over a text match everywhere in this
     * file: the accessible name is what the control actually calls itself, and it is the one
     * string that survives a compact rendering, a translation and an icon-only redesign.
     */
    await pointAppAtNoMap();
    /*
     * A taller window for this one crop, the same trick the appearance-editor capture uses.
     *
     * The card is roughly 1,100 pixels tall - four render routes, Docker's live daemon state and
     * the machine list - and `Locator.screenshot()` on an element taller than the window scrolls
     * and stitches. The stitching is where it goes wrong: the last band comes back blank, because
     * the wizard's own scroll container has already reached its end, so the picture is the top of
     * a card and then a third of a page of white. The committed capture this replaces had the same
     * flaw, which is a good reason to fix it rather than to keep it.
     *
     * More vertical room is the whole fix. Nothing about the card changes at this height - the
     * shell has no breakpoint between them - so this is a bigger window rather than a different
     * screen.
     */
    await page.setViewportSize({ width: SURFACE_VIEWPORT.width, height: 1400 });
    await page.waitForTimeout(400);
    const card = page.locator(".mb-run-location");
    await card.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shoot(
        "run-location",
        "The render-location choice: local, Docker on this computer, and another machine over SSH, with Docker's real daemon state and the route that will actually be used",
        { crop: card, cropped: "the render-location card", mapArea: "covered" },
    );
    await page.setViewportSize(SURFACE_VIEWPORT);

    // The remaining capture sequence needs the rendered-map shell again. Keep the
    // wizard state truthful for this shot, then restore the target profile before
    // menu, popup, and viewer captures run.
    await pointAppAtCaptureTarget();
});

/* -------------------------------------------------------------------------- */
/* The window itself                                                          */
/* -------------------------------------------------------------------------- */

test("captures the window's own chrome", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Material title bar", async () => {
        const bar = page.locator(".mb-titlebar");
        await bar.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "chrome-titlebar",
            "The application's own Material title bar, the whole width of the window, with no operating system caption bar above it",
            { crop: bar, cropped: "the title bar" },
        );
        await shoot(
            "chrome-titlebar-window-buttons",
            "The minimize, maximize and close buttons the application draws for itself, because the window is frameless",
            { crop: page.locator(".mb-titlebar-controls"), cropped: "the window buttons" },
        );
    });

    /*
     * The whole window on the Map destination, with the rendered world in it and nothing opened
     * over it.
     *
     * Every other map-bearing capture here is cropped to a control, or is showing a theme, or has
     * a side sheet across a third of the width. None of them is a picture of the thing this
     * application exists to produce, which is why the README's own lead image was a screenshot of
     * Home: a list of catalogue cards, from a program whose entire point is that it turns a
     * Minecraft save into a map you can fly around.
     */
    await attempt("Rendered map", async () => {
        if (!hasLoadedMap()) {
            skip("Rendered map", NO_MAP_REASON);
            return;
        }
        await selectDestination("map");
        const bar = page.locator(".mb-cb");
        await bar.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // The tiles arrive over loopback a few at a time, and a capture taken the instant the
        // control bar appears photographs a half-drawn world. There is no event for "the renderer
        // has stopped fetching", so this waits for the network to go quiet and then a little
        // longer, which is the honest version of the same idea.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(2500);
        await shoot(
            "rendered-map",
            "The Map destination with a world rendered by upstream BlueMap's Java engine and served " +
                "to the application over loopback: the map itself filling the window, the application " +
                "rail down the left, and the viewer's control bar with its live coordinates above it",
        );
    });

    await attempt("Viewer control bar", async () => {
        if (!hasLoadedMap()) {
            skip("Viewer control bar", NO_MAP_REASON);
            return;
        }
        await selectDestination("map");
        const bar = page.locator(".mb-cb");
        await bar.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "chrome-control-bar",
            "The viewer control bar: the menu button, the map, marker and player lists, the view and day-night switches, the live position inputs and the compass",
            { crop: bar, cropped: "the control bar" },
        );
    });

    /*
     * The application rail, where the three floating buttons used to be.
     *
     * This step used to photograph `.mb-shell-fabs`, and that stack is not merely restyled or
     * moved - it is deliberately deleted, to the point that `App.shellFabClearance.test.ts`
     * asserts the string `mb-shell-fab` no longer appears in the shell's source at all. Its
     * destinations went to the rail's footer, which `AppRail.vue`'s own doc comment argues is the
     * difference between chrome and litter: chrome has somewhere to live.
     *
     * So the capture follows them rather than being deleted with them. A gallery that simply lost
     * a picture of "how you reach settings" would be a gallery that stopped answering the question
     * the old image was there to answer.
     */
    await attempt("Application rail", async () => {
        const rail = page.locator(".wl-rail");
        await rail.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "chrome-app-rail",
            "The application rail: the three destinations - Home, Map and Work - each with its visible label, the Work badge counting open jobs, and a footer holding search, notifications and settings",
            { crop: rail, cropped: "the application rail" },
        );
    });

    await attempt("Map empty state", async () => {
        if (hasLoadedMap()) {
            skip(
                "Map empty state",
                "this invocation loaded a real rendered map, so the empty Map state does not " +
                    "exist; the paired no-map invocation captures it instead",
            );
            return;
        }
        await selectDestination("map");
        const empty = page.locator(".mb-map-state");
        await empty.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "map-empty-state",
            "The Map destination with no profile selected: the honest no-map message and the direct route into Make a map",
            { crop: empty, cropped: "the Map destination's empty state", mapArea: "unavailable" },
        );
    });

    await attempt("Work destination", async () => {
        await selectDestination("work");
        const work = page.locator(".wl-work");
        await work.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "work-destination",
            "The complete Work destination: its browser-style job strip and the active real job surface beneath it",
            { crop: work, cropped: "the Work destination", mapArea: "covered" },
        );
    });
});

/**
 * `worldlens.dimsum.testOverride.v1`, matched exactly against the key `DimSumSurprise.vue`
 * reads in `readTestOverride`. Hard-coded rather than imported, for the same reason
 * `PROFILE_STORAGE_KEY` is: this is a plain Playwright/Node test with no access to the
 * `packages/ui` Vite build, so the string has to travel by agreement rather than by import.
 */
const DIMSUM_TEST_OVERRIDE_KEY = "worldlens.dimsum.testOverride.v1";

/**
 * The dim sum startup surprise, forced to win its one-in-ten draw.
 *
 * A real 10% chance is not a surface a capture run can reach by waiting - that would need on
 * the order of ten launches, and this harness gets one. `DimSumSurprise.vue`'s own doc comment
 * explains the honest way out: a `localStorage` key that nothing in the shipped product ever
 * writes, read once at mount, that both forces the draw to win and supplies the dish list
 * itself so the real fetch to the public catalog - which would otherwise be the one deliberate
 * reach past loopback in this whole harness - never runs. Production behaviour is untouched:
 * every real launch finds the key absent and draws exactly the same 10% chance it always did.
 *
 * The override is written before a reload rather than after, because the component draws once
 * on mount and the mount that matters is the one about to happen. It is removed again
 * afterwards and the target profile restored, exactly as the World wizard step above restores
 * it after its own detour - so every capture that runs after this one meets the same profile
 * every other capture in this file expects, not a page left mid-reload by this one.
 */
test("captures the dim sum startup surprise", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Dim sum surprise", async () => {
        await page.evaluate(
            (seed: { key: string; value: string }) => {
                window.localStorage.setItem(seed.key, seed.value);
            },
            {
                key: DIMSUM_TEST_OVERRIDE_KEY,
                value: JSON.stringify({
                    dishes: [
                        {
                            id: "har-gow",
                            nameEn: "Har gow",
                            nameZhHant: "蝦餃",
                            imageUrl: null,
                        },
                    ],
                }),
            },
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppMounted();

        const surprise = page.locator(".mb-dimsum-surprise");
        await surprise.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "dimsum-surprise",
            "The dim sum startup surprise: a non-blocking, auto-dismissing corner snackbar naming one dish in both languages. Forced to win its draw by a screenshot-harness-only localStorage override that also supplies the dish, so the capture never has to reach the public dish catalog; production code never writes this key and draws the real one-in-ten chance every other launch",
            { mapArea: "covered" },
        );

        await page.evaluate((key: string) => {
            window.localStorage.removeItem(key);
        }, DIMSUM_TEST_OVERRIDE_KEY);
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppMounted();
        await ensureFirstRunClosed();
        await pointAppAtCaptureTarget();
    });
});

/**
 * Home, which is where the application now opens and had no capture at all.
 *
 * The five catalogues are the shell's answer to a tab strip that used to hold every destination
 * the application had: the strip is short now because Home is where the eighty-five features are
 * discovered. A gallery with no picture of it describes an application whose first screen is a
 * mystery - and, worse, an audit of this file found the same shape of hole in the palette, the
 * appearance editor and the changelog, where a change deleting any of them outright would have
 * left the run green.
 */
test("captures the Home destination and one of its catalogue pages", async () => {
    /*
     * Retired: this photographed a screen the product no longer has.
     *
     * `8f417d73` (2026-08-22) replaced the Home index with `HomeDashboard`, leaving
     * `HomeScreen.vue` and `HomeCatalogues.vue` unreferenced in the tree in case it needed
     * reverting. Nothing renders them, so these waits could only expire, and at forty-five
     * seconds each they exhausted the budget and stopped the matrix publishing at all. Every
     * committed image has been frozen since that date for this reason alone. See issue #171.
     */
    skip(
        "Home screen",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Home catalogues",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Home catalogue page",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
});

/* -------------------------------------------------------------------------- */
/* The compact redesign shell                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The redesign contract calls out phone-width browser visits at 360, 390 and 414 CSS pixels.
 *
 * The desktop's narrowest supported window is still 800px, so an 800px capture cannot prove
 * this. Nor can the Docker-world-source step below: it is one wizard panel and would stay green
 * if the persistent rail, Home cards, catalogue rows or their search fields began clipping.
 * These routes exercise the actual rewritten shell at every named compact width and write one
 * capture plus one metrics sidecar per surface, so the ledger says precisely which surface was
 * proven rather than leaving a reviewer to infer it from an unrelated wizard image.
 */
test("captures the redesigned Home shell at compact phone viewports", async () => {
    /*
     * Retired: this photographed a screen the product no longer has.
     *
     * `8f417d73` (2026-08-22) replaced the Home index with `HomeDashboard`, leaving
     * `HomeScreen.vue` and `HomeCatalogues.vue` unreferenced in the tree in case it needed
     * reverting. Nothing renders them, so these waits could only expire, and at forty-five
     * seconds each they exhausted the budget and stopped the matrix publishing at all. Every
     * committed image has been frozen since that date for this reason alone. See issue #171.
     */
    skip(
        "Compact Home catalogues (360 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Compact Home catalogue page (360 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Compact Home catalogues (390 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Compact Home catalogue page (390 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Compact Home catalogues (414 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
    skip(
        "Compact Home catalogue page (414 CSS px)",
        "the screen it photographed was replaced by HomeDashboard in 8f417d73 " +
            "(2026-08-22); nothing renders the old component. See issue #171.",
    );
});

test("captures the shell at every supported window size", async () => {
    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(300);
        await shoot(`shell-${viewport.name}`, `The application shell at ${viewport.name}`);
    }
    await page.setViewportSize(SURFACE_VIEWPORT);
});

test("captures the shell at every supported display scale", async () => {
    for (const scale of SCALES) {
        await page.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
        }, scale);
        await page.waitForTimeout(300);
        await shoot(
            `shell-scale-${String(scale).replace(".", "_")}x`,
            `The application shell at ${scale * 100}% display scale`,
        );
    }
    await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
    });
});

test("captures the map popup retained at the lower-right viewport edge", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    if (target.profile === null) {
        skip("Map popup at the viewport edge", "this run has no rendered map to click");
        return;
    }

    await selectDestination("map");
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(500);

    const canvas = page.locator("#map-container canvas").first();
    if (!(await canvas.isVisible().catch(() => false))) {
        skip(
            "Map popup at the viewport edge",
            "the packaged app exposed no visible map canvas in this run, so there is no truthful block to click",
        );
        return;
    }
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox, "the live viewer canvas had no measurable bounds").not.toBeNull();

    const popup = page.locator(".bm-marker-popup").first();
    const edgeOffsets = [24, 48, 80, 120, 160];
    let opened = false;
    for (const bottom of edgeOffsets) {
        for (const right of edgeOffsets) {
            await page.mouse.click(
                canvasBox!.x + canvasBox!.width - right,
                canvasBox!.y + canvasBox!.height - bottom,
            );
            await page.waitForTimeout(250);
            if (await popup.isVisible()) {
                opened = true;
                break;
            }
        }
        if (opened) break;
    }

    expect(opened, "no rendered block near the lower-right canvas edge opened the popup").toBe(
        true,
    );

    const geometry = await popup.evaluate((element) => {
        const wrapper = element.parentElement;
        const container = wrapper?.parentElement;
        if (!wrapper || !container) return null;
        const rect = wrapper.getBoundingClientRect();
        const bounds = container.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            boundsLeft: bounds.left,
            boundsTop: bounds.top,
            boundsRight: bounds.right,
            boundsBottom: bounds.bottom,
        };
    });

    expect(geometry, "the popup had no CSS2D wrapper and container").not.toBeNull();
    expect(geometry!.left).toBeGreaterThanOrEqual(geometry!.boundsLeft - 1);
    expect(geometry!.top).toBeGreaterThanOrEqual(geometry!.boundsTop - 1);
    expect(geometry!.right).toBeLessThanOrEqual(geometry!.boundsRight + 1);
    expect(geometry!.bottom).toBeLessThanOrEqual(geometry!.boundsBottom + 1);

    await shoot(
        "issue-105-popup-edge",
        "The block-coordinate popup opened from a real map click near the lower-right viewport edge, with every coordinate row retained inside the map",
        {
            note: `Measured popup ${Math.round(geometry!.right - geometry!.left)}×${Math.round(geometry!.bottom - geometry!.top)} pixels inside CSS2D bounds ${Math.round(geometry!.boundsRight - geometry!.boundsLeft)}×${Math.round(geometry!.boundsBottom - geometry!.boundsTop)} pixels.`,
        },
    );

    await page.setViewportSize(SURFACE_VIEWPORT);
});

/*
 * A test named "captures each navigable page" used to sit here, and it is deleted rather than
 * repaired because it had stopped being a test at all.
 *
 * It walked `.v-navigation-drawer .v-list-item` and photographed whatever it found. The shell has
 * had no `v-navigation-drawer` full of destinations for a long time - navigation is the rail, then
 * Work's tab strip - so `count()` was zero, the loop ran zero times, and the test passed by doing
 * nothing. It is not merely stale in this tree either: the *committed* manifest, captured before
 * the Material Design 3 rewrite, contains no `page-*.png` at all, so it had already been silently
 * photographing nothing for at least one shell generation.
 *
 * That is the failure mode this file keeps meeting from different directions. A rule about
 * well-formed records is satisfied by a record that does not exist; a loop over a collection is
 * satisfied by an empty collection. What replaces it is not another enumeration but named steps
 * that each fail loudly when their surface will not open - the Home captures above, and `openJob`
 * driving every job screen below - all of them on the required-surface list, where an absence is a
 * red run rather than a quietly shorter gallery.
 */

/**
 * The scheme's own `surface`, as Vuetify writes it into a custom property: `"248,249,251"`.
 *
 * Read from `@worldlens/shared`, which is where the three schemes live and the only place
 * they live - the Vuetify themes in `packages/ui/src/vuetify.ts` are built from these exact
 * objects. A literal here would be a second authority that agrees with the product until
 * somebody edits one of them.
 */
function surfaceTriple(scheme: SchemeName): string {
    const hex = COLOR_SCHEMES[scheme].surface.replace("#", "");
    const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
    return `${channel(0)},${channel(2)},${channel(4)}`;
}

/**
 * Chooses a colour scheme the way a person does, and waits until it has actually been painted.
 *
 * `page.emulateMedia({ colorScheme })` stood here, and it moved nothing whatsoever. The app
 * consults `prefers-color-scheme` only while the chosen theme is "follow the system", and a
 * fresh profile does not choose that: `themeSetting.ts`'s `FRESH_INSTALL_THEME` is an explicit
 * dark, deliberately, so that a majority of installs do not open with a bright frame around a
 * lit 3D world. So the media query the harness was emulating had no reader, and the pair it
 * produced was one picture written to two filenames - byte-identical, same md5, in both the
 * no-map and the map-loaded runs. It photographed a colour-scheme switch in which nothing
 * switched, and nothing about it looked wrong: two files, two captions, a green test.
 *
 * The wait is on the applied value rather than on a timeout for the same reason: a fixed
 * `waitForTimeout` after a control that reaches nothing waits exactly as successfully as one
 * after a control that works. `--v-theme-surface` is what the rail and the panels behind this
 * capture are actually painted from, so a wait that sees it change has seen the thing the
 * photograph is about to record.
 */
async function chooseColourScheme(scheme: SchemeName): Promise<void> {
    await openSettingsSection("display", "Display and ease of use");

    /*
     * By position, not by label. `THEME_CHOICES` in `themeSetting.ts` is the order the row
     * renders - follow the system, dark, light, contrast - while the labels are localised and
     * Vuetify upper-cases them in CSS, which is the trap this file's own header warns about:
     * an accessible name computed after `text-transform` matches nothing and fails as a
     * timeout rather than as a not-found.
     */
    const choices = page.locator(`${APP_SETTINGS} .mb-theme-row__toggle .v-btn`);
    await choices.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await choices
        .nth(scheme === "dark" ? 1 : scheme === "light" ? 2 : 3)
        .click({ timeout: ELEMENT_TIMEOUT });

    // The settings panel covers the destination this capture is of, so it goes away before the
    // wait rather than after it - the scheme applies to the whole shell either way.
    await dismiss();

    /*
     * Escape hands focus back to the button that opened the panel, which is correct behaviour and
     * ruins the photograph: that button is the rail's Settings, a focused rail button shows its
     * tooltip, and the capture then publishes a floating black label over the interface with a
     * focus ring beside it. `parkPointer` already solves the hover half of exactly this; nothing
     * solved the focus half, because until now nothing in this file opened a panel and then
     * photographed what was behind it.
     */
    await page.evaluate(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement) focused.blur();
    });

    const expected = surfaceTriple(scheme);
    await page.waitForFunction(
        (want: string) => {
            const root = document.querySelector(".mb-app");
            if (root === null) return false;
            return (
                getComputedStyle(root)
                    .getPropertyValue("--v-theme-surface")
                    .replace(/\s+/gu, "") === want
            );
        },
        expected,
        { timeout: ELEMENT_TIMEOUT },
    );
    await page.waitForTimeout(400);
}

/**
 * The colour that covers most of a capture's application rail.
 *
 * Modal rather than a single sampled pixel because the rail carries icons, a selected
 * destination's pill and a badge; a fixed coordinate lands on one of them the first time
 * somebody adds a destination, and the assertion then fails for a reason that has nothing to
 * do with the theme. The rail's own bounding box comes from the running page, so this does not
 * encode where the rail happens to sit today either.
 */
async function dominantRailColour(
    file: string,
    box: { x: number; y: number; width: number; height: number },
    pageWidth: number,
): Promise<string> {
    const image = sharp(file);
    const meta = await image.metadata();
    const scale = (meta.width ?? pageWidth) / pageWidth;
    const region = {
        left: Math.round(box.x * scale),
        top: Math.round(box.y * scale),
        width: Math.max(1, Math.round(box.width * scale)),
        height: Math.max(1, Math.round(box.height * scale)),
    };

    const { data, info } = await sharp(file)
        .extract(region)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const tally = new Map<string, number>();
    for (let at = 0; at + info.channels <= data.length; at += info.channels) {
        const hex = `#${[data[at]!, data[at + 1]!, data[at + 2]!]
            .map((value) => value.toString(16).padStart(2, "0").toUpperCase())
            .join("")}`;
        tally.set(hex, (tally.get(hex) ?? 0) + 1);
    }

    let winner = "";
    let best = -1;
    for (const [hex, count] of tally) {
        if (count > best) {
            winner = hex;
            best = count;
        }
    }
    return winner;
}

test("captures light, dark and high-contrast themes", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    /*
     * The map destination, because it is the one this pair is documented as being of and the one
     * that carries the surface most likely to be left behind by a theme: the viewer's own control
     * bar, which is the viewer's chrome rather than the shell's and reads the same tokens only
     * because `styles/markers.scss` maps them across.
     */
    await selectDestination("map");

    /*
     * There is no camera settle before these two captures, and that is a decision rather than an
     * omission. The viewer's camera is live and keeps moving on its own, so the two shots - which
     * are now seconds apart, because changing the scheme means opening a panel and pressing a real
     * control rather than emulating a media query - show the world a few degrees apart. Measured
     * across one pair: about 5% of the map area differs, and it does not converge, so a wait for
     * two matching frames would burn its whole budget every run and then fall out of the loop
     * reporting success. That is a timeout wearing a wait's clothing, which this file has been
     * bitten by before. The chrome is what this pair is of; the caption says so, and the assertion
     * below reads the chrome rather than the world.
     */

    const rail = page.locator(".wl-rail").first();
    const viewport = page.viewportSize();
    expect(
        viewport,
        "no viewport size; the capture would have no scale to measure against",
    ).not.toBeNull();

    const painted = new Map<string, string>();

    for (const scheme of ["light", "dark", "contrast"] as const) {
        await chooseColourScheme(scheme);
        await shoot(`theme-${scheme}`, `The application shell in the ${scheme} theme`);

        const box = await rail.boundingBox();
        expect(
            box,
            `the application rail was not on screen for the ${scheme} capture`,
        ).not.toBeNull();
        painted.set(
            scheme,
            await dominantRailColour(join(shotDir, `theme-${scheme}.png`), box!, viewport!.width),
        );
    }

    /*
     * The assertion is on the photograph, not on the setting.
     *
     * A test that reads the theme back out of the app would have passed throughout the entire
     * period these two files were identical: the value was always stored, and storing it was
     * never the thing that was broken. So this reads the pixels that were actually written to
     * disk, against the schemes in `@worldlens/shared` that the product itself is painted from.
     */
    expect(painted.get("light"), "the light capture's rail is not the light scheme's surface").toBe(
        LIGHT_SCHEME.surface.toUpperCase(),
    );
    expect(painted.get("dark"), "the dark capture's rail is not the dark scheme's surface").toBe(
        DARK_SCHEME.surface.toUpperCase(),
    );
    expect(
        painted.get("contrast"),
        "the high-contrast capture's rail is not the high-contrast scheme's surface",
    ).toBe(CONTRAST_SCHEME.surface.toUpperCase());
    expect(
        painted.get("light"),
        "the two colour-scheme captures are the same picture; the scheme reached nothing",
    ).not.toBe(painted.get("dark"));
    expect(
        painted.get("contrast"),
        "the high-contrast capture is the dark capture under a different filename",
    ).not.toBe(painted.get("dark"));

    // Left the way a fresh install opens, so every capture after this one is the shipped default
    // rather than whichever scheme this test happened to finish on.
    await chooseColourScheme("dark");
});

/* -------------------------------------------------------------------------- */
/* The side sheet menu                                                        */
/* -------------------------------------------------------------------------- */

test("captures every page of the menu", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attemptOnMap("Menu, root page", async () => {
        await openMenuRoot();
        await shoot(
            "menu-root",
            "The main menu, listing maps, markers, settings and info, then the camera and screenshot actions",
        );
    });

    await attemptOnMap("Maps menu", async () => {
        await openMenuPage("Maps", ".mb-maps-menu");
        await shoot("menu-maps", "The maps menu, listing the maps the active profile serves");
    });

    await attemptOnMap("Settings menu", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");
        await shoot(
            "menu-settings",
            "The viewer settings menu inside the side sheet, with its own search bar at the top",
        );
    });

    await attemptOnMap("Info page", async () => {
        await openMenuPage("Info", ".mb-info-page, .mb-info-page__empty");
        await shoot("menu-info", "The info page, with the application version at the foot of it");
    });

    await attemptOnMap("Marker menu", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");
        await shoot(
            "menu-markers",
            "The marker menu, showing the marker sets of the map that is loaded",
        );
    });

    // Inside the marker menu, and therefore behind the same map precondition as the menu
    // itself: `MarkerMenu.vue` only offers "Make your own markers" while the active set is
    // empty, which a throwaway capture profile's map always is, so the button is on screen
    // by construction rather than by luck.
    await attemptOnMap("Marker studio", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");
        await page
            .locator('[data-test="marker-open-studio"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const studio = page.locator('[data-test="marker-studio"]');
        await studio.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "marker-studio",
            'The marker studio, opened from the marker menu\'s own "Make your own markers" button: the panel that lets somebody add markers of their own, kept in a set separate from anything a server or a marker file supplies',
        );
    });

    await closeSideSheet();
});

test("captures the menu search bar and its regex builder", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attemptOnMap("Menu search bar", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        await page
            .locator(".mb-side-sheet .mb-menu-searchbar__head .v-btn")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-menu-search", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.locator(".mb-menu-search input").first().fill("re");
        await page.waitForTimeout(500);
        await shoot(
            "menu-search",
            "The settings menu's own search bar, filtering the menu down to the settings that match what was typed",
        );

        await page.locator(".mb-menu-search__builder").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-regex-builder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
        await shoot(
            "menu-regex-builder",
            "The regex builder anchored to the menu's search bar, with its flags, its character classes, anchors, groups, alternation and quantifiers, and the live matches underneath",
            { crop: page.locator(".mb-regex-builder"), cropped: "the regex builder" },
        );
        await dismiss();
    });

    await closeSideSheet();
});

test("captures the reset-settings super confirmation", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attemptOnMap("Reset settings super confirmation", async () => {
        await openMenuPage("Settings", ".mb-side-sheet .mb-settings");

        await page
            .locator(".mb-side-sheet .mb-menu-option", { hasText: "Reset All Settings" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-super-confirm", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(400);

        const gate = page.locator(".mb-super-confirm");
        await shoot(
            "super-confirm-untouched",
            "The destructive-action gate before either key is turned: the slider will not move, and the status line says both keys are needed",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        const keys = page.locator(".mb-super-confirm__keys input[type='checkbox']");
        await keys.nth(0).click({ force: true });
        await page.waitForTimeout(300);
        await shoot(
            "super-confirm-one-key",
            "The destructive-action gate with one key turned, which is still not enough to arm the slider",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        await keys.nth(1).click({ force: true });
        await page.waitForTimeout(400);
        await shoot(
            "super-confirm-armed",
            "The destructive-action gate with both keys turned and the slider armed, one full drag away from resetting every viewer setting",
            { crop: gate, cropped: "the confirmation dialog" },
        );

        // Emergency exit rather than the slider. Driving the slider to the end really does
        // reset every setting and reload the page, and a capture is not worth doing that.
        await emergencyExit().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
    });

    await closeSideSheet();
});

test("captures the marker menu's filter and sort controls", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attemptOnMap("Marker search and sort controls", async () => {
        await openMenuPage("Markers", ".mb-marker-menu");

        const toggle = page.locator(".mb-marker-menu__filters-head .v-btn");
        if ((await toggle.count()) === 0) {
            skip(
                "Marker search and sort controls",
                "the map this run captured carries no markers, so the marker menu has no marker " +
                    "section and its search and sort controls are not on screen to photograph",
            );
            return;
        }

        if (!(await visible("#mb-marker-filters"))) {
            await toggle.first().click({ timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
        }
        await shoot(
            "menu-marker-filters",
            "The marker menu's search and sort controls: the search field with its plain-text and regular-expression modes, and the sort order choice",
        );

        await page
            .locator(".mb-marker-search__builder-button")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-regex-builder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
        await shoot(
            "menu-marker-regex-builder",
            "The regex builder opened from the marker search field",
            { crop: page.locator(".mb-regex-builder"), cropped: "the regex builder" },
        );
        await dismiss();
    });

    await closeSideSheet();
});

/* -------------------------------------------------------------------------- */
/* Shell surfaces                                                             */
/* -------------------------------------------------------------------------- */

test("captures the map and server profile manager", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Profile manager", async () => {
        // It used to open from a floating button, and this clicked that button. The shell
        // removed it when it became tabbed - a tab and a FAB reaching one surface are two
        // navigation models arguing on one screen - so this waited fifteen seconds for a
        // control that was deliberately deleted, and the capture quietly left the set.
        // Through `openJob`, which is the one place that knows every way a job screen can be
        // out of reach on a fresh workspace: the strip lives inside the Work destination, most
        // jobs have no tab at all until somebody opens one, and a tab that does exist can be
        // inside a collapsed group or behind the overflow control. Reaching for the tab here
        // directly is what left this capture out of the set through two shell rewrites running.
        await openJob("servers", /maps and servers/i, "Maps and servers");
        await page.waitForSelector('[role="tabpanel"]', {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        // `attached`, not `visible`: the listbox is always rendered, but with no maps and no
        // servers yet it has no rows, so it has no height, and Playwright calls a
        // zero-height element invisible. Waiting for it to be seen is waiting for somebody
        // to add a server first.
        await page.waitForSelector(".mb-profiles__list", {
            state: "attached",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "profiles-manager",
            "The maps and servers manager on its own tab in the Work destination, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, with the fields for adding another",
            { mapArea: "covered" },
        );
    });
});

/*
 * The node-graph creation mode.
 *
 * Reached through the wizard screen rather than through its own tab, because that is where a
 * person meets it: the toggle sits above the wizard and swaps which presentation is shown. Both
 * drive one shared model, so the canvas is photographed against the same half-built project the
 * wizard would have shown.
 */
test("captures the project canvas and its nodes", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Project canvas", async () => {
        await openJob("world", /make a map/i, "Make a map");
        await page
            .locator('[data-test="creation-mode-canvas"]')
            .first()
            .click({ timeout: OPEN_TIMEOUT });
        await page.waitForSelector('[data-test="project-canvas"]', {
            state: "visible",
            timeout: OPEN_TIMEOUT,
        });
        await page.waitForTimeout(600);
        await shoot(
            "project-canvas",
            "The project canvas: one world feeding a dimension, identity, and the options and " +
                "storage that fork off it, ending at the render node.",
            { mapArea: "covered" },
        );
    });

    await attempt("Project canvas node search", async () => {
        const search = page.locator('[data-test="canvas-search"] input').first();
        await search.waitFor({ state: "visible", timeout: OPEN_TIMEOUT });
        await search.fill("storage");
        await page.waitForTimeout(500);
        await shoot(
            "project-canvas-search",
            "Searching the canvas marks the matching node rather than hiding the others, so the " +
                "project keeps its shape while a person looks for one box.",
            { mapArea: "covered" },
        );
        await search.fill("");
    });
});

test("captures the backup screen", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Backup screen", async () => {
        // Through `openJob`, which is the one place that knows every way a job screen can be
        // out of reach on a fresh workspace: the strip lives inside the Work destination, most
        // jobs have no tab at all until somebody opens one, and a tab that does exist can be
        // inside a collapsed group or behind the overflow control. Reaching for the tab here
        // directly is what left this capture out of the set through two shell rewrites running.
        await openJob("backups", /backups/i, "Backups");
        await page.waitForSelector(".mb-backup", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "backups",
            "Backing a world or a rendered map up to GitHub release assets: what to pack, where it goes, and the notice saying nobody is signed in to GitHub on this computer yet. The screen states why this uses release assets rather than Git LFS, and the pointer format it writes",
            { mapArea: "covered" },
        );
    });
});

/**
 * The application's settings panel, told apart from the viewer's settings *menu*.
 *
 * Both render a `.mb-settings` root - `AppSettings.vue` and the side sheet's `SettingsMenu.vue` -
 * and they are two entirely different surfaces with two different searches inside them. A bare
 * `.mb-settings` therefore matches whichever the DOM happens to reach first once a map is loaded
 * and the side sheet has been opened, which is exactly the situation every capture below runs in.
 * `AppSettings` is the one wrapped in a `DockedSurface`, so `.mb-docked` names it and only it.
 */
const APP_SETTINGS = ".mb-settings.mb-docked";

/**
 * Opens the application's settings panel from the rail footer.
 *
 * The three floating buttons this used to press are deleted, not moved - `App.shellFabClearance.test.ts`
 * asserts the source no longer mentions `mb-shell-fab` at all - and settings is an ordinary button
 * in the rail's footer now. Selected by its accessible name, which is the name the button gives
 * itself and the same string a screen-reader user hears, rather than by a class.
 *
 * `DockedSurface` keeps its content mounted behind `v-show` while closed, so "is it open" has to
 * be a visibility question rather than a presence one.
 */
async function openSettingsSurface(): Promise<void> {
    if (await visible(APP_SETTINGS)) return;

    /*
     * Close the options editor first, for the reason `selectDestination` spells out above: while
     * it is open, `App.vue` marks `.mb-shell-body` inert, so a click on a rail button is delivered
     * to an inert element and does nothing, silently, while the button stays visible and `click()`
     * reports success. This function had no such guard.
     *
     * It matters here more than anywhere, because `DockedSurface` uses `v-show`: the panel is
     * always in the document and only its visibility changes. So the wait below is not waiting for
     * markup to appear, it is waiting for `props.open` to become true, and a swallowed click means
     * a full timeout on an element that is present the whole time. Six settings surfaces failed
     * behind that one unopened drawer.
     */
    await ensureOptionsEditorClosed();
    await page
        .locator(".wl-rail__footer")
        .getByRole("button", { name: "Settings", exact: true })
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page
        .waitForSelector(APP_SETTINGS, { state: "visible", timeout: REACH_TIMEOUT })
        .catch(() => {
            throw new Error(
                "the settings drawer did not open: its button was clicked and reported success, " +
                    "but the panel never became visible. It is always in the document under " +
                    "v-show, so this is an unopened drawer rather than missing markup.",
            );
        });
    await page.waitForTimeout(400);
}

/**
 * Opens Settings if it is not already open, then switches to one section through the
 * panel's own search - the same route a person uses, and the only one this harness can
 * rely on regardless of which tab Settings was last showing.
 *
 * That last part is not hypothetical. `AppSettings.vue`'s `revealAnchor()` says so in its
 * own comment: opening the panel through the plain Settings FAB passes no anchor, and "no
 * anchor means just open it... no tab is switched, so whichever tab this surface last
 * remembered stays exactly where it was left" - deliberate app behaviour, a settings panel
 * that remembers where you were, not a bug. The "Settings sections" step below drives
 * through every registered section and leaves the last one (Diagnostics) active when it
 * finishes; a later step that reopens Settings with the bare FAB and assumes the Mojang
 * consent tab is showing - because that used to be the only tab there was, before every
 * section became its own lazily-mounted tab - reopens on whatever the previous test left
 * behind instead, and a locator scoped to a tab that is not mounted times out looking for
 * an element that was never going to appear. That is what sent release `v0.1.0-build.419`
 * (run 31031646647) out with a red Screenshots job: "EULA viewer - the harness could not
 * open it in this run: locator.click: Timeout 15000ms exceeded", chasing
 * `.mb-consent-row button` on whatever tab happened to be left open rather than the one
 * that actually holds it.
 */
async function openSettingsSection(anchor: string, title: string): Promise<void> {
    await openSettingsSurface();
    const searchInput = page.locator(`${APP_SETTINGS} .mb-settings__search input`).first();
    await searchInput.fill("");
    await searchInput.fill(anchor);
    const result = page.locator(`${APP_SETTINGS} .mb-settings__result`, { hasText: title });
    await result.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await result.first().click();
    await searchInput.fill("");
}

test("captures the settings surface and every section in it", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    // Not the Vuetify drawer this once lived inside, and not a bare `.mb-settings` either. The
    // panel can be floating or docked to any edge now, so its chrome is `DockedSurface` rather
    // than `v-navigation-drawer` - a selector naming the old chrome matched in no placement at
    // all, which is how two required captures went missing at once - and the viewer's own
    // settings *menu* uses the same `.mb-settings` class for a completely different surface. See
    // `APP_SETTINGS`.
    const drawer = page.locator(APP_SETTINGS);

    await attempt("Settings drawer", async () => {
        await openSettingsSurface();
        await page.waitForTimeout(700);
        await shoot(
            "settings-drawer",
            "The application settings, opened from the rail footer over whichever destination was showing",
        );
    });

    // Every settings section is now its own browser-style tab (`AppSettings.vue`'s own
    // doc comment: "Only the active tab's section is mounted at a time"), so a bulk query
    // for `[data-anchor]` finds only whichever one tab happens to already be open - it
    // used to find every section at once, back when they were one long scrolling column
    // under simultaneous `data-anchor` markers. That regression is invisible in the
    // manifest (`attempt()` records a gap, not a failure) and was found only by counting
    // captures: six anchors documented in `docs/render-in-actions.md` and the README
    // shrank to one (`settings-section-mojang-download-consent`) with the run staying
    // green throughout - the same "recorded a gap, not a failure" shape `CONFIG_STATE_NOTE`
    // above already warns about for the options editor.
    //
    // Fixed by driving the surface the way a person actually reaches a section now: type
    // its anchor into the settings search (the search haystack includes the literal
    // anchor string, per `sectionHaystack` in `settingsSections.ts`), click the one
    // matching result, which opens and switches to that section's tab, then capture.
    //
    // The anchor list is hard-coded rather than imported, for the same reason
    // `PROFILE_STORAGE_KEY` above is: `settingsSections.ts` is bundled through
    // `packages/ui`'s own Vite pipeline and this is a plain Playwright/Node test with no
    // access to that build. If a section is added there without a matching entry here,
    // this loop simply will not open it - which is exactly the gap this fix exists to
    // stop being silent, so a missing/renamed anchor shows up as a named capture failure
    // rather than as a manifest that quietly lists fewer sections than the product has.
    await attempt("Settings sections", async () => {
        const anchors: { anchor: string; title: string }[] = [
            { anchor: "mojang-download-consent", title: "Mojang download consent" },
            { anchor: "java-runtime", title: "Java runtime" },
            { anchor: "map-storage-directory", title: "Where rendered maps go" },
            { anchor: "world-folder", title: "World folder" },
            { anchor: "github-account", title: "GitHub account" },
            { anchor: "language-and-tone", title: "Language and tone" },
            { anchor: "display", title: "Display and ease of use" },
            { anchor: "kid-mode", title: "Kid Mode and Adult Mode" },
            { anchor: "surface-placement", title: "Where the panels sit" },
            { anchor: "render-memory", title: "Render memory" },
            { anchor: "download-concurrency", title: "Download concurrency" },
            { anchor: "notification-duration", title: "Notification duration" },
            { anchor: "system-dependencies", title: "System dependencies" },
            { anchor: "bluemap-engine", title: "BlueMap engine" },
            { anchor: "updates", title: "Updates" },
            { anchor: "vocabulary", title: "Personal vocabulary" },
            { anchor: "app-logo", title: "App logo" },
            { anchor: "history", title: "Version history" },
            { anchor: "diagnostics", title: "Diagnostics" },
        ];

        await openSettingsSurface();
        const searchInput = page.locator(`${APP_SETTINGS} .mb-settings__search input`).first();

        for (const { anchor, title } of anchors) {
            /*
             * Named per iteration, because this attempt is nineteen captures wearing one surface
             * name. When it failed, "Settings sections did not finish" was every bit of evidence
             * there was: no way to tell a first-anchor failure from an eighteenth, and no way to
             * tell a missing section from a slow one. One line makes the next failure name itself.
             */
            const at = Date.now();
            await searchInput.fill("");
            await searchInput.fill(anchor);
            const result = page.locator(`${APP_SETTINGS} .mb-settings__result`, { hasText: title });
            await result.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await result.first().click();
            await page.waitForTimeout(500);
            console.log(
                `[harness]   section ${anchor}: reached in ${((Date.now() - at) / 1000).toFixed(1)}s`,
            );
            await shoot(
                `settings-section-${slug(anchor)}`,
                `The "${title}" settings section, on its own browser-style tab inside the settings panel`,
                { crop: drawer, cropped: "the settings panel" },
            );
        }

        await searchInput.fill("");
    });

    await attempt("Settings search", async () => {
        await openSettingsSurface();
        await page.locator(`${APP_SETTINGS} .mb-settings__search input`).first().fill("java");
        await page.waitForTimeout(600);
        await shoot(
            "settings-search",
            "The settings search, filtering the panel to the settings whose name, explanation or current value matches what was typed, and saying which tab each result lives on",
            { crop: drawer, cropped: "the settings panel" },
        );
    });

    await attempt("Settings regex builder", async () => {
        await openSettingsSurface();
        await page
            .locator(`${APP_SETTINGS} .mb-settings__search [aria-label="Open the regex builder"]`)
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-regex", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.locator(".mb-config-regex__pattern textarea").first().fill("java|storage");
        await page.waitForTimeout(700);
        await shoot(
            "settings-regex-builder",
            "The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
        await page.locator(".mb-config-regex__pattern textarea").first().fill("(");
        /*
         * `.v-alert`, not `[role="alert"]`. Vuetify puts `role="alert"` on its own
         * `v-input__details` message container as well, so the broad attribute selector matched
         * two elements the moment the pattern field grew a message and failed strict mode - which
         * `attempt` recorded as an unreachable surface, when the builder was in fact showing
         * exactly the error this capture wants. The component declares one `v-alert`, guarded by
         * `v-if="evaluation.error"`, so this names the error itself rather than anything that
         * happens to announce politely.
         */
        await page.locator(".mb-config-regex .v-alert").waitFor({
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await shoot(
            "settings-regex-builder-invalid",
            "The settings regex builder's real invalid-pattern state: the exact syntax problem and the honest zero-match result stay inside the anchored surface",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
        await dismiss();
        await page.locator(`${APP_SETTINGS} .mb-settings__search input`).first().fill("");
        await page.waitForTimeout(400);
    });

    // The always-present personal-vocabulary upload row, reached the same way every other
    // settings section is: through the panel's own search, per openSettingsSection's doc
    // comment on why a plain reopen cannot be trusted to land on any particular tab.
    await attempt("Personal vocabulary settings row", async () => {
        await openSettingsSection("vocabulary", "Personal vocabulary");
        const row = page.locator(`${APP_SETTINGS} [data-anchor="vocabulary"]`);
        await row.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "settings-vocabulary",
            "The personal-vocabulary settings row, present in its own settings section whether or not a file has ever been uploaded: its honest no-file state on a throwaway capture profile",
            { crop: drawer, cropped: "the settings panel" },
        );
    });

    // The notification duration dial, reached the same way the vocabulary row above is: through
    // the panel's own search, because openSettingsSection's doc comment explains why a plain
    // reopen cannot be trusted to land on any particular tab. The row was built and never
    // mounted once already, which left the notices store reading a level nobody could change, so
    // it is worth a picture that would go missing if it were ever unmounted again.
    await attempt("Notification duration settings row", async () => {
        await openSettingsSection("notification-duration", "Notification duration");
        const row = page.locator(`${APP_SETTINGS} [data-test="notification-duration-row"]`);
        await row.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "settings-notification-duration",
            "The notification duration row in settings: how long an informational or success message stays in the corner before it dismisses itself, with the level this capture profile shipped on",
            { crop: drawer, cropped: "the settings panel" },
        );
    });

    skip(
        "GitHub account, signed in",
        "signing in needs a real GitHub account and a real device-flow round trip to github.com, " +
            "and the offline guard refuses every request that is not loopback; the signed-out " +
            "state of the account section is real and is the one captured",
    );

    for (const surface of [
        "Update banner while downloading",
        "Update banner ready to restart",
        "Update banner failure recovery",
    ] as const) {
        skip(
            surface,
            "the banner is driven by a real installed-build update feed and appears only after " +
                "that external state occurs. The always-reachable Updates settings tab is captured " +
                "with the exact status this build reports; no update IPC or feed response is mocked",
        );
    }

    await dismiss();
    await page.waitForTimeout(500);
});

/* -------------------------------------------------------------------------- */
/* The options editor                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What the options editor is showing in these captures, said plainly in every caption.
 *
 * The throwaway profile these runs use has no BlueMap config folder on disk, so the editor
 * opens on BlueMap's own generated defaults and says so in a notice across the top. Every
 * setting, tab and control below that notice is real, live and savable - what is absent is
 * a folder read off this machine, not the ability to write one.
 *
 * This note used to describe a different state, and the difference is worth recording: the
 * editor once resolved no host at all, because it called `provideConfigHost()` and
 * `useConfigHost()` in the same component and a component's own `provide` is invisible to
 * its own `inject`. Fixing that gave the editor a real bridge, which meant it stopped
 * generating a set and opened on an empty state instead - and because `attempt()` records
 * a gap rather than failing, six options-editor captures silently vanished from the
 * artifact while the job stayed green. The captures are the only thing that noticed.
 */
const CONFIG_STATE_NOTE =
    "The editor is showing BlueMap's own generated defaults, because the throwaway profile " +
    "this run uses has no config folder on disk, and it says so in the notice across the top. " +
    "Every setting, tab and control in the image is real, live and savable; what is absent is " +
    "a folder read off this machine.";

/**
 * Opens the options editor, or leaves it open.
 *
 * Called at the start of every capture in this test rather than once, because Escape is
 * how an overlay inside the editor is closed and the editor's own host region listens for
 * the same key: closing the regex builder therefore closes the editor out from under the
 * next capture. Re-opening is cheap and makes each capture independent of the last.
 *
 * Through the command palette, because the floating button this used to press is gone. The editor
 * is not a rail destination and not a job with a tab: `App.vue`'s own comment says it became "a
 * row in Set up & help", and it has a palette row of its own beside that. So the palette is the
 * route rather than a substitute for one - it is one of the two doors the application actually
 * ships, and it is the one that works from whatever destination the previous capture left showing.
 *
 * Driving the real `Ctrl+Shift+F` chord to get there is deliberate for the reason `openPalette`
 * gives: a harness that found some other way in would keep passing on the day the documented
 * shortcut stopped working.
 */
async function ensureOptionsEditor(): Promise<void> {
    if (await visible(".mb-config-screen")) return;
    await openPalette();
    await page.locator(".mb-palette__search input").first().fill("Server configuration");
    await page.waitForTimeout(400);
    // The row's accessible name, not a class on it: `PaletteRow.vue` makes a command or
    // destination row one button whose name is its own text, which is what a keyboard user hears
    // and therefore the least surprising thing to select it by.
    await page
        .locator(".mb-palette")
        .getByRole("button", { name: /^Server configuration/ })
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(".mb-config-screen", {
        state: "visible",
        timeout: ELEMENT_TIMEOUT,
    });
    await page.waitForTimeout(700);
}

/**
 * Remounts the options editor and returns the notice that this mount genuinely raised.
 *
 * `ConfigScreen` emits its draft/defaults notice only while mounting. A prior version called
 * `ensureOptionsEditor()` from a later test, where it correctly returned early for an editor that
 * was already open; the initial five-second toast had then already dismissed itself. Closing,
 * clearing the *live* stack through its own controls, and reopening means this locator can only
 * resolve the new `ConfigScreen -> notices -> ConfigNotifications` event, immediately before the
 * capture. The notification history deliberately remains intact.
 */
async function reopenOptionsEditorForFreshNotice(): Promise<void> {
    await ensureOptionsEditorClosed();
    await page.waitForSelector(".mb-config-screen", {
        state: "hidden",
        timeout: ELEMENT_TIMEOUT,
    });
    await ensureOptionsEditor();

    // The redesigned shell raises no toast: the remount's notice lands in the history and
    // moves the bell badge, and the badge is what the next capture needs to be genuine.
    const badge = page.locator(".wl-rail .wl-rail-badge").first();
    await badge.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
}

test("captures the options editor, its tabs and its dialogs", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Options editor", async () => {
        await ensureOptionsEditor();

        await shoot("config-screen", "The options editor as it opens", {
            mapArea: "covered",
            note: CONFIG_STATE_NOTE,
        });
    });

    await attempt("Options editor tabs", async () => {
        await ensureOptionsEditor();
        // `TabbedNavigation`/`TabButton` render a `[role="tab"]` div, not a Vuetify
        // `.v-tab` - the editor's tab strip stopped being Vuetify tabs some time ago, and
        // this selector was never updated to follow. Left as `.v-tab`, this locator
        // matches nothing, `tabs.first().waitFor` times out, and the whole step - plus
        // every step below it that opens a specific tab - reports "could not open it"
        // instead of the real failure, which is that the selector is stale.
        const tabs = page.locator('.mb-config-screen__tabs [role="tab"]');
        await tabs.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const count = await tabs.count();
        expect(count, "the options editor rendered no tabs").toBeGreaterThan(0);
        for (let i = 0; i < count; i += 1) {
            const label = readableLabel(await tabs.nth(i).innerText());
            /*
             * Click the label, not the tab's geometric centre. A tab contains its own
             * 44 px close button; for the longer "Server plugin" label that button sits
             * under Playwright's default centre point. Clicking the parent therefore
             * closed the tab, shortened this live locator from eight entries to seven,
             * and left the next `innerText()` waiting for an eighth tab the harness had
             * just removed. This is the same interaction rule `activateTab()` follows for
             * Work's own strip: aim at the label so the nested close affordance can only
             * close when it is deliberately targeted.
             */
            await tabs
                .nth(i)
                .locator(".mb-tabs-strip__label")
                .first()
                .click({ timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(700);
            await shoot(
                `config-tab-${slug(label)}`,
                `The options editor, the "${label}" tab, with the settings that tab owns`,
                { mapArea: "covered", note: CONFIG_STATE_NOTE },
            );
        }
    });

    await attempt("Options editor search", async () => {
        await ensureOptionsEditor();
        const search = page.locator(".mb-config-screen__search .mb-config-search input").first();
        await search.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await search.fill("port");
        await page.waitForTimeout(700);
        await shoot(
            "config-search",
            "The options editor's search, which reaches every setting on all of the tabs at once and says which tab each result lives on",
            { mapArea: "covered", note: CONFIG_STATE_NOTE },
        );
    });

    await attempt("Options editor regex builder", async () => {
        await page
            .locator('.mb-config-screen__search [aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-regex", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(700);
        await shoot(
            "config-regex-builder",
            "The regex builder anchored to the options editor's search bar",
            { crop: page.locator(".mb-config-regex"), cropped: "the regex builder" },
        );
    });

    // Tidying up, outside the attempt above and unable to fail it. Escape closes the
    // builder and then reaches the editor's own host region, which closes the editor too,
    // so clearing the search afterwards would otherwise fail and be reported as though
    // the builder had never opened - while its capture sat on disk beside the claim.
    await dismiss();
    await attemptQuietly(async () => {
        await ensureOptionsEditor();
        await page.locator(".mb-config-screen__search .mb-config-search input").first().fill("");
        await page.waitForTimeout(400);
    });

    await attempt("Options editor delete gate", async () => {
        await ensureOptionsEditor();
        await page
            .locator('.mb-config-screen__tabs [role="tab"]', { hasText: "Maps" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-maps", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);

        await page
            .locator(".mb-config-maps .v-btn", { hasText: "Delete" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-confirm", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "config-delete-gate",
            "The super confirmation that guards deleting a map's configuration: two keys, then a full-travel slider, with an emergency exit that is always available",
            { crop: page.locator(".mb-config-confirm"), cropped: "the confirmation popover" },
        );
        await emergencyExit().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
    });

    await attempt("Options editor save plan", async () => {
        await ensureOptionsEditor();
        const save = page.locator(".mb-config-screen__bar .v-btn", { hasText: "Save" }).first();
        await save.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        if (await save.isDisabled()) {
            skip(
                "Options editor save plan",
                "the Save control is disabled in this state, and its tooltip says why; the dialog " +
                    "that lists the files a save would write therefore has no door to open through, " +
                    "and nothing was substituted for it",
            );
            return;
        }
        await save.click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-apply__title", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "config-save-plan",
            "The save plan, which names every file a save would write and every reason it would write it, before anything is written",
            { mapArea: "covered", note: CONFIG_STATE_NOTE },
        );
        // Cancelled, not confirmed. Opening this dialog writes nothing; only its confirm
        // button does, and this run has no folder it has any business writing into.
        await dismiss();
    });

    // Escape closes the editor, and focus goes back to the button that opened it. The key
    // is sent to the editor's own host region, which is what listens for it.
    if (await visible(".mb-config-screen")) {
        await page
            .locator('[role="region"][aria-label="Server configuration"]')
            .press("Escape")
            .catch(() => undefined);
        await page.waitForTimeout(700);
    }
});

test("captures the remaining first-class screens", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("History", async () => {
        await ensureOptionsEditor();
        const historyTab = page
            .locator('.mb-config-screen__tabs [role="tab"]', { hasText: "History" })
            .first();
        await historyTab.click({ timeout: ELEMENT_TIMEOUT });
        // A fresh profile has no folder yet, so the panel deliberately renders its
        // truthful "save this config set to one first" state rather than a fake timeline.
        // The window is still the History screen and is the surface worth proving.
        //
        // `.mb-config-screen__window` does not exist anywhere in the UI source - another
        // selector this step was written against that the tab strip's move to
        // `TabbedNavigation` left behind. The one active tab's real content lives in that
        // component's own `.mb-tabs__panel` (`role="tabpanel"`), scoped to this editor's
        // strip so it cannot match the application's outer tab strip instead.
        const history = page.locator('.mb-config-screen__tabs .mb-tabs__panel[role="tabpanel"]');
        await history.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await expect(history).toContainText(/History follows a folder|save this config set/i);
        await page.waitForTimeout(500);
        await shoot(
            "config-history",
            "The config folder's version-history tab, including its honest empty state when this throwaway profile has no folder attached",
            { crop: history, cropped: "the version-history panel", mapArea: "covered" },
        );
    });

    // `ensureOptionsEditorClosed`, not a bare Escape. The editor listens for that key on its own
    // host region, so a press delivered anywhere else leaves it open - and an open editor makes
    // the whole shell body inert, which is how the three job captures below silently became
    // unreachable while the failure message talked about a tab menu.
    await ensureOptionsEditorClosed();

    await attempt("Projects", async () => {
        // Through `openJob`, which is the one place that knows every way a job screen can be
        // out of reach on a fresh workspace: the strip lives inside the Work destination, most
        // jobs have no tab at all until somebody opens one, and a tab that does exist can be
        // inside a collapsed group or behind the overflow control. Reaching for the tab here
        // directly is what left this capture out of the set through two shell rewrites running.
        await openJob("projects", /^Projects$/i, "Projects");
        const projects = page.locator(".mb-projects-screen");
        await projects.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "projects-screen",
            "The Projects screen, showing the real empty state and the path into a new render project",
            { crop: projects, cropped: "the Projects screen", mapArea: "covered" },
        );
    });

    await attempt("CI-render screen", async () => {
        // Through `openJob`, which is the one place that knows every way a job screen can be
        // out of reach on a fresh workspace: the strip lives inside the Work destination, most
        // jobs have no tab at all until somebody opens one, and a tab that does exist can be
        // inside a collapsed group or behind the overflow control. Reaching for the tab here
        // directly is what left this capture out of the set through two shell rewrites running.
        await openJob("cirender", /GitHub runners/i, "GitHub runners");
        const ci = page.locator(".ci-render-screen");
        await ci.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "ci-render-screen",
            "The CI-render screen, with its honest repository fields and the preflight route that refuses before uploading anything",
            { crop: ci, cropped: "the CI-render screen", mapArea: "covered" },
        );
    });

    // Needs nothing but the application: the render list is read from disk and is honestly
    // empty on a throwaway profile, and the preflight is never run, so no GitHub account and
    // no network are involved in reaching this screen.
    //
    // A fresh Work workspace has no tab for this at all - it seeds the pinned wizard and nothing
    // else - so it is opened through the strip's own new-tab menu, which is the gesture a person
    // uses and the one that puts a persistent tab in the strip. See `openJob`.
    await attempt("Pages publishing screen", async () => {
        await openJob("pages", /Publish to Pages/i, "Publish to Pages");
        const publish = page.locator(".mb-pages-screen");
        await publish.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "pages-publishing-screen",
            "The Pages publishing screen: the searchable render list, the repository fields, and the check that reports what publishing would push before anything is pushed",
            { crop: publish, cropped: "the Pages publishing screen", mapArea: "covered" },
        );
    });

    await attempt("Renders screen", async () => {
        await openJob("renders", /^Renders(?: \(\d+\))?$/i, "Renders");
        const renders = page.locator(".mb-renders");
        await renders.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "renders-screen-empty",
            "The Renders job in its real fresh-profile empty state, with its search, bulk controls and direct route back to Make a map",
            { crop: renders, cropped: "the Renders job", mapArea: "covered" },
        );
    });

    await attempt("World repository screen", async () => {
        await openJob("worldrepo", /World repository/i, "World repository");
        const worldRepository = page.locator(".mb-worldrepo");
        await worldRepository.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "world-repository-screen",
            "The World repository job with its guided world, account, owner and repository fields plus the honest fresh-profile blockers",
            { crop: worldRepository, cropped: "the World repository job", mapArea: "covered" },
        );
    });

    await attempt("Local preview screen", async () => {
        await openJob("preview", /Watch it live/i, "Watch it live");
        const preview = page.locator(".mb-preview");
        await preview.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "local-preview-screen",
            "Watch it live, the local preview job, with its real no-render-yet state and the network disclosure before any server starts",
            { crop: preview, cropped: "the local preview job", mapArea: "covered" },
        );
    });

    await attempt("Offline documentation index", async () => {
        await openJob("docs", /^Docs$/i, "Docs");
        const docs = page.locator(".mb-docs");
        await docs.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "offline-docs-index",
            "The complete offline documentation index bundled into the installed application, grouped by category with its local search",
            { crop: docs, cropped: "the offline documentation browser", mapArea: "covered" },
        );
    });

    await attempt("Offline documentation search", async () => {
        await openJob("docs", /^Docs$/i, "Docs");
        const docs = page.locator(".mb-docs");
        await docs.locator("input").first().fill("render");
        const results = docs.locator(".mb-docs__results");
        await results.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "offline-docs-search",
            "The offline documentation browser filtered by real article titles and body text, with no network request",
            { crop: docs, cropped: "the offline documentation browser", mapArea: "covered" },
        );
    });

    await attempt("Offline documentation article", async () => {
        const docs = page.locator(".mb-docs");
        const firstResult = docs.locator(".mb-docs__results .v-list-item").first();
        await firstResult.click({ timeout: ELEMENT_TIMEOUT });
        const article = docs.locator(".mb-docs__article");
        await article.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "offline-docs-article",
            "One bundled documentation article rendered as formatted, sanitized prose inside the application rather than raw Markdown",
            { crop: docs, cropped: "the offline documentation browser", mapArea: "covered" },
        );
    });

    skip(
        "Memory console",
        "the hand-written job registry marks this job unavailable unless the memory-console " +
            "capability is present. This build does not expose that capability, so Work filters " +
            "the tab out and no generic empty substitute is rendered",
    );
    skip(
        "In-app capture gallery and search",
        "the desktop capture gallery is tracked by open issue #76 and has no mounted application " +
            "surface in this build. The documentation-site gallery is a separate built surface " +
            "with its own capture route; this harness does not substitute that page for an app job",
    );

    // Four screens that had a complete component and no page that rendered it, per App.vue's
    // own doc comment on the authenticator, the lock list and the recovery desk: "a full green
    // suite says nothing about it, because a component tested in isolation passes whether or
    // not anybody can open it." All four need nothing but the application - no account, no
    // network, no render in flight - and are reached the same way every other job screen is.
    await attempt("Authenticator page", async () => {
        await openJob("authenticator", /^Authenticator$/i, "Authenticator");
        const authenticator = page.locator('[data-test="authenticator-screen"]');
        await authenticator.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "authenticator-screen",
            "The built-in authenticator, on its own tab in the Work destination, with its honest empty state on a throwaway profile that has never registered a TOTP account",
            { crop: authenticator, cropped: "the authenticator screen", mapArea: "covered" },
        );
    });

    await attempt("Authenticator registration chooser", async () => {
        await openJob("authenticator", /^Authenticator$/i, "Authenticator");
        const authenticator = page.locator('[data-test="authenticator-screen"]');
        await authenticator
            .locator('[data-test="authenticator-open-register"]')
            .click({ timeout: ELEMENT_TIMEOUT });
        const registration = authenticator.locator('[data-test="authenticator-register-card"]');
        await registration.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "authenticator-registration",
            "Authenticator registration before any secret is entered: the link and manual routes, the local-only fields, and the blocked registration action",
            {
                crop: registration,
                cropped: "the Authenticator registration card",
                mapArea: "covered",
            },
        );
        await registration
            .locator('[data-test="authenticator-register-cancel"]')
            .click({ timeout: ELEMENT_TIMEOUT });
    });

    skip(
        "Authenticator QR pairing and live code",
        "that state exists only after a real TOTP secret is supplied; the capture harness never " +
            "creates, stores, prints or photographs a secret or QR payload. The secret-free " +
            "registration chooser is captured instead, and nothing is substituted for pairing",
    );

    await attempt("Locks page", async () => {
        await openJob("locks", /^Locks$/i, "Locks");
        const locks = page.locator('[data-test="lock-list"]');
        await locks.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "lock-list-screen",
            "The lock list, enumerating every toy lock on this computer, with its honest empty state on a throwaway profile that has never locked an element",
            { crop: locks, cropped: "the lock list", mapArea: "covered" },
        );
    });

    await attempt("Support Tickets page", async () => {
        await openJob("support", /Support Tickets/i, "Support Tickets");
        const support = page.locator('[data-test="support-tickets"]');
        await support.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "support-tickets-screen",
            "The recovery desk, dressed as a support desk: a ticket form and the plain, unstyled line stating that nothing is ever sent anywhere",
            { crop: support, cropped: "the Support Tickets screen", mapArea: "covered" },
        );
    });

    await attempt("Support Tickets local response", async () => {
        await openJob("support", /Support Tickets/i, "Support Tickets");
        const support = page.locator('[data-test="support-tickets"]');
        await support
            .locator('[data-test="support-description"] textarea')
            .fill("I forgot the password for a toy lock on this computer.");
        await support.locator('[data-test="support-submit"]').click({
            timeout: ELEMENT_TIMEOUT,
        });
        const ticket = support.locator('[data-test="support-ticket"]').first();
        await ticket.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "support-tickets-local-response",
            "A locally created Support Ticket after submission: its local ticket number, fictional priority, triaged status, canned response and the exact application-data recovery route",
            { crop: support, cropped: "the Support Tickets screen", mapArea: "covered" },
        );
    });

    // Structures and the drop zone share one tab - see App.vue's own doc comment on why the
    // drop zone lives on this page rather than wrapping the whole application - so one job
    // open reaches both required surfaces.
    await attempt("Structures page", async () => {
        await openJob("structures", /^Structures$/i, "Structures");
        const structures = page.locator('[data-test="structure-list"]');
        await structures.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "structures-screen",
            "The Structures screen, listing every structure file a world scan found and, once rendered, the render for each one - with its honest empty state on a throwaway profile with no world scanned yet",
            { crop: structures, cropped: "the Structures screen", mapArea: "covered" },
        );
    });

    await attempt("Drop-render zone", async () => {
        await openJob("structures", /^Structures$/i, "Structures");
        const dropZone = page.locator('[data-test="drop-render-zone"]');
        await dropZone.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "drop-render-zone",
            "The drop-render zone at the top of the Structures screen: drag a structure or schematic file straight onto it, or use the ordinary button beside it that does exactly the same thing",
            { crop: dropZone, cropped: "the drop-render zone", mapArea: "covered" },
        );
    });

    /*
     * Three more job screens that ship today and had never been photographed once.
     *
     * They are in the same category as the authenticator and the lock list above: each opens with
     * nothing but the running application, no account, no network and no render in flight, and
     * each was reachable through the tab strip the whole time. What was missing was the picture,
     * which means a change that emptied any one of them outright would have left this run green.
     */
    await attempt("Chunker page", async () => {
        const chunker = await openConverterStep("chunker-step-source");
        await page.waitForTimeout(500);
        await shoot(
            "chunker-screen",
            "The world conversion screen, on its own tab in the Work destination: the source and destination fields and the four execution routes a conversion can be run through",
            { crop: chunker, cropped: "the conversion screen", mapArea: "covered" },
        );
    });

    await attempt("Converter target step", async () => {
        const chunker = await openConverterStep("chunker-step-target");
        const targetStep = chunker.locator('[data-test="chunker-step-target"]');
        await targetStep.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "converter-target-step",
            "Convert, target edition: the real edition, version, output-folder and execution-route controls",
            { crop: chunker, cropped: "the Convert job", mapArea: "covered" },
        );
    });

    await attempt("Converter trim step", async () => {
        const chunker = await openConverterStep("chunker-step-trim");
        const trimStep = chunker.locator('[data-test="chunker-step-trim"]');
        await trimStep.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "converter-trim-step",
            "Convert, trim and dimensions: the boundary and dimension-mapping controls before any conversion runs",
            { crop: chunker, cropped: "the Convert job", mapArea: "covered" },
        );
    });

    await attempt("Converter block-mapping step", async () => {
        const chunker = await openConverterStep("chunker-step-blocks");
        const blockStep = chunker.locator('[data-test="chunker-step-blocks"]');
        await blockStep.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "converter-block-mapping-step",
            "Convert, block mapping: the searchable override list and the explicit source-to-replacement editor",
            { crop: chunker, cropped: "the Convert job", mapArea: "covered" },
        );
    });

    await attempt("Converter regex builder", async () => {
        const chunker = await openConverterStep("chunker-step-blocks");
        const blockStep = chunker.locator('[data-test="chunker-step-blocks"]');
        await blockStep
            .locator('[aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const builder = page.locator(".mb-config-regex").first();
        await builder.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await builder.locator(".mb-config-regex__pattern textarea").first().fill("stone|dirt");
        await page.waitForTimeout(400);
        await shoot(
            "converter-regex-builder",
            "The full regex builder anchored to Convert's block-mapping search, with a real pattern and live sample matches",
            { crop: builder, cropped: "the converter regex builder", mapArea: "covered" },
        );
        await dismiss();
    });

    await attempt("Converter world-settings step", async () => {
        const chunker = await openConverterStep("chunker-step-settings");
        const settingsStep = chunker.locator('[data-test="chunker-step-settings"]');
        await settingsStep.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "converter-world-settings-step",
            "Convert, world settings: the name, seed, spawn coordinates and game-rule controls",
            { crop: chunker, cropped: "the Convert job", mapArea: "covered" },
        );
    });

    await attempt("Converter review step", async () => {
        const chunker = await openConverterStep("chunker-step-review");
        const reviewStep = chunker.locator('[data-test="chunker-step-review"]');
        await reviewStep.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "converter-review-step",
            "Convert, review: the exact lossy consequences and the disabled start action before a valid source and destination are supplied",
            { crop: chunker, cropped: "the Convert job", mapArea: "covered" },
        );
    });

    // Anchored to the screen's own root rather than to its runtime alert, because that alert is
    // there only while no Ollama runtime answers. A capture profile has no runtime, so the alert
    // is what this photograph shows; the anchor still holds on a machine where one is running.
    await attempt("Ollama page", async () => {
        await openJob("ollama", /^Ollama$/i, "Ollama");
        const ollama = page.locator('[data-test="ollama-screen"]');
        await ollama.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "ollama-screen",
            "The Ollama suite manager, on its own tab in the Work destination, on a capture profile with no Ollama runtime installed: the honest missing-runtime warning and the guidance that goes with it",
            { crop: ollama, cropped: "the Ollama screen", mapArea: "covered" },
        );
    });

    await attempt("Ollama runtime recovery", async () => {
        await openJob("ollama", /^Ollama$/i, "Ollama");
        const runtime = page.locator('[data-test="ollama-runtime-alert"]');
        await runtime.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "ollama-runtime-recovery",
            "Ollama's missing-or-stopped runtime recovery surface, naming the detected state and the exact in-app recheck route",
            { crop: runtime, cropped: "the Ollama runtime recovery alert", mapArea: "covered" },
        );
    });

    await attempt("Ollama Model Store", async () => {
        await openJob("ollama", /^Ollama$/i, "Ollama");
        const store = page.locator('section[aria-labelledby="ollama-store-heading"]');
        await store.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "ollama-model-store",
            "The Ollama Model Store with its model-and-tag search, installed and hardware-fit filters, refresh state and honest no-runtime controls",
            { crop: store, cropped: "the Ollama Model Store", mapArea: "covered" },
        );
    });

    await attempt("Ollama Model Store regex builder", async () => {
        const store = page.locator('section[aria-labelledby="ollama-store-heading"]');
        await store
            .locator('[aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const builder = page.locator(".mb-config-regex").first();
        await builder.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await builder.locator(".mb-config-regex__pattern textarea").first().fill("llama|gemma");
        await shoot(
            "ollama-model-store-regex-builder",
            "The full regex builder anchored to the Ollama Model Store's exhaustive model-and-tag search",
            { crop: builder, cropped: "the Model Store regex builder", mapArea: "covered" },
        );
        await dismiss();
    });

    await attempt("Ollama pull cart", async () => {
        const cart = page.locator('section[aria-labelledby="ollama-cart-heading"]');
        await cart.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "ollama-pull-cart",
            "The Ollama pull cart in its honest empty state, stating plainly that it is a local download queue with no price, checkout, account or payment",
            { crop: cart, cropped: "the Ollama pull cart", mapArea: "covered" },
        );
    });

    await attempt("Ollama chat", async () => {
        const chat = page.locator('section[aria-labelledby="ollama-chat-heading"]');
        await chat.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "ollama-chat-disabled",
            "Ollama chat with its session search, prompt and model controls visible but honestly disabled until a local runtime is ready",
            { crop: chat, cropped: "the Ollama chat surface", mapArea: "covered" },
        );
    });

    for (const [surface, reason] of [
        [
            "Ollama ready runtime and exhaustive live catalogue",
            "it requires a real local Ollama daemon plus the official catalogue refresh; this capture profile has no daemon and nothing was fabricated",
        ],
        [
            "Ollama active pull queue",
            "it requires a real model transfer and enough storage; the harness does not download a model merely to manufacture progress",
        ],
        [
            "Ollama streaming chat",
            "it requires a real installed model and local runtime; the disabled real chat surface is captured and no fake response is substituted",
        ],
        [
            "Ollama harness preflight and rollback",
            "it requires an explicitly registered executable profile and a real launch/health failure; the capture harness does not register or run an arbitrary program",
        ],
    ] as const) {
        skip(surface, reason);
    }

    await attempt("Browser extension downloads page", async () => {
        await openJob("browserExtension", /Browser downloads/i, "Browser downloads");
        const extension = page.locator('[data-test="browser-extension-screen"]');
        await extension.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "browser-extension-screen",
            "The browser-extension downloads screen, with its honest empty state on a throwaway profile where the extension has never handed a download over",
            {
                crop: extension,
                cropped: "the browser extension downloads screen",
                mapArea: "covered",
            },
        );
    });

    for (const surface of [
        "Browser extension Start download dialog",
        "Browser extension Downloading dialog",
        "Browser extension Download complete notice",
    ] as const) {
        skip(
            surface,
            "this state must begin at a real installed browser extension and operate a real " +
                "transfer through the desktop bridge. This build exposes no extension bridge in " +
                "the capture profile, so the empty/no-host page is captured and no DOM injection, " +
                "mocked IPC or simulated progress is substituted",
        );
    }

    /*
     * The remote hosting panel, which is deliberately not a required surface.
     *
     * `WorldScreen.vue` renders it only once there is a run target, a render id and at least one
     * map that render produced, which is a finished render rather than a precondition a capture
     * profile can satisfy by opening a screen. That is a real gap rather than an excuse, so the
     * step is here to photograph it on any run that does have a render, and `attempt` records the
     * miss in the manifest on every run that does not. Putting it in REQUIRED_SURFACES would make
     * an honest gap read as a defect on every ordinary capture run.
     */
    await attempt("Remote hosting panel", async () => {
        await openJob("world", /make a map/i, "Make a map");
        const hosting = page.locator('[data-test="remote-hosting-panel"]');
        await hosting.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "remote-hosting-panel",
            "The remote hosting panel below a finished render on the world screen: the port and path a render just sent to another machine would be served from, so the map keeps answering after this window closes",
            { crop: hosting, cropped: "the remote hosting panel", mapArea: "covered" },
        );
    });

    await attempt("EULA viewer", async () => {
        // Reached through the search, not the bare FAB: see openSettingsSection()'s doc
        // comment for why a plain reopen cannot be trusted to land on the Mojang consent
        // tab that `.mb-consent-row` actually lives on.
        await openSettingsSection("mojang-download-consent", "Mojang download consent");
        const settings = page.locator(APP_SETTINGS);
        await settings.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const readLicence = settings.locator(".mb-consent-row button").first();
        await readLicence.click({ timeout: ELEMENT_TIMEOUT });
        const eula = settings.locator(".mb-eula");
        await eula.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "eula-viewer",
            "The EULA viewer embedded in Settings, with the bundled or cached licence copy, its provenance and its searchable section tabs",
            { crop: eula, cropped: "the EULA viewer", mapArea: "covered" },
        );
    });

    await dismiss();

    // A console only exists while a render is genuinely in flight. Keep the capture step
    // explicit so the manifest names the missing dependency instead of making the screen
    // look forgotten; a Java runtime, accepted download consent and a real world are not
    // smuggled into a screenshot run merely to make a gallery look complete.
    await attempt("Render console", async () => {
        const consoleSurface = page.locator(".mb-console");
        /*
         * Asked, then answered honestly, rather than waited for and left to time out.
         *
         * A bare `waitFor` here published the gap as "the harness could not open it in this run:
         * locator.waitFor: Timeout 3000ms exceeded", which reads as a broken screen and is a
         * statement about this file rather than about the application. Nothing is wrong with the
         * console: it does not exist because no render is in flight, which is the fact worth
         * recording and the fact the comment above this step has always given.
         */
        if ((await consoleSurface.count()) === 0) {
            skip(
                "Render console",
                "the console exists only while a render is genuinely in flight, and this run has " +
                    "none: starting one needs a Java runtime, an accepted Mojang download consent " +
                    "(declined here, deliberately) and minutes of work. Nothing was substituted",
            );
            return;
        }
        await consoleSurface.waitFor({ state: "visible", timeout: 3_000 });
        await shoot(
            "render-console",
            "The live render console, with level filters, the shared regex builder and the bounded log",
            { crop: consoleSurface, cropped: "the render console", mapArea: "covered" },
        );
    });
});

test("captures the rail bell and its notification history", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    // There is deliberately no "Notification corner" capture and no toast to photograph:
    // the redesigned shell records every notice at the rail bell's history instead of
    // covering content with a fixed stack (`ConfigScreen.vue` says so where the old
    // `<ConfigNotifications>` mount used to be). The editor is still remounted here so a
    // fresh unread notice exists for the bell capture below to carry a genuine badge.
    await reopenOptionsEditorForFreshNotice();

    await attempt("Notification centre opened from the rail's bell", async () => {
        // The options editor makes the rail inert while it is open. Close it before testing the
        // actual rail control, then assert the close really happened rather than recording a
        // click on a control that was still visible but intentionally unreachable.
        await ensureOptionsEditorClosed();
        await page.waitForSelector(".mb-config-screen", {
            state: "hidden",
            timeout: ELEMENT_TIMEOUT,
        });

        /*
         * The fresh notice above creates a genuine unread badge. It gives this locator a stable
         * structural identity without tying the interaction to one translated aria-label: the
         * target is the button that owns that badge, not an icon glyph or a text string.
         */
        const bell = page.locator(".wl-rail button.wl-rail-action:has(.wl-rail-badge)").first();
        await bell.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });

        // A previous failed capture could leave the centre open. Close it by pressing the same
        // bell so the recorded transition below is always closed -> open, not a stale open panel.
        if ((await bell.getAttribute("aria-expanded")) === "true") {
            await bell.click({ timeout: ELEMENT_TIMEOUT });
            await expect(bell).toHaveAttribute("aria-expanded", "false");
        }

        await expect(bell).toHaveAttribute("aria-expanded", "false");
        const bellBox = await bell.boundingBox();
        if (bellBox === null) {
            throw new Error("The rail notification bell had no measurable bounds.");
        }
        expect(
            bellBox.width,
            "the rail notification bell is narrower than its 44px hit target",
        ).toBeGreaterThanOrEqual(44);
        expect(
            bellBox.height,
            "the rail notification bell is shorter than its 44px hit target",
        ).toBeGreaterThanOrEqual(44);
        await shoot(
            "notifications-rail-bell",
            "The live Notification bell in the application rail, carrying its unread badge before it opens the history anchored beside it",
            { crop: bell, cropped: "the rail notification bell" },
        );

        // Opening the history marks every notice seen, which removes the unread badge -
        // and with it the `:has(.wl-rail-badge)` identity this locator found the bell by.
        // Pin the same element by its id before pressing it, so the assertions below are
        // about the button that was pressed rather than about a selector the press itself
        // just invalidated.
        const bellId = await bell.getAttribute("id");
        const pressedBell = bellId === null ? bell : page.locator(`[id="${bellId}"]`);
        await bell.click({ timeout: ELEMENT_TIMEOUT });
        await expect(pressedBell).toHaveAttribute("aria-expanded", "true");
        const panel = page.locator(".wl-notifications").first();
        await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const noticeCentre = panel.locator(".mb-notice-centre").first();
        await noticeCentre.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        const panelBox = await panel.boundingBox();
        if (panelBox === null) {
            throw new Error("The notification panel had no measurable bounds.");
        }
        await writeFile(
            join(shotDir, "notifications-rail-bell.metrics.json"),
            `${JSON.stringify(
                {
                    trigger: "real application-rail notification bell",
                    hitTarget: {
                        width: bellBox.width,
                        height: bellBox.height,
                        minimumWidth: 44,
                        minimumHeight: 44,
                    },
                    ariaExpanded: { before: "false", after: "true" },
                    anchoredPanel: {
                        visible: true,
                        width: panelBox.width,
                        height: panelBox.height,
                    },
                },
                null,
                2,
            )}\n`,
            "utf8",
        );
        await page.waitForTimeout(500);
        await shoot(
            "notifications-history",
            "The notification centre, so a message that has already faded away is still readable, searchable and filterable by level",
            {
                crop: noticeCentre,
                cropped: "the notification centre",
            },
        );
        await dismiss();
        await expect(pressedBell).toHaveAttribute("aria-expanded", "false");
    });
});

/* -------------------------------------------------------------------------- */
/* The command palette                                                       */
/* -------------------------------------------------------------------------- */

test("captures the command palette", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attempt("Command palette", async () => {
        await openPalette();
        await shoot(
            "palette",
            "The command palette, opened with Ctrl+Shift+F: every command, setting and destination the application has, in one searchable list",
            { mapArea: "covered" },
        );

        await page.locator(".mb-palette__search input").first().fill("theme");
        await page.waitForTimeout(500);
        await shoot(
            "palette-search",
            "The command palette filtered by a search, with a setting row that carries its own live control - changing it here changes the real setting, the same way changing it on its own page would",
            {
                crop: page.locator(".mb-palette__card"),
                cropped: "the command palette",
                mapArea: "covered",
            },
        );

        await dismiss();
    });
});

/* -------------------------------------------------------------------------- */
/* The tab strip: its context menu, the finder and the bulk-close preview     */
/* -------------------------------------------------------------------------- */

test("captures the tab strip, its context menu, the tab finder and the bulk-close preview", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    // `workTabs()` scopes every one of these to Work's own strip. Settings carries its own
    // `TabbedNavigation` too (the settings surface is tabbed per the project's own rules - see
    // `AppSettings.vue`), and `DockedSurface` keeps it mounted with `v-show` rather than `v-if`
    // even while closed, so an unscoped `.mb-tabs-strip-row` or `[aria-label="Find a tab"]`
    // resolves to more than one match - the settings surface's copy among them, invisible and
    // therefore never clickable - and `.first()` is not guaranteed to land on the one this suite
    // actually means. The class it names moved from `.mb-shell-tabs` to `.wl-work__tabs` in the
    // Material Design 3 rewrite, which is the whole reason it is behind a function now.
    const shellTabs = workTabs();

    await attempt("Tab strip", async () => {
        await selectDestination("work");
        const strip = shellTabs.locator(".mb-tabs-strip-row").first();
        await strip.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "tab-strip",
            "The browser-style tab strip inside the Work destination: the jobs that have actually been opened rather than every destination the application has, their seeded groups, the new-tab menu, the overflow control that appears only once something stops fitting, and the tab finder's own magnifier",
            { crop: strip, cropped: "the tab strip" },
        );
    });

    await attempt("Tab context menu", async () => {
        // The pinned wizard, which `pinnedWizardTab` explains is the one tab the strip promises
        // stays on screen. Aimed at the tab itself rather than at a label: a pinned tab is drawn
        // compact, so it has neither a label span to aim at nor a close button to hit by mistake.
        await selectDestination("work");
        const tab = pinnedWizardTab();
        await tab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await tab.click({ button: "right", timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-menu", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "tab-context-menu",
            "Right-clicking a tab: its own management commands, with the keyboard-reachable filter every context menu in this application carries and the working shortcut printed beside each item that has one",
            { crop: page.locator(".mb-tabs-menu"), cropped: "the tab's context menu" },
        );
        await dismiss();
    });

    await attempt("Tab finder", async () => {
        await shellTabs
            .locator('[aria-label="Find a tab"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-finder", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(400);
        // `.first()`, not a bare locator: the finder's own `v-menu` carries `eager`, so its
        // content mounts immediately rather than only when opened - and the settings
        // surface's own (normally hidden) `TabbedNavigation` carries the identical finder,
        // so more than one `.mb-tabs-finder` exists in the document at once. Only one is
        // ever visible, but `.screenshot()` enforces exactly one match regardless of
        // visibility, so an unscoped locator here is a strict-mode violation waiting to
        // happen rather than a genuine "did not open" gap.
        await shoot(
            "tab-finder",
            "The tab finder: search this strip, search every open tab in every window, search groups by name, and both text bulk closes, each with its own anchored regex builder",
            { crop: page.locator(".mb-tabs-finder").first(), cropped: "the tab finder" },
        );
    });

    await attempt("Bulk-close preview", async () => {
        if (!(await visible(".mb-tabs-finder"))) {
            skip(
                "Bulk-close preview",
                "the tab finder that hosts this panel did not open in this run, so the panel inside it was never on screen",
            );
            return;
        }
        await page
            .locator(".mb-tabs-finder__toggle", { hasText: "Close many tabs at once" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const panel = page.locator(".mb-tabs-close__panel").first();
        await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // "a" matches several of the shell's own built-in tab labels ("Make a map",
        // "Maps and servers", "Publish to Pages") without matching all of them, so the
        // preview shows a real, partial selection rather than either extreme.
        await panel.locator("input").first().fill("a");
        await page.waitForTimeout(500);
        await shoot(
            "tab-bulk-close-preview",
            "Close tabs containing text, previewing exactly which tabs the pattern matches and what closing them would do, before anything closes",
            { crop: panel, cropped: "the bulk-close panel" },
        );
    });

    await dismiss();
});

/* -------------------------------------------------------------------------- */
/* The appearance editor: its context menu, typography and the colour picker  */
/* -------------------------------------------------------------------------- */

test("captures the per-element lock wizard without creating a credential", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attempt("Per-element lock wizard", async () => {
        const titleBarTarget = page.locator(".mb-appearance-target:has(.mb-titlebar)").first();
        await titleBarTarget.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await titleBarTarget.click({ button: "right", timeout: ELEMENT_TIMEOUT });
        const menu = page.locator(".mb-appearance-target__menu").first();
        await menu.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await menu
            .locator(".v-list-item", { hasText: "Lock this element" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });

        const wizard = page.locator('[data-test="lock-wizard"]');
        await wizard.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "lock-wizard",
            "The anchored per-element lock wizard for the application title bar: password or authenticator choice, one credential for this element, unlock duration, toy-lock disclosure and recovery route",
            { crop: wizard, cropped: "the per-element lock wizard", mapArea: "covered" },
        );
        await wizard.locator('[data-test="lock-cancel"]').click({ timeout: ELEMENT_TIMEOUT });
    });
});

test("captures the appearance editor, its context menu, typography and the infinite colour picker", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    // Taller than the usual surface viewport for this one test. The tab this opens the
    // editor from sits right under the title bar, and the editor anchors to the *top* of
    // its target and grows downward from there - so at the standard 800px height, its own
    // header and tab strip (Text/Surface/Presets) land partly behind the title bar and tab
    // strip's opaque chrome, and a click on the Surface tab times out on an element that is
    // technically present but not actually reachable. More vertical room is the fix, not a
    // different selector - the tabs are exactly where the contract puts them.
    await page.setViewportSize({ width: SURFACE_VIEWPORT.width, height: 1400 });

    await attempt("Appearance editor context menu", async () => {
        // A tab, not a row in some other list: every tab is its own appearance target
        // (the contract's "for tabs specifically" clause), and a tab is always on screen
        // no matter whether this run has a map or a server profile to show elsewhere.
        // Scoped to the shell's own tab bar for the same reason the tab-strip test is:
        // the settings surface carries a second, normally-invisible `TabbedNavigation`.
        await selectDestination("work");
        const tab = pinnedWizardTab();
        await tab.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        // The tab itself, for the reason `pinnedWizardTab` gives: compact means no label span to
        // aim at, and no close button to right-click by accident either.
        await tab.click({ button: "right", timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-tabs-menu", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "appearance-context-menu",
            "A tab's own context menu: its management commands, then \"Edit tab appearance...\" with its working Ctrl+Shift+F10 shortcut printed beside it, and the menu's own searchable filter at the top",
            { crop: page.locator(".mb-tabs-menu"), cropped: "the tab's context menu" },
        );

        await page
            .locator(".mb-tabs-menu .v-list-item", { hasText: "Edit tab appearance" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-appearance-editor", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
    });

    await attempt("Typography editor", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Typography editor",
                "the appearance editor did not open in this run, so its Text tab was never on screen",
            );
            return;
        }
        // The editor opens on its Text tab by default, which is the typography editor.
        await shoot(
            "appearance-typography",
            "The appearance editor's Text tab: every installed and bundled font with its own live preview, size, weight, style and the rest of the Word-depth typography controls, editing this tab's own label live",
            { crop: page.locator(".mb-appearance-editor"), cropped: "the appearance editor" },
        );
    });

    await attempt("Appearance editor surface tab", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Appearance editor surface tab",
                "the appearance editor did not open in this run, so its Surface tab was never on screen",
            );
            return;
        }
        await page
            .locator(".mb-appearance-editor .v-tab", { hasText: "Surface" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "appearance-surface",
            "The appearance editor's Surface tab: background and border colour, border style, radius, spacing, shadow and opacity for this tab, each with a reset of its own",
            { crop: page.locator(".mb-appearance-editor"), cropped: "the appearance editor" },
        );
    });

    await attempt("Infinite colour picker", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Infinite colour picker",
                "the appearance editor did not open in this run, so the colour swatch that opens the picker was never on screen",
            );
            return;
        }
        // Not scoped to the Surface tab's `v-window-item`, this matches every colour
        // field this editor has - Text's own text/highlight/outline colours included -
        // and `v-window` keeps every tab's content mounted for its slide transition, so
        // `.first()` in DOM order lands on one of the Text tab's swatches, which is
        // `display: none` while Surface is active. Confirmed directly: with the editor on
        // its Surface tab, `.mb-color-field__swatch` matches eight elements and the first
        // six report `isVisible() === false` with a `null` bounding box; only the two
        // Surface-tab swatches, last in DOM order, are actually reachable. `:visible`
        // scopes the selector to the ones a click can actually land on.
        await page
            .locator(".mb-color-field__swatch:visible")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-color-picker", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "infinite-colour-picker",
            "The infinite colour picker: a continuous field rather than a swatch grid, translated across named colours, hex, RGB, HSL, HSV, HWB, CIELAB/LCH, OKLab/OKLCH and CMYK, with a contrast readout",
            { crop: page.locator(".mb-color-picker"), cropped: "the infinite colour picker" },
        );
        await dismiss();
    });

    await attempt("Appearance editor presets tab", async () => {
        if (!(await visible(".mb-appearance-editor"))) {
            skip(
                "Appearance editor presets tab",
                "the appearance editor did not open in this run, so its Presets tab was never on screen",
            );
            return;
        }
        await page
            .locator(".mb-appearance-editor .v-tab", { hasText: "Presets" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "appearance-presets",
            "The appearance editor's Presets tab: shipped themes, user presets, import and export, and the reset route for the exact element being edited",
            { crop: page.locator(".mb-appearance-editor"), cropped: "the appearance editor" },
        );
    });

    // Closes the appearance editor itself and returns focus to the tab that opened it.
    await dismiss();

    await page.setViewportSize(SURFACE_VIEWPORT);
});

/* -------------------------------------------------------------------------- */
/* The changelog viewer                                                       */
/* -------------------------------------------------------------------------- */

test("captures the changelog viewer", async () => {
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attemptOnMap("Changelog viewer", async () => {
        await openMenuPage("Info", ".mb-info-page, .mb-info-page__empty");
        const fold = page.locator(".mb-info-page__changelog");
        await fold.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await fold.locator("summary").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-changelog", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(500);
        await shoot(
            "changelog-viewer",
            "The changelog viewer, folded inside the Info page: every released version, its date filter, its own search wired to the regex builder, and the commit each entry links to",
            {
                crop: page.locator(".mb-info-page__changelog"),
                cropped: "the changelog fold in the Info page",
                mapArea: "covered",
            },
        );
    });

    await closeSideSheet();
});

/* -------------------------------------------------------------------------- */
/* The wizard, which needs no map                                             */
/* -------------------------------------------------------------------------- */

test("captures the make-a-map wizard at every step", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await pointAppAtNoMap();
    await page.waitForTimeout(1000);

    await attempt("Wizard, world step", async () => {
        await shoot(
            "wizard-1-world",
            "The make-a-map wizard on its first step, asking for the world folder, with its five steps listed across the top",
        );
    });

    await attempt("Wizard, SSH world source", async () => {
        const opener = page.locator('[data-test="ssh-open"]');
        await opener.click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector("#mb-ssh-world-panel", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(500);
        await shoot(
            "wizard-ssh-world-source",
            "The SSH world-source checklist inside the first wizard step: saved key-only machines, explicit host-key review, remote-world inspection, and a local fetch destination",
            {
                crop: page.locator("#mb-ssh-world-panel"),
                cropped: "the SSH world-source checklist",
            },
        );
        await opener.click({ timeout: ELEMENT_TIMEOUT });
    });

    await attempt("Wizard, Docker world source", async () => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            mobile: false,
        });
        try {
            const opener = page.locator('[data-test="docker-open"]');
            await opener.click({ timeout: ELEMENT_TIMEOUT });
            const panel = page.locator("#mb-docker-world-panel");
            await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(500);

            const metrics = await panel.evaluate((element) => {
                const label = (candidate: Element): string =>
                    candidate.getAttribute("data-test") ??
                    candidate.getAttribute("aria-label") ??
                    candidate.textContent?.trim().slice(0, 80) ??
                    candidate.tagName.toLowerCase();
                const controls = Array.from(
                    new Set([
                        ...element.querySelectorAll<HTMLElement>(
                            "button:not([disabled]), input:not([disabled]), [role='checkbox'], [role='combobox']",
                        ),
                        ...document.querySelectorAll<HTMLElement>(
                            "[data-test='mount-minecraft-folder']",
                        ),
                    ]),
                ).filter((candidate) => candidate.getClientRects().length > 0);
                const hitTarget = (candidate: HTMLElement): HTMLElement =>
                    candidate instanceof HTMLInputElement
                        ? (candidate.closest<HTMLElement>(".v-field, .v-selection-control") ??
                          candidate)
                        : candidate;
                /*
                 * The geometry travels with the name, because the name on its own is a dead end.
                 *
                 * When this check fails the harness writes a diagnostic instead of the capture,
                 * and the whole of what a reader gets is the array in that file. A bare
                 * `["Named volume"]` says which control, never by how much or in which
                 * direction - so diagnosing it means guessing which of three checks fired and
                 * rebuilding the surface locally to measure it. On a Docker-gated surface, which
                 * only renders where a daemon is running, that guess costs a full CI round trip
                 * each time. The numbers cost one clause and are only ever emitted on failure.
                 */
                const withGeometry = (candidate: HTMLElement): string => {
                    const rect = hitTarget(candidate).getBoundingClientRect();
                    return (
                        `${label(candidate)} ` +
                        `[left ${Math.round(rect.left)}, right ${Math.round(rect.right)}, ` +
                        `${Math.round(rect.width)}x${Math.round(rect.height)}, ` +
                        `viewport ${window.innerWidth}x${window.innerHeight}]`
                    );
                };
                const clippedControls = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.left < 0 || rect.right > window.innerWidth;
                    })
                    .map(withGeometry);
                const undersized = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.width < 44 || rect.height < 44;
                    })
                    .map(withGeometry);
                const internallyClippedControls = controls
                    .filter((candidate) => {
                        const content =
                            candidate.querySelector<HTMLElement>(".v-btn__content") ?? candidate;
                        return (
                            content.scrollWidth > content.clientWidth + 1 ||
                            content.scrollHeight > content.clientHeight + 1
                        );
                    })
                    .map((candidate) => {
                        const content =
                            candidate.querySelector<HTMLElement>(".v-btn__content") ?? candidate;
                        return (
                            `${label(candidate)} ` +
                            `[content ${content.scrollWidth}x${content.scrollHeight} ` +
                            `in ${content.clientWidth}x${content.clientHeight}]`
                        );
                    });

                return {
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight,
                        deviceScaleFactor: window.devicePixelRatio,
                    },
                    documentOverflowX:
                        document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
                    panelOverflowX: element.scrollWidth - element.clientWidth,
                    clippedControls,
                    internallyClippedControls,
                    undersized,
                };
            });

            expect(metrics.viewport.width).toBe(390);
            expect(metrics.viewport.height).toBe(844);
            // Chromium reports the float32 representation on Windows
            // (`2.0000000596046448` here), not a hand-rounded integer.
            expect(metrics.viewport.deviceScaleFactor).toBeCloseTo(2, 5);
            expect(metrics.documentOverflowX).toBe(0);
            expect(metrics.bodyOverflowX).toBe(0);
            expect(metrics.panelOverflowX).toBe(0);
            expect(metrics.clippedControls).toEqual([]);
            expect(metrics.internallyClippedControls).toEqual([]);
            expect(metrics.undersized).toEqual([]);
            await writeFile(
                join(shotDir, "wizard-docker-world-source-390x844-200pct.metrics.json"),
                `${JSON.stringify(metrics, null, 2)}\n`,
                "utf8",
            );
            const compactCapture = await cdp.send("Page.captureScreenshot", {
                format: "png",
                fromSurface: true,
                captureBeyondViewport: false,
            });
            const compactName = "wizard-docker-world-source-390x844-200pct";
            const compactSurface =
                "The local Docker world-source checklist at a 390 by 844 CSS-pixel viewport and 200% device scale: Docker's real state, actual containers and volumes, a browsed local destination, live-copy risk acknowledgement, and honest progress";
            const compactCaption =
                `${compactSurface}. ${target.caption} In this image, ${mapNote()}. ` +
                "Captured through Chromium's own DevTools surface so the image uses the same exact CSS viewport and device scale as the metrics. The metrics record zero horizontal overflow, outer or internal control clipping, or undersized interactive targets.";
            await writeFile(
                join(shotDir, `${compactName}.png`),
                Buffer.from(compactCapture.data, "base64"),
            );
            await writeFile(
                join(shotDir, `${compactName}.caption.txt`),
                `${compactCaption}\n`,
                "utf8",
            );
            appendLedger(LEDGER, {
                kind: "capture",
                name: compactName,
                file: `${compactName}.png`,
                surface: compactSurface,
                caption: compactCaption,
                ...resolvedCaptureMetadata(compactName),
                // Missing here before `LedgerCapture.capturedAt` existed as a declared field -
                // this is the one other place in the file that appends a capture entry by hand
                // instead of going through `shoot()`, and it had silently gone without the
                // per-capture timestamp every other image in the manifest carries.
                capturedAt: new Date().toISOString(),
            });
            await opener.click({ timeout: ELEMENT_TIMEOUT });
        } finally {
            await cdp.send("Emulation.clearDeviceMetricsOverride");
            await page.setViewportSize(SURFACE_VIEWPORT);
        }
    });

    const world = captureWorldFolder();
    if (world === null) {
        skip(
            "Wizard steps after the first",
            "the wizard reads the world folder it is given through the main process, so its later " +
                "steps only exist once a real Minecraft world has been read; point " +
                "WORLDLENS_CAPTURE_WORLD at one to capture them",
        );
    } else {
        console.log(`[harness] wizard world folder: ${world}`);
        await attempt("Wizard steps", async () => {
            const field = page.locator(".mb-world-step__row input").first();
            await field.fill(world);
            await field.press("Enter");
            await page.waitForSelector(".mb-world-step__found", {
                state: "visible",
                timeout: 30_000,
            });
            await page.waitForTimeout(600);
            await shoot(
                "wizard-1-world-read",
                "The wizard's first step after the world folder has been read: it names the dimensions it found and how many region files each of them holds",
            );

            // Walked by the step the wizard actually lands on rather than by a counter,
            // because a Next that does not advance would otherwise shift every later
            // name by one and label each capture with the wrong step.
            const seen = new Set<string>(["World"]);
            for (let guard = 0; guard < 8; guard += 1) {
                const next = page.locator(".mb-world-wizard__actions .v-btn", { hasText: "Next" });
                if ((await next.count()) === 0) break;
                await next.first().click({ timeout: ELEMENT_TIMEOUT });
                await page.waitForTimeout(800);

                const step = page.locator("section.mb-world-step").first();
                const label = (await step.getAttribute("aria-label")) ?? `step-${guard}`;
                if (seen.has(label)) continue;
                seen.add(label);
                await shoot(
                    `wizard-${seen.size}-${slug(label)}`,
                    `The make-a-map wizard on its "${label}" step`,
                );
            }

            // The last step offers to start the render. It is photographed rather than
            // pressed: a render needs a Java runtime, an accepted Mojang download consent
            // and minutes of work, and this run declined that consent.
        });
    }

    await attempt("Release downloads", async () => {
        // Back to the first step, where the release downloads panel lives.
        await page
            .locator(".mb-world-wizard__steps .mb-world-wizard__step")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(700);
        await page
            .locator(".mb-world-step__downloads .v-btn")
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-downloads", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.waitForTimeout(600);
        await shoot(
            "wizard-release-downloads",
            "The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine",
            { crop: page.locator(".mb-downloads"), cropped: "the release downloads panel" },
        );
    });

    skip(
        "Release asset list and download progress",
        "listing a release's assets and downloading one both need real traffic to github.com, " +
            "which the offline guard refuses; the panel is captured in the state it is in before " +
            "anything has been asked for",
    );
    skip(
        "Render progress panel",
        "it only exists while a render is actually running, which needs a Java runtime, an " +
            "accepted Mojang download consent and minutes of work; this run declined that consent",
    );
    skip(
        "Interrupted renders",
        "it only appears when a previous render was interrupted and left a session behind, and " +
            "the throwaway profile this run used has never started one",
    );
});

/* -------------------------------------------------------------------------- */
/* Kid Mode                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Kid Mode had no capture of any kind before this section, in a repository whose whole
 * documentation argument rests on captures being real. That is worth stating plainly rather
 * than leaving to be inferred from a diff: `kid/*.vue` is the largest single UI addition this
 * project's history has, `kidMode.ts`'s own `KEY_ENABLED` flag defaults to `true`, and
 * `App.vue`'s `<KidShell v-if="kid.enabled.value">` means Kid Mode - not the shell every other
 * capture in this file was written against - is the very first screen a fresh install opens on.
 * Nobody, including the agents that built it, had looked at it running until this section existed.
 *
 * It also explains why `pointAppAtCaptureTarget` and `pointAppAtNoMap` above now write
 * `KID_MODE_STORAGE_KEY` explicitly to `"false"` on every reload: every surface captured before
 * this section is written against the adult shell's own class names, none of which exist inside
 * Kid Mode's tree, and a throwaway profile with that key never written opens in Kid Mode by
 * default - not in Adult Mode, which every one of those captures silently assumed.
 */

/**
 * Points the app at Kid Mode and reloads so it takes effect - the same seed-then-reload shape
 * `pointAppAtCaptureTarget` and `pointAppAtNoMap` already use, and for the identical reason:
 * `kidMode.ts`'s own `persisted()` helper reads `localStorage` exactly once, at ref creation, so
 * a flag flipped from outside the page only takes effect on the next fresh mount.
 *
 * Deliberately does not touch `PROFILE_STORAGE_KEY`: whatever profile state the real capture
 * target already established (none, on a host with no `WORLDLENS_CAPTURE_MAP`; a real rendered
 * map in CI) is left exactly as it was, because none of Kid Mode's own screens this section
 * captures need one - see `hasLoadedMap()`'s own doc comment for why the surfaces that do are
 * reached through the viewer's side sheet alone, which Kid Mode has no route to at all.
 */
async function pointAppAtKidMode(): Promise<void> {
    await page.evaluate((key: string) => {
        window.localStorage.setItem(key, "true");
    }, KID_MODE_STORAGE_KEY);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppMounted();
    await page.waitForSelector(".wl-kid", { state: "visible", timeout: ELEMENT_TIMEOUT });
}

/**
 * {@link pointAppAtKidMode}, with the language mode and both funny levels also seeded before the
 * same reload - so a language or funny-level capture is deterministic regardless of what an
 * earlier capture in this test left behind, rather than trusting whichever value localStorage
 * still happens to hold. Every caller passes all three explicitly, even to restate the defaults,
 * for exactly that reason: a partial seed here would leave the two not mentioned exactly as
 * stale as the flag `pointAppAtKidMode` alone already fixes for `KID_MODE_STORAGE_KEY`.
 */
async function pointAppAtKidModeWithLanguage(
    mode: "en" | "yue" | "bilingual",
    funnyEn: "1" | "2" | "3" | "4" | "5",
    funnyYue: "1" | "2" | "3" | "4" | "5",
): Promise<void> {
    await page.evaluate(
        (seed: {
            kidKey: string;
            modeKey: string;
            mode: string;
            funnyEnKey: string;
            funnyEn: string;
            funnyYueKey: string;
            funnyYue: string;
        }) => {
            window.localStorage.setItem(seed.kidKey, "true");
            window.localStorage.setItem(seed.modeKey, seed.mode);
            window.localStorage.setItem(seed.funnyEnKey, seed.funnyEn);
            window.localStorage.setItem(seed.funnyYueKey, seed.funnyYue);
        },
        {
            kidKey: KID_MODE_STORAGE_KEY,
            modeKey: LANGUAGE_MODE_KEY,
            mode,
            funnyEnKey: LANGUAGE_FUNNY_EN_KEY,
            funnyEn,
            funnyYueKey: LANGUAGE_FUNNY_YUE_KEY,
            funnyYue,
        },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppMounted();
    await page.waitForSelector(".wl-kid", { state: "visible", timeout: ELEMENT_TIMEOUT });
}

/**
 * What every Kid Mode caption says about the map area, derived from the real capture target
 * rather than assumed - so this run tells the truth whether it has a rendered map to serve
 * (CI, with `WORLDLENS_CAPTURE_MAP` set) or does not (this host, today). Kid Mode's own shell
 * fills the window edge to edge in every view this section captures, so a loaded map is either
 * entirely covered by it or does not exist at all; it is never visible underneath.
 *
 * `"empty-not-wizard"` rather than plain `"none"` for the no-map case - see that value's own
 * doc comment on `MapArea`. A Kid Home capture with `mapArea: "none"` produced the exact false
 * clause this project's own evidence-inventory digest note already records having removed once
 * before, from a different cause: "no map is loaded, so the application is showing the wizard
 * for making one", underneath a picture of Kid Home, which is not the wizard and has no route to
 * it - confirmed by running this section for real, once, before this fix existed.
 */
function kidMapArea(): MapArea {
    return hasLoadedMap() ? "covered" : "empty-not-wizard";
}

/**
 * Why "captures Kid Mode" never takes a light/dark/contrast pair the way "captures both themes"
 * does for the adult shell: Kid Mode is not a themeable surface of the adult shell, it is its own
 * fixed palette. `App.vue` watches Vuetify's live theme name and snaps it straight back to `"kid"`
 * the instant Kid Mode is active ("Kid Mode is the reason it should never have moved"), regardless
 * of whatever light/dark/contrast choice is saved in Adult Mode's own Settings - so there is no
 * second Kid Mode palette this harness could switch to and no third to compare it against. Every
 * capture below already shows the one true Kid Mode palette (`KID_SCHEME` in `kidTheme.ts`), which
 * is exactly the fact this constant's callers put into a caption and a recorded skip rather than
 * leaving a reader to wonder why no `kid-theme-*` pair sits beside `theme-light.png`/`theme-dark.png`.
 */
const KID_THEME_NOTE =
    "Kid Mode always paints from its own fixed 'kid' Vuetify theme (KID_SCHEME in kidTheme.ts) " +
    "rather than the light/dark/contrast scheme chosen in Adult Mode's own Settings - App.vue's " +
    "own watcher snaps the live theme name straight back to 'kid' the instant Kid Mode is active, " +
    "so there is no separate light/dark/contrast variant of any Kid Mode surface to capture.";

test("captures Kid Mode", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Kid Home", async () => {
        await pointAppAtKidMode();
        const home = page.locator(".wl-kid-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-home",
            "Kid Mode's Home, and the default view of a fresh install: kidMode.ts's own KEY_ENABLED " +
                "flag defaults to true, so this - not the adult shell - is the very first screen this " +
                "application ever shows anybody. The GO hero card, the five catalogues drawn as " +
                "picture-first 'lands', what the app is doing right now, and the maps and servers " +
                "this computer already knows about",
            { mapArea: kidMapArea(), note: KID_THEME_NOTE },
        );
    });

    await attempt("Kid rail", async () => {
        const rail = page.locator(".wl-kid-rail");
        await rail.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "kid-rail",
            "Kid Mode's own rail, cropped from the Home capture above: Home, Explore, My jobs and " +
                "Stickers as big picture-first destinations with the level badge and XP bar in the " +
                "status header above them, then Find, Messages and the grown-up gate as small footer " +
                "actions - the same three-destination-plus-footer shape the adult rail has, per " +
                "KidRail.vue's own doc comment",
            { crop: rail, cropped: "the Kid Mode rail", mapArea: kidMapArea() },
        );
    });

    await attempt("Kid catalogue page", async () => {
        await page.locator(".wl-kid-home__land").first().click({ timeout: ELEMENT_TIMEOUT });
        const catalogue = page.locator(".wl-kid-cat");
        await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-catalogue",
            "One of Kid Mode's five catalogues, opened as a 'land' from Kid Home: every feature it " +
                "holds as its own picture-first row with the real shipped blurb underneath, grouped " +
                "under headings, with the same search field and anchored regex builder every other " +
                "catalogue page in this application carries (ConfigSearchField, reused rather than " +
                "hand-rolled, per KidCataloguePage.vue's own doc comment)",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid job strip", async () => {
        await page.locator(".wl-kid-rail__big", { hasText: "My jobs" }).first().click({
            timeout: ELEMENT_TIMEOUT,
        });
        const jobs = page.locator(".wl-kid-jobs");
        await jobs.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-job-strip",
            "Kid Mode's Work view: WorkPane re-hosted rather than reimplemented, per KidJobStrip.vue's " +
                "own doc comment - the exact same tab strip, seeded groups, pinning, drag reorder and " +
                "overflow as Adult Mode's own Work destination, wearing Kid Mode's own labels (applied " +
                "through WorkPane's existing renamePage) and a 64px-minimum chip floor rather than the " +
                "adult shell's 44px one",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Sticker book", async () => {
        await page.locator(".wl-kid-rail__big", { hasText: "Stickers" }).first().click({
            timeout: ELEMENT_TIMEOUT,
        });
        const stickers = page.locator(".wl-kid-stickers");
        await stickers.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-stickers",
            "The sticker book on a fresh capture profile: every sticker this build knows about, each " +
                "naming the real feature it is earned from and doubling as a second route into that " +
                "feature's catalogue rather than a dead trophy shelf, none of them won yet - a fresh " +
                "profile has completed nothing, and the book says so plainly (KidStickerBook.vue's own " +
                "doc comment: 'a sticker that has not been won says so plainly; nothing is hidden or " +
                "teased')",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Grown-up gate, no credential configured", async () => {
        await page.locator('[aria-label="Grown-ups: switch to Adult Mode"]').first().click({
            timeout: ELEMENT_TIMEOUT,
        });
        const gate = page.locator(".wl-kid-gate");
        await gate.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-gate-no-credential",
            "The grown-up gate in its no-credential-configured state, which is the state every fresh " +
                "install actually starts in: nobody has ever set the shared restricted-mode code on " +
                "this computer, so KidGrownUpGate.vue lets one press go straight through to Adult Mode " +
                "rather than demanding a code that was never set - the mechanism its own doc comment " +
                "says exists precisely so 'Kid Mode must never become a one-way door'. The honesty line " +
                "at the bottom names this as a user-experience lock, not a security lock, and names the " +
                "real reset route rather than gesturing at it",
            { mapArea: kidMapArea() },
        );
    });

    /*
     * The gate's other branch - `lockConfigured`, reached once a grown-up has actually set the
     * shared code - is deliberately not captured here, and this is a genuine architecture fact
     * rather than a harness limitation, so it is worth the length of this explanation.
     *
     * That shared code is not scoped to this run's throwaway `--user-data-dir` the way every other
     * piece of state this harness seeds is. `SchoolModeStore`
     * (design/packages/app/src/main/schoolMode/record.ts) writes it to
     * `<app.getPath("appData")>/Ding-Ding Shared/school-mode.v1.json` - a location `schoolMode.ts`'s
     * own module doc comment calls "the shared restricted-mode record" on purpose, because every
     * Kid-Mode-capable app on a machine reads and writes the same file. `app.getPath("appData")` is
     * resolved once in `main/index.ts`, before `WORLDLENS_SCREENSHOTS` redirects `userData` to this
     * run's throwaway profile, and is never itself redirected - so setting a real credential here to
     * reach this one capture would write that file to this machine's real, persistent
     * application-data directory, not to anything this run deletes when it finishes.
     *
     * This project's own harness already declines exactly this trade for a strictly weaker case:
     * "captures the reset-settings super confirmation" arms its slider and then presses Emergency
     * exit rather than complete it, because "driving the slider to the end really does reset every
     * setting and reload the page, and a capture is not worth doing that" - and that slider's own
     * blast radius is the throwaway profile alone, which this run deletes on exit regardless. Forcing
     * a real credential onto a shared, cross-app, host-persistent file is the more cautious side of
     * the identical judgment, not a stricter one invented for this surface alone.
     *
     * It costs nothing this harness cannot already show: the two capture profiles that state needs
     * (no credential, credential) differ by exactly one prop read - `noLockConfigured` versus
     * `lockConfigured` in KidGrownUpGate.vue's own template - and the branch that would differ is
     * fully quoted in this file's earlier read of that component. And it is not a fixed limitation of
     * this harness either: a CI runner's own ephemeral `$HOME` makes this reachable safely there,
     * where the file this note is careful about evaporates with the runner regardless of whether
     * anything ever cleaned it up.
     */
    skip(
        "Grown-up gate, credential configured",
        "reaching this state needs a real shared restricted-mode credential, and that record is " +
            "deliberately not scoped to this run's throwaway --user-data-dir: SchoolModeStore " +
            "(design/packages/app/src/main/schoolMode/record.ts) writes it to " +
            "<app.getPath('appData')>/Ding-Ding Shared/school-mode.v1.json, a location shared on " +
            "purpose across every Kid-Mode-capable app on the host. Setting one here to capture this " +
            "state would write that file to this machine's real, persistent application-data " +
            "directory rather than to the disposable profile the rest of this harness confines " +
            "itself to - the same trade this file's own 'captures the reset-settings super " +
            "confirmation' test already declines for a strictly weaker case (a slider armed and then " +
            "backed out of with Emergency exit, because completing it 'really does reset every " +
            "setting ... and a capture is not worth doing that', even though that slider's own blast " +
            "radius is the throwaway profile alone). See this test's own comment immediately above " +
            "for the full reasoning, including why this is a genuine architecture fact rather than a " +
            "fixed harness limitation",
    );

    /*
     * The wrong-code refusal (`failed.value = true` in `KidGrownUpGate.vue`) is a sub-state of the
     * exact branch the skip immediately above already declines to reach, not a separate capability
     * question: `lockConfigured` has to be true before the code-entry field even renders, and that
     * needs the same real shared restricted-mode credential the skip above explains this harness
     * will not write to this machine's real, persistent application-data directory. There is no
     * route to a wrong-code refusal that does not first go through the state that skip is about, so
     * this is recorded as its own named gap rather than silently folded into that one - a reader
     * searching this manifest for "wrong-code" or "refusal" should find an answer, not a class they
     * have to infer belongs together with a differently-worded neighbour.
     */
    skip(
        "Grown-up gate, wrong-code refusal",
        "a sub-state of the credentialed branch the 'Grown-up gate, credential configured' skip above " +
            "already declines to reach on this host, for the identical reason given there in full: the " +
            "shared restricted-mode credential a wrong code would be checked against is not scoped to " +
            "this run's throwaway --user-data-dir, so there is no credentialed branch on this host for a " +
            "wrong code to be typed into in the first place. Reachable safely in CI, where the ephemeral " +
            "runner's own $HOME makes both this and the credentialed branch above genuinely safe to seed",
    );

    await attempt("Kid Mode settings row", async () => {
        await page.locator(".wl-kid-gate__go").click({ timeout: ELEMENT_TIMEOUT });
        // `switchToAdult()` (KidShell.vue) sets `kid.enabled.value = false`; `<KidShell v-if=...>`
        // unmounts on its own the moment Vue's next patch runs, and `openSettingsSection` below
        // needs the adult rail this unmount uncovers - see `openSettingsSurface`'s own doc comment
        // on why it clicks `.wl-rail__footer`, which does not exist while Kid Mode's tree is up.
        await page.waitForSelector(".wl-kid", { state: "detached", timeout: ELEMENT_TIMEOUT });
        await openSettingsSection("kid-mode", "Kid Mode and Adult Mode");
        const row = page.locator(`${APP_SETTINGS} [data-anchor="kid-mode"]`);
        await row.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-mode-settings-row",
            "The Kid Mode settings row, reached the moment this run first leaves Kid Mode through its " +
                "own grown-up gate: the Kid Mode/Adult Mode choice, showing Adult Mode selected because " +
                "this capture is looking at the row from inside Adult Mode; the child's name; the " +
                "celebration and sound switches; and the label-style choice. The accessible name of " +
                "every control keeps the real feature name at all three label styles, per this row's " +
                "own doc comment",
            { crop: page.locator(APP_SETTINGS), cropped: "the settings panel", mapArea: "covered" },
        );
        await dismiss();
    });

    skip(
        "Kid Mode theme variants (light/dark/contrast)",
        KID_THEME_NOTE +
            " Not a harness limitation: there is genuinely nothing else to capture " +
            "here, and the note on the 'Kid Home' capture above says the same thing at the point a " +
            "reader is most likely to be asking why no kid-theme-* pair sits beside " +
            "theme-light.png/theme-dark.png",
    );

    skip(
        "Celebration",
        "KidCelebration.vue only ever fires from a real completion event forwarded through App.vue's " +
            "awardKidSticker() - a rendered map opened, a page published to GitHub Pages, a local " +
            "render finished, or the guide finding a world (App.vue's own doc comment on that " +
            "function: 'every caller below this point is a real action finishing, never a fabricated " +
            "signal'). Every one of those needs either the vendored Java render pipeline with an " +
            "accepted Mojang download consent and minutes of work (the same reason 'Render progress " +
            "panel' above is unreachable) or a signed-in GitHub account (the same reason 'GitHub " +
            "account, signed in' above is unreachable). Calling useKidProgress().award() directly from " +
            "this harness, bypassing awardKidSticker's real trigger, would be exactly the staging this " +
            "file's own header rules out for every surface: 'no value is planted to make a screen look " +
            "populated, and no screen stands in for a different one'",
    );

    await attempt("Kid Home, compact phone viewport (390 CSS px)", async () => {
        await pointAppAtKidMode();
        const cdp = await page.context().newCDPSession(page);
        try {
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width: 390,
                height: 844,
                deviceScaleFactor: 1,
                mobile: false,
            });
            const home = page.locator(".wl-kid-home");
            await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
            await shoot(
                "kid-home-390",
                "Kid Home at 390 by 844 CSS pixels - the same phone width the redesigned adult shell " +
                    "proves itself at (COMPACT_PHONE_VIEWPORTS): the rail, hero, five lands and both " +
                    "panels holding their layout rather than being narrowed to a scroll of unreadable " +
                    "pieces, at Kid Mode's own 64px-minimum touch targets",
                {
                    mapArea: kidMapArea(),
                    capture: async () => {
                        const captured = await cdp.send("Page.captureScreenshot", {
                            format: "png",
                            fromSurface: true,
                            captureBeyondViewport: false,
                        });
                        return Buffer.from(captured.data, "base64");
                    },
                    note:
                        "Captured through Chromium's DevTools surface at the exact CSS viewport, the " +
                        "same technique 'captures the redesigned Home shell at compact phone viewports' " +
                        "uses for the adult shell.",
                },
            );
        } finally {
            await cdp.send("Emulation.clearDeviceMetricsOverride");
        }
    });

    /*
     * Everything below this point is the expansion from one frame per surface to a real matrix:
     * all five catalogues rather than one, Explore, Find and Messages, the catalogue search's own
     * regex builder, a sticker book that has actually won something, both funny-level extremes,
     * Cantonese and bilingual on two surfaces, and the narrow-width/display-scale matrix the
     * redesigned adult shell already proves itself against. Kid Home is left active, in English,
     * at 1280x800 and 1x scale by the compact-viewport capture immediately above, which is exactly
     * the state every step below assumes as its own starting point - and every step that cannot
     * simply trust that assumption (because an earlier step in this same list navigated away,
     * reloaded, or changed a seeded preference) re-establishes it explicitly rather than hoping.
     */

    /*
     * Four more catalogues, so the whole navigation model has a picture rather than one land of
     * it. `.wl-kid-home__land.nth(i)` is a position-based selector rather than the `hasText`
     * selectors the rest of this file's kid-mode navigation uses: `CATALOGUES` in `catalogues.ts`
     * is a fixed five-entry array and `resolveCatalogues` maps it 1:1 with no filtering or
     * reordering (confirmed by reading that function before relying on it), and a position never
     * changes when the active language mode does - which matters directly below, where the
     * Cantonese and bilingual catalogue captures reuse this exact land-by-index click to reach a
     * catalogue with no English-text selector anywhere in the path.
     */
    const REMAINING_KID_CATALOGUES: readonly {
        readonly index: number;
        readonly slug: string;
        readonly label: string;
        readonly shipped: string;
        readonly surface: string;
    }[] = [
        {
            index: 1,
            slug: "maps",
            label: "Your maps",
            shipped: "Your maps",
            surface: "Kid catalogue: Your maps",
        },
        {
            index: 2,
            slug: "share",
            label: "Show people",
            shipped: "Share a map",
            surface: "Kid catalogue: Show people",
        },
        {
            index: 3,
            slug: "copy",
            label: "Keep it safe",
            shipped: "Keep a copy",
            surface: "Kid catalogue: Keep it safe",
        },
        {
            index: 4,
            slug: "setup",
            label: "Buttons & help",
            shipped: "Set up & help",
            surface: "Kid catalogue: Buttons & help",
        },
    ];
    for (const land of REMAINING_KID_CATALOGUES) {
        await attempt(land.surface, async () => {
            await page.locator(".wl-kid-rail__big").first().click({ timeout: ELEMENT_TIMEOUT });
            await page
                .locator(".wl-kid-home")
                .waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page
                .locator(".wl-kid-home__land")
                .nth(land.index)
                .click({ timeout: ELEMENT_TIMEOUT });
            const catalogue = page.locator(".wl-kid-cat");
            await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
            await shoot(
                `kid-catalogue-${land.slug}`,
                `Kid Mode's "${land.label}" land (the shipped feature name is "${land.shipped}"; position ` +
                    `${land.index} of 5 on Home) - one of the five catalogues, alongside the first one the ` +
                    "existing 'Kid catalogue page' capture already proves above: every feature it holds as its " +
                    "own picture-first row with the real shipped blurb underneath, the same search field and " +
                    "anchored regex builder every catalogue page in this application carries",
                { mapArea: kidMapArea() },
            );
        });
    }

    await attempt("Kid Explore view", async () => {
        await page
            .locator(".wl-kid-rail__big", { hasText: "Explore" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const mapView = page.locator(".wl-kid__map");
        await mapView.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(600);
        await shoot(
            "kid-explore",
            "Kid Mode's Explore view: the one screen in this whole shell where the real map canvas shows through " +
                "its own chrome instead of being covered by it (`.wl-kid__map`'s own doc comment in " +
                "KidShell.vue names this as the deliberate exception to every other kid-mode view painting an " +
                "opaque surface over the entire window) - the free-flight controls, zoom buttons, control bar " +
                "and main menu the #map slot forwards, over " +
                (hasLoadedMap()
                    ? "the same rendered map every other map capture in this run shows"
                    : "the viewer's own empty state, since this run served no rendered map to load"),
            { mapArea: hasLoadedMap() ? "map" : "empty-not-wizard" },
        );
    });

    await attempt("Kid Find (command palette)", async () => {
        await page
            .locator('[aria-label="Find anything"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-palette", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-find-palette",
            "The command palette, opened from Kid Mode's own rail 'Find anything' footer button rather than the " +
                "Ctrl+Shift+F shortcut the adult shell's own 'Command palette' capture uses: KidShell.vue's " +
                "openPalette() routes through the real 'Set up & help' catalogue feature " +
                "setup.how-the-interface-behaves.command-palette and activates it exactly as any other feature " +
                "target would, rather than a fabricated row invented for this button - so this is the same " +
                "global palette every other capture in this file already proves, reached the way a child " +
                "actually presses it",
            { mapArea: "covered" },
        );
        await dismiss();
    });

    await attempt("Kid Messages (notification centre)", async () => {
        await page.locator('[aria-label="Messages"]').first().click({ timeout: ELEMENT_TIMEOUT });
        const panel = page.locator(".wl-notifications");
        await panel.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-messages",
            "The notification centre, opened from Kid Mode's own rail 'Messages' footer button through the same " +
                "'Set up & help' catalogue route Find above uses " +
                "(setup.how-the-interface-behaves.notification-centre). NotificationPanel.vue anchors this " +
                "overlay to the adult rail's own bell button by CSS selector, and that button does not exist " +
                "while Kid Mode's own tree is mounted in its place - this capture is the honest, driven proof of " +
                "whatever Vuetify's v-menu genuinely does when its declared activator selector resolves to " +
                "nothing, not an assumption about it",
            { crop: panel, cropped: "the notifications panel", mapArea: kidMapArea() },
        );
        await dismiss();
    });

    await attempt("Kid catalogue search regex builder", async () => {
        await page.locator(".wl-kid-rail__big").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.locator(".wl-kid-home").waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.locator(".wl-kid-home__land").first().click({ timeout: ELEMENT_TIMEOUT });
        await page.locator(".wl-kid-cat").waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page
            .locator('.wl-kid-cat__search [aria-label="Open the regex builder"]')
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForSelector(".mb-config-regex", {
            state: "visible",
            timeout: ELEMENT_TIMEOUT,
        });
        await page.locator(".mb-config-regex__pattern textarea").first().fill("world|render");
        await page.waitForTimeout(700);
        await shoot(
            "kid-catalogue-regex-builder",
            "The anchored regex builder, opened from a Kid catalogue's own search field - ConfigSearchField, the " +
                "identical component and the identical 'Open the regex builder' control the adult settings " +
                "search already proves above, reused rather than hand-rolled per KidCataloguePage.vue's own doc " +
                "comment: the pattern, the supported flags, the guided token palette and the live matches " +
                "against this catalogue's own rows",
            {
                crop: page.locator(".mb-config-regex"),
                cropped: "the regex builder",
                mapArea: kidMapArea(),
            },
        );
        await dismiss();
    });

    await attempt("Kid Home, funny level 1 (fully serious)", async () => {
        await pointAppAtKidModeWithLanguage("en", "1", "3");
        const home = page.locator(".wl-kid-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-home-funny-1",
            "Kid Home with the English funny-level slider seeded to 1 (fully serious) and reloaded so it takes " +
                "effect (worldlens.language.funny.en, the persisted key setupI18n.ts reads): the hero heading " +
                "and blurb read at their plainest voiced level - compare against the funny-level-5 capture " +
                "immediately below, the identical screen at the opposite extreme",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid Home, funny level 5 (maximum playfulness)", async () => {
        await pointAppAtKidModeWithLanguage("en", "5", "3");
        const home = page.locator(".wl-kid-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-home-funny-5",
            "Kid Home with the English funny-level slider seeded to 5 (maximum playfulness) and reloaded so it " +
                "takes effect: the same hero heading and blurb as the funny-level-1 capture above, at the " +
                "opposite end of the same slider - the voice changes, the facts (what the GO button does, what " +
                "each land opens) never do",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid Home, Cantonese", async () => {
        await pointAppAtKidModeWithLanguage("yue", "3", "3");
        const home = page.locator(".wl-kid-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-home-yue",
            'Kid Home with the language mode seeded to Cantonese (worldlens.language.mode = "yue") and reloaded ' +
                "so it takes effect. This is the first capture in this whole harness's history to exercise the " +
                "language mode on any surface, and it found a real, honest gap rather than a clean result: the " +
                "rail, the hero card, the status header and both panel headings genuinely render Cantonese " +
                "(kidCopy.ts's own KID_VOICED strings, driven by the same setLanguageMode this file's language" +
                "-mode seed writes to) - but the five catalogue land labels below the hero stay in English " +
                "('Make a map', 'Your maps', 'Show people', 'Keep it safe', 'Buttons & help') at every language " +
                "mode. Confirmed by reading the source rather than guessed at: KID_CATALOGUE_LABELS in " +
                "kidLabels.ts is a plain hardcoded object with no t() call at all, and the shipped catalogue " +
                "titles underneath them (catalogue.make.title etc. in catalogues.ts) have no Cantonese entry " +
                "anywhere in this application's copy catalogue (packages/ui/src/copy/surfaces) to translate to " +
                "- confirmed by searching the whole design/ tree for those exact key strings and finding only " +
                "their own English-fallback definition. This is not a kid-mode-only gap either: the adult " +
                "Home Catalogues page reads the identical CATALOGUES array through the identical " +
                "resolveCatalogues(), so it renders the same English-only land titles in Cantonese mode too",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid catalogue page, Cantonese", async () => {
        await page.locator(".wl-kid-home__land").first().click({ timeout: ELEMENT_TIMEOUT });
        const catalogue = page.locator(".wl-kid-cat");
        await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-catalogue-yue",
            "The first Kid catalogue in Cantonese, reached by the same position-based land click the " +
                "five-catalogue captures above use rather than an English-text selector - the language mode is " +
                'still seeded to "yue" from the Kid Home capture immediately above this one, since neither this ' +
                "step nor the click that opened this page reloaded the page in between. Only the rail, the " +
                "level badge and the search field's own placeholder are actually Cantonese in this picture: the " +
                "catalogue's own heading, its group headings ('Finding a world', 'Setting up a render', ...) and " +
                "every feature row's name and blurb render in English regardless of language mode, because " +
                "CataloguePage.vue and KidCataloguePage.vue both source that copy from catalogues.ts's own " +
                "nameKey/blurbKey/groupKey strings and no Cantonese message answers any of them - the same real " +
                "gap the Kid Home Cantonese capture above found on this screen's own land labels, extended to " +
                "the catalogue's entire body",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid Home, bilingual", async () => {
        await pointAppAtKidModeWithLanguage("bilingual", "3", "3");
        const home = page.locator(".wl-kid-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-home-bilingual",
            "Kid Home with the language mode seeded to bilingual and reloaded so it takes effect: the rail, " +
                "hero, status header and both panel headings genuinely pair English with Cantonese underneath " +
                "it, exactly as designed. The same five catalogue land labels that stayed English-only in the " +
                "Cantonese-only capture above stay English-only here too, with no Cantonese line underneath " +
                "them at all rather than a shortened or missing pairing - the same untranslated-key gap, just " +
                "visibly obvious in bilingual mode specifically because every other label on this screen does " +
                "carry a second line and these five plainly do not",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid catalogue page, bilingual", async () => {
        await page.locator(".wl-kid-home__land").first().click({ timeout: ELEMENT_TIMEOUT });
        const catalogue = page.locator(".wl-kid-cat");
        await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-catalogue-bilingual",
            "The first Kid catalogue in bilingual mode, reached the same position-based way as every other " +
                "catalogue capture in this section. Its heading, group headings and every feature row stay " +
                "English-only here too, with no Cantonese line beneath any of them - the same untranslated " +
                "catalogue-copy gap the Cantonese capture immediately above this one already found on this same " +
                "page",
            { mapArea: kidMapArea() },
        );
    });

    await attempt("Kid Home, compact phone viewport (360 CSS px)", async () => {
        await pointAppAtKidModeWithLanguage("en", "3", "3");
        const cdp = await page.context().newCDPSession(page);
        try {
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width: 360,
                height: 800,
                deviceScaleFactor: 1,
                mobile: false,
            });
            const home = page.locator(".wl-kid-home");
            await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
            await shoot(
                "kid-home-360",
                "Kid Home at 360 by 800 CSS pixels, the narrowest width COMPACT_PHONE_VIEWPORTS names - the same " +
                    "matrix the redesigned adult shell and Kid Home's own 390px capture above already prove " +
                    "themselves against, extended down to the width where the adult shell's own compact " +
                    "captures start",
                {
                    mapArea: kidMapArea(),
                    capture: async () => {
                        const captured = await cdp.send("Page.captureScreenshot", {
                            format: "png",
                            fromSurface: true,
                            captureBeyondViewport: false,
                        });
                        return Buffer.from(captured.data, "base64");
                    },
                    note:
                        "Captured through Chromium's DevTools surface at the exact CSS viewport, the same " +
                        "technique the 390px Kid Home capture above and the redesigned adult shell's own " +
                        "compact captures use.",
                },
            );
        } finally {
            await cdp.send("Emulation.clearDeviceMetricsOverride");
        }
    });

    await attempt("Kid Home, compact phone viewport (414 CSS px)", async () => {
        await pointAppAtKidModeWithLanguage("en", "3", "3");
        const cdp = await page.context().newCDPSession(page);
        try {
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width: 414,
                height: 896,
                deviceScaleFactor: 1,
                mobile: false,
            });
            const home = page.locator(".wl-kid-home");
            await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await page.waitForTimeout(400);
            await shoot(
                "kid-home-414",
                "Kid Home at 414 by 896 CSS pixels, the widest of the three phone widths " +
                    "COMPACT_PHONE_VIEWPORTS names, alongside the 360px capture above and the 390px capture " +
                    "further up this section",
                {
                    mapArea: kidMapArea(),
                    capture: async () => {
                        const captured = await cdp.send("Page.captureScreenshot", {
                            format: "png",
                            fromSurface: true,
                            captureBeyondViewport: false,
                        });
                        return Buffer.from(captured.data, "base64");
                    },
                    note:
                        "Captured through Chromium's DevTools surface at the exact CSS viewport, the same " +
                        "technique used throughout this section.",
                },
            );
        } finally {
            await cdp.send("Emulation.clearDeviceMetricsOverride");
        }
    });

    /*
     * Not wrapped in a `REQUIRED_SURFACES` entry, matching the adult shell's own "captures the
     * shell at every supported display scale" test: that one is not required either. Window size
     * and display-scale variation is treated as a matrix worth proving, not as a distinct surface
     * whose disappearance alone should turn coverage red - the CSS-viewport widths above are the
     * one exception this file already makes, for the compact-shell contract specifically.
     */
    await attempt("Kid Home at every supported display scale", async () => {
        await pointAppAtKidModeWithLanguage("en", "3", "3");
        try {
            for (const scale of SCALES) {
                await page.evaluate((z) => {
                    document.documentElement.style.zoom = String(z);
                }, scale);
                await page.waitForTimeout(300);
                const home = page.locator(".wl-kid-home");
                await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
                await shoot(
                    `kid-home-scale-${String(scale).replace(".", "_")}x`,
                    `Kid Home at ${scale * 100}% display scale, the same SCALES matrix 'captures the shell at ` +
                        "every supported display scale' already proves for the adult shell",
                    { mapArea: kidMapArea() },
                );
            }
        } finally {
            await page.evaluate(() => {
                document.documentElement.style.zoom = "1";
            });
        }
    });

    /*
     * Deliberately the last Kid Mode capture that touches this key, so the "70 XP, two won" state
     * it plants never bleeds into any of the fresh-install captures above - every one of which
     * would otherwise be an honest picture of a dishonest state, since nothing else in this test
     * clears the ledger between steps. `useKidProgress().award()` bypassing the real completion
     * event is explicitly not used here (see that module's own doc comment on why nothing outside
     * a real event may call it): this seeds the exact persisted record that function itself writes
     * to, through the identical seed-then-reload mechanism this file already uses for the profile,
     * the kid-mode flag and the language preferences above, and says so plainly in its own caption.
     */
    await attempt("Sticker book, with progress seeded", async () => {
        await page.evaluate(
            (seed: { kidKey: string; ledgerKey: string; ledgerValue: string }) => {
                window.localStorage.setItem(seed.kidKey, "true");
                window.localStorage.setItem(seed.ledgerKey, seed.ledgerValue);
            },
            {
                kidKey: KID_MODE_STORAGE_KEY,
                ledgerKey: KID_PROGRESS_LEDGER_KEY,
                ledgerValue: JSON.stringify({
                    xp: 70,
                    won: [
                        { id: "first-map", at: "2026-01-01T00:00:00.000Z" },
                        { id: "world-finder", at: "2026-01-02T00:00:00.000Z" },
                    ],
                }),
            },
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForAppMounted();
        await page.waitForSelector(".wl-kid", { state: "visible", timeout: ELEMENT_TIMEOUT });
        await page
            .locator(".wl-kid-rail__big", { hasText: "Stickers" })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const stickers = page.locator(".wl-kid-stickers");
        await stickers.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "kid-stickers-won",
            "The sticker book with two of its eight stickers won and 70 XP: 'Won!' at full opacity on 'Map " +
                "maker' and 'World finder', 'Not yet' and dimmed on the other six - the difference the always" +
                "-empty 'Sticker book' capture above cannot show. This state was SEEDED directly into " +
                "bluemap-kid-progress, the exact localStorage key useKidProgress.ts persists to and reads back " +
                "on mount (JSON-parsed by that module's own defensive read(), the identical seed-then-reload " +
                "mechanism every other planted value in this file uses), NOT earned through a real completion " +
                "event: reaching 'first-map' for real needs the vendored Java render pipeline with an accepted " +
                "Mojang download consent, and reaching 'world-finder' for real needs driving the make-a-world " +
                "wizard's own guide end to end, both of which this harness avoids for the same reasons the " +
                "'Celebration' skip below gives in full. No celebration toast accompanies this picture, and " +
                "none ever could from this route: KidCelebration.vue's celebrate() is called only from " +
                "KidShell.vue's own award(), at the moment a real completion event fires, never derived from " +
                "the ledger a component merely reads on mount - so seeding the ledger populates the book " +
                "without, and could never also, stage a celebration",
            { mapArea: kidMapArea() },
        );
    });

    // Language mode, both funny levels and the sticker ledger are local-only preferences and
    // planted state with no effect on anything this file captures after this point, but cleared
    // anyway - the same "leave it the way a fresh install found it" discipline the compact-viewport
    // capture above already states for the profile and location hash it restores.
    await page.evaluate(
        (keys: readonly string[]) => {
            for (const key of keys) window.localStorage.removeItem(key);
        },
        [LANGUAGE_MODE_KEY, LANGUAGE_FUNNY_EN_KEY, LANGUAGE_FUNNY_YUE_KEY, KID_PROGRESS_LEDGER_KEY],
    );

    // Left the way a fresh install opens, so nothing after this point - including the closing
    // guarantee tests below - has to guess which shell is on screen. This also restores the real
    // capture target's own profile and location hash, which every reload inside this test left
    // untouched but which `pointAppAtKidMode` never reasserted either.
    await pointAppAtCaptureTarget();
});

/* -------------------------------------------------------------------------- */
/* The guarantees                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The tripwire from issue #17, asserted rather than assumed.
 *
 * It fails on the first request to anything that is not loopback (or, in remote mode, the
 * one server that run was deliberately browsing), and names every offender, because the
 * failure this exists to catch is a capture that quietly starts costing a third party
 * bandwidth again.
 */
test("reached nothing but the machine it ran on", async () => {
    expect(rendererNetworkGuardInstalled, "the renderer offline guard was not installed").toBe(
        true,
    );
    expect(
        rendererNetworkViolations,
        "the capture tried to reach the network; see captureTarget.ts and issue #17",
    ).toEqual([]);
});

test("records what was captured", async () => {
    // Read back off disk, not out of two arrays this module has been accumulating. Those arrays
    // were empty in this worker whenever an earlier one had failed - which is exactly when a
    // reader most needs the record - and the manifest they produced was a confident, detailed
    // description of five captures beside a directory holding fifty-three images.
    const { captures, skipped } = readLedger(LEDGER);
    for (const gap of skipped)
        console.log(`[harness] not captured - ${gap.surface}: ${gap.reason}`);

    // A manifest makes the artifact self-describing, so a reviewer reading an issue
    // comment can tell which build and which surface an image came from.
    const manifest = {
        capturedBy: "design/packages/app/test/screenshots.spec.ts",
        method: "Playwright CDP attached to the exact Worldlens process launched on a cheap Lowlevel hidden desktop",
        commit: CAPTURE_COMMIT,
        run: process.env.GITHUB_RUN_ID ?? "(local run)",
        captureMode: target.mode,
        mapSource:
            target.mode === "local"
                ? `served over loopback from ${target.profile?.url ?? "(unknown)"}`
                : target.mode === "remote"
                  ? (target.profile?.url ?? "(unknown remote server)")
                  : "none: no map was loaded",
        renderedBy: target.provenance?.renderer ?? null,
        world: target.provenance?.world ?? null,
        renderedAt: target.provenance?.renderedAt ?? null,
        renderEvidence: target.renderEvidence,
        fixtureRequestsServed: target.servedRequests(),
        offlineGuard:
            target.mode === "remote"
                ? `loopback plus ${target.allowedOrigins.join(", ")}`
                : "loopback only; every other host is refused and recorded",
        networkViolations: rendererNetworkViolations,
        viewports: VIEWPORTS.map((v) => v.name),
        compactPhoneViewports: COMPACT_PHONE_VIEWPORTS.map((v) => ({
            name: v.name,
            width: v.width,
            height: v.height,
            unit: "CSS pixels",
        })),
        scales: SCALES,
        mapContentPresent: mapDrew,
        caption: target.caption,
        captures,
        skipped,
        captureMatrix: CAPTURE_MATRIX.map((entry) => ({
            ...entry,
            commitProvenance: CAPTURE_COMMIT,
        })),
        captureMatrixSummary: {
            total: CAPTURE_MATRIX.length,
            required: CAPTURE_MATRIX.filter((entry) => entry.classification === "required").length,
            softSkips: CAPTURE_MATRIX.filter((entry) => entry.classification === "soft-skip")
                .length,
        },
        note:
            "Every image is a capture of the real running app. None is a mockup or a design " +
            "file. Publish each one with its caption from captions.md: the caption is what " +
            "keeps a capture of the viewer from being read as a capture of the mesher. " +
            "`skipped` lists the surfaces this run could not reach, with the reason; nothing " +
            "was substituted for any of them.",
    };
    await mkdir(shotDir, { recursive: true });
    await writeFile(join(shotDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // Ready to paste into an issue or a release comment, so the caption travels with the
    // image instead of being left behind in a JSON file nobody opens.
    const lines = [
        "# Screenshots",
        "",
        `Commit \`${manifest.commit}\`, run \`${manifest.run}\`, capture mode \`${target.mode}\`.`,
        "",
        target.caption,
        "",
        ...captures.flatMap((capture) => [
            `## ${capture.name}`,
            "",
            `![${capture.alt}](${capture.file})`,
            "",
            capture.caption,
            "",
        ]),
        ...(skipped.length === 0
            ? [
                  "## Nothing was skipped",
                  "",
                  "Every surface this harness knows about was captured.",
                  "",
              ]
            : [
                  "## Not captured",
                  "",
                  "Nothing was substituted for these. They are listed so the gap is visible.",
                  "",
                  ...skipped.map((gap) => `- **${gap.surface}**: ${gap.reason}`),
                  "",
              ]),
    ];
    await writeFile(join(shotDir, "captions.md"), `${lines.join("\n")}\n`, "utf8");
});

/**
 * The surfaces whose absence is a defect rather than a gap.
 *
 * `attempt()` deliberately records a missing surface instead of failing, so forty good
 * captures still reach the artifact when one screen refuses to open. That is right for a
 * screen which needs a Java runtime, a real GitHub account or a render in flight - and
 * wrong for a screen that is simply part of the application. The distinction had to be
 * made after a one-line fix in the options editor took six of its captures with it and
 * left the job green: the gap was in the manifest, and a green tick is what anybody
 * actually reads.
 *
 * A surface belongs here when it needs nothing but the application itself. `needsLoadedMap`
 * narrows that to "nothing but the application, once it has a map", which is a real precondition
 * rather than an excuse: the viewer's side sheet is opened by the control bar's Menu button, and
 * `ControlBar.vue` renders behind `v-if="app"`, so with no BlueMap instance there is no button,
 * no sheet, and none of the surfaces inside it. A run that *does* serve a map holds every one of
 * these to the full standard through the same code.
 *
 * Hand-written, and deliberately not derived from the steps below. A list generated from what the
 * file happens to attempt would be satisfied by a file that attempts nothing - the same shape of
 * hole as a rule about well-formed records passing a record that was never written.
 */
const REQUIRED_SURFACES: readonly RequiredSurface[] = [
    { surface: "Settings drawer" },
    { surface: "Settings sections" },
    { surface: "Settings search" },
    { surface: "Settings regex builder" },
    { surface: "Options editor" },
    { surface: "Options editor tabs" },
    { surface: "Options editor search" },
    { surface: "Options editor regex builder" },
    { surface: "History" },
    { surface: "Projects" },
    { surface: "CI-render screen" },
    { surface: "Pages publishing screen" },
    { surface: "EULA viewer" },
    { surface: "Profile manager" },
    // "Notification corner" is gone on purpose: the redesigned shell has no toast stack to
    // photograph - notices land at the rail bell's history only (see 45fa6f4).
    // The centre and its history can both render while their actual rail activator has regressed.
    // Keep this separate so a future fallback through the palette cannot make the real control's
    // missing interaction look covered.
    { surface: "Notification centre opened from the rail's bell" },
    { surface: "Backup screen" },
    // Added when an audit found the palette, the appearance editor, the changelog and
    // most of the tab strip's own surfaces had no capture step at all - so a change that
    // deleted any of them outright would still have left this run green. Every one of
    // these opens with nothing but the running application: no account, no network, no
    // render in flight.
    { surface: "Command palette" },
    { surface: "Tab strip" },
    { surface: "Tab context menu" },
    { surface: "Tab finder" },
    { surface: "Bulk-close preview" },
    { surface: "Appearance editor context menu" },
    { surface: "Typography editor" },
    { surface: "Appearance editor surface tab" },
    { surface: "Infinite colour picker" },
    // Added with the Material Design 3 shell. Home is where the application now opens and had no
    // capture of any kind, and the rail is where the three deleted floating buttons went - so
    // between them they are the whole of the shell's own navigation, which is precisely the part
    // that had been silently rewritten under a harness that could not see it.
    { surface: "Application rail" },
    { surface: "Work destination" },
    { surface: "Home catalogues" },
    { surface: "Home catalogue page" },
    // Hand-written rather than made from COMPACT_PHONE_VIEWPORTS: a loop that accidentally stops
    // calling either compact route must make coverage red, not shrink the requirement alongside it.
    { surface: "Compact Home catalogues (360 CSS px)" },
    { surface: "Compact Home catalogue page (360 CSS px)" },
    { surface: "Compact Home catalogues (390 CSS px)" },
    { surface: "Compact Home catalogue page (390 CSS px)" },
    { surface: "Compact Home catalogues (414 CSS px)" },
    { surface: "Compact Home catalogue page (414 CSS px)" },
    // Every one of these is inside the viewer's side sheet, which does not exist without a map.
    { surface: "Changelog viewer", needsLoadedMap: true },
    { surface: "Viewer control bar", needsLoadedMap: true },
    { surface: "Menu, root page", needsLoadedMap: true },
    { surface: "Maps menu", needsLoadedMap: true },
    { surface: "Settings menu", needsLoadedMap: true },
    { surface: "Info page", needsLoadedMap: true },
    { surface: "Marker menu", needsLoadedMap: true },
    { surface: "Menu search bar", needsLoadedMap: true },
    { surface: "Reset settings super confirmation", needsLoadedMap: true },
    // Added after an audit found eight more surfaces that shipped with no capture step at
    // all - the marker studio, three tab-strip jobs App.vue's own doc comment names as
    // "built, tested and unreachable until this", the Structures page and the drop zone that
    // lives on it, the always-present personal-vocabulary row, and the dim sum surprise - so a
    // change deleting any of them outright would still have left this run green.
    //
    // The marker studio is reached through the marker menu, so it shares that menu's
    // precondition: no map, no menu, no studio button to press.
    { surface: "Marker studio", needsLoadedMap: true },
    // The lead image of this project, so it is required rather than merely attempted. It needs a
    // map for the obvious reason, and shares the precondition every other map surface carries.
    { surface: "Rendered map", needsLoadedMap: true },
    { surface: "Authenticator page" },
    { surface: "Authenticator registration chooser" },
    { surface: "Locks page" },
    { surface: "Support Tickets page" },
    { surface: "Support Tickets local response" },
    { surface: "Structures page" },
    { surface: "Drop-render zone" },
    { surface: "Personal vocabulary settings row" },
    // Six more that shipped with no capture step of any kind. Three are job screens reached
    // through the tab strip exactly as the four above are, and each needs nothing but the running
    // application: the conversion screen, the Ollama suite manager on a machine with no runtime,
    // and the browser-extension downloads list. The landing screen is required separately from
    // "Home catalogues" because they are two components on one destination and the catalogues'
    // step photographs only the second of them, so Home's own screen could vanish under a green
    // run. The notification duration row is required for the reason it exists at all: it was
    // built and left unmounted once, and an unmounted control is invisible to every test that
    // renders it in isolation.
    //
    // "Remote hosting panel" is deliberately absent. It renders only below a finished render,
    // which a capture profile has none of, so its attempt records an honest gap instead.
    { surface: "Chunker page" },
    { surface: "Converter target step" },
    { surface: "Converter trim step" },
    { surface: "Converter block-mapping step" },
    { surface: "Converter regex builder" },
    { surface: "Converter world-settings step" },
    { surface: "Converter review step" },
    { surface: "Ollama page" },
    { surface: "Ollama runtime recovery" },
    { surface: "Ollama Model Store" },
    { surface: "Ollama Model Store regex builder" },
    { surface: "Ollama pull cart" },
    { surface: "Ollama chat" },
    { surface: "Browser extension downloads page" },
    { surface: "Renders screen" },
    { surface: "World repository screen" },
    { surface: "Local preview screen" },
    { surface: "Offline documentation index" },
    { surface: "Offline documentation search" },
    { surface: "Offline documentation article" },
    { surface: "Home screen" },
    { surface: "Notification duration settings row" },
    // A one-in-ten startup draw is not a surface a capture run can reach by waiting, so this
    // is forced through a screenshot-harness-only localStorage override - see
    // `DimSumSurprise.vue`'s own doc comment and `DIMSUM_TEST_OVERRIDE_KEY` above for why that
    // is the honest route rather than a weakening of the real chance for anyone else.
    { surface: "Dim sum surprise" },
    { surface: "Per-element lock wizard" },
    { surface: "Appearance editor presets tab" },
    // Kid Mode ships on by default (kidMode.ts's own KEY_ENABLED flag) and had no capture of any
    // kind before the "Kid Mode" section above - every one of these needs nothing but the running
    // application, exactly like the surfaces above it. "Grown-up gate, credential configured" and
    // "Celebration" are deliberately absent from this list: both are recorded skips with a full
    // explanation in the "captures Kid Mode" test rather than required surfaces, because reaching
    // either one safely needs something this harness cannot supply on every host it runs on - see
    // that test's own comments immediately above each `skip()` call.
    { surface: "Kid Home" },
    { surface: "Kid rail" },
    { surface: "Kid catalogue page" },
    { surface: "Kid job strip" },
    { surface: "Sticker book" },
    { surface: "Grown-up gate, no credential configured" },
    { surface: "Kid Mode settings row" },
    { surface: "Kid Home, compact phone viewport (390 CSS px)" },
    // Added when the eight-frame set above was audited and found to be one picture per surface
    // and nothing more, for a mode that ships on by default and is the first screen a fresh
    // install shows anybody. Every entry below needs nothing but the running application, exactly
    // like the eight above: no account, no render, no map. Language mode, both funny levels, the
    // narrow-width matrix and the display-scale matrix are deliberately NOT required entries here,
    // matching the adult shell's own precedent - "captures the shell at every supported display
    // scale" and its theme captures are not required either, because they prove a matrix on top of
    // an already-required surface rather than a surface that could silently vanish on its own. The
    // three CSS-viewport widths are the one exception this file already makes, for the compact-shell
    // contract specifically, which is why the 360px and 414px entries below join the existing 390px
    // one rather than the funny-level and language captures beside them in the test body.
    { surface: "Kid catalogue: Your maps" },
    { surface: "Kid catalogue: Show people" },
    { surface: "Kid catalogue: Keep it safe" },
    { surface: "Kid catalogue: Buttons & help" },
    { surface: "Kid Explore view" },
    { surface: "Kid Find (command palette)" },
    { surface: "Kid catalogue search regex builder" },
    { surface: "Kid Home, compact phone viewport (360 CSS px)" },
    { surface: "Kid Home, compact phone viewport (414 CSS px)" },
    // "Kid Messages (notification centre)" is deliberately absent from this required list. The
    // scout report behind this expansion flagged real, unresolved uncertainty about how Vuetify's
    // v-menu behaves when its declared `:activator` selector (the adult rail's own bell button)
    // does not exist in the document at all, which is genuinely the case while Kid Mode's tree is
    // mounted - so this is attempted, honestly, rather than promised as always reachable.
    // "Sticker book, with progress seeded" is also deliberately absent: it is a planted variant of
    // the already-required "Sticker book" above, not a distinct surface, and requiring it forever
    // would mean requiring this file to keep inventing seed data rather than reporting an honest
    // gap if the seeding mechanism itself ever breaks.
];

test("captured every surface that needs nothing but the application", () => {
    const verdict = coverageVerdict({
        ledger: readLedger(LEDGER),
        required: REQUIRED_SURFACES,
        hasLoadedMap: hasLoadedMap(),
        chunked: CHUNKED_RUN,
    });

    // Printed whether this passes or fails. A run that was excused eight surfaces and went green
    // must not be readable as a run that captured them, and the only way to be sure of that is to
    // say so where the result is read rather than in a file somebody would have to go and open.
    for (const excused of verdict.excusedForNoMap) {
        console.log(`[harness] not required in a run with no map - ${excused}`);
    }

    expect(
        verdict.missing,
        "These surfaces need no runtime, no account and no render, so a run that could not " +
            "open them is reporting a broken application rather than an unavailable one. The " +
            "record they are judged against is read back from capture-ledger.jsonl rather than " +
            "from memory, so a worker restart can no longer empty it and turn this green.",
    ).toEqual([]);
});
