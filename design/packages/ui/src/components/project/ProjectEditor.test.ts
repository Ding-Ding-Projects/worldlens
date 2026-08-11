/**
 * @vitest-environment jsdom
 *
 * The project editor, mounted.
 *
 * This is the surface the whole feature exists for - every setting a render will use, set
 * before the render starts - so the assertions are about the claims a screenshot could not
 * check: that the ninety-odd map settings really are on screen rather than merely reachable
 * in the bundle, that the map id is previewed *while* a name is typed rather than after,
 * that a rename onto a taken id is refused on the field, and that a project with nothing to
 * render says why instead of offering a button that would draw nothing.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLI_FLAGS, descriptorFor, type ProjectFile } from "@worldlens/config";
import ProjectEditor from "./ProjectEditor.vue";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigMaskField from "../config/ConfigMaskField.vue";
import ProjectMapsPanel from "./ProjectMapsPanel.vue";
import ProjectStoragesPanel from "./ProjectStoragesPanel.vue";
import TabbedNavigation from "../tabs/TabbedNavigation.vue";
import { editorSettingCount } from "./projectFacts.js";
import {
    createProject,
    mapDescriptor,
    withMapAdded,
    withMapFieldSet,
    withRender,
    withStorageAdded,
} from "./projectModel.js";

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

/*
 * `ProjectEditor` now carries its own `TabbedNavigation`, which persists which tab is
 * active under `worldlens-project-editor-tabs`. Node's own experimental
 * `localStorage` (the thing that warns about `--localstorage-file` above every run in
 * this workspace) is a real, working store rather than jsdom's usual absent one, and it
 * is not reset between test cases in this file. Left alone, the "Core" tab a test three
 * cases ago clicked stays the active tab for every editor mounted after it - a real
 * behaviour for a real restart, and a false cross-test dependency here. Clearing this
 * one key before each test is what keeps every test's "the maps tab is open" assumption
 * true regardless of run order, without reaching for a fake store the way
 * `TabbedNavigation.test.ts` does.
 */
