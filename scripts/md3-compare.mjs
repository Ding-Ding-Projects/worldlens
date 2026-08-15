#!/usr/bin/env node
/**
 * Drives the plain Material 3 conformance app (`design/packages/md3-check`) headlessly,
 * captures one side-by-side PNG per comparison row per theme, and writes a single JSON report
 * of every measured value and every difference between the hand-typed Material 3 reference
 * markup and this application's own Vuetify (Worldlens) rendering.
 *
 * ## Why this exists, and what it is not
 *
 * `docs/design-system.md` documents the token vocabulary this application is *supposed* to
 * spend. Nothing before this script ever checked that against an independent reference - every
 * conformance claim in this repository was a claim about the code, never a claim about two
 * things measured and photographed next to each other. A harness that flatters the app is worse
 * than none, because it will be believed; this one exists to make a mismatch visible, not to
 * paper over it. `design/packages/md3-check/src/renderer/styles/m3Reference.scss`'s own header
 * is explicit that its "reference" pane is a **hand transcription** of the published baseline
 * spec, not a certified copy and not sourced from any installed reference implementation
 * (`@material/web` is not a dependency anywhere in this workspace). Read
 * `docs/md3-conformance.md`'s "what this can and cannot prove" section before trusting a clean
 * report - this script inherits every one of that pane's limitations, because it measures
 * exactly what that pane renders.
 *
 * ## Why raw CDP instead of Playwright
 *
 * `scripts/` sits at the repository root, outside the `design/` pnpm workspace, and has no
 * `node_modules` of its own - there is no `package.json` here to declare a Playwright
 * dependency against. `design/packages/site/scripts/compact-proof.mjs` already solves exactly
 * this problem for the same reason (a root-level script driving a real Chromium target) using
 * nothing but Node's global `fetch` and `WebSocket` against the Chrome DevTools Protocol; this
 * script follows that proven pattern rather than inventing a second mechanism. The one thing it
 * does differently is launch the browser itself (`compact-proof.mjs` assumes something else -
 * a wrapper script, a CI step - already started Chromium with `--remote-debugging-port`; this
 * harness has no such wrapper, so it spawns Electron directly and discovers the port from the
 * `DevToolsActivePort` file Chromium writes into the launch profile, which is the same
 * mechanism Puppeteer and Playwright use internally and works for both a fixed port and an
 * OS-assigned one).
 *
 * `Runtime.evaluate` is called with `awaitPromise: false` everywhere in this file, never
 * `true`. This project's own recorded history (see the shared agent instructions' "Verified
 * methods" section) documents a real hang: on some Node/Electron combinations,
 * `Runtime.evaluate` with `awaitPromise: true` never resolves even for trivial expressions,
 * while the same calls with `awaitPromise: false` and manual bounded polling from the Node
 * side complete normally. Every evaluated expression here is therefore synchronous, and any
 * "wait for this to become true" logic is a bounded loop in this file, not inside the page.
 *
 * ## Note for whoever finishes `design/packages/md3-check`
 *
 * That app's own `package.json` declares a `"capture"` script
 * (`"vite build && node scripts/capture.mjs"`) and its main process comment describes
 * `scripts/capture.mjs` as "that *external* Playwright driver script". Neither
 * `design/packages/md3-check/scripts/capture.mjs` nor a Playwright dependency for it exist at
 * the time this file was written, and this script deliberately does not create one there - its
 * own assigned location is this repository-root file, and it never edits anything under
 * `design/packages/md3-check/`. The two halves were built in parallel from separate briefs
 * without a synchronous handshake; this file's contract section below states exactly what it
 * consumes so the mismatch can be reconciled (either by pointing that npm script at this file,
 * or by adding a thin wrapper). Until then, run this script directly:
 * `node scripts/md3-compare.mjs`.
 *
 * ## The contract this script consumes from `design/packages/md3-check`
 *
 * Confirmed against the real source as of this writing (`RowShell.vue`, `harnessState.ts`,
 * `rows.ts`, `rows.test.ts`) - not guessed. `App.vue` and `RowsGallery.vue`, which actually
 * mount everything below, did not exist yet when this script was written, so a run against an
 * incomplete build will legitimately capture nothing or capture a subset; see "How this degrades
 * gracefully" further down.
 *
 *   1. **Rows are discovered live from the DOM**, never requested by id. Every element matching
 *      `[data-md3-row]` is one comparison row; its attribute value is the row's stable id.
 *      `rows.test.ts` already enforces this attribute exists for every row `rows.ts` marks
 *      `"implemented"`, in both directions, so it will not silently drift.
 *   2. **Each row's two panes** are `.md3check-pane--reference` (the hand-typed M3 baseline,
 *      always the visually left/first pane) and `.md3check-pane--worldlens` (this application's
 *      real Vuetify component) - both real classes in `RowShell.vue`'s own template, not this
 *      script's invention.
 *   3. **The one element actually being compared inside each pane** matches `[data-measure]` by
 *      default - `RowShell.vue` itself throws if a pane ever has more than one match, so this
 *      script trusts "first match" the same way. Some rows (`RowShell.vue`'s own doc comment
 *      names checkbox/radio specifically) override this to a narrower selector inside
 *      `RowsGallery.vue`, which this script has no way to discover from outside; see "Known
 *      gaps" below for exactly what that costs.
 *   4. **The screenshot region** for a row is `.md3check-row__panes` (both panes side by side,
 *      without the row's title/citations/data table below it) if present, else the whole row.
 *   5. **Theme switching** is unresolved at the DOM/API level as of this writing -
 *      `harnessState.ts`'s `currentThemeName` ref is a plain module-level Vue ref with no
 *      documented external setter yet, only the comment "setting this ref is then the entire
 *      theme-switching API". This script tries, in priority order: `window.__MD3_CHECK__`
 *      bridge methods (`setTheme`, `setThemeName`, a settable `.theme` property - the bridge
 *      itself is real and named in `RowShell.vue`'s own comment, `window.__MD3_CHECK__
 *      .measureAll()`, even though this script does not depend on that specific method's return
 *      shape), then falls back to setting `location.hash` to the bare theme id. Confirmation
 *      does NOT depend on the app implementing anything extra: Vuetify's own `v-theme-provider`
 *      (which `harnessState.ts` says `App.vue` uses as its root) applies a real `.v-theme--
 *      <name>` class automatically - confirmed present throughout this exact codebase's own
 *      stylesheets (`grep -rl "v-theme--" design/packages/ui/src`) - so this script watches for
 *      that class rather than inventing a signal the app would have to remember to maintain.
 *
 * ## How this degrades gracefully
 *
 * None of the above is required for this script to run usefully; each missing piece narrows
 * what a run can report rather than crashing it:
 *   - No rows in the DOM at all -> zero captures, an honest empty report, not an error.
 *   - Theme switching never confirmed -> a single pass at whatever theme is already active
 *     (labelled from the real `.v-theme--*` class found, or `"unconfirmed"` if none is), and
 *     every theme after the first is skipped with that reason rather than silently repeating
 *     an identical capture under a different name.
 *   - A row with no `[data-measure]` match in one of its panes -> that side's measurement is
 *     `null` with a stated reason, not a fabricated number.
 *
 * ## The measurement algorithm
 *
 * Ported by hand from `design/packages/md3-check/src/renderer/lib/measure.ts`
 * (`measureComponent`/`diffMeasurements`), not reinvented. That file's own header explains why
 * this matters: "so `scripts/capture.mjs` ... can trust that what it reads back ... is the
 * exact same arithmetic the live UI displays - one measuring function, two callers" - and this
 * repository's own recorded lesson about a "second, hand-rolled measurement path" being exactly
 * the kind of drift that produces numbers nobody can trust applies here word for word. Porting
 * costs a real, stated risk: `scripts/` has no TypeScript toolchain to import that file
 * directly, so this copy is kept in sync **by hand**. If `measure.ts` changes, this port needs
 * updating too - grep this file for "ported from measure.ts" to find every place that matters,
 * and see `docs/md3-conformance.md` for how to check the two have not drifted.
 *
 * ## Usage
 *
 *   node scripts/md3-compare.mjs                          # full run, default app dir and output
 *   node scripts/md3-compare.mjs --list                    # print the fallback row list and exit
 *   node scripts/md3-compare.mjs --row button-filled --theme dark
 *   node scripts/md3-compare.mjs --out design/packages/md3-check/screenshots --keep-open
 *   node scripts/md3-compare.mjs --strict                  # exit 1 if any row/theme is skipped
 *
 * Flags:
 *   --app-dir <path>       Directory of the conformance app (default: design/packages/md3-check)
 *   --out <path>            Output directory for PNGs and report.json
 *                            (default: <app-dir>/screenshots - already git-ignored, see
 *                            design/.gitignore's bare `screenshots/` rule)
 *   --port <n>              Fixed remote-debugging port. Default 0: let Chromium pick a free
 *                            port and read it back from the profile's DevToolsActivePort file,
 *                            which also works for a fixed port so this is safe either way.
 *   --theme <id>             Repeatable. Overrides discovery/fallback themes.
 *   --row <id>                Repeatable. Restricts capture to these row ids only (still
 *                            discovered live - this filters the discovered set, it does not
 *                            invent rows that are not in the DOM).
 *   --settle-timeout <ms>    Max wait for the page (or a theme switch) to render and its row
 *                            list to stop changing (default 8000).
 *   --launch-timeout <ms>    Max wait for Electron to start and expose its CDP port
 *                            (default 45000 - generous because a first build can be slow, and a
 *                            slow launch is not this harness's failure to diagnose).
 *   --skip-build             Never attempt `npm run build` in --app-dir even if its built
 *                            renderer is missing.
 *   --force-build             Always run the build script before launching, even if a built
 *                            renderer already exists.
 *   --keep-open               Leave the Electron process running and skip profile cleanup, for
 *                            interactively inspecting a failure. Ctrl+C or close it by hand.
 *   --strict                  Exit 1 if any requested theme after the first was skipped, or if
 *                            zero rows were captured. Without it, the script exits 0 whenever it
 *                            completed and produced a report - an honest report of gaps is a
 *                            successful run of this harness, not a failed one; --strict is for
 *                            wiring this into a gate later, once the app side is far enough
 *                            along that a gap is a regression rather than expected incompleteness.
 *   --list                    Print the fallback theme/row list as JSON and exit without
 *                            launching Electron. The real row list is only known once the app is
 *                            running (see contract point 1) - this flag shows what this script
 *                            falls back to, not a promise of what the app actually has.
 *   -h, --help                 Print this usage block and exit 0.
 */

