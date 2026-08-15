// @vitest-environment jsdom

/**
 * The seam: a real completion event in the running application reaching `award()`.
 *
 * `useKidProgress.test.ts`-shaped coverage (award applies XP, dedupes a repeated id, persists)
 * would only ever prove the *parts* work in isolation - and they already did, before this file
 * existed. What nothing proved is that anything outside `kid/` ever called `award()` at all:
 * `KidShell.vue` exposed a fully-wired `award()` and `App.vue` never once reached it, so every
 * sticker in a shipped build was permanently unearnable no matter how many maps somebody
 * rendered. This mounts the real shell, in real Kid Mode, and drives the real emits `App.vue`
 * now wires to `awardKidSticker()` - never `award()` or `awardKidSticker()` directly - so a
 * regression that disconnects the wiring again fails here exactly the way it would in the
 * shipped app.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "../App.vue";
import { KidShell } from "./index.js";
import { WorldScreen } from "../components/world/index.js";
import { ProjectsScreen } from "../components/project/index.js";
import { CiRenderScreen } from "../components/cirender/index.js";
import PagesScreen from "../components/pages/PagesScreen.vue";
import { BackupScreen } from "../components/backup/index.js";
import WorldRepoScreen from "../components/worldrepo/WorldRepoScreen.vue";
import { profilesStore, removeProfile } from "../stores/profiles.js";

/** See `App.test.ts`'s own doc comment on this exact set of polyfills and why each is needed. */
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

    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/** Stands in for `localStorage`, exactly as `App.test.ts`'s own `cells` does. */
const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

/** The exact key `kidMode.ts`'s own `persisted(KEY_ENABLED, true)` reads and writes. */
const KID_MODE_ENABLED_KEY = "bluemap-kid-mode";
/** The exact key `useKidProgress.ts`'s own `KEY_LEDGER` reads and writes. */
const KID_PROGRESS_KEY = "bluemap-kid-progress";

let wrapper: VueWrapper | null = null;

function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/** The sticker ids the persisted ledger currently records as won, read the way the app itself
 * would on its next launch - straight out of storage, never out of a component's live state. */
function wonStickers(): string[] {
    const raw = cells.get(KID_PROGRESS_KEY);
    if (raw === undefined) return [];
    const parsed = JSON.parse(raw) as { won?: { id: string }[] };
    return (parsed.won ?? []).map((entry) => entry.id);
}

/** Opens a Kid Mode job tab the way `App.vue`'s own `ensureJob`/`revealJob` host callbacks do,
 * through `KidShell`'s own exposed `revealJob` - never by calling `award()` directly, which would
 * prove nothing about the seam this file exists to guard.
 *
 * One call is enough, and it did not used to be. `KidJobStrip` - and so the `jobStrip` ref that
 * `revealJob` reads - only exists once `view === 'work'`, per `KidShell.vue`'s own `v-else-if`,
 * while `revealJob` sets that view and reads the ref for it in the same synchronous call. Vue
 * batches the mount onto its scheduler rather than applying it inside the function that triggered
 * it, so the ref was still `null` at read time and the very first reveal was silently dropped -
 * in a test, and in the shipped app for a child's first tap on Backups or Pages.
 *
 * This helper used to call twice to work around exactly that, which made it a helper that hid the
 * defect it should have exposed. `KidShell.vue` now queues a request made before the strip mounts
 * and drains it in arrival order when the ref appears, so a single call genuinely reveals the page.
 * `KidShell.jobStripRace.test.ts` is what holds that behaviour; if this helper ever needs a second
 * call again, that regressed rather than this test file needing a workaround.
 */
async function revealKidJob(pageId: string): Promise<void> {
    const kidShell = wrapper?.findComponent(KidShell);
    const api = kidShell?.vm as unknown as { revealJob: (id: string) => void } | undefined;
    api?.revealJob(pageId);
    await settle();
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    for (const profile of [...profilesStore.profiles]) removeProfile(profile.id);
    profilesStore.activeId = null;
});

