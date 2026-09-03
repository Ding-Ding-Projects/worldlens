import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/** This directory, `design/`, which is also the pnpm workspace root. */
const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * The capture PNGs committed at the top of the repository.
 *
 * `packages/site` bundles them as ordinary assets so the landing page has pictures in a
 * fresh clone. They sit one level above the workspace root, and Vite's file-serving
 * allow-list stops at that root, so the transform pipeline refuses to read them without
 * being told. Naming the one directory rather than the whole repository keeps the opening
 * as small as the need.
 */
const committedScreenshots = fileURLToPath(new URL("../docs/screenshots", import.meta.url));

/**
 * `docs/*.md`, one level above the workspace root for the same reason `committedScreenshots`
 * is: `packages/ui/src/components/docs/docsContent.ts` bundles the articles with
 * `import.meta.glob`, and `docsContent.test.ts` proves that bundle complete by reading the same
 * directory again with `node:fs`. Both need the dev-server-style file allow-list opened for
 * `docs/` itself, not only for the screenshots inside it.
 */
const committedDocs = fileURLToPath(new URL("../docs", import.meta.url));

/**
 * Node's own Web Storage, turned off so jsdom's can exist.
 *
 * Node gained a built-in `localStorage`/`sessionStorage` pair behind
 * `--experimental-webstorage`, and by Node 26 it is on by default. That global is inert
 * unless the process was also given `--localstorage-file`: reading it returns `undefined`
 * and emits `ExperimentalWarning: localStorage is not available because
 * --localstorage-file was not provided`.
 *
 * On its own that would be harmless, because a jsdom test wants jsdom's storage rather
 * than Node's. The damage is in how vitest builds the jsdom global: `populateGlobal`
 * copies the jsdom window's keys onto `globalThis` but deliberately skips any key the
 * Node global already owns, so that a test cannot clobber Node's own builtins. Node now
 * owns `localStorage`, so jsdom's never gets copied, and every test whose subject or
 * fixture touches a bare `localStorage` sees Node's `undefined` one instead - failing with
 * `Cannot read properties of undefined (reading 'clear')` in a file whose
 * `@vitest-environment jsdom` docblock is being honoured perfectly. Nothing about the
 * failure points at the Node upgrade that caused it, which is why it reads as a broken
 * environment directive.
 *
 * Removing the global is what restores the intended behaviour: with nothing of Node's in
 * the way, `populateGlobal` copies jsdom's real `Storage` across, one fresh per-file
 * instance with the quota, `key()`, `length` and string-coercion semantics the browser has
 * and the tests were written against. A hand-rolled stand-in installed from a setup file
 * would satisfy the same assertions while quietly being a different object from
 * `window.localStorage`, which is the sort of divergence a test suite exists to catch.
 *
 * The flag is passed only when Node actually has the global, rather than gated on a
 * version comparison. The two facts are the same fact: the global exists only on a Node
 * that implements the feature, and a Node that implements it necessarily accepts the
 * `--no-` form of its flag. On a Node old enough to lack both, this list stays empty and
 * an unknown-option crash in every worker is impossible.
 */
const disableNodeWebStorage =
    Object.getOwnPropertyDescriptor(globalThis, "localStorage") === undefined
        ? []
        : ["--no-experimental-webstorage"];