import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const require = createRequire(import.meta.url);

/* -------------------------------------------------------------------------------------------- */
/* Fallback manifest                                                                             */
/* -------------------------------------------------------------------------------------------- */

/**
 * Used only for `--list` and for the "known planned, not yet buildable" rows this script
 * cross-references in its report - never as a substitute for live discovery (contract point 1).
 * Transcribed by hand from `design/packages/md3-check/src/renderer/lib/rows.ts`'s real
 * `ROW_MANIFEST` as of this writing; that file is the source of truth and this copy can drift
 * from it the moment a row is added or its status changes - see the same file's own comment on
 * exactly this risk (`rows.test.ts` guards its OWN drift against `RowsGallery.vue`, which this
 * copy has no equivalent guard for, because it lives in a different repository tree entirely).
 */
export const FALLBACK_ROWS = [
    { id: "button-filled", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "button-outlined", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "button-text", vuetifyComponent: "v-btn", status: "implemented" },
    { id: "chip-assist", vuetifyComponent: "v-chip", status: "implemented" },
    { id: "card-elevated", vuetifyComponent: "v-card", status: "implemented" },
    { id: "text-field-outlined", vuetifyComponent: "v-text-field", status: "implemented" },
    { id: "switch", vuetifyComponent: "v-switch", status: "implemented" },
    { id: "checkbox", vuetifyComponent: "v-checkbox", status: "implemented" },
    { id: "radio", vuetifyComponent: "v-radio", status: "implemented" },
    { id: "list-item", vuetifyComponent: "v-list-item", status: "implemented" },
    { id: "progress-linear", vuetifyComponent: "v-progress-linear", status: "implemented" },
    { id: "progress-circular", vuetifyComponent: "v-progress-circular", status: "implemented" },
    { id: "divider", vuetifyComponent: "v-divider", status: "implemented" },
    { id: "icon", vuetifyComponent: "v-icon", status: "implemented" },
    { id: "alert", vuetifyComponent: "v-alert", status: "implemented" },
    { id: "tooltip", vuetifyComponent: "v-tooltip", status: "planned" },
    { id: "select", vuetifyComponent: "v-select", status: "planned" },
    { id: "menu", vuetifyComponent: "v-menu", status: "planned" },
    { id: "dialog", vuetifyComponent: "v-dialog", status: "planned" },
    { id: "slider", vuetifyComponent: "v-slider", status: "planned" },
    { id: "btn-toggle", vuetifyComponent: "v-btn-toggle", status: "planned" },
    { id: "textarea", vuetifyComponent: "v-textarea", status: "planned" },
];

/**
 * `harnessState.ts`'s `currentThemeName` ref defaults to `"dark"`. `light` and `contrast` are
 * the other two theme schemes `design/packages/ui/src/vuetify.ts` ships as part of the served,
 * framework-neutral application - see `docs/design-system.md`. Deliberately excludes `kid`: per
 * the scout report that scoped this harness, Kid Mode is a presentation-only mode layered on
 * top of the same components, not a second Material 3 theme with its own conformance claim.
 */
export const FALLBACK_THEMES = ["dark", "light", "contrast"];

/* -------------------------------------------------------------------------------------------- */
/* CLI parsing                                                                                   */
/* -------------------------------------------------------------------------------------------- */

function parseArgs(argv) {
    const args = {
        appDir: resolve(repoRoot, "design", "packages", "md3-check"),
        out: null,
        port: 0,
        themes: [],
        rows: [],
        settleTimeout: 8000,
        launchTimeout: 45000,
        skipBuild: false,
        forceBuild: false,
        keepOpen: false,
        strict: false,
        list: false,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        const next = () => {
            i += 1;
            if (i >= argv.length) throw new Error(`${flag} needs a value`);
            return argv[i];
        };
        switch (flag) {
            case "--app-dir":
                args.appDir = resolve(repoRoot, next());
                break;
            case "--out":
                args.out = resolve(repoRoot, next());
                break;
            case "--port":
                args.port = Number.parseInt(next(), 10);
                if (!Number.isFinite(args.port) || args.port < 0)
                    throw new Error("--port must be a non-negative integer");
                break;
            case "--theme":
                args.themes.push(next());
                break;
            case "--row":
                args.rows.push(next());
                break;
            case "--settle-timeout":
                args.settleTimeout = Number.parseInt(next(), 10);
                break;
            case "--launch-timeout":
                args.launchTimeout = Number.parseInt(next(), 10);
                break;
            case "--skip-build":
                args.skipBuild = true;
                break;
            case "--force-build":
                args.forceBuild = true;
                break;
            case "--keep-open":
                args.keepOpen = true;
                break;
            case "--strict":
                args.strict = true;
                break;
            case "--list":
                args.list = true;
                break;
            case "-h":
            case "--help":
                args.help = true;
                break;
            default:
                throw new Error(`unrecognised flag: ${flag}`);
        }
    }
    if (args.out === null) args.out = join(args.appDir, "screenshots");
    return args;
}

