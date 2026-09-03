#!/usr/bin/env node

/**
 * Executable built-artifact smoke driver for the approved hidden Win32 route.
 *
 * The app is launched directly on a named hidden desktop through the installed
 * lowlevel-computer-use-cheap executable. Playwright is used only as a read-only
 * CDP locator surface. Clicks, typing, key presses, native screenshots, and window
 * enumeration use Lowlevel so the visible desktop remains untouched.
 *
 * No final run is possible until the matrix says ready and the caller supplies a
 * full commit plus artifact provenance. --plan-only validates without launching.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { duplicateCaptureComplaints, validateMatrix } from "./ui-smoke-matrix.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.env.LOWLEVEL_CHEAP_CLI || resolve(root, "../lowlevel-computer-use-mcp/.venv/Scripts/lowlevel-computer-use-cheap.exe");

function fail(message) { throw new Error(`ui-smoke-driver: ${message}`); }
function parse(argv) {
  const args = { matrix: resolve(root, "docs/ui-smoke/smoke-matrix.json"), planOnly: false, execute: false, plan: null, manifest: resolve(root, "docs/ui-smoke/capture-manifest.json") };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--plan-only") args.planOnly = true;
    else if (v === "--execute") args.execute = true;
    else if (v === "--matrix") args.matrix = resolve(argv[++i]);
    else if (v === "--plan") args.plan = resolve(argv[++i]);
    else if (v === "--manifest") args.manifest = resolve(argv[++i]);
    else if (v === "--built-artifact") args.artifact = resolve(argv[++i]);
    else if (v === "--artifact-sha256") args.artifactSha256 = argv[++i];
    else if (v === "--commit") args.commit = argv[++i];
    else if (v === "--profile") args.profile = resolve(argv[++i]);
    else if (v === "--desktop") args.desktop = argv[++i];
    else if (v === "--port") args.port = Number(argv[++i]);
    else if (v === "--keep-open") args.keepOpen = true;
    else fail(`unknown argument ${v}`);
  }
  return args;
}
function lowlevel(tool, params) {
  if (!existsSync(cli)) fail(`Cheap Version CLI is missing at ${cli}`);
  const raw = execFileSync(cli, [tool, "--json", JSON.stringify(params ?? {})], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const value = JSON.parse(raw);
  if (value.ok !== true) fail(`${tool} failed: ${value.error || "unknown error"}`);
  return value;
}
function hashFile(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolvePort(port)); });
  });
}
async function waitFor(url, predicate, timeout = 45_000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2_000) }); last = await response.json(); if (predicate(last)) return last; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  fail(`timed out waiting for ${url}, last value ${JSON.stringify(last)}`);
}
function parsePlan(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(value) ? value : value.steps;
}
function locator(page, step) {
  if (step.role) return page.getByRole(step.role, { name: step.name, exact: step.exact === true }).nth(step.nth ?? 0);
  if (!step.selector) fail(`${step.id || "action"}: selector or role is required`);
  return page.locator(step.selector).nth(step.nth ?? 0);
}
async function surfaceFocus(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return { tag: active?.tagName || null, id: active?.id || null, testid: active?.getAttribute?.("data-testid") || null, aria: active?.getAttribute?.("aria-label") || null, text: active?.textContent?.trim().slice(0, 160) || null };
  });
}
function matrixCapture(matrix, rowId) {
  const row = matrix.rows.find((candidate) => candidate.id === rowId);
  if (!row) fail(`action references unknown matrix row ${rowId}`);
  return row;
}

async function run(argv) {
  const args = parse(argv);
  const matrix = JSON.parse(readFileSync(args.matrix, "utf8"));
  const summary = validateMatrix(matrix);
  if (!args.execute || args.planOnly) {
    console.log(`ui-smoke-driver: plan-only, ${summary.rowCount} rows, ${summary.routeCount} required routes`);
    return;
  }
  if (matrix.execution.finalSmoke !== "ready") fail("matrix finalSmoke is not ready; integrated artifact execution is still pending");
  const require = createRequire(join(root, "design/packages/app/package.json"));
  const { chromium } = require("@playwright/test");
  for (const key of ["artifact", "artifactSha256", "commit", "profile", "desktop", "plan", "manifest"]) if (!args[key]) fail(`--${key} is required for --execute`);
  if (!existsSync(args.artifact)) fail(`built artifact is missing: ${args.artifact}`);
  const artifactSha256 = hashFile(args.artifact);
  if (!/^[0-9a-f]{64}$/u.test(args.artifactSha256) || artifactSha256 !== args.artifactSha256.toLowerCase()) fail(`built artifact SHA-256 mismatch, measured ${artifactSha256}`);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/u.test(args.commit) || head !== args.commit) fail(`provenance commit ${args.commit} is not the current integrated checkout ${head}`);
  const profile = resolve(args.profile);
  const temp = resolve(tmpdir());
  if (!profile.toLowerCase().startsWith(`${temp.toLowerCase()}\\`)) fail("profile must be inside the temporary directory");
  if (existsSync(profile) && readdirSync(profile).length > 0) fail("profile must be fresh and empty");
  mkdirSync(profile, { recursive: true });
  const port = args.port || await freePort();
  const desktop = args.desktop;
  let appPid = null;
  let browser = null;
  let page = null;
  let hwnd = null;
  let hwndClass = null;
  let windowTitle = null;
  let target = null;
  let targetWs = null;
  const consoleErrors = [];
  const pageErrors = [];
  const captures = [];
  const startedAt = new Date().toISOString();
  const outputRoot = dirname(args.manifest);
  mkdirSync(outputRoot, { recursive: true });
  try {
    lowlevel("create_headless_desktop", { name: desktop });
    const command = `"${args.artifact}" --no-sandbox --disable-gpu --force-prefers-reduced-motion --remote-debugging-port=${port} --worldlens-direct-launch --user-data-dir="${profile}"`;
    const launched = lowlevel("launch_on_headless_desktop", { name: desktop, command });
    appPid = Number(launched.pid);
    target = await waitFor(`http://127.0.0.1:${port}/json/list`, (targets) => Array.isArray(targets) && targets.length === 1 && targets[0].type === "page" && typeof targets[0].webSocketDebuggerUrl === "string" && targets[0].webSocketDebuggerUrl.length > 0);
    const targetUrl = new URL(target[0].url);
    if (!/^(127\.0\.0\.1|localhost|\[::1\])$/u.test(targetUrl.hostname)) fail(`CDP target is not loopback: ${target[0].url}`);
    targetWs = target[0].webSocketDebuggerUrl;
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const pages = browser.contexts().flatMap((context) => context.pages());
    if (pages.length !== 1) fail(`Playwright exposed ${pages.length} page targets, expected exactly one`);
    page = pages[0];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 512)); });
    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error).slice(0, 512)));
    const windows = lowlevel("list_headless_windows", { name: desktop }).windows || [];
    const candidates = windows.filter((window) => window.class === "Chrome_WidgetWin_1" && window.title && window.width > 0 && window.height > 0);
    if (candidates.length !== 1) fail(`expected one visible application HWND, found ${candidates.length}`);
    hwnd = Number(candidates[0].handle); hwndClass = candidates[0].class; windowTitle = candidates[0].title;
    const children = lowlevel("list_child_windows", { hwnd }).children || [];
    const renderer = children.filter((child) => child.class === "Chrome_RenderWidgetHostHWND" && child.visible && child.width > 0 && child.height > 0);
    if (renderer.length !== 1) fail(`expected one visible renderer child HWND, found ${renderer.length}`);
    const steps = parsePlan(args.plan);
    if (!Array.isArray(steps) || steps.length === 0) fail("action plan must contain at least one step");
    const click = async (step) => { const targetLocator = locator(page, step); await targetLocator.waitFor({ state: "visible", timeout: step.timeout || 45_000 }); const box = await targetLocator.boundingBox(); if (!box) fail(`${step.id}: target has no bounding box`); lowlevel("mouse_click", { hwnd, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), button: step.button || "left", clicks: 1 }); await page.waitForTimeout(250); };
    const capture = async (step, kind = "primary") => {
      const row = matrixCapture(matrix, step.rowId);
      const path = kind === "primary" ? resolve(root, row.capture.path) : resolve(root, "docs/screenshots/ui-smoke/failures", `${step.rowId}-${Date.now()}.png`);
      mkdirSync(dirname(path), { recursive: true });
      const shot = lowlevel("screenshot", { hwnd });
      copyFileSync(shot.path, path);
      const bytes = readFileSync(path);
      captures.push({ captureId: `${step.rowId}:${kind}:${captures.length}`, rowId: step.rowId, kind, path: path.replace(`${root}\\`, "").replaceAll("\\", "/"), action: step.action || "capture", commit: args.commit, artifact: args.artifact, artifactSha256, profile, desktop, targetCount: 1, targetType: "page", targetUrl: target[0].url, websocketDebuggerUrl: targetWs, windowIdentity: { hwnd, class: hwndClass, title: windowTitle }, tuple: { theme: row.theme, viewport: row.viewport, scale: row.scale, state: row.state }, opener: step.opener || null, focusOwner: await surfaceFocus(page), actionRelation: kind === "primary" ? "immediate-after-action" : "failure-preservation", screenshotSha256: createHash("sha256").update(bytes).digest("hex"), capturedAt: new Date().toISOString() });
    };
    for (const step of steps) {
      try {
        if (!step.action || !step.id) fail("each action needs id and action");
        if (step.action === "wait") await locator(page, step).waitFor({ state: "visible", timeout: step.timeout || 45_000 });
        else if (step.action === "click") await click(step);
        else if (step.action === "fill") { await click(step); const child = renderer[0].handle; lowlevel("win_send_keys", { hwnd: child, keys: ["ctrl", "a"] }); lowlevel("type_text", { hwnd: child, text: String(step.value) }); await page.waitForTimeout(250); }
        else if (step.action === "press") { lowlevel("win_send_keys", { hwnd: renderer[0].handle, keys: [String(step.key)] }); await page.waitForTimeout(250); }
        else if (step.action === "assertText") { const text = await locator(page, step).innerText(); if (!text.includes(String(step.text))) fail(`${step.id}: expected text not found`); }
        else if (step.action === "capture") await capture(step);
        else if (step.action === "sleep") await page.waitForTimeout(Number(step.ms || 250));
        else if (step.action === "viewport") await page.setViewportSize({ width: Number(step.width), height: Number(step.height) });
        else if (step.action === "zoom") await page.evaluate((factor) => { document.documentElement.style.zoom = String(factor); }, Number(step.factor));
        else fail(`${step.id}: unsupported action ${step.action}`);
        if (step.captureAfter) await capture({ ...step, action: `${step.action}:after` });
        if (consoleErrors.length || pageErrors.length) fail(`${step.id}: renderer errors observed`);
      } catch (error) {
        try { await capture({ ...step, action: `${step.action}:failure` }, "failure"); } catch {}
        throw error;
      }
    }
  } finally {
    const manifest = { schemaVersion: 1, status: captures.length === 0 ? "failed" : "captured", commit: args.commit, artifact: args.artifact, artifactSha256, profile, desktop, driver: matrix.execution.driver, startedAt, finishedAt: new Date().toISOString(), windowIdentity: hwnd ? { hwnd, class: hwndClass, title: windowTitle } : null, target: target ? { count: 1, type: "page", url: target[0].url, websocketDebuggerUrl: targetWs } : null, consoleErrors, pageErrors, captures };
    writeFileSync(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (browser) await browser.close().catch(() => undefined);
    if (appPid) { try { lowlevel("kill_process", { pid: appPid, force: true }); } catch {} }
    try { lowlevel("close_headless_desktop", { name: desktop }); } catch {}
    if (!args.keepOpen) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
  }
  if (consoleErrors.length || pageErrors.length) fail(`renderer errors were captured, console=${consoleErrors.length}, page=${pageErrors.length}`);
  if (duplicateCaptureComplaints({ captures }).length) fail("duplicate screenshot hashes detected");
  console.log(`ui-smoke-driver: captured ${captures.length} states on hidden desktop ${desktop}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(process.argv.slice(2)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