beforeEach(() => {
    try {
        globalThis.localStorage?.removeItem("worldlens-project-editor-tabs");
    } catch {
        // No real store in this run - nothing to clear, and nothing that would have leaked.
    }
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

const STAMP = { now: "2026-08-04T09:00:00+01:00", id: "p1", appVersion: null };
const WORLD = "C:/saves/Survival";
const projectEditorSource = readFileSync(
    resolve(process.cwd(), "packages/ui/src/components/project/ProjectEditor.vue"),
    "utf8",
);

function seeded(): ProjectFile {
    return withMapAdded(createProject("Survival", STAMP), {
        id: "overworld",
        name: "Overworld",
        dimension: "minecraft:overworld",
        world: WORLD,
    });
}

/**
 * The editor, wired to a caller that keeps the project like the real screen does.
 *
 * The editor never mutates the project it is given; it emits a new one. Holding it here is
 * what makes an assertion about the *next* render true rather than an assertion about an
 * event nobody applied.
 */
async function editor(
    project: ProjectFile = seeded(),
    extra: Record<string, unknown> = {},
): Promise<VueWrapper> {
    const wrapper = mount(ProjectEditor, {
        props: {
            project,
            world: WORLD,
            canRender: true,
            ...extra,
            "onUpdate:project": async (value: ProjectFile) => {
                await wrapper.setProps({ project: value });
            },
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    }) as VueWrapper;
    // The tab panels register with their strip on mount, so the first one has not painted
    // until the tick after. Asserting before that reads as an editor with no content in it.
    await flushPromises();
    return wrapper;
}

/**
 * A button by its visible text, inside one root.
 *
 * Scoped rather than global on purpose: Vuetify keeps its overlay container attached to the
 * document between mounts, so a search across the whole body can find a button belonging to
 * a wrapper the previous case unmounted.
 */
function buttonIn(root: ParentNode, text: string): HTMLButtonElement | undefined {
    return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
        (button.textContent ?? "").includes(text),
    );
}

function buttonNamed(wrapper: VueWrapper, text: string): HTMLButtonElement | undefined {
    return buttonIn(wrapper.element as unknown as ParentNode, text);
}

/**
 * The add-a-map form, which opens in place rather than as a dialog.
 *
 * Deliberately not a `v-dialog`: it is a form to complete or cancel, not a decision the
 * rest of the application has to be stopped for, so it stays inside the component tree and
 * these helpers can reach it without going hunting in a teleported overlay.
 */
function createForm(wrapper: VueWrapper): ParentNode {
    const form = (wrapper.element as unknown as ParentNode).querySelector(
        ".mb-project-maps__create",
    );
    if (form === null) throw new Error("the add-a-map form is not open");
    return form;
}

function createInputs(wrapper: VueWrapper): HTMLInputElement[] {
    return [...createForm(wrapper).querySelectorAll<HTMLInputElement>("input")];
}

describe("every map setting, before the render starts", () => {
    it("renders the map's whole config through the same form the options editor uses", async () => {
        // Not a hand-written subset: the groups, the controls, the documentation and the
        // defaults all come from the schema, so a setting added tomorrow appears with no
        // change to the editor.
        const wrapper = await editor();

        const form = wrapper.findComponent(ConfigFileForm);
        expect(form.exists()).toBe(true);

        const paths = form.props("file").descriptor.fields.map((field) => field.path);
        expect(paths.length).toBeGreaterThan(25);
        // A few by name, because a count alone would still pass if the form were handed the
        // wrong file entirely.
        expect(paths).toContain("sky-color");
        expect(paths).toContain("remove-caves-below-y");
        expect(paths).toContain("marker-sets");

        // The map form keeps every FieldMeta row visible, but its render-mask row is a route
        // into the one map-node card rather than a second editor/draft inside the generated form.
        const visiblePaths = form
            .findAll("[data-field-path]")
            .map((row) => row.attributes("data-field-path"));
        expect(visiblePaths).toHaveLength(paths.length);
        expect(form.findAll("[data-field-type]")).toHaveLength(paths.length);
        expect(form.findAll("[data-field-provenance]")).toHaveLength(paths.length);
        const maskRow = form.find('[data-field-path="render-mask"]');
        expect(maskRow.exists()).toBe(true);
        const launcher = buttonIn(
            maskRow.element as unknown as ParentNode,
            "Open the shared Render mask card",
        );
        expect(launcher).toBeDefined();
        launcher!.click();
        await flushPromises();
        expect(wrapper.findAllComponents(ConfigMaskField)).toHaveLength(1);
        wrapper.unmount();
    });

    it("shows the map's identity above it, including which storage its tiles go into", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("Map id");
        expect(wrapper.text()).toContain("Storage the tiles go into");
        expect(wrapper.text()).toContain("Dimension");
        wrapper.unmount();
    });

    it("has a tab for each of the four whole-file settings, saying what absent means", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("Web server");
        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("Core"))
            ?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("carries no core.conf of its own");
        wrapper.unmount();
    });

    it("activates its real nested tabs with Enter and Space, without opening an overlay", async () => {
        const wrapper = await editor();
        const tabs = wrapper.findAll('[role="tab"]');
        const core = tabs.find((tab) => tab.text().includes("Core"));
        const maps = tabs.find((tab) => tab.text().includes("Maps"));

        expect(core).toBeDefined();
        expect(maps).toBeDefined();
        await core!.trigger("keydown", { key: "Enter" });
        await flushPromises();
        expect(core!.attributes("aria-selected")).toBe("true");
        expect(wrapper.text()).toContain("carries no core.conf of its own");

        await maps!.trigger("keydown", { key: " " });
        await flushPromises();
        expect(maps!.attributes("aria-selected")).toBe("true");
        expect(wrapper.find(".v-overlay--active").exists()).toBe(false);
        wrapper.unmount();
    });
});

describe("the live map id preview", () => {
    it("shows what the name becomes while it is still being typed", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const name = createInputs(wrapper)[0];
        expect(name).toBeDefined();

        name!.value = "My World!";
        name!.dispatchEvent(new Event("input"));
        await flushPromises();

        // The id becomes a folder on disk and a segment of the URL a tile is served from,
        // so meeting it for the first time in a path three screens later is the failure.
        expect(createForm(wrapper).textContent).toContain("my-world-");
        wrapper.unmount();
    });

    it("refuses an id the render engine would refuse, on the field that asked for it", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const inputs = createInputs(wrapper);
        inputs[0]!.value = "!!!";
        inputs[0]!.dispatchEvent(new Event("input"));
        await flushPromises();

        expect(createForm(wrapper).textContent).toContain("has to start with a letter or a digit");
        wrapper.unmount();
    });

    it("previews a rename of the map that is open, and refuses one onto a taken id", async () => {
        let project = seeded();
        project = withMapAdded(project, {
            id: "nether",
            name: "The Nether",
            dimension: "minecraft:the_nether",
            world: WORLD,
        });
        const wrapper = await editor(project);

        const idField = wrapper
            .findAll("input")
            .find((input) => (input.element as HTMLInputElement).value === "overworld");
        expect(idField).toBeDefined();

        await idField!.setValue("Nether");
        await flushPromises();

        expect(wrapper.text()).toContain("Becomes the folder and the address segment nether");
        // BlueMap refuses to start when two maps share an id, because they would write into
        // the same folder, so this is a real failure rather than a tidiness rule.
        expect(wrapper.text()).toContain("already has a map called nether");
        wrapper.unmount();
    });
});

