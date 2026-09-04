/**
 * Every path that resolves a JVM is actually offered the one inside the installer.
 *
 * ## The defect this exists to stop
 *
 * `stage-bundled-runtimes.mjs` puts a Temurin JRE into the packaged app, `discoverJava` knows
 * how to find it, and `discovery.test.ts` proves it wins when it is offered. None of that does
 * anything unless the call sites pass `resourcesPath`, and when this was first wired, three of
 * them did not:
 *
 *   - `render/engine.ts` called `ensureJava({ dataDir })`, so rendering, the reason the JVM is
 *     needed at all, never saw the bundled copy.
 *   - `mcserver/ipc.ts` called `discoverJava({ dataDir })` twice, which is the code behind
 *     "This server has no Java runtime chosen yet".
 *   - `index.ts` called `ensureJava({ dataDir })` for Bedrock conversion.
 *
 * The reason this is worth a test rather than a careful read is how it fails. On a developer
 * machine with a JDK installed, every one of those paths works perfectly: `JAVA_HOME` or `PATH`
 * answers and nothing looks wrong. The bundled runtime is only load-bearing on a clean install,
 * which is precisely the machine nobody is developing on. A silent omission here turns a
 * 180 MB installer addition into decoration.
 *
 * ## Why it reads source
 *
 * The alternative is booting Electron, which these unit suites deliberately do not do. What can
 * be checked cheaply and exactly is the thing that actually broke: that no call site resolves
 * Java while passing only `dataDir`. The inventory is hand-written, so a fourth call site added
 * later has to be considered rather than silently inheriting the omission.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mainRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Every module that resolves a JVM for real work, written out rather than globbed.
 *
 * A globbed list would quietly grow. The regression this catches arrives as a new call site,
 * so the list has to be something a person edits deliberately.
 */
const RESOLVERS = [
    "render/engine.ts",
    "mcserver/ipc.ts",
    "java/ipc.ts",
    "index.ts",
] as const;

/*
 * `java/ipc.ts` was missing from the first version of this list, and the omission proved the
 * point the list exists to make.
 *
 * The other three were found by reading for `ensureJava(` and `discoverJava(`. This one calls
 * through an injected `discover` seam instead, so it did not match the grep that produced the
 * inventory, and the guard passed while the surface that answers "which Java is this app
 * using" still reported no installation at all on a clean machine, then offered to download
 * one that was already present.
 *
 * That is why the check below reads the call arguments rather than the function name, and why
 * the second test insists every inventoried module still resolves a JVM: a hand-written list
 * is only as good as the reason each entry is on it.
 */

const sourceOf = (file: string): string =>
    readFileSync(resolve(mainRoot, file), "utf8").replace(/\r/g, "");

/** `source` with block and line comments removed, so a guard reads code and not prose. */
const codeOf = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * Each `ensureJava(` / `discoverJava(` call's argument text, roughly bounded.
 *
 * Deliberately crude: it takes the next 400 characters after the call and looks for the two
 * option names. That is enough to tell "passes only dataDir" from "passes resourcesPath too",
 * and it cannot be fooled by a comment because comments are stripped first.
 */
function javaCalls(source: string): { call: string; args: string }[] {
    const found: { call: string; args: string }[] = [];
    // `discover(` is here because `java/ipc.ts` resolves through an injected seam of that
    // name rather than calling `discoverJava` directly, which is exactly how it escaped the
    // first version of this guard. The word boundary keeps it from matching `discoverRelease(`
    // and friends, which are unrelated download-manager calls.
    for (const match of codeOf(source).matchAll(/\b(ensureJava|discoverJava|discover)\s*\(/g)) {
        const start = match.index ?? 0;
        found.push({ call: match[1]!, args: codeOf(source).slice(start, start + 400) });
    }
    return found;
}

describe("the bundled runtime is offered to every path that resolves a JVM", () => {
    it("names call sites that still exist", () => {
        for (const file of RESOLVERS) {
            expect(() => sourceOf(file), file).not.toThrow();
        }
    });

    it("finds a Java resolution in each of them, so the inventory cannot go stale", () => {
        // Without this, a module that stopped resolving Java would keep passing the check
        // below forever by having nothing left to check.
        for (const file of RESOLVERS) {
            expect(javaCalls(sourceOf(file)).length, `${file} resolves no JVM any more`).toBeGreaterThan(0);
        }
    });

    it("passes resourcesPath wherever it passes dataDir", () => {
        const offenders: string[] = [];
        for (const file of RESOLVERS) {
            for (const { call, args } of javaCalls(sourceOf(file))) {
                const passesDataDir = /\bdata(Dir|Folder)\b/.test(args);
                const passesResources = /\bresourcesPath\b/.test(args);
                if (passesDataDir && !passesResources) {
                    offenders.push(
                        `${file}: ${call}() passes a data directory but no resourcesPath, so the` +
                            " runtime inside the installer is invisible to it. On a machine with a" +
                            " JDK installed this looks fine; on a clean install it is the bug.",
                    );
                }
            }
        }
        expect(offenders, offenders.join("\n")).toEqual([]);
    });

    it("hands the shell's own resourcesPath to the modules that need it", () => {
        // The value has to originate somewhere, and `index.ts` is the only place that knows
        // whether this is a packaged app. `app.isPackaged ? process.resourcesPath : null` is
        // the established shape here; `jars.ts` and the render engines already use it.
        const shell = codeOf(sourceOf("index.ts"));
        const wirings = shell.match(/resourcesPath:\s*app\.isPackaged\s*\?\s*process\.resourcesPath\s*:\s*null/g) ?? [];
        expect(
            wirings.length,
            "index.ts should pass the packaged resources path to the surfaces that resolve Java",
        ).toBeGreaterThanOrEqual(3);
    });
});
