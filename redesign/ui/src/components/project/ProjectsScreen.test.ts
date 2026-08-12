/**
 * @vitest-environment jsdom
 *
 * The Projects tab wired to real discovery, mounted for real.
 *
 * The pieces are each tested on their own: `discoveredWorlds.test.ts` proves which worlds
 * count as available, `DiscoveredWorldsPanel.test.ts` proves the panel renders them. What
 * neither can see is the wiring - that the screen actually threads its own projects into
 * the panel's `projectWorlds` prop, that clicking a discovered world really opens the
 * editor pre-filled rather than only emitting an event nobody answers, and that the bulk
 * action really writes through the host and the new projects really disappear from the
 * discovered list afterwards.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import type { ProjectFile } from "@worldlens/config";
import ProjectsScreen from "./ProjectsScreen.vue";
import ProjectEditor from "./ProjectEditor.vue";
import type { ProjectHost, ProjectListing, ProjectWriteAnswer } from "./projectHost.js";
import { createProject, withMapAdded, withRender } from "./projectModel.js";
import type {
    FolderScanResult,
    MinecraftFolder,
    MinecraftWorldSummary,
    WorldCatalogBridge,
} from "../world/worldCatalog.js";

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

function emptyListing(): ProjectListing {
    return { projects: [], scanned: 0, problems: [] };
}

function fakeHost(
    listing: ProjectListing = emptyListing(),
): ProjectHost & { written: [string, unknown][] } {
    const written: [string, unknown][] = [];
    return {
        name: "test host",
        canDelete: true,
        listProjects: async () => listing,
        readProject: async () => ({ ok: false, failure: { kind: "absent" } }),
        writeProject: async (world, project): Promise<ProjectWriteAnswer> => {
            written.push([world, project]);
            return { ok: true, file: `${world}/worldlens.project.json` };
        },
        written,
    };
}

function folder(overrides: Partial<MinecraftFolder> = {}): MinecraftFolder {
    return {
        id: "default:home",
        label: ".minecraft",
        labelled: false,
        chosenPath: "/home/ada/.minecraft",
        savesPath: "/home/ada/.minecraft/saves",
        resolution: "installation",
        builtIn: true,
        origin: "home",
        state: "ok",
        stateDetail: null,
        mountedAt: null,
        ...overrides,
    };
}

function world(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "default:home",
        path: "/home/ada/.minecraft/saves/Bastion",
        directoryName: "Bastion",
        name: "Bastion",
        lastPlayed: null,
        versionName: "1.21.4",
        snapshot: false,
        gameMode: "survival",
        hardcore: false,
        cheats: false,
        seed: null,
        regionFiles: {},
        sizeBytes: null,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

function fakeCatalog(worlds: readonly MinecraftWorldSummary[]): WorldCatalogBridge {
    return {
        listMinecraftFolders: async () => [folder()],
        mountMinecraftFolder: async () => ({ ok: false, message: "not used in this test" }),
        unmountMinecraftFolder: async () => true,
        labelMinecraftFolder: async () => true,
        scanMinecraftFolder: async (id): Promise<FolderScanResult> => ({
            ok: true,
            scan: { folderId: id, savesPath: `/saves/${id}`, worlds, truncated: false },
        }),
    };
}

function screen(
    host: ProjectHost,
    catalog: WorldCatalogBridge | null,
    props: { openWorld?: string | null } = {},
) {
    return mount(ProjectsScreen, {
        props: {
            host,
            bridge: null,
            optionalBridge: null,
            worldCatalogBridge: catalog,
            configHost: null,
            ...props,
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

/* -------------------------------------------------------------------------- */

