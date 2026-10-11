// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { ref } from "vue";
import { VBtn, VSelect, VSwitch } from "vuetify/components";
import AdoptionBrowser from "./AdoptionBrowser.vue";
import AdoptionReviewDialog from "./AdoptionReviewDialog.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { adoptRelease } from "./mcserverBridge.js";
import { SERVER_STORE } from "./useServers.js";
import type { AdoptionCandidate, Answer } from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";

vi.mock("./mcserverBridge.js", () => ({ adoptRelease: vi.fn() }));

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, scale: 1,
            addEventListener() {}, removeEventListener() {} },
    });
    globalThis.matchMedia = ((media: string) => ({
        matches: false, media, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof matchMedia;
});

const mounted: VueWrapper[] = [];
afterEach(() => {
    vi.mocked(adoptRelease).mockReset();
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    document.body.innerHTML = "";
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

function record(id: string): ServerRecord {
    return {
        id, name: id, flavour: "paper", minecraftVersion: "1.21",
        ref: { kind: "local-process", serverDir: `/fixtures/${id}` }, origin: "created",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        hasRconSecret: false, rconPort: null, writeScope: [],
    };
}

function candidate(id: string): AdoptionCandidate {
    return { containerId: id, containerName: id, image: "fixture/server:1",
        guessedFlavour: null, guessedVersion: null };
}

function store() {
    return {
        servers: ref<readonly ServerRecord[]>([{ ...record("a"), origin: "adopted" }]),
        probe: vi.fn().mockResolvedValue({ ok: false }),
        capabilitiesFor: () => null,
        adoptConfirm: vi.fn<(request: unknown) => Promise<Answer<ServerRecord>>>()
            .mockResolvedValue({ ok: true, value: record("saved") }),
        adoptDiscover: vi.fn<(hostId?: string | null) => Promise<Answer<readonly AdoptionCandidate[]>>>()
            .mockResolvedValue({ ok: true, value: [] }),
        hostProfiles: { list: vi.fn().mockResolvedValue({ ok: true, value: [
            { hostId: "host-b", target: { label: "Host B", user: "fixture", host: "host-b.invalid" } },
        ] }) },
    };
}

function render(component: unknown, props: Record<string, unknown>, supplied = store()) {
    const wrapper: VueWrapper = mount(component as never, {
        props: props as never,
        global: {
            plugins: [createI18n({ legacy: false, locale: "en", messages: {},
                missingWarn: false, fallbackWarn: false }), createVuetify()],
            provide: { [SERVER_STORE as symbol]: supplied },
        },
        attachTo: document.body,
    });
    mounted.push(wrapper);
    return { wrapper, supplied };
}

describe("adoption review ownership", () => {
    it("does not offer release for an unsaved preview already marked adopted", async () => {
        const supplied = store();
        supplied.servers.value = [];
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: { ...record("preview"), origin: "adopted" }, containerId: "preview" }, supplied);
        await flushPromises();
        expect(wrapper.findComponent(ConfigSuperConfirm).exists()).toBe(false);
        expect(adoptRelease).not.toHaveBeenCalled();
    });
    it.each(["failure", "rejection"])("ignores a late release %s from a previous review", async (outcome) => {
        let reject!: (reason: Error) => void;
        const pending = deferred<Answer<void>>();
        const rejection = new Promise<Answer<void>>((_, fail) => { reject = fail; });
        vi.mocked(adoptRelease).mockReturnValue(outcome === "failure" ? pending.promise : rejection);
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: { ...record("a"), origin: "adopted" }, containerId: "container-a" });
        await flushPromises();
        const release = wrapper.findComponent(ConfigSuperConfirm);
        release.vm.$emit("confirm");
        release.vm.$emit("confirm");
        await flushPromises();
        expect(adoptRelease).toHaveBeenCalledTimes(1);
        expect(release.props("disabled")).toBe(true);
        await wrapper.setProps({ modelValue: false });
        await wrapper.setProps({ modelValue: true, record: record("b"), containerId: "container-b" });
        expect(wrapper.findComponent(ConfigSuperConfirm).exists()).toBe(false);
        if (outcome === "failure") pending.resolve({ ok: false,
            failure: { code: "fixture", message: "Old release failure", detail: null } });
        else reject(new Error("Old release rejection"));
        await flushPromises();
        expect(document.body.textContent).not.toContain("Old release");
        expect(document.body.textContent).not.toContain("Could not release this adoption.");
        expect(wrapper.findAllComponents(VBtn).find((button) => button.text() === "Adopt")!.props("disabled")).toBe(false);
    });

    it("prevents release while adoption is pending", async () => {
        const pending = deferred<Answer<ServerRecord>>();
        const supplied = store();
        supplied.adoptConfirm.mockReturnValue(pending.promise);
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: { ...record("a"), origin: "adopted" }, containerId: "container-a" }, supplied);
        await flushPromises();
        (wrapper.findAllComponents(VBtn).find((button) => button.text() === "Adopt")!.element as HTMLButtonElement).click();
        await flushPromises();
        const release = wrapper.findComponent(ConfigSuperConfirm);
        expect(release.props("disabled")).toBe(true);
        release.vm.$emit("confirm");
        expect(adoptRelease).not.toHaveBeenCalled();
        pending.resolve({ ok: true, value: record("saved") });
        await flushPromises();
    });
    it.each([{ containerId: "container-b" }, { hostId: "host-b" }])(
        "resets permissions when the exact candidate identity changes: %j", async (change) => {
            const { wrapper } = render(AdoptionReviewDialog,
                { modelValue: true, record: record("same-preview"), containerId: "container-a", hostId: null });
            await flushPromises();
            wrapper.findComponent(VSwitch).vm.$emit("update:modelValue", true);
            await flushPromises();
            await wrapper.setProps(change);
            await flushPromises();
            expect(wrapper.findAllComponents(VSwitch).map((control) => control.props("modelValue")))
                .toEqual([false, false, false, false]);
        },
    );

    it("starts every candidate and reopened review with four permissions off", async () => {
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: record("a"), containerId: "container-a" });
        await flushPromises();
        expect(wrapper.findAllComponents(VSwitch)).toHaveLength(4);
        for (const control of wrapper.findAllComponents(VSwitch)) {
            control.vm.$emit("update:modelValue", true);
        }
        await flushPromises();
        expect(wrapper.findAllComponents(VSwitch).every((control) => control.props("modelValue"))).toBe(true);
        await wrapper.setProps({ modelValue: false });
        await wrapper.setProps({ modelValue: true, record: record("b"), containerId: "container-b" });
        await flushPromises();
        expect(wrapper.findAllComponents(VSwitch).map((control) => control.props("modelValue")))
            .toEqual([false, false, false, false]);
    });

    it("does not submit adoption twice while the first confirmation is pending", async () => {
        const pending = deferred<Answer<ServerRecord>>();
        const supplied = store();
        supplied.adoptConfirm.mockReturnValue(pending.promise);
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: record("a"), containerId: "container-a" }, supplied);
        await flushPromises();
        const confirm = wrapper.findAllComponents(VBtn).find((button) => button.text() === "Adopt")!;
        (confirm.element as HTMLButtonElement).click();
        (confirm.element as HTMLButtonElement).click();
        await flushPromises();
        expect(supplied.adoptConfirm).toHaveBeenCalledTimes(1);
        expect(confirm.props("disabled")).toBe(true);
        pending.resolve({ ok: true, value: record("saved") });
        await flushPromises();
        expect(wrapper.emitted("confirmed")).toEqual([[record("saved")]]);
    });

    it.each([true, false])("a late A result cannot close or write failure into a fresh B review: success=%s", async (success) => {
        const pending = deferred<Answer<ServerRecord>>();
        const supplied = store();
        supplied.adoptConfirm.mockReturnValue(pending.promise);
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: record("a"), containerId: "container-a" }, supplied);
        await flushPromises();
        const confirm = () => wrapper.findAllComponents(VBtn).find((button) => button.text() === "Adopt")!;
        (confirm().element as HTMLButtonElement).click();
        await flushPromises();
        await wrapper.setProps({ modelValue: false });
        await wrapper.setProps({ modelValue: true, record: record("b"), containerId: "container-b" });
        pending.resolve(success ? { ok: true, value: record("saved-a") } : {
            ok: false, failure: { code: "fixture-failure", message: "Candidate A could not be saved", detail: null },
        });
        await flushPromises();
        expect(wrapper.emitted("confirmed")).toBeUndefined();
        expect(wrapper.emitted("update:modelValue")).toBeUndefined();
        expect(document.body.textContent).not.toContain("Candidate A could not be saved");
        expect(confirm().props("disabled")).toBe(false);
        expect(supplied.adoptConfirm).toHaveBeenCalledTimes(1);
    });

    it("releases the submission latch and shows a bounded failure after transport rejection", async () => {
        const supplied = store();
        supplied.adoptConfirm.mockRejectedValue(new Error("Transport implementation detail"));
        const { wrapper } = render(AdoptionReviewDialog,
            { modelValue: true, record: record("a"), containerId: "container-a" }, supplied);
        await flushPromises();
        const confirm = wrapper.findAllComponents(VBtn).find((button) => button.text() === "Adopt")!;
        (confirm.element as HTMLButtonElement).click();
        await flushPromises();
        expect(document.body.textContent).toContain("Could not save this server.");
        expect(document.body.textContent).not.toContain("Transport implementation detail");
        expect(confirm.props("disabled")).toBe(false);
        expect(wrapper.emitted("confirmed")).toBeUndefined();
    });
});

