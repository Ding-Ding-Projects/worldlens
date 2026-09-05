/**
 * `collectRenderedMap` against a fake transport, with no network and no real GitHub run.
 *
 * This is the file the defect it fixes never had: the app could finish a large render on
 * GitHub - every job green, `map-lowres` and every `partial-hires-N` sitting on the run -
 * and then report `no rendered-map artifact` because the collector only ever knew the
 * single-artifact shape. These tests build both shapes for real (real zips, unpacked by
 * the real `extractZip`) and prove the assembled result opens exactly like a single
 * `rendered-map` artifact would, and that a genuinely incomplete part set is still
 * refused by name rather than assembled around.
 */

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { packFolder } from "../backup/archive.js";
import { LocalMapHandler } from "../render/LocalMapHandler.js";
import { renderWorkspace } from "../render/workspace.js";
import type { WorkflowArtifact } from "./actions.js";
import { collectRenderedMap } from "./collect.js";
import type { CollectOptions } from "./collect.js";
import type { CiTransport } from "./transport.js";

const OWNER = "o";
const REPO = "r";
const RUN_ID = 7;
const MAP_ID = "world";

let workDir: string;

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "cirender-collect-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function artifact(overrides: Partial<WorkflowArtifact> & { readonly name: string }): WorkflowArtifact {
    return {
        id: overrides.id ?? 0,
        name: overrides.name,
        sizeInBytes: overrides.sizeInBytes ?? 10,
        expired: overrides.expired ?? false,
        digest: overrides.digest ?? null,
        archiveDownloadUrl: `https://api.test/artifacts/${overrides.name}/zip`,
    };
}

/**
 * A transport whose `listRunArtifacts` returns whatever the test wired up, and whose
 * `downloadArtifact` copies a matching pre-built zip onto the requested destination - the
 * same shape `schedule.test.ts`'s `fakeTransport` uses, restricted to the two calls
 * `collect.ts` actually makes.
 */
function fakeTransport(
    artifacts: readonly WorkflowArtifact[],
    zipByName: ReadonlyMap<string, string>,
): CiTransport & { readonly downloads: { readonly name: string; readonly destination: string }[] } {
    const downloads: { readonly name: string; readonly destination: string }[] = [];
    const unused = (): never => {
        throw new Error("collect.ts asked the transport for something outside artifact fetch");
    };
    return {
        route: "gh",
        describe: "a fake",
        canUpload: true,
        downloads,
        readWorkflow: unused,
        readDefaultBranch: unused,
        dispatchWorkflow: unused,
        findDispatchedRun: unused,
        readRun: unused,
        readRunJobs: unused,
        readJobLogTail: unused,
        listRunArtifacts: () => Promise.resolve(artifacts),
        downloadArtifact: async (_owner, _repo, target, destination) => {
            downloads.push({ name: target.name, destination });
            const source = zipByName.get(target.name);
            if (source === undefined) {
                throw new Error(`no zip staged in this test for artifact "${target.name}"`);
            }
            await mkdir(join(destination, ".."), { recursive: true });
            await writeFile(destination, await readFile(source));
        },
        releaseHasAsset: unused,
        readRepository: unused,
        findRelease: unused,
        createRelease: unused,
        listReleaseAssets: unused,
        uploadReleaseAsset: unused,
        isRepositoryEmpty: unused,
        readActionsPolicy: unused,
        readTokenScopes: unused,
        readFile: unused,
        writeFile: unused,
        readVariable: unused,
        writeVariable: unused,
    };
}

/** Builds one folder-turned-zip under `workDir`, returning its path and its real SHA-256. */
async function zipFolder(
    label: string,
    files: ReadonlyMap<string, string>,
): Promise<{ readonly path: string; readonly sha256: string }> {
    const folder = join(workDir, `src-${label}-${randomUUID()}`);
    for (const [relative, content] of files) {
        const full = join(folder, relative);
        await mkdir(join(full, ".."), { recursive: true });
        await writeFile(full, content, "utf8");
    }
    const target = join(workDir, `${label}.zip`);
    const packed = await packFolder(folder, target);
    return { path: target, sha256: packed.sha256 };
}

