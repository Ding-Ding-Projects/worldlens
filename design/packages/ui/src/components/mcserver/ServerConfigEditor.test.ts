// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { clearServerConfigDrafts } from "./serverConfigDrafts.js";
import Editor from "./ServerConfigEditor.vue";
const mocks = vi.hoisted(() => ({ describe: vi.fn(), apply: vi.fn(), discover: vi.fn() }));
vi.mock("./workflowText.js", () => ({ workflowText: (en: string) => en }));
vi.mock("./useServers.js", () => ({
    useServerStore: () => ({
        get: () => ({ origin: "created" }),
        capabilitiesFor: () => ({ canWriteFiles: true }),
        files: { read: vi.fn(), write: vi.fn() },
    }),
}));
const field = {
    path: ["records"],
    key: "records",
    control: { kind: "text" },
    label: "Records",
    help: null,
    group: "Records",
    value: [{ enabled: true, n: 2, unknown: { keep: "yes" } }],
    readOnlyReason: null,
};
beforeEach(() => {
    clearServerConfigDrafts();
    vi.clearAllMocks();
    vi.stubGlobal("worldlens", { mcserver: { config: mocks } });
    mocks.describe.mockResolvedValue({
        ok: true,
        value: { fields: [field], hash: "revision-1", unreadable: false },
    });
    mocks.discover.mockResolvedValue({
        ok: true,
        value: { files: ["plugins/real/config.yaml"], unavailable: [], truncated: false },
    });
});
describe("server configuration describe/apply workflow", () => {
    it("sends typed nested values with the original revision, then reads back", async () => {
        mocks.apply.mockResolvedValue({ ok: true, value: { hash: "revision-2" } });
        const wrapper = shallowMount(Editor, {
            props: { serverId: "one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        const changed = [{ enabled: false, n: 3, unknown: { keep: "yes" } }];
        wrapper
            .findComponent({ name: "RecursiveValueEditor" })
            .vm.$emit("update:modelValue", changed);
        await flushPromises();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Save changes")!
            .trigger("click");
        await flushPromises();
        expect(mocks.apply).toHaveBeenCalledWith("one", "server.properties", {
            expectedHash: "revision-1",
            changes: [{ path: ["records"], value: changed }],
        });
        expect(mocks.describe).toHaveBeenCalledTimes(2);
        expect(wrapper.text()).toContain("Saved and read back.");
    });
    it("retains draft and blocks another write after a revision conflict", async () => {
        mocks.apply.mockResolvedValue({
            ok: false,
            failure: { code: "stale-document", message: "Changed elsewhere" },
        });
        const wrapper = shallowMount(Editor, {
            props: { serverId: "one" },
            global: { renderStubDefaultSlot: true },
        });
        await flushPromises();
        const changed = [{ enabled: false, n: 9, unknown: { keep: "yes" } }];
        wrapper
            .findComponent({ name: "RecursiveValueEditor" })
            .vm.$emit("update:modelValue", changed);
        await flushPromises();
        const save = wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Save changes")!;
        await save.trigger("click");
        await flushPromises();
        expect(wrapper.findComponent({ name: "RecursiveValueEditor" }).props("modelValue")).toEqual(
            changed,
        );
        expect(save.props("disabled")).toBe(true);
        expect(mocks.describe).toHaveBeenCalledTimes(1);
    });
    it("restores conflicted typed drafts and their original revision across files and remounts", async () => {
        mocks.apply.mockResolvedValue({
            ok: false,
            failure: { code: "stale-document", message: "Changed elsewhere" },
        });
        const options = { props: { serverId: "one" }, global: { renderStubDefaultSlot: true } };
        const wrapper = shallowMount(Editor, options);
        await flushPromises();
        const changed = [{ enabled: false, n: 99, unknown: { keep: "yes" } }];
        wrapper
            .findComponent({ name: "RecursiveValueEditor" })
            .vm.$emit("update:modelValue", changed);
        await flushPromises();
        await wrapper
            .findAllComponents({ name: "VBtn" })
            .find((btn) => btn.text() === "Save changes")!
            .trigger("click");
        await flushPromises();
        wrapper.findComponent({ name: "VSelect" }).vm.$emit("update:modelValue", "ops.json");
        await flushPromises();
        wrapper
            .findComponent({ name: "VSelect" })
            .vm.$emit("update:modelValue", "server.properties");
        await flushPromises();
        expect(wrapper.findComponent({ name: "RecursiveValueEditor" }).props("modelValue")).toEqual(
            changed,
        );
        expect(wrapper.text()).toContain("Your draft is retained");
        expect(
            wrapper
                .findAllComponents({ name: "VBtn" })
                .find((btn) => btn.text() === "Save changes")!
                .props("disabled"),
        ).toBe(true);
        wrapper.unmount();
        const reopened = shallowMount(Editor, options);
        await flushPromises();
        expect(
            reopened.findComponent({ name: "RecursiveValueEditor" }).props("modelValue"),
        ).toEqual(changed);
        expect(mocks.apply.mock.calls[0]?.[2].expectedHash).toBe("revision-1");
        reopened.unmount();
    });
});
