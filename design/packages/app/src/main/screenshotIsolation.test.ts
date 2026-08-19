import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const main = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
const launcher = readFileSync(
    fileURLToPath(
        new URL("../../../../../.claude/skills/run-worldlens/launch-headless.cmd", import.meta.url),
    ),
    "utf8",
);

describe("screenshot-mode host-data isolation", () => {
    it("uses dedicated capture-only home and map-storage values", () => {
        expect(launcher).toContain("WORLDLENS_SCREENSHOT_HOME=C:\\Worldlens-Capture");
        expect(launcher).toContain("WORLDLENS_SCREENSHOT_STORAGE=C:\\Worldlens-Capture\\maps");
        expect(main).toContain("process.env.WORLDLENS_SCREENSHOT_HOME?.trim()");
        expect(main).toContain("process.env.WORLDLENS_SCREENSHOT_STORAGE?.trim()");
    });

    it("passes the capture-only home into world discovery instead of the host profile", () => {
        expect(main).toMatch(/APPDATA:\s*screenshotHome/);
        expect(main).toMatch(/USERPROFILE:\s*screenshotHome/);
        expect(main).toMatch(/HOME:\s*screenshotHome/);
        expect(main).toMatch(/\{ home: screenshotHome \}/);
    });

    it("turns red when either capture-only launcher value disappears", () => {
        const broken = launcher
            .replace(/^set "WORLDLENS_SCREENSHOT_HOME=.*\r?\n/m, "")
            .replace(/^set "WORLDLENS_SCREENSHOT_STORAGE=.*\r?\n/m, "");
        expect(broken).not.toContain("WORLDLENS_SCREENSHOT_HOME=");
        expect(broken).not.toContain("WORLDLENS_SCREENSHOT_STORAGE=");
    });
});
