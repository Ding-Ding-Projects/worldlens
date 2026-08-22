/**
 * The check that would have caught a sunset upstream API, and did not exist.
 *
 * Every other test here injects a `fetchText` that answers the way each upstream API
 * answered on the day the fixture was written. That is the right shape for a unit test - a
 * suite that needed four public APIs would be a suite nobody runs - but it means the
 * catalogue was only ever verified against a recording of the past.
 *
 * Meanwhile PaperMC retired its v2 API. Every request began answering 410, the fetcher
 * turned that into an empty version list, and the interface honestly reported that no
 * versions were catalogued for Paper. Nothing was broken locally, no test went red, and the
 * most commonly chosen server flavour simply had nothing to choose from. The only way to
 * see it was to ask the real API.
 *
 * Opt-in, because it needs the network and a test that fails on a train is a test that gets
 * deleted rather than fixed:
 *   WORLDLENS_CATALOGUE_NETWORK=1 npx vitest run catalogue.realNetwork
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FLAVOUR_IDS, refreshCatalogue } from "./catalogue.js";

const ENABLED = process.env.WORLDLENS_CATALOGUE_NETWORK === "1";
const suite = ENABLED ? describe : describe.skip;

suite("every flavour's real upstream API still answers", () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "mcserver-catalogue-net-"));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("returns at least one real version for every flavour it claims to catalogue", async () => {
        const result = await refreshCatalogue({ dataDir: dir });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Reported failures first: they name the flavour and the reason, which is far more
        // useful than an empty list further down.
        expect(result.value.failures, "an upstream API refused this fetch").toEqual([]);

        for (const flavour of FLAVOUR_IDS) {
            const entry = result.value.flavours.find((f) => f.flavour === flavour);
            // An empty list is the exact symptom a sunset endpoint produces. It is not a
            // crash and it does not look like one, which is why it needs asserting.
            expect(entry?.versions.length ?? 0, `${flavour} returned no versions`).toBeGreaterThan(0);
        }
    }, 120_000);

    it("gives every catalogued version a usable download and a plausible shape", async () => {
        const result = await refreshCatalogue({ dataDir: dir });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        for (const flavour of result.value.flavours) {
            for (const version of flavour.versions) {
                expect(version.version, `${flavour.flavour} had a nameless version`).not.toBe("");
                if (version.downloadUrl !== null) {
                    expect(version.downloadUrl.startsWith("https://"), version.downloadUrl).toBe(true);
                }
                if (version.sha256 !== null) {
                    // A digest that is not a digest would fail verification much later, at
                    // install time, where it reads as a corrupt download.
                    expect(version.sha256).toMatch(/^[0-9a-f]{64}$/);
                }
                if (version.releasedAt !== null) {
                    expect(Number.isNaN(new Date(version.releasedAt).getTime())).toBe(false);
                }
            }
        }
    }, 120_000);
});