describe("adding and removing maps", () => {
    it("opens Add a map from a genuine button, focuses its first field, and leaves no invisible overlay", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));
        const add = buttonNamed(wrapper, "Add a map");

        expect(add).toBeDefined();
        expect(add!.tagName).toBe("BUTTON");
        expect(add!.disabled).toBe(false);
        add!.focus();
        expect(document.activeElement).toBe(add);
        add!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        add!.dispatchEvent(new Event("pointerup", { bubbles: true }));
        add!.click();
        await flushPromises();

        expect(createInputs(wrapper)[0]).toBe(document.activeElement);
        expect(wrapper.find(".v-overlay--active").exists()).toBe(false);
        wrapper.unmount();
    });

    it("adds one written from BlueMap's own template", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        buttonNamed(wrapper, "Add a map")?.click();
        await flushPromises();

        const inputs = createInputs(wrapper);
        inputs[0]!.value = "Overworld";
        inputs[0]!.dispatchEvent(new Event("input"));
        await flushPromises();

        buttonIn(createForm(wrapper), "Add the map")?.click();
        await flushPromises();

        // `props()` whole rather than `props("project")`: the wrapper is not generic over
        // the component here, so the single-key overload narrows its argument to `never`.
        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.maps.map((map) => map.id)).toEqual(["overworld"]);
        expect(project.maps[0]?.config).toContain("sky-color");
        wrapper.unmount();
    });

    it("puts the two-key gate in front of removing one, naming the tiles it will not delete", async () => {
        const wrapper = await editor();

        // Scoped to the maps panel on purpose: the tab strip above it carries its own
        // `ConfigSuperConfirm` for the bulk-close gate, and a bare `findComponent` by
        // name returns whichever of the two the tree happens to render first.
        const gate = wrapper
            .findComponent(ProjectMapsPanel)
            .findComponent({ name: "ConfigSuperConfirm" });
        expect(gate.exists()).toBe(true);
        expect((gate.props("affected") as string[]).join(" ")).toContain("are NOT deleted");
        wrapper.unmount();
    });
});

describe("starting the render", () => {
    it("says why it cannot rather than offering a button that would draw nothing", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        expect(wrapper.text()).toContain("no maps yet");
        // The empty state teaches what a map is before it says to add one, not just that
        // there is not one yet.
        expect(wrapper.text()).toContain("one dimension");
        expect(buttonNamed(wrapper, "Render on this computer")?.disabled).toBe(true);
        wrapper.unmount();
    });

    it("offers it once there is a map, and counts the ones that will actually be drawn", async () => {
        const wrapper = await editor();

        expect(buttonNamed(wrapper, "Render on this computer (1 maps)")).toBeDefined();
        expect(buttonNamed(wrapper, "Render on this computer (1 maps)")?.disabled).toBe(false);
        wrapper.unmount();
    });

    it("emits the render rather than starting one itself", async () => {
        const wrapper = await editor();

        buttonNamed(wrapper, "Render on this computer (1 maps)")?.click();
        await flushPromises();

        expect(wrapper.emitted("render")).toHaveLength(1);
        wrapper.unmount();
    });

    it("says plainly when this build cannot render at all, without hiding the settings", async () => {
        const wrapper = await editor(seeded(), { canRender: false });

        expect(wrapper.text()).toContain("cannot render locally");
        expect(wrapper.findComponent(ConfigFileForm).exists()).toBe(true);
        wrapper.unmount();
    });
});

describe("saving", () => {
    it("offers Save only once something has changed", async () => {
        const clean = await editor(seeded(), { dirty: false });
        expect(buttonNamed(clean, "Save now")?.disabled).toBe(true);
        clean.unmount();

        const changed = await editor(seeded(), { dirty: true });
        await flushPromises();
        expect(buttonNamed(changed, "Save now")?.disabled).toBe(false);
        expect(changed.text()).toContain("Unsaved changes");
        changed.unmount();
    });

    it("shows whatever the save refused with, verbatim", async () => {
        const wrapper = await editor(seeded(), { saveFailure: "the world folder is read-only" });

        expect(wrapper.text()).toContain("the world folder is read-only");
        wrapper.unmount();
    });
});

