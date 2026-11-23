import { describe, expect, it } from "vitest";
import { buildRequest, defaultForm, formProblem } from "./applianceHost.js";

describe("appliance form: the whole WorldLens app", () => {
    it("needs a digest-pinned hosted image and a real password, and sends neither until asked", () => {
        const form = { ...defaultForm(), askAccessCode: false, runApp: true };
        expect(formProblem(form, "/maps/a", [])).toMatch(/pinned by digest/);
        const image = `ghcr.io/ding-ding-projects/worldlens-hosted@sha256:${"e".repeat(64)}`;
        expect(
            formProblem({ ...form, appImage: image, appPassword: "short" }, "/maps/a", []),
        ).toMatch(/8 characters/);
        expect(
            formProblem({ ...form, appImage: image, appPassword: "long enough" }, "/maps/a", []),
        ).toBeNull();
        // The request carries no password; the dialog adds only its SHA-256 as the workload.
        expect(
            JSON.stringify(
                buildRequest({ ...form, appImage: image, appPassword: "long enough" }, "/maps/a"),
            ),
        ).not.toContain("long enough");
    });
});
