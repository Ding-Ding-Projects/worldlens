/**
 * The rail's job-shortcut inventory, locked by hand.
 *
 * `App.vue`'s `RAIL_JOB_SHORTCUT_IDS` is a hand-written list, deliberately - see its own doc
 * comment: a job earns a rail shortcut on purpose, not by existing in `jobRegistry.ts`. That
 * means nothing derives this inventory the way `paletteCoverage.test.ts` derives its own from
 * `JOB_IDS`, so this file is the guard: it reads `App.vue`'s real source and asserts the exact
 * set of ids the user asked for is still there, wired to a real job, with no id left dangling
 * after a rename on the `jobRegistry.ts` side.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { JOB_IDS } from "./jobRegistry.js";

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(here, "../../App.vue"), "utf8").replace(/\r/g, "");

/** Exactly what was asked for: Der Machine rendering, Docker hosting, SSH remote hosting,
 *  Chunker, Backups, Minecraft servers, and the world downloader. */
const REQUIRED_SHORTCUT_JOB_IDS = [
    "cirender",
    "dockerHosting",
    "remoteHosting",
    "chunker",
    "backups",
    "mcservers",
    "worldDownloader",
] as const;

function railJobShortcutIdsInSource(): string[] {
    const start = appSource.indexOf("const RAIL_JOB_SHORTCUT_IDS = [");
    expect(start, "App.vue should declare RAIL_JOB_SHORTCUT_IDS").toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf("] as const;", start);
    const body = appSource.slice(start, end);
    return [...body.matchAll(/PAGE_[A-Z_]+/g)].map((match) => match[0]);
}

describe("the rail's job shortcuts", () => {
    it("names every requested job as a real job the registry knows about", () => {
        for (const jobId of REQUIRED_SHORTCUT_JOB_IDS) {
            expect(JOB_IDS, `${jobId} is not a real job id`).toContain(jobId);
        }
    });

    it("wires exactly the requested set of PAGE_ constants into the shortcut list", () => {
        const constants = railJobShortcutIdsInSource();
        // Every PAGE_ constant referenced resolves to a `const NAME = "id";` declaration whose
        // string value is one of the required job ids - checked by pattern rather than by
        // hand-maintaining a second id-to-constant map that could itself drift.
        const resolved = constants.map((name) => {
            const match = appSource.match(new RegExp(`const ${name} = "([^"]+)";`));
            return match?.[1] ?? `<unresolved:${name}>`;
        });
        expect(resolved.sort()).toEqual([...REQUIRED_SHORTCUT_JOB_IDS].sort());
    });

    it("passes the shortcut list into the real AppRail instance", () => {
        expect(appSource).toMatch(/:job-shortcuts="railJobShortcuts"/);
        expect(appSource).toMatch(/@open-job="revealPage\(\$event\)"/);
    });
});
