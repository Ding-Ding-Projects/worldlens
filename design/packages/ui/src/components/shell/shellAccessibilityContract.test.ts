import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
    return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("Material shell accessibility contract", () => {
    it("provides a keyboard skip path to a focusable main landmark", () => {
        const titleBar = source("./AppTitleBar.vue");
        const app = source("../../App.vue");
        const chromeCopy = source("../../copy/surfaces/chrome.ts");

        expect(titleBar).toContain('t("window.skipToMain", "Skip to main content")');
        expect(chromeCopy).toContain('"window.skipToMain": { en: "Skip to main content"');
        expect(titleBar).toContain(':href="`#${props.mainContentId}`"');
        expect(app).toContain('<v-main :id="MAIN_CONTENT_ID" class="mb-main" tabindex="-1">');
    });

    it("connects every disclosure to the stable panel it controls", () => {
        const rail = source("./AppRail.vue");
        const status = source("./StatusStrip.vue");
        const problems = source("./ProblemsPanel.vue");
        const notifications = source("./NotificationPanel.vue");
        const docked = source("../settings/DockedSurface.vue");

        expect(rail).toContain(":aria-controls=\"notificationsPanelId");
        expect(rail).toContain(":aria-controls=\"settingsPanelId");
        expect(status).toContain(":aria-controls=\"problemsPanelId");
        expect(problems).toContain(':id="panelId"');
        expect(notifications).toContain(":id=\"panelId ?? 'worldlens-notifications-panel'\"");
        expect(docked).toContain(':id="`docked.${props.surfaceId}.panel`"');
    });

    it("gives the anchored history dialog semantics, Escape and focus restoration", () => {
        const notifications = source("./NotificationPanel.vue");

        expect(notifications).toContain('role="dialog"');
        expect(notifications).toContain('aria-modal="false"');
        expect(notifications).toContain('@keydown.esc.stop="close"');
        expect(notifications).toContain("panel.value?.focus()");
        expect(notifications).toContain("target?.focus()");
    });

    it("connects nested disclosures to the content they expand", () => {
        const renders = source("../renders/RendersScreen.vue");
        const preview = source("../preview/PreviewScreen.vue");
        const glossary = source("../glossary/GlossaryTerm.vue");

        expect(renders).toContain(':aria-controls="`${renderDetailIdPrefix}-${rowIndex}`"');
        expect(renders).toContain(':id="`${renderDetailIdPrefix}-${rowIndex}`"');
        expect(preview).toContain(':aria-controls="networkExplainId"');
        expect(preview).toContain(':id="networkExplainId"');
        expect(glossary).toContain(':aria-controls="definitionId"');
        expect(glossary).toContain(':id="definitionId"');
    });

    it("keeps shell motion disabled under the operating-system preference", () => {
        const rail = source("./AppRail.vue");
        const titleBar = source("./AppTitleBar.vue");

        expect(rail).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.wl-rail-pill[\s\S]*transition: none/);
        expect(titleBar).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mb-titlebar-skip[\s\S]*transition: none/,
        );
    });

    it("gives the status strip's progress bar a value the shell actually supplies", () => {
        // The bar existed and the shell never bound it, so it could not appear no matter what
        // was rendering. Binding is the contract; the unit is the other half of it, because the
        // clamp is a percentage clamp and a 0..1 source would pin the bar at 100 for every
        // render. `ActiveRenderRow.percent` is the 0-100 value this reads.
        const app = source("../../App.vue");
        const status = source("./StatusStrip.vue");
        const numbers = source("./shellNumbers.ts");

        expect(app).toContain(':render-progress="renderProgressPercent"');
        expect(app).toMatch(/renderProgressPercent = computed<number \| null>/);
        expect(app).toContain("row.percent");
        expect(status).toContain("safeProgressPercent(props.renderProgress)");
        expect(numbers).toContain("Math.min(100, Math.max(0, value))");
        expect(numbers).not.toContain("* 100");
    });

    it("uses semantic buttons for Home cards and catalogue rows", () => {
        const home = source("./HomeCatalogues.vue");
        const catalogue = source("./CataloguePage.vue");

        expect(home).toContain('class="wl-hero__body mb-interactive"');
        expect(home).toContain('class="wl-card__body mb-interactive"');
        expect(catalogue).toContain('class="wl-row mb-interactive"');
        expect(home).not.toMatch(/<div[^>]+@click=/);
        expect(catalogue).not.toMatch(/<div[^>]+@click=/);
    });
});
