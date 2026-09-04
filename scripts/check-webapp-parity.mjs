#!/usr/bin/env node
/**
 * The Lang gui webapp's completeness inventory.
 *
 * The Day Teet Hui has had a hand-written fail-closed inventory for a while. The map's
 * webapp had none at all, which meant its whole Material Design 3 layer could have been
 * lost in an upstream merge with nothing going red - and an upstream merge is exactly how
 * it would be lost, because every file it touches is a file upstream also owns.
 *
 * ## Hand-written, not discovered
 *
 * Every row below is written out. A check that enumerates what it finds and then validates
 * it passes cleanly on a webapp that has none of this, because it would find nothing and
 * validate nothing. The point is to fail when a named thing is absent.
 *
 * ## Why it skips rather than fails without the Tow Fat
 *
 * A clone without --recurse-submodules has no webapp to inspect. Failing there would be a
 * complaint about the clone rather than about the webapp, and the CI that matters checks
 * out submodules anyway.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBAPP = join(repoRoot, "vendor/BlueMap-LangGui/common/webapp/src");

/**
 * Every surface the purity rule covers, not only the map.
 *
 * The rule applies to each surface individually rather than to the project as an aggregate,
 * which is exactly the reading that lets one corner sit outside it. The map had a guard and
 * the other three did not, so the other three were where the undeclared colour actually was.
 *
 * Token files are excluded by name because a palette has to define its colours somewhere -
 * that is the one place a hex literal is the point rather than a lapse.
 */
const PURITY_SURFACES = [
    { id: "map webapp", dir: WEBAPP, skip: [/variables\.scss$/] },
    {
        id: "documentation site",
        dir: join(repoRoot, "design/packages/site/src"),
        skip: [/tokens\.css$/, /\/theme\/generated\//, /\/dimsum\/generated\//, /\.test\.ts$/],
    },
    {
        id: "desktop interface",
        dir: join(repoRoot, "design/packages/ui/src"),
        skip: [/tokens/, /\/theme\//, /generated/, /\.test\.ts$/],
    },
    {
        id: "render page",
        dir: join(repoRoot, "design/packages/render-actions/src/pages"),
        skip: [/\.test\.ts$/],
    },
];

/**
 * What the webapp must carry, and how each is recognised.
 *
 * `minFiles` is the load-bearing field. A token that is declared and used nowhere is a
 * token the interface does not actually render, and "declared" is exactly the state an
 * upstream merge leaves behind when it takes the call sites and leaves the definitions.
 */
const CONTRACTS = [
    {
        id: "m3-colour-roles",
        what: "Material Design 3 colour roles, used rather than merely declared",
        pattern: /--md-sys-color-/,
        minFiles: 10,
    },
    {
        id: "m3-state-layers",
        what: "State-layer opacities at the Material Design 3 values",
        pattern: /\$md-state-(hover|focus|pressed|dragged)/,
        minFiles: 5,
    },
    {
        id: "m3-state-layer-rendering",
        what: "State layers actually drawn, as a pseudo-element rather than a colour swap",
        pattern: /::before/,
        minFiles: 4,
    },
    {
        id: "m3-shape-scale",
        what: "The shape scale, so corners come from a scale and not from guesses",
        pattern: /\$md-shape-/,
        minFiles: 5,
    },
    {
        id: "m3-elevation",
        what: "Elevation, so surfaces sit in a defined order",
        pattern: /\$md-elevation|--md-sys-elevation|box-shadow/,
        minFiles: 3,
    },
    {
        id: "touch-targets",
        what: "A real minimum touch target on controls",
        pattern: /\$md-touch-target/,
        minFiles: 5,
    },
    {
        id: "visible-focus",
        what: "A visible focus ring, so the map is operable without a mouse",
        pattern: /focus-visible/,
        minFiles: 5,
    },
    {
        id: "both-themes",
        what: "Both themes, so a viewer's own setting is honoured",
        pattern: /prefers-color-scheme/,
        minFiles: 1,
    },
];

/** Every source file under the webapp. Walked rather than globbed, to stay dependency-free. */
function walk(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) found.push(...walk(full));
        else if (/\.(vue|scss|css|js|ts)$/.test(name)) found.push(full);
    }
    return found;
}

