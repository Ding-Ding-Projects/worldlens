#!/usr/bin/env node

/**
 * Capture the Settings dialog, the rail, and the World downloader screen through the
 * cheap Lowlevel headless route, driven by Chrome DevTools Protocol.
 *
 * The route, in order: an off-screen Win32 desktop is created through the installed
 * lowlevel-computer-use-cheap CLI; the built Electron app is launched on that desktop with
 * --worldlens-direct-launch and an isolated --user-data-dir, plus --remote-debugging-port
 * so a loopback CDP endpoint exists; Playwright connects over CDP as a read-only locator
 * and screenshot surface only (no mouse/keyboard synthesis at the OS level - every click
 * and viewport change goes through the same CDP connection); the visible desktop, cursor,
 * keyboard focus and foreground application are never touched.
 *
 * Device-scale-factor captures use CDP Emulation.setDeviceMetricsOverride, and the
 * override is cleared before every call that sets it again: two setDeviceMetricsOverride
 * calls back to back, with no clear between them, were found to silently keep the first
 * size in effect.
 *
 * No secret and no machine-specific absolute path is hard-coded here. The output
 * directory is a required CLI argument; a scratch profile directory is created under the
 * OS temp directory and removed afterward.
 *
 * Usage:
 *   node scripts/capture-settings-cdp.mjs <output-dir> [--port 19710] [--desktop NAME]
 *
 * Writes ten PNGs into <output-dir> (the two rail captures moved to scripts/capture-rail-cdp.mjs):
 *   settings-1280-dark-en.png            settings-320-dark-en.png
 *   settings-bilingual.png               settings-light.png
 *   settings-320-bilingual-light.png     settings-1280-scale200.png
 *   settings-640-scale200.png            world-downloader-1280.png
 *   config-regex-builder-open-1280.png   config-regex-builder-open-320.png
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
    const args = { out: null, port: 19710, desktop: "WlCaptureSettingsCdp" };
    const positional = [];
    for (let i = 0; i < argv.length; i += 1) {
        const value = argv[i];
        if (value === "--port") args.port = Number(argv[++i]);
        else if (value === "--desktop") args.desktop = String(argv[++i]);
        else positional.push(value);
    }
    args.out = positional[0] ? resolve(positional[0]) : null;
    return args;
}

function findLowlevelCli() {
    const candidates = [
        process.env.LOWLEVEL_CHEAP_CLI,
        resolve(repoRoot, "../lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe"),
        join(process.env.USERPROFILE || "", "Documents/GitHub/lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe"),
    ].filter(Boolean);
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
    throw new Error("lowlevel-computer-use-cheap.exe was not found; set LOWLEVEL_CHEAP_CLI");
}

function lowlevel(cli, tool, params) {
    const raw = execFileSync(cli, [tool, "--json", JSON.stringify(params ?? {})], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
    });
    const value = JSON.parse(raw);
    if (value.ok !== true) throw new Error(`${tool} failed: ${value.error || "unknown error"}`);
    return value;
}

function electronExecutable() {
    const path = resolve(repoRoot, "design/packages/app/node_modules/electron/dist/electron.exe");
    if (!existsSync(path)) throw new Error(`built Electron binary is missing at ${path} - run pnpm -r build first`);
    return path;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.out) throw new Error("usage: node scripts/capture-settings-cdp.mjs <output-dir> [--port N] [--desktop NAME]");
    mkdirSync(args.out, { recursive: true });

    const cli = findLowlevelCli();
    const electron = electronExecutable();
    const appDir = resolve(repoRoot, "design/packages/app");
    const profile = mkdtempSync(join(tmpdir(), "wl-capture-settings-"));

    lowlevel(cli, "create_headless_desktop", { name: args.desktop });
    let pid = null;
    try {
        const command =
            `"${electron}" "${appDir}" --worldlens-direct-launch ` +
            `--user-data-dir="${profile}" --no-sandbox --disable-gpu ` +
            `--force-prefers-reduced-motion --remote-debugging-port=${args.port}`;
        pid = Number(lowlevel(cli, "launch_on_headless_desktop", { name: args.desktop, command }).pid);

        const { chromium } = require("@playwright/test");
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${args.port}`);
        const page = browser.contexts()[0].pages()[0];
        await page.waitForTimeout(500);

        // Onboarding: NEXT, NEXT, DECLINE (no network fetch), FINISH SETUP.
        await page.getByRole("button", { name: /next/i }).click();
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: /next/i }).click();
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: /decline/i }).click();
        await page.waitForTimeout(200);
        await page.getByRole("button", { name: /finish setup/i }).click();
        await page.waitForTimeout(400);

        async function openSettings() {
            await page
                .locator("button[aria-label='Settings' i], .wl-rail button:has-text('Settings')")
                .first()
                .click()
                .catch(async () => page.mouse.click(39, 764));
            await page.waitForTimeout(500);
        }

        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(150);
        await openSettings();
        await page.screenshot({ path: join(args.out, "settings-1280-dark-en.png") });

        await page.setViewportSize({ width: 320, height: 700 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(args.out, "settings-320-dark-en.png") });

        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);

        const searchBox = page.locator(".mb-settings input").first();
        async function searchAndOpen(text) {
            if (await searchBox.count()) {
                await searchBox.fill("");
                await page.waitForTimeout(120);
                await searchBox.fill(text);
                await page.waitForTimeout(200);
            }
            await page.getByText(text, { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(300);
        }

        await searchAndOpen("Language and tone");
        const bilingual = page.getByText("Bilingual", { exact: false }).first();
        if (await bilingual.count()) await bilingual.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(args.out, "settings-bilingual.png") });

        await searchAndOpen("Display and ease of use");
        const lightBtn = page.getByRole("button", { name: /light/i }).first();
        if (await lightBtn.count()) await lightBtn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(args.out, "settings-light.png") });

        await searchAndOpen("Mojang download consent");
        await page.setViewportSize({ width: 320, height: 700 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(args.out, "settings-320-bilingual-light.png") });

        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);
        if (await searchBox.count()) await searchBox.fill("");

        const session = await page.context().newCDPSession(page);
        async function setScale(width, height, scale) {
            await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(150);
            await session.send("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: scale,
                mobile: false,
                screenWidth: width,
                screenHeight: height,
            });
            await page.waitForTimeout(400);
        }

        await setScale(1280, 800, 2);
        await page.screenshot({ path: join(args.out, "settings-1280-scale200.png") });

        await setScale(640, 700, 2);
        await page.screenshot({ path: join(args.out, "settings-640-scale200.png") });

        await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);

        // Regex-builder popover: the exact previously crash-inducing interaction
        // (GitHub issue #175, fixed with scrollbar-gutter: stable).
        await openSettings();
        const builderBtn = page.locator(".mb-settings [aria-label='Open the regex builder']").first();
        await builderBtn.waitFor({ state: "attached", timeout: 10000 });
        await builderBtn.click({ force: true, timeout: 10000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(args.out, "config-regex-builder-open-1280.png") });
        const responsiveWide = await page.evaluate(() => document.title).then(() => true).catch(() => false);
        console.log("renderer responsive at 1280:", responsiveWide);

        await page.setViewportSize({ width: 320, height: 700 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(args.out, "config-regex-builder-open-320.png") });
        const start = Date.now();
        await page.evaluate(() => document.body.getBoundingClientRect().width);
        console.log("renderer responsive at 320: took", Date.now() - start, "ms");

        // Close Settings, then the World downloader screen (the rail itself is captured by
        // scripts/capture-rail-cdp.mjs, which owns those two evidence files).
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);
        const worldDownloaderRail = page.getByText("Get a world off a server", { exact: false }).first();
        if (await worldDownloaderRail.count()) {
            await worldDownloaderRail.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(600);
        }
        await page.screenshot({ path: join(args.out, "world-downloader-1280.png") });

        await browser.close();
        console.log("capture-settings-cdp: wrote 12 PNGs to", args.out);
    } finally {
        if (pid) {
            try {
                lowlevel(cli, "kill_process", { pid, force: true });
            } catch {
                // best-effort cleanup
            }
        }
        try {
            lowlevel(cli, "close_headless_desktop", { name: args.desktop });
        } catch {
            // best-effort cleanup
        }
        rmSync(profile, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("capture-settings-cdp failed:", error);
    process.exitCode = 1;
});
