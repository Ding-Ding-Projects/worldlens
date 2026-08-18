#!/usr/bin/env node
/**
 * Worldlens interactive driver — attaches to an app already running on a HIDDEN desktop.
 *
 * This driver deliberately does NOT launch anything. The app is launched by the cheap
 * Lowlevel MCP headless route (`launch_on_headless_desktop`), so its window lives on an
 * off-screen Win32 desktop and the user's visible desktop, cursor and foreground app are
 * never touched. The driver then connects to that same process over the Chrome DevTools
 * protocol and gives an agent the DOM: click, read, evaluate, screenshot.
 *
 * A Playwright `_electron.launch()` would be simpler and is what the project's own capture
 * harness does — but it spawns the window on the VISIBLE desktop, which is not allowed here.
 * `chromium.connectOverCDP` gets the identical Playwright API against the hidden process.
 *
 * Usage (from the repository root, after the MCP launch in SKILL.md):
 *   node .claude/skills/run-worldlens/driver.mjs            # attaches to port 9333
 *   node .claude/skills/run-worldlens/driver.mjs 9444       # or another port
 * then write commands on stdin, one per line. Every command answers with a single line
 * starting "ok " or "err ", so it is safe to drive from a pipe or tmux send-keys.
 *
 * Commands:
 *   url                    current renderer URL
 *   ss <name>              screenshot -> .worldlens-driver/<name>.png (path printed)
 *   rail                   the navigation rail's labels
 *   nav <label>            click a rail item by its visible label
 *   buttons                visible button labels in the topmost dialog, else the page
 *   onboard                walk the 4-step first-run dialog to the end, DECLINING the
 *                          Minecraft download consent (the safe answer; both are real)
 *   text <selector>        innerText of the first match
 *   count <selector>       number of matches
 *   click <selector>       click it, then let the UI settle
 *   eval <js>              evaluate in the renderer, JSON-printed
 *   detach                 disconnect (leaves the app running on the hidden desktop)
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

/**
 * Find the Worldlens checkout. This file is copied into the global skill catalog and
 * installed to ~/.claude/skills/, where walking up three directories reaches the user's
 * home rather than a repository - so a fixed relative guess only works in one of the two
 * places this driver lives. Resolution order: an explicit WORLDLENS_REPO, then upward from
 * the current directory, then upward from this file.
 */
function findRepo() {
    const marker = (d) => existsSync(join(d, "design", "packages", "app", "package.json"));
    const walkUp = (from) => {
        for (let d = from, prev = ""; d !== prev; prev = d, d = dirname(d)) if (marker(d)) return d;
        return null;
    };
    const env = process.env.WORLDLENS_REPO;
    if (env) {
        if (!marker(env)) throw new Error(`WORLDLENS_REPO is not a Worldlens checkout: ${env}`);
        return env;
    }
    const found = walkUp(process.cwd()) ?? walkUp(dirname(fileURLToPath(import.meta.url)));
    if (!found) throw new Error("no Worldlens checkout found; run from inside one or set WORLDLENS_REPO");
    return found;
}

const REPO = findRepo();
const APP = join(REPO, "design", "packages", "app");
const SHOTS = join(REPO, ".worldlens-driver");
const PORT = process.argv[2] || "9333";

// Only `@playwright/test` is a dependency in this workspace (bare `playwright` is not
// installed), and it re-exports the browser types. Resolve it from the app package.
const require = createRequire(join(APP, "package.json"));
const { chromium } = require("@playwright/test");

const out = (s) => process.stdout.write(`ok ${s}\n`);
const bad = (s) => process.stdout.write(`err ${s}\n`);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const contexts = browser.contexts();
const pages = contexts.flatMap((c) => c.pages());
// Prove isolation before touching anything: exactly one page, and it is the app's own
// loopback renderer. Anything else means a second target got in and must not be driven.
if (pages.length !== 1) {
    bad(`expected exactly 1 page target, got ${pages.length}`);
    process.exit(1);
}
const page = pages[0];
out(`attached ${page.url()}`);

const settle = () => page.waitForTimeout(250);

/** Buttons of the open dialog if there is one, otherwise the whole page. */
const buttonScope = () =>
    page.locator(".v-overlay--active").count().then((n) => (n ? ".v-overlay--active button" : "button"));

const commands = {
    url: async () => out(page.url()),
    ss: async (name) => {
        await mkdir(SHOTS, { recursive: true });
        const file = join(SHOTS, `${name || "shot"}.png`);
        await page.screenshot({ path: file });
        out(file);
    },
    // The rail is this app's own component, not a Vuetify navigation drawer: the labels
    // are `.wl-rail-label`, and `.v-navigation-drawer .v-list-item-title` matches nothing.
    rail: async () => out(JSON.stringify(await page.locator(".wl-rail-label").allInnerTexts())),
    nav: async (...label) => {
        await page.locator(".wl-rail-item", { hasText: label.join(" ") }).first().click();
        await settle();
        out("navigated");
    },
    buttons: async () =>
        out(JSON.stringify((await page.locator(await buttonScope()).allInnerTexts()).map((t) => t.trim()).filter(Boolean))),
    text: async (...sel) => out(JSON.stringify(await page.locator(sel.join(" ")).first().innerText())),
    count: async (...sel) => out(String(await page.locator(sel.join(" ")).count())),
    click: async (...sel) => {
        await page.locator(sel.join(" ")).first().click();
        await settle();
        out("clicked");
    },
    // A fresh profile always opens on the 4-step first-run dialog, and it is modal: the
    // navigation rail is behind it, so `nav` times out until this has run. DECLINE is
    // chosen deliberately - it is a real, supported answer, and an agent must not accept
    // a licence on the user's behalf.
    onboard: async () => {
        const steps = ["NEXT", "NEXT", "DECLINE", "FINISH SETUP"];
        if ((await page.locator(".v-overlay--active").count()) === 0) return out("no dialog open");
        for (const label of steps) {
            await page.locator(`.v-overlay--active button:has-text("${label}")`).first().click();
            await settle();
        }
        out(`onboarded (declined download consent); dialogs open: ${await page.locator(".v-overlay--active").count()}`);
    },
    eval: async (...js) => out(JSON.stringify((await page.evaluate(js.join(" "))) ?? null)),
    detach: async () => {
        await browser.close();
        out("detached");
        process.exit(0);
    },
};

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) continue;
    const fn = commands[cmd];
    if (!fn) { bad(`unknown command: ${cmd}`); continue; }
    try { await fn(...args); } catch (e) { bad(String(e).split("\n")[0]); }
}
