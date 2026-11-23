// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ApplianceDialog from "./ApplianceDialog.vue";
import { buildRequest, defaultForm, formProblem, planLabels, resolveApplianceBridge, type ApplianceBridge, type ApplianceRequestView, type ApplianceResultView } from "./applianceHost.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const i18n = () => createI18n({ legacy: false, locale: "en", fallbackLocale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } });

function fakeBridge(overrides: Partial<ApplianceBridge> = {}): { bridge: ApplianceBridge; requests: ApplianceRequestView[]; reveal: ReturnType<typeof vi.fn> } {
    const requests: ApplianceRequestView[] = [];
    const reveal = vi.fn(async () => true);
    const bridge: ApplianceBridge = {
        tools: async () => [
            { id: "vmware", found: true, version: "17.6.0" },
            { id: "virtualbox", found: false, version: null },
        ],
        usbDisks: async () => [{ number: 3, name: "SanDisk Ultra", sizeBytes: 29_800_000_000 }],
        build: async (request) => {
            requests.push(request);
            const ok: ApplianceResultView = { ok: true, cancelled: false, target: request.target, link: request.target === "export" ? null : "http://192.0.2.141/", path: request.target === "export" ? "D:\\out\\a.vmdk" : null, message: "done", steps: planLabels(request.target).map((s) => ({ ...s, state: "done" as const, meta: "ok" })) };
            return ok;
        },
        onProgress: () => () => undefined,
        reveal,
        ...overrides,
    };
    return { bridge, requests, reveal };
}

function mountDialog(bridge: ApplianceBridge | null) {
    return mount(ApplianceDialog, {
        props: { modelValue: true, mapRoot: "D:/maps/bayville", bridge },
        global: { plugins: [i18n(), createVuetify()], stubs: { VDialog: { template: "<div><slot /></div>" } } },
    });
}

describe("form helpers", () => {
    it("names the first problem and builds a request that carries only what the target needs", () => {
        const form = defaultForm();
        expect(formProblem(form, "D:/map", [])).toMatch(/Access code/);
        form.accessCode = "abcd1234";
        expect(formProblem(form, "D:/map", [])).toBeNull();
        expect(formProblem(form, "", [])).toMatch(/map/);
        form.hostName = "Bad";
        expect(formProblem(form, "D:/map", [])).toMatch(/Host name/);
        form.hostName = "ok";
        form.port = "0";
        expect(formProblem(form, "D:/map", [])).toMatch(/port/);
        form.port = "80";
        form.target = "usb";
        const disk = { number: 3, name: "SanDisk Ultra", sizeBytes: 1 };
        expect(formProblem(form, "D:/map", [disk])).toMatch(/Choose a USB/);
        form.usbDiskNumber = 3;
        expect(formProblem(form, "D:/map", [disk])).toMatch(/Type the drive name/);
        form.usbConfirmName = "sandisk ultra";
        expect(formProblem(form, "D:/map", [disk])).toBeNull();
        const request = buildRequest(form, "D:/map");
        expect(request).toMatchObject({ target: "usb", usbDiskNumber: 3, usbConfirmName: "sandisk ultra", port: 80, accessCode: "abcd1234" });
        expect("exportDir" in request).toBe(false);
        form.askAccessCode = false;
        expect(buildRequest(form, "D:/map").accessCode).toBeNull();
    });
    it("resolves the bridge all or nothing", () => {
        expect(resolveApplianceBridge()).toBeNull();
        (window as unknown as { worldlens: unknown }).worldlens = { appliance: { tools: () => 1 } };
        expect(resolveApplianceBridge()).toBeNull();
        delete (window as unknown as { worldlens?: unknown }).worldlens;
    });
});