/**
 * Colour that is not a role.
 *
 * Pure Lang gui means every chrome colour comes from the palette, so a hex literal outside
 * the token file is either a colour that ignores the reader's theme or a deliberate
 * exemption. Deliberate exemptions exist and are legitimate - a QR code has to be true
 * dark-on-light to scan, a hue gradient's red *is* the hue - so what this refuses is an
 * undeclared one. An exemption with a reason written beside it is a decision; one without is
 * indistinguishable from an oversight, and that is exactly the difference being enforced.
 */
/** What a line must carry, above it, to be a declared exemption rather than an oversight. */
const EXEMPT_MARKER = "lang-gui-exempt:";

function hardcodedColour(files, skip) {
    const problems = [];
    for (const file of files) {
        // Compared with forward slashes throughout. A pattern written with a character class
        // for "either separator" quietly loses a backslash on its way through tooling and
        // then matches only one of them - which on Windows means it silently stops skipping.
        const asPosix = file.split(String.fromCharCode(92)).join("/");
        if (skip.some((pattern) => pattern.test(asPosix))) continue;
        const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
        // A file-level declaration, for a file that *is* colour data rather than one that
        // happens to contain some. The named-colour table is the clear case: 148 line-level
        // markers would bury the table they were annotating, and the honest statement is
        // about the file rather than about each of its rows.
        if (lines.slice(0, 25).some((head) => head.includes(EXEMPT_MARKER))) continue;
        lines.forEach((line, index) => {
            if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) return;
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            // A fallback on a custom property is still deferring to that property, whether it
            // is a system role or a local alias for one. The literal is what renders when the
            // cascade has not supplied a value, which is a safety net rather than a choice
            // made instead of the palette.
            if (/var\(\s*--[^)]*,/.test(line)) return;
            // Defining a palette role is the one place a literal is the point.
            if (/^\s*(--md-sys-|\$md-)/.test(line)) return;
            // A hex inside copy is an example being shown to a person, not a colour being used.
            if (/^\s*(\/\/|["'`]).*#[0-9a-fA-F]{3,8}/.test(line.trim()) || /such as #/.test(line)) return;
            // An HTML entity is not a colour.
            if (/&#\d+;/.test(line)) return;
            // A declared exemption is a decision, and it has to be declared in so many words.
            //
            // An earlier version of this matched the prose of the comment above the line -
            // "data colour", "is the hue", and so on - which made whether an exemption counted
            // depend on which synonym somebody happened to reach for. A comment saying "data
            // encoding" was refused while one saying "data colour" was accepted, and neither
            // author would have known why. An explicit marker makes the exemption deliberate
            // rather than accidentally phrased.
            const preceding = lines.slice(Math.max(0, index - 8), index).join("\n");
            if (preceding.includes(EXEMPT_MARKER)) return;
            problems.push({
                file: relative(repoRoot, file).split("\\").join("/"),
                line: index + 1,
                text: line.trim().slice(0, 80),
            });
        });
    }
    return problems;
}

/**
 * The complete Material Design 3 token set, named one role at a time.
 *
 * A partial palette is worse than an obviously absent one, because the roles that exist look
 * authoritative: a surface reaching for `surface-dim` or `body-small` and getting nothing
 * inherits whatever is in scope, renders plausibly, and is wrong in a way nobody reports.
 * Two thirds of these were missing and the interface looked fine, which is the whole problem.
 *
 * Written out rather than counted. A check that asserted "at least 40 roles" would pass on a
 * palette with forty of the wrong ones, and a check that compared against whatever the file
 * happens to define would pass on anything at all.
 */
const M3_COLOUR_ROLES = [
    "primary", "on-primary", "primary-container", "on-primary-container",
    "secondary", "on-secondary", "secondary-container", "on-secondary-container",
    "tertiary", "on-tertiary", "tertiary-container", "on-tertiary-container",
    "error", "on-error", "error-container", "on-error-container",
    "surface", "on-surface", "surface-variant", "on-surface-variant",
    "surface-dim", "surface-bright", "surface-tint",
    "surface-container-lowest", "surface-container-low", "surface-container",
    "surface-container-high", "surface-container-highest",
    "background", "on-background",
    "outline", "outline-variant",
    "inverse-surface", "inverse-on-surface", "inverse-primary",
    "scrim", "shadow",
    // The fixed roles hold one tone across both themes, for something that spans them.
    "primary-fixed", "primary-fixed-dim", "on-primary-fixed", "on-primary-fixed-variant",
    "secondary-fixed", "secondary-fixed-dim", "on-secondary-fixed", "on-secondary-fixed-variant",
    "tertiary-fixed", "tertiary-fixed-dim", "on-tertiary-fixed", "on-tertiary-fixed-variant",
];

const M3_TYPE_ROLES = [
    "display-large", "display-medium", "display-small",
    "headline-large", "headline-medium", "headline-small",
    "title-large", "title-medium", "title-small",
    "body-large", "body-medium", "body-small",
    "label-large", "label-medium", "label-small",
];

/** Every role needs all four, or a call site has to remember to supply the rest. */
const TYPE_PROPERTIES = ["size", "line", "weight", "tracking"];

/**
 * Checks the token set, in the theme file rather than in the components.
 *
 * Both themes are checked, because a role defined in light and forgotten in dark is a
 * surface that renders correctly for half its readers - the half doing the checking, as a
 * rule, since a developer's own theme is the one they look at.
 */
function tokenCompleteness(repoRoot) {
    const file = join(repoRoot, "vendor/BlueMap-LangGui/common/webapp/src/scss/variables.scss");
    if (!existsSync(file)) return [];
    const text = readFileSync(file, "utf8");

    const problems = [];
    for (const role of M3_COLOUR_ROLES) {
        // Anchored to the whole declaration, so `surface` cannot be satisfied by
        // `surface-dim` and `primary` cannot be satisfied by `primary-container`.
        const declared = new RegExp("--md-sys-color-" + role + ":", "g");
        const count = (text.match(declared) ?? []).length;
        if (count === 0) problems.push("  missing colour role: --md-sys-color-" + role);
        else if (count < 2) {
            problems.push(
                "  colour role defined in only one theme: --md-sys-color-" + role +
                    " (a role present in light and absent in dark renders correctly for " +
                    "whoever is checking and wrongly for everyone else)",
            );
        }
    }
    for (const role of M3_TYPE_ROLES) {
        for (const property of TYPE_PROPERTIES) {
            if (!text.includes("--md-sys-typescale-" + role + "-" + property + ":")) {
                problems.push(
                    "  missing type token: --md-sys-typescale-" + role + "-" + property,
                );
            }
        }
    }
    return problems;
}

function main() {
    if (!existsSync(WEBAPP)) {
        process.stdout.write(
            "check-webapp-parity: the BlueMap Tow Fat is not checked out; nothing to inspect\n",
        );
        return 0;
    }

    const files = walk(WEBAPP);
    const problems = [];

    for (const contract of CONTRACTS) {
        let hits = 0;
        for (const file of files) {
            if (contract.pattern.test(readFileSync(file, "utf8"))) hits += 1;
        }
        if (hits < contract.minFiles) {
            problems.push(
                `  ${contract.id}: ${contract.what}\n` +
                    `    found in ${String(hits)} files, expected at least ${String(contract.minFiles)}`,
            );
        }
    }

    problems.push(...tokenCompleteness(repoRoot));

    for (const surface of PURITY_SURFACES) {
        if (!existsSync(surface.dir)) continue;
        for (const stray of hardcodedColour(walk(surface.dir), surface.skip)) {
            problems.push(
                `  pure-lang-gui (${surface.id}): a colour that is not a palette role, and is ` +
                    "not declared as an exemption\n" +
                    `    ${stray.file}:${String(stray.line)}\n` +
                    `    ${stray.text}\n` +
                    `    If this is genuinely data rather than chrome, say so above it with ` +
                    `"${EXEMPT_MARKER} <reason>".`,
            );
        }
    }

    if (false) {
        problems.push(
            "  pure-lang-gui: a colour that is not a palette role, and is not declared as an exemption\n" +
                `    ${stray.file}:${String(stray.line)}\n` +
                `    ${stray.text}
` +
                `    If this is genuinely data rather than chrome, say so above it with ` +
                `"${EXEMPT_MARKER} <reason>".`,
        );
    }

    if (problems.length > 0) {
        process.stderr.write(
            "The Lang gui webapp has lost part of its Material Design 3 layer:\n\n" +
                problems.join("\n\n") +
                "\n\nThis is what an upstream merge takes away silently, because every file " +
                "involved is one upstream also owns.\n",
        );
        return 1;
    }

    process.stdout.write(
        `check-webapp-parity: ${String(CONTRACTS.length)} contracts present across ` +
            `${String(files.length)} webapp files\n`,
    );
    return 0;
}

process.exit(main());
