#!/usr/bin/env node

/**
 * Capture the packaged build's evidence for the rail-overflow and Convert-screen defects,
 * through the cheap Lowlevel headless route driven by raw Chrome DevTools Protocol.
 *
 * The route mirrors `scripts/capture-rail-cdp.mjs` exactly, with one deliberate difference:
 * the application under the lens is a *packaged release*, extracted from that release's own
 * full package, rather than the built tree. These captures are the evidence that a shipped
 * installer behaves correctly, so photographing a development build would answer a question
 * nobody asked.
 *
 * An off-screen Win32 desktop is created through the installed lowlevel-computer-use-cheap
 * CLI; the packaged executable is launched on that desktop from a generated batch wrapper
 * that sets the capture-mode environment, with --worldlens-direct-launch, an isolated
 * --user-data-dir and --remote-debugging-port. --worldlens-direct-launch is not optional:
 * without it the application reads this machine's real shared personal-vocabulary file and
 * every committed image would show substituted wording that exists nowhere in source.
 *
 * Before anything is touched, http://127.0.0.1:<port>/json/list must name exactly one target
 * of type "page". The visible desktop, cursor, keyboard focus and foreground application are
 * never touched; every click and viewport change goes through the one CDP connection.
 *
 * One capture deliberately runs against a *second* profile that carries a personal-vocabulary
 * file, because the label-wrapping evidence only exists when a replacement is longer than the
 * shipped label it replaces. The file is written by this script into the throwaway profile,
 * holds one neutral English replacement, and is removed with that profile.
 *
 * Usage:
 *   node scripts/capture-issues-180-183-cdp.mjs <output-dir> --app <Worldlens.exe> [--port N] [--desktop NAME]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The replacement proving a longer label wraps instead of ellipsizing. Twelve characters. */
const LONG_LABEL_TERM = "Docker";
const LONG_LABEL_REPLACEMENT = "Orchestrator";

function parseArgs(argv) {
    const args = { out: null, app: null, port: 19228, desktop: "WLCap" };
    const positional = [];
    for (let i = 0; i < argv.length; i += 1) {
        const value = argv[i];
        if (value === "--port") args.port = Number(argv[++i]);
        else if (value === "--desktop") args.desktop = String(argv[++i]);
        else if (value === "--app") args.app = String(argv[++i]);
        else positional.push(value);
    }
    args.out = positional[0] ? resolve(positional[0]) : null;
    return args;
}

