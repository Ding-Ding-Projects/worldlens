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
// Read as source rather than imported: this package does not depend on @worldlens/bridge,
// and the rest of this file already answers its questions by reading the files involved.
const CHANNELS_CODE = code(source("../../../../bridge/src/channels.ts"));
const FACTORY_CODE = code(source("../../../../bridge/src/factory.ts"));
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
    /*
     * These used to read the preload for one hand-written ipcRenderer.invoke per call. The
     * preload does not write them any more: createWorldlensBridge forwards every channel
     * through a single invoke, and readLockDataFolder lives in the factory rather than beside
     * it. So the question "is this reachable" is now answered by BRIDGE_CHANNELS for the five
     * calls, and by the factory for the one value that is not a channel at all.
     */
    it("has all five lock channels in the shared bridge inventory", () => {
        for (const channel of [
            "locks:load",
            "locks:save",
            "locks:vault:get",
            "locks:vault:put",
            "locks:vault:remove",
        ]) {
            expect(
                CHANNELS_CODE,
                `${channel} is not in BRIDGE_CHANNELS, so the bridge refuses it and ` +
                    "resolveLockHost sees a namespace one method short, which it treats as absent",
            ).toContain(`"${channel}"`);
        }
    });

    it("still builds the bridge through the factory, which is what makes the question above the right one", () => {
        /*
         * PRELOAD_CODE was read and never asserted, so this file's whole argument -- that
         * membership of BRIDGE_CHANNELS is what decides reachability -- rested on a premise
         * nothing checked. It holds only while the preload builds the bridge through
         * createWorldlensBridge and forwards every channel through one invoke. Go back to a
         * hand-written invoke per call and BRIDGE_CHANNELS stops being the answer, while every
         * assertion above carries on passing.
         *
         * The sibling mcserver guard asserts the same premise for the same reason.
         */
        expect(PRELOAD_CODE).toContain("createWorldlensBridge");
        expect(
            PRELOAD_CODE.match(/ipcRenderer[.]invoke/g)?.length ?? 0,
            "more than one ipcRenderer.invoke means a channel is being reached by hand again, " +
                "and a hand-written call does not need to be in BRIDGE_CHANNELS to work",
        ).toBe(1);
    });

    it("names the folder the recovery route sends people to", () => {
        // Null here would leave every unlock prompt and the support desk gesturing at
        // "app data" instead of naming a path somebody can actually open. It is a value
        // rather than a channel, so the generic forwarder cannot supply it and the factory
        // reads it over a sync channel of its own.
        expect(FACTORY_CODE).toContain("dataFolder: readLockDataFolder()");
        expect(FACTORY_CODE).toContain('transport.sendSync("locks:dataFolder")');
    });

    it("registers the handlers those channels invoke", () => {
        // The other half of the same seam: a preload that invokes a channel nobody handles
        // throws on first use, which is worse than the feature being absent.
        expect(MAIN_CODE).toContain("lockIpc = registerLockHandlers(ipcMain, {");
    });
});
