import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { buildWorldGenerationConfig } from "@worldlens/shared";
import { buildZip } from "../download/zipTestUtil.js";
import type { CiTransport } from "../cirender/transport.js";
import type { WorkflowRun } from "../cirender/actions.js";
import {
    validateGenerationReceipt,
    worldgenCollection,
    type WorldgenOperation,
} from "./collection.js";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const config = buildWorldGenerationConfig({
    engine: "synthetic",
    seed: 42,
    worldName: "generated-world",
    pregenerationRadius: 16,
    version: "1.21.4",
    outputMode: "folder",
    flavour: "vanilla",
    worldType: "default",
    generateStructures: false,
    dimensions: { overworld: true, nether: false, end: false },
});
const run = {
    id: 23,
    runNumber: 1,
    htmlUrl: "https://github.com/owner/repo/actions/runs/23",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-10-23T10:00:01Z",
    updatedAt: "2026-10-23T10:01:00Z",
    headSha: "a".repeat(40),
    event: "workflow_dispatch",
    displayTitle: "Generate generated-world",
} satisfies WorkflowRun;
function operation(): WorldgenOperation {
    return {
        receipt: {
            operationId: randomUUID(),
            repository: "owner/repo",
            workflowFile: "worldgen.yml",
            ref: "main",
            dispatchedAt: "2026-10-23T10:00:00Z",
            inputs: {},
            runsUrl: "https://github.com/owner/repo/actions/workflows/worldgen.yml",
        },
        request: {
            owner: "owner",
            repo: "repo",
            config,
            options: { render: true, publish: "artifact", dispatchRender: false },
        },
        run: null,
        jobs: [],
        worldFolder: null,
    };
}
function payload(
    record: WorldgenOperation,
    mutate: (value: Record<string, unknown>) => void = () => {},
) {
    const seed = Buffer.alloc(8);
    seed.writeBigInt64BE(42n);
    const level = gzipSync(
        Buffer.concat([
            Buffer.from([10, 0, 0, 10, 0, 4]),
            Buffer.from("Data"),
            Buffer.from([4, 0, 10]),
            Buffer.from("RandomSeed"),
            seed,
            Buffer.from([0, 0]),
        ]),
    );
    const region = Buffer.alloc(8192);
    region.writeUInt32BE(513, 0);
    const inner = buildZip([
        { name: "generated-world/level.dat", content: level },
        { name: "generated-world/region/r.0.0.mca", content: region },
    ]);
    const receipt: Record<string, unknown> = {
        version: 1,
        engine: "synthetic",
        config,
        repository: record.receipt.repository,
        commit: run.headSha,
        run: { id: 23, attempt: 1 },
        archive: { name: "generated-world.zip", sha256: hash(inner) },
    };
    mutate(receipt);
    return buildZip([
        { name: "generation-receipt.json", content: Buffer.from(JSON.stringify(receipt)) },
        { name: "generated-world.zip", content: inner },
    ]);
}
async function fixture(
    test: (value: {
        service: ReturnType<typeof worldgenCollection>;
        record: WorldgenOperation;
        api: CiTransport;
        download: ReturnType<typeof vi.fn>;
        root: string;
    }) => Promise<void>,
    mutate?: (value: Record<string, unknown>) => void,
) {
    const root = await mkdtemp(join(tmpdir(), "worldlens-collection-"));
    try {
        const record = operation();
        const bytes = payload(record, mutate);
        const download = vi.fn(
            async (_owner: string, _repo: string, _artifact: unknown, destination: string) => {
                await writeFile(destination, bytes);
            },
        );
        const api = {
            listWorkflowRuns: vi.fn(async () => [run]),
            readRun: vi.fn(async () => run),
            readRunJobs: vi.fn(async () => []),
            listRunArtifacts: vi.fn(async () => [
                { id: 9, name: "generated-world", expired: false, digest: `sha256:${hash(bytes)}` },
            ]),
            downloadArtifact: download,
        } as unknown as CiTransport;
        const service = worldgenCollection({
            root: () => root,
            transport: async () => api,
            parseRequest: (value) => value as WorldgenOperation["request"],
        });
        await service.save(record);
        await test({ service, record, api, download, root });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
describe("generated workflow result collection", () => {
    it("observes and imports a digest-bound real ZIP with a readable exact seed", async () =>
        fixture(async ({ service, record, download }) => {
            expect((await service.check(record.receipt.operationId)).run?.id).toBe(23);
            const result = await service.collect(record.receipt.operationId);
            expect(result.worldFolder).toBeTruthy();
            expect((await readFile(join(result.worldFolder!, "level.dat"))).length).toBeGreaterThan(
                0,
            );
            expect((await service.collect(record.receipt.operationId)).worldFolder).toBe(
                result.worldFolder,
            );
            expect(download).toHaveBeenCalledTimes(1);
        }));
    it("refuses ambiguous workflow matches before downloading", async () =>
        fixture(async ({ service, record, api, download }) => {
            vi.mocked(api.listWorkflowRuns).mockResolvedValue([run, { ...run, id: 24 }]);
            await expect(service.collect(record.receipt.operationId)).rejects.toThrow(
                /Multiple matching/,
            );
            expect(download).not.toHaveBeenCalled();
        }));
    it("refuses failed runs and absent digests without downloading", async () =>
        fixture(async ({ service, record, api, download }) => {
            vi.mocked(api.readRun).mockResolvedValueOnce({ ...run, conclusion: "failure" });
            await expect(service.collect(record.receipt.operationId)).rejects.toThrow(/successful/);
            vi.mocked(api.listRunArtifacts).mockResolvedValue([
                { id: 9, name: "generated-world", expired: false, digest: null },
            ] as never);
            await expect(service.collect(record.receipt.operationId)).rejects.toThrow(
                /published SHA-256/,
            );
            expect(download).not.toHaveBeenCalled();
        }));
    it("refuses a receipt for a different seed even when both archives are intact", async () =>
        fixture(
            async ({ service, record }) => {
                await expect(service.collect(record.receipt.operationId)).rejects.toThrow(
                    /does not match/,
                );
                expect((await service.check(record.receipt.operationId)).worldFolder).toBeNull();
            },
            (receipt) => {
                receipt.config = { ...config, seed: 99 };
            },
        ));
    it("refuses tampered downloaded bytes before extraction", async () =>
        fixture(async ({ service, record, download }) => {
            download.mockImplementation(
                async (_o: string, _r: string, _a: unknown, destination: string) => {
                    await writeFile(destination, "tampered");
                },
            );
            await expect(service.collect(record.receipt.operationId)).rejects.toThrow(
                /artifact digest/,
            );
        }));
    it.each(["repository", "commit", "run", "archive"])(
        "binds the %s field to the recorded run",
        (key) => {
            const record = { ...operation(), run };
            const receipt = {
                version: 1,
                engine: "synthetic",
                config,
                repository: "owner/repo",
                commit: run.headSha,
                run: { id: 23, attempt: 1 },
                archive: { name: "generated-world.zip", sha256: "a".repeat(64) },
                [key]: "wrong",
            };
            expect(() => validateGenerationReceipt(receipt, record)).toThrow();
        },
    );
});