function collectOptions(overrides: Partial<CollectOptions> & { transport: CiTransport }): CollectOptions {
    return {
        storageDir: join(workDir, "maps"),
        artifactFile: join(workDir, "sync", "rendered-map.zip"),
        renderId: "ci-test",
        mapId: MAP_ID,
        mapName: "World",
        dimension: "minecraft:overworld",
        worldFolder: join(workDir, "world"),
        headSha: "abc123",
        repository: `${OWNER}/${REPO}`,
        ...overrides,
    };
}

describe("a map that shipped in parts", () => {
    it("assembles map-lowres and every partial-hires-N into one openable map", async () => {
        const lowres = await zipFolder("map-lowres", new Map([
            ["settings.json", '{"maps":["world"]}'],
            [`maps/${MAP_ID}/settings.json`, "{}"],
            [`maps/${MAP_ID}/textures.json.gz`, "lowres-textures"],
            [`maps/${MAP_ID}/tiles/1/0.json`, "lowres-tile"],
        ]));
        const part0 = await zipFolder("partial-hires-0", new Map([["0.prbm", "hires-shard-0"]]));
        const part1 = await zipFolder("partial-hires-1", new Map([["1.prbm", "hires-shard-1"]]));

        const artifacts = [
            artifact({ id: 1, name: "map-lowres", sizeInBytes: 100, digest: `sha256:${lowres.sha256}` }),
            artifact({ id: 2, name: "partial-hires-0", sizeInBytes: 40, digest: `sha256:${part0.sha256}` }),
            artifact({ id: 3, name: "partial-hires-1", sizeInBytes: 60, digest: `sha256:${part1.sha256}` }),
        ];
        const transport = fakeTransport(
            artifacts,
            new Map([
                ["map-lowres", lowres.path],
                ["partial-hires-0", part0.path],
                ["partial-hires-1", part1.path],
            ]),
        );
        const mounts = new LocalMapHandler();

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport, mounts }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.verified).toBe(true);
        expect(result.bytes).toBe(200);
        expect(result.mapId).toBe(MAP_ID);
        expect(result.artifact.name).toBe("map-lowres");
        expect(mounts.getMounts()).toHaveLength(1);

        // Downloaded lowres first, then the parts, to the deterministic per-artifact
        // paths a resumed download would find again unchanged.
        expect(transport.downloads.map((d) => d.name)).toEqual([
            "map-lowres",
            "partial-hires-0",
            "partial-hires-1",
        ]);
        expect(transport.downloads[0]?.destination).toBe(
            `${collectOptions({ transport }).artifactFile}.map-lowres.zip`,
        );
        expect(transport.downloads[1]?.destination).toBe(
            `${collectOptions({ transport }).artifactFile}.partial-hires-0.zip`,
        );

        const workspace = renderWorkspace(join(workDir, "maps"), "ci-test");
        const merged = await readFile(join(workspace.webRoot, "settings.json"), "utf8");
        expect(merged).toContain("world");
        const shard0 = await readFile(
            join(workspace.webRoot, "maps", MAP_ID, "tiles", "0", "0.prbm"),
            "utf8",
        );
        expect(shard0).toBe("hires-shard-0");
        const shard1 = await readFile(
            join(workspace.webRoot, "maps", MAP_ID, "tiles", "0", "1.prbm"),
            "utf8",
        );
        expect(shard1).toBe("hires-shard-1");
        // Both merge groups' hires tiles landed side by side rather than one overwriting
        // the other - the whole point of unpacking each part into the same directory.
        const lowresTile = await readFile(
            join(workspace.webRoot, "maps", MAP_ID, "tiles", "1", "0.json"),
            "utf8",
        );
        expect(lowresTile).toBe("lowres-tile");
    });

    it("records rather than verifies when GitHub published no digest for a part", async () => {
        const lowres = await zipFolder("map-lowres-nodigest", new Map([
            ["settings.json", '{"maps":["world"]}'],
            [`maps/${MAP_ID}/settings.json`, "{}"],
        ]));
        const part0 = await zipFolder("partial-hires-0-nodigest", new Map([["0.prbm", "shard"]]));
        const artifacts = [
            artifact({ id: 1, name: "map-lowres", digest: `sha256:${lowres.sha256}` }),
            // No digest published for this part - a perfectly ordinary green run on an
            // older GitHub instance, not a failure.
            artifact({ id: 2, name: "partial-hires-0", digest: null }),
        ];
        const transport = fakeTransport(
            artifacts,
            new Map([["map-lowres", lowres.path], ["partial-hires-0", part0.path]]),
        );

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.verified).toBe(false);
    });

    it("refuses rather than assembling around a missing partial-hires index", async () => {
        const artifacts = [
            artifact({ id: 1, name: "map-lowres" }),
            artifact({ id: 2, name: "partial-hires-0" }),
            // partial-hires-1 never published: a real gap, not merely unfetched yet.
            artifact({ id: 3, name: "partial-hires-2" }),
        ];
        const transport = fakeTransport(artifacts, new Map());

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("map-parts-incomplete");
        expect(result.failure.message).toContain("partial-hires-1");
        // No download was ever attempted once the set was known to be incomplete - not
        // even of map-lowres, which would otherwise sit on disk unpacked into nothing.
        expect(transport.downloads).toHaveLength(0);
    });

    it("refuses when a hires part fails its published digest, and cleans up the stage", async () => {
        const lowres = await zipFolder("map-lowres-mismatch", new Map([
            ["settings.json", '{"maps":["world"]}'],
            [`maps/${MAP_ID}/settings.json`, "{}"],
        ]));
        const part0 = await zipFolder("partial-hires-0-mismatch", new Map([["0.prbm", "shard"]]));
        const artifacts = [
            artifact({ id: 1, name: "map-lowres", digest: `sha256:${lowres.sha256}` }),
            // Published digest deliberately wrong.
            artifact({ id: 2, name: "partial-hires-0", digest: `sha256:${"0".repeat(64)}` }),
        ];
        const transport = fakeTransport(
            artifacts,
            new Map([["map-lowres", lowres.path], ["partial-hires-0", part0.path]]),
        );
        const mounts = new LocalMapHandler();

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport, mounts }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("digest-mismatch");
        expect(result.failure.message).toContain("partial-hires-0");
        expect(mounts.getMounts()).toHaveLength(0);

        const workspace = renderWorkspace(join(workDir, "maps"), "ci-test");
        const staged = await stat(`${workspace.webRoot}.collecting-${String(RUN_ID)}`).catch(
            () => null,
        );
        expect(staged).toBeNull();
    });

    it("refuses when no partial-hires artifacts were published at all", async () => {
        const artifacts = [artifact({ id: 1, name: "map-lowres" })];
        const transport = fakeTransport(artifacts, new Map());

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("map-parts-incomplete");
        expect(transport.downloads).toHaveLength(0);
    });
});

describe("the single rendered-map path is unchanged", () => {
    it("still collects a whole map from one artifact", async () => {
        const whole = await zipFolder("rendered-map", new Map([
            ["settings.json", '{"maps":["world"]}'],
            [`maps/${MAP_ID}/settings.json`, "{}"],
            [`maps/${MAP_ID}/tiles/0/0.prbm`, "tile"],
        ]));
        const artifacts = [
            artifact({ id: 1, name: "rendered-map", sizeInBytes: 55, digest: `sha256:${whole.sha256}` }),
        ];
        const transport = fakeTransport(artifacts, new Map([["rendered-map", whole.path]]));
        const mounts = new LocalMapHandler();

        const result = await collectRenderedMap(
            OWNER,
            REPO,
            RUN_ID,
            collectOptions({ transport, mounts }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes).toBe(55);
        expect(result.sha256).toBe(whole.sha256);
        expect(result.verified).toBe(true);
        expect(result.artifact.name).toBe("rendered-map");
        expect(mounts.getMounts()).toHaveLength(1);
        expect(transport.downloads).toEqual([
            { name: "rendered-map", destination: collectOptions({ transport }).artifactFile },
        ]);
    });
});
