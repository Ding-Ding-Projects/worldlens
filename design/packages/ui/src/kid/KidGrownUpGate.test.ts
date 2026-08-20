// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { i18nModule } from "../i18n.js";
import {
    resetSchoolModeRecordAdapter,
    setSchoolModeRecordAdapter,
    type SchoolModeRecordAdapter,
    type SchoolModeSnapshot,
} from "../components/setup/schoolMode.js";
import KidGrownUpGate from "./KidGrownUpGate.vue";

const vuetify = createVuetify({ components, directives });
const unlocked: SchoolModeSnapshot = {
    version: 1,
    enabled: false,
    name: "Study time",
    credentialConfigured: false,
};
const locked: SchoolModeSnapshot = { ...unlocked, enabled: true, credentialConfigured: true };

let wrapper: VueWrapper | null = null;

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

afterEach(async () => {
    wrapper?.unmount();
    wrapper = null;
    await resetSchoolModeRecordAdapter();
    document.body.innerHTML = "";
});

async function settle(): Promise<void> {
    for (let index = 0; index < 5; index += 1) {
        await nextTick();
        await Promise.resolve();
    }
}

function hostAdapter(overrides: Partial<SchoolModeRecordAdapter> = {}): SchoolModeRecordAdapter {
    return {
        source: "shared",
        read: async () => ({ ok: true, state: locked }),
        enable: async () => ({ ok: true, state: locked }),
        rename: async () => ({ ok: true, state: locked }),
        verify: async () => ({ ok: true, state: locked }),
        disable: async () => ({ ok: true, state: unlocked }),
        reset: async () => ({ ok: true, state: unlocked }),
        ...overrides,
    };
}

async function render(adapter: SchoolModeRecordAdapter): Promise<VueWrapper> {
    await setSchoolModeRecordAdapter(adapter);
    wrapper = mount(KidGrownUpGate, {
        global: { plugins: [vuetify, i18nModule] },
        attachTo: document.body,
    });
    await settle();
    return wrapper;
}

describe("the one grown-up gate", () => {
    it("verifies without disabling the shared mode record", async () => {
        const verify = vi.fn(async () => ({ ok: true as const, state: locked }));
        const disable = vi.fn(async () => ({ ok: true as const, state: unlocked }));
        const gate = await render(hostAdapter({ verify, disable }));
        expect(gate.text()).toContain("Study time");

        await gate.get('input[type="password"]').setValue("test-only-unlock");
        await gate.get("button.wl-kid-gate__go").trigger("click");
        await settle();

        expect(verify).toHaveBeenCalledWith("test-only-unlock");
        expect(disable).not.toHaveBeenCalled();
        expect(gate.emitted("switchToAdult")).toHaveLength(1);
    });

    it("fails closed when the packaged bridge is unavailable and offers only Retry", async () => {
        const gate = await render(
            hostAdapter({
                read: async () => ({
                    ok: false as const,
                    code: "storage-unavailable" as const,
                    message: "raw host message",
                    state: null,
                }),
            }),
        );

        expect(gate.text()).toContain("could not be reached");
        expect(gate.text()).toContain("Try the shared record again");
        expect(gate.text()).not.toContain("Go to Adult Mode");
        expect(gate.emitted("switchToAdult")).toBeUndefined();
    });

    it("re-reads the no-code state on click and refuses pass-through when a sibling added a credential", async () => {
        let snapshot = unlocked;
        const gate = await render(
            hostAdapter({
                read: async () => ({ ok: true as const, state: snapshot }),
            }),
        );
        expect(gate.text()).toContain("Go to Adult Mode");

        snapshot = locked;
        await gate.get("button.wl-kid-gate__go").trigger("click");
        await settle();

        expect(gate.emitted("switchToAdult")).toBeUndefined();
        expect(gate.find('input[type="password"]').exists()).toBe(true);
    });
});
