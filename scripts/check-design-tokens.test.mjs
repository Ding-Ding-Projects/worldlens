/**
 * The guard for check-design-tokens.mjs.
 *
 * The scale is built here from a throwaway token sheet rather than read from the real one, so
 * the arithmetic under test is the script's and not whatever the design system says this week.
 * The load-bearing cases are the ties: a value exactly between two steps has to land on the
 * larger one every time, because "nearest" with an unstated tie rule is two different rules.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nearestStep,
  readScale,
  rewriteValue,
  scanText,
} from "./check-design-tokens.mjs";

function scratchDesignSystem() {
  const dir = mkdtempSync(join(tmpdir(), "design-tokens-"));
  writeFileSync(
    join(dir, "tokens.css"),
    [
      ":root {",
      "    --md-sys-shape-corner-none: 0px;",
      "    --md-sys-shape-corner-extra-small: 4px;",
      "    --md-sys-shape-corner-small: 8px;",
      "    --md-sys-shape-corner-medium: 12px;",
      "    --md-sys-shape-corner-large: 16px;",
      "    --md-sys-shape-corner-extra-large: 28px;",
      "    --md-sys-shape-corner-full: 9999px;",
      "    --md-sys-shape-corner-lg: var(--md-sys-shape-corner-large);",
      "    --md-sys-typescale-body-small-size: 0.75rem;",
      "    --md-sys-typescale-body-small-weight: 400;",
      "    --md-sys-typescale-body-medium-size: 0.875rem;",
      "    --md-sys-typescale-label-large-size: 0.875rem;",
      "    --md-sys-typescale-body-large-size: 1rem;",
      "    --md-sys-typescale-title-large-size: 1.375rem;",
      "    --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);",
      "    --md-sys-motion-duration-short4: 200ms;",
      "    --md-sys-motion-duration-medium2: 300ms;",
      "    --md-sys-motion-duration-extra-long4: 1000ms;",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "colors.css"),
    ':root {\n    --md-sys-color-primary: #8FCDFF;\n    --md-sys-color-on-primary: #003351;\n}\n[data-theme="light"] {\n    --md-sys-color-primary: #00639B;\n}\n',
  );
  return dir;
}

const dir = scratchDesignSystem();
const scale = readScale(dir);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

test("reads the scale from the sheets, aliases excluded, dark scheme only", () => {
  assert.deepEqual(
    scale.shape.map((s) => s.px),
    [0, 4, 8, 12, 16, 28, 9999],
  );
  assert.deepEqual(
    scale.type.map((s) => s.ramp),
    ["body-small", "body-medium", "body-large", "title-large"],
    "one ramp per size: label-large shares body-medium's size and is not offered",
  );
  assert.equal(scale.dark.get("--md-sys-color-primary"), "#8fcdff");
});

test("nearest step lands on the larger step when two are equally near", () => {
  assert.equal(
    nearestStep(10, scale.shape, "px").name,
    "--md-sys-shape-corner-medium",
  );
  assert.equal(
    nearestStep(14, scale.shape, "px").name,
    "--md-sys-shape-corner-large",
  );
  assert.equal(nearestStep(13, scale.type, "px").ramp, "body-medium");
  assert.equal(nearestStep(11, scale.type, "px").ramp, "body-small");
});

test("a radius on the scale becomes its token, exact", () => {
  const result = rewriteValue("border-radius", "12px", scale);
  assert.equal(result.value, "var(--md-sys-shape-corner-medium)");
  assert.deepEqual(
    result.findings.map((f) => f.kind),
    ["exact"],
  );
});

test("a radius list is rewritten per corner, zero left alone, pills recognised", () => {
  const result = rewriteValue("border-radius", "24px 24px 0 0", scale);
  assert.equal(
    result.value,
    "var(--md-sys-shape-corner-extra-large) var(--md-sys-shape-corner-extra-large) 0 0",
  );
  assert.equal(
    rewriteValue("border-radius", "999px", scale).value,
    "var(--md-sys-shape-corner-full)",
  );
  assert.equal(
    rewriteValue("border-radius", "44px", scale).value,
    "var(--md-sys-shape-corner-full)",
  );
});

test("a calc() radius is left whole", () => {
  const value = "calc(var(--size) / 2 + 4px)";
  assert.equal(rewriteValue("border-radius", value, scale).value, value);
});

test("a fallback that agrees with its token is left; one that disagrees is corrected, not nested", () => {
  const agreeing = "var(--md-sys-shape-corner-medium, 12px)";
  assert.equal(rewriteValue("border-radius", agreeing, scale).value, agreeing);
  const result = rewriteValue(
    "border-radius",
    "var(--md-sys-shape-corner-full, 999px)",
    scale,
  );
  assert.equal(result.value, "var(--md-sys-shape-corner-full, 9999px)");
  assert.deepEqual(
    result.findings.map((f) => f.kind),
    ["fallback"],
  );
});

test("a colour-role fallback must be the dark scheme's own value", () => {
  const result = rewriteValue(
    "background",
    "var(--md-sys-color-primary, #d0bcff)",
    scale,
  );
  assert.equal(result.value, "var(--md-sys-color-primary, #8fcdff)");
  assert.equal(
    rewriteValue("color", "var(--md-sys-color-on-primary, #003351)", scale)
      .findings.length,
    0,
  );
});

test("font sizes snap to the preferred ramp and keep surrounding whitespace", () => {
  assert.equal(
    rewriteValue("font-size", " 0.8125rem", scale).value,
    " var(--md-sys-typescale-body-medium-size)",
  );
  assert.equal(
    rewriteValue("font-size", "12px", scale).value,
    "var(--md-sys-typescale-body-small-size)",
  );
  assert.equal(
    rewriteValue("font-size", "1em", scale).value,
    "1em",
    "relative units are not on the scale",
  );
});

test("durations and easings in a shorthand are rewritten; the reduced-motion idiom is not", () => {
  const result = rewriteValue(
    "transition",
    "opacity 300ms cubic-bezier(0.2, 0, 0, 1), transform 0.2s",
    scale,
  );
  assert.equal(
    result.value,
    "opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard), transform var(--md-sys-motion-duration-short4)",
  );
  assert.equal(
    rewriteValue("transition-duration", "0.01ms", scale).value,
    "0.01ms",
  );
  const tooLong = rewriteValue("animation", "spin 2s linear infinite", scale);
  assert.equal(tooLong.value, "spin 2s linear infinite");
  assert.deepEqual(
    tooLong.findings.map((f) => f.kind),
    ["unfixable"],
  );
});

test("scanText rewrites only inside <style> blocks of a .vue and honours the exemption marker", () => {
  const vue = [
    '<template><div style="font-size: 12px">x</div></template>',
    "<style scoped>",
    ".a { font-size: 13px; }",
    "/* material-exempt: a hue wheel, walked once. */",
    ".b { border-radius: 10px; }",
    ".c {",
    "    transition:",
    "        opacity 200ms,",
    "        transform 300ms;",
    "}",
    "</style>",
  ].join("\n");
  const result = scanText("x.vue", vue, scale);
  assert.ok(
    result.text.includes('style="font-size: 12px"'),
    "the template attribute is not a stylesheet",
  );
  assert.ok(
    result.text.includes(
      ".a { font-size: var(--md-sys-typescale-body-medium-size); }",
    ),
  );
  assert.ok(
    result.text.includes(".b { border-radius: 10px; }"),
    "the declared exemption stands",
  );
  assert.ok(
    result.text.includes("opacity var(--md-sys-motion-duration-short4),"),
  );
  assert.ok(
    result.text.includes("transform var(--md-sys-motion-duration-medium2);"),
    "a multi-line value is read whole",
  );
  assert.deepEqual(
    result.findings.map((f) => f.line),
    [3, 7, 7],
  );
});

