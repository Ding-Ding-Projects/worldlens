import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVocabularyOutcomeSound } from "./outcomeSound.js";

const roots: string[] = [];
async function mediaRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "worldlens-cue-"));
    roots.push(root);
    await mkdir(join(root, "Media"));
    return root;
}
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("allowlisted local outcome audio", () => {
    it("returns only the selected system WAV without accepting paths", async () => {
        const root = await mediaRoot();
        const success = Buffer.from("RIFF\0\0\0\0WAVEsuccess");
        const invalid = Buffer.from("RIFF\0\0\0\0WAVEinvalid");
        await writeFile(join(root, "Media", "tada.wav"), success);
        await writeFile(join(root, "Media", "Windows Background.wav"), invalid);
        const options = { platform: "win32", windowsRoot: root };
        expect(await readVocabularyOutcomeSound("success", options)).toEqual({ available: true, dataUrl: `data:audio/wav;base64,${success.toString("base64")}` });
        expect(await readVocabularyOutcomeSound("invalid", options)).toEqual({ available: true, dataUrl: `data:audio/wav;base64,${invalid.toString("base64")}` });
        for (const cue of ["../tada.wav", { path: "tada.wav" }, null])
            expect(await readVocabularyOutcomeSound(cue, options)).toEqual({ available: false });
    });
    it("reports unavailable for missing, oversized, malformed and unsupported audio", async () => {
        const root = await mediaRoot();
        const options = { platform: "win32", windowsRoot: root };
        expect(await readVocabularyOutcomeSound("success", options)).toEqual({ available: false });
        await writeFile(join(root, "Media", "tada.wav"), "not wave audio");
        expect(await readVocabularyOutcomeSound("success", options)).toEqual({ available: false });
        await writeFile(join(root, "Media", "tada.wav"), Buffer.alloc(1_048_577));
        expect(await readVocabularyOutcomeSound("success", options)).toEqual({ available: false });
        expect(await readVocabularyOutcomeSound("success", { ...options, platform: "linux" })).toEqual({ available: false });
    });
});
