import { describe, expect, it } from "vitest";
import { buildCloudRenderProject } from "./cloudConfig.js";

describe("cloud-first project defaults", () => {
    it("persists the upstream Java engine explicitly for the GitHub Actions route", () => {
        const result = buildCloudRenderProject(
            { worldFolder: "C:/Users/example/Documents/Minecraft/saves/World" },
            { now: "2026-08-19T12:00:00-04:00", id: "project-cloud", appVersion: "test" },
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.project.render.route).toBe("github-actions");
        expect(result.project.render.engine).toBe("upstream-java");
    });
});
