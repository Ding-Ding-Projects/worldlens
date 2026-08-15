import { defineConfig } from "@playwright/test";

/**
 * The Kid Mode capture harness. Mirrors `packages/app/playwright.config.ts` exactly: one Electron
 * instance per file, no parallelism inside it (a second worker would race the same window), no
 * retries (a capture that "passes" because it silently retried is not evidence), and the freshness
 * guard runs before anything is launched at all.
 */
export default defineConfig({
    globalSetup: "./test/freshBundle.ts",
    testDir: "./test",
    testMatch: /.*\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120_000,
    reporter: [["list"]],
    use: {
        trace: "retain-on-failure",
    },
});
