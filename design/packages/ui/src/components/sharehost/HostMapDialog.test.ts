// @vitest-environment jsdom

/**
 * The "Host the map" dialog, mounted against a scripted bridge.
 *
 * What is worth pinning is what the person could be misled by: the ready card must come only
 * from a successful outcome, the access code must appear once and vanish when the dialog
 * closes, a failure must show the exact command and exit code, and the one-click fix must
 * actually retry with the new port.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import HostMapDialog from "./HostMapDialog.vue";
import type { HostMapEvent, HostMapOutcome, HostMapRequest, ShareHostBridge } from "./shareHostBridge.js";

const vuetify = createVuetify({ components, directives });
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: {} } });

beforeAll(() => {
    globalThis.ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
    globalThis.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof globalThis.matchMedia;
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    document.elementsFromPoint = (): Element[] => [];
    globalThis.visualViewport = { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, onresize: null, onscroll: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false } as unknown as VisualViewport;
});

const ready: HostMapOutcome = { ok: true, result: { instanceId: "a1b2c3d4", link: "http://192.0.2.59:8100/", where: "this PC", accessName: "viewer", accessCode: "kite-amber-4192", checkedAt: "2026-11-23T19:44:00Z" } };

function bridge(over: Partial<ShareHostBridge> = {}): ShareHostBridge & { requests: HostMapRequest[]; emit: (event: HostMapEvent) => void; setOperation: (id: string) => void } {
    const listeners = new Set<(id: string, event: HostMapEvent) => void>();
    const requests: HostMapRequest[] = [];
    let lastOperation = "op";
    return {
        requests,
        setOperation: (id) => { lastOperation = id; },
        emit: (event) => listeners.forEach((l) => l(lastOperation, event)),
        check: () => Promise.resolve({ ok: true, where: "this PC", dockerVersion: "27.3", arch: "amd64", message: "" }),
        maps: () => Promise.resolve([{ id: "overworld", bytes: 612_000_000 }, { id: "nether", bytes: 208_000_000 }]),
        checkPort: () => Promise.resolve({ free: true, suggested: 8100 }),
        host: (request, id) => { lastOperation = id; requests.push(request); return Promise.resolve(ready); },
        cancel: () => Promise.resolve(true),
        onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        ...over,
    };
}

let current: ReturnType<typeof mount> | null = null;
afterEach(() => { current?.unmount(); current = null; document.body.innerHTML = ""; });

async function open(b: ShareHostBridge | null, props: Record<string, unknown> = {}) {
    current = mount(HostMapDialog, { props: { modelValue: true, renderId: "example", renderLabel: "Example survival", bridge: b, ...props }, global: { plugins: [vuetify, i18n] }, attachTo: document.body });
    await flushPromises();
    return current;
}
const q = (id: string): HTMLElement | null => document.body.querySelector(`[data-testid="${id}"]`);
const click = async (id: string): Promise<void> => { (q(id) as HTMLElement).click(); await flushPromises(); };

describe("HostMapDialog", () => {
    it("fills in the maps and the Docker note from the bridge", async () => {
        await open(bridge());
        expect(q("map-overworld")).not.toBeNull();
        expect((q("map-nether") as HTMLInputElement).checked).toBe(true);
        expect(q("host-note")?.textContent).toContain("27.3");
        expect(q("port-note")?.textContent).toContain("free: checked");
        expect((q("name") as HTMLInputElement).value).toBe("example-survival");
    });

    it("hosts with exactly the settings shown and then offers the link and the one-time code", async () => {
        const b = bridge();
        await open(b);
        await click("map-nether");
        await click("switch-boot");
        await click("host-now");
        expect(b.requests).toEqual([{ renderId: "example", target: { kind: "local" }, name: "example-survival", port: 8100, maps: ["overworld"], startOnBoot: false, accessCode: true, lan: true }]);
        expect(q("ready")).not.toBeNull();
        expect(q("link")?.textContent).toBe("http://192.0.2.59:8100/");
        expect(q("code")?.textContent).toBe("kite-amber-4192");
    });

    it("copies the link and the code", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        await open(bridge());
        await click("host-now");
        await click("copy-link");
        await click("copy-code");
        expect(writeText).toHaveBeenNthCalledWith(1, "http://192.0.2.59:8100/");
        expect(writeText).toHaveBeenNthCalledWith(2, "kite-amber-4192");
    });

    it("opens the link in the external browser", async () => {
        const openExternal = vi.fn();
        await open(bridge({ openExternal }));
        await click("host-now");
        await click("open");
        expect(openExternal).toHaveBeenCalledWith("http://192.0.2.59:8100/");
    });

    it("drops the access code when the dialog closes", async () => {
        const wrapper = await open(bridge());
        await click("host-now");
        expect(q("code")).not.toBeNull();
        await wrapper.setProps({ modelValue: false });
        await wrapper.setProps({ modelValue: true });
        await flushPromises();
        expect(q("code")).toBeNull();
        expect(q("ready")).toBeNull();
    });

    it("shows each step's progress as events arrive", async () => {
        let finish: (o: HostMapOutcome) => void = () => undefined;
        const b = bridge({ host: (_request, id) => { b.setOperation(id); return new Promise<HostMapOutcome>((r) => { finish = r; }); } });
        await open(b);
        await click("host-now");
        b.emit({ type: "step", step: "pack", state: "running", meta: "", at: "t" });
        b.emit({ type: "step", step: "load-image", state: "done", meta: "2.4 MB · 1 s", at: "t" });
        await flushPromises();
        const items = [...document.body.querySelectorAll(".hm__steps li")];
        expect(items[0]?.getAttribute("data-state")).toBe("done");
        expect(items[0]?.textContent).toContain("2.4 MB · 1 s");
        expect(items[1]?.getAttribute("data-state")).toBe("running");
        expect(q("cancel")).not.toBeNull();
        finish(ready);
        await flushPromises();
        expect(q("ready")).not.toBeNull();
    });

    it("shows the exact failure and retries on the suggested port with one click", async () => {
        const failed: HostMapOutcome = { ok: false, failure: { step: "start", message: "The container did not start.", command: "docker run -d --name x", exitCode: 125, output: "Bind for 0.0.0.0:8100 failed: port is already allocated", fix: { id: "use-port", port: 8101, label: "Use port 8101 and retry" } } };
        let calls = 0;
        const b = bridge({ host: (request) => { b.requests.push(request); calls += 1; return Promise.resolve(calls === 1 ? failed : ready); } });
        await open(b);
        await click("host-now");
        expect(q("ready")).toBeNull();
        expect(q("failure-detail")?.textContent).toContain("docker run -d --name x");
        expect(q("failure-detail")?.textContent).toContain("exit 125");
        expect(q("failure-detail")?.textContent).toContain("port is already allocated");
        expect(q("fix")?.textContent).toContain("Use port 8101 and retry");
        await click("fix");
        expect(b.requests.map((r) => r.port)).toEqual([8100, 8101]);
        expect(q("ready")).not.toBeNull();
    });

    it("needs a saved SSH host before it can host there", async () => {
        const b = bridge();
        await open(b, { sshHosts: [{ id: "pi", label: "pi@map-host.example" }] });
        await click("target-ssh");
        expect((q("host-now") as HTMLButtonElement).disabled).toBe(true);
        const select = q("ssh-select") as HTMLSelectElement;
        select.value = "pi";
        select.dispatchEvent(new Event("change"));
        await flushPromises();
        await click("host-now");
        expect(b.requests[0]?.target).toEqual({ kind: "ssh", targetId: "pi" });
    });

    it("refuses to host with no map chosen", async () => {
        await open(bridge());
        await click("map-overworld");
        await click("map-nether");
        expect((q("host-now") as HTMLButtonElement).disabled).toBe(true);
    });

    it("says plainly when this build has no hosting", async () => {
        await open(null);
        expect(document.body.textContent).toContain("Hosting is not available in this build.");
        expect(q("host-now")).toBeNull();
    });
});
