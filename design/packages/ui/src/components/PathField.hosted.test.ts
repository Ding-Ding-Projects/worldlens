// @vitest-environment jsdom

/**
 * `PathField.vue` in a deployment with no desktop.
 *
 * The pair of tests that matter are the two directions of one decision. A desktop must keep
 * reaching for the native picker exactly as before, because this field is adopted by sixteen
 * screens and a regression there is a regression everywhere. A hosted deployment must reach
 * for the mount browser instead, because the native channels are refused there and a browse
 * button that reports a refusal is the thing this whole feature exists to remove.
 *
 * The trap between them: the mount methods exist on every build, since the bridge is one
 * factory for both hosts. Feature-detecting them would send desktops down the hosted path, so
 * the deployment is asked rather than sniffed, and the desktop case below is what proves it.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import PathField from "./PathField.vue";
import type { PathFieldBridge } from "./pathFieldHost.js";
import { setDeploymentForTesting } from "../stores/deployment.js";

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

    Element.prototype.scrollIntoView = () => {};
    document.elementsFromPoint = (): Element[] => [];
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

const vuetify = createVuetify({ components, directives });
const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    locale: "none",
    fallbackLocale: "none",
    messages: {},
});

/** The native picker, which a hosted deployment must not reach for. */
function nativeBridge(): PathFieldBridge & { readonly folderCalls: number } {
    const state = { folderCalls: 0 };
    return {
        get folderCalls() {
            return state.folderCalls;
        },
        pickFolder: async () => {
            state.folderCalls += 1;
            return await Promise.resolve("/picked/natively");
        },
        pickFile: async () => await Promise.resolve(null),
    };
}

/** The mount bridge as the real factory exposes it: present on every build. */
function installMountBridge(): void {
    (window as unknown as { worldlens?: unknown }).worldlens = {
        mounts: {
            list: async () =>
                await Promise.resolve([{ id: "worlds", label: "Worlds", writable: false }]),
            browse: async () =>
                await Promise.resolve({
                    ok: true,
                    listing: {
                        rootId: "worlds",
                        rootLabel: "Worlds",
                        writable: false,
                        path: "/data/worlds",
                        parent: null,
                        entries: [{ name: "overworld", kind: "folder", path: "/data/worlds/overworld" }],
                        truncated: false,
                    },
                }),
        },
    };
}

let current: ReturnType<typeof mount> | null = null;

afterEach(() => {
    current?.unmount();
    current = null;
    document.body.innerHTML = "";
    setDeploymentForTesting(null);
    delete (window as unknown as { worldlens?: unknown }).worldlens;
});

async function open(bridge: PathFieldBridge) {
    const wrapper = mount(PathField, {
        props: { modelValue: "", field: "world folder", semantic: "folder" as const, bridge },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    });
    current = wrapper as unknown as ReturnType<typeof mount>;
    await flushPromises();
    return wrapper;
}

async function clickBrowse(wrapper: Awaited<ReturnType<typeof open>>): Promise<void> {
    await wrapper.find("button").trigger("click");
    await flushPromises();
}

describe("browsing for a folder, on a desktop and in a container", () => {
    it("uses the native picker on a desktop, even though the mount methods exist there too", async () => {
        // The whole point of asking rather than sniffing. Both are installed; nothing has
        // said this is hosted, so the native route must win.
        installMountBridge();
        setDeploymentForTesting({ hosted: false });
        const bridge = nativeBridge();

        const wrapper = await open(bridge);
        await clickBrowse(wrapper);

        expect(bridge.folderCalls).toBe(1);
        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["/picked/natively"]);
        expect(document.body.textContent ?? "").not.toContain("Worlds");
    });

    it("uses the native picker while the deployment is still unknown", async () => {
        // Unknown means "not yet told", and the safe reading of that is desktop: guessing
        // hosted would replace a working picker with a browser that has nothing to list.
        installMountBridge();
        setDeploymentForTesting(null);
        const bridge = nativeBridge();

        const wrapper = await open(bridge);
        await clickBrowse(wrapper);

        expect(bridge.folderCalls).toBe(1);
    });

    it("opens the mount browser instead of the native picker when hosted", async () => {
        installMountBridge();
        setDeploymentForTesting({ hosted: true });
        const bridge = nativeBridge();

        const wrapper = await open(bridge);
        await clickBrowse(wrapper);

        expect(bridge.folderCalls).toBe(0);
        expect(document.body.textContent ?? "").toContain("Worlds");
    });

    it("falls back to the native refusal when hosted without the mount channels wired", async () => {
        // An older server. Better the honest refusal than a browser that cannot list anything.
        setDeploymentForTesting({ hosted: true });
        const bridge = nativeBridge();

        const wrapper = await open(bridge);
        await clickBrowse(wrapper);

        expect(bridge.folderCalls).toBe(1);
    });

    it("writes a browsed path through the same event as typing", async () => {
        installMountBridge();
        setDeploymentForTesting({ hosted: true });

        const wrapper = await open(nativeBridge());
        await clickBrowse(wrapper);

        // The browser opens on the list of mounts. Nothing is choosable until one is entered,
        // which is deliberate: "the folders you mounted" is not itself a folder.
        const root = document.querySelector(".v-list-item") as HTMLElement | null;
        expect(root, "no mounted folder to enter").toBeTruthy();
        root?.click();
        await flushPromises();

        const use = [...document.querySelectorAll(".v-btn")].find((button) =>
            (button.textContent ?? "").includes("Use this folder"),
        ) as HTMLElement | undefined;
        expect(use, "no confirm button in the mount browser").toBeTruthy();
        use?.click();
        await flushPromises();

        expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["/data/worlds"]);
    });
});