describe("a real render finishing reaches the sticker ledger", () => {
    it("awards 'first-map' the moment openRenderedMap's own callers fire, not merely when award() is called in isolation", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        shell();
        await revealKidJob("world");

        const worldScreen = wrapper?.findComponent(WorldScreen);
        expect(worldScreen?.exists(), "Kid Mode's own Work view never mounted WorldScreen").toBe(true);

        expect(wonStickers()).not.toContain("first-map");
        await worldScreen?.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        expect(wonStickers()).toContain("first-map");
    });

    it("awards 'speed-racer' for a local render but not for a CI render, which the speed dial never governs", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        shell();

        await revealKidJob("cirender");
        const ciScreen = wrapper?.findComponent(CiRenderScreen);
        expect(ciScreen?.exists()).toBe(true);
        await ciScreen?.vm.$emit("rendered", {
            renderId: "run-1",
            dataRoot: "/renders/ci-overworld",
            mapId: "overworld",
        });
        await settle();

        // The CI render is a real completion too - it earns the general sticker...
        expect(wonStickers()).toContain("first-map");
        // ...but never the one that only means anything for a render this machine's own engine,
        // and its own speed dial, actually produced.
        expect(wonStickers()).not.toContain("speed-racer");

        await revealKidJob("world");
        const worldScreen = wrapper?.findComponent(WorldScreen);
        await worldScreen?.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        expect(wonStickers()).toContain("speed-racer");
    });

    it("never awards anything while Kid Mode is off, even though the exact same event fires", async () => {
        // Two independent things make this true, and this test proves the observable behaviour
        // rather than isolating either mechanism on its own: `<KidShell v-if="kid.enabled.value">`
        // means `kidShellRef` is `null` here regardless, and `awardKidSticker`'s own explicit
        // `if (!kid.enabled.value) return` is there as a second, defence-in-depth guarantee that
        // states the "must not fire when Kid Mode is off" rule directly in code rather than
        // leaving it to fall out of a ref's lifecycle - a future refactor that keeps `KidShell`
        // mounted (a `v-show` in place of this `v-if`, say) would silently lose the first
        // protection, and the explicit check is what keeps this guarantee true even then.
        cells.set(KID_MODE_ENABLED_KEY, "false");
        const app = shell();
        await settle();
        expect(app.findComponent(KidShell).exists()).toBe(false);

        const worldScreen = app.findComponent(WorldScreen);
        expect(worldScreen.exists(), "the adult tree never mounted WorldScreen").toBe(true);
        await worldScreen.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        // The real action still happens - Kid Mode being off never touches capability, only the
        // sticker side effect - so the profile is still added; only the ledger stays untouched.
        expect(profilesStore.profiles.some((profile) => profile.name === "overworld")).toBe(true);
        expect(wonStickers()).toEqual([]);
    });
});

describe("awarding is idempotent, including across a restart", () => {
    it("awards the same sticker exactly once no matter how many times the same completion fires, and stays that way after the shell remounts", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        const firstMount = shell();
        await revealKidJob("world");

        const worldScreen = firstMount.findComponent(WorldScreen);
        await worldScreen.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();
        await worldScreen.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        expect(wonStickers().filter((id) => id === "first-map")).toHaveLength(1);
        expect(wonStickers().filter((id) => id === "speed-racer")).toHaveLength(1);

        // Simulates an app restart: the same persisted `cells` map survives, a brand-new App
        // instance (and therefore a brand-new `useKidProgress()` ledger read) is mounted on top
        // of it, and the identical real completion fires again.
        firstMount.unmount();
        document.body.innerHTML = "";

        const secondMount = shell();
        await revealKidJob("world");
        const worldScreenAfterRestart = secondMount.findComponent(WorldScreen);
        await worldScreenAfterRestart.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        expect(wonStickers().filter((id) => id === "first-map")).toHaveLength(1);
        expect(wonStickers().filter((id) => id === "speed-racer")).toHaveLength(1);
    });
});

describe("world-finder is earned from the guide, never from adopting a repository", () => {
    it("stays unearned when a world repository is adopted, and is earned when the guide hands back a project", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        shell();

        await revealKidJob("worldrepo");
        const worldRepo = wrapper?.findComponent(WorldRepoScreen);
        expect(worldRepo?.exists()).toBe(true);
        await worldRepo?.vm.$emit("adopted", "/worlds/andyville");
        await settle();

        expect(wonStickers()).not.toContain("world-finder");

        await revealKidJob("world");
        const worldScreen = wrapper?.findComponent(WorldScreen);
        await worldScreen?.vm.$emit("open-project", "/worlds/andyville");
        await settle();

        expect(wonStickers()).toContain("world-finder");
    });

    it("never earns world-finder from the project editor, which has no open-project emit of its own", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        shell();

        // ProjectsScreen has no open-project emit of its own - only WorldScreen's guide does, and
        // only WorldScreen's binding is routed through the award wrapper. This proves ProjectsScreen
        // rendering a map still earns "first-map"/"speed-racer" without ever earning "world-finder".
        await revealKidJob("projects");
        const projectsScreen = wrapper?.findComponent(ProjectsScreen);
        expect(projectsScreen?.exists()).toBe(true);
        await projectsScreen?.vm.$emit("open-map", "/renders/overworld", ["overworld"]);
        await settle();

        expect(wonStickers()).toContain("first-map");
        expect(wonStickers()).toContain("speed-racer");
        expect(wonStickers()).not.toContain("world-finder");
    });
});

describe("sharer is earned only from PagesScreen's own already-published open", () => {
    it("stays unearned when an unrelated screen opens a link, and is earned when the Pages site is opened", async () => {
        cells.set(KID_MODE_ENABLED_KEY, "true");
        shell();

        await revealKidJob("backups");
        const backups = wrapper?.findComponent(BackupScreen);
        expect(backups?.exists()).toBe(true);
        await backups?.vm.$emit("open", "https://github.com/example/example");
        await settle();

        expect(wonStickers()).not.toContain("sharer");

        await revealKidJob("pages");
        const pages = wrapper?.findComponent(PagesScreen);
        expect(pages?.exists()).toBe(true);
        await pages?.vm.$emit("open", "https://example.github.io/andyville/");
        await settle();

        expect(wonStickers()).toContain("sharer");
    });
});
