// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import Panel from "./HostingProfilePanel.vue";
vi.mock("../mcserver/workflowText.js", () => ({ workflowText: (en: string) => en }));
test("saved readiness is invalidated by editing and late readiness cannot select a different context", async () => {
    const saved = {
        id: "a".repeat(36),
        name: "LAN",
        target: "container",
        origin: "https://map.example:8443",
        port: 8443,
        dataRoot: "C:/private",
        tlsKey: "C:/tls/key.pem",
        tlsCert: "C:/tls/cert.pem",
        distribution: "",
    };
    let finish: ((value: unknown) => void) | undefined;
    const readiness = vi.fn(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    vi.stubGlobal("worldlens", {
        managedHosting: {
            profiles: { list: async () => ({ ok: true, value: [saved] }), readiness },
        },
    });
    const wrapper = shallowMount(Panel, {
        props: { context: "context-one", disabled: false },
        global: { renderStubDefaultSlot: true },
    });
    await flushPromises();
    const select = wrapper
        .findAllComponents({ name: "VSelect" })
        .find((component) => component.props("label") === "Saved profile")!;
    select.vm.$emit("update:modelValue", saved.id);
    await flushPromises();
    const check = wrapper
        .findAllComponents({ name: "VBtn" })
        .find((component) => component.text() === "Check readiness")!;
    await check.trigger("click");
    await flushPromises();
    expect(readiness).toHaveBeenCalledWith({
        profileId: saved.id,
        context: "context-one",
        target: "container",
        port: 8443,
    });
    finish!({ ok: true, value: { state: "configured" } });
    await flushPromises();
    expect(wrapper.emitted("selected")?.at(-1)).toEqual([saved]);
    const name = wrapper
        .findAllComponents({ name: "VTextField" })
        .find((component) => component.props("label") === "Profile name")!;
    name.vm.$emit("update:modelValue", "Changed");
    await flushPromises();
    expect(wrapper.emitted("selected")?.at(-1)).toEqual([null]);
    select.vm.$emit("update:modelValue", saved.id);
    await flushPromises();
    await check.trigger("click");
    await flushPromises();
    await wrapper.setProps({ context: "context-two" });
    finish!({ ok: true, value: { state: "configured" } });
    await flushPromises();
    expect(wrapper.emitted("selected")?.at(-1)).toEqual([null]);
    wrapper.unmount();
    vi.unstubAllGlobals();
});
