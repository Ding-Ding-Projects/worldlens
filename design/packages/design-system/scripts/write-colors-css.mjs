#!/usr/bin/env node
/**
 * Writes `src/colors.css` from `src/colors.ts`, or with `--check` proves the committed file
 * is what the module would emit today.
 *
 * The stylesheet is committed rather than built on demand because the package's export map
 * serves it straight from `src/`, the same way it serves `tokens.css`, and a consumer such as
 * Wharf copies it at build time with `require.resolve`. A file that only existed after a
 * build step would be a file that is missing exactly when somebody forgot the step.
 *
 * Run with `node --experimental-strip-types`, which is how a plain `.mjs` imports the
 * TypeScript source directly without a compile.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { colorSchemesToStylesheet } from "../src/colors.ts";

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "colors.css");
const expected = colorSchemesToStylesheet();

if (process.argv.includes("--check")) {
    let actual = "";
    try {
        actual = readFileSync(target, "utf8");
    } catch {
        actual = "";
    }
    if (actual !== expected) {
        process.stderr.write(
            "design-system: src/colors.css is stale. Run `pnpm --filter @worldlens/design-system run colors:write`.\n",
        );
        process.exit(1);
    }
    process.stdout.write("design-system: src/colors.css is current\n");
} else {
    writeFileSync(target, expected, "utf8");
    process.stdout.write(`design-system: wrote ${target}\n`);
}
