#!/usr/bin/env node
// Attach only to an isolated browser already launched by the hidden-desktop tooling.
// This focused cascade regression uses the real styles, not jsdom's hit testing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const appRequire = createRequire(
  new URL("../design/packages/app/package.json", import.meta.url),
);
const uiRequire = createRequire(
  new URL("../design/packages/ui/package.json", import.meta.url),
);
const { chromium } = appRequire("@playwright/test");
const { compileString } = uiRequire("sass-embedded");
const { parse, compileStyle } = uiRequire("vue/compiler-sfc");
const port = Number(process.argv[2]);
assert(
  Number.isInteger(port) && port > 1024 && port < 65536,
  "Supply the owned CDP port",
);
const endpoint = `http://127.0.0.1:${port}`;
const targets = await (
  await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) })
).json();
assert.equal(targets.length, 1, "Exactly one isolated page target is required");
assert.equal(targets[0].type, "page");
assert(
  ["about:blank", "edge://newtab/"].includes(targets[0].url),
  "Only the owned empty startup page is permitted",
);

const globalCss = compileString(
  readFileSync(
    new URL("../design/packages/ui/src/styles/global.scss", import.meta.url),
    "utf8",
  ),
).css;
const component = parse(
  readFileSync(
    new URL(
      "../design/packages/ui/src/components/vocabulary/VocabularyWindowDrop.vue",
      import.meta.url,
    ),
    "utf8",
  ),
);
const scoped = compileStyle({
  source: component.descriptor.styles[0].content,
  id: "data-v-feedback-test",
  scoped: true,
});
assert.deepEqual(scoped.errors, []);
const exception =
  /#app \.v-application__wrap > \.mb-vocabulary-feedback\s*\{\s*pointer-events:\s*none;\s*\}/;
assert.match(
  globalCss,
  exception,
  "The feedback exception must ship in the global stylesheet",
);
const browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 });
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  assert.equal(pages.length, 1);
  const page = pages[0];
  page.setDefaultTimeout(5000);
  await page.goto("about:blank");
  await page.setContent(`<style>${scoped.code}</style><style id="global">${globalCss}</style>
      <div id="app"><div class="v-application__wrap">
        <button style="position:fixed;inset:0;width:100%;height:100%" onclick="this.dataset.clicks=String(Number(this.dataset.clicks||0)+1)">Underlying action</button>
        <div class="mb-vocabulary-feedback" data-v-feedback-test role="status" aria-live="polite"></div>
      </div></div>`);
  const feedback = page.locator(".mb-vocabulary-feedback");
  const button = page.getByRole("button", { name: "Underlying action" });
  // Prove this check detects the original cascade, then restore the shipping rules.
  await page.locator("#global").evaluate(
    (element, css) => {
      element.textContent = css;
    },
    globalCss.replace(exception, ""),
  );
  assert.equal(
    await feedback.evaluate(
      (element) => getComputedStyle(element).pointerEvents,
    ),
    "auto",
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.className,
    ),
    "mb-vocabulary-feedback",
  );
  await page.locator("#global").evaluate((element, css) => {
    element.textContent = css;
  }, globalCss);
  for (const state of ["empty", "celebrating", "dismissed"]) {
    await feedback.evaluate((element, active) => {
      element.innerHTML = active
        ? '<div class="mb-vocabulary-feedback__headline" data-v-feedback-test>Personal wording applied</div>'
        : "";
    }, state === "celebrating");
    assert.equal(
      await feedback.evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
      "none",
      state,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.tagName,
      ),
      "BUTTON",
      state,
    );
    await button.click({
      position: {
        x: await page.evaluate(() => innerWidth / 2),
        y: await page.evaluate(() => innerHeight / 2),
      },
    });
  }
  assert.equal(await button.getAttribute("data-clicks"), "3");
  console.log(
    "PASS: original overlay blocks input; empty, celebrating and dismissed feedback all pass pointer clicks after the fix.",
  );
} finally {
  await browser.close();
}