describe("the guided empty state", () => {
    it("offers preset cards alongside Add a map, only when there truly are no maps yet", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        expect(wrapper.text()).toContain("Or start from a preset");
        expect(wrapper.text()).toContain("Start from BlueMap's defaults");
        expect(wrapper.text()).toContain("Overworld, Nether and End");
        const applyButtons = [...wrapper.element.querySelectorAll("button")].filter((button) =>
            (button.textContent ?? "").includes("Use this preset"),
        );
        expect(applyButtons).toHaveLength(4);
        wrapper.unmount();
    });

    it("does not show preset cards once the project already has a map", async () => {
        const wrapper = await editor(seeded());

        expect(wrapper.text()).not.toContain("Or start from a preset");
        wrapper.unmount();
    });

    it("applying a preset creates its maps, which stay fully editable afterwards", async () => {
        const wrapper = await editor(createProject("Empty", STAMP));

        // PROJECT_PRESETS lists "Overworld, Nether and End" second, right after the single
        // "Start from BlueMap's defaults" card.
        const applyButtons = [...wrapper.element.querySelectorAll("button")].filter((button) =>
            (button.textContent ?? "").includes("Use this preset"),
        );
        applyButtons[1]!.click();
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.maps.map((map) => map.id).sort()).toEqual(["end", "nether", "overworld"]);
        // Written from BlueMap's own per-dimension templates, exactly like "Add a map" does.
        expect(project.maps.find((map) => map.id === "nether")?.config).toContain("sky-color");
        expect(project.storages.map((storage) => storage.id)).toEqual(["file"]);
        expect((document.activeElement as HTMLInputElement | null)?.value).toBe("Overworld");
        expect(wrapper.find(".v-overlay--active").exists()).toBe(false);

        // Fully editable afterwards: the overworld map (selected first) can be renamed
        // through the ordinary identity field, exactly as a hand-added map could be.
        const nameField = wrapper
            .findAll("input")
            .find((input) => (input.element as HTMLInputElement).value === "Overworld");
        expect(nameField).toBeDefined();
        await nameField!.setValue("My Overworld");
        await flushPromises();

        const after = (wrapper.props() as { project: ProjectFile }).project;
        expect(after.maps.find((map) => map.id === "overworld")?.name).toBe("My Overworld");
        wrapper.unmount();
    });
});

describe("a render option's own default indicator", () => {
    it("says a value already matches BlueMap's default, with no revert button, until something changes it", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("This already matches BlueMap's own default.");
        expect(buttonNamed(wrapper, "Revert to")).toBeUndefined();
        wrapper.unmount();
    });

    /**
     * The label names the value, which is the whole of what makes this button answerable
     * rather than merely pressable. "Revert to default" tells somebody a default exists,
     * which the line beside it already told them; "Revert to off" tells them what pressing
     * it will do, before they press it. So the assertion is on the value in the label, not
     * on the presence of a button that happens to say "revert" somewhere.
     */
    it("shows what it was set to, and a working revert that names the value it restores", async () => {
        const wrapper = await editor(withRender(seeded(), { force: true }));

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("Set to on. BlueMap's default is off.");
        const reset = buttonNamed(wrapper, "Revert to off");
        expect(reset).toBeDefined();

        reset!.click();
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.render.force).toBe(false);
        expect(wrapper.text()).not.toContain("Revert to off");
        wrapper.unmount();
    });

    /**
     * The route is the one option whose stored value and its own control disagree about what
     * it is called - the file says `local`, the select says "This computer" - so it is the
     * one that would quietly ship a button promising a value nothing on screen ever shows.
     */
    it("names the route by the label its control uses, not by the value the file stores", async () => {
        const wrapper = await editor(withRender(seeded(), { route: "github-actions" }));

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        expect(buttonNamed(wrapper, "Revert to This computer")).toBeDefined();
        expect(buttonNamed(wrapper, "Revert to local")).toBeUndefined();
        wrapper.unmount();
    });
});

/**
 * The two claims the prototype puts on this screen that no styling could carry: that a
 * project opens on BlueMap's own generated defaults with every setting already present, and
 * that nothing reaches the disk until somebody saves. Both are checked here against real
 * values rather than against a sentence, because both are the kind of sentence that stays on
 * screen long after it stopped being true.
 */
describe("what the editor says about itself", () => {
    it("states the generated defaults with a count that follows the schema", async () => {
        const wrapper = await editor();

        // Not the literal number: this asserts the sentence carries the count the schema
        // actually has, so a setting added upstream cannot leave a stale figure behind.
        const settings = editorSettingCount();
        expect(settings).toBeGreaterThan(50);
        expect(wrapper.text()).toContain(`All ${settings} settings`);
        expect(wrapper.text()).toContain("BlueMap's own generated defaults");
        wrapper.unmount();
    });

    it("names the one file a save writes, and says the world and its tiles are untouched", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("Save plan");
        expect(wrapper.text()).toContain(`${WORLD}/worldlens.project.json`);
        expect(wrapper.text()).toContain("the world folder itself");
        wrapper.unmount();
    });

    it("says a save would write nothing while the file on disk already matches", async () => {
        const clean = await editor(seeded(), { dirty: false });
        expect(clean.text()).toContain("The file on disk already says what this screen says");
        clean.unmount();

        const dirty = await editor(seeded(), { dirty: true });
        expect(dirty.text()).not.toContain("The file on disk already says what this screen says");
        expect(dirty.text()).toContain("holding 1 maps");
        dirty.unmount();
    });
});

