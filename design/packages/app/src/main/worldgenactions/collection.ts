import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256File } from "@worldlens/parts";
import { parseWorldGenerationConfig } from "@worldlens/shared";
import { atomicWriteTextFile } from "../storage/atomicReplace.js";
import { extractZip } from "../download/extract.js";
import { measureGeneratedWorld } from "../mcserver/worldgen/measure.js";
import { readLevelDat } from "../world/levelDat.js";
import type { CiTransport } from "../cirender/transport.js";
import type { WorkflowRun, WorkflowJob } from "../cirender/actions.js";
import type { WorldgenDispatchReceipt, WorldgenDispatchRequest } from "./ipc.js";

export interface WorldgenOperation {
    readonly receipt: WorldgenDispatchReceipt;
    readonly request: WorldgenDispatchRequest;
    run: WorkflowRun | null;
    jobs: readonly WorkflowJob[];
    worldFolder: string | null;
}
const ID = /^[a-f0-9]{8}-[a-f0-9-]{27}$/;
const digest = /^sha256:([a-f0-9]{64})$/;
async function boundedJson(path: string): Promise<unknown> {
    if ((await stat(path)).size > 128 * 1024)
        throw new Error("Generation receipt exceeds its size limit.");
    return JSON.parse(await readFile(path, "utf8")) as unknown;
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid generation receipt.");
    return value as Record<string, unknown>;
}

/** Proves the archive belongs to the selected run and the exact dispatched configuration. */
export function validateGenerationReceipt(
    value: unknown,
    operation: WorldgenOperation,
): { name: string; sha256: string } {
    const receipt = object(value);
    const archive = object(receipt.archive);
    const run = object(receipt.run);
    const parsed = parseWorldGenerationConfig(receipt.config);
    if (
        receipt.version !== 1 ||
        receipt.engine !== "synthetic" ||
        !parsed.ok ||
        JSON.stringify(parsed.config) !== JSON.stringify(operation.request.config) ||
        receipt.repository !== operation.receipt.repository ||
        run.id !== operation.run?.id ||
        receipt.commit !== operation.run?.headSha ||
        !Number.isSafeInteger(run.attempt) ||
        Number(run.attempt) < 1 ||
        archive.name !== `${operation.request.config.worldName}.zip` ||
        typeof archive.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(archive.sha256)
    ) {
        throw new Error(
            "The generated result does not match the dispatched configuration, repository and run.",
        );
    }
    return { name: archive.name as string, sha256: archive.sha256 };
}

/** Durable collection reuses the account transport, digest reader and safe ZIP extractor. */
export function worldgenCollection(options: {
    root: () => string;
    transport: (request: WorldgenDispatchRequest) => Promise<CiTransport>;
    parseRequest: (value: unknown) => WorldgenDispatchRequest;
}) {
    const active = new Set<string>();
    const path = (id: string) => join(options.root(), `${id}.json`);
    const save = async (record: WorldgenOperation) => {
        await mkdir(options.root(), { recursive: true });
        await atomicWriteTextFile(path(record.receipt.operationId), JSON.stringify(record));
    };
    const load = async (id: unknown): Promise<WorldgenOperation> => {
        if (typeof id !== "string" || !ID.test(id))
            throw new Error("Choose a recorded generation operation.");
        const record = object(await boundedJson(path(id))) as unknown as WorldgenOperation;
        const request = options.parseRequest(record.request);
        if (
            record.receipt?.operationId !== id ||
            record.receipt.repository !== `${request.owner}/${request.repo}` ||
            !Number.isFinite(Date.parse(record.receipt.dispatchedAt))
        )
            throw new Error("Saved generation identity is invalid.");
        return { ...record, request };
    };
    const check = async (id: unknown): Promise<WorldgenOperation> => {
        const record = await load(id);
        const api = await options.transport(record.request);
        const { owner, repo } = record.request;
        if (!record.run) {
            const since = Math.floor(Date.parse(record.receipt.dispatchedAt) / 1000) * 1000;
            const candidates = (
                await api.listWorkflowRuns(owner, repo, record.receipt.workflowFile)
            ).filter(
                (run) =>
                    run.event === "workflow_dispatch" &&
                    run.displayTitle === `Generate ${record.request.config.worldName}` &&
                    Date.parse(run.createdAt) >= since &&
                    Date.parse(run.createdAt) <= since + 300_000,
            );
            if (candidates.length > 1)
                throw new Error(
                    "Multiple matching runs exist. Automatic collection cannot safely choose one.",
                );
            record.run = candidates[0] ?? null;
        }
        if (record.run) {
            record.run = await api.readRun(owner, repo, record.run.id);
            record.jobs = await api.readRunJobs(owner, repo, record.run.id);
        }
        await save(record);
        return record;
    };
    return {
        save,
        async check(id: unknown) {
            if (typeof id !== "string" || !ID.test(id))
                throw new Error("Choose a recorded generation operation.");
            if (active.has(id))
                throw new Error("This result is currently being observed or collected.");
            active.add(id);
            try {
                return await check(id);
            } finally {
                active.delete(id);
            }
        },
        async collect(id: unknown): Promise<WorldgenOperation> {
            if (typeof id !== "string" || !ID.test(id))
                throw new Error("Choose a recorded generation operation.");
            if (active.has(id)) throw new Error("This result is already being collected.");
            active.add(id);
            try {
                const record = await check(id);
                if (
                    !record.run ||
                    record.run.status !== "completed" ||
                    record.run.conclusion !== "success"
                )
                    throw new Error(
                        "Wait for a successful generation run before collecting its world.",
                    );
                if (record.worldFolder) {
                    await measureGeneratedWorld(record.worldFolder);
                    return record;
                }
                const api = await options.transport(record.request);
                const { owner, repo, config } = record.request;
                const artifacts = (await api.listRunArtifacts(owner, repo, record.run.id)).filter(
                    (item) => item.name === "generated-world" && !item.expired,
                );
                if (artifacts.length !== 1 || !digest.test(artifacts[0]!.digest ?? ""))
                    throw new Error(
                        "The run must provide exactly one unexpired generated-world artifact with a published SHA-256.",
                    );
                // Every attempt gets a new directory. Interrupted and rejected downloads remain recoverable.
                const staging = join(options.root(), id, randomUUID());
                await mkdir(staging, { recursive: true });
                const outer = join(staging, "artifact.zip");
                await api.downloadArtifact(owner, repo, artifacts[0]!, outer);
                if (`sha256:${await sha256File(outer)}` !== artifacts[0]!.digest)
                    throw new Error(
                        "Downloaded artifact digest does not match. Nothing was imported.",
                    );
                const payload = join(staging, "payload");
                await extractZip(outer, payload);
                const archive = validateGenerationReceipt(
                    await boundedJson(join(payload, "generation-receipt.json")),
                    record,
                );
                const inner = join(payload, archive.name);
                if ((await sha256File(inner)) !== archive.sha256)
                    throw new Error(
                        "Generated world archive digest does not match. Nothing was imported.",
                    );
                const extracted = join(staging, "world");
                await extractZip(inner, extracted);
                const folder = join(extracted, config.worldName);
                await measureGeneratedWorld(folder);
                const level = await readLevelDat(join(folder, "level.dat"));
                if (level.seed !== String(config.seed))
                    throw new Error("Imported world seed does not match the dispatched seed.");
                record.worldFolder = folder;
                await save(record);
                return record;
            } finally {
                active.delete(id);
            }
        },
    };
}
