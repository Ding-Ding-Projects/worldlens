/**
 * That the Minecraft server hosting screens are actually connected to the shell they run in.
 *
 * Modelled directly on `locks/lockShellWiring.test.ts`, which exists because of the exact
 * defect this guards against: every unit test for a feature can pass - the model, the store,
 * the screens - while the feature is entirely unreachable in the running application because
 * `App.vue` never called `provideServerStore`, or never declared the catalogue/job entries a
 * click routes through. Nothing throws in that state; a search for "Minecraft servers" just
 * finds nothing.
 *
 * These assertions read the real source files rather than mounting a component with an
 * injected store, because an injected store supplies the very wiring that might be missing.
 * Comments are stripped and whitespace flattened before matching, so a commented-out call
 * cannot satisfy an assertion the way a bare substring check could.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CATALOGUE_IDS } from "../shell/featureTargets.js";
import { CATALOGUES, findCatalogue } from "../shell/catalogues.js";
import { JOB_IDS, findJob } from "../shell/jobRegistry.js";

/** Read with line endings normalised: this repository can be checked out CRLF. */
function source(relative: string): string {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Source with comments removed and whitespace flattened. See the file header: a comment or a
 * reformatted line must never be able to satisfy an assertion about live code.
 */
function code(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*/g, "$1 ")
        .replace(/\s+/g, " ");
}

const APP_CODE = code(source("../../App.vue"));

describe("the job and catalogue registries know about server hosting", () => {
    it("declares a sixth catalogue for hosting a server", () => {
        expect(CATALOGUE_IDS).toContain("host");
        expect(CATALOGUES.map((c) => c.id)).toContain("host");
        expect(findCatalogue("host")?.features.length).toBeGreaterThan(0);
    });

    it("declares an mcservers job distinct from the existing rendered-maps 'servers' job", () => {
        expect(JOB_IDS).toContain("mcservers");
        expect(JOB_IDS).toContain("servers");
        expect(findJob("mcservers")).not.toBeNull();
    });

    it("every host-catalogue feature routes to the mcservers job", () => {
        const host = findCatalogue("host");
        expect(host).not.toBeNull();
        for (const feature of host!.features) {
            expect(feature.target).toMatchObject({ kind: "job", jobId: "mcservers" });
        }
    });
});

describe("the renderer provides one server store, from the real host", () => {
    it("calls provideServerStore at the top level of App.vue", () => {
        expect(APP_CODE).toContain("provideServerStore(mcServerStore)");
    });

    it("builds that store from the resolved shell host, not a hostless default", () => {
        expect(APP_CODE).toContain("createServerStore({ host: resolveServerHost() })");
    });

    it("renders the mcservers job's content with the real screens", () => {
        expect(APP_CODE).toContain("<template #mcservers>");
        expect(APP_CODE).toContain("<ServerListScreen");
        expect(APP_CODE).toContain("<WebConsolePanel");
        expect(APP_CODE).toContain("<CreateServerWizard");
    });

    it("has exactly one active-owner guard for every server surface and one back route", () => {
        expect(APP_CODE.match(/mcServerOwner === 'kid'/g)).toHaveLength(1);
        expect(APP_CODE.match(/mcServerOwner === 'host'/g)).toHaveLength(1);
        expect(APP_CODE.match(/mcServerOwner === 'work'/g)).toHaveLength(1);
        expect(APP_CODE.match(/@back="closeMcServerPanel"/g)).toHaveLength(3);
        expect(APP_CODE.match(/@forgotten="forgetMcServerPanel"/g)).toHaveLength(3);
        expect(APP_CODE.match(/:return-server-id="mcServerReturnId"/g)).toHaveLength(3);
        expect(APP_CODE).toContain("function closeMcServerPanel()");
        expect(APP_CODE).toContain("mcServerReturnId.value = mcServerOpenId.value");
    });
});

describe("shared Minecraft modal ownership", () => {
    it("keeps three shell mount sites but activates only the owner for the current shell tree", () => {
        expect((APP_CODE.match(/<CreateServerWizard/g) ?? []).length).toBe(3);
        expect((APP_CODE.match(/mcServerModalOwner === 'kid'/g) ?? []).length).toBeGreaterThan(0);
        expect((APP_CODE.match(/mcServerModalOwner === 'adult-host'/g) ?? []).length).toBeGreaterThan(0);
        expect((APP_CODE.match(/mcServerModalOwner === 'work'/g) ?? []).length).toBeGreaterThan(0);
        expect(APP_CODE).toContain("const mcServerModalOwner = computed");
    });
});