export default defineConfig({
    /**
     * Single-file components, so a test can mount one.
     *
     * Almost every test in this workspace is a Node-environment unit test over a plain
     * `.ts` module, and none of them need this. A few behaviours cannot be tested that
     * way at all, though: whether opening a settings surface at an anchor really moves
     * focus onto that row, whether a search really hides a section, whether a close
     * button really emits. Those are properties of the rendered component, and a test
     * that asserts them against a hand-rolled stand-in proves nothing about the thing
     * that ships. Vitest needs the SFC transform to compile the real one.
     *
     * Additive on purpose: the plugin only touches `.vue` files, so every existing test
     * runs exactly as before, and a test that wants a DOM opts into one per file with a
     * `@vitest-environment jsdom` docblock rather than the whole suite paying for it.
     */
    plugins: [vue()],
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root has to be restated here or every package stops resolving.
            allow: [workspaceRoot, committedScreenshots, committedDocs],
        },
    },
    /**
     * The build-time constants esbuild injects into the app bundles.
     *
     * The tests do not go through esbuild, so without these every module that reads one
     * throws "__WORLDLENS_SOURCE_COMMIT__ is not defined" the moment it is imported. Null is
     * the honest value here: a test run has no build provenance, and null is exactly what a
     * build that could not establish one produces, so the surfaces are exercised in their
     * unavailable state rather than against an invented commit.
     */
    define: {
        __WORLDLENS_BUILT_AT__: "null",
        __WORLDLENS_SOURCE_COMMIT__: "null",
    },

    test: {
        include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],

        /**
         * Vitest's default is five seconds, and this suite failed it three times in one
         * afternoon - the real-git history tests, then the archive test that writes and
         * hashes a megabyte - always on CI and never on a developer machine. None of them
         * were slow: they were competing with a dozen other workers for one shared runner's
         * disk, and five seconds is a bet on the hardware rather than a statement about
         * the code.
         *
         * Thirty seconds is still far below anything an actually-hung test would reach, so
         * a genuine hang is still reported as a hang rather than waited out. Tests that
         * really do need longer keep their own explicit timeout, which now reads as a
         * deliberate claim about that test instead of as a patch applied after CI found it.
         */
        testTimeout: 30_000,
        hookTimeout: 30_000,

        /**
         * One isolated fork: every file still runs, and Vitest still recycles the child
         * process after each file because `poolOptions.forks.isolate` remains at its
         * default `true`. This is deliberately different from `singleFork: true`, which
         * keeps one process alive for the whole suite and previously reached a real V8
         * out-of-memory abort around a 4 GB heap after 432 files.
         *
         * Two isolated forks used to be the compromise between that OOM and Vitest's
         * worker-to-main `onTaskUpdate` timeout. The suite later grew to 699 files, and on
         * Node 22.22.0 the two-fork setting acquired a second deterministic failure: twice
         * in succession it reached the mounted `App.test.ts` phase, then Tinypool threw
         * `ERR_IPC_CHANNEL_CLOSED` from `ProcessWorker.send` before Vitest could print a
         * summary. No assertion or file failure was named. A process snapshot during the
         * second run found one worker near 3.3 GB while the other was about 597 MB. The
         * exact three-file UI boundary passed separately (3 files, 78 tests), so ignoring
         * the channel error would have weakened the gate rather than fixed a test.
         *
         * The bounded one-fork run kept file isolation, eliminated the simultaneous
         * high-memory worker, and reached a normal full-suite summary under the same
         * Node 22.22.0 and pnpm 10.33.0 toolchain: 694 files passed and 5 skipped (699
         * total), 10,096 tests passed and 33 skipped (10,129 total), exit 0, in 867.17s.
         * `vitestPoolPolicy.test.ts` keeps the distinction reviewable: one isolated fork
         * is required, while the memory-unsafe `singleFork` option remains prohibited.
         *
         * `run-tests-ci.mjs` still retries only its older, summary-backed RPC-heartbeat
         * signature. A channel closure without a summary remains fatal; this setting
         * prevents the reproduced crash instead of teaching the wrapper to wave it past.
         */
        pool: "forks",
        poolOptions: {
            forks: {
                maxForks: 1,
                minForks: 1,

                // Additive to whatever the runner already passes; see the comment on the
                // constant for why jsdom's storage cannot exist while Node's does. It is
                // orthogonal to how many forks there are - the flag decides what each worker
                // process has, the counts decide how many of them run.
                execArgv: disableNodeWebStorage,
            },
        },
        server: {
            deps: {
                /**
                 * Vuetify's published components carry side-effect `.css` imports beside
                 * each `.mjs`. Left external they are loaded by Node, which has no idea
                 * what a stylesheet is and refuses the whole module; processed by Vite
                 * they are handled and dropped. Only tests that actually import Vuetify
                 * are affected, and no test imports it without meaning to.
                 */
                inline: ["vuetify"],
            },
        },
    },
});
