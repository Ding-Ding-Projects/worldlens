/**
 * That the lock feature is actually connected to the shell it runs in.
 *
 * This file exists because of the exact defect it now guards. Every other lock test in this
 * folder passed - the model, the store, the wizard, the prompt, and even the wrapper driven
 * by a right-click - and the feature was still entirely absent from the running application,
 * because two lines were missing at the seam:
 *
 *   - `App.vue` imported `resolveLockHost` for the recovery folder alone and never called
 *     `provideLockStore`, so every `useLockStore()` in the tree fell through to the hostless
 *     default;
 *   - the preload exposed no `worldlens.locks` namespace at all, so the probe had nothing to
 *     find even once the store was provided.
 *
 * The result was a store that honestly reported `canList: false`, and a context menu that
 * correctly hid "Lock this element..." because the build genuinely could not keep a lock.
 * Nothing failed, nothing warned, and a right-click showed a menu with one command in it.
 *
 * That is the shape this whole document calls "wired at one end, consumed at neither", and
 * a test that injects the host cannot see it: it supplies the very thing that was missing.
 * So these assertions read the real source files instead, anchored to whole lines rather
 * than substrings - a commented-out `provideLockStore(...)` still contains the substring,
 * and a check that a commenting-out satisfies is not a check.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Read with line endings normalised: this repository can be checked out CRLF. */
function source(relative: string): string {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const APP = source("../../App.vue");
const PRELOAD = source("../../../../app/src/preload/index.ts");
const MAIN = source("../../../../app/src/main/index.ts");

/**
 * Source with comments removed and whitespace flattened.
 *
 * Prettier decides where these calls wrap, and it moved one of them onto a second line the
 * first time it ran - which broke a line-anchored assertion while the code it was checking
 * was perfectly correct. A guard that fails on reformatting is a guard people delete.
 *
 * Comments are stripped *before* flattening rather than relying on a line anchor, so the
 * property this keeps is the one that matters: a commented-out call is removed outright and
 * cannot satisfy anything. That is strictly stronger than the line anchor it replaces, which
 * only defended against a comment at the start of the line.
 */
function code(text: string): string {
    return (
        text
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            // `.` already excludes newlines in JavaScript, so a line comment is `//.*` and needs
            // no escape at all. The `[^:]` guard keeps the `//` of a `https://` URL intact.
            .replace(/(^|[^:])\/\/.*/g, "$1 ")
            .replace(/\s+/g, " ")
    );
}

const PRELOAD_CODE = code(PRELOAD);
const MAIN_CODE = code(MAIN);

describe("the renderer provides one lock store, from the real host", () => {
    it("calls provideLockStore at the top level of App.vue", () => {
        // Anchored to the start of a line, so a commented-out call cannot satisfy it.
        expect(APP).toMatch(/^provideLockStore\(/m);
    });

    it("builds that store from the resolved shell host, not a hostless default", () => {
        expect(APP).toMatch(
            /^const lockStore = createLockStore\(\{ host: resolveLockHost\(\) \}\);$/m,
        );
    });

    it("loads the saved locks once the shell is up", () => {
        expect(APP).toMatch(/^\s*void lockStore\.load\(\);$/m);
    });
});

describe("the shell exposes the host the probe looks for", () => {
    /**
     * `resolveLockHost` refuses the whole namespace if either of `load`/`save` is missing,
     * and treats the vault as separately optional. So each member is asserted individually:
     * a namespace that is present but one method short is refused exactly as an absent one
     * is, and would put the feature back where it started.
     */
    it("exposes worldlens.locks with load and save", () => {
        expect(PRELOAD_CODE).toContain('load: () => ipcRenderer.invoke("locks:load")');
        expect(PRELOAD_CODE).toContain('save: (locks) => ipcRenderer.invoke("locks:save", locks)');
    });

    it("exposes the vault's three calls, so a TOTP lock is offerable", () => {
        expect(PRELOAD_CODE).toContain(
            'put: (lockId, secretBase32) => ipcRenderer.invoke("locks:vault:put", lockId, secretBase32)',
        );
        expect(PRELOAD_CODE).toContain(
            'get: (lockId) => ipcRenderer.invoke("locks:vault:get", lockId)',
        );
        expect(PRELOAD_CODE).toContain(
            'remove: (lockId) => ipcRenderer.invoke("locks:vault:remove", lockId)',
        );
    });

    it("names the folder the recovery route sends people to", () => {
        // Null here would leave every unlock prompt and the support desk gesturing at
        // "app data" instead of naming a path somebody can actually open.
        expect(PRELOAD_CODE).toContain("dataFolder: readLockDataFolder()");
    });

    it("registers the handlers those channels invoke", () => {
        // The other half of the same seam: a preload that invokes a channel nobody handles
        // throws on first use, which is worse than the feature being absent.
        expect(MAIN_CODE).toContain("lockIpc = registerLockHandlers(ipcMain, {");
    });
});
