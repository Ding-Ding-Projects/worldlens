#!/usr/bin/env node
/**
 * check-design-tokens.mjs - every interface surface spends the design system's tokens for
 * shape, type and motion, and a fallback on a colour role is the role's real value.
 *
 * `docs/design-system.md` states the rule: nothing in a component hard-codes a corner radius,
 * a type size or a duration; a component that needs one names the token. For a long time
 * that was a sentence rather than a check, and the tree carried several hundred hand-typed
 * `font-size: 0.8125rem` and `border-radius: 12px` declarations that each looked fine on its
 * own. This script is the check. It reads the step values from the committed token sheet and
 * the colour sheet rather than carrying a table of its own, so the one place a value is
 * decided stays the one place.
 *
 * Modes:
 *
 *   node scripts/check-design-tokens.mjs            report every stray literal, exit 1 if any
 *   node scripts/check-design-tokens.mjs --list     the same, one line per finding
 *   node scripts/check-design-tokens.mjs --fix      rewrite each literal to its token
 *
 * What `--fix` does to a value that is not on the scale is the one judgement call here, and
 * it is made the same way every time: the nearest step, and the larger one when two are
 * equally near. A 13px label becomes `body-medium` (14px) rather than `body-small` (12px);
 * a 10px corner becomes `medium` (12px) rather than `small` (8px). Rounding up is the
 * accessible direction for type and the Material 3 direction for shape, and a rule applied
 * the same way everywhere beats a hundred individual opinions. Every snap is printed, so the
 * visual change is reviewed rather than discovered.
 *
 * A literal that is genuinely data rather than chrome is declared, in so many words, with a
 * `material-exempt: <reason>` comment above it or in the file's first 25 lines - the same
 * marker `check-webapp-parity.mjs` honours for colour, so one vocabulary covers both.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN_SYSTEM = join(repoRoot, "design/packages/design-system/src");

export const EXEMPT_MARKER = "material-exempt:";

/** Durations below this are the reduced-motion idiom (`0.01ms`, `1ms`), not motion. */
const MOTION_FLOOR_MS = 50;

/** A corner this large is a pill, whatever the number says. */
const PILL_FROM_PX = 32;

/**
 * Every surface the rule covers, each on its own.
 *
 * The design system package is not a surface: it is where the values are declared. The
 * marker sheet re-declares a handful of token values for the raw-DOM marker layer and the
 * M3 reference sheet in md3-check is a hand transcription of the spec, so both must keep
 * their literals; everything else names a token.
 */
export const SURFACES = [
  {
    id: "desktop interface",
    dir: "design/packages/ui/src",
    skip: [
      /tokens\.css$/,
      /\/styles\/markers\.scss$/,
      /generated/,
      /\.test\.ts$/,
    ],
  },
  {
    id: "documentation site",
    dir: "design/packages/site/src",
    skip: [
      /tokens\.css$/,
      /\/theme\/generated\//,
      /\/dimsum\/generated\//,
      /\.test\.ts$/,
    ],
  },
  { id: "wharf", dir: "design/packages/wharf/src", skip: [/\.test\.ts$/] },
  {
    id: "md3-check instrument",
    dir: "design/packages/md3-check/src",
    skip: [/m3Reference\.scss$/, /\.test\.ts$/],
  },
  {
    id: "kid-check instrument",
    dir: "design/packages/kid-check/src",
    skip: [/\.test\.ts$/],
  },
  {
    id: "render page",
    dir: "design/packages/render-actions/src/pages",
    skip: [/\.test\.ts$/],
  },
];

const SOURCE_EXTENSIONS = new Set([
  ".vue",
  ".css",
  ".scss",
  ".html",
  ".ts",
  ".js",
  ".mjs",
]);

/** Walks a directory, dependency-free, returning every file with a source extension. */
export function walk(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      found.push(...walk(path));
    } else if (SOURCE_EXTENSIONS.has(extname(name))) {
      found.push(path);
    }
  }
  return found.sort();
}

/**
 * The scale, read from the committed sheets.
 *
 * Shape and motion come from `tokens.css`; type from the `-size` axis of each ramp; the dark
 * scheme from the generated `colors.css`. Reading the sheet rather than typing the numbers
 * here means retuning a token retunes the check.
 */