describe("the discovered-worlds panel, wired into the tab", () => {
    it("shows a world nobody has a project for yet, above the projects list", async () => {
        const view = screen(fakeHost(), fakeCatalog([world()]));
        await flushPromises();

        expect(view.text()).toContain("Worlds ready to use");
        expect(view.text()).toContain("Bastion");
        view.unmount();
    });

    it("leaves out a world that already has a project", async () => {
        const listing: ProjectListing = {
            projects: [
                {
                    world: "/home/ada/.minecraft/saves/Bastion",
                    file: "/home/ada/.minecraft/saves/Bastion/worldlens.project.json",
                    id: "p1",
                    name: "Bastion",
                    maps: 1,
                    createdAt: "2026-01-01T00:00:00Z",
                    updatedAt: "2026-01-01T00:00:00Z",
                    fromWizard: false,
                    worldName: "Bastion",
                    problem: null,
                },
            ],
            scanned: 1,
            problems: [],
        };
        const view = screen(fakeHost(listing), fakeCatalog([world()]));
        await flushPromises();

        // The discovered panel's own "not yet a project" chip must not appear for Bastion,
        // because ProjectList still legitimately shows the word "Bastion" for its own row.
        expect(view.text()).not.toContain("not yet a project");
        view.unmount();
    });

    it("one click on a discovered world opens the editor, pre-filled and unsaved", async () => {
        const host = fakeHost();
        const view = screen(host, fakeCatalog([world()]));
        await flushPromises();

        const option = document.querySelector('[role="option"]');
        expect(option).not.toBeNull();
        option?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await flushPromises();

        // The editor is open (its own Save control exists) rather than the project having
        // been written already - nothing was asked of the host's writeProject yet.
        expect(view.text()).toContain("Save");
        expect(host.written).toHaveLength(0);

        // Fresh means BlueMap's generated proposal, not a sparse record that *claims* its
        // null singletons will somehow be visible or editable. This is the exact project the
        // editor receives before a person has chosen Save.
        const project = view.findComponent(ProjectEditor).props("project") as ProjectFile;
        expect(project.maps.map((map) => map.id)).toEqual(["overworld", "nether", "end"]);
        expect(project.storages.map((storage) => storage.id)).toEqual(["file"]);
        expect(project.core).toContain("accept-download:");
        expect(project.webapp).toContain("webroot:");
        expect(project.webserver).toContain("port:");
        expect(project.plugin).not.toBeNull();
        view.unmount();
    });

    it("opens a selected world through the editor without writing a default project", async () => {
        const host = fakeHost();
        const worlds = [
            world({ path: "/a/Bastion", directoryName: "Bastion", name: "Bastion" }),
            world({ path: "/a/Creative", directoryName: "Creative", name: "Creative" }),
        ];
        const view = screen(host, fakeCatalog(worlds));
        await flushPromises();

        const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
        checkbox.click();
        await flushPromises();

        const bulkButton = [...document.querySelectorAll("button")].find((button) =>
            button.textContent?.includes("Start projects for"),
        );
        bulkButton?.click();
        await flushPromises();

        expect(host.written).toHaveLength(0);
        expect(view.findComponent(ProjectEditor).exists()).toBe(true);
        view.unmount();
    });

    it("queues every edit for autosave and flushes it at close, switch, and render boundaries", async () => {
        const folder = "/home/ada/.minecraft/saves/Bastion";
        const initial = withRender(createProject("Bastion"), { route: "github-actions" });
        const notifyAutosaveChange = vi.fn(
            async (_worldFolder: string, _project: ProjectFile) => undefined,
        );
        const flushAutosave = vi.fn(async () => ({
            ok: true as const,
            file: `${folder}/worldlens.project.json`,
        }));
        const readProject = vi.fn(async () => ({
            ok: true as const,
            file: `${folder}/worldlens.project.json`,
            project: initial,
        }));
        const host = {
            ...fakeHost(),
            readProject,
            notifyAutosaveChange,
            flushAutosave,
        };
        const view = screen(host, null, { openWorld: folder });
        await flushPromises();

        const editor = view.findComponent(ProjectEditor);
        expect(editor.exists()).toBe(true);
        editor.vm.$emit("update:project", withRender(initial, { force: true }));
        await flushPromises();

        // The edit is queued for the main process's quiet scheduler the moment it exists,
        // and nothing is written from the renderer's side of the bridge.
        expect(notifyAutosaveChange).toHaveBeenCalledWith(folder, withRender(initial, { force: true }));
        expect(host.written).toHaveLength(0);
        expect(view.emitted("dirty-change")?.at(-1)).toEqual([true]);

        // A boundary flushes the pending autosave through the same path Save uses, and the
        // transition proceeds - an autosaving editor has no unsaved work to defend with a wall.
        editor.vm.$emit("close");
        await flushPromises();
        expect(flushAutosave).toHaveBeenCalledWith(folder, "boundary");
        expect(host.written).toHaveLength(0);
        view.unmount();
    });

    it("still writes through the explicit Save event, beside the autosave queue", async () => {
        const folder = "/home/ada/.minecraft/saves/Bastion";
        const initial = withRender(createProject("Bastion"), { route: "github-actions" });
        const notifyAutosaveChange = vi.fn(
            async (_worldFolder: string, _project: ProjectFile) => undefined,
        );
        const flushAutosave = vi.fn(async () => ({
            ok: true as const,
            file: `${folder}/worldlens.project.json`,
        }));
        const host = {
            ...fakeHost(),
            readProject: async () => ({
                ok: true as const,
                file: `${folder}/worldlens.project.json`,
                project: initial,
            }),
            notifyAutosaveChange,
            flushAutosave,
        };
        const view = screen(host, null, { openWorld: folder });
        await flushPromises();

        const editor = view.findComponent(ProjectEditor);
        editor.vm.$emit("update:project", withRender(initial, { force: true }));
        await flushPromises();

        expect(host.written).toHaveLength(0);
        expect(notifyAutosaveChange).toHaveBeenCalledTimes(1);

        editor.vm.$emit("save");
        await flushPromises();
        await flushPromises();

        expect(host.written).toHaveLength(1);
        expect(host.written[0]?.[0]).toBe(folder);
        expect(view.emitted("dirty-change")?.at(-1)).toEqual([false]);
        view.unmount();
    });

    it("renders the tab normally when this build has no world catalogue at all", async () => {
        const view = screen(fakeHost(), null);
        await flushPromises();

        expect(view.find(".mb-discovered").exists()).toBe(false);
        // The rest of the tab - the projects list itself - still renders.
        expect(view.text()).toContain("Projects");
        view.unmount();
    });
});

describe("the saved render route", () => {
    it("opens the GitHub Actions renderer instead of starting a local engine", async () => {
        const folder = "/home/ada/.minecraft/saves/Bastion";
        const project = withRender(
            withMapAdded(createProject("Bastion"), {
                id: "overworld",
                name: "Overworld",
                dimension: "minecraft:overworld",
                world: folder,
            }),
            { route: "github-actions" },
        );
        const listing: ProjectListing = {
            projects: [
                {
                    world: folder,
                    file: `${folder}/worldlens.project.json`,
                    id: project.id,
                    name: project.name,
                    maps: 1,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                    fromWizard: false,
                    worldName: "Bastion",
                    problem: null,
                },
            ],
            scanned: 1,
            problems: [],
        };
        const host: ProjectHost = {
            ...fakeHost(listing),
            readProject: async () => ({
                ok: true,
                file: `${folder}/worldlens.project.json`,
                project,
            }),
        };
        const view = screen(host, null);
        await flushPromises();

        const render = view.find(`button[aria-label="Render Bastion with its own settings"]`);
        expect(render.exists()).toBe(true);
        await render.trigger("click");
        await flushPromises();

        expect(view.emitted("cloudRender")).toEqual([[folder]]);
        view.unmount();
    });
});
