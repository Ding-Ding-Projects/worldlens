/**
 * That the updater is actually started when the application boots.
 *
 * `controller.test.ts` next door proves the controller checks on startup: `start()` arms a
 * delayed first check, and deleting that one line turns four of its tests red. What none of
 * those tests can prove is that anything ever calls `start()` in the real application.
 *
 * That distinction has already cost this project twice in a day. A structure list shipped
 * fully tested with nothing rendering it, and before that a bridge shape passed every unit
 * test while the host exposed something else entirely. A feature is not reachable because
 * its unit tests pass; it is reachable because something wires it up, and the wiring is a
 * single line that no amount of testing the thing being wired will ever cover.
 *
 * So this reads the shell's own source. Booting Electron to ask one structural question is
 * neither possible here nor worth it; what is asserted is exactly the chain that carries a
 * user from launching the application to being offered a new version.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
    fileURLToPath(new URL("../index.ts", import.meta.url)),
    "utf8",
);

const ipcSource = readFileSync(fileURLToPath(new URL("./ipc.ts", import.meta.url)), "utf8");

const controllerSource = readFileSync(
    fileURLToPath(new URL("./controller.ts", import.meta.url)),
    "utf8",
);

describe("launching the application starts the updater", () => {
    it("defines the function that installs it", () => {
        expect(mainSource).toMatch(/function startUpdates\(/);
    });

    it("calls it during boot rather than only defining it", () => {
        // The defect this guards: a `startUpdates` that exists, is correct, is covered by
        // its own tests, and is never called. Every release would then be an update nobody
        // was offered, which is precisely what the comment above that function records
        // having already happened once.
        const callSites = [...mainSource.matchAll(/startUpdates\(render\)/g)];
        expect(callSites.length).toBeGreaterThan(0);
    });

    it("starts it through the same guarded attempt every other subsystem uses", () => {
        // Wrapped, so a failing updater reports itself and does not take the launch down
        // with it. An unwrapped call here would make a network problem at boot look like a
        // broken application.
        expect(mainSource).toMatch(
            /attempt\(\s*"update",\s*"updates",[\s\S]{0,120}startUpdates\(render\)/,
        );
    });
});

describe("installing it starts the check, rather than waiting to be asked", () => {
    it("calls start() when the IPC is installed", () => {
        // Without this the handlers exist and nothing ever runs: `update:check` is the only
        // other caller and it is the manual button, so an application nobody pressed it in
        // would never once look for a new version.
        expect(ipcSource).toMatch(/controller\.start\(\)/);
    });

    it("arms a first check from start(), on a delay rather than at the instant of launch", () => {
        expect(controllerSource).toMatch(/this\.arm\(STARTUP_DELAY_MS\)/);
    });

    it("keeps the manual route manual, so the two cannot be confused", () => {
        // `update:check` passes `manual: true`; the startup arm does not. A startup check
        // that arrived as a manual one would report itself to the user as something they
        // asked for.
        expect(ipcSource).toMatch(/"update:check"[\s\S]{0,200}manual:\s*true/);
        expect(controllerSource).not.toMatch(/this\.arm\([^)]*manual/);
    });
});