const USAGE = `usage: node scripts/md3-compare.mjs [options]

  --app-dir <path>        conformance app directory (default: design/packages/md3-check)
  --out <path>             PNG + report.json output directory (default: <app-dir>/screenshots)
  --port <n>               fixed CDP port (default: 0, OS-assigned)
  --theme <id>              repeatable, overrides discovery/fallback themes
  --row <id>                 repeatable, restricts capture to these discovered row ids
  --settle-timeout <ms>     per-theme render wait (default: 8000)
  --launch-timeout <ms>     Electron+CDP startup wait (default: 45000)
  --skip-build               never run the app's build script
  --force-build              always run the app's build script first
  --keep-open                 leave Electron running for interactive debugging
  --strict                    exit 1 on a skipped theme (after the first) or zero captures
  --list                      print the fallback row/theme list and exit, no launch
  -h, --help                   this text
`;

/* -------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                 */
/* -------------------------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
    process.stdout.write(`md3-compare: ${message}\n`);
}

function warn(message) {
    process.stderr.write(`md3-compare: WARNING ${message}\n`);
}

/** Best-effort, never fatal: the report is more useful with a commit, not required to have one. */
function currentCommit() {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
        return null;
    }
}

/**
 * Runs `npm run <script>` in `cwd`. Deliberately not `execFileSync("npm.cmd", ...)` directly:
 * confirmed against this exact host that it fails with `EINVAL` when the calling Node process
 * was itself launched from a Git-for-Windows Bash shell (reproduced with a two-line repro
 * outside this script entirely, so it is an environment interaction, not a bug in this file).
 * Routing through `cmd.exe /d /s /c` sidesteps it and is more predictable than
 * `execFileSync(..., { shell: true })`, which Node deprecates specifically because it
 * concatenates arguments into the shell command unescaped - `cmd.exe /c` here still needs the
 * inner command built as one string, so the risk is the same, but at least it does not carry
 * Node's own runtime deprecation warning about it. `npm` itself is used unwrapped everywhere
 * else (POSIX has no `.cmd`-launcher problem to work around).
 */
