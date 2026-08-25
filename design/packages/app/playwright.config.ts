import { defineConfig } from "@playwright/test";

/**
 * Electron screenshot and E2E harness. Kept separate from the vitest unit suite:
 * vitest owns `src/**\/*.test.ts`, playwright owns `test/*.spec.ts`, and the two
 * never collect each other's files.
 */
export default defineConfig({
    // Before the application is launched at all: refuse to photograph a build that is
    // older than the code. The renderer is built by `packages/ui`, not by `packages/app`,
    // so a Vue change plus an app rebuild produces captures of the previous interface -
    // silently, and with every test passing. See test/freshBundle.ts.
    globalSetup: "./test/freshBundle.ts",
    testDir: "./test",
    testMatch: /.*\.spec\.ts/,
    // Electron launches one app instance shared across the file, so parallelism
    // inside a file would race the same window.
    fullyParallel: false,
    workers: 1,
    // A capture that "passes" because it silently retried is not evidence.
    retries: 0,
    timeout: 120_000,
    reporter: [["list"]],
    use: {
        /*
         * A ceiling on every action, because the default is no ceiling at all.
         *
         * Playwright's `actionTimeout` defaults to 0, meaning unlimited, and this file never set
         * it. So any single action that never resolved stopped the run for good: the surface
         * timeout eventually killed the test, Playwright discarded the worker, and the re-run of
         * `beforeAll` could not reconnect to an application whose previous session had been torn
         * down mid-flight. One unresolved action therefore cost every spec after it, which is how
         * a run reached spec 14 of 29 and published nothing.
         *
         * Every wait that genuinely needs longer already passes its own timeout, and an explicit
         * timeout wins over this one, so this changes nothing about the specs that were working.
         * What it changes is that a hang is now a failure with a message, which `attempt` can
         * catch and record as a gap, instead of silence that ends the run.
         */
        // Deliberately the same 45s the spec file's own `ELEMENT_TIMEOUT` uses. Spelled out
        // rather than imported, because a config that imports from the suite it configures is a
        // cycle waiting to happen; if one moves, move the other.
        actionTimeout: 45_000,
        /*
         * Off, and not as a preference.
         *
         * This suite does not launch a browser. It attaches to an already-running packaged
         * Electron application over the debugging protocol, and Playwright's trace fixture
         * cannot start against that: it times out after two minutes *during setup*, so the test
         * body never runs at all and no result of any kind is produced.
         *
         * Measured on one spec, on a freshly launched application, changing nothing else:
         * `--trace off` passes in 32.7s, and `retain-on-failure` fails at the full 300s surface
         * timeout with `Fixture "trace recording" timeout of 120000ms exceeded during setup`.
         *
         * That is worth the trade without hesitation. A trace is a debugging aid; the images are
         * the evidence, and a trace that can never be produced is not an aid to anybody. Leaving
         * it on cost the whole manifest: one spec that could not be traced stopped the run, and
         * because the run publishes only on a full pass, all 117 images stayed as they were.
         * That is why they had gone stale, and why anyone who changed the interface and tried to
         * refresh them hit a wall with no obvious cause.
         *
         * If tracing is ever wanted here, it needs a route that survives `connectOverCDP`, not
         * this switch turned back on.
         */
        trace: "off",
    },
});
