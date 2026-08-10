/**
 * Fail the build when an article exists on disk and not in the bundle.
 *
 * Bundling drops a file exactly as easily as it includes one, and the failure is silent in
 * both directions that matter. An article whose module is never imported simply is not there:
 * the documentation tab renders one fewer entry, the search finds nothing by that name, the
 * command palette cannot reach it, and every `suggested` entry pointing at it degrades to
 * plain text. Nothing goes red, nothing warns, and the only symptom is an absence that a
 * reader has to already know about in order to notice. An article imported but left out of
 * the exported list has the same effect while looking, in the diff, exactly like it landed.
 *
 * The check is deliberately syntactic rather than a runtime import. Running the bundle would
 * prove the imports resolve, which is the half already guaranteed by the type checker; what is
 * unproven is the relationship between *the directory* and *the list*, and only reading both
 * as text can establish that. It also means this runs in a plain Node process during the build
 * with no bundler, no DOM and no transpilation, so it cannot be the thing that breaks.
 *
 * It runs as part of `build`, not only as part of the test suite, because a guard that lives
 * exclusively in tests protects only the people who run tests, and the deploy path is exactly
 * where a missing article does its damage.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const articlesDirectory = fileURLToPath(new URL("../src/content/articles/", import.meta.url));
const indexPath = `${articlesDirectory}index.ts`;

/** Every article module on disk, by its module basename. `index.ts` is the list, not an entry. */
function articleFilesOnDisk() {
    return readdirSync(articlesDirectory)
        .filter((name) => name.endsWith(".ts") && name !== "index.ts" && !name.endsWith(".test.ts"))
        .map((name) => name.slice(0, -".ts".length))
        .sort();
}

/**
 * The `./thing.js` specifiers `index.ts` imports.
 *
 * Matching the specifier rather than the local binding name because the specifier is what ties
 * a line in this file to a file in that directory; a binding could be renamed on import and the
 * relationship would still hold.
 */
function importedModules(source) {
    const found = new Set();
    for (const match of source.matchAll(/from\s+"\.\/([A-Za-z0-9-]+)\.js"/g)) found.add(match[1]);
    return found;
}

/**
 * The identifiers listed inside `export const articles = [ … ]`.
 *
 * Scoped to that one array rather than searched for anywhere in the file, because an identifier
 * appearing in a comment or in a second list would otherwise count as shipped.
 */
function listedBindings(source) {
    /*
     * The opening bracket is found by anchoring on `= [` rather than on the first `[` after the
     * declaration, because the declaration itself contains one: `readonly Article[]`. Anchoring
     * on the first bracket put the slice's start inside the type annotation, which made the
     * first entry in the list parse as `] = [\n glossary` — not an identifier, so it was
     * dropped, and the guard reported the site's first article as missing on its very first
     * run. Worth recording rather than quietly fixing: a guard whose parser is subtly wrong
     * reports a defect that is not there, and the natural response to that is to distrust the
     * guard, which is how a real absence later gets waved through.
     */
    const start = source.indexOf("articles: readonly Article[] = [");
    const open = source.indexOf("= [", start);
    const close = source.indexOf("];", open);
    if (start === -1 || open === -1 || close === -1) {
        throw new Error(
            "Could not find the exported articles array in index.ts. If its declaration was reformatted, update this guard rather than deleting it — an unparsable guard that exits zero is worse than no guard.",
        );
    }
    return new Set(
        source
            .slice(open + "= [".length, close)
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry)),
    );
}

/** kebab-case module name to the camelCase binding the modules in this directory export. */
function bindingFor(moduleName) {
    return moduleName.replace(/-([a-z0-9])/g, (_whole, letter) => letter.toUpperCase());
}

const source = readFileSync(indexPath, "utf8");
const onDisk = articleFilesOnDisk();
const imported = importedModules(source);
const listed = listedBindings(source);

const notImported = onDisk.filter((name) => !imported.has(name));
const notListed = onDisk.filter((name) => imported.has(name) && !listed.has(bindingFor(name)));

if (notImported.length > 0 || notListed.length > 0) {
    const lines = ["Article bundle is incomplete, so the built site would be missing articles."];
    if (notImported.length > 0) {
        lines.push(`  Present in src/content/articles/ but never imported: ${notImported.join(", ")}`);
    }
    if (notListed.length > 0) {
        lines.push(`  Imported but absent from the exported articles array: ${notListed.join(", ")}`);
    }
    lines.push("  Add each to src/content/articles/index.ts, or delete the file if it is dead.");
    process.stderr.write(`${lines.join("\n")}\n`);
    process.exit(1);
}

process.stdout.write(`Article bundle complete: ${onDisk.length} articles on disk, all bundled.\n`);
