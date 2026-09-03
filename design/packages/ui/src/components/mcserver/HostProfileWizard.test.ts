/**
 * @vitest-environment jsdom
 *
 * Mounted evidence for the host-profile wizard. The native picker is intentionally
 * represented by a real file input, while the bridge methods remain injected and secret-free.
 */

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import HostProfileWizard from "./HostProfileWizard.vue";
import { SERVER_STORE } from "./useServers.js";
import { createServerStore, type Answer, type McServerHost } from "./serverStore.js";
import type { ServerRecord } from "./serverModel.js";

const i18n = createI18n({ legacy: false, locale: "none", fallbackLocale: "none", messages: {}, missingWarn: false, fallbackWarn: false });
const vuetify = createVuetify();

globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
} as unknown as typeof ResizeObserver;

function ok<T>(value: T): Answer<T> { return { ok: true, value }; }

function host(overrides: Partial<McServerHost> = {}): McServerHost {
    const profile = {
        hostId: "fixture-host",
        target: { id: "fixture-host", label: "Fixture host", host: "fixture.example", port: 22, user: "runner", identityFile: null, workDir: "/srv/fixture", image: "example/minecraft:fixture", docker: "docker", keepRemoteFiles: false },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
    };
    return {
        name: "fixture-host",
        list: async () => ok([] as readonly ServerRecord[]),
        get: async () => ok(undefined as unknown as ServerRecord),
        save: async () => ok(undefined as unknown as ServerRecord),
        forget: async () => ok(undefined),
        probe: async () => ok({ reachable: true, runtimeVersion: null, message: "", checkedAt: "now", capabilities: null }),
        status: async () => ok({ state: "absent" as const, running: false, startedAt: null, exitCode: null, checkedAt: "now" }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        files: { list: async () => ok([]), read: async () => ok({ bytes: new Uint8Array(), hash: "", size: 0, truncated: false }), write: async () => ok({ hash: "", size: 0, writtenAt: "now", backupPath: null }) },
        logTail: async () => ok([]),
        hostProfiles: {
            list: vi.fn(async () => ok([profile])),
            get: vi.fn(async () => ok(profile)),
            save: vi.fn(async () => ok(profile)),
            forget: vi.fn(async () => ok(undefined)),
            scan: vi.fn(async () => ok({ profile, recorded: [], offers: [], detail: null })),
            trust: vi.fn(async () => ok({ ok: true, message: "recorded" })),
        },
        ...overrides,
    };
}

function mountWizard(value: McServerHost) {
    const store = createServerStore({ host: value });
    return mount(HostProfileWizard, {
        props: {},
        global: { plugins: [i18n, vuetify], provide: { [SERVER_STORE as symbol]: store } },
        attachTo: document.body,
    });
}

describe("HostProfileWizard", () => {
    it("exposes a keyboard-reachable identity browse control and cancel route", async () => {
        const wrapper = mountWizard(host());
        // The shared PathField, not a hidden <input type="file">. That input reached the path
        // through Electron's File.path, which Electron removed in v32 and this workspace is
        // well past, so it had been handing back a bare filename for a field that needs a full
        // path. PathField calls the application's own native picker instead.
        const browse = wrapper.find('button[aria-label="Browse for the SSH identity file"]');
        expect(browse.exists()).toBe(true);
        await wrapper.findAll("button").find((button) => button.text() === "Cancel")?.trigger("click");
        expect(wrapper.emitted("close")).toBeTruthy();
    });

    it("saves, scans, and refuses trust when a recorded key changed", async () => {
        const candidate = host({
            hostProfiles: {
                ...host().hostProfiles!,
                scan: vi.fn(async () => ok({
                    profile: (await host().hostProfiles!.get("fixture-host")).value!,
                    recorded: [{ type: "ssh-ed25519", fingerprint: "SHA256:old", line: "fixture" }],
                    offers: [{ type: "ssh-ed25519", fingerprint: "SHA256:new", line: "fixture" }],
                    detail: null,
                })),
            },
        });
        const wrapper = mountWizard(candidate);
        await (wrapper.vm as unknown as { saveAndScan(): Promise<void> }).saveAndScan();
        await Promise.resolve();
        await Promise.resolve();
        expect(wrapper.text()).toContain("host-key change is refused");
        expect(wrapper.findAll("button").some((button) => button.text().includes("Trust this fingerprint"))).toBe(false);
    });

    it("renders an honest unavailable state when the host-profile bridge is absent", () => {
        const value = host();
        delete (value as unknown as Record<string, unknown>).hostProfiles;
        const wrapper = mountWizard(value);
        expect(
            wrapper.find('button[aria-label="Browse for the SSH identity file"]').exists(),
        ).toBe(true);
        const save = wrapper.findAll("button").find((button) => button.text().includes("Save and check"));
        expect(save?.attributes("disabled")).toBeDefined();
    });
});
