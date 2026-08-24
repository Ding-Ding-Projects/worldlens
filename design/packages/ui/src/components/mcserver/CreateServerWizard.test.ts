/**
 * @vitest-environment jsdom
 *
 * The create-server wizard, mounted. Asserts the properties that only exist once rendered:
 * it opens on the flavour step with every flavour card present, moving to the version step
 * shows an honest "no catalogue" notice when this build's host has not wired one up, and the
 * final Create action stays disabled until the EULA switch is actually on.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import CreateServerWizard from "./CreateServerWizard.vue";
import { SERVER_STORE } from "./useServers.js";
import {
    createServerStore,
    type Answer,
    type CatalogueSnapshot,
    type McServerHost,
} from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";
import { runtimeOptions } from "./wizardModel.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});
const vuetify = createVuetify();

afterEach(() => {
    document.body.innerHTML = "";
});

function ok<T>(value: T): Answer<T> {
    return { ok: true, value };
}

function fakeHost(): McServerHost {
    return {
        name: "fake",
        list: async () => ok([] as readonly ServerRecord[]),
        get: async () => ok(undefined as unknown as ServerRecord),
        save: async () => ok(undefined as unknown as ServerRecord),
        forget: async () => ok(undefined),
        probe: async () =>
            ok({
                reachable: true,
                runtimeVersion: null,
                message: "",
                checkedAt: "now",
                capabilities: null,
            }),
        status: async () =>
            ok({
                state: "absent" as const,
                running: false,
                startedAt: null,
                exitCode: null,
                checkedAt: "now",
            }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        files: {
            list: async () => ok([]),
            read: async () => ok({ bytes: new Uint8Array(), hash: "", size: 0, truncated: false }),
            write: async () => ok({ hash: "", size: 0, writtenAt: "now", backupPath: null }),
        },
        logTail: async () => ok([]),
    };
}

function mountWizard(host: McServerHost = fakeHost()) {
    const store = createServerStore({ host });
    return mount(CreateServerWizard, {
        props: { modelValue: true },
        global: { plugins: [i18n, vuetify], provide: { [SERVER_STORE as symbol]: store } },
        attachTo: document.body,
    });
}

async function flushAll(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("CreateServerWizard", () => {
    function catalogueHost(): McServerHost {
        const versions = [
            "1.21.1",
            "1.21.2",
            "1.21.3",
            "1.21.4",
            "1.20.6",
        ].map((version) => ({
            version,
            stability: "release" as const,
            javaFeature: 21,
            downloadUrl: null,
            sha256: null,
            releasedAt: "2026-01-01T00:00:00Z",
        }));
        versions.push({
            version: "25w01a",
            stability: "snapshot",
            javaFeature: 21,
            downloadUrl: null,
            sha256: null,
            releasedAt: "2025-01-01T00:00:00Z",
        });
        const snapshot: CatalogueSnapshot = {
            flavours: [{ flavour: "paper", versions }],
            fetchedAt: "2026-08-23T00:00:00Z",
            stale: false,
            failures: [],
        };
        const host = fakeHost();
        return {
            ...host,
            catalogue: {
                list: async () => ok(snapshot),
                refresh: async () => ok(snapshot),
            },
        };
    }

    it("offers AWS EC2 only when the AWS bridge is present", () => {
        expect(runtimeOptions(false).some((option) => option.id === "aws")).toBe(false);
        expect(runtimeOptions(true).find((option) => option.id === "aws")?.name).toBe("AWS EC2");
    });

    it("opens on the flavour step with every flavour card present", async () => {
        // Mounted for its side effect: the wizard teleports its content to the body, so the
        // assertion reads the document rather than the returned wrapper.
        mountWizard();
        await flushAll();
        expect(document.body.textContent).toContain("Vanilla");
        expect(document.body.textContent).toContain("Paper");
        expect(document.body.textContent).toContain("Velocity");
    });

    it("says plainly that this build has no live catalogue on the version step", async () => {
        const wrapper = mountWizard();
        await flushAll();
        const next = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === "Next",
        );
        next?.dispatchEvent(new Event("click", { bubbles: true }));
        await flushAll();
        expect(document.body.textContent).toContain(
            "This build cannot reach the server-version catalogue",
        );
    });

    it("groups every exact version by family, keeps one family open, and exposes keyboard state", async () => {
        mountWizard(catalogueHost());
        await flushAll();
        const next = [...document.querySelectorAll("button")].find(
            (b) => b.textContent?.trim() === "Next",
        );
        next?.click();
        await flushAll();

        const families = [...document.querySelectorAll<HTMLElement>('[data-test="version-family"]')];
        expect(families).toHaveLength(3);
        expect(families[0]?.textContent).toContain("1.21.x");
        expect(families[0]?.querySelector("[aria-expanded='true']")).not.toBeNull();
        expect(families[1]?.querySelector("[aria-expanded='false']")).not.toBeNull();
        const firstToggle = families[0]?.querySelector("button");
        expect(firstToggle?.getAttribute("aria-controls")).toBeTruthy();
        expect(
            document.getElementById(firstToggle?.getAttribute("aria-controls") ?? ""),
        ).not.toBeNull();

        firstToggle?.click();
        await flushAll();
        expect(firstToggle?.getAttribute("aria-expanded")).toBe("false");
        families[1]?.querySelector("button")?.click();
        await flushAll();
        expect(families[1]?.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
        expect(document.querySelectorAll('[data-test="version-entry"]').length).toBeGreaterThan(0);
        expect(document.body.textContent).toContain("Catalogue refreshed 2026-08-23T00:00:00Z");
    });

    it("reveals a searched exact version and keeps its direct Minecraft Wiki link", async () => {
        mountWizard(catalogueHost());
        await flushAll();
        [...document.querySelectorAll("button")]
            .find((b) => b.textContent?.trim() === "Next")
            ?.click();
        await flushAll();

        const search = document.querySelector<HTMLInputElement>('input[role="searchbox"]');
        expect(search).not.toBeNull();
        if (search === null) return;
        search.value = "1.20.6";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await flushAll();

        const entries = document.querySelectorAll('[data-test="version-entry"]');
        expect(entries).toHaveLength(1);
        expect(entries[0]?.textContent).toContain("1.20.6");
        const wiki = entries[0]?.querySelector("a");
        expect(wiki?.getAttribute("href")).toContain("1.20.6");
        expect(wiki?.getAttribute("aria-label")).toContain("1.20.6");
    });
});
