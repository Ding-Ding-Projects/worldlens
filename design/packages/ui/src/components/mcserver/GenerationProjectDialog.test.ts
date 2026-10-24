// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import Dialog from "./GenerationProjectDialog.vue";
import { generationDialogOpen } from "./generationWorkflow.js";
const mocks = vi.hoisted(() => ({
    run: vi.fn(),
    read: vi.fn(),
    cancel: vi.fn(),
    capabilities: vi.fn(),
    catalogueList: vi.fn(),
}));
vi.mock("./workflowText.js", () => ({ workflowText: (en: string) => en }));
vi.mock("./useServers.js", () => ({
    useServerStore: () => ({ catalogueList: mocks.catalogueList }),
}));
beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    generationDialogOpen.value = true;
    vi.stubGlobal("worldlens", { mcserver: { generation: mocks } });
    mocks.read.mockResolvedValue({ ok: true, value: null });
    mocks.capabilities.mockResolvedValue({ ok: true, value: { inventory: null, descriptors: [] } });
    mocks.catalogueList.mockResolvedValue({
        ok: true,
        value: { flavours: [{ flavour: "vanilla", versions: [{ version: "1.21.4" }] }] },
    });
});
async function ready() {
    const wrapper = shallowMount(Dialog, { global: { renderStubDefaultSlot: true } });
    await flushPromises();
    for (const [label, value] of [["Seed (exact text)", "9223372036854775807"]] as const)
        wrapper
            .findAllComponents({ name: "VTextField" })
            .find((field) => field.props("label") === label)!
            .vm.$emit("update:modelValue", value);
    wrapper
        .findAllComponents({ name: "VSelect" })
        .find((field) => field.props("label") === "Exact version")!
        .vm.$emit("update:modelValue", "1.21.4");
    for (const box of wrapper.findAllComponents({ name: "VCheckbox" }))
        box.vm.$emit("update:modelValue", true);
    await flushPromises();
    return wrapper;
}
describe("generation project coordinator entry", () => {
    it("retains exact seed text and opens only a completed readback receipt", async () => {
        mocks.run.mockImplementation(async (request) => ({
            ok: true,
            value: {
                id: request.operationId,
                stage: "complete",
                worldFolder: "C:/worlds/world",
                projectPath: "C:/worlds/world/project.json",
                message: "Verified",
            },
        }));
        const wrapper = await ready();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Generate and start project")!
            .trigger("click");
        await flushPromises();
        expect(mocks.run.mock.calls[0]?.[0]).not.toHaveProperty("server");
        expect(mocks.run.mock.calls[0]?.[0]).not.toHaveProperty("serversRoot");
        expect(mocks.run.mock.calls[0]?.[0].seed).toBe("9223372036854775807");
        expect(wrapper.emitted("openProject")).toEqual([["C:/worlds/world"]]);
        expect(
            JSON.parse(localStorage.getItem("worldlens.generation.workflow.v1")!).request.seed,
        ).toBe("9223372036854775807");
        wrapper.unmount();
    });
    it("never persists protected property values from a descriptor", async () => {
        mocks.capabilities.mockResolvedValue({
            ok: true,
            value: {
                inventory: {},
                descriptors: [
                    {
                        key: "property:rcon.password",
                        label: "RCON password",
                        category: "Server",
                        control: { kind: "text" },
                        available: true,
                        reason: null,
                        value: "fixture-sensitive-value",
                    },
                ],
            },
        });
        mocks.run.mockResolvedValue({
            ok: false,
            failure: { code: "failed", message: "Retained" },
        });
        const wrapper = await ready();
        const field = wrapper.findComponent({ name: "ConfigControl" });
        expect(field.props("disabled")).toBe(true);
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Generate and start project")!
            .trigger("click");
        await flushPromises();
        expect(JSON.stringify(mocks.run.mock.calls)).not.toContain("fixture-sensitive-value");
        expect(localStorage.getItem("worldlens.generation.workflow.v1")).not.toContain(
            "fixture-sensitive-value",
        );
        wrapper.unmount();
    });
    it("never opens a project from a failure or partial state", async () => {
        mocks.run.mockResolvedValue({
            ok: false,
            failure: { code: "failed", message: "Project readback failed" },
        });
        const wrapper = await ready();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Generate and start project")!
            .trigger("click");
        await flushPromises();
        expect(wrapper.emitted("openProject")).toBeUndefined();
        expect(wrapper.text()).toContain("Project readback failed");
        wrapper.unmount();
    });
});

describe("restored generation observation", () => {
    it("keeps active operations locked and cancellable after reopening", async () => {
        localStorage.setItem(
            "worldlens.generation.workflow.v1",
            JSON.stringify({
                id: "generation-restored",
                version: "1.21.4",
                request: { operationId: "generation-restored" },
            }),
        );
        mocks.read.mockResolvedValue({
            ok: true,
            value: {
                id: "generation-restored",
                stage: "generating",
                worldFolder: null,
                projectPath: null,
                message: "Running",
            },
        });
        const wrapper = shallowMount(Dialog, { global: { renderStubDefaultSlot: true } });
        await flushPromises();
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .find((button) => button.text() === "Resume verified operation")!
                .props("disabled"),
        ).toBe(true);
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .some((button) => button.text() === "Cancel safely"),
        ).toBe(true);
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .some((button) => button.text() === "New operation"),
        ).toBe(false);
        expect(mocks.run).not.toHaveBeenCalled();
        expect(mocks.capabilities).not.toHaveBeenCalled();
        wrapper.unmount();
    });
});
