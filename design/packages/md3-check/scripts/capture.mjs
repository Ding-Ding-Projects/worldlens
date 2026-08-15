#!/usr/bin/env node
/**
 * The capture mode: walks every implemented row, in every theme this application really
 * ships, and writes one side-by-side PNG per row plus one machine-readable JSON of every
 * measured value. Run via `pnpm --filter @worldlens/md3-check run capture` (which builds the
 * renderer first - see `package.json`'s `capture` script).
 *
 * ## Why this is a plain script, not a Playwright test file
 *
 * `packages/app/test/screenshots.spec.ts` is the established pattern this script follows
 * closely (same `_electron` launch shape, same `--force-prefers-reduced-motion` flag, same
 * `#app` mount wait) - but that file is a `playwright test` SUITE: many `test()` blocks sharing
 * one Electron instance across a whole file, with retries, workers and a ledger built
 * specifically to survive a worker being killed and restarted mid-run (see `captureLedger.ts`'s
 * own header for exactly why). This script has none of that shape: one process, start to
 * finish, one Electron instance, one JSON file written once at the end. A `playwright test`
 * suite for a single linear walk would add all of that machinery's complexity for none of its
 * benefit, so this is what it looks like without it: a script that imports `_electron` and
 * calls it directly.
 *
 * ## Determinism
 *
 * Same input (the same commit's rows, the same rendered theme), same output:
 *   - `--force-prefers-reduced-motion` removes every CSS transition/animation before a single
 *     frame is captured (this repository's `global.scss` honours the media query itself; see
 *     `screenshots.spec.ts`'s own comment on this exact flag for why waiting instead does not
 *     work as well).
 *   - Every progress indicator row is rendered at a fixed, non-animating value (see
 *     `RowsGallery.vue`'s progress rows), never `indeterminate`.
 *   - Each screenshot passes `animations: "disabled"` and `caret: "hide"` to Playwright,
 *     belt-and-braces against the flag above.
 *   - The JSON is written with sorted object keys and a stable 2-space format, and carries no
 *     timestamp field at all - "no timestamps baked into the image" extended to the sidecar
 *     data too, so a byte-for-byte diff between two runs of the same commit is meaningful.
 */
import { _electron as electron } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const builtIndexHtml = join(packageRoot, "dist", "renderer", "index.html");
const outputDir = join(packageRoot, "capture-output");

function assertBuilt() {
    if (existsSync(builtIndexHtml)) return;
    throw new Error(
        `No built renderer at ${builtIndexHtml}. The "capture" npm script runs "vite build" ` +
            "first automatically; if you are running this file directly, build first with " +
            "`pnpm --filter @worldlens/md3-check run build`.",
    );
}

/** Recursively sorts object keys so the written JSON is byte-identical across runs of the same input. */
function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value !== null && typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortKeysDeep(value[key]);
        }
        return sorted;
    }
    return value;
}

async function main() {
    assertBuilt();
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    // A throwaway profile directory, matching packages/app/test/screenshots.spec.ts's own
    // reasoning: a genuine first-run profile rather than whatever the machine running this
    // script happens to have lying around, and never anything committed or reused.
    const userDataDir = await mkdtemp(join(tmpdir(), "md3-check-capture-"));

    console.log(`[capture] launching from ${packageRoot}`);
    const app = await electron.launch({
        args: [
            packageRoot,
            "--no-sandbox",
            "--disable-gpu",
            "--force-prefers-reduced-motion",
            `--user-data-dir=${userDataDir}`,
        ],
    });

    app.process().stdout?.on("data", (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on("data", (d) => process.stderr.write(`[main] ${d}`));

    let exitCode = 0;
    try {
        const page = await app.firstWindow();
        page.on("pageerror", (err) => console.error(`[renderer:pageerror] ${err.message}`));
        page.on("console", (msg) => {
            if (msg.type() === "error") console.error(`[renderer:console] ${msg.text()}`);
        });

        await page.waitForLoadState("domcontentloaded");
        await page.waitForSelector("#app", { timeout: 30_000 });
        await page.waitForFunction(() => typeof window.__MD3_CHECK__ !== "undefined", {
            timeout: 30_000,
        });
        await page.waitForSelector("[data-md3-row]", { timeout: 30_000 });
        // Force the scale control back to its default before capturing: a developer running
        // `pnpm start` and leaving the window at a non-default scale has no effect here, since
        // this script launches its own fresh Electron instance, but pinning it explicitly
        // documents that the capture is defined to run at 100% rather than "whatever the app
        // happened to be at".
        await page.evaluate(() => window.__MD3_CHECK__.setScale(100));

        const themes = await page.evaluate(() => window.__MD3_CHECK__.listThemes());
        const plannedRows = await page.evaluate(() => window.__MD3_CHECK__.listPlannedRows());
        console.log(`[capture] themes: ${themes.join(", ")}`);

        const measurements = { schemaVersion: 1, themes: {}, plannedRows };

        for (const theme of themes) {
            console.log(`[capture] theme: ${theme}`);
            await page.evaluate((name) => window.__MD3_CHECK__.setTheme(name), theme);
            // The bridge's own `setTheme` already awaits `nextTick()` plus a fixed settle delay
            // for Vuetify's own background-colour transition before this call resolves at all -
            // see `App.vue`'s `remeasureAfterVisualChange` for the measured evidence behind that
            // delay. This is a SECOND, smaller margin on top of it for a loaded machine, not a
            // substitute for it.
            await page.waitForTimeout(50);

            const rows = await page.evaluate(() => window.__MD3_CHECK__.listRows());
            const themeDir = join(outputDir, theme);
            await mkdir(themeDir, { recursive: true });

            for (const row of rows) {
                const locator = page.locator(`[data-md3-row="${row.id}"]`);
                await locator.scrollIntoViewIfNeeded();
                const filePath = join(themeDir, `${row.id}.png`);
                await locator.screenshot({ path: filePath, animations: "disabled", caret: "hide" });
                console.log(`[capture]   ${theme}/${row.id}.png`);
            }

            const snapshot = await page.evaluate(() => window.__MD3_CHECK__.measureAll());
            measurements.themes[theme] = { rowCount: rows.length, rows: snapshot };
        }

        const jsonPath = join(outputDir, "measurements.json");
        await writeFile(jsonPath, `${JSON.stringify(sortKeysDeep(measurements), null, 2)}\n`, "utf8");
        console.log(`[capture] wrote ${jsonPath}`);
        console.log(
            `[capture] done: ${themes.length} theme(s), ${Object.keys(measurements.themes[themes[0]]?.rows ?? {}).length} row(s) each, ${plannedRows.length} skipped (see plannedRows in the JSON) - output in ${outputDir}`,
        );
    } catch (err) {
        console.error("[capture] failed:", err);
        exitCode = 1;
    } finally {
        await app.close();
        await rm(userDataDir, { recursive: true, force: true });
    }

    process.exitCode = exitCode;
}

await main();