describe("ApplianceDialog", () => {
    it("shows found and missing tools per the board and lets a keyboard user pick a target", async () => {
        const { bridge } = fakeBridge();
        const wrapper = mountDialog(bridge);
        await flushPromises();
        const text = wrapper.text();
        expect(text).toContain("found: vmrun 17.6.0");
        expect(text).toContain("not found: VBoxManage");
        expect(text).toContain("removable drives: 1");
        const group = wrapper.find('[role="radiogroup"]');
        expect(group.exists()).toBe(true);
        const tiles = wrapper.findAll('[role="radio"]');
        expect(tiles).toHaveLength(4);
        expect(tiles[0]?.attributes("aria-checked")).toBe("true");
        await tiles[3]?.trigger("click");
        expect(tiles[3]?.attributes("aria-checked")).toBe("true");
        expect(wrapper.text()).toContain("Image format");
    });

    it("keeps the build button disabled with a stated reason until the form is valid, then builds and shows the verified link", async () => {
        const { bridge, requests } = fakeBridge();
        const wrapper = mountDialog(bridge);
        await flushPromises();
        const button = wrapper.find('[data-action="build"]');
        expect(button.attributes("disabled")).toBeDefined();
        expect(wrapper.find('[data-role="problem"]').text()).toMatch(/Access code/);
        await wrapper.find('[data-field="accessCode"]').setValue("abcd1234");
        expect(wrapper.find('[data-action="build"]').attributes("disabled")).toBeUndefined();
        await wrapper.find("form").trigger("submit");
        await flushPromises();
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({ target: "vmware", memoryMb: 1024, cpus: 2, hostName: "worldlens-map", mapRoot: "D:/maps/bayville" });
        expect(wrapper.find('[data-role="ready"]').text()).toContain("The appliance is up in VMware");
        expect(wrapper.find('[data-role="link"]').text()).toBe("http://192.0.2.141/");
        expect(wrapper.findAll("li").every((li) => li.attributes("data-state") === "done")).toBe(true);
    });

    it("for an export, Open shows the folder and Copy copies the path", async () => {
        const { bridge, reveal } = fakeBridge();
        const wrapper = mountDialog(bridge);
        await flushPromises();
        await wrapper.find('[data-target="export"]').trigger("click");
        await wrapper.find('[data-field="accessCode"]').setValue("abcd1234");
        await wrapper.find('[data-field="exportDir"]').setValue("D:\\out");
        const write = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
        await wrapper.find("form").trigger("submit");
        await flushPromises();
        expect(wrapper.find('[data-role="link"]').text()).toBe("D:\\out\\a.vmdk");
        const buttons = wrapper.findAll(".wl-appliance__ready button");
        await buttons[0]?.trigger("click");
        expect(reveal).toHaveBeenCalledWith("D:\\out\\a.vmdk");
        await wrapper.find('[data-action="copy"]').trigger("click");
        expect(write).toHaveBeenCalledWith("D:\\out\\a.vmdk");
        expect(wrapper.find('[data-action="copy"]').text()).toBe("Copied");
    });

    it("requires the typed drive name for USB and shows a declined permission prompt as not done", async () => {
        const { bridge, requests } = fakeBridge({
            build: async (request) => ({ ok: false, cancelled: true, target: request.target, link: null, path: null, message: "The Windows permission prompt was declined. Nothing was written to the drive.", steps: [] }),
        });
        const wrapper = mountDialog(bridge);
        await flushPromises();
        await wrapper.find('[data-target="usb"]').trigger("click");
        await wrapper.find('[data-field="accessCode"]').setValue("abcd1234");
        await wrapper.find('[data-field="usbDisk"]').setValue(3);
        expect(wrapper.find('[data-action="build"]').attributes("disabled")).toBeDefined();
        expect(wrapper.find('[role="note"]').text()).toContain("erased");
        await wrapper.find('[data-field="usbConfirm"]').setValue("SanDisk Ultra");
        expect(wrapper.find('[data-action="build"]').attributes("disabled")).toBeUndefined();
        await wrapper.find("form").trigger("submit");
        await flushPromises();
        expect(requests).toHaveLength(0);
        expect(wrapper.find('[data-role="ready"]').exists()).toBe(false);
        expect(wrapper.find('[data-role="failed"]').text()).toContain("declined");
    });

    it("says plainly when the builder is not wired into this build", async () => {
        const wrapper = mountDialog(null);
        await flushPromises();
        expect(wrapper.find('[data-role="problem"]').text()).toContain("not available");
        expect(wrapper.find('[data-action="build"]').attributes("disabled")).toBeDefined();
    });
});