/**
 * The difference between a cheap edit and an hour of rendering, said beside the control that
 * costs it. Only the two options that really do cost carry it: a warning on every row is a
 * warning nobody reads, and one on a row that does not deserve it is simply wrong.
 */
describe("what changing a render option costs", () => {
    it("marks only the options that make an already-rendered map be drawn again", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        const text = wrapper.text();
        expect(text).toContain("the next render draws every tile again");
        expect(text).toContain("leaves every tile already rendered behind in the old folder");

        // Two badges, for the two rows that earned one.
        const pills = wrapper.findAll(".mb-render-option__pill");
        expect(pills).toHaveLength(2);
        expect(pills.every((pill) => pill.text() === "re-renders tiles")).toBe(true);
        wrapper.unmount();
    });
});

/**
 * The mask is the one setting on a map that decides how much of the world gets drawn at all,
 * and it is the ninetieth row of an accordion. Lifting it out is only worth anything if the
 * card goes to the real editor: a second mask editor beside the first one would be a second
 * set of rules about what a mask means, so what is asserted here is the route, not a drawing
 * surface of this component's own.
 */
describe("the render mask, above the ninety settings rather than inside them", () => {
    it("says an empty mask renders everything, which is BlueMap's default rather than an omission", async () => {
        // Genuinely empty, which a template-written map is not: upstream's own template
        // arrives carrying one box with every bound commented out.
        const wrapper = await editor(withMapFieldSet(seeded(), "overworld", "render-mask", []));

        expect(wrapper.text()).toContain("Render mask");
        expect(wrapper.text()).toContain("No mask");
        expect(wrapper.text()).toContain("BlueMap's own default");
        wrapper.unmount();
    });

    /**
     * The template's own box limits nothing at all, and a card that counted shapes and stopped
     * would announce "1 added" on a mask that renders exactly as much as no mask does. This is
     * the assertion that stops the summary being true and misleading at the same time.
     */
    it("does not let the template's unbounded box read as a mask that limits something", async () => {
        const wrapper = await editor();

        expect(wrapper.text()).toContain("1 added and 0 cut out");
        expect(wrapper.text()).toContain("no limit on some axis");
        wrapper.unmount();
    });

    it("sends the settings form to the real mask field rather than drawing a second editor", async () => {
        const wrapper = await editor();

        const form = wrapper.findComponent(ConfigFileForm);
        expect(form.props("highlightPath")).toBe(null);

        const open = buttonNamed(wrapper, "Open the mask editor");
        expect(open).toBeDefined();
        open!.click();
        await flushPromises();

        expect(wrapper.findComponent(ConfigFileForm).props("highlightPath")).toBe("render-mask");
        wrapper.unmount();
    });
});

describe("the render output folder", () => {
    it("carries the shared browse affordance rather than a plain text box", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        const browse = wrapper
            .findAll("button")
            .find(
                (candidate) =>
                    candidate.attributes("aria-label") === "Browse for the render output folder",
            );
        expect(browse).toBeDefined();
        expect(wrapper.find(".mb-path-field input").exists()).toBe(true);
        wrapper.unmount();
    });

    it("writes a typed path through the same event a pick would", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        await wrapper.find(".mb-path-field input").setValue("D:/rendered/out");
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.render.outputFolder).toBe("D:/rendered/out");
        wrapper.unmount();
    });
});

describe("the render location", () => {
    it("persists GitHub Actions and changes the one-click render action", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        const route = wrapper
            .findAllComponents({ name: "VSelect" })
            .find((candidate) => candidate.text().includes("This computer"));
        expect(route).toBeDefined();
        route?.vm.$emit("update:modelValue", "github-actions");
        await flushPromises();

        const { project } = wrapper.props() as { project: ProjectFile };
        expect(project.render.route).toBe("github-actions");
        expect(wrapper.text()).toContain("Render with GitHub Actions (1 maps)");
        wrapper.unmount();
    });
});

