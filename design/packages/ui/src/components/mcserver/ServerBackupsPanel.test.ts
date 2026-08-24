import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ServerBackupsPanel.vue", import.meta.url), "utf8");

describe("ServerBackupsPanel", () => {
    it("keeps restore authorization and mounted-world selection on the real panel", () => {
        expect(source).toContain("backupIssueRestoreChallenge");
        expect(source).toContain("backupAuthorizeRestore");
        expect(source).toContain("backupRestoreStep");
        expect(source).toContain("VSelect");
        expect(source).toContain("worldOptions");
    });

    it("keeps busy operations cancellable and controls disabled", () => {
        expect(source).toContain("backupCancel");
        expect(source).toContain("VProgressLinear");
        expect(source).toContain("v-if=\"busy\"");
        expect(source).toContain("!targetValid");
    });
});
