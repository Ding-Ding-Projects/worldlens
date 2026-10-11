/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import SshProcessReadiness from "./SshProcessReadiness.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore, type Answer, type McServerHost, type SshReadinessRequest, type SshReadinessResult } from "./serverStore.js";
import { MCSERVER_FIXED } from "../../copy/surfaces/mcserver.js";

beforeAll(() => {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});
const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => { for (const wrapper of mounted.splice(0)) wrapper.unmount(); });
const ids = ["platform", "systemd", "user-manager", "linger", "directory", "java", "memory", "disk", "port"];
const answer = (request: SshReadinessRequest): Answer<SshReadinessResult> => ({ ok: true, value: {
    request, checkedAt: "2026-10-11T00:00:00Z", requiredJavaFeature: 21, installationAvailable: false,
    checks: ids.map((id) => ({ id, state: "ready", reason: "not-observed", observed: 21 })),
} });
function setup(check?: NonNullable<McServerHost["sshProcessPreflight"]>, language: "en" | "yue" = "en") {
    const store = createServerStore({ host: { ...(check ? { sshProcessPreflight: check } : {}) } as McServerHost });
    const messages = Object.fromEntries(Object.entries(MCSERVER_FIXED).map(([key, value]) => [key, value[language]]));
    const wrapper = mount(SshProcessReadiness, {
        props: { hostId: "host-one", parentDirectory: "/srv/servers", flavour: "vanilla", version: "1.21.4" },
        global: { plugins: [createVuetify(), createI18n({ legacy: false, locale: language, flatJson: true, messages: { [language]: messages }, missingWarn: false, fallbackWarn: false })],
            provide: { [SERVER_STORE as symbol]: store } },
    });
    mounted.push(wrapper);
    return wrapper;
}
describe("SSH readiness controls", () => {
    it("sends typed settings through the real store and renders all check results", async () => {
        const check = vi.fn(async (request: SshReadinessRequest) => answer(request));
        const wrapper = setup(check);
        await wrapper.get('[data-test="ssh-memory"] input').setValue("4096");
        await wrapper.get('[data-test="ssh-port"] input').setValue("25570");
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(check).toHaveBeenCalledWith({ hostId: "host-one", parentDirectory: "/srv/servers", javaPath: "/usr/bin/java", memoryMb: 4096, port: 25570, flavour: "vanilla", version: "1.21.4" });
        expect(wrapper.findAll("[data-check]")).toHaveLength(9);
        expect(wrapper.text()).toContain("Observed ready");
        expect(wrapper.text()).toContain("installation is not available yet");
    });
    it("holds the activation latch and discards a reply for a replaced host", async () => {
        let finish!: (value: Answer<SshReadinessResult>) => void;
        let sent!: SshReadinessRequest;
        const check = vi.fn((request: SshReadinessRequest) => { sent = request; return new Promise<Answer<SshReadinessResult>>((resolve) => { finish = resolve; }); });
        const wrapper = setup(check);
        const button = wrapper.get('[data-test="ssh-readiness-check"]').element as HTMLButtonElement;
        button.click(); button.click();
        expect(check).toHaveBeenCalledOnce();
        await wrapper.setProps({ hostId: "host-two" });
        finish(answer(sent));
        await flushPromises();
        expect(wrapper.text()).not.toContain("Observed ready");
        expect(button.disabled).toBe(false);
    });
    it("invalidates completed results when a checked setting changes", async () => {
        const wrapper = setup(async (request) => answer(request));
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("Observed ready");
        await wrapper.get('[data-test="ssh-java-path"] input').setValue("/other/java");
        expect(wrapper.text()).not.toContain("Observed ready");
    });
    it("rejects a mismatched response without showing unrelated data", async () => {
        const wrapper = setup(async (request) => answer({ ...request, hostId: "another-host" }));
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("could not be inspected");
        expect(wrapper.text()).not.toContain("Observed ready");
        expect(wrapper.text()).not.toContain("another-host");
    });
    it("shows connection failure and keeps results unknown", async () => {
        const wrapper = setup(async () => { throw new Error("private diagnostic"); });
        await wrapper.get('[data-test="ssh-readiness-check"]').trigger("click");
        await flushPromises();
        expect(wrapper.text()).toContain("could not be inspected");
        expect(wrapper.text()).not.toContain("private diagnostic");
    });
    it("does not dispatch invalid ports or a missing bridge", async () => {
        const check = vi.fn(async (request: SshReadinessRequest) => answer(request));
        const wrapper = setup(check);
        await wrapper.get('[data-test="ssh-port"] input').setValue("65536");
        expect((wrapper.get('[data-test="ssh-readiness-check"]').element as HTMLButtonElement).disabled).toBe(true);
        expect(check).not.toHaveBeenCalled();
        expect(setup().text()).toContain("cannot inspect remote process readiness");
    });
    it("renders the Cantonese labels and installation boundary", () => {
        const wrapper = setup(undefined, "yue");
        expect(wrapper.text()).toContain("遠端程序準備檢查");
        expect(wrapper.text()).toContain("目前未提供遠端程序安裝");
        expect(wrapper.text()).toContain("版本表要求嘅 Java 版本");
    });
});
