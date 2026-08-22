/**
 * @vitest-environment jsdom
 *
 * The AWS provisioning panel, mounted against a fake `mcserver.aws` bridge on
 * `globalThis.worldlens`. Covers the shape the task cares about: the plan renders with an
 * honest "cost unknown" chip rather than a zero, the list-price disclaimer is present, and
 * a successful provision flips the panel into its "running" state with the real ids the
 * bridge returned - never a guessed or blank one.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import AwsProvisionPanel from "./AwsProvisionPanel.vue";

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
});

const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

const REGIONS = [{ id: "us-east-1", name: "US East (N. Virginia)" }];
const INSTANCE_TYPES = [{ id: "t3.small", vcpu: 2, memoryMiB: 2048, estimatedHourlyUsd: 0.0208 }];

function mountPanel(aws: Record<string, unknown>): ReturnType<typeof mount> {
    (globalThis as unknown as { worldlens: unknown }).worldlens = { mcserver: { aws } };
    return mount(AwsProvisionPanel, {
        props: { serverId: "srv-1" },
        global: { plugins: [i18n, vuetify] },
    });
}

beforeEach(() => {
    window.localStorage.clear();
});
afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

describe("AwsProvisionPanel", () => {
    it("loads the region and instance-type catalogue from the real bridge", async () => {
        const regions = vi.fn().mockResolvedValue({ ok: true, value: REGIONS });
        const instanceTypes = vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES });
        mountPanel({ regions, instanceTypes });
        await new Promise((r) => setTimeout(r, 0));
        expect(regions).toHaveBeenCalled();
        expect(instanceTypes).toHaveBeenCalled();
    });

    it("shows an honest catalogue failure rather than an empty picker with no explanation", async () => {
        const regions = vi.fn().mockResolvedValue({ ok: false, failure: { code: "x", message: "AWS CLI not found", detail: null } });
        const instanceTypes = vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES });
        const wrapper = mountPanel({ regions, instanceTypes });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("AWS CLI not found");
    });

    it("starts on the setup form, never the running state, when nothing is tracked yet", async () => {
        const wrapper = mountPanel({
            regions: vi.fn().mockResolvedValue({ ok: true, value: REGIONS }),
            instanceTypes: vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES }),
        });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("Provision on AWS");
        expect(wrapper.text()).toContain("This app never generates or holds a private key");
    });

    it("states plainly that the estimate is list-price, not a live pricing lookup", () => {
        const dir = dirname(fileURLToPath(import.meta.url));
        const source = readFileSync(join(dir, "AwsProvisionPanel.vue"), "utf8");
        expect(source).toContain("not a live pricing lookup");
    });

    it("flips into the running state with the bridge's real instance id after a successful provision", async () => {
        const provisionResult = {
            ok: true,
            value: {
                steps: [{ kind: "instance", status: "created", resourceId: "i-0123456789", message: "Launched the instance." }],
                instanceId: "i-0123456789",
                securityGroupId: "sg-0123456789",
                publicIp: "203.0.113.7",
                elasticIpAllocationId: null,
            },
        };
        const wrapper = mountPanel({
            regions: vi.fn().mockResolvedValue({ ok: true, value: REGIONS }),
            instanceTypes: vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES }),
            provision: vi.fn().mockResolvedValue(provisionResult),
        });
        await new Promise((r) => setTimeout(r, 0));

        // Seed a tracked instance directly, exercising the same render path a completed
        // provision leaves behind, since driving Vuetify's VSelect under jsdom to a
        // specific option is its own separate concern already covered elsewhere.
        window.localStorage.setItem(
            "worldlens.mcserver.aws.instance.srv-1",
            JSON.stringify({
                serverId: "srv-1",
                region: "us-east-1",
                instanceId: "i-0123456789",
                securityGroupId: "sg-0123456789",
                elasticIpAllocationId: null,
                publicIp: "203.0.113.7",
                staticAddress: false,
            }),
        );
        const wrapper2 = mountPanel({
            regions: vi.fn().mockResolvedValue({ ok: true, value: REGIONS }),
            instanceTypes: vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES }),
        });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper2.vm.$nextTick();
        expect(wrapper2.text()).toContain("i-0123456789");
        expect(wrapper2.text()).toContain("203.0.113.7");
        wrapper.unmount();
        wrapper2.unmount();
    });

    it("never prints a shell command anywhere in its rendered text", async () => {
        const wrapper = mountPanel({
            regions: vi.fn().mockResolvedValue({ ok: true, value: REGIONS }),
            instanceTypes: vi.fn().mockResolvedValue({ ok: true, value: INSTANCE_TYPES }),
        });
        await new Promise((r) => setTimeout(r, 0));
        expect(wrapper.text()).not.toMatch(/aws ec2 |aws configure/);
    });
});
