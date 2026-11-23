/**
 * @vitest-environment jsdom
 *
 * The live viewer dialog, mounted against a fake bridge.
 *
 * Only the rendered component can show that a control reaches the request the main process
 * receives, that Host names the exact reason it is unavailable, that the Microsoft device
 * code appears where the person is looking, and that a link is never presented before the
 * main process has verified it.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import LiveViewerDialog from "./LiveViewerDialog.vue";
import type { HostAnswer, HostRequest, InstanceStatus, LiveViewerBridge, ViewerEvent, ViewerInstance } from "./liveViewerBridge.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof globalThis.matchMedia;
    globalThis.visualViewport = { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, onresize: null, onscroll: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false } as unknown as VisualViewport;
});

const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

const instance: ViewerInstance = {
    id: "abc123def456",
    name: "Live viewer",
    createdAt: "2026-11-23T19:58:00",
    target: { kind: "local" },
    hostPort: 3007,
    lanAddress: "192.168.1.20",
    url: "http://192.168.1.20:3007/",
    containerName: "lv-abc123def456",
    kind: "viewer",
    botName: "LensBot",
    serverLabel: "192.168.1.30:25565",
    auth: "offline",
};

interface Fake extends LiveViewerBridge {
    listeners: ((event: ViewerEvent) => void)[];
    requests: HostRequest[];
}

function bridge(overrides: Partial<LiveViewerBridge> = {}, hostedList: InstanceStatus[] = []): Fake {
    const listeners: ((event: ViewerEvent) => void)[] = [];
    const requests: HostRequest[] = [];
    const fake: Fake = {
        listeners,
        requests,
        choices: async () => ({ ok: true, servers: [{ id: "survival", label: "Survival (this PC)", host: "localhost", port: 25565, version: "1.21.4" }], hosts: [{ kind: "local", hostId: null, label: "This PC" }, { kind: "ssh", hostId: "pi", label: "Pi (192.168.1.60)" }] }),
        host: async (request): Promise<HostAnswer> => {
            requests.push(request);
            return { ok: true, instance, verification: { linkReachable: true, botJoined: true, botName: "LensBot", checkedAt: "2026-11-23T19:58:00", botNote: null }, steps: [] };
        },
        cancel: async () => true,
        list: async () => ({ ok: true, value: hostedList }),
        control: async () => ({ ok: true, value: hostedList[0] as InstanceStatus }),
        remove: async () => ({ ok: true, value: null }),
        accounts: async () => ({ ok: true, value: [], available: true }),
        createAccount: async (label) => ({ ok: true, value: { accountRef: "11111111-2222-3333-4444-555555555555", label } }),
        signIn: async () => ({ ok: true, value: null }),
        cancelSignIn: async () => true,
        onEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        ...overrides,
    };
    return fake;
}

let mounted: VueWrapper | null = null;
afterEach(() => {
    mounted?.unmount();
    mounted = null;
    document.body.innerHTML = "";
});

async function open(fake: LiveViewerBridge | null): Promise<void> {
    mounted = mount(LiveViewerDialog, { props: { modelValue: true, bridge: fake }, global: { plugins: [i18n, vuetify] }, attachTo: document.body });
    await flushPromises();
    await flushPromises();
}

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.body.querySelector<T>(selector);
const text = (): string => document.body.textContent ?? "";

async function typeInto(selector: string, value: string): Promise<void> {
    const input = q<HTMLInputElement>(`${selector} input`);
    expect(input, selector).not.toBeNull();
    input!.value = value;
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
}

async function clickButton(label: string): Promise<void> {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent?.trim() === label);
    expect(button, label).toBeDefined();
    button!.click();
    await flushPromises();
}

describe("without a desktop bridge", () => {
    it("says what is needed and keeps Host disabled with its reason beside it", async () => {
        await open(null);
        expect(text()).toContain("Live 3D viewer and bot");
        expect(q("[data-test=lv-no-bridge]")).not.toBeNull();
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(true);
        expect(q("[data-test=lv-blocked]")?.textContent).toContain("needs the desktop application");
    });
});

describe("hosting", () => {
    it("sends every chosen setting and shows the verified link with Open and Copy", async () => {
        const fake = bridge();
        await open(fake);
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(false);
        await typeInto("[data-test=lv-bot-name]", "WatchBot");
        await clickButton("First person");
        await clickButton("Host the view");

        expect(fake.requests).toHaveLength(1);
        const request = fake.requests[0]!;
        expect(request.config).toMatchObject({ kind: "viewer", server: { host: "localhost", port: 25565 }, version: "auto", botName: "WatchBot", auth: "offline", camera: "first", viewDistance: 6, mouseLook: true });
        expect(request.config.behaviours.reconnect).toEqual({ enabled: true, delaySeconds: 10, tries: 5 });
        expect(request.target).toEqual({ kind: "local" });
        expect(request.hostPort).toBe(3007);
        expect(request.operationId.length).toBeGreaterThan(4);

        expect(q("[data-test=lv-url]")?.textContent).toBe("http://192.168.1.20:3007/");
        expect(q<HTMLAnchorElement>("[data-test=lv-open]")?.getAttribute("href")).toBe("http://192.168.1.20:3007/");
        expect(q("[data-test=lv-ready-note]")?.textContent).toBe("LensBot joined at 19:58");

        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        await clickButton("Copy link");
        expect(writeText).toHaveBeenCalledWith("http://192.168.1.20:3007/");
    });

    it("does not claim the bot joined when the link works but the bot has not", async () => {
        const fake = bridge({ host: async () => ({ ok: true, instance, verification: { linkReachable: true, botJoined: false, botName: "LensBot", checkedAt: "2026-11-23T19:58:00", botNote: "failed: kicked: full" }, steps: [] }) });
        await open(fake);
        await clickButton("Host the view");
        const note = q("[data-test=lv-ready-note]")?.textContent ?? "";
        expect(note).toContain("has not joined yet");
        expect(note).toContain("kicked: full");
        expect(note).not.toContain("joined at");
    });

    it("names the reason when the bot name is invalid and sends nothing", async () => {
        const fake = bridge();
        await open(fake);
        await typeInto("[data-test=lv-bot-name]", "no");
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(true);
        expect(q("[data-test=lv-blocked]")?.textContent).toContain("3 to 16");
        expect(fake.requests).toHaveLength(0);
    });

    it("requires a player name once following is on", async () => {
        await open(bridge());
        q<HTMLInputElement>("[data-test=lv-follow] input")!.click();
        await flushPromises();
        expect(q("[data-test=lv-follow-player]")).not.toBeNull();
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(true);
        await typeInto("[data-test=lv-follow-player]", "Steve");
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(false);
    });

    it("shows live progress from the main process and the failure that stopped hosting", async () => {
        let release: (answer: HostAnswer) => void = () => undefined;
        const fake = bridge({ host: (request) => new Promise<HostAnswer>((resolve) => { fake.requests.push(request); release = resolve; }) });
        await open(fake);
        await clickButton("Host the view");
        const operation = fake.requests[0]!.operationId;
        fake.listeners[0]!({ kind: "progress", operationId: operation, steps: [{ id: "docker", state: "done", detail: "Docker 27 is running" }, { id: "image", state: "running", detail: null }, { id: "secrets", state: "skipped", detail: null }] });
        await flushPromises();
        expect(q("[data-test=lv-steps]")?.textContent).toContain("Load the bundled viewer image");
        expect(q("[data-test=lv-steps]")?.textContent).not.toContain("Microsoft sign-in privately");
        expect(q("[data-test=lv-cancel]")).not.toBeNull();
        // events for some other operation are ignored
        fake.listeners[0]!({ kind: "progress", operationId: "other", steps: [{ id: "start", state: "failed", detail: "elsewhere" }] });
        await flushPromises();
        expect(q("[data-test=lv-steps]")?.textContent).not.toContain("elsewhere");
        release({ ok: false, failure: { code: "port-in-use", message: "Port 3007 is already published.", detail: null } });
        await flushPromises();
        expect(q("[data-test=lv-failure]")?.textContent).toContain("Port 3007 is already published.");
        expect(q("[data-test=lv-ready]")).toBeNull();
    });
});

describe("Microsoft sign-in", () => {
    it("needs an account, offers to add one, and shows the device code while signing in", async () => {
        let finish: () => void = () => undefined;
        const fake = bridge({ signIn: () => new Promise((resolve) => { finish = () => resolve({ ok: true, value: null }); }) });
        await open(fake);
        await clickButton("Microsoft account");
        expect(q("[data-test=lv-auth-help]")?.textContent).toContain("microsoft.com/link");
        expect(q("[data-test=lv-blocked]")?.textContent).toContain("Microsoft account");

        await typeInto("[data-test=lv-new-account]", "Main");
        await clickButton("Add");
        expect(q<HTMLButtonElement>("[data-test=lv-host-button]")!.disabled).toBe(false);

        await clickButton("Sign in with Microsoft");
        fake.listeners[0]!({ kind: "device-code", code: { accountRef: "11111111-2222-3333-4444-555555555555", userCode: "ABCD-EFGH", verificationUri: "https://www.microsoft.com/link", expiresIn: 900 } });
        await flushPromises();
        expect(q("[data-test=lv-user-code]")?.textContent).toBe("ABCD-EFGH");
        expect(q<HTMLAnchorElement>("[data-test=lv-device-code] a")?.getAttribute("href")).toBe("https://www.microsoft.com/link");
        finish();
        await flushPromises();
        expect(q("[data-test=lv-device-code]")).toBeNull();
        expect(q("[data-test=lv-signed-in]")?.textContent).toContain("Signed in");
    });

    it("sends the account reference, never anything resembling a token", async () => {
        const fake = bridge({ accounts: async () => ({ ok: true, value: [{ accountRef: "11111111-2222-3333-4444-555555555555", label: "Main" }], available: true }) });
        await open(fake);
        await clickButton("Microsoft account");
        await clickButton("Host the view");
        const request = fake.requests[0]!;
        expect(request.accountRef).toBe("11111111-2222-3333-4444-555555555555");
        expect(JSON.stringify(request)).not.toMatch(/token|password/i);
    });

    it("says when protected storage is unavailable instead of offering a sign-in that cannot work", async () => {
        await open(bridge({ accounts: async () => ({ ok: true, value: [], available: false }) }));
        await clickButton("Microsoft account");
        expect(q("[data-test=lv-no-storage]")).not.toBeNull();
        expect(q("[data-test=lv-sign-in]")).toBeNull();
    });
});

describe("Prismarine Web Client", () => {
    it("says which settings belong to the other viewer and disables them", async () => {
        await open(bridge());
        await clickButton("Prismarine Web Client");
        expect(q("[data-test=lv-client-note]")?.textContent).toContain("apply to Prismarine Viewer only");
        expect(q<HTMLInputElement>("[data-test=lv-mouse-look] input")!.disabled).toBe(true);
        expect(q<HTMLInputElement>("[data-test=lv-follow] input")!.disabled).toBe(false);
    });
});

describe("hosted viewers", () => {
    const running: InstanceStatus = { instance, state: "running", botConnected: true };

    it("lists them with their state and stops one", async () => {
        const control = vi.fn(async () => ({ ok: true as const, value: { ...running, state: "stopped" as const } }));
        await open(bridge({ control }, [running]));
        expect(q("[data-test=lv-hosted]")?.textContent).toContain("Running");
        expect(q("[data-test=lv-hosted]")?.textContent).toContain("bot is in");
        q<HTMLButtonElement>("[data-test=lv-stop]")!.click();
        await flushPromises();
        expect(control).toHaveBeenCalledWith({ id: "abc123def456", action: "stop" });
    });

    it("removes only after the name has been typed", async () => {
        const remove = vi.fn(async () => ({ ok: true as const, value: null }));
        await open(bridge({ remove }, [running]));
        q<HTMLButtonElement>("[data-test=lv-remove]")!.click();
        await flushPromises();
        expect(q<HTMLButtonElement>("[data-test=lv-remove-confirm]")!.disabled).toBe(true);
        await typeInto("[data-test=lv-remove-name]", "Live viewer");
        expect(q<HTMLButtonElement>("[data-test=lv-remove-confirm]")!.disabled).toBe(false);
        q<HTMLButtonElement>("[data-test=lv-remove-confirm]")!.click();
        await flushPromises();
        expect(remove).toHaveBeenCalledWith({ id: "abc123def456", confirmName: "Live viewer" });
    });
});
