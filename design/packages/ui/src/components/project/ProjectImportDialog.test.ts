// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ProjectImportDialog from "./ProjectImportDialog.vue";
import type { ConfigHost } from "../config/configHost.js";
import type { ProjectHost } from "./projectHost.js";

Object.defineProperty(globalThis, "visualViewport", {
    configurable: true,
    value: {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
    },
});

function render(overrides: Partial<{ config: ConfigHost; host: ProjectHost }> = {}) {
    const config: ConfigHost = overrides.config ?? {
        name: "test",
        separator: "/",
        readFolder: vi.fn(),
        writeFiles: vi.fn(),
        deleteFiles: vi.fn(),
        pickDirectory: vi.fn(async () => "C:/world"),
        pickFile: vi.fn(async () => null),
        testSqlConnection: vi.fn(),
        suggestConfigFolder: vi.fn(),
    } as unknown as ConfigHost;
    const host: ProjectHost = overrides.host ?? {
        name: "test",
        canDelete: false,
        listProjects: vi.fn(),
        readProject: vi.fn(async () => ({ ok: true, project: {} as never, file: "C:/world/worldlens.project.json" })),
        writeProject: vi.fn(),
    } as unknown as ProjectHost;
    const i18n = createI18n({ legacy: false, locale: "none", fallbackLocale: "none", messages: {} });
    return mount(ProjectImportDialog, {
        props: { configHost: config, projectHost: host, remoteBridge: null },
        global: {
            plugins: [i18n, createVuetify()],
            stubs: {
                SshWorldSourcePanel: {
                    template: '<button data-test="ssh-stub" @click="$emit(\'use\', \'C:/ssh-world\')">SSH</button>',
                    emits: ["use"],
                },
            },
        },
        attachTo: document.body,
    });
}

describe("ProjectImportDialog", () => {
    it("validates a browsed local world through ProjectHost before importing", async () => {
        const wrapper = render();
        document.body.querySelector<HTMLElement>('[data-test="import-folder"]')?.click();
        await flushPromises();
        expect(wrapper.emitted("imported")?.[0]).toEqual(["C:/world"]);
        wrapper.unmount();
    });

    it("offers the existing SSH source flow and imports only after its fetched folder is reviewed", async () => {
        const wrapper = render();
        document.body.querySelector<HTMLElement>('[data-test="ssh-stub"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await flushPromises();
        expect(wrapper.emitted("imported")?.[0]).toEqual(["C:/ssh-world"]);
        wrapper.unmount();
    });

    it("keeps archive import visible but disabled with an honest recovery route", () => {
        const wrapper = render();
        const archive = document.body.querySelector<HTMLElement>('[data-test="import-archive"]');
        expect(archive?.hasAttribute("disabled")).toBe(true);
        expect(document.body.textContent).toContain("Safe archive extraction");
        expect(document.body.textContent).toContain("world folder");
        wrapper.unmount();
    });
});