function runNpmScript(scriptName, { cwd, env }) {
    if (process.platform === "win32") {
        execFileSync("cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`], { cwd, stdio: "inherit", env });
    } else {
        execFileSync("npm", ["run", scriptName], { cwd, stdio: "inherit", env });
    }
}

/* -------------------------------------------------------------------------------------------- */
/* Electron binary + app entry resolution                                                        */
/* -------------------------------------------------------------------------------------------- */

function executableName() {
    if (process.platform === "win32") return "electron.exe";
    if (process.platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
    return "electron";
}

/**
 * Mirrors `design/scripts/ensure-electron-binary.mjs`'s own resolution order: the app being
 * driven first, then `design/packages/app` (every other package in this workspace resolves
 * `electron` from there), then `design/` and the repository root. Also proactively shells out to
 * that script against the first candidate that resolves at all, so a half-extracted binary
 * self-heals before this harness reports a confusing failure about a file that "is installed"
 * and missing.
 */
function resolveElectronBinary(appDir) {
    const candidates = [appDir, join(repoRoot, "design", "packages", "app"), join(repoRoot, "design"), repoRoot];
    let packageJsonPath;
    let resolvedFrom;
    for (const from of candidates) {
        try {
            packageJsonPath = require.resolve("electron/package.json", { paths: [from] });
            resolvedFrom = from;
            break;
        } catch {
            // try the next candidate
        }
    }
    if (packageJsonPath === undefined) {
        throw new Error(
            `the \`electron\` package could not be resolved from any of:\n` +
                candidates.map((c) => `  ${c}`).join("\n") +
                `\nRun the workspace install first (pnpm install in design/).`,
        );
    }

    const healer = join(repoRoot, "design", "scripts", "ensure-electron-binary.mjs");
    if (existsSync(healer)) {
        try {
            execFileSync(process.execPath, [healer, resolvedFrom], { stdio: "inherit" });
        } catch (error) {
            warn(
                `ensure-electron-binary.mjs reported a problem (${error instanceof Error ? error.message : String(error)}); continuing to try resolving the binary directly`,
            );
        }
    }

    const electronRoot = dirname(packageJsonPath);
    const exePath = join(electronRoot, "dist", executableName());
    if (!existsSync(exePath)) {
        throw new Error(
            `electron package resolved to ${electronRoot} but its binary is missing at ${exePath}. ` +
                `ensure-electron-binary.mjs could not recover it - see its own output above.`,
        );
    }
    return exePath;
}

/**
 * Resolves the app's launchable entry, building the renderer first when needed.
 *
 * Two things have to exist, confirmed against the real `design/packages/md3-check` source: the
 * `main` field's own file (`src/main/index.mjs`, checked in unbuilt - that file is deliberately
 * plain, un-bundled ESM, see its own header) and `dist/renderer/index.html`, which
 * `src/main/index.mjs`'s own `assertBuilt()` refuses to launch without. Checking only the first
 * is not enough - this script found that out the hard way against the real app: `main` existed
 * from the moment the package was created, long before the renderer did, and Electron happily
 * started and then reported the app's own `assertBuilt()` failure instead of this script's.
 */
async function resolveAppEntry(appDir, { skipBuild, forceBuild }) {
    if (!existsSync(appDir)) {
        throw new Error(
            `${appDir} does not exist yet. This harness drives the Material 3 conformance app ` +
                `built at design/packages/md3-check by a separate work item; see ` +
                `docs/md3-conformance.md for the exact interface it needs to expose. Pass ` +
                `--app-dir to point this script at a different location if it has moved.`,
        );
    }
    const packageJsonPath = join(appDir, "package.json");
    if (!existsSync(packageJsonPath)) {
        throw new Error(`${appDir} has no package.json; it is not a launchable Electron app.`);
    }
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const entryRelative = typeof pkg.main === "string" && pkg.main.length > 0 ? pkg.main : "index.js";
    const entryAbs = resolve(appDir, entryRelative);
    const builtRendererAbs = join(appDir, "dist", "renderer", "index.html");
    const hasBuildScript = typeof pkg.scripts?.build === "string" && pkg.scripts.build.length > 0;

    const isBuilt = () => existsSync(entryAbs) && existsSync(builtRendererAbs);
    const needsBuild = forceBuild || !isBuilt();
    if (needsBuild) {
        if (skipBuild) {
            if (!isBuilt()) {
                throw new Error(
                    `${entryAbs} and/or ${builtRendererAbs} do not exist and --skip-build was passed, ` +
                        `so nothing will be built. Run the app's own build first, or drop --skip-build.`,
                );
            }
            log(`--force-build requested but --skip-build overrides it; using the existing build`);
        } else if (!hasBuildScript) {
            throw new Error(
                `${builtRendererAbs} does not exist, and ${packageJsonPath} declares no "build" ` +
                    `script for this harness to run. Build the app manually first.`,
            );
        } else {
            log(`building the conformance app renderer (missing or --force-build set)...`);
            // Required by design/packages/md3-check/src/main/index.mjs's own documented
            // contract: capture mode must be baked in AT BUILD TIME (Vite inlines it into the
            // bundle), not merely set when Electron later launches - setting it only at launch
            // would leave the interactive theme/scale/row pickers in the built output and every
            // captured PNG would show this harness's own chrome contaminating the comparison.
            runNpmScript("build", { cwd: appDir, env: { ...process.env, WORLDLENS_MD3_CHECK_CAPTURE: "1" } });
            if (!isBuilt()) {
                throw new Error(
                    `ran "npm run build" in ${appDir} but ${entryAbs} and/or ${builtRendererAbs} still do ` +
                        `not exist afterwards. The build did not produce what this harness expects.`,
                );
            }
        }
    }
    return entryAbs;
}

/* -------------------------------------------------------------------------------------------- */
/* Launching Electron and finding its CDP port                                                   */
/* -------------------------------------------------------------------------------------------- */

/**
 * On Windows, `child.kill()` only requests a soft close and Electron GUI processes routinely
 * ignore it, leaving an orphaned window nobody asked for. `taskkill /T /F` actually terminates
 * the whole process tree; everywhere else a normal SIGKILL is enough.
 */
function killProcessTree(pid) {
    if (pid === undefined || pid === null) return;
    try {
        if (process.platform === "win32") {
            execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
        } else {
            process.kill(pid, "SIGKILL");
        }
    } catch {
        // Already gone, or never started - either way there is nothing left to clean up.
    }
}

/**
 * Chromium writes `<user-data-dir>/DevToolsActivePort` (port number on the first line, the
 * browser's own devtools path on the second) once its remote-debugging server is actually
 * listening - for a fixed port and for `--remote-debugging-port=0` alike. Polling for this file
 * is the same mechanism Puppeteer's and Playwright's own Chromium launchers use, and it avoids
 * ever guessing a fixed port that a second concurrent run on the same machine might collide on.
 */
async function waitForDevToolsPort(userDataDir, timeoutMs) {
    const portFile = join(userDataDir, "DevToolsActivePort");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (existsSync(portFile)) {
            const text = readFileSync(portFile, "utf8");
            const [firstLine] = text.split(/\r?\n/);
            const port = Number.parseInt(firstLine, 10);
            if (Number.isFinite(port) && port > 0) return port;
        }
        await sleep(200);
    }
    throw new Error(
        `Electron never wrote ${portFile} within ${timeoutMs}ms. It either failed to start, or ` +
            `started but crashed before its DevTools server bound a port - check the [app] output ` +
            `printed above for the reason.`,
    );
}

async function launchApp(entryAbs, appDir, { port, launchTimeout }) {
    const electronExe = resolveElectronBinary(appDir);
    const userDataDir = mkdtempSync(join(tmpdir(), "md3-compare-"));

    log(`launching ${electronExe} against ${entryAbs}`);
    // Flags proven against this exact codebase's own Electron capture harness
    // (design/packages/app/test/screenshots.spec.ts): `--no-sandbox` and `--disable-gpu` are
    // what makes launching reliable on a machine with no interactive GPU session available,
    // and `--force-prefers-reduced-motion` stops a capture from landing mid-transition.
    const child = spawn(
        electronExe,
        [
            entryAbs,
            "--no-sandbox",
            "--disable-gpu",
            "--force-prefers-reduced-motion",
            `--user-data-dir=${userDataDir}`,
            `--remote-debugging-port=${port}`,
        ],
        { cwd: appDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
    );
    child.stdout.on("data", (chunk) => process.stdout.write(`[app] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[app] ${chunk}`));
    let exitedEarly = null;
    child.on("exit", (code, signal) => {
        exitedEarly = { code, signal };
    });

    const resolvedPort = await Promise.race([
        waitForDevToolsPort(userDataDir, launchTimeout),
        (async () => {
            await sleep(launchTimeout);
            throw new Error(`timed out after ${launchTimeout}ms waiting for the app to start`);
        })(),
    ]).catch((error) => {
        if (exitedEarly !== null) {
            throw new Error(
                `Electron exited early (code ${exitedEarly.code}, signal ${exitedEarly.signal}) before ` +
                    `its DevTools port ever appeared. See the [app] output above for why.`,
            );
        }
        throw error;
    });

    return { child, userDataDir, port: resolvedPort };
}

/* -------------------------------------------------------------------------------------------- */
/* Minimal CDP client                                                                             */
/* -------------------------------------------------------------------------------------------- */

async function connectCdp(port) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(async (response) => {
        if (!response.ok) throw new Error(`CDP target discovery returned HTTP ${response.status}`);
        return response.json();
    });
    const pages = targets.filter(
        (candidate) =>
            candidate.type === "page" &&
            typeof candidate.url === "string" &&
            typeof candidate.webSocketDebuggerUrl === "string",
    );
    if (pages.length === 0) {
        throw new Error(
            `no CDP "page" target found among ${targets.length} target(s). ` +
                `The app may not have opened a BrowserWindow at all.`,
        );
    }
    const nonBlank = pages.filter((page) => page.url !== "about:blank");
    const target = nonBlank[0] ?? pages[0];
    if (pages.length > 1) {
        warn(
            `${pages.length} CDP page targets found; picked ${target.url}. If this is wrong, the ` +
                `app opened more than one window and this harness cannot yet tell which is the right one.`,
        );
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
        const timer = setTimeout(() => rejectOpen(new Error("timed out connecting to the CDP page")), 10_000);
        socket.addEventListener(
            "open",
            () => {
                clearTimeout(timer);
                resolveOpen();
            },
            { once: true },
        );
        socket.addEventListener(
            "error",
            (event) => {
                clearTimeout(timer);
                rejectOpen(event.error ?? new Error("the CDP WebSocket failed"));
            },
            { once: true },
        );
    });

    let sequence = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id === undefined) return;
        const waiter = pending.get(message.id);
        if (waiter === undefined) return;
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error === undefined) waiter.resolve(message.result);
        else waiter.reject(new Error(JSON.stringify(message.error)));
    });

    function send(method, params = {}) {
        sequence += 1;
        const id = sequence;
        const reply = new Promise((resolveSend, rejectSend) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                rejectSend(new Error(`CDP ${method} timed out`));
            }, 30_000);
            pending.set(id, { resolve: resolveSend, reject: rejectSend, timer });
        });
        socket.send(JSON.stringify({ id, method, params }));
        return reply;
    }

    // Deliberately NEVER `awaitPromise: true` - see the file header's "Why raw CDP" section for
    // the exact recorded hang this avoids. Every expression passed here must be synchronous.
    async function evaluateSync(expression) {
        const result = await send("Runtime.evaluate", {
            expression,
            awaitPromise: false,
            returnByValue: true,
        });
        if (result.exceptionDetails !== undefined) {
            const description = result.exceptionDetails.exception?.description;
            throw new Error(description ?? result.exceptionDetails.text ?? "Runtime evaluation failed");
        }
        return result.result.value;
    }

    /** Calls a self-contained function (its source is serialised, so no outer closures) with args. */
    function evaluateFn(fn, ...args) {
        return evaluateSync(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`);
    }

    return { socket, send, evaluateSync, evaluateFn, targetUrl: target.url };
}

/* -------------------------------------------------------------------------------------------- */
/* Browser-side probes (self-contained: no outer-scope references, CDP serialises .toString())   */
/* -------------------------------------------------------------------------------------------- */

/**
 * Sets the theme-selection signal this script's contract falls back to when no
 * `window.__MD3_CHECK__` setter is found - see the file header's point 5. Also tries every
 * plausible bridge entry point first, in priority order, since the real bridge's exact shape
 * was not yet decided when this was written. `bridge.setTheme()` is confirmed real (`App.vue`
 * installs exactly this method, returning a `Promise<void>`); the other names are kept as
 * fallbacks for a differently-shaped bridge without costing anything when the real one matches.
 * Called with `awaitPromise: false` (see the file header), so this never awaits `setTheme`'s own
 * promise - that is fine, because an async function body still runs to completion on Chromium's
 * microtask queue whether or not anything awaits the promise it returns, and this script's own
 * settle-poll loop (see `browserPollState`) waits out the result independently.
 */
function browserRequestTheme(themeId) {
    const bridge = window.__MD3_CHECK__;
    let bridgeCallUsed = null;
    if (bridge) {
        if (typeof bridge.setTheme === "function") {
            bridge.setTheme(themeId);
            bridgeCallUsed = "setTheme";
        } else if (typeof bridge.setThemeName === "function") {
            bridge.setThemeName(themeId);
            bridgeCallUsed = "setThemeName";
        } else if ("theme" in bridge) {
            bridge.theme = themeId;
            bridgeCallUsed = "theme=";
        } else if ("currentThemeName" in bridge) {
            bridge.currentThemeName = themeId;
            bridgeCallUsed = "currentThemeName=";
        }
    }
    location.hash = themeId;
    return { bridgePresent: !!bridge, bridgeCallUsed };
}

/**
 * `window.__MD3_CHECK__.listThemes()`, when the bridge exposes it: the real, currently-supported
 * theme id list, straight from `App.vue`'s own `themeNames` (which is what `setTheme` itself
 * validates every request against). Preferred over `FALLBACK_THEMES` whenever it is present -
 * see the file header's "surfaces enumerated from the running application" principle.
 */
function browserBridgeListThemes() {
    const bridge = window.__MD3_CHECK__;
    if (!bridge || typeof bridge.listThemes !== "function") return null;
    const themes = bridge.listThemes();
    return Array.isArray(themes) ? themes.filter((t) => typeof t === "string") : null;
}

/**
 * `window.__MD3_CHECK__.measureAll()`, when present: the authoritative measurement for every
 * currently-mounted row, produced by calling the exact same `measureComponent`/
 * `diffMeasurements` code path `RowShell.vue`'s own on-screen table reads - not this script's
 * hand-ported copy. Preferred over `browserMeasureRow`'s fallback measurement whenever a row
 * has an entry here with both sides non-null; see the file header's "measurement algorithm"
 * section for why a second, hand-rolled path is a real drift risk this script tries to avoid
 * whenever the real one is reachable.
 *
 * Wrapped in its own try/catch: this bridge is still under active development on the app side
 * (confirmed live - an early build of it threw `TypeError: u.getSnapshot is not a function`
 * from inside `measureAll()` itself), and a throw in there must never take down this whole run.
 * `main()` treats a caught failure exactly like an absent bridge and falls back to
 * `browserMeasureRow`'s own port for every row in that pass, which is the entire reason that
 * fallback exists rather than this script simply depending on the bridge outright.
 */
function browserBridgeMeasureAll() {
    const bridge = window.__MD3_CHECK__;
    if (!bridge || typeof bridge.measureAll !== "function") return { ok: true, data: null };
    try {
        return { ok: true, data: bridge.measureAll() };
    } catch (error) {
        return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * One poll of "what theme is confirmed live, and what rows are on screen right now". Called
 * repeatedly from Node with a short sleep between calls (never awaited inside the page) until
 * the requested theme is confirmed and the row list stops changing, or the settle timeout runs
 * out. Confirmation is Vuetify's own real `.v-theme--<name>` class (see the file header's point
 * 5), never a signal this script invented and the app would have to remember to maintain.
 *
 * Searched across the WHOLE document, not just `<html>`/`<body>`: confirmed against the real
 * `App.vue`, `<v-theme-provider :theme="currentThemeName" tag="div" class="md3check-app-root">`
 * is this app's actual root, so the class lands on that inner div, not on `<html>` the way this
 * script originally assumed from the shipped product's own (differently-built) stylesheets.
 */
function browserPollState(requestedThemeId) {
    const round = (n) => Math.round(n * 100) / 100;
    const rectOf = (el) => {
        const r = el.getBoundingClientRect();
        return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) };
    };
    const activeThemeClasses = Array.from(
        new Set(Array.from(document.querySelectorAll('[class*="v-theme--"]')).flatMap((el) => Array.from(el.classList))),
    )
        .filter((cls) => cls.indexOf("v-theme--") === 0)
        .map((cls) => cls.slice("v-theme--".length));

    const rowEls = Array.from(document.querySelectorAll("[data-md3-row]"));
    const rows = rowEls
        .map((el) => ({ id: el.getAttribute("data-md3-row"), rect: rectOf(el) }))
        .filter((row) => row.id !== null && row.rect.width > 0.5 && row.rect.height > 0.5);

    // How tall the CDP-emulated viewport needs to be to contain every row without clipping -
    // see `main()`'s own comment on why this app cannot be scrolled to reach a row instead.
    // `getBoundingClientRect()` returns each row's real layout position regardless of whether
    // it currently paints (confirmed: this reads the correct off-viewport `y` for a row well
    // past the fold even at the default small viewport), so this is accurate before the resize
    // that uses it ever happens.
    const maxRowBottom = rows.reduce((max, row) => Math.max(max, row.rect.y + row.rect.height), 0);

    return {
        themeConfirmed: activeThemeClasses.indexOf(requestedThemeId) !== -1,
        activeThemeClasses,
        rowIds: rows.map((r) => r.id).sort(),
        rows,
        maxRowBottom,
    };
}

/**
 * Measures one row: resolves its two panes, the `[data-measure]` target inside each (or reports
 * why it could not), and diffs them. This is a hand port of `measureComponent`/
 * `diffMeasurements` from design/packages/md3-check/src/renderer/lib/measure.ts - see the file
 * header's "The measurement algorithm" section for exactly why this is a deliberate port rather
 * than a fresh design, and the drift risk that comes with it. Every helper below (ported from
 * measure.ts) is prefixed with `mc` purely to keep this function's own internal names distinct
 * from whatever the page's own scripts define at the same scope.
 */
function browserMeasureRow(rowId) {
    const round = (n) => Math.round(n * 100) / 100;

    // --- ported from measure.ts: readCornerRadii, isTransparentColor, parseRgb -----------------
    function mcReadCornerRadii(style) {
        return [
            parseFloat(style.borderTopLeftRadius) || 0,
            parseFloat(style.borderTopRightRadius) || 0,
            parseFloat(style.borderBottomRightRadius) || 0,
            parseFloat(style.borderBottomLeftRadius) || 0,
        ];
    }
    const MC_CORNER_TOLERANCE_PX = 0.5;
    function mcIsTransparentColor(value) {
        if (value === "" || value === "transparent") return true;
        const match = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/.exec(value);
        if (match === null) return false;
        const alpha = match[1];
        return alpha !== undefined && parseFloat(alpha) < 0.001;
    }
    function mcParseRgb(value) {
        const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+)?\s*\)/.exec(value);
        if (match === null) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    // --- ported from measure.ts: resolveEffectiveBackground ------------------------------------
    function mcResolveEffectiveBackground(el) {
        let node = el;
        let hops = 0;
        const MAX_HOPS = 12;
        while (node !== null && hops <= MAX_HOPS) {
            const bg = getComputedStyle(node).backgroundColor;
            if (!mcIsTransparentColor(bg)) return { color: bg, source: hops === 0 ? "self" : "ancestor" };
            node = node.parentElement;
            hops += 1;
        }
        return { color: "rgba(0, 0, 0, 0)", source: "none" };
    }
    // --- ported from measure.ts: srgbChannelToLinear, relativeLuminance, contrastRatio ---------
    function mcSrgbChannelToLinear(c) {
        const normalized = c / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    }
    function mcRelativeLuminance(rgb) {
        const [r, g, b] = rgb;
        return 0.2126 * mcSrgbChannelToLinear(r) + 0.7152 * mcSrgbChannelToLinear(g) + 0.0722 * mcSrgbChannelToLinear(b);
    }
    function mcContrastRatio(a, b) {
        const la = mcRelativeLuminance(a);
        const lb = mcRelativeLuminance(b);
        const lighter = Math.max(la, lb);
        const darker = Math.min(la, lb);
        return (lighter + 0.05) / (darker + 0.05);
    }
    // --- ported from measure.ts: measureComponent -----------------------------------------------
    function mcMeasureComponent(el) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const radii = mcReadCornerRadii(style);
        const declaredCornerRadiusPx = Math.max(...radii);
        const cornerRadiusUniform = radii.every((r) => Math.abs(r - radii[0]) <= MC_CORNER_TOLERANCE_PX);
        const pillLimit = Math.min(rect.width, rect.height) / 2;
        const clampedRadii = radii.map((r) => Math.min(r, pillLimit));
        const cornerRadiusPx = Math.max(...clampedRadii);
        const isPill = declaredCornerRadiusPx >= pillLimit - MC_CORNER_TOLERANCE_PX && pillLimit > 0;
        const fontSizePx = parseFloat(style.fontSize) || 0;
        const lineHeightPx = style.lineHeight === "normal" ? Math.round(fontSizePx * 1.2) : parseFloat(style.lineHeight) || 0;
        const letterSpacingPx = style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
        const background = mcResolveEffectiveBackground(el);
        const textRgb = mcParseRgb(style.color);
        const bgRgb = background.source === "none" ? null : mcParseRgb(background.color);
        const contrast = textRgb !== null && bgRgb !== null ? mcContrastRatio(textRgb, bgRgb) : null;
        return {
            heightPx: round(rect.height),
            widthPx: round(rect.width),
            cornerRadiusPx: round(cornerRadiusPx),
            declaredCornerRadiusPx: round(declaredCornerRadiusPx),
            cornerRadiusUniform,
            isPill,
            fontFamily: style.fontFamily,
            fontSizePx: round(fontSizePx),
            fontWeight: style.fontWeight,
            lineHeightPx: round(lineHeightPx),
            letterSpacingPx: round(letterSpacingPx),
            textColor: style.color,
            backgroundColor: background.color,
            backgroundSource: background.source,
            contrastRatio: contrast === null ? null : round(contrast),
            minVisibleTargetPx: round(Math.min(rect.width, rect.height)),
        };
    }
    // --- ported from measure.ts: diffMeasurements -----------------------------------------------
    const MC_NUMERIC_TOLERANCE_PX = 0.5;
    const MC_CONTRAST_TOLERANCE = 0.05;
    function mcNumericDiff(a, b, tolerance) {
        return { reference: a, worldlens: b, deltaNumeric: round(b - a), differs: Math.abs(b - a) > tolerance };
    }
    function mcStringDiff(a, b) {
        return { reference: a, worldlens: b, deltaNumeric: null, differs: a !== b };
    }
    function mcDiffMeasurements(reference, worldlens) {
        return {
            cornerRadiusPx: mcNumericDiff(reference.cornerRadiusPx, worldlens.cornerRadiusPx, MC_NUMERIC_TOLERANCE_PX),
            heightPx: mcNumericDiff(reference.heightPx, worldlens.heightPx, MC_NUMERIC_TOLERANCE_PX),
            widthPx: mcNumericDiff(reference.widthPx, worldlens.widthPx, MC_NUMERIC_TOLERANCE_PX),
            minVisibleTargetPx: mcNumericDiff(reference.minVisibleTargetPx, worldlens.minVisibleTargetPx, MC_NUMERIC_TOLERANCE_PX),
            fontFamily: mcStringDiff(reference.fontFamily, worldlens.fontFamily),
            fontSizePx: mcNumericDiff(reference.fontSizePx, worldlens.fontSizePx, MC_NUMERIC_TOLERANCE_PX),
            fontWeight: mcNumericDiff(Number(reference.fontWeight) || 0, Number(worldlens.fontWeight) || 0, 0),
            lineHeightPx: mcNumericDiff(reference.lineHeightPx, worldlens.lineHeightPx, MC_NUMERIC_TOLERANCE_PX),
            letterSpacingPx: mcNumericDiff(reference.letterSpacingPx, worldlens.letterSpacingPx, MC_NUMERIC_TOLERANCE_PX),
            contrastRatio: mcNumericDiff(
                reference.contrastRatio ?? Number.NaN,
                worldlens.contrastRatio ?? Number.NaN,
                MC_CONTRAST_TOLERANCE,
            ),
        };
    }

    // --- this script's own part: resolving the row's real DOM structure ------------------------
    const rowEl = document.querySelector('[data-md3-row="' + rowId + '"]');
    if (!rowEl) return { rowId, found: false };

    const findPane = (side) => rowEl.querySelector(".md3check-pane--" + side);
    const referencePane = findPane("reference");
    const worldlensPane = findPane("worldlens");

    /**
     * `RowShell.vue`'s `worldlensSelector` prop (default `"[data-measure]"`) is set per-row in
     * `RowsGallery.vue` for the three rows whose Vuetify markup does not carry `data-measure` at
     * all, because the element actually worth measuring is a specific descendant, not the whole
     * control: a switch's visible track, not its much larger invisible hit-target wrapper
     * (`.v-switch__track`), and a checkbox/radio's SVG glyph, not its wrapper
     * (`.v-selection-control__input .v-icon`) - both confirmed directly against
     * `RowsGallery.vue`'s real markup and citations, not guessed. No row overrides
     * `referenceSelector`; every reference pane carries a plain `data-measure`. If a future row
     * adds a new override this table does not know about, that row's `[data-measure]` probe
     * below still runs first and only reports a gap - it never fabricates a wrong measurement.
     */
    const KNOWN_WORLDLENS_SELECTOR_OVERRIDES = {
        switch: ".v-switch__track",
        checkbox: ".v-selection-control__input .v-icon",
        radio: ".v-selection-control__input .v-icon",
    };

    const findMeasureTarget = (pane, side) => {
        if (!pane) return { element: null, reason: "no .md3check-pane--<side> element found in this row" };
        const matches = pane.querySelectorAll("[data-measure]");
        if (matches.length === 1) return { element: matches[0], reason: null };
        if (matches.length > 1) {
            return {
                element: null,
                reason: `${matches.length} [data-measure] elements in this pane; RowShell.vue itself would refuse this as ambiguous`,
            };
        }
        const override = side === "worldlens" ? KNOWN_WORLDLENS_SELECTOR_OVERRIDES[rowId] : undefined;
        if (override !== undefined) {
            const overridden = pane.querySelector(override);
            if (overridden !== null) return { element: overridden, reason: null };
            return {
                element: null,
                reason: `no [data-measure] element, and this harness's known override selector "${override}" for row "${rowId}" matched nothing either - RowsGallery.vue's markup may have changed`,
            };
        }
        return {
            element: null,
            reason:
                "no [data-measure] element in this pane, and this harness has no known selector override for " +
                `row "${rowId}" - RowsGallery.vue likely sets a referenceSelector/worldlensSelector this ` +
                "external harness does not (yet) know; see RowShell.vue's own doc comment",
        };
    };

    const referenceTarget = findMeasureTarget(referencePane, "reference");
    const worldlensTarget = findMeasureTarget(worldlensPane, "worldlens");

    const panesEl = rowEl.querySelector(".md3check-row__panes");
    const clipSource = panesEl ?? rowEl;
    // No scrolling here, on purpose - confirmed directly against this exact app that it has
    // none to do: `document.documentElement.scrollHeight` reports exactly `window.innerHeight`
    // regardless of how much content `RowsGallery.vue` actually stacks (its whole-page layout
    // sizes itself off the viewport with `overflow: hidden` rather than letting the document
    // scroll), so a row past the first is genuinely unreachable by `scrollIntoView()` - it is a
    // no-op there, confirmed by reading the row's rect before and after calling it and finding
    // them identical. `main()` instead grows the CDP-emulated viewport itself
    // (`Emulation.setDeviceMetricsOverride`) to be tall enough for the whole gallery before this
    // function is ever called - see its own comment for how the required height is measured and
    // why growing the viewport does not shift any row's position (confirmed: a row's rect was
    // read identical before and after that resize too).
    const clipRect = clipSource.getBoundingClientRect();

    const result = {
        rowId,
        found: true,
        clip: {
            x: round(clipRect.x),
            y: round(clipRect.y),
            width: round(clipRect.width),
            height: round(clipRect.height),
            source: panesEl ? "panes" : "row",
        },
        reference: referenceTarget.element ? mcMeasureComponent(referenceTarget.element) : null,
        referenceUnmeasuredReason: referenceTarget.reason,
        worldlens: worldlensTarget.element ? mcMeasureComponent(worldlensTarget.element) : null,
        worldlensUnmeasuredReason: worldlensTarget.reason,
        diff: null,
    };
    if (result.reference !== null && result.worldlens !== null) {
        result.diff = mcDiffMeasurements(result.reference, result.worldlens);
    }
    return result;
}

/* -------------------------------------------------------------------------------------------- */
/* Main                                                                                           */
/* -------------------------------------------------------------------------------------------- */

async function main(argv) {
    const args = parseArgs(argv);
    if (args.help) {
        process.stdout.write(USAGE);
        return;
    }

    if (args.list) {
        process.stdout.write(
            `${JSON.stringify({ origin: "fallback", themes: FALLBACK_THEMES, rows: FALLBACK_ROWS }, null, 2)}\n`,
        );
        return;
    }

    const entryAbs = await resolveAppEntry(args.appDir, args);
    const launched = await launchApp(entryAbs, args.appDir, args);
    let cdp;
    try {
        cdp = await connectCdp(launched.port);
        log(`connected to CDP at 127.0.0.1:${launched.port} (page: ${cdp.targetUrl})`);
        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");
        // Starting size only, for the settle-poll loop below (which needs no particular height -
        // row discovery reads real layout geometry regardless of what currently paints; see
        // `browserPollState`'s own comment). Each theme pass resizes this taller, to fit that
        // pass's actual total content height, right before it captures anything - see the loop
        // below for why a fixed height here would silently clip most of the gallery.
        await cdp.send("Emulation.setDeviceMetricsOverride", {
            width: 1920,
            height: 1400,
            deviceScaleFactor: 1,
            mobile: false,
        });
    } catch (error) {
        if (!args.keepOpen) {
            killProcessTree(launched.child.pid);
            safeRmDir(launched.userDataDir);
        }
        throw error;
    }

    await mkdir(args.out, { recursive: true });

    let themeOrigin = "fallback";
    let themes = FALLBACK_THEMES;
    if (args.themes.length === 0) {
        const bridgeThemes = await cdp.evaluateFn(browserBridgeListThemes);
        if (bridgeThemes !== null && bridgeThemes.length > 0) {
            themes = bridgeThemes;
            themeOrigin = "bridge";
            log(`discovered ${bridgeThemes.length} theme(s) from window.__MD3_CHECK__.listThemes(): ${bridgeThemes.join(", ")}`);
        } else {
            warn(
                "window.__MD3_CHECK__.listThemes() is unavailable; falling back to the built-in " +
                    `theme list (${FALLBACK_THEMES.join(", ")}). Coverage may not match what the app actually supports.`,
            );
        }
    } else {
        themeOrigin = "cli";
    }

    const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: { appDir: args.appDir, commit: currentCommit() },
        requestedThemes: args.themes.length > 0 ? args.themes : themes,
        themeOrigin,
        requestedRowFilter: args.rows.length > 0 ? args.rows : null,
        themePasses: [],
    };

    try {
        let themeSwitchingConfirmedOnce = false;
        for (const [themeIndex, themeId] of report.requestedThemes.entries()) {
            log(`requesting theme "${themeId}"...`);
            const themeRequest = await cdp.evaluateFn(browserRequestTheme, themeId);

            const deadline = Date.now() + args.settleTimeout;
            let lastState = null;
            let previousRowIds = null;
            let stable = false;
            let confirmed = false;
            while (Date.now() < deadline) {
                const state = await cdp.evaluateFn(browserPollState, themeId);
                lastState = state;
                confirmed = state.themeConfirmed;
                const sameAsLast = previousRowIds !== null && JSON.stringify(previousRowIds) === JSON.stringify(state.rowIds);
                if (confirmed && sameAsLast) {
                    stable = true;
                    break;
                }
                previousRowIds = state.rowIds;
                await sleep(150);
            }

            if (confirmed) themeSwitchingConfirmedOnce = true;

            if (!confirmed && themeIndex > 0 && themeSwitchingConfirmedOnce === false) {
                // Theme switching has never once worked in this run (not even for the first
                // theme) - capturing this theme too would just be an identical duplicate of the
                // first pass under a different label. Record that honestly instead.
                report.themePasses.push({
                    themeId,
                    themeRequest,
                    confirmed: false,
                    status: "skipped",
                    reason:
                        "theme switching was never confirmed for any requested theme in this run " +
                        `(no .v-theme--${themeId} class ever appeared); skipped to avoid capturing an ` +
                        "identical duplicate of the first pass under a different label",
                    activeThemeClasses: lastState?.activeThemeClasses ?? [],
                    rows: [],
                });
                warn(`theme "${themeId}": skipped - theme switching unconfirmed for the whole run so far`);
                continue;
            }
            if (!confirmed && themeIndex > 0) {
                report.themePasses.push({
                    themeId,
                    themeRequest,
                    confirmed: false,
                    status: "skipped",
                    reason: `theme switching worked for an earlier theme but "${themeId}" itself was never confirmed`,
                    activeThemeClasses: lastState?.activeThemeClasses ?? [],
                    rows: [],
                });
                warn(`theme "${themeId}": skipped - not confirmed`);
                continue;
            }
            if (!confirmed) {
                warn(
                    `theme "${themeId}": never confirmed via a .v-theme--${themeId} class after ${args.settleTimeout}ms; ` +
                        `proceeding anyway with whatever is actually live (${(lastState?.activeThemeClasses ?? []).join(", ") || "no .v-theme--* class found at all"})`,
                );
            } else if (!stable) {
                warn(`theme "${themeId}": confirmed but the row list never stabilised within ${args.settleTimeout}ms; capturing anyway`);
            }

            // Confirmed directly against this app: it has no document-level scrolling at all
            // (`document.documentElement.scrollHeight` reports exactly `window.innerHeight`
            // regardless of how tall `RowsGallery.vue`'s actual content is), so a row past the
            // first is otherwise unreachable to capture no matter how it is scrolled to. Growing
            // the emulated viewport itself, rather than scrolling within it, is what actually
            // works - confirmed a row's `getBoundingClientRect()` position is unchanged by this
            // resize, so every rect already read into `lastState` stays valid afterwards. Redone
            // every theme pass (not once for the whole run) because a theme's own content - a
            // longer citation, a wrapped label - could genuinely change the total height.
            const requiredHeight = Math.max(1400, Math.ceil((lastState?.maxRowBottom ?? 0) + 100));
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width: 1920,
                height: requiredHeight,
                deviceScaleFactor: 1,
                mobile: false,
            });

            const discoveredRowIds = lastState?.rowIds ?? [];
            const rowIds =
                args.rows.length > 0 ? discoveredRowIds.filter((id) => args.rows.includes(id)) : discoveredRowIds;

            const themePass = {
                themeId,
                themeRequest,
                confirmed,
                status: "captured",
                reason: null,
                activeThemeClasses: lastState?.activeThemeClasses ?? [],
                rows: [],
            };

            // A small grace margin beyond the settle loop's own 150ms polling interval: a
            // `setTheme()` call this script never awaits (see `browserRequestTheme`'s header)
            // remeasures every row through `nextTick()` + `requestAnimationFrame()`, and this
            // script's own settle confirmation (the `.v-theme--<id>` class) can in principle land
            // in the same reactive flush slightly before that chain finishes. Cheap insurance
            // against reading `window.__MD3_CHECK__.measureAll()`'s cached snapshot one frame too
            // early - see that function's own header for why its data is preferred at all.
            await sleep(100);
            const bridgeResult = await cdp.evaluateFn(browserBridgeMeasureAll);
            if (!bridgeResult.ok) {
                warn(`window.__MD3_CHECK__.measureAll() threw: ${bridgeResult.error}; falling back to this harness's own port for every row in this theme pass`);
            }
            const bridgeSnapshots = bridgeResult.data;

            for (const rowId of rowIds) {
                const measurement = await cdp.evaluateFn(browserMeasureRow, rowId);
                if (!measurement.found) {
                    themePass.rows.push({ rowId, status: "skipped", reason: "row disappeared between discovery and measurement" });
                    continue;
                }
                const bridgeSnapshot = bridgeSnapshots?.[rowId];
                // Checking for `!== null` alone is NOT enough - confirmed directly against a
                // real (still-evolving) build of the app: `measureAll()` can return, per row,
                // `{ reference: {}, worldlens: {}, diff: {} }` - present, non-null, and
                // completely empty, apparently a Vue-reactivity/CDP `returnByValue` serialisation
                // gap on the app's own side rather than anything this script controls. An empty
                // object would otherwise read as "both sides measured, zero fields differ",
                // which is the single most dangerous wrong answer this harness could give -
                // exactly the "flatters the app" failure the whole file exists to refuse. A
                // second check for one real numeric field closes it without depending on every
                // field being present.
                const hasRealMeasurement = (value) => value !== null && typeof value === "object" && typeof value.heightPx === "number";
                const bridgeUsable =
                    bridgeSnapshot !== undefined &&
                    hasRealMeasurement(bridgeSnapshot.reference) &&
                    hasRealMeasurement(bridgeSnapshot.worldlens);
                const measurementSource = bridgeUsable ? "bridge" : "harness-port";
                const reference = bridgeUsable ? bridgeSnapshot.reference : measurement.reference;
                const worldlens = bridgeUsable ? bridgeSnapshot.worldlens : measurement.worldlens;
                const diff = bridgeUsable ? bridgeSnapshot.diff : measurement.diff;

                const screenshot = await cdp.send("Page.captureScreenshot", {
                    format: "png",
                    clip: {
                        x: Math.max(0, measurement.clip.x - 12),
                        y: Math.max(0, measurement.clip.y - 12),
                        width: measurement.clip.width + 24,
                        height: measurement.clip.height + 24,
                        scale: 1,
                    },
                    fromSurface: true,
                    captureBeyondViewport: false,
                });
                const imageName = `${rowId}--${themeId}.png`;
                await writeFile(join(args.out, imageName), Buffer.from(screenshot.data, "base64"));
                themePass.rows.push({
                    rowId,
                    status: "captured",
                    reason: null,
                    image: imageName,
                    clipSource: measurement.clip.source,
                    measurementSource,
                    reference,
                    referenceUnmeasuredReason: bridgeUsable ? null : measurement.referenceUnmeasuredReason,
                    worldlens,
                    worldlensUnmeasuredReason: bridgeUsable ? null : measurement.worldlensUnmeasuredReason,
                    diff,
                });
            }
            if (bridgeSnapshots !== null && rowIds.length > 0) {
                const bridgeUsedCount = themePass.rows.filter((r) => r.measurementSource === "bridge").length;
                if (bridgeUsedCount === 0) {
                    warn(
                        `theme "${themeId}": window.__MD3_CHECK__.measureAll() returned data, but none of it looked ` +
                            "usable for any row (present but missing a real numeric heightPx - see the " +
                            "bridgeUsable check's own comment); every row in this pass fell back to this harness's own port",
                    );
                }
            }
            report.themePasses.push(themePass);
        }
    } finally {
        cdp.socket.close();
        if (!args.keepOpen) {
            killProcessTree(launched.child.pid);
            safeRmDir(launched.userDataDir);
        } else {
            log(`--keep-open: leaving Electron running (pid ${launched.child.pid}) and its profile at ${launched.userDataDir}`);
        }
    }

    const capturedRows = report.themePasses.flatMap((pass) => pass.rows.filter((r) => r.status === "captured"));
    const rowsWithBothSidesMeasured = capturedRows.filter((r) => r.diff !== null);
    const rowsWithDifferences = rowsWithBothSidesMeasured.filter((r) =>
        Object.values(r.diff).some((field) => field.differs),
    );
    const skippedThemes = report.themePasses.filter((p) => p.status === "skipped");
    report.summary = {
        themePassesRequested: report.requestedThemes.length,
        themePassesCaptured: report.themePasses.length - skippedThemes.length,
        themePassesSkipped: skippedThemes.length,
        rowsCaptured: capturedRows.length,
        rowsWithBothSidesMeasured: rowsWithBothSidesMeasured.length,
        rowsWithAtLeastOneDifference: rowsWithDifferences.length,
    };

    await writeFile(join(args.out, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

    log(
        `${report.summary.themePassesCaptured}/${report.summary.themePassesRequested} theme pass(es), ` +
            `${report.summary.rowsCaptured} row capture(s), ${report.summary.rowsWithBothSidesMeasured} fully ` +
            `measured, ${report.summary.rowsWithAtLeastOneDifference} with at least one difference.`,
    );
    log(`report written to ${join(args.out, "report.json")}`);

    if (args.strict && (skippedThemes.length > 0 || capturedRows.length === 0)) {
        process.exitCode = 1;
    }
}

function safeRmDir(dir) {
    // Best-effort: a GUI process just killed can briefly hold a file lock on Windows, and a
    // leftover temp profile is a nuisance, not a correctness problem, so this never throws.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            rmSync(dir, { recursive: true, force: true });
            return;
        } catch {
            // retry
        }
    }
}

main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`md3-compare: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
});