describe("the render tab", () => {
    it("carries its own search, because a small surface is not an exempt one", async () => {
        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"))
            ?.trigger("click");
        await flushPromises();

        const projectRunSettings = wrapper.find(".mb-project-editor__project-run-settings");
        expect(projectRunSettings.text()).toContain("Render threads");
        expect(projectRunSettings.text()).toContain("Redraw the edges too");

        const search = projectRunSettings.find(".mb-config-search input");
        await search?.setValue("threads");
        await flushPromises();

        expect(projectRunSettings.text()).toContain("Render threads");
        expect(projectRunSettings.text()).not.toContain("Redraw the edges too");
        wrapper.unmount();
    });
});

/**
 * Reachability guard: `project:save` has recorded one revision per save since the project
 * layer landed (its own doc comment promises exactly that), and `main/project/ipc.ts`
 * registers `project:history`/`project:restore` beside it - but nothing in this package ever
 * mounted a panel that reads either one back. This is the test that fails the moment the
 * History tab, or its wiring to those two channels, is removed or silently disconnected
 * again: it does not merely check that "History" appears in a tab strip, it proves the tab's
 * content really calls `project.history` with this project's own world folder, which is what
 * a `SimpleHistoryList` stub or a tab with an empty body would still fail.
 */
describe("the history tab", () => {
    const originalBridge = (globalThis as { worldlens?: unknown }).worldlens;

    afterEach(() => {
        (globalThis as { worldlens?: unknown }).worldlens = originalBridge;
    });

    it("calls project:history for this project's own world the moment it is opened", async () => {
        const history = vi.fn().mockResolvedValue({
            available: true,
            reason: null,
            worldFolder: WORLD,
            repository: "C:/app-data/project-history/abc123",
            revisions: [],
            remotes: [],
        });
        const restore = vi.fn();
        (globalThis as { worldlens?: unknown }).worldlens = {
            project: { history, restore },
        };

        const wrapper = await editor();

        expect(history).not.toHaveBeenCalled();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("History"))
            ?.trigger("click");
        await flushPromises();

        expect(history).toHaveBeenCalledWith(WORLD, undefined);
        expect(wrapper.text()).toContain("C:/app-data/project-history/abc123");
        wrapper.unmount();
    });

    it("names the missing shell rather than offering a Restore button that would throw", async () => {
        (globalThis as { worldlens?: unknown }).worldlens = undefined;

        const wrapper = await editor();

        await wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("History"))
            ?.trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("no version history");
        wrapper.unmount();
    });
});

