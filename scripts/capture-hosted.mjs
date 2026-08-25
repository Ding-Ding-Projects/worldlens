#!/usr/bin/env node

/**
 * Capture the hosted deployment's own surfaces, from a real running deployment.
 *
 * ## Why this exists
 *
 * `docs/screenshots/evidence-inventory.json` asks every capture group to name the harness
 * that produced it and a command the next person can run. The hosted group named neither: its
 * `authority` was a sentence describing what somebody once did by hand. That is a picture, not
 * evidence, because nobody can reproduce it and nothing can tell whether it is still true.
 *
 * ## What it captures, and why these
 *
 * The two states that matter most are the ones a hosted deployment has and a desktop build
 * does not, and one of them was shipped broken precisely because nobody had ever looked at it:
 * an unauthenticated visitor was shown the entire application, with every bridge call
 * answering 401 and no prompt anywhere. A capture of the signed-out state is the cheapest
 * possible guard against that returning, because it cannot be satisfied by a passing test.
 *
 * The phone widths are here because hosted mode is the only way this application is reached
 * from a phone at all, so its narrow layout is not a nicety.
 *
 * ## The traps this route has, all of which cost real time before being written down
 *
 * - **Waiting on a promise inside the page hangs.** On the Node in use here, CDP
 *   `Runtime.evaluate` with `awaitPromise: true` never returns, even for a trivial expression,
 *   and widening the timeout does not help. Everything below evaluates synchronous expressions
 *   and polls.
 * - **A port that is already taken produces a confident, wrong answer.** An earlier attempt
 *   probed a port something else held and read that stranger's responses as the deployment's.
 *   The port is proved free before it is used, and the deployment's own banner is read back.
 * - **A browser reuses the page it was already showing.** Re-running against a restarted
 *   deployment will photograph the previous build unless the page is navigated explicitly.
 * - **A session cookie survives between runs**, so the signed-out capture silently becomes a
 *   second signed-in capture. Cookies are cleared before the first navigation.
 *
 * ## Usage
 *
 *   node scripts/capture-hosted.mjs
 *
 * Requires `cd design && pnpm build` first, and fails naming that command if the bundles are
 * absent rather than capturing something stale.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const hostedBundle = resolve(repoRoot, "design/packages/app/dist/hosted/index.js");
const uiRoot = resolve(repoRoot, "design/packages/ui/dist");
const outputDirectory = resolve(repoRoot, "docs/screenshots");

const PASSWORD = "capture-harness-password";

/** Each capture, with the viewport it is taken at and what it is meant to show. */
const CAPTURES = [
    { name: "hosted-signin", width: 1280, height: 900, scale: 1, state: "signed-out" },
    { name: "hosted-signed-in", width: 1280, height: 900, scale: 1, state: "signed-in" },
    { name: "hosted-320", width: 320, height: 568, scale: 2, state: "signed-in" },
    { name: "hosted-375", width: 375, height: 667, scale: 2, state: "signed-in" },
];

function fail(message) {
    process.stderr.write(`capture-hosted: ${message}\n`);
    process.exit(1);
}

/** Prove a port is free rather than discovering it was not by reading somebody else's answer. */
async function freePort() {
    return await new Promise((resolvePort, reject) => {
        const probe = createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolvePort(port));
        });
    });
}

function findBrowser() {
    const candidates = [
        process.env.WORLDLENS_CAPTURE_BROWSER,
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "/usr/bin/microsoft-edge",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ].filter(Boolean);
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found === undefined)
        fail(
            "no Chromium-based browser found. Set WORLDLENS_CAPTURE_BROWSER to one, or install Edge.",
        );
    return found;
}

/** A minimal CDP client. Deliberately no `awaitPromise`; see the header. */
function connect(socketUrl) {
    const socket = new WebSocket(socketUrl);
    const pending = new Map();
    let nextId = 1;

    const ready = new Promise((resolveReady, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out connecting to the page")), 15_000);
        socket.addEventListener("open", () => { clearTimeout(timer); resolveReady(); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("the debugging socket failed")); }, { once: true });
    });

    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id === undefined) return;
        const waiter = pending.get(message.id);
        if (waiter === undefined) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
    });

    const send = (method, params = {}) => {
        const id = nextId++;
        return new Promise((resolveSend, reject) => {
            pending.set(id, { resolve: resolveSend, reject });
            socket.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                reject(new Error(`timed out waiting for ${method}`));
            }, 30_000);
        });
    };

    const evaluate = async (expression) => {
        const result = await send("Runtime.evaluate", { expression, returnByValue: true });
        if (result.exceptionDetails)
            throw new Error(`page threw: ${JSON.stringify(result.exceptionDetails).slice(0, 300)}`);
        return result.result?.value;
    };

    return { ready, send, evaluate, close: () => socket.close() };
}

const wait = async (ms) => await new Promise((r) => setTimeout(r, ms));

/** Poll a synchronous predicate. Never awaits a promise inside the page. */
async function until(client, label, expression, tries = 60) {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        if (await client.evaluate(expression)) return;
        await wait(500);
    }
    throw new Error(`gave up waiting for ${label}`);
}

