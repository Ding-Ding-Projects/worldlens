/**
 * @vitest-environment jsdom
 *
 * What these tests are actually guarding is the decoupling, not the rename.
 *
 * Renaming a label is easy to get right and easy to test. The failure this feature could
 * plausibly ship is the one another project already lived through: a display name that some
 * other part of the system quietly derives an identifier from, so that retitling the product
 * orphans everything the old identifier addressed. So the assertions below spend most of their
 * effort proving that stored preferences survive a rename untouched, and that the name which
 * leaves this browser is never the one the visitor typed.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Preferences } from "../platform/Preferences.js";
import {
    MAX_DISPLAY_NAME_LENGTH,
    ProductIdentity,
    SHIPPED_PRODUCT_NAME,
    applyProductName,
    normaliseDisplayName,
} from "./productIdentity.js";

function freshPrefs(): Preferences {
    window.localStorage.clear();
    return new Preferences(window.localStorage);
}

describe("ProductIdentity", () => {
    let prefs: Preferences;

    beforeEach(() => {
        prefs = freshPrefs();
    });

    it("starts on the shipped name with no stored choice", () => {
        const identity = new ProductIdentity(prefs);
        expect(identity.displayName).toBe(SHIPPED_PRODUCT_NAME);
        expect(identity.isShippedName).toBe(true);
    });

    it("renders the chosen name and survives a reload of the same storage", () => {
        new ProductIdentity(prefs).setDisplayName("Andyville Atlas");
        expect(new ProductIdentity(prefs).displayName).toBe("Andyville Atlas");
    });

    it("treats a whitespace-only name as no choice rather than as a name made of spaces", () => {
        const identity = new ProductIdentity(prefs);
        identity.setDisplayName("   ");
        expect(identity.displayName).toBe(SHIPPED_PRODUCT_NAME);
        expect(identity.isShippedName).toBe(true);
    });

    it("truncates rather than refusing an over-long name, so nothing typed is thrown away", () => {
        const identity = new ProductIdentity(prefs);
        identity.setDisplayName("x".repeat(MAX_DISPLAY_NAME_LENGTH + 40));
        expect(identity.displayName).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
    });

    it("resets to the shipped name in one action", () => {
        const identity = new ProductIdentity(prefs);
        identity.setDisplayName("Andyville Atlas");
        identity.reset();
        expect(identity.isShippedName).toBe(true);
    });

    it("stores nothing when the shipped name is in force, so a choice stays distinguishable", () => {
        const identity = new ProductIdentity(prefs);
        identity.setDisplayName("Andyville Atlas");
        identity.reset();
        expect(window.localStorage.getItem("mbm-site:identity.displayName")).toBeNull();
    });

    /*
     * The load-bearing one. A rename is allowed to change what the page says and nothing else,
     * so an unrelated preference written before the rename has to be byte-identical after it.
     */
    it("leaves every other stored preference untouched", () => {
        prefs.write("theme.mode", "dark");
        prefs.write("settings.type.scale", "1.25");
        const before = { ...window.localStorage };

        new ProductIdentity(prefs).setDisplayName("Andyville Atlas");

        expect(window.localStorage.getItem("mbm-site:theme.mode")).toBe("dark");
        expect(window.localStorage.getItem("mbm-site:settings.type.scale")).toBe("1.25");
        expect(Object.keys(before).every((key) => key in window.localStorage)).toBe(true);
    });

    it("reports the shipped name for anything that leaves this browser", () => {
        const identity = new ProductIdentity(prefs);
        identity.setDisplayName("Andyville Atlas");
        expect(identity.reportingName).toBe(SHIPPED_PRODUCT_NAME);
        expect(identity.reportingName).not.toBe(identity.displayName);
    });

    it("notifies subscribers on a real change and not on a no-op", () => {
        const identity = new ProductIdentity(prefs);
        let calls = 0;
        identity.subscribe(() => {
            calls += 1;
        });
        identity.setDisplayName("Andyville Atlas");
        identity.setDisplayName("Andyville Atlas");
        expect(calls).toBe(1);
    });
});

describe("applyProductName", () => {
    it("drives the document title and every wordmark on the page", () => {
        const prefs = freshPrefs();
        const identity = new ProductIdentity(prefs);
        const word = document.createElement("span");
        word.className = "mb-brand-word";
        word.textContent = SHIPPED_PRODUCT_NAME;
        document.body.append(word);

        identity.setDisplayName("Andyville Atlas");
        applyProductName(identity);

        expect(document.title).toBe("Andyville Atlas");
        expect(word.textContent).toBe("Andyville Atlas");

        identity.reset();
        applyProductName(identity);
        expect(word.textContent).toBe(SHIPPED_PRODUCT_NAME);
        word.remove();
    });
});

describe("normaliseDisplayName", () => {
    it("returns null for anything that is not a real name", () => {
        expect(normaliseDisplayName("")).toBeNull();
        expect(normaliseDisplayName("\t \n")).toBeNull();
    });

    it("keeps a Cantonese name intact", () => {
        expect(normaliseDisplayName("  安迪村地圖  ")).toBe("安迪村地圖");
    });
});