export function readScale(designSystemDir = DESIGN_SYSTEM) {
  const tokens = readFileSync(join(designSystemDir, "tokens.css"), "utf8");
  const colors = readFileSync(join(designSystemDir, "colors.css"), "utf8");
  const declarations = (text, prefix) => {
    const out = [];
    const pattern = new RegExp(`^\\s*(${prefix}[a-z0-9-]+):\\s*([^;]+);`, "gm");
    for (const match of text.matchAll(pattern))
      out.push([match[1], match[2].trim()]);
    return out;
  };
  const px = (value) => {
    const match = /^(-?[\d.]+)(px|rem)$/.exec(value);
    if (!match) return null;
    return match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
  };

  const shape = [];
  const shapeDeclarations = declarations(tokens, "--md-sys-shape-corner-");
  for (const [name, value] of shapeDeclarations) {
    if (value.startsWith("var(")) continue; // the short aliases, resolved below
    shape.push({ name, px: px(value), value });
  }
  // The short aliases (`-lg` for `-large`) are real tokens a fallback may name; they carry
  // their target's value so a fallback on either spelling is checked against one number.
  const aliases = [];
  for (const [name, value] of shapeDeclarations) {
    const target = /^var\((--md-sys-shape-corner-[a-z-]+)\)$/.exec(value)?.[1];
    const resolved = shape.find((step) => step.name === target);
    if (resolved)
      aliases.push({
        name,
        px: resolved.px,
        value: resolved.value,
        alias: true,
      });
  }
  // Every typescale token on every axis, for checking a fallback; the preferred ramps for
  // choosing a token come next.
  const typeAll = new Map();
  for (const [name, value] of declarations(tokens, "--md-sys-typescale-"))
    typeAll.set(name, value);

  // One ramp per size: body for text sizes, title-large, headline and display above. Two
  // ramps share several sizes (label-large and body-medium are both 0.875rem); a literal
  // carries no information about which was meant, so the choice is made once, here, and
  // the same way for every file.
  const preferredRamps = [
    "label-small",
    "body-small",
    "body-medium",
    "body-large",
    "title-large",
    "headline-small",
    "headline-medium",
    "headline-large",
    "display-small",
    "display-medium",
    "display-large",
  ];
  const type = [];
  for (const [name, value] of declarations(tokens, "--md-sys-typescale-")) {
    const ramp = /^--md-sys-typescale-([a-z]+-[a-z]+)-size$/.exec(name)?.[1];
    if (!ramp || !preferredRamps.includes(ramp)) continue;
    type.push({ name, px: px(value), value, ramp });
  }

  const duration = [];
  const easing = [];
  for (const [name, value] of declarations(tokens, "--md-sys-motion-")) {
    if (name.startsWith("--md-sys-motion-duration-")) {
      duration.push({ name, ms: Number(value.replace(/ms$/, "")), value });
    } else if (name.startsWith("--md-sys-motion-easing-")) {
      easing.push({ name, value: value.replace(/\s+/g, "") });
    }
  }

  const darkBlockEnd = colors.indexOf("}");
  const dark = new Map();
  for (const [name, value] of declarations(
    colors.slice(0, darkBlockEnd),
    "--md-sys-color-",
  )) {
    dark.set(name, value.toLowerCase());
  }

  return { shape, aliases, type, typeAll, duration, easing, dark };
}

/** Nearest step by absolute distance; the larger step on a tie. */
export function nearestStep(target, steps, key) {
  let best = null;
  for (const step of steps) {
    const distance = Math.abs(step[key] - target);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && step[key] > best.step[key])
    ) {
      best = { step, distance };
    }
  }
  return best?.step ?? null;
}

function toPx(number, unit) {
  return unit === "rem" ? number * 16 : number;
}

/**
 * Rewrites one declaration value, returning the new value and the findings it produced.
 *
 * Every finding carries `exact` (the literal was already a step), `snapped` (it was moved to
 * the nearest one) or `fallback` (a `var(token, literal)` whose literal disagrees with the
 * token), so a reviewer can tell a mechanical rewrite from a visual change.
 */