async function main() {
    if (!existsSync(hostedBundle) || !existsSync(join(uiRoot, "index.html")))
        fail("the bundles are missing. Run: cd design && pnpm build");

    const port = await freePort();
    const cdpPort = await freePort();
    const url = `http://127.0.0.1:${port}/`;

    const scratch = await mkdtemp(join(tmpdir(), "worldlens-capture-"));
    const worlds = join(scratch, "worlds");
    const renders = join(scratch, "renders");
    const state = join(scratch, "state");
    const profile = join(scratch, "browser-profile");
    for (const directory of [join(worlds, "overworld", "region"), renders, state, profile])
        await mkdir(directory, { recursive: true });
    await writeFile(join(worlds, "level.dat"), "");

    await mkdir(outputDirectory, { recursive: true });

    let deployment;
    let browser;
    let client;

    try {
        deployment = spawn(process.execPath, [hostedBundle], {
            cwd: repoRoot,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                WORLDLENS_PASSWORD: PASSWORD,
                WORLDLENS_HOST: "127.0.0.1",
                WORLDLENS_PORT: String(port),
                WORLDLENS_UI_ROOT: uiRoot,
                WORLDLENS_STATE_DIR: state,
                WORLDLENS_MOUNTS: `worlds:${worlds}:ro:Worlds,out:${renders}:Renders`,
            },
        });

        // Read the deployment's own banner back rather than assuming it started. A port that
        // answers is not proof that what answers is this.
        let banner = "";
        deployment.stdout.on("data", (chunk) => { banner += String(chunk); });
        deployment.stderr.on("data", (chunk) => { banner += String(chunk); });
        for (let attempt = 0; attempt < 40 && !banner.includes("listening on"); attempt += 1)
            await wait(250);
        if (!banner.includes("listening on"))
            throw new Error(`the deployment did not start. Output was:\n${banner.slice(0, 600)}`);
        if (!banner.includes("Password: set."))
            throw new Error("the deployment started without a password, so the gate cannot be shown");

        browser = spawn(
            findBrowser(),
            [
                `--user-data-dir=${profile}`,
                `--remote-debugging-port=${cdpPort}`,
                "--headless=new",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-sync",
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-features=msEdgeFirstRunExperience,msEdgeSignin,msEdgeSync",
                url,
            ],
            { stdio: "ignore" },
        );

        // Isolation. Exactly one page, at exactly this address. Finding one acceptable target
        // among several proves nothing: the others would still be readable.
        let targets = [];
        for (let attempt = 0; attempt < 40; attempt += 1) {
            await wait(500);
            try {
                const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
                if (!response.ok) continue;
                targets = await response.json();
                if (targets.length > 0) break;
            } catch {
                // The browser has not opened its port yet.
            }
        }
        const pages = targets.filter((candidate) => candidate.type === "page");
        if (targets.length !== 1 || pages.length !== 1)
            throw new Error(
                `expected exactly one page target, found ${targets.length}: ` +
                    targets.map((candidate) => `${candidate.type}:${candidate.url}`).join(", "),
            );
        if (new URL(pages[0].url).href !== new URL(url).href)
            throw new Error(`the only target is ${pages[0].url}, not ${url}`);

        client = connect(pages[0].webSocketDebuggerUrl);
        await client.ready;
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Network.enable");

        // Start signed out, whatever a previous run left behind.
        await client.send("Network.clearBrowserCookies");

        const written = [];
        for (const capture of CAPTURES) {
            await client.send("Emulation.setDeviceMetricsOverride", {
                width: capture.width,
                height: capture.height,
                deviceScaleFactor: capture.scale,
                mobile: capture.scale > 1,
            });

            if (capture.state === "signed-out") {
                await client.send("Network.clearBrowserCookies");
                await client.send("Page.navigate", { url });
                await until(client, "the sign-in prompt", `!!document.querySelector('input[type=password]')`);
                await wait(600);
            } else {
                const signedIn = await client.evaluate(`!document.querySelector('input[type=password]')`);
                if (!signedIn) {
                    await client.evaluate(`(() => {
                        const input = document.querySelector('input[type=password]');
                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                        setter.call(input, ${JSON.stringify(PASSWORD)});
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        const form = input.closest('form');
                        if (form) { form.requestSubmit(); }
                        return true;
                    })()`);
                    await until(client, "the application shell", `!document.querySelector('input[type=password]')`);
                }
                await wait(2500);
            }

            const { data } = await client.send("Page.captureScreenshot", { format: "png" });
            const bytes = Buffer.from(data, "base64");
            // A capture that is a handful of bytes is a blank frame, and a blank frame that
            // reaches the inventory is worse than a missing one.
            if (bytes.length < 5_000)
                throw new Error(`${capture.name} captured only ${bytes.length} bytes, which is not a rendered page`);
            const path = join(outputDirectory, `${capture.name}.png`);
            await writeFile(path, bytes);
            written.push(`docs/screenshots/${capture.name}.png`);
            process.stdout.write(
                `  ${capture.name}.png  ${capture.width}x${capture.height}@${capture.scale}x  ${capture.state}  ${bytes.length} bytes\n`,
            );
        }

        process.stdout.write(`captured ${written.length} of the hosted deployment's own surfaces\n`);
    } finally {
        client?.close();
        browser?.kill();
        deployment?.kill();
        await wait(500);
        await rm(scratch, { recursive: true, force: true }).catch(() => {});
    }
}

await main();
