import { describe, expect, it } from "vitest";
import { isProxy, reactive, toRaw } from "vue";
import {
    PROJECT_FORMAT_VERSION,
    PROJECT_SCHEMA_ID,
    serializeProjectFile,
    type ProjectFile,
} from "@worldlens/config";
import { projectHostFromBridge } from "./projectHost.js";

type ProjectWithPassthrough = ProjectFile & {
    futureTopLevel: {
        label: string;
        nested: { enabled: boolean };
    };
};

function reactiveProject(): ProjectWithPassthrough {
    const maps = reactive([
        {
            id: "bayville-world-v10-1",
            name: "Bayville World v10.1",
            dimension: "minecraft:overworld",
            world: null,
            config: "world: world\n",
            storage: "file",
            sorting: 0,
            enabled: true,
            futureMapField: { palette: ["stone", "grass"] },
        },
    ]);

    return reactive({
        schema: PROJECT_SCHEMA_ID,
        version: PROJECT_FORMAT_VERSION,
        id: "project-1",
        name: "Bayville World v10.1",
        createdAt: "2026-08-18T12:00:00-04:00",
        updatedAt: "2026-08-18T12:05:00-04:00",
        appVersion: "1.0.0",
        maps,
        storages: [
            {
                id: "file",
                config: "storage-type: FILE\n",
                futureStorageField: { compression: "balanced" },
            },
        ],
        render: {
            route: "github-actions",
            threads: 4,
            force: false,
            fixEdges: true,
            metrics: false,
            outputFolder: null,
            futureRenderField: { shardSize: 3 },
        },
        core: null,
        webapp: null,
        webserver: null,
        plugin: null,
        fromWizard: false,
        futureTopLevel: {
            label: "keep me",
            nested: { enabled: true },
        },
    }) as unknown as ProjectWithPassthrough;
}

describe("projectHostFromBridge", () => {
    it("canonicalizes deep reactive projects before manual and autosave bridge calls", async () => {
        const project = reactiveProject();
        const sourceBefore = serializeProjectFile(project);
        const canonical = JSON.parse(sourceBefore) as ProjectWithPassthrough;

        expect(isProxy(project)).toBe(true);
        expect(isProxy(project.maps)).toBe(true);
        expect(isProxy(project.maps[0])).toBe(true);
        expect(() => structuredClone(project)).toThrow();
        expect(() => structuredClone({ ...project })).toThrow();
        expect(() => structuredClone(toRaw(project))).toThrow();

        const writes: ProjectFile[] = [];
        const autosaves: ProjectFile[] = [];
        const host = projectHostFromBridge({
            project: {
                listProjects: async () => ({ projects: [], scanned: 0, problems: [] }),
                readProject: async () => ({ ok: false, failure: { kind: "absent" } }),
                writeProject: async (_world: string, payload: ProjectFile) => {
                    writes.push(payload);
                    return { ok: true, file: "C:/saves/Bayville/worldlens.project.json" };
                },
                notifyAutosaveChange: async (_world: string, payload: ProjectFile) => {
                    autosaves.push(payload);
                },
            },
        });

        expect(host).not.toBeNull();
        await host?.writeProject("C:/saves/Bayville", project);
        await host?.notifyAutosaveChange?.("C:/saves/Bayville", project);

        const written = writes[0] as ProjectWithPassthrough;
        const autosaved = autosaves[0] as ProjectWithPassthrough;
        expect(written).toEqual(canonical);
        expect(autosaved).toEqual(canonical);
        expect(written).not.toBe(project);
        expect(autosaved).not.toBe(project);
        expect(written).not.toBe(autosaved);
        expect(written.maps).not.toBe(project.maps);
        expect(written.maps[0]).not.toBe(project.maps[0]);
        expect(autosaved.maps).not.toBe(project.maps);
        expect(isProxy(written)).toBe(false);
        expect(isProxy(written.maps)).toBe(false);
        expect(isProxy(written.maps[0])).toBe(false);
        expect(() => structuredClone(written)).not.toThrow();
        expect(() => structuredClone(autosaved)).not.toThrow();

        expect(written.futureTopLevel).toEqual({
            label: "keep me",
            nested: { enabled: true },
        });
        expect(written.maps[0]).toMatchObject({
            futureMapField: { palette: ["stone", "grass"] },
        });
        expect(written.storages[0]).toMatchObject({
            futureStorageField: { compression: "balanced" },
        });
        expect(written.render).toMatchObject({
            futureRenderField: { shardSize: 3 },
        });

        written.name = "Changed after the bridge call";
        written.maps[0]!.name = "Changed map";
        written.futureTopLevel.nested.enabled = false;

        expect(autosaved).toEqual(canonical);
        expect(serializeProjectFile(project)).toBe(sourceBefore);
        expect(project.name).toBe("Bayville World v10.1");
        expect(project.maps[0]?.name).toBe("Bayville World v10.1");
        expect(project.futureTopLevel.nested.enabled).toBe(true);
    });
});