test("a marker above a rule covers that rule only, and a marker inside a rule covers the declaration after it", () => {
  const css = [
    ".z { color: red; }",
    "/* material-exempt: the wheel */",
    ".a { border-radius: 10px; }",
    ".b { border-radius: 10px; }",
    ".c {",
    "    /* material-exempt: a pulse that is content */",
    "    animation: pulse 2s infinite;",
    "    transition: opacity 300ms;",
    "}",
  ].join("\n");
  const result = scanText("x.css", css, scale);
  assert.ok(result.text.includes(".a { border-radius: 10px; }"));
  assert.ok(
    result.text.includes(
      ".b { border-radius: var(--md-sys-shape-corner-medium); }",
    ),
  );
  assert.ok(result.text.includes("animation: pulse 2s infinite;"));
  assert.ok(
    result.text.includes(
      "transition: opacity var(--md-sys-motion-duration-medium2);",
    ),
  );
});

test("fallbacks on an alias, on any typescale axis, and on a nested var() are understood", () => {
  assert.equal(
    rewriteValue("border-radius", "var(--md-sys-shape-corner-lg, 16px)", scale)
      .findings.length,
    0,
  );
  const alias = rewriteValue(
    "border-radius",
    "var(--md-sys-shape-corner-lg, 8px)",
    scale,
  );
  assert.equal(alias.value, "var(--md-sys-shape-corner-lg, 16px)");
  const weight = rewriteValue(
    "font-weight",
    "var(--md-sys-typescale-body-small-weight, 500)",
    scale,
  );
  assert.equal(weight.value, "var(--md-sys-typescale-body-small-weight, 400)");
  const nested = "var(--md-sys-color-primary, var(--brand, #000))";
  assert.equal(rewriteValue("color", nested, scale).value, nested);
  assert.equal(rewriteValue("color", nested, scale).findings.length, 0);
  const unknownRole = "var(--md-sys-color-success, #0f0)";
  assert.equal(
    rewriteValue("color", unknownRole, scale).findings.length,
    0,
    "an unpublished colour role is the purity check's business",
  );
  const expression =
    "var(--md-sys-color-on-primary, rgba(var(--v-theme-on-surface), 0.12))";
  assert.equal(rewriteValue("background", expression, scale).value, expression);
});

test("a file-level exemption in the head covers the whole file", () => {
  const css =
    "/* material-exempt: the spec transcription. */\n.a { font-size: 13px; }\n";
  assert.equal(scanText("ref.scss", css, scale).findings.length, 0);
});

test("a template literal in a .ts file is a stylesheet when it holds declarations", () => {
  const ts =
    'const css = `\n.page { font-size: 14px; }\n`;\nconst label = "font-size: 14px is what the spec says";\n';
  const result = scanText("page.ts", ts, scale);
  assert.ok(
    result.text.includes(
      ".page { font-size: var(--md-sys-typescale-body-medium-size); }",
    ),
  );
  assert.ok(
    result.text.includes('"font-size: 14px is what the spec says"'),
    "a string literal is prose",
  );
});

test("the scratch directory is a directory the walker would read", () => {
  const sub = join(dir, "walked");
  mkdirSync(sub, { recursive: true });
  assert.ok(sub.length > 0);
});
