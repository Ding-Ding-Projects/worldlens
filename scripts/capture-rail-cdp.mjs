#!/usr/bin/env node

/**
 * Capture the application rail's job shortcuts through the cheap Lowlevel headless route,
 * driven by raw Chrome DevTools Protocol.
 *
 * The route, in order: an off-screen Win32 desktop is created through the installed
 * lowlevel-computer-use-cheap CLI; the built Electron app is launched on that desktop with
 * --worldlens-direct-launch and an isolated --user-data-dir, plus --remote-debugging-port so
 * a loopback CDP endpoint exists. --worldlens-direct-launch is not optional: without it the
 * app reads this machine's real, shared personal-vocabulary file (a genuine, deliberate,
 * existing feature - see main/index.ts's own comment on smoke-mode isolation) and a capture
 * taken that way shows substituted wording that exists nowhere in source. A prior pass in
 * this same lane found exactly that the hard way and had to discard every image it took.
 *
 * This script speaks CDP directly over a plain WebSocket (Node's built-in global
 * `WebSocket`, no `ws` package and no Playwright dependency - `@playwright/test` is a
 * devDependency of design/packages/app only, and this script is meant to run from the
 * repository root without assuming that workspace is installed). Before touching anything,
 * it fetches http://127.0.0.1:<port>/json/list and refuses to proceed unless it names
 * exactly one target of type "page" - the same isolation check this lane's own capture
 * sessions used by hand, now committed rather than re-typed into a scratch file each time.
 * The visible desktop, cursor, keyboard focus and foreground application are never touched;
 * every click and viewport change goes through this one CDP connection.
 *
 * No secret and no machine-specific absolute path is hard-coded here. The output directory
 * is a required CLI argument; a scratch profile directory is created under the OS temp
 * directory and removed afterward.
 *
 * Usage:
 *   node scripts/capture-rail-cdp.mjs <output-dir> [--port 19720] [--desktop NAME]
 *
 * Writes two PNGs into <output-dir>:
 *   rail-job-shortcuts-1280-dark.png   - 1280x800, every destination and shortcut visible
 *   rail-job-shortcuts-1280x600.png    - 1280x600, the shorter height that folds the
 *                                        remaining shortcuts into the rail's "More" button
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
    const args = { out: null, port: 19720, desktop: "WlCaptureRailCdp" };
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
        join(
            process.env.USERPROFILE || "",
            "Documents/GitHub/lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe",
        ),
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

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** A minimal CDP client over Node's built-in WebSocket - no `ws` package, no Playwright. */
function connectCdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve: res, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else res(msg.result);
        }
    });
    const ready = new Promise((res, reject) => {
        ws.addEventListener("open", res);
        ws.addEventListener("error", reject);
    });
    function send(method, params = {}) {
        const messageId = ++id;
        return new Promise((res, reject) => {
            pending.set(messageId, { resolve: res, reject });
            ws.send(JSON.stringify({ id: messageId, method, params }));
        });
    }
    return { ready, send, close: () => ws.close() };
}

/**
 * Every possible answer here is a sentence, not a click that races an element that may not
 * exist yet - the first run wizard's exact button labels are read fresh each step rather
 * than assumed, so a build that changed its onboarding copy fails loudly here instead of
 * silently capturing the wizard instead of the rail.
 */
async function dismissFirstRunWizard(send) {
    const steps = [/^next$/iu, /^next$/iu, /^decline$/iu, /^finish setup$/iu];
    for (const pattern of steps) {
        const found = await send("Runtime.evaluate", {
            expression: `
                (function () {
                    const pattern = ${pattern.toString()};
                    const button = Array.from(document.querySelectorAll("button")).find((b) =>
                        pattern.test(b.textContent.trim()),
                    );
                    if (!button) return null;
                    button.click();
                    return button.textContent.trim();
                })()
            `,
            returnByValue: true,
        });
        if (found.value === null) break;
        await sleep(300);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.out) {
        throw new Error("usage: node scripts/capture-rail-cdp.mjs <output-dir> [--port N] [--desktop NAME]");
    }
    mkdirSync(args.out, { recursive: true });

    const cli = findLowlevelCli();
    const electron = electronExecutable();
    const appMain = resolve(repoRoot, "design/packages/app/dist/main/index.js");
    if (!existsSync(appMain)) {
        throw new Error(`built main process is missing at ${appMain} - run pnpm --filter @worldlens/app build first`);
    }
    const profile = mkdtempSync(join(tmpdir(), "wl-capture-rail-"));

    lowlevel(cli, "create_headless_desktop", { name: args.desktop });
    let pid = null;
    let cdp = null;
    try {
        const command =
            `"${electron}" "${appMain}" --worldlens-direct-launch ` +
            `--user-data-dir="${profile}" --no-sandbox --disable-gpu ` +
            `--remote-debugging-port=${args.port}`;
        pid = Number(lowlevel(cli, "launch_on_headless_desktop", { name: args.desktop, command }).pid);
        await sleep(4000);

        const listResp = await fetch(`http://127.0.0.1:${args.port}/json/list`);
        const targets = await listResp.json();
        if (targets.length !== 1 || targets[0].type !== "page") {
            throw new Error(
                `expected exactly one page target on an isolated profile, found ${targets.length}: ` +
                    JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url }))),
            );
        }

        cdp = connectCdp(targets[0].webSocketDebuggerUrl);
        await cdp.ready;
        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");
        await sleep(1500);

        await dismissFirstRunWizard(cdp.send);
        await sleep(400);

        async function captureAt(width, height, fileName) {
            await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false,
            });
            await sleep(500);
            const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
            writeFileSync(join(args.out, fileName), Buffer.from(shot.data, "base64"));
            console.log(`captured ${fileName} at ${width}x${height}`);
        }

        await captureAt(1280, 800, "rail-job-shortcuts-1280-dark.png");
        await captureAt(1280, 600, "rail-job-shortcuts-1280x600.png");

        await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
        console.log("capture-rail-cdp: wrote 2 PNGs to", args.out);
    } finally {
        cdp?.close();
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
    console.error("capture-rail-cdp failed:", error);
    process.exitCode = 1;
});
