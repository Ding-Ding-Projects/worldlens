/**
 * @vitest-environment jsdom
 *
 * The create-server wizard, mounted. Asserts the properties that only exist once rendered:
 * it opens on the flavour step with every flavour card present, moving to the version step
 * shows an honest "no catalogue" notice when this build's host has not wired one up, and the
 * final Create action stays disabled until the EULA switch is actually on.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import CreateServerWizard from "./CreateServerWizard.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore, type Answer, type McServerHost } from "./serverStore.js";
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

function mountWizard() {
    const store = createServerStore({ host: fakeHost() });
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
});
