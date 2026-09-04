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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEBAPP = join(repoRoot, "vendor/BlueMap-LangGui/common/webapp/src");

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

function hardcodedColour(files) {
    const problems = [];
    for (const file of files) {
        if (file.endsWith("variables.scss")) continue;
        const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
        lines.forEach((line, index) => {
            if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) return;
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
            // A fallback on a role is still a role: var(--md-sys-color-x, #hex).
            if (/var\(\s*--md-sys-[^)]*,/.test(line)) return;
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
                file: file.slice(file.indexOf("webapp")),
                line: index + 1,
                text: line.trim().slice(0, 80),
            });
        });
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

    for (const stray of hardcodedColour(files)) {
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
