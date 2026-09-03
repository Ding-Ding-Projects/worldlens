import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The bridge literal moved to `@worldlens/bridge` so the same object can be built over
 * Electron IPC here and over HTTP in a hosted browser. These two guards follow it: what
 * they check has not changed at all - that these two methods reach their own channels with
 * their own payloads - only where the lines they check now live, and that the call is now
 * `transport.invoke` rather than `ipcRenderer.invoke`.
 */
const source = readFileSync(
    fileURLToPath(new URL("../../../bridge/src/factory.ts", import.meta.url)),
    "utf8",
);

describe("the preload CI Pages bootstrap bridge", () => {
    it("carries publishToPages in both the method signature and IPC payload", () => {
        // Asserted as two facts rather than one long regex over the whole declaration. The
        // previous form pinned the formatting as well as the contract - no trailing comma
        // after the last parameter, and a newline between the arrow and the call - and broke
        // when the signature was wrapped across lines while every parameter it cares about
        // stayed exactly where it was.
        const signature = source.slice(
            source.indexOf("bootstrapCiRepository:"),
            source.indexOf("cirender:bootstrap"),
        );
        for (const parameter of ["owner", "repo", "accountId", "publishToPages"]) {
            expect(signature, `${parameter} left the bootstrap signature`).toContain(parameter);
        }
        expect(source).toContain(
            'transport.invoke("cirender:bootstrap", { owner, repo, accountId, publishToPages })',
        );
    });


    it("its negative regression turns red when the payload field disappears", () => {
        const broken = source.replace(
            "{ owner, repo, accountId, publishToPages }",
            "{ owner, repo, accountId }",
        );
        expect(broken).not.toMatch(
            /transport\.invoke\("cirender:bootstrap", \{ owner, repo, accountId, publishToPages \}\)/,
        );
    });
});

describe("the preload CI render resume bridge", () => {
    it("sends only the recorded sync id to the dedicated resume channel", () => {
        expect(source).toMatch(
            /resumeCiRender:\s*\(\s*syncId(?::\s*\w+)?\s*\)\s*=>\s*transport\.invoke\("cirender:resume", syncId\)/,
        );
    });

    it("turns red when resume is accidentally wired back to start", () => {
        const broken = source.replace(
            'transport.invoke("cirender:resume", syncId)',
            'transport.invoke("cirender:start", syncId)',
        );
        expect(broken).not.toMatch(
            /resumeCiRender:\s*\(\s*syncId(?::\s*\w+)?\s*\)\s*=>\s*transport\.invoke\("cirender:resume", syncId\)/,
        );
    });
});