describe("the project-shaped workspace", () => {
    it("uses a real project navigation list to select the actual map editor, alongside its fields and context rail", async () => {
        let project = seeded();
        project = withMapAdded(project, {
            id: "nether",
            name: "The Nether",
            dimension: "minecraft:the_nether",
            world: WORLD,
        });
        project = withStorageAdded(project, "archive", "storage-type: FILE\nroot: ./archive\n");
        const wrapper = await editor(project);

        const navigator = wrapper.find('nav[aria-label="Project structure"]');
        const editorPane = wrapper.find('section[aria-label="Project settings editor"]');
        const context = wrapper.find('aside[aria-label="Render consequences and save plan"]');
        expect(navigator.exists()).toBe(true);
        expect(editorPane.exists()).toBe(true);
        expect(context.exists()).toBe(true);

        const nether = wrapper.find('[data-workspace-node="map:nether"]');
        expect(nether.element.tagName).toBe("BUTTON");
        await nether.trigger("click");
        await flushPromises();

        expect(nether.attributes("aria-current")).toBe("page");
        expect(wrapper.findComponent(ProjectMapsPanel).props("selectedId")).toBe("nether");
        // The map entry opens the existing schema-driven form rather than a parallel, reduced
        // editor: selecting a node must not silently drop FieldMeta-driven map settings.
        expect(wrapper.findComponent(ConfigFileForm).exists()).toBe(true);

        const archive = wrapper.find('[data-workspace-node="storage:archive"]');
        await archive.trigger("click");
        await flushPromises();
        expect(archive.attributes("aria-current")).toBe("page");
        expect(wrapper.findComponent(ProjectStoragesPanel).props("selectedId")).toBe("archive");
        wrapper.unmount();
    });

    it("keeps the project tree aria-current node aligned when TabbedNavigation changes the active section", async () => {
        let project = seeded();
        project = withStorageAdded(project, "archive", "storage-type: FILE\nroot: ./archive\n");
        const wrapper = await editor(project);

        const maps = wrapper.find('[data-workspace-node="maps"]');
        const storages = wrapper.find('[data-workspace-node="storages"]');
        const archive = wrapper.find('[data-workspace-node="storage:archive"]');
        const core = wrapper.find('[data-workspace-node="core"]');

        const storagesTab = wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("Storages"));
        expect(storagesTab).toBeDefined();
        await storagesTab?.trigger("click");
        await flushPromises();
        await flushPromises();
        expect(storagesTab?.attributes("aria-selected")).toBe("true");
        expect(
            (
                wrapper.findComponent(TabbedNavigation).vm as unknown as {
                    activePage: { id: string };
                }
            ).activePage.id,
        ).toBe("storages");
        expect(archive.attributes("aria-current")).toBe("page");
        expect(storages.attributes("aria-current")).toBeUndefined();
        expect(maps.attributes("aria-current")).toBeUndefined();

        const coreTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text().includes("Core"));
        expect(coreTab).toBeDefined();
        await coreTab?.trigger("click");
        await flushPromises();
        await flushPromises();
        expect(coreTab?.attributes("aria-selected")).toBe("true");
        expect(core.attributes("aria-current")).toBe("page");
        expect(archive.attributes("aria-current")).toBeUndefined();

        // A palette/deep-link calls the tab component directly, so no editor click or keydown
        // event reaches the workspace wrapper. The tree must still follow the authoritative
        // exposed active page rather than remaining on the last pointer-selected node.
        const navigation = wrapper.findComponent(TabbedNavigation);
        (navigation.vm as unknown as { revealPage: (pageId: string) => void }).revealPage("maps");
        await flushPromises();
        await flushPromises();
        // Maps retains its selected map when the destination is revealed, so the real leaf is
        // highlighted rather than the generic section heading.
        expect(
            wrapper.find('[data-workspace-node="map:overworld"]').attributes("aria-current"),
        ).toBe("page");
        expect(core.attributes("aria-current")).toBeUndefined();
        wrapper.unmount();
    });

    it("shows each editable tree node's schema or CLI count instead of asking a reader to guess", async () => {
        const wrapper = await editor();
        const mapNode = wrapper.find('[data-workspace-node="map:overworld"]');
        const coreNode = wrapper.find('[data-workspace-node="core"]');
        const cliNode = wrapper.find('[data-workspace-node="render"]');
        const coreCount = descriptorFor("core").fields.length;

        expect(mapNode.get("[data-workspace-node-count]").text()).toBe(
            `${mapDescriptor().fields.length} settings`,
        );
        expect(coreNode.get("[data-workspace-node-count]").text()).toBe(`${coreCount} settings`);
        expect(cliNode.get("[data-workspace-node-count]").text()).toBe(`${CLI_FLAGS.length} flags`);
        expect(cliNode.text()).toContain(`${CLI_FLAGS.length} CLI flags`);
        wrapper.unmount();
    });

    it("renders the complete schema-owned CLI editor through the existing resolver", async () => {
        const wrapper = await editor();
        const renderTab = wrapper
            .findAll('[role="tab"]')
            .find((tab) => tab.text().includes("How it renders"));
        expect(renderTab).toBeDefined();
        await renderTab?.trigger("click");
        await flushPromises();
        await flushPromises();

        expect(wrapper.text()).toContain(
            `Every one of BlueMap's ${CLI_FLAGS.length} documented CLI flags`,
        );
        expect(wrapper.findAll(".mb-config-run__flag")).toHaveLength(CLI_FLAGS.length);
        // The project context and the complete editor use the same resolver rather than a
        // second hand-made flag list; every defined option reaches the interactive surface.
        for (const flag of CLI_FLAGS) {
            expect(wrapper.text()).toContain(`--${flag.long}`);
        }
        wrapper.unmount();
    });

    it("shows the standalone CLI resolver's command and resolved render branch without inventing bridge-only flags or a revision", async () => {
        const wrapper = await editor(withRender(seeded(), { force: true, fixEdges: true }), {
            dirty: true,
        });
        const context = wrapper.find('aside[aria-label="Render consequences and save plan"]');

        expect(context.text()).toContain("Consequences");
        expect(context.text()).toContain("1 enabled map(s) are ready for the selected route.");
        expect(context.text()).toContain("Resolved bluemap-cli preview");
        expect(context.get("[data-project-cli-command]").text()).toBe(
            "bluemap-cli -r -f -e -m overworld",
        );
        expect(context.text()).toContain(
            "The standalone CLI resolves to rendering only overworld, re-rendering everything.",
        );
        expect(context.text()).toContain("Desktop render bridge");
        expect(context.text()).toContain("worldlens.project.json · C:/saves/Survival");
        expect(context.text()).toContain("The desktop bridge still starts this project.");
        expect(context.text()).toContain("map bodies, threads, metrics and output directory");
        expect(context.text()).toContain("write worldlens.project.json");
        expect(context.text()).toContain(
            "1 map config(s), 0 storage config(s), and 0 whole-file config(s)",
        );
        expect(context.text()).toContain(
            "One revision is recorded only after that project-file write succeeds and changes its bytes.",
        );
        expect(context.text()).not.toMatch(/revision\s+\d+/i);
        wrapper.unmount();
    });

    it("does not fabricate a local CLI command when GitHub Actions owns the render route", async () => {
        const wrapper = await editor(withRender(seeded(), { route: "github-actions" }));
        const context = wrapper.find('aside[aria-label="Render consequences and save plan"]');

        expect(context.find("[data-project-cli-command]").exists()).toBe(false);
        expect(context.text()).toContain("No CLI preview:");
        expect(context.text()).toContain("GitHub Actions owns this start");
        wrapper.unmount();
    });

    it("has a three-pane desktop grid that collapses by container width before narrow layouts can overflow", () => {
        // The middle column carries the larger share: the tree is eight short names and the
        // consequences panel is a summary, while the settings are what the editor is for.
        expect(projectEditorSource).toMatch(
            /grid-template-columns:\s*minmax\(11rem, 0\.55fr\) minmax\(0, 2\.7fr\) minmax\(16rem, 0\.8fr\)/,
        );
        expect(projectEditorSource).toContain("@container project-editor (max-width: 72rem)");
        expect(projectEditorSource).toContain("@container project-editor (max-width: 52rem)");
        expect(projectEditorSource).toMatch(
            /\.mb-project-editor__workspace\s*\{[^}]*min-inline-size:\s*0/s,
        );
        expect(projectEditorSource).toContain("grid-template-columns: minmax(0, 1fr)");
    });

    describe("collapsing the structure column", () => {
        it("starts showing, and the toggle says so", async () => {
            const wrapper = await editor(seeded(), { navigatorStorage: null });
            const toggle = wrapper.find(".mb-project-editor__navigator-toggle");
            expect(toggle.exists()).toBe(true);
            expect(toggle.attributes("aria-expanded")).toBe("true");
            expect(wrapper.find(".mb-project-editor__workspace--collapsed").exists()).toBe(false);
            wrapper.unmount();
        });

        it("collapses on the toggle, widens the settings, and keeps the way back on screen", async () => {
            const wrapper = await editor(seeded(), { navigatorStorage: null });
            const toggle = wrapper.find(".mb-project-editor__navigator-toggle");
            await toggle.trigger("click");

            expect(toggle.attributes("aria-expanded")).toBe("false");
            expect(wrapper.find(".mb-project-editor__workspace--collapsed").exists()).toBe(true);
            // The control that undoes it is the one thing that must not disappear with the
            // column, or an accidental collapse has no visible way back.
            expect(wrapper.find(".mb-project-editor__navigator-toggle").isVisible()).toBe(true);

            await toggle.trigger("click");
            expect(toggle.attributes("aria-expanded")).toBe("true");
            expect(wrapper.find(".mb-project-editor__workspace--collapsed").exists()).toBe(false);
            wrapper.unmount();
        });

        it("names the list it controls, and keeps that element in the document while collapsed", async () => {
            const wrapper = await editor(seeded(), { navigatorStorage: null });
            const toggle = wrapper.find(".mb-project-editor__navigator-toggle");
            const controls = toggle.attributes("aria-controls");
            expect(controls).toBeTruthy();
            expect(document.getElementById(controls ?? "")).not.toBeNull();

            await toggle.trigger("click");
            // `v-show`, not `v-if`: a control naming an element the document no longer holds
            // is a broken relationship rather than a collapsed one.
            expect(document.getElementById(controls ?? "")).not.toBeNull();
            wrapper.unmount();
        });

        it("remembers the collapse for the next time the editor opens", async () => {
            const store = new Map<string, string>();
            const storage = {
                getItem: (key: string) => store.get(key) ?? null,
                setItem: (key: string, value: string) => void store.set(key, value),
                removeItem: (key: string) => void store.delete(key),
                clear: () => store.clear(),
                key: () => null,
                get length() {
                    return store.size;
                },
            } as unknown as Storage;

            const first = await editor(seeded(), { navigatorStorage: storage });
            await first.find(".mb-project-editor__navigator-toggle").trigger("click");
            expect(first.find(".mb-project-editor__workspace--collapsed").exists()).toBe(true);
            first.unmount();

            const second = await editor(seeded(), { navigatorStorage: storage });
            expect(second.find(".mb-project-editor__workspace--collapsed").exists()).toBe(true);
            expect(
                second.find(".mb-project-editor__navigator-toggle").attributes("aria-expanded"),
            ).toBe("false");
            second.unmount();
        });
    });
});