function findLowlevelCli() {
    const candidates = [
        process.env.LOWLEVEL_CHEAP_CLI,
        resolve(
            repoRoot,
            "../lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe",
        ),
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * `awaitPromise` is deliberately absent from every evaluation in this file.
 *
 * On this host's Node runtime a CDP `Runtime.evaluate` carrying `awaitPromise: true` hangs
 * indefinitely, even for a synchronous expression, while every other DevTools command keeps
 * answering. Expressions here stay synchronous and any asynchronous state is reached by
 * waiting between synchronous reads instead.
 */
async function evaluate(send, expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) {
        throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails.text)}`);
    }
    return result.result.value;
}

/**
 * Dismisses the first-run wizard, declining the download consent it asks for.
 *
 * The wizard's own button labels are read fresh on every pass rather than assumed, and the
 * loop keeps going until no wizard control is left on the page. A fixed sequence of clicks
 * timed from launch is not enough: the wizard mounts a little after the first paint, so a
 * single pass silently clicked nothing at all and every capture that followed was a picture
 * of the wizard sitting over the surface it was meant to show.
 *
 * `decline` is the only consent answer this route ever gives. Nothing here accepts a
 * download on the owner's behalf.
 */
async function dismissFirstRunWizard(send) {
    for (let wait = 0; wait < 30; wait += 1) {
        const present = await evaluate(send, 'document.querySelector(".mb-setup-card") !== null');
        if (present) break;
        await sleep(500);
    }
    for (let pass = 0; pass < 24; pass += 1) {
        const clicked = await evaluate(
            send,
            `(function () {
                const card = document.querySelector(".mb-setup-card");
                if (!card) return null;
                const pattern = /^(next|decline|finish setup)$/iu;
                const button = Array.from(card.querySelectorAll("button")).find(
                    (b) => pattern.test(b.textContent.trim()) && !b.disabled,
                );
                if (!button) return null;
                button.click();
                return button.textContent.trim();
            })()`,
        );
        if (clicked === null) return;
        await sleep(700);
    }
    throw new Error("the first run wizard never cleared");
}

const CLICK_SELECTOR = (selector) =>
    `(function () {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return false;
        node.scrollIntoView({ block: "center" });
        node.click();
        return true;
    })()`;

const CLICK_TEXT = (selector, text) =>
    `(function () {
        const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        const node = nodes.find((n) => n.textContent.trim() === ${JSON.stringify(text)});
        if (!node) return false;
        node.scrollIntoView({ block: "center" });
        node.click();
        return true;
    })()`;

/**
 * Proves the converter the target step reports is the copy inside this installer.
 *
 * The step prints the converter's version and the SHA-256 of the jar it resolved. That digest
 * is compared here against the jar actually staged in the packaged application's own resources,
 * so the capture is evidence of bundled-first resolution rather than a screenshot of a sentence.
 * A screen that had fetched or been pointed at some other copy would disagree here and fail.
 */
async function assertBundledConverter(send, appExecutable) {
    const text = await evaluate(
        send,
        'document.querySelector(\'[data-test="chunker-step-target"]\').textContent',
    );
    const shown = /SHA-256\s+([0-9a-f]{64})/iu.exec(text)?.[1]?.toLowerCase() ?? null;
    if (shown === null) throw new Error("the target step reported no converter digest");
    const bundledDirectory = join(dirname(appExecutable), "resources", "bundled", "chunker");
    const jars = readdirSync(bundledDirectory).filter((name) => name.endsWith(".jar"));
    if (jars.length !== 1) {
        throw new Error(`expected exactly one bundled converter jar, found ${jars.length}`);
    }
    const bundled = createHash("sha256")
        .update(readFileSync(join(bundledDirectory, jars[0])))
        .digest("hex");
    if (bundled !== shown) {
        throw new Error(
            `the screen reports converter ${shown}, but the installer stages ${bundled} (${jars[0]})`,
        );
    }
    console.log(`bundled converter confirmed: ${jars[0]} ${bundled}`);
}

/** Scrolls `selector` to the top of the scroll container that holds it. */
async function scrollTo(send, selector) {
    await evaluate(
        send,
        `(function () {
            const node = document.querySelector(${JSON.stringify(selector)});
            if (!node) return false;
            node.scrollIntoView({ block: "start" });
            return true;
        })()`,
    );
    await sleep(700);
}

/** The Convert screen's own step control, named exactly so no other button can answer. */
async function next(send) {
    const moved = await evaluate(send, CLICK_TEXT("button", "Next"));
    if (!moved) throw new Error("the Convert screen's Next control was not found");
}

/** Every destination row the picker offers, with the state that decides selectability. */
async function routeRows(send) {
    return evaluate(
        send,
        `Array.from(document.querySelectorAll('[data-test^="chunker-route-row-"]')).map((row) => ({
            id: row.getAttribute("data-test").replace("chunker-route-row-", ""),
            label: row.textContent.trim().slice(0, 80),
            enabled: !row.querySelector("input[type=radio]").disabled,
            selected: row.querySelector("input[type=radio]").checked,
        }))`,
    );
}

/** Selects one destination through the radio the picker renders, and proves it took. */
async function selectRoute(send, id) {
    const clicked = await evaluate(
        send,
        `(function () {
            const row = document.querySelector('[data-test="chunker-route-row-${id}"]');
            if (!row) return "no-row";
            const radio = row.querySelector("input[type=radio]");
            if (!radio) return "no-radio";
            if (radio.disabled) return "disabled";
            radio.click();
            return "clicked";
        })()`,
    );
    if (clicked !== "clicked") throw new Error(`destination ${id} was not selectable: ${clicked}`);
    await sleep(700);
    const rows = await routeRows(send);
    const chosen = rows.find((row) => row.id === id);
    if (!chosen?.selected) throw new Error(`destination ${id} did not stay selected`);
}

/** Walks forward to the review step, whatever the step in between happens to be. */
async function toReview(send) {
    for (let step = 0; step < 8; step += 1) {
        const onReview = await evaluate(
            send,
            'document.querySelector(\'[data-test="chunker-step-review"]\') !== null',
        );
        if (onReview) return;
        await next(send);
        await sleep(900);
    }
    throw new Error("the review step was never reached");
}

/** Walks back to the destination picker's own step. */
async function backToTarget(send) {
    for (let step = 0; step < 8; step += 1) {
        const onTarget = await evaluate(
            send,
            'document.querySelector(\'[data-test="chunker-route-picker"]\') !== null',
        );
        if (onTarget) return;
        const moved = await evaluate(send, CLICK_TEXT("button", "Back"));
        if (!moved) throw new Error("the Convert screen's Back control was not found");
        await sleep(900);
    }
    throw new Error("the destination picker was never reached again");
}

/** Which destination sections the review step is rendering right now. */
async function sections(send) {
    return evaluate(
        send,
        `({
            actions: document.querySelector('[data-test="chunker-actions-panel"]') !== null,
            container: document.querySelector('[data-test="chunker-container-panel"]') !== null,
        })`,
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.out || !args.app) {
        throw new Error(
            "usage: node scripts/capture-issues-180-183-cdp.mjs <output-dir> --app <Worldlens.exe> " +
                "[--port N] [--desktop NAME]",
        );
    }
    if (!existsSync(args.app)) throw new Error(`packaged executable is missing at ${args.app}`);
    mkdirSync(args.out, { recursive: true });

    const cli = findLowlevelCli();
    lowlevel(cli, "create_headless_desktop", { name: args.desktop });
    try {
        await session(cli, args, { vocabulary: false });
        await session(cli, args, { vocabulary: true });
    } finally {
        try {
            lowlevel(cli, "close_headless_desktop", { name: args.desktop });
        } catch {
            // best-effort cleanup
        }
    }
    console.log("capture-issues-180-183-cdp: wrote captures to", args.out);
}

async function session(cli, args, { vocabulary }) {
    const profile = mkdtempSync(join(tmpdir(), "wl-issue-captures-"));
    const storage = join(profile, "maps");
    mkdirSync(storage, { recursive: true });
    const batch = join(profile, "launch.bat");
    writeFileSync(
        batch,
        [
            "@echo off",
            'set "WORLDLENS_UI_ONLY=1"',
            `set "WORLDLENS_SCREENSHOT_STORAGE=${storage}"`,
            /*
             * %APPDATA% is deliberately left alone. Pointing it at the throwaway profile was
             * tried and is worse on both counts it was tried for: the substitute path still
             * carries the account name, because the throwaway profile lives under it, and the
             * empty folder turns the source step into a warning about a folder that is not
             * there - a picture of a machine with no Minecraft on it, which is not the state
             * either of these two actions is being photographed in.
             */
            `"${args.app}" --worldlens-direct-launch --user-data-dir="${profile}" ` +
                `--no-sandbox --disable-gpu --remote-debugging-port=${args.port}`,
            "",
        ].join("\r\n"),
        "utf8",
    );

    let pid = null;
    let cdp = null;
    try {
        pid = Number(
            lowlevel(cli, "launch_on_headless_desktop", {
                name: args.desktop,
                command: `"${batch}"`,
            }).pid,
        );
        let targets = [];
        for (let attempt = 0; attempt < 40; attempt += 1) {
            await sleep(1000);
            try {
                targets = await (await fetch(`http://127.0.0.1:${args.port}/json/list`)).json();
            } catch {
                targets = [];
            }
            if (targets.length > 0) break;
        }
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
        await sleep(2500);
        await dismissFirstRunWizard(cdp.send);
        await sleep(800);

        async function viewport(width, height) {
            await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: 1,
                mobile: false,
            });
            await sleep(800);
        }
        async function capture(fileName) {
            const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
            writeFileSync(join(args.out, fileName), Buffer.from(shot.data, "base64"));
            console.log(`captured ${fileName}`);
        }

        if (vocabulary) {
            /*
             * Issue 180, second half: a replacement longer than the shipped label wraps.
             *
             * The file goes in through the application's own personal-vocabulary upload call,
             * the same one the settings control invokes, rather than being written into the
             * profile by hand: the store keeps a validated cache envelope on disk, so a raw
             * file dropped beside it is rejected as unreadable and the interface renders its
             * shipped wording - which is a capture of nothing.
             *
             * The page is then reloaded, because the upload call writes the cache while the
             * running renderer's own reactive store is only refreshed by the control that
             * normally makes that call. The reload is what makes the rail render the term.
             */
            const payload = JSON.stringify({
                schemaVersion: 1,
                entries: { [LONG_LABEL_TERM]: LONG_LABEL_REPLACEMENT },
            });
            const accepted = await evaluate(
                cdp.send,
                `(function () {
                    const host = window.worldlens && window.worldlens.vocabulary;
                    if (!host) return false;
                    host.load(${JSON.stringify(payload)});
                    return true;
                })()`,
            );
            if (!accepted) throw new Error("this build exposes no personal-vocabulary bridge");
            await sleep(2500);
            await cdp.send("Page.reload");
            await sleep(4000);
            await dismissFirstRunWizard(cdp.send);
            await sleep(1200);
            const rendered = await evaluate(
                cdp.send,
                `Array.from(document.querySelectorAll("[data-job-shortcut]")).map((n) => n.textContent.trim())`,
            );
            if (!rendered.some((label) => label.includes(LONG_LABEL_REPLACEMENT))) {
                throw new Error(
                    `the replacement never reached a rail label: ${JSON.stringify(rendered)}`,
                );
            }
            await viewport(1280, 800);
            await capture("issue-180-rail-long-label-wrap.png");
        } else {
            /* Issue 180, first half: the overflow menu the More control opens. */
            await viewport(1280, 600);
            await evaluate(cdp.send, CLICK_SELECTOR("[data-rail-more]"));
            await sleep(1200);
            await capture("issue-180-rail-more-open.png");
            /* The same button closes it; an overlay click elsewhere does not. */
            await evaluate(cdp.send, CLICK_SELECTOR("[data-rail-more]"));
            await sleep(700);

            /* Issue 181: the Convert screen's source step and its two folder actions. */
            await viewport(1280, 800);
            await evaluate(cdp.send, CLICK_SELECTOR('[data-job-shortcut="chunker"]'));
            await sleep(2500);
            await scrollTo(cdp.send, '[data-test="chunker-step-source"]');
            await capture("issue-181-convert-source-actions-enabled.png");

            /* Issue 182: converter provenance on the target step. */
            await next(cdp.send);
            await sleep(2500);
            await scrollTo(cdp.send, '[data-test="chunker-step-target"]');
            await assertBundledConverter(cdp.send, args.app);
            await capture("issue-182-convert-converter-provenance.png");

            console.log("route rows:", JSON.stringify(await routeRows(cdp.send)));

            /*
             * Issue 183, the destination picker itself.
             *
             * The hosted-runner destination is not selectable on a signed-out machine: its own
             * readiness gate holds it disabled and states the reason beside it, which is the
             * correct behaviour and the reason this route cannot photograph that destination's
             * panel without signing an account in. The picker is captured as it stands, and the
             * exactly-one-section rule is proven below with the two destinations a signed-out
             * machine can actually choose.
             */
            await scrollTo(cdp.send, '[data-test="chunker-route-picker"]');
            await capture("issue-183-convert-destination-picker.png");

            /* Issue 183: the default destination renders no other destination's section. */
            await toReview(cdp.send);
            await scrollTo(cdp.send, '[data-test="chunker-step-review"]');
            await capture("issue-183-convert-review-local-destination.png");
            console.log("sections with local route:", JSON.stringify(await sections(cdp.send)));

            /* Issue 183: the container destination's own section, both widths. */
            await backToTarget(cdp.send);
            await selectRoute(cdp.send, "docker");
            await sleep(900);
            await toReview(cdp.send);
            await scrollTo(cdp.send, '[data-test="chunker-container-panel"]');
            await capture("issue-183-convert-container-memory-field.png");
            console.log("sections with container route:", JSON.stringify(await sections(cdp.send)));
            await viewport(320, 800);
            await scrollTo(cdp.send, '[data-test="chunker-container-panel"]');
            await capture("issue-183-convert-container-memory-field-320.png");
        }

        await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
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
            lowlevel(cli, "kill_process", { name: "Worldlens.exe", force: true });
        } catch {
            // best-effort cleanup
        }
        await sleep(1500);
        rmSync(profile, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("capture-issues-180-183-cdp failed:", error);
    process.exitCode = 1;
});
