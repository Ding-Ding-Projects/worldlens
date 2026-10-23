// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import Panel from "./AccessPreparationPanel.vue";
import {
    preparedAccess,
    ACCESS_REFERENCE_KEY,
    accessPreparationDraft,
} from "./managedHostingBridge.js";
vi.mock("../mcserver/workflowText.js", () => ({ workflowText: (en: string) => en }));
beforeEach(() => {
    localStorage.clear();
    preparedAccess.value = null;
    accessPreparationDraft.username = "";
    accessPreparationDraft.password = "";
});
describe("protected access preparation", () => {
    it("clears the transient password and persists only the reference, without claiming provisioning", async () => {
        const prepare = vi.fn(async () => ({
            ok: true,
            value: { reference: "reference-1", username: "admin", state: "prepared" },
        }));
        vi.stubGlobal("worldlens", { managedHosting: { access: { prepare, read: vi.fn() } } });
        const wrapper = shallowMount(Panel, { global: { renderStubDefaultSlot: true } });
        const fields = wrapper.findAllComponents({ name: "VTextField" });
        fields[0]!.vm.$emit("update:modelValue", "admin");
        fields[1]!.vm.$emit("update:modelValue", "test-only-password");
        await flushPromises();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Prepare protected access")!
            .trigger("click");
        await flushPromises();
        expect(prepare).toHaveBeenCalledWith({ username: "admin", password: "test-only-password" });
        expect(fields[1]!.props("modelValue")).toBe("");
        expect(localStorage.getItem(ACCESS_REFERENCE_KEY)).toBe("reference-1");
        expect(JSON.stringify(localStorage)).not.toContain("test-only-password");
        expect(wrapper.text()).toContain("Provisioned: not verified");
    });
    it("is reachable before render in both the project and shared wizard review", () => {
        for (const path of ["../project/ProjectsScreen.vue", "../world/WizardReviewStep.vue"]) {
            const source = readFileSync(new URL(path, import.meta.url), "utf8");
            expect(source).toContain("import AccessPreparationPanel");
            expect(source).toContain("<AccessPreparationPanel />");
        }
    });
    it("prepares access without a running host and restores only the protected reference", async () => {
        localStorage.setItem(ACCESS_REFERENCE_KEY, "existing-reference");
        const read = vi.fn(async () => ({
            ok: true,
            value: { reference: "existing-reference", username: "admin", state: "prepared" },
        }));
        vi.stubGlobal("worldlens", { managedHosting: { access: { prepare: vi.fn(), read } } });
        const wrapper = shallowMount(Panel, { global: { renderStubDefaultSlot: true } });
        await flushPromises();
        expect(read).toHaveBeenCalledWith("existing-reference");
        expect(wrapper.text()).toContain("Provisioned: not verified");
        expect(wrapper.findAllComponents({ name: "VTextField" })[1]!.props("modelValue")).toBe("");
        wrapper.unmount();
    });
    it("retains an unfinished protected input draft across navigation without serializing it", async () => {
        vi.stubGlobal("worldlens", {
            managedHosting: { access: { prepare: vi.fn(), read: vi.fn() } },
        });
        const options = { global: { renderStubDefaultSlot: true } };
        const first = shallowMount(Panel, options);
        first
            .findAllComponents({ name: "VTextField" })[0]!
            .vm.$emit("update:modelValue", "draft-admin");
        first
            .findAllComponents({ name: "VTextField" })[1]!
            .vm.$emit("update:modelValue", "transient-draft-fixture");
        await flushPromises();
        first.unmount();
        const second = shallowMount(Panel, options);
        expect(second.findAllComponents({ name: "VTextField" })[0]!.props("modelValue")).toBe(
            "draft-admin",
        );
        expect(second.findAllComponents({ name: "VTextField" })[1]!.props("modelValue")).toBe(
            "transient-draft-fixture",
        );
        expect(localStorage.length).toBe(0);
        second.unmount();
    });
});
