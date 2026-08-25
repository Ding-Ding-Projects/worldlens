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
        expect(source).toMatch(
            /bootstrapCiRepository:\s*\(\s*owner(?::\s*\w+)?,\s*repo(?::\s*\w+)?,\s*accountId(?::\s*\w+)?,\s*publishToPages(?::\s*\w+)?\s*\)\s*=>\s*\r?\n\s*transport\.invoke\("cirender:bootstrap", \{ owner, repo, accountId, publishToPages \}\)/,
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