describe("adoption discovery ownership", () => {
    it("settles rejected host-profile loading without exposing transport details", async () => {
        const supplied = store();
        supplied.hostProfiles.list.mockRejectedValue(new Error("Private transport detail"));
        const { wrapper } = render(AdoptionBrowser, { modelValue: true }, supplied);
        await flushPromises();
        expect(wrapper.findComponent(VSelect).props("loading")).toBe(false);
        expect(document.body.textContent).toContain("SSH host profiles could not be loaded.");
        expect(document.body.textContent).not.toContain("Private transport detail");
        await wrapper.setProps({ hostId: "host-b" });
        await flushPromises();
        expect(document.body.textContent).not.toContain("SSH host profiles could not be loaded.");
    });
    it("does not reuse a completion from a closed discovery after reopening", async () => {
        const first = deferred<Answer<readonly AdoptionCandidate[]>>();
        const second = deferred<Answer<readonly AdoptionCandidate[]>>();
        const supplied = store();
        supplied.adoptDiscover.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { wrapper } = render(AdoptionBrowser, { modelValue: true }, supplied);
        await flushPromises();
        await wrapper.setProps({ modelValue: false });
        await wrapper.setProps({ modelValue: true });
        first.resolve({ ok: true, value: [candidate("closed-result")] });
        await flushPromises();
        expect(document.querySelector(".wl-adoptbrowser__row")).toBeNull();
        second.resolve({ ok: true, value: [candidate("fresh-result")] });
        await flushPromises();
        expect(document.body.textContent).toContain("fresh-result");
        expect(document.body.textContent).not.toContain("closed-result");
        expect(wrapper.emitted("picked")).toBeUndefined();
    });

    it("ignores an earlier host response and picks only the current host's candidate", async () => {
        const first = deferred<Answer<readonly AdoptionCandidate[]>>();
        const second = deferred<Answer<readonly AdoptionCandidate[]>>();
        const supplied = store();
        supplied.adoptDiscover.mockImplementation((hostId?: string | null) =>
            hostId === "host-b" ? second.promise : first.promise);
        const { wrapper } = render(AdoptionBrowser, { modelValue: true }, supplied);
        await flushPromises();
        wrapper.findComponent(VSelect).vm.$emit("update:modelValue", "host-b");
        await flushPromises();
        second.resolve({ ok: true, value: [candidate("candidate-b")] });
        await flushPromises();
        first.resolve({ ok: true, value: [candidate("candidate-a")] });
        await flushPromises();
        expect(supplied.adoptDiscover).toHaveBeenCalledWith("host-b");
        expect(document.body.textContent).toContain("candidate-b");
        expect(document.body.textContent).not.toContain("candidate-a");
        (document.querySelector(".wl-adoptbrowser__row") as HTMLButtonElement).click();
        await flushPromises();
        expect(wrapper.emitted("picked")).toEqual([[candidate("candidate-b"), "host-b"]]);
    });
});
