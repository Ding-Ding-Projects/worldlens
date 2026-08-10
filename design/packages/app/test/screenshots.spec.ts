/**
 * Screenshot harness.
 *
 * Captures the real built app through Playwright's Electron driver, so every image is the
 * actual shipped artifact rather than a mockup, a design file, or a hand-edited picture.
 * This is the only sanctioned way to produce a capture for an issue comment or a release:
 * if a surface cannot be captured here, the honest report is that it has no capture yet.
 *
 * Runs in CI under xvfb. Output lands in `screenshots/` and is uploaded as a build
 * artifact.
 *
 * ## The map is local, and the harness cannot reach the internet
 *
 * The capture used to open the app's default profile, which pointed at the public BlueMap
 * demo somebody else maintains, and pulled real tiles off it on every push (issue #17).
 * It now serves its own map over loopback - a world `packages/worldgen` generated and
 * upstream's BlueMap engine rendered, both in the same CI run - and a network guard
 * refuses and records anything that is not loopback, so the old behaviour cannot come
 * back by accident. See `captureTarget.ts` and `networkGuard.ts`.
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

import {
    test,
    expect,
    _electron as electron,
    type ElectronApplication,
    type Locator,
    type Page,
} from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { COLOR_SCHEMES, DARK_SCHEME, LIGHT_SCHEME, type SchemeName } from "@worldlens/shared";
import { migrationEnvironment, resolveCaptureTarget } from "./captureTarget.js";
import type { CaptureTarget } from "./captureTarget.js";
import {
    appendLedger,
    coverageVerdict,
    readLedger,
    resetLedger,
    type RequiredSurface,
} from "./captureLedger.js";
import {
    describeViolation,
    installNetworkGuard,
    networkGuardInstalled,
    networkViolations,
} from "./networkGuard.js";

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
const SURFACE_TIMEOUT = 300_000;

/** How long to wait for one element. Short enough that a wrong selector is not a hang. */
const ELEMENT_TIMEOUT = 15_000;

let app: ElectronApplication;
let page: Page;
let target: CaptureTarget;
let mapDrew = false;

