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
 *   onboard                walk the 4-step first-run dialog to the end, ACCEPTING the
 *                          Minecraft download consent under the user's standing choice
 *   text <selector>        innerText of the first match
 *   count <selector>       number of matches
 *   click <selector>       click it, then let the UI settle
 *   ssclip <name> <selector> capture one real element plus a metadata sidecar
 *   fill <selector> <text> fill a real field
 *   press <selector> <key> send one key to a real control
 *   rightclick <selector>  open the target's real context menu
 *   wait <selector>        wait for one real visible element
 *   viewport <w> <h>       set the renderer's exact CSS viewport
 *   zoom <factor>          set the document zoom for a display-scale proof
 *   plan <path>            run a committed JSON/JSONL action plan
 *   eval <js>              evaluate in the renderer, JSON-printed
 *   detach                 disconnect (leaves the app running on the hidden desktop)
 *
 * A line beginning with `{` is one JSON plan action. `screenshot` and
 * `walkthroughFrame` actions write `.capture.json` sidecars carrying alt text, category,
 * theme, viewport, state, expected surface, source commit and capture time. This is the
 * route the release-grade matrix uses; it does not launch a second app.
 */
import { createRequire } from "node:module";
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
  const marker = (d) =>
    existsSync(join(d, "design", "packages", "app", "package.json"));
  const walkUp = (from) => {
    for (let d = from, prev = ""; d !== prev; prev = d, d = dirname(d))
      if (marker(d)) return d;
    return null;
  };
  const env = process.env.WORLDLENS_REPO;
  if (env) {
    if (!marker(env))
      throw new Error(`WORLDLENS_REPO is not a Worldlens checkout: ${env}`);
    return env;
  }
  const found =
    walkUp(process.cwd()) ?? walkUp(dirname(fileURLToPath(import.meta.url)));
  if (!found)
    throw new Error(
      "no Worldlens checkout found; run from inside one or set WORLDLENS_REPO",
    );
  return found;
}

const REPO = findRepo();
const APP = join(REPO, "design", "packages", "app");
const SHOTS = resolve(
  process.env.WORLDLENS_DRIVER_OUTPUT || join(REPO, ".worldlens-driver"),
);
const PORT = process.argv[2] || "9333";
const LOWLEVEL_MCP_ENDPOINT = process.env.LOWLEVEL_MCP_ENDPOINT || "";
const LOWLEVEL_HWND = Number(process.env.WORLDLENS_DRIVER_HWND || 0);
const LOWLEVEL_WINDOW_WIDTH = Number(process.env.WORLDLENS_DRIVER_WIDTH || 0);
const LOWLEVEL_WINDOW_HEIGHT = Number(process.env.WORLDLENS_DRIVER_HEIGHT || 0);
const UI_ONLY = process.env.WORLDLENS_UI_ONLY === "1";

if (
  UI_ONLY &&
  (!LOWLEVEL_MCP_ENDPOINT ||
    !Number.isInteger(LOWLEVEL_HWND) ||
    LOWLEVEL_HWND <= 0)
) {
  throw new Error(
    "WORLDLENS_UI_ONLY=1 requires LOWLEVEL_MCP_ENDPOINT and a positive WORLDLENS_DRIVER_HWND",
  );
}

let mcpSession = null;
let mcpId = 1;

async function mcpPost(payload) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
  };
  if (mcpSession) headers["mcp-session-id"] = mcpSession;
  const response = await fetch(LOWLEVEL_MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`Lowlevel MCP returned HTTP ${response.status}`);
  mcpSession = response.headers.get("mcp-session-id") || mcpSession;
  const body = await response.text();
  if (!body.trim()) return [];
  const messages = response.headers.get("content-type")?.includes("text/event-stream")
    ? body
        .split(/\r?\n\r?\n/u)
        .flatMap((event) => event.split(/\r?\n/u))
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5).trim()))
    : [JSON.parse(body)];
  return messages;
}