export function rewriteValue(property, value, scale) {
  const findings = [];
  let next = value;

  // A literal inside a `var(..., <fallback>)` is the token's safety net, not a value chosen
  // instead of the token; it is checked for agreement below, never rewritten into a nested
  // var(). The spans are found with a paren count, because a fallback can itself be a call.
  const varSpans = (text) => {
    const spans = [];
    const pattern = /var\(/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let depth = 0;
      for (let i = match.index + 3; i < text.length; i += 1) {
        if (text[i] === "(") depth += 1;
        else if (text[i] === ")") {
          depth -= 1;
          if (depth === 0) {
            spans.push([match.index, i + 1]);
            break;
          }
        }
      }
    }
    return spans;
  };
  const replaceLiterals = (pattern, resolveToken) => {
    const spans = varSpans(next);
    next = next.replace(pattern, (whole, ...groups) => {
      const offset = groups[groups.length - 2];
      if (spans.some(([from, to]) => offset >= from && offset < to))
        return whole;
      const resolved = resolveToken(whole, groups);
      if (!resolved) return whole;
      findings.push(resolved.finding);
      return resolved.replacement;
    });
  };

  if (/^border-(?:[a-z]+-)?radius$/.test(property)) {
    // A calc() is somebody else's arithmetic; leave it whole.
    if (/calc\(/.test(value)) return { value, findings };
    replaceLiterals(
      /(?<![\w.-])(\d*\.?\d+)(px|rem)\b/g,
      (whole, [number, unit]) => {
        const px = toPx(Number(number), unit);
        if (px === 0) return null;
        const step =
          px >= PILL_FROM_PX
            ? scale.shape.find((s) => s.name.endsWith("-full"))
            : nearestStep(
                px,
                scale.shape.filter((s) => s.px !== null && s.px < PILL_FROM_PX),
                "px",
              );
        if (!step) return null;
        const exact =
          step.px === px || (px >= PILL_FROM_PX && step.name.endsWith("-full"));
        return {
          replacement: `var(${step.name})`,
          finding: {
            kind: exact ? "exact" : "snapped",
            from: whole,
            to: step.name,
          },
        };
      },
    );
    return checkFallback(next, null, null, findings, scale);
  } else if (property === "font-size") {
    if (/^(?:var|calc|clamp|min|max)\(/.test(value.trim())) {
      // A var() with a fallback still has to carry the token's own value.
      return checkFallback(value, scale.type, "value", findings, scale);
    }
    replaceLiterals(
      /^(\s*)(\d*\.?\d+)(px|rem)(\s*)$/g,
      (whole, [lead, number, unit, trail]) => {
        const px = toPx(Number(number), unit);
        const step = nearestStep(px, scale.type, "px");
        if (!step) return null;
        return {
          replacement: `${lead}var(${step.name})${trail}`,
          finding: {
            kind: step.px === px ? "exact" : "snapped",
            from: whole.trim(),
            to: step.name,
          },
        };
      },
    );
  } else if (/^(?:transition|animation)(?:-duration|-delay)?$/.test(property)) {
    replaceLiterals(
      /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g,
      (whole, [number, unit]) => {
        const ms = unit === "s" ? Number(number) * 1000 : Number(number);
        if (ms < MOTION_FLOOR_MS) return null;
        const longest = Math.max(...scale.duration.map((d) => d.ms));
        if (ms > longest) {
          findings.push({
            kind: "unfixable",
            from: whole,
            to: `longer than ${String(longest)}ms`,
          });
          return null;
        }
        const step = nearestStep(ms, scale.duration, "ms");
        return {
          replacement: `var(${step.name})`,
          finding: {
            kind: step.ms === ms ? "exact" : "snapped",
            from: whole,
            to: step.name,
          },
        };
      },
    );
    replaceLiterals(/cubic-bezier\([^)]*\)/g, (whole) => {
      const compact = whole.replace(/\s+/g, "");
      const step = scale.easing.find((e) => e.value === compact);
      if (!step) return null;
      return {
        replacement: `var(${step.name})`,
        finding: { kind: "exact", from: whole, to: step.name },
      };
    });
    return checkFallback(next, null, null, findings, scale);
  } else {
    // Any property may carry a colour-role fallback.
    return checkFallback(value, null, null, findings, scale);
  }

  return { value: next, findings };
}

/**
 * `var(--md-sys-<x>, <literal>)` is still deferring to the token, but the literal is what
 * renders when the sheet has not applied, so it has to be the token's own value. The hosted
 * sign-in prompt was painting Material's baseline purple for exactly this reason: every
 * fallback in it was copied from the spec's example palette rather than from this product.
 *
 * A fallback that is itself a `var()` is deferring twice and is left alone, and a colour role
 * the design system does not publish is the purity check's business rather than this one's.
 */
function checkFallback(value, steps, axis, findings, scale) {
  let next = "";
  let cursor = 0;
  const pattern =
    /var\(\s*(--md-sys-(?:color|shape-corner|typescale|motion-duration)-[a-z0-9-]+)\s*,\s*/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    // Walk to the var()'s own closing paren, counting nested ones.
    let depth = 1;
    let close = -1;
    for (let i = match.index + match[0].length; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) break;
    const token = match[1];
    const literal = value.slice(match.index + match[0].length, close).trim();
    pattern.lastIndex = close + 1;
    let expected = null;
    let known = true;
    if (literal.includes("var(")) {
      continue;
    } else if (token.startsWith("--md-sys-color-")) {
      if (!scale || !scale.dark.has(token)) known = false;
      else expected = scale.dark.get(token);
      if (known && literal.toLowerCase() === expected) continue;
    } else if (token.startsWith("--md-sys-shape-corner-")) {
      const step = scale
        ? [...scale.shape, ...scale.aliases].find((s) => s.name === token)
        : null;
      if (!step) known = false;
      else expected = step.value;
      if (known && literal === expected) continue;
    } else if (token.startsWith("--md-sys-typescale-")) {
      const all =
        scale?.typeAll ?? new Map((steps ?? []).map((s) => [s.name, s.value]));
      if (!all.has(token)) known = false;
      else expected = all.get(token);
      if (known && literal === expected) continue;
    } else if (token.startsWith("--md-sys-motion-duration-")) {
      const step = scale ? scale.duration.find((s) => s.name === token) : null;
      if (!step) known = false;
      else expected = step.value;
      if (known && literal === expected) continue;
    }
    if (!known) {
      if (!token.startsWith("--md-sys-color-")) {
        findings.push({
          kind: "unfixable",
          from: value.slice(match.index, close + 1),
          to: `${token} is not a token`,
        });
      }
      continue;
    }
    findings.push({ kind: "fallback", from: literal, to: expected });
    next += value.slice(cursor, match.index) + `var(${token}, ${expected})`;
    cursor = close + 1;
  }
  next += value.slice(cursor);
  return { value: next, findings };
}

/**
 * The regions of a file that are stylesheet text: the whole of a .css/.scss, the <style>
 * blocks of a .vue/.html, and template literals in a .ts/.js that contain CSS declarations.
 */
function styleRegions(file, text) {
  const ext = extname(file);
  if (ext === ".css" || ext === ".scss") return [[0, text.length]];
  const regions = [];
  if (ext === ".vue" || ext === ".html") {
    for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      regions.push([
        match.index + match[0].indexOf(match[1]),
        match.index + match[0].indexOf(match[1]) + match[1].length,
      ]);
    }
    return regions;
  }
  for (const match of text.matchAll(/`[^`]*`/g)) {
    if (/[a-z-]+\s*:\s*[^;`]+;/.test(match[0]))
      regions.push([match.index, match.index + match[0].length]);
  }
  return regions;
}

