#!/usr/bin/env node
/**
 * capture-linux-cdp-proofs.mjs - the three layout proofs the README shows beside its dated
 * evidence, retaken from the running packaged Worldlens over the Chrome DevTools Protocol.
 *
 * Launch the packaged Linux build first on a fresh profile with
 * `scripts/launch-worldlens-linux.sh <port> <profile> <log>`, then run this with
 * WORLDLENS_CAPTURE_COMMIT set and an output directory as the one argument. It writes
 * `<name>-<commit8>.png` for the first-run caption (English, dark), the bilingual light Home
 * caption, and the adopt-an-existing-container discovery, each at 800x600 CSS pixels and
 * scale 2 through CDP's device-metrics emulation, plus `receipts.json` with every digest and
 * time. The theme is chosen through the real Display settings row, as the capture matrix does.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const S = process.argv[2] ?? process.cwd();
const PORT = process.env.WORLDLENS_CDP_PORT ?? "9333";
const COMMIT = process.env.WORLDLENS_CAPTURE_COMMIT ?? "";
if (!/^[0-9a-f]{40}$/u.test(COMMIT))
  throw new Error(
    "WORLDLENS_CAPTURE_COMMIT must be the exact lowercase commit",
  );
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = browser.contexts().flatMap((c) => c.pages())[0];
const cdp = await page.context().newCDPSession(page);
const receipts = {
  commit: COMMIT,
  route:
    "Playwright CDP attached to the exact packaged Worldlens (electron-builder linux-unpacked of this commit) launched under Xvfb on a Linux container with the committed launcher's switches on a fresh profile; device metrics emulated through CDP Emulation.setDeviceMetricsOverride and pixels taken with Page.captureScreenshot, so the PNG holds device pixels at the stated scale",
  errors: [],
  captures: [],
};
page.on("pageerror", (e) =>
  receipts.errors.push(String(e.message).slice(0, 160)),
);
async function metrics(w, h, scale) {
  await page.setViewportSize({ width: w, height: h });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await page.waitForTimeout(800);
}
async function shoot(name, note, w, h, scale, extra = {}) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const b = Buffer.from(data, "base64");
  const file = `${S}/${name}.png`;
  writeFileSync(file, b);
  receipts.captures.push({
    name,
    file: `${name}.png`,
    note,
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    cssViewport: `${w}x${h}`,
    scale,
    capturedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(b).digest("hex"),
    ...extra,
  });
  console.log("shot", name, b.readUInt32BE(16), "x", b.readUInt32BE(20));
}
const text = async () =>
  (await page.locator("body").innerText()).replace(/\s+/g, " ");
async function walkFirstRun() {
  for (
    let i = 0;
    i < 8 && (await page.locator(".v-overlay--active").count()) > 0;
    i += 1
  ) {
    const next = page
      .locator(".v-overlay--active button:visible")
      .filter({
        hasText:
          /Next|Continue|Decline|Finish|Accept|下一步|完成|接受|Finish setup/i,
      })
      .last();
    if ((await next.count()) === 0) break;
    await next.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}
await page.waitForSelector(".mb-app", { timeout: 30000 });
await page.waitForTimeout(1500);
// 1. Fresh profile, English dark, 800x600 at scale 2: caption above first-run setup.
await metrics(800, 600, 2);
await shoot(
  `front-provenance-${COMMIT.slice(0, 8)}`,
  "Fresh profile, English, dark: the version and update caption stays visible above first-run setup at the minimum window size",
  800,
  600,
  2,
  { theme: "dark", language: "en", state: "first-run-step-1" },
);
// 2. Finish setup, switch language to bilingual by its stored key, then choose the light theme through the Display settings row as the harness does.
await walkFirstRun();
await page.evaluate(() =>
  localStorage.setItem("worldlens.language.mode", "bilingual"),
);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".mb-app", { timeout: 30000 });
await page.waitForTimeout(1500);
await metrics(1280, 800, 1);
await page
  .locator(".wl-rail__footer")
  .getByRole("button", { name: /Settings|設定/i })
  .first()
  .click({ timeout: 10000 });
await page.waitForSelector(".mb-settings.mb-docked", {
  state: "visible",
  timeout: 20000,
});
await page
  .locator(".mb-settings.mb-docked")
  .getByText(/Display and ease of use|顯示/i)
  .first()
  .click({ timeout: 10000 })
  .catch((e) => console.log("display section:", e.message.slice(0, 80)));
await page.waitForTimeout(800);
const toggles = page.locator(
  ".mb-settings.mb-docked .mb-theme-row__toggle .v-btn",
);
await toggles.first().waitFor({ state: "visible", timeout: 15000 });
await toggles.nth(2).click({ timeout: 10000 });
await page.waitForTimeout(800);
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
const themeClass = await page.evaluate(() =>
  [...(document.querySelector(".v-application")?.classList ?? [])].find((c) =>
    c.startsWith("v-theme--"),
  ),
);
console.log("theme now:", themeClass);
await page
  .locator(".wl-rail")
  .getByRole("button", { name: /^Home|主頁/ })
  .first()
  .click({ timeout: 10000 })
  .catch(() => {});
await page.waitForTimeout(800);
await metrics(800, 600, 2);
await shoot(
  `front-date-language-${COMMIT.slice(0, 8)}`,
  "Bilingual language mode, light theme, Home at the minimum window size: the caption carries the English and Cantonese update dates for the same recorded build event",
  800,
  600,
  2,
  { theme: themeClass, language: "bilingual", state: "home" },
);
// 3. Adoption discovery with Docker's daemon unreachable, English dark again via the same row (toggle 1 = dark).
await metrics(1280, 800, 1);
await page
  .locator(".wl-rail__footer")
  .getByRole("button", { name: /Settings|設定/i })
  .first()
  .click({ timeout: 10000 });
await page.waitForSelector(".mb-settings.mb-docked", {
  state: "visible",
  timeout: 20000,
});
await page
  .locator(".mb-settings.mb-docked")
  .getByText(/Display and ease of use|顯示/i)
  .first()
  .click({ timeout: 10000 })
  .catch(() => {});
await page.waitForTimeout(800);
await toggles.nth(1).click({ timeout: 10000 });
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.evaluate(() =>
  localStorage.setItem("worldlens.language.mode", "en"),
);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".mb-app", { timeout: 30000 });
await page.waitForTimeout(1500);
await metrics(800, 600, 2);
await page
  .locator(".wl-rail")
  .getByRole("button", { name: /Host Server/i })
  .first()
  .click({ timeout: 10000 });
await page.waitForTimeout(1500);
await page
  .getByRole("button", { name: /Adopt an existing container/i })
  .first()
  .click({ timeout: 10000 });
await page.waitForTimeout(6000);
await shoot(
  `adoption-unavailable-${COMMIT.slice(0, 8)}`,
  "Host Server, Adopt an existing container on this machine, where Docker 29.9.2 is installed and its daemon is not running: discovery reports the unreachable daemon; caption and actions stay visible at the minimum window size",
  800,
  600,
  2,
  {
    theme: "dark",
    language: "en",
    state: "adoption-discovery-daemon-unreachable",
  },
);
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
writeFileSync(`${S}/receipts.json`, JSON.stringify(receipts, null, 2));
console.log("errors:", receipts.errors.slice(0, 5));
await browser.close();