async function mcpRequest(method, params = {}) {
  const id = mcpId++;
  const responses = await mcpPost({ jsonrpc: "2.0", id, method, params });
  const response = responses.find((candidate) => candidate.id === id);
  if (!response) throw new Error(`Lowlevel MCP omitted response ${id}`);
  if (response.error)
    throw new Error(
      `Lowlevel MCP ${method} failed: ${JSON.stringify(response.error)}`,
    );
  return response.result;
}

async function initializeMcp() {
  if (!UI_ONLY) return;
  await mcpRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "worldlens-ui-e2e", version: "1" },
  });
  await mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" });
}

async function lowlevelCall(name, params) {
  const result = await mcpRequest("tools/call", {
    name,
    arguments: { params },
  });
  const text = result.content?.find((part) => part.type === "text")?.text;
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Lowlevel ${name} returned non-JSON: ${text.slice(0, 500)}`);
    }
  }
  if (result.isError || payload.ok !== true) {
    throw new Error(
      `Lowlevel ${name} failed: ${payload.error || "unknown failure"}`,
    );
  }
  return payload;
}

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
const targetUrl = new URL(page.url());
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(targetUrl.hostname) ||
  (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:")
) {
  bad("the sole page target is not Worldlens on loopback");
  process.exit(1);
}
out(`attached ${page.url()}`);
await initializeMcp();

const settle = () => page.waitForTimeout(250);
let cachedInputHwnd = null;

async function lowlevelInputHwnd() {
  if (cachedInputHwnd !== null) return cachedInputHwnd;
  const result = await lowlevelCall("list_child_windows", { hwnd: LOWLEVEL_HWND });
  const matches = (result.children || []).filter(
    (child) =>
      child.class === "Chrome_RenderWidgetHostHWND" &&
      child.visible === true &&
      child.width > 0 &&
      child.height > 0,
  );
  if (matches.length !== 1)
    throw new Error(
      `expected one visible Chrome_RenderWidgetHostHWND, found ${matches.length}`,
    );
  cachedInputHwnd = matches[0].handle;
  return cachedInputHwnd;
}

async function lowlevelClick(locator, button = "left") {
  await locator.waitFor({ state: "visible", timeout: 45_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error("target has no visible bounding box");
  await lowlevelCall("mouse_click", {
    hwnd: LOWLEVEL_HWND,
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    button,
    clicks: 1,
  });
  await settle();
}

async function lowlevelFill(locator, value) {
  await lowlevelClick(locator);
  const inputHwnd = await lowlevelInputHwnd();
  const existing = await locator.inputValue().catch(() => "");
  for (let index = 0; index < existing.length; index += 1) {
    await lowlevelCall("win_send_keys", { hwnd: inputHwnd, keys: ["backspace"] });
  }
  const text = String(value);
  if (/^[A-Za-z0-9 _-]+$/u.test(text)) {
    for (const character of text) {
      await lowlevelCall("win_send_keys", {
        hwnd: inputHwnd,
        keys: [character === " " ? "space" : character.toLowerCase()],
      });
    }
  } else {
    await lowlevelCall("type_text", { hwnd: inputHwnd, text });
  }
  await settle();
}

async function lowlevelPress(key) {
  const inputHwnd = await lowlevelInputHwnd();
  await lowlevelCall("win_send_keys", {
    hwnd: inputHwnd,
    keys: [String(key)],
  });
  await settle();
}

async function lowlevelChooseFolder(step) {
  const value = step.valueEnv
    ? process.env[String(step.valueEnv)]
    : step.value;
  if (typeof value !== "string" || value.trim() === "")
    throw new Error("chooseFolder needs a non-empty value or valueEnv");
  await lowlevelClick(locate(step));
  const desktop = process.env.WORLDLENS_DRIVER_DESKTOP;
  if (!desktop) throw new Error("chooseFolder requires WORLDLENS_DRIVER_DESKTOP");
  const deadline = Date.now() + (step.timeout || 30_000);
  let dialog = null;
  while (Date.now() < deadline) {
    const inventory = await lowlevelCall("list_headless_windows", { name: desktop });
    const matches = (inventory.windows || []).filter(
      (window) =>
        window.class === "#32770" &&
        window.width > 0 &&
        window.height > 0,
    );
    if (matches.length === 1) {
      dialog = matches[0];
      break;
    }
    if (matches.length > 1)
      throw new Error(`chooseFolder found ${matches.length} native dialogs`);
    await page.waitForTimeout(100);
  }
  if (!dialog) throw new Error("chooseFolder native dialog did not appear");
  let children = null;
  let edits = [];
  let confirm = null;
  const controlsDeadline = Date.now() + 5_000;
  while (Date.now() < controlsDeadline) {
    children = await lowlevelCall("list_child_windows", { hwnd: dialog.handle });
    edits = (children.children || []).filter(
      (child) => child.class === "Edit" && child.visible === true,
    );
    confirm = (children.children || []).find(
      (child) =>
        child.class === "Button" &&
        child.visible === true &&
        /select folder|choose|open/i.test(child.text || ""),
    );
    if (edits.length > 0 && confirm) break;
    await page.waitForTimeout(100);
  }
  if (!children)
    throw new Error("chooseFolder could not enumerate native dialog controls");
  await mkdir(SHOTS, { recursive: true });
  await writeFile(
    join(SHOTS, "native-folder-dialog.json"),
    `${JSON.stringify({ dialog, children: children.children || [] }, null, 2)}\n`,
    "utf8",
  );
  if (edits.length < 1)
    throw new Error("chooseFolder found no visible native Edit control");
  await lowlevelCall("win_set_control_text", {
    hwnd: edits[edits.length - 1].handle,
    text: value,
  });
  if (!confirm)
    throw new Error("chooseFolder found no visible confirmation button");
  await lowlevelCall("win_send_keys", { hwnd: confirm.handle, keys: ["space"] });
  const closeDeadline = Date.now() + 15_000;
  while (Date.now() < closeDeadline) {
    const inventory = await lowlevelCall("list_headless_windows", { name: desktop });
    if (!(inventory.windows || []).some((window) => window.handle === dialog.handle)) {
      await settle();
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("chooseFolder native dialog did not close after Enter");
}

const CAPTURE_COMMIT =
  process.env.WORLDLENS_CAPTURE_COMMIT ||
  process.env.GITHUB_SHA ||
  "(local run)";
const captureLedger = [];
const rememberedCounts = new Map();

/** One target description shared by interactive and committed-plan commands. */
const locate = (step) => {
  let locator;
  if (step.role) {
    locator = page.getByRole(step.role, {
      name: step.name,
      exact: step.exact === true,
    });
  } else {
    if (!step.selector) throw new Error("the action needs selector or role");
    locator = page.locator(
      step.selector,
      step.hasText ? { hasText: step.hasText } : undefined,
    );
  }
  return locator.nth(Number.isInteger(step.nth) ? step.nth : 0);
};

async function capture(step, walkthrough = false) {
  if (!step.name) throw new Error("a capture action needs a name");
  const directory = walkthrough
    ? join(SHOTS, "walkthrough-frames", step.walkthroughId || "unclassified")
    : SHOTS;
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${step.name}.png`);
  let lowlevelShot = null;
  if (UI_ONLY) {
    if (step.selector || step.role) {
      throw new Error(
        "UI-only captures are whole-window Lowlevel screenshots; element clipping is not allowed",
      );
    }
    lowlevelShot = await lowlevelCall("screenshot", { hwnd: LOWLEVEL_HWND });
    await copyFile(lowlevelShot.path, file);
  } else if (step.selector || step.role)
    await locate(step).screenshot({ path: file });
  else await page.screenshot({ path: file });

  const metadata = {
    name: step.name,
    file: `${step.name}.png`,
    alt: step.alt || step.expectedSurface || step.name,
    category: step.category || (walkthrough ? "walkthrough" : "uncategorized"),
    theme: step.theme || "current",
    viewport:
      step.viewport ||
      (lowlevelShot
        ? `${lowlevelShot.width}x${lowlevelShot.height}`
        : `${page.viewportSize()?.width ?? "window"}x${page.viewportSize()?.height ?? "window"}`),
    state: step.state || "current",
    expectedSurface: step.expectedSurface || step.alt || step.name,
    commit: step.commit || CAPTURE_COMMIT,
    capturedAt: new Date().toISOString(),
    source: UI_ONLY
      ? "cheap Lowlevel hidden desktop input and window capture + read-only single-target CDP assertions"
      : "cheap Lowlevel hidden desktop + single-target CDP driver",
    ...(walkthrough
      ? { walkthroughId: step.walkthroughId || "unclassified" }
      : {}),
  };
  await writeFile(
    join(directory, `${step.name}.capture.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  captureLedger.push(metadata);
  return file;
}

/**
 * Executes one JSON action from a committed plan.
 *
 * A plan is JSONL (one object per line) or a JSON array. It uses the same real Playwright
 * locators as interactive driving and stays attached to the one app process Lowlevel launched
 * on the hidden desktop; it never launches a second or visible app.
 */
async function executeAction(step) {
  switch (step.action) {
    case "wait":
      await locate(step).waitFor({
        state: step.state || "visible",
        timeout: step.timeout || 45_000,
      });
      break;
    case "click":
      if (UI_ONLY) await lowlevelClick(locate(step), step.button || "left");
      else
        await locate(step).click({
          button: step.button || "left",
          timeout: step.timeout || 45_000,
        });
      await settle();
      break;
    case "clickIfVisible": {
      const target = locate(step);
      const visible = await target
        .waitFor({ state: "visible", timeout: Number(step.timeout || 2_000) })
        .then(() => true)
        .catch(() => false);
      if (visible) {
        if (UI_ONLY) await lowlevelClick(target, step.button || "left");
        else await target.click({ button: step.button || "left" });
      }
      await settle();
      break;
    }
    case "clickPoint":
      if (!UI_ONLY)
        throw new Error("clickPoint is reserved for Lowlevel UI-only plans");
      await lowlevelCall("mouse_click", {
        hwnd: LOWLEVEL_HWND,
        x: Number(step.x),
        y: Number(step.y),
        button: step.button || "left",
        clicks: 1,
      });
      await settle();
      break;
    case "clickUntilVisible": {
      if (!UI_ONLY)
        throw new Error("clickUntilVisible is reserved for Lowlevel UI-only plans");
      const target = locate(step);
      const attempts = Number(step.attempts || 12);
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const box = await target.boundingBox().catch(() => null);
        const centerX = box === null ? -1 : box.x + box.width / 2;
        const centerY = box === null ? -1 : box.y + box.height / 2;
        const inWindow =
          box !== null &&
          centerX >= 0 &&
          centerY >= 0 &&
          (LOWLEVEL_WINDOW_WIDTH <= 0 || centerX < LOWLEVEL_WINDOW_WIDTH) &&
          (LOWLEVEL_WINDOW_HEIGHT <= 0 || centerY < LOWLEVEL_WINDOW_HEIGHT);
        if ((await target.isVisible()) && inWindow) {
          await lowlevelClick(target, step.button || "left");
          break;
        }
        await lowlevelCall("mouse_click", {
          hwnd: LOWLEVEL_HWND,
          x: Number(step.scrollX || 1271),
          y: Number(
            step.scrollY ||
              (box !== null && box.y + box.height / 2 < 0 ? 150 : 700),
          ),
          button: "left",
          clicks: 1,
        });
        await settle();
      }
      const finalBox = await target.boundingBox().catch(() => null);
      if (
        !(await target.isVisible()) ||
        finalBox === null ||
        finalBox.y + finalBox.height / 2 < 0 ||
        (LOWLEVEL_WINDOW_HEIGHT > 0 &&
          finalBox.y + finalBox.height / 2 >= LOWLEVEL_WINDOW_HEIGHT)
      )
        throw new Error("clickUntilVisible exhausted its bounded scroll attempts");
      break;
    }
    case "scrollUntilInViewport": {
      if (!UI_ONLY)
        throw new Error("scrollUntilInViewport is reserved for Lowlevel UI-only plans");
      const target = locate(step);
      const attempts = Number(step.attempts || 24);
      let box = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        box = await target.boundingBox().catch(() => null);
        const centerY = box === null ? -1 : box.y + box.height / 2;
        if (
          box !== null &&
          centerY >= Number(step.topMargin || 110) &&
          (LOWLEVEL_WINDOW_HEIGHT <= 0 ||
            centerY < LOWLEVEL_WINDOW_HEIGHT - Number(step.bottomMargin || 40))
        )
          break;
        await lowlevelCall("mouse_click", {
          hwnd: LOWLEVEL_HWND,
          x: Math.max(0, LOWLEVEL_WINDOW_WIDTH - 9),
          y:
            box !== null && centerY < 0
              ? Number(step.scrollUpY || 150)
              : Math.max(0, LOWLEVEL_WINDOW_HEIGHT - Number(step.scrollBottomInset || 100)),
          button: "left",
          clicks: 1,
        });
        await settle();
      }
      box = await target.boundingBox().catch(() => null);
      const centerY = box === null ? -1 : box.y + box.height / 2;
      if (
        box === null ||
        centerY < Number(step.topMargin || 110) ||
        (LOWLEVEL_WINDOW_HEIGHT > 0 &&
          centerY >= LOWLEVEL_WINDOW_HEIGHT - Number(step.bottomMargin || 40))
      )
        throw new Error("scrollUntilInViewport exhausted its bounded Lowlevel key attempts");
      break;
    }
    case "chooseFolder":
      if (!UI_ONLY)
        throw new Error("chooseFolder is reserved for Lowlevel UI-only plans");
      await lowlevelChooseFolder(step);
      break;
    case "pressWhenFocused": {
      if (!UI_ONLY)
        throw new Error("pressWhenFocused is reserved for Lowlevel UI-only plans");
      const target = locate(step);
      const attempts = Number(step.attempts || 100);
      let focused = false;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        focused = await target
          .evaluate((element) => element === document.activeElement)
          .catch(() => false);
        if (focused) break;
        await lowlevelPress("tab");
      }
      if (!focused)
        throw new Error("pressWhenFocused exhausted its bounded Tab sequence");
      await lowlevelPress(step.key || "space");
      break;
    }
    case "fill":
      {
        const value = step.valueEnv
          ? process.env[String(step.valueEnv)]
          : step.value;
        if (step.valueEnv && value === undefined)
          throw new Error(`missing environment value ${step.valueEnv}`);
        if (UI_ONLY) await lowlevelFill(locate(step), value ?? "");
        else await locate(step).fill(String(value ?? ""));
      }
      await settle();
      break;
    case "press":
      if (UI_ONLY) {
        await lowlevelClick(locate(step));
        await lowlevelPress(step.key);
      } else await locate(step).press(String(step.key));
      await settle();
      break;
    case "windowKey":
      if (!UI_ONLY)
        throw new Error("windowKey is reserved for Lowlevel UI-only plans");
      await lowlevelPress(step.key);
      break;
    case "viewport":
      await page.setViewportSize({
        width: Number(step.width),
        height: Number(step.height),
      });
      await settle();
      break;
    case "zoom":
      await page.evaluate((factor) => {
        document.documentElement.style.zoom = String(factor);
      }, Number(step.factor));
      await settle();
      break;
    case "sleep":
      await page.waitForTimeout(Math.max(0, Number(step.ms) || 0));
      break;
    case "assertText": {
      const actual = await locate(step).innerText();
      if (!actual.includes(String(step.text)))
        throw new Error(`expected text not found: ${step.text}`);
      break;
    }
    case "assertCount": {
      const actual = await page.locator(step.selector).count();
      if (actual !== Number(step.count))
        throw new Error(
          `expected ${step.selector} count ${step.count}, found ${actual}`,
        );
      break;
    }
    case "waitForCount": {
      const expected = Number(step.count);
      const deadline = Date.now() + Number(step.timeout || 45_000);
      let actual = -1;
      while (Date.now() < deadline) {
        actual = await page.locator(step.selector).count();
        if (actual === expected) break;
        await page.waitForTimeout(250);
      }
      if (actual !== expected)
        throw new Error(
          `expected ${step.selector} count ${expected} before timeout, found ${actual}`,
        );
      break;
    }
    case "rememberCount": {
      const key = String(step.key || "default");
      rememberedCounts.set(key, await page.locator(step.selector).count());
      break;
    }
    case "waitForCountGreaterThanRemembered": {
      const key = String(step.key || "default");
      const remembered = rememberedCounts.get(key);
      if (remembered === undefined)
        throw new Error(`no remembered count exists for ${JSON.stringify(key)}`);
      const deadline = Date.now() + Number(step.timeout || 45_000);
      let actual = -1;
      while (Date.now() < deadline) {
        actual = await page.locator(step.selector).count();
        if (actual > remembered) break;
        await page.waitForTimeout(250);
      }
      if (actual <= remembered)
        throw new Error(
          `expected ${step.selector} count above remembered ${remembered} before timeout, found ${actual}`,
        );
      break;
    }
    case "waitForCountLessThanRemembered": {
      const key = String(step.key || "default");
      const remembered = rememberedCounts.get(key);
      if (remembered === undefined)
        throw new Error(`no remembered count exists for ${JSON.stringify(key)}`);
      const deadline = Date.now() + Number(step.timeout || 45_000);
      let actual = -1;
      while (Date.now() < deadline) {
        actual = await page.locator(step.selector).count();
        if (actual < remembered) break;
        await page.waitForTimeout(250);
      }
      if (actual >= remembered)
        throw new Error(
          `expected ${step.selector} count below remembered ${remembered} before timeout, found ${actual}`,
        );
      break;
    }
    case "waitTextNot": {
      const target = locate(step);
      const forbidden = String(step.text);
      const deadline = Date.now() + Number(step.timeout || 45_000);
      let actual = "";
      while (Date.now() < deadline) {
        actual = await target.innerText().catch(() => "");
        if (actual !== "" && !actual.includes(forbidden)) break;
        await page.waitForTimeout(250);
      }
      if (actual === "" || actual.includes(forbidden))
        throw new Error(
          `expected text without ${JSON.stringify(forbidden)} before timeout, found ${JSON.stringify(actual)}`,
        );
      break;
    }
    case "screenshot":
      return await capture(step, false);
    case "walkthroughFrame":
      if (!step.walkthroughId)
        throw new Error("walkthroughFrame needs walkthroughId");
      return await capture(step, true);
    default:
      throw new Error(`unknown plan action: ${String(step.action)}`);
  }
}

async function runPlan(path) {
  const text = await readFile(resolve(REPO, path), "utf8");
  const trimmed = text.trim();
  const steps = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : trimmed
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => JSON.parse(line));
  if (!Array.isArray(steps))
    throw new Error("capture plan must be a JSON array or JSONL objects");
  for (const [index, step] of steps.entries()) {
    const progress = `plan step ${index + 1}/${steps.length}: ${step.action}${step.name ? ` ${step.name}` : ""}`;
    out(progress);
    await mkdir(SHOTS, { recursive: true });
    await appendFile(join(SHOTS, "progress.log"), `${new Date().toISOString()} ${progress}\n`, "utf8");
    try {
      await executeAction(step);
    } catch (error) {
      throw new Error(
        `plan step ${index + 1}/${steps.length} (${step.action}${step.name ? ` ${step.name}` : ""}) failed: ${String(error).replace(/\s*\r?\n\s*/gu, " | ")}`,
      );
    }
  }
  await mkdir(SHOTS, { recursive: true });
  await writeFile(
    join(SHOTS, "manifest.json"),
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        commit: CAPTURE_COMMIT,
        actionCount: steps.length,
        uiOnly: UI_ONLY,
        interaction: UI_ONLY
          ? "Lowlevel MCP background input; CDP read-only assertions"
          : "Playwright actions",
        captures: captureLedger,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  out(`plan complete: ${steps.length} actions`);
}

/** Buttons of the open dialog if there is one, otherwise the whole page. */
const buttonScope = () =>
  page
    .locator(".v-overlay--active")
    .count()
    .then((n) => (n ? ".v-overlay--active button" : "button"));

const commands = {
  url: async () => out(page.url()),
  ss: async (name) => {
    await mkdir(SHOTS, { recursive: true });
    const file = join(SHOTS, `${name || "shot"}.png`);
    await page.screenshot({ path: file });
    out(file);
  },
  ssclip: async (name, ...sel) =>
    out(await capture({ action: "screenshot", name, selector: sel.join(" ") })),
  fill: async (selector, ...value) =>
    executeAction({ action: "fill", selector, value: value.join(" ") }),
  press: async (selector, key) =>
    executeAction({ action: "press", selector, key }),
  rightclick: async (...sel) =>
    executeAction({
      action: "click",
      selector: sel.join(" "),
      button: "right",
    }),
  wait: async (...sel) =>
    executeAction({ action: "wait", selector: sel.join(" ") }),
  viewport: async (width, height) =>
    executeAction({ action: "viewport", width, height }),
  zoom: async (factor) => executeAction({ action: "zoom", factor }),
  plan: async (...path) => {
    await runPlan(path.join(" "));
    if (process.env.WORLDLENS_PLAN_EXIT === "1") {
      await browser.close();
      out("detached after plan");
      process.exit(0);
    }
  },
  // The rail is this app's own component, not a Vuetify navigation drawer: the labels
  // are `.wl-rail-label`, and `.v-navigation-drawer .v-list-item-title` matches nothing.
  rail: async () =>
    out(JSON.stringify(await page.locator(".wl-rail-label").allInnerTexts())),
  nav: async (...label) => {
    const locator = page
      .locator(".wl-rail-item", { hasText: label.join(" ") })
      .first();
    if (UI_ONLY) await lowlevelClick(locator);
    else await locator.click();
    await settle();
    out("navigated");
  },
  buttons: async () =>
    out(
      JSON.stringify(
        (await page.locator(await buttonScope()).allInnerTexts())
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ),
  text: async (...sel) =>
    out(JSON.stringify(await page.locator(sel.join(" ")).first().innerText())),
  count: async (...sel) =>
    out(String(await page.locator(sel.join(" ")).count())),
  click: async (...sel) => {
    const locator = page.locator(sel.join(" ")).first();
    if (UI_ONLY) await lowlevelClick(locator);
    else await locator.click();
    await settle();
    out("clicked");
  },
  // A fresh profile always opens on the 4-step first-run dialog, and it is modal: the
  // navigation rail is behind it, so `nav` times out until this has run. ACCEPT is the
  // user's explicit standing choice for Worldlens verification runs.
  onboard: async () => {
    const steps = ["NEXT", "NEXT", "ACCEPT", "FINISH SETUP"];
    if ((await page.locator(".v-overlay--active").count()) === 0)
      return out("no dialog open");
    for (const label of steps) {
      const locator = page
        .locator(`.v-overlay--active button:has-text("${label}")`)
        .first();
      if (UI_ONLY) await lowlevelClick(locator);
      else await locator.click();
      await settle();
    }
    out(
      `onboarded (accepted download consent); dialogs open: ${await page.locator(".v-overlay--active").count()}`,
    );
  },
  eval: async (...js) =>
    out(JSON.stringify((await page.evaluate(js.join(" "))) ?? null)),
  detach: async () => {
    await browser.close();
    out("detached");
    process.exit(0);
  },
};

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  if (line.trim().startsWith("{")) {
    try {
      await executeAction(JSON.parse(line));
      out("action complete");
    } catch (e) {
      bad(String(e).split("\n")[0]);
    }
    continue;
  }
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) continue;
  const fn = commands[cmd];
  if (!fn) {
    bad(`unknown command: ${cmd}`);
    continue;
  }
  try {
    await fn(...args);
  } catch (e) {
    bad(String(e).split("\n")[0]);
    if (cmd === "plan" && process.env.WORLDLENS_PLAN_EXIT === "1") {
      await browser.close().catch(() => undefined);
      process.exit(1);
    }
  }
}
