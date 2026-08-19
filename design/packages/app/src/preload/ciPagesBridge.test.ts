import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

describe("the preload CI Pages bootstrap bridge", () => {
    it("carries publishToPages in both the method signature and IPC payload", () => {
        expect(source).toMatch(
            /bootstrapCiRepository:\s*\(owner, repo, accountId, publishToPages\)\s*=>\s*\r?\n\s*ipcRenderer\.invoke\("cirender:bootstrap", \{ owner, repo, accountId, publishToPages \}\)/,
        );
    });

    it("its negative regression turns red when the payload field disappears", () => {
        const broken = source.replace(
            "{ owner, repo, accountId, publishToPages }",
            "{ owner, repo, accountId }",
        );
        expect(broken).not.toMatch(
            /ipcRenderer\.invoke\("cirender:bootstrap", \{ owner, repo, accountId, publishToPages \}\)/,
        );
    });
});

describe("the preload CI render resume bridge", () => {
    it("sends only the recorded sync id to the dedicated resume channel", () => {
        expect(source).toMatch(
            /resumeCiRender:\s*\(syncId\)\s*=>\s*ipcRenderer\.invoke\("cirender:resume", syncId\)/,
        );
    });

    it("turns red when resume is accidentally wired back to start", () => {
        const broken = source.replace(
            'ipcRenderer.invoke("cirender:resume", syncId)',
            'ipcRenderer.invoke("cirender:start", syncId)',
        );
        expect(broken).not.toMatch(
            /resumeCiRender:\s*\(syncId\)\s*=>\s*ipcRenderer\.invoke\("cirender:resume", syncId\)/,
        );
    });
});
