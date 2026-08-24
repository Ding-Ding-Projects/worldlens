// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { createSiteUniversalContractsView, disposeSiteUniversalContractsView } from "./siteContracts.js";

const appearanceStub = { store: { subscribe: () => () => undefined } } as never;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe("mounted universal contracts surface", () => {
    it("mounts keyboard and ARIA reachable controls without a network call", () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const view = createSiteUniversalContractsView({ i18n: new I18n(new Preferences()), appearance: appearanceStub });
        document.body.append(view);
        expect(view.querySelector("#contract-appearance")).not.toBeNull();
        expect(view.querySelector("#contract-authenticator")).not.toBeNull();
        expect(view.querySelector("#contract-support")).not.toBeNull();
        expect(view.querySelector("#contract-ladder")).not.toBeNull();
        expect(view.querySelectorAll("[aria-label]").length).toBeGreaterThan(4);
        const first = view.querySelector<HTMLElement>("button");
        expect(first).not.toBeNull();
        first?.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
        expect(document.querySelector('[role="menu"]')).not.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps the local QR image and camera paths explicit when browser capabilities are absent", () => {
        const view = createSiteUniversalContractsView({ i18n: new I18n(new Preferences()), appearance: appearanceStub });
        document.body.append(view);
        const image = view.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
        expect(image?.accept).toContain("image/");
        expect(view.textContent).toContain("QR image file, local only");
        expect(view.querySelector("video")).not.toBeNull();
        expect(view.querySelector('input[placeholder^="otpauth"]')?.getAttribute("type")).toBe("password");
        expect(view.querySelector('input[type="password"]')).not.toBeNull();
        expect(view.outerHTML).not.toContain("secret=");
        expect(view.outerHTML).not.toContain("JBSWY3DPEHPK3PXP");
    });

    it("exposes a lifecycle cleanup hook for timers, camera streams, and subscriptions", () => {
        const view = createSiteUniversalContractsView({ i18n: new I18n(new Preferences()), appearance: appearanceStub });
        document.body.append(view);
        expect(() => disposeSiteUniversalContractsView(view)).not.toThrow();
        expect(view.dataset.cleanup).toBe("site-contracts-local-only");
    });
});
