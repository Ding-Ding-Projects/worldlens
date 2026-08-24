// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderDestinationMenu from "./RenderDestinationMenu.vue";

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
});

function render(props: Record<string, unknown> = {}) {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
    return mount(RenderDestinationMenu, {
        props: {
            canRenderLocally: true,
            canRenderInDocker: true,
            canRenderRemotely: true,
            hasRemoteTarget: true,
            remotePreflightPassed: true,
            canOpenCi: true,
            canImportProject: true,
            canPublishExisting: true,
            ...props,
        },
        global: { plugins: [i18n, createVuetify()] },
        attachTo: document.body,
    });
}

describe("RenderDestinationMenu", () => {
    it("keeps the existing render action as the main half and exposes a compact chooser", () => {
        const wrapper = render();
        expect(wrapper.find("[data-render-destination-main]").exists()).toBe(true);
        expect(wrapper.find("[data-render-destination-arrow]").attributes("aria-label")).toBe(
            "Choose where to render",
        );
        expect(wrapper.find("[data-render-destination-main]").attributes("disabled")).toBeUndefined();
    });

    it("uses the menu search field and emits the selected destination id", async () => {
        const wrapper = render();
        expect(wrapper.findComponent({ name: "MenuSearchList" }).exists()).toBe(true);
        const vm = wrapper.vm as unknown as {
            choose: (id: string) => void;
            items: readonly { id: string; disabled?: boolean }[];
        };
        expect(vm.items.some((item) => item.id === "docker" && item.disabled !== true)).toBe(true);
        vm.choose("docker");
        expect(wrapper.emitted("choose")?.[0]).toEqual(["docker"]);
    });

    it("does not offer a fake Docker fallback when the runtime channel is absent", async () => {
        const wrapper = render({ canRenderInDocker: false });
        const vm = wrapper.vm as unknown as {
            choose: (id: string) => void;
            items: readonly { id: string; disabled?: boolean; reason?: string }[];
        };
        const row = vm.items.find((item) => item.id === "docker");
        expect(row?.disabled).toBe(true);
        expect(row?.reason).toContain("will not fall back");
        vm.choose("docker");
        expect(wrapper.emitted("choose")).toBeUndefined();
    });

    it("keeps SSH setup reachable before target and preflight, while not claiming render readiness", () => {
        const wrapper = render({ hasRemoteTarget: false, remotePreflightPassed: false });
        const vm = wrapper.vm as unknown as {
            choose: (id: string) => void;
            items: readonly { id: string; disabled?: boolean; reason?: string }[];
        };
        const remote = vm.items.find((item) => item.id === "remote");
        expect(remote?.disabled).toBe(false);
        vm.choose("remote");
        expect(wrapper.emitted("choose")?.[0]).toEqual(["remote"]);
    });

    it("keeps import and publish visible with truthful disabled reasons", async () => {
        const wrapper = render({ canImportProject: false, canPublishExisting: false });
        const vm = wrapper.vm as unknown as {
            items: readonly { id: string; disabled?: boolean; reason?: string }[];
        };
        const imported = vm.items.find((item) => item.id === "import-project");
        const published = vm.items.find((item) => item.id === "publish-existing");
        expect(imported?.disabled).toBe(true);
        expect(published?.disabled).toBe(true);
        expect(imported?.reason).toContain("desktop file picker");
        expect(published?.reason).toContain("finished render");
    });
});
