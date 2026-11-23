import { describe, expect, it } from "vitest";
import { buildRequest, defaultForm, formProblem } from "./applianceHost.js";

describe("appliance form: the whole WorldLens app", () => {
    it("needs a digest-pinned hosted image and a real password, and sends neither until asked", () => {
        // The published image arrives filled in; a tag instead of a digest is refused.
        expect(defaultForm().appImage).toMatch(/worldlens-hosted@sha256:[a-f0-9]{64}$/);
        const form = { ...defaultForm(), askAccessCode: false, runApp: true, appImage: "ghcr.io/x/worldlens-hosted:latest" };
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

describe("appliance form: a Minecraft server", () => {
    it("needs both images pinned and the EULA accepted", () => {
        const form = { ...defaultForm(), askAccessCode: false, runServer: true };
        expect(formProblem(form, "/maps/a", [])).toMatch(/server image/);
        const serverImage = `docker.io/itzg/minecraft-server@sha256:${"1".repeat(64)}`;
        const siteImage = `ghcr.io/ding-ding-projects/worldlens-server-site@sha256:${"2".repeat(64)}`;
        expect(formProblem({ ...form, serverImage }, "/maps/a", [])).toMatch(/server-site/);
        expect(formProblem({ ...form, serverImage, siteImage }, "/maps/a", [])).toMatch(/EULA/);
        expect(
            formProblem({ ...form, serverImage, siteImage, eulaAccepted: true }, "/maps/a", []),
        ).toBeNull();
        expect(
            formProblem(
                { ...form, serverImage, siteImage, eulaAccepted: true, runApp: true },
                "/maps/a",
                [],
            ),
        ).toMatch(/not both/);
    });
});
