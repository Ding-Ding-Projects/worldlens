import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "packages/ui/src/App.vue"), "utf8").replace(/\r\n?/g, "\n");

function projectsMounts(): string[] {
    return [...appSource.matchAll(/<ProjectsScreen\b([\s\S]*?)\n\s*\/>/g)].map((match) => match[1] ?? "");
}

describe("ProjectsScreen shell handoff contract", () => {
    it("wires every real ProjectsScreen mount to the GitHub and Pages handoffs", () => {
        const mounts = projectsMounts();
        expect(mounts).toHaveLength(2);
        for (const mount of mounts) {
            expect(mount).toMatch(/:can-open-ci="true"/);
            expect(mount).toMatch(/@cloud-render="openCiRender"/);
            expect(mount).toMatch(/@publish-existing="openPagesForWorld"/);
            expect(mount).toMatch(/:pages-state="pagesProjectState"/);
        }
    });

    it("keeps the typed Pages handoff and initial render id in the shell", () => {
        expect(appSource).toMatch(/function openPagesForWorld\(record: ProjectPagesStateRecord\)/);
        expect(appSource).toMatch(/:initial-render-id="pagesRenderIdToOpen"/);
    });
});