/** What the map area of the window holds while a capture is being taken. */
type MapArea =
    /** A map is loaded and the window shows it. */
    | "map"
    /** A map is loaded, but this surface paints over the whole of it. */
    | "covered"
    /** No profile is active, so there is no map at all. */
    | "none";

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
    if (target.mode === "none") return "no map is loaded; the map area is the app's empty state";
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

    const where =
        options.cropped === undefined
            ? `In this image, ${mapNote()}.`
            : `This image is cropped to ${options.cropped} rather than showing the whole window.`;
    const caption = [`${surface}.`, target.caption, where, options.note].filter(Boolean).join(" ");
    await writeFile(join(shotDir, `${name}.caption.txt`), `${caption}\n`, "utf8");
    appendLedger(LEDGER, { kind: "capture", name, file: `${name}.png`, surface, caption });

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
async function attempt(surface: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
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
        await page
            .screenshot({ path: join(shotDir, `diagnostic-${slug(surface)}.png`) })
            .catch(() => undefined);
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
 */
async function pointAppAtCaptureTarget(): Promise<void> {
    const state = JSON.stringify({
        profiles: target.profile === null ? [] : [target.profile],
        activeId: target.profile?.id ?? null,
    });

    await page.evaluate(
        (seed: { key: string; value: string; hash: string }) => {
            window.localStorage.setItem(seed.key, seed.value);
            if (seed.hash.length > 0) window.location.hash = seed.hash;
        },
        { key: PROFILE_STORAGE_KEY, value: state, hash: target.locationHash },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
}

/**
 * Clears the active profile and reloads, so the shell shows the make-a-map wizard.
 *
 * The wizard and the map are separate pages in the persistent tab strip. Clearing the
 * active profile makes the wizard page truthful, but a fresh shell still lands on the map
 * tab, so the harness follows the same visible navigation a person would use before it
 * waits for the wizard. It never forces the component into the DOM over another page.
 */
async function pointAppAtNoMap(): Promise<void> {
    await page.evaluate((key: string) => {
        window.localStorage.setItem(key, JSON.stringify({ profiles: [], activeId: null }));
        window.location.hash = "";
    }, PROFILE_STORAGE_KEY);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app", { timeout: 30_000 });
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
    await aim.click({ timeout: ELEMENT_TIMEOUT });
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
        .click({ timeout: ELEMENT_TIMEOUT });
    // `hasText` with a plain string, never a regular expression. Playwright normalises whitespace
    // when the matcher is a string and deliberately does not when it is a regex, and a Vuetify
    // list item wraps its label in enough markup to leave newlines either side of it - so an
    // anchored `/^Projects$/` matches a label reading exactly "Projects" not at all, and fails as
    // a fifteen-second timeout on a menu that is open and correct on screen.
    const item = page
        .locator(".mb-tabs-strip__sheet:visible .v-list-item")
        .filter({ hasText: name })
        .first();
    await item.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    await item.click({ timeout: ELEMENT_TIMEOUT });
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
async function openJob(pageId: string, name: RegExp, label: string): Promise<void> {
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
        await tab.waitFor({ state: "attached", timeout: ELEMENT_TIMEOUT });
    }

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

    await expandShellTabGroups();
    if (await tab.isVisible().catch(() => false)) {
        await activateTab(tab);
        return;
    }

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

/** Presses Escape and lets the closing transition finish. */
async function dismiss(): Promise<void> {
    await page.keyboard.press("Escape");
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
async function ensureOptionsEditorClosed(): Promise<void> {
    if (!(await visible(".mb-config-screen"))) return;
    await page
        .locator('[role="region"][aria-label="Server configuration"]')
        .press("Escape")
        .catch(() => undefined);
    await page.waitForTimeout(700);
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
 * first run, and answers it the way a cautious person would: it declines the Mojang
 * download consent, which is a real answer, is remembered, and downloads nothing.
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

    // Decline, not accept. It is a real answer, it is remembered, and it leaves the
    // machine this ran on in the state it was already in rather than recording an
    // agreement to somebody else's licence on their behalf.
    await page.locator(".mb-setup-card__answer").nth(1).click({ timeout: ELEMENT_TIMEOUT });
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
 * that just failed for a reason this function does not know - and Mojang's licence stays
 * declined either way, because nothing here calls `acceptDownload`.
 */
async function ensureFirstRunClosed(): Promise<void> {
    const stillOpen = await page.locator(".mb-setup-card").count();
    if (stillOpen === 0) return;

    skip(
        "First-run setup: completion",
        "the flow did not reach Finish in this run; completing it directly through the " +
            "bridge so the dialog does not reopen, still declined, after the reload that " +
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
     */
    if (test.info().workerIndex === 0) resetLedger(LEDGER);

    target = await resolveCaptureTarget();
    console.log(`[harness] capture mode: ${target.mode}`);
    console.log(`[harness] caption: ${target.caption}`);

    // A throwaway profile directory, so the first-run flow is genuinely a first run and
    // whatever machine this is running on keeps its own settings.
    const userData = await mkdtemp(join(tmpdir(), "worldlens-capture-"));
    console.log(`[harness] user data: ${userData}`);

    // `--force-prefers-reduced-motion` is not cosmetic here, it is what makes the run
    // deterministic. The interface animates deliberately now - pages arrive, tabs inside an
    // expanding group fade in, disclosures open - and Playwright's `click()` waits for an
    // element to be *stable* before it will press it. On a loaded CI runner that wait can
    // outlast the timeout, and the failure reads as "the harness could not open Projects",
    // which is a sentence about a screen that is working perfectly. It also stops captures
    // catching a half-played frame, which is a photograph of nothing anybody's build
    // actually looks like. The application honours the media query by removing every
    // transition and animation, so this is the app's own supported path rather than a
    // special mode invented for the harness.
    app = await electron.launch({
        args: [
            appRoot,
            "--no-sandbox",
            "--disable-gpu",
            "--force-prefers-reduced-motion",
            `--user-data-dir=${userData}`,
        ],
        env: {
            ...process.env,
            // main/index.ts honours --user-data-dir only under this explicit capture
            // seam. Production launches still pin storage to the immutable product
            // identity; this throwaway run gets a genuine empty first-run profile.
            WORLDLENS_SCREENSHOTS: "1",
        },
    });

    // Before anything is pointed at a map. The app makes no outbound request until a
    // server profile is active, and the only thing that activates one is
    // `pointAppAtCaptureTarget` below, which runs after this.
    await installNetworkGuard(app, target.allowedOrigins);
    expect(
        await networkGuardInstalled(app),
        "the offline guard did not install; refusing to capture unguarded",
    ).toBe(true);

    // Surface what the renderer is actually doing. A blank window with a silent console is
    // the hardest failure to diagnose from CI, and the whole point of this harness is to
    // produce evidence rather than a timeout.
    app.process().stdout?.on("data", (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on("data", (d) => process.stderr.write(`[main] ${d}`));

    page = await app.firstWindow();
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
    await page.waitForSelector("#app", { timeout: 30_000 });
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
        await page.screenshot({ path: join(shotDir, "diagnostic-unmounted.png") });
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
    await app?.close();
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
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();

    await attempt("Home catalogues", async () => {
        await selectDestination("home");
        const home = page.locator(".wl-home");
        await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "home-catalogues",
            "Home, the destination the application opens on: five catalogues covering everything it can do, each card saying what that catalogue is for, with its own search across all of them",
            { mapArea: "covered" },
        );
    });

    await attempt("Home catalogue page", async () => {
        await selectDestination("home");
        // By its accessible name rather than by a position in the grid, so re-ordering the
        // catalogues - or adding a sixth - moves this capture rather than breaking it. Each card
        // is one button whose accessible name is its own text, so the catalogue's title is what
        // matches; the two nested actions on the hero card are deliberately outside that button,
        // per `HomeCatalogues.vue`'s own note about a button inside a button.
        await page
            .locator(".wl-home")
            .getByRole("button", { name: /set up & help/i })
            .first()
            .click({ timeout: ELEMENT_TIMEOUT });
        const catalogue = page.locator(".wl-catalogue").first();
        await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(400);
        await shoot(
            "home-catalogue-page",
            "One catalogue opened from Home: every feature it holds as its own row with a blurb saying what it does, grouped under headings, and the search that reaches all of them",
            { mapArea: "covered" },
        );
        await page.locator('[data-destination="home"]').click({ timeout: ELEMENT_TIMEOUT });
        await page.waitForTimeout(300);
    });
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
    test.setTimeout(SURFACE_TIMEOUT);
    await ensureOptionsEditorClosed();
    await page.setViewportSize(SURFACE_VIEWPORT);

    try {
        for (const viewport of COMPACT_PHONE_VIEWPORTS) {
            /*
             * The normal Electron window cannot be smaller than 800px. A `setViewportSize(360)`
             * call would therefore prove only the operating system's minimum, even when the
             * capture name says 360. Chromium's DevTools metric override changes the renderer's
             * CSS viewport without lying about the native-window constraint; the Docker wizard's
             * compact capture later in this file uses the same path.
             */
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: 1,
                mobile: false,
            });
            const captureCompactViewport = async (): Promise<Buffer> => {
                const captured = await cdp.send("Page.captureScreenshot", {
                    format: "png",
                    fromSurface: true,
                    captureBeyondViewport: false,
                });
                return Buffer.from(captured.data, "base64");
            };

            try {
                await attempt(`Compact Home catalogues (${viewport.width} CSS px)`, async () => {
                    await selectDestination("home");
                    const home = page.locator(".wl-home");
                    await home.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
                    await page.waitForTimeout(400);

                    const name = `redesign-home-catalogues-${viewport.name}`;
                    const metrics = await inspectCompactSurface(home, COMPACT_HOME_TARGETS);
                    expectCompactSurfaceMetrics(metrics, viewport);
                    await writeCompactMetrics(name, metrics);
                    await shoot(
                        name,
                        `The redesigned Home catalogue shell at ${viewport.width} by ${viewport.height} CSS pixels: the persistent application rail, five-catalogue discovery surface, and anchored search field in their compact layout`,
                        {
                            mapArea: "covered",
                            capture: captureCompactViewport,
                            note: "Captured through Chromium's DevTools surface at the exact CSS viewport. The metrics sidecar records zero horizontal overflow, no clipped visible controls, and every primary compact target at least 44 by 44 CSS pixels.",
                        },
                    );
                });

                await attempt(
                    `Compact Home catalogue page (${viewport.width} CSS px)`,
                    async () => {
                        await selectDestination("home");
                        await page
                            .locator(".wl-home")
                            .getByRole("button", { name: /set up & help/i })
                            .first()
                            .click({ timeout: ELEMENT_TIMEOUT });
                        const catalogue = page.locator(".wl-catalogue").first();
                        await catalogue.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
                        await page.waitForTimeout(400);

                        const name = `redesign-home-catalogue-page-${viewport.name}`;
                        const metrics = await inspectCompactSurface(
                            catalogue,
                            COMPACT_CATALOGUE_TARGETS,
                        );
                        expectCompactSurfaceMetrics(metrics, viewport);
                        await writeCompactMetrics(name, metrics);
                        await shoot(
                            name,
                            `A redesigned Home catalogue at ${viewport.width} by ${viewport.height} CSS pixels: feature rows, their direct targets, the persistent application rail, and the catalogue's own search field without a horizontal escape route`,
                            {
                                mapArea: "covered",
                                capture: captureCompactViewport,
                                note: "Captured through Chromium's DevTools surface at the exact CSS viewport. The metrics sidecar records zero horizontal overflow, no clipped visible controls, and every primary compact target at least 44 by 44 CSS pixels.",
                            },
                        );

                        await page
                            .locator('[data-destination="home"]')
                            .click({ timeout: ELEMENT_TIMEOUT });
                        await page.waitForTimeout(300);
                    },
                );
            } finally {
                await cdp.send("Emulation.clearDeviceMetricsOverride");
            }
        }
    } finally {
        await page.setViewportSize(SURFACE_VIEWPORT);
        await selectDestination("home");
    }
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
async function chooseColourScheme(scheme: "dark" | "light"): Promise<void> {
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
    await choices.nth(scheme === "dark" ? 1 : 2).click({ timeout: ELEMENT_TIMEOUT });

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

test("captures both themes", async () => {
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

    for (const scheme of ["light", "dark"] as const) {
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
        painted.get("light"),
        "the two colour-scheme captures are the same picture; the scheme reached nothing",
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
    await page
        .locator(".wl-rail__footer")
        .getByRole("button", { name: "Settings", exact: true })
        .first()
        .click({ timeout: ELEMENT_TIMEOUT });
    await page.waitForSelector(APP_SETTINGS, { state: "visible", timeout: ELEMENT_TIMEOUT });
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
 * through all six sections and leaves the last one (Language and tone) active when it
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
        ];

        await openSettingsSurface();
        const searchInput = page.locator(`${APP_SETTINGS} .mb-settings__search input`).first();

        for (const { anchor, title } of anchors) {
            await searchInput.fill("");
            await searchInput.fill(anchor);
            const result = page.locator(`${APP_SETTINGS} .mb-settings__result`, { hasText: title });
            await result.first().waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
            await result.first().click();
            await page.waitForTimeout(500);
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
        await dismiss();
        await page.locator(`${APP_SETTINGS} .mb-settings__search input`).first().fill("");
        await page.waitForTimeout(400);
    });

    skip(
        "GitHub account, signed in",
        "signing in needs a real GitHub account and a real device-flow round trip to github.com, " +
            "and the offline guard refuses every request that is not loopback; the signed-out " +
            "state of the account section is real and is the one captured",
    );

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
 * Dismisses every live toast through the same controls a person uses.
 *
 * This does not clear notification history: a dismissed notification remains searchable in the
 * centre, as it should. It only makes the next editor mount's notice distinguishable from a toast
 * that another capture happened to leave on screen. Reaching into the store would make a cleaner
 * image but would no longer prove the shared notification path the image claims to show.
 */
async function dismissLiveNotices(): Promise<void> {
    for (let guard = 0; guard < 16; guard += 1) {
        const toast = page.locator(".mb-config-notices__toast:visible").first();
        if (!(await toast.isVisible().catch(() => false))) return;

        await toast.locator(".mb-config-notices__dismiss").click({ timeout: ELEMENT_TIMEOUT });
        await toast.waitFor({ state: "hidden", timeout: ELEMENT_TIMEOUT });
    }

    throw new Error("The notification corner kept a live toast after 16 real dismiss actions.");
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
async function reopenOptionsEditorForFreshNotice(): Promise<Locator> {
    await ensureOptionsEditorClosed();
    await page.waitForSelector(".mb-config-screen", {
        state: "hidden",
        timeout: ELEMENT_TIMEOUT,
    });
    await dismissLiveNotices();
    await ensureOptionsEditor();

    const freshToast = page.locator(".mb-config-notices__toast:visible").last();
    await freshToast.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
    return freshToast;
}

test("captures the options editor, its tabs and its dialogs", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Options editor", async () => {
        await ensureOptionsEditor();

        // Taken first and quickly: an informational notice dismisses itself after five
        // seconds, and this one is raised by the editor mounting.
        if (await visible(".mb-config-notices__toast")) {
            await shoot(
                "notifications-toast",
                "The notification corner reporting, without blocking anything, what the options editor loaded when it opened",
                { mapArea: "covered", note: CONFIG_STATE_NOTE },
            );
        }

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

test("captures the notification corner, rail bell and its history", async () => {
    test.setTimeout(SURFACE_TIMEOUT);

    await attempt("Notification corner", async () => {
        // The editor is deliberately remounted here rather than merely ensured open. Its real
        // informational toast lives for five seconds, and a previous capture sequence could
        // leave an already-open editor whose original toast had correctly disappeared long before
        // this step ran. `reopenOptionsEditorForFreshNotice()` drives the real close/dismiss/open
        // route and returns only the new shared notice, so this image is not a stale survivor.
        const freshToast = await reopenOptionsEditorForFreshNotice();
        const corner = page.locator(".mb-config-notices");
        await corner.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await freshToast.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT });
        await shoot(
            "notifications-corner",
            "The notification corner in the bottom right: a message that reports without blocking anything, and beside it the button that opens the history of everything the application has said",
            { crop: corner, cropped: "the notification corner" },
        );
    });

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

        await bell.click({ timeout: ELEMENT_TIMEOUT });
        await expect(bell).toHaveAttribute("aria-expanded", "true");
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
        await expect(bell).toHaveAttribute("aria-expanded", "false");
    });

/*
 * A named gap for the control, distinct from the panel it is supposed to open.
 *
 * The panel above is a real capture through a real route, so calling *it* missing would be a
 * false statement about an image that plainly exists. The bell is a different surface and it
 * genuinely could not be photographed doing its job, so it gets its own line in the manifest.
 * A defect that leaves no trace in the published record is a defect nobody reads about.
 */
skip(
    "Notification centre opened from the rail's bell",
    "the rail's Notifications button does not open the panel it anchors: pressing it on a " +
        'fresh profile leaves its own aria-expanded at "false" and puts neither ' +
        ".wl-notifications nor .mb-notice-centre in the document, while the command palette's " +
        "row for the same panel opens it every time. The panel itself is captured above " +
        "through that working route; what has no honest capture is the bell working",
);

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

    // Two presses: the first closes the colour picker popover, the second closes the
    // appearance editor itself and returns focus to the tab that opened it.
    await dismiss();
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
                const clippedControls = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.left < 0 || rect.right > window.innerWidth;
                    })
                    .map(label);
                const undersized = controls
                    .filter((candidate) => {
                        const rect = hitTarget(candidate).getBoundingClientRect();
                        return rect.width < 44 || rect.height < 44;
                    })
                    .map(label);
                const internallyClippedControls = controls
                    .filter((candidate) => {
                        const content =
                            candidate.querySelector<HTMLElement>(".v-btn__content") ?? candidate;
                        return (
                            content.scrollWidth > content.clientWidth + 1 ||
                            content.scrollHeight > content.clientHeight + 1
                        );
                    })
                    .map(label);

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
    expect(await networkGuardInstalled(app), "the offline guard was not installed").toBe(true);

    const violations = await networkViolations(app);
    expect(
        violations.map(describeViolation),
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
        method: "Playwright _electron against the packaged app entry point",
        commit: process.env.GITHUB_SHA ?? "(local run)",
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
        fixtureRequestsServed: target.servedRequests(),
        offlineGuard:
            target.mode === "remote"
                ? `loopback plus ${target.allowedOrigins.join(", ")}`
                : "loopback only; every other host is refused and recorded",
        networkViolations: await networkViolations(app),
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
            `![${capture.surface}](${capture.file})`,
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
    { surface: "Notification corner" },
    // The corner and its history can both render while their actual rail activator has regressed.
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
];

test("captured every surface that needs nothing but the application", () => {
    const verdict = coverageVerdict({
        ledger: readLedger(LEDGER),
        required: REQUIRED_SURFACES,
        hasLoadedMap: hasLoadedMap(),
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
