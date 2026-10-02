/**
 * The world downloader's job is actually reachable from the shell, not merely registered.
 *
 * `jobRegistry.ts` can list a job whose tab renders `TabbedNavigation`'s own honest "this build
 * has no content for that page" panel forever, if `App.vue` never grew the matching named slot -
 * a registration with nothing behind it is functionally identical to no registration at all,
 * except that it also makes `paletteCoverage.test.ts` claim the job is reachable when the tab it
 * points at is empty. This reads `App.vue`'s real source (mounting the ~3800-line shell in a unit
 * suite is not what these suites do) and proves three things hold together: the job exists in
 * the registry, `App.vue` imports the real screen, and both the adult Work pane and the Kid job
 * strip actually render it rather than leaving the slot unfilled.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { JOB_IDS } from "./jobRegistry.js";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../../App.vue"), "utf8").replace(/\r/g, "");

describe("the world downloader's job is reachable, not just registered", () => {
    it("is a real job id in the shared registry", () => {
        expect(JOB_IDS).toContain("worldDownloader");
    });

    it("App.vue imports the real screen component", () => {
        expect(appSource).toMatch(
            /import WorldDownloaderScreen from "\.\/components\/worlddownloader\/WorldDownloaderScreen\.vue";/,
        );
    });

    it("declares a page id matching the job id, for the palette's open-page route", () => {
        expect(appSource).toMatch(/const PAGE_WORLD_DOWNLOADER = "worldDownloader";/);
    });

    it("lists that page for the command palette's own pages prop", () => {
        expect(appSource).toMatch(/id:\s*PAGE_WORLD_DOWNLOADER,/);
    });

    it("renders the real screen in both the adult Work pane and the Kid job strip", () => {
        const slotBlocks = [...appSource.matchAll(/<template #worldDownloader>\s*<WorldDownloaderScreen\s*\/>\s*<\/template>/g)];
        expect(
            slotBlocks.length,
            "expected one #worldDownloader slot rendering the real screen in the adult shell and one in the kid shell",
        ).toBe(2);
    });
});