const DECLARATION =
  /(?<![\w-])(border-(?:[a-z]+-)?radius|font-size|transition(?:-duration|-delay)?|animation(?:-duration|-delay)?|[a-z-]+)\s*:\s*([^;{}`]+?)(\s*)(?=;|\}|`|$)/g;

/** Scans one file, returning findings and the rewritten text. */
export function scanText(file, text, scale) {
  const findings = [];
  const lines = text.split("\n");
  // A file-level declaration: the marker in the comment the file opens with, which is how
  // a file that *is* data (a named-colour table, a spec transcription) says so once. A
  // marker anywhere later is line-level, so one exemption near the top of a short sheet
  // cannot quietly exempt the sheet.
  const header =
    /^\s*(?:#![^\n]*\n)?\s*(\/\*[\s\S]*?\*\/|(?:\/\/[^\n]*\n)+)/.exec(
      text,
    )?.[1] ?? "";
  if (header.includes(EXEMPT_MARKER)) return { text, findings };
  let rewritten = text;
  const edits = [];
  for (const [start, end] of styleRegions(file, text)) {
    const region = text.slice(start, end);
    // Comments are not declarations.
    const withoutComments = region
      .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
      .replace(
        /(^|[^:])\/\/[^\n]*/g,
        (m, lead) => lead + " ".repeat(m.length - lead.length),
      );
    for (const match of withoutComments.matchAll(DECLARATION)) {
      const [, property, value] = match;
      if (
        !/^(?:border-(?:[a-z]+-)?radius|font-size|transition(?:-duration|-delay)?|animation(?:-duration|-delay)?)$/.test(
          property,
        ) &&
        !/var\(\s*--md-sys-/.test(value)
      )
        continue;
      const absolute = start + match.index;
      const lineNumber = text.slice(0, absolute).split("\n").length;
      // A line-level marker covers the declaration or rule it sits above: the text
      // between the previous `;`, `{` or `}` and this declaration. Eight lines of reach
      // would let one marker cover its neighbour's rule, which is an exemption nobody
      // declared.
      // Boundaries are found on the comment-stripped copy, so punctuation inside the
      // marker's own prose cannot cut its scope short; the marker is then looked for in
      // the original text at those same offsets.
      const stripped = withoutComments.slice(0, match.index);
      const boundary = Math.max(
        stripped.lastIndexOf(";"),
        stripped.lastIndexOf("}"),
      );
      const scopeStart = boundary === -1 ? 0 : boundary;
      const openBrace = stripped.lastIndexOf("{");
      const braceAt = openBrace >= scopeStart ? openBrace : -1;
      const afterBrace = region.slice(
        braceAt === -1 ? scopeStart : braceAt,
        match.index,
      );
      const beforeBrace =
        braceAt === -1 ? "" : region.slice(scopeStart, braceAt);
      const beforeBraceStripped =
        braceAt === -1 ? "" : stripped.slice(scopeStart, braceAt);
      if (
        afterBrace.includes(EXEMPT_MARKER) ||
        (beforeBrace.includes(EXEMPT_MARKER) &&
          !/\{[^}]*\}/.test(beforeBraceStripped))
      )
        continue;
      const result = rewriteValue(property, value, scale);
      if (result.findings.length === 0) continue;
      for (const finding of result.findings) {
        findings.push({
          ...finding,
          file,
          line: lineNumber,
          property,
          text: `${property}: ${value.trim()}`,
        });
      }
      if (result.value !== value) {
        const valueStart = absolute + match[0].indexOf(value, property.length);
        edits.push([valueStart, valueStart + value.length, result.value]);
      }
    }
  }
  for (const [from, to, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    rewritten = rewritten.slice(0, from) + replacement + rewritten.slice(to);
  }
  return { text: rewritten, findings };
}

export function scanSurface(surface, scale, root = repoRoot) {
  const dir = join(root, surface.dir);
  if (!existsSync(dir)) return [];
  const results = [];
  for (const file of walk(dir)) {
    const asPosix = file.split("\\").join("/");
    if (surface.skip.some((pattern) => pattern.test(asPosix))) continue;
    const text = readFileSync(file, "utf8");
    const result = scanText(file, text, scale);
    if (result.findings.length > 0)
      results.push({ file, ...result, original: text });
  }
  return results;
}

function main(argv) {
  const fix = argv.includes("--fix");
  const list = argv.includes("--list");
  const scale = readScale();
  let total = 0;
  const unfixable = [];
  const snaps = new Map();
  for (const surface of SURFACES) {
    const results = scanSurface(surface, scale);
    for (const result of results) {
      const rel = relative(repoRoot, result.file).split("\\").join("/");
      for (const finding of result.findings) {
        total += 1;
        if (finding.kind === "unfixable") unfixable.push({ ...finding, rel });
        if (finding.kind === "snapped") {
          const key = `${finding.from} -> ${finding.to}`;
          snaps.set(key, (snaps.get(key) ?? 0) + 1);
        }
        if (list || !fix) {
          process.stdout.write(
            `  ${surface.id}: ${rel}:${String(finding.line)}  ${finding.text}  [${finding.kind}: ${finding.from} -> ${finding.to}]\n`,
          );
        }
      }
      if (fix && result.text !== result.original)
        writeFileSync(result.file, result.text, "utf8");
    }
  }
  if (snaps.size > 0) {
    process.stdout.write(
      "\nValues moved onto the scale (nearest step, larger on a tie):\n",
    );
    for (const [key, count] of [...snaps.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      process.stdout.write(`  ${String(count).padStart(4)} x ${key}\n`);
    }
  }
  if (fix) {
    const remaining = unfixable.length;
    process.stdout.write(
      `\ncheck-design-tokens: rewrote ${String(total - remaining)} literals; ${String(remaining)} need a decision\n`,
    );
    for (const finding of unfixable) {
      process.stdout.write(
        `  ${finding.rel}:${String(finding.line)}  ${finding.text}  (${finding.to})\n`,
      );
    }
    return remaining > 0 ? 1 : 0;
  }
  if (total > 0) {
    process.stderr.write(
      `\ncheck-design-tokens: ${String(total)} literal(s) where a token belongs. ` +
        "Run `node scripts/check-design-tokens.mjs --fix`, or declare data with " +
        `"${EXEMPT_MARKER} <reason>" above it.\n`,
    );
    return 1;
  }
  process.stdout.write(
    `check-design-tokens: every surface spends the design system's shape, type and motion tokens\n`,
  );
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}
