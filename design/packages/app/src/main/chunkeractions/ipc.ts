/** Conversion dispatch and resumable collection through the existing GitHub CLI lease. */
import type { IpcMain } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "@worldlens/parts";
import type { GhCliAccountProvider } from "../ghcli/credentialBroker.js";
import { brokerCliTransport } from "../cirender/transport.js";
import { uploadWorldForRender } from "../cirender/upload.js";
import type { CiUploadResume } from "../cirender/upload.js";
import type { WorkflowRun, WorkflowJob } from "../cirender/actions.js";
import { extractZip } from "../download/extract.js";
import { validateChunkerCliConfig } from "../bedrock/chunkerConfig.js";
import type { ChunkerCliConfig } from "../bedrock/chunkerConfig.js";
import { CHUNK_WORKFLOW_FILE } from "./plan.js";

export const CHUNKER_ACTION_CHANNELS = ["chunkerActions:prepare", "chunkerActions:start", "chunkerActions:list", "chunkerActions:check", "chunkerActions:collect", "chunkerActions:cancel"] as const;
export interface ChunkerActionsRequest {
    accountId?: string;
    owner: string;
    repo: string;
    worldFolder: string;
    outputDirectory: string;
    targetFormat: string;
    config: ChunkerCliConfig;
    acknowledgeUpload: boolean;
    acknowledgePublic: boolean;
}
export interface ChunkerActionsRecord {
    id: string;
    request: ChunkerActionsRequest;
    state: "uploading" | "dispatching" | "waiting" | "completed" | "collected" | "failed" | "cancelled";
    message: string;
    bytesDone: number;
    bytesTotal: number;
    upload: CiUploadResume | null;
    world: string | null;
    dispatchedAt: string | null;
    run: WorkflowRun | null;
    jobs: readonly WorkflowJob[];
    archiveSha256: string | null;
    updatedAt: string;
}
interface Options {
    ipcMain: IpcMain;
    account: GhCliAccountProvider;
    dataDir: () => string;
    packaged: boolean;
    resourcesDir: string;
}
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const ID = /^[a-f0-9-]{36}$/;
function requestOf(value: unknown): ChunkerActionsRequest {
    if (!value || typeof value !== "object") throw new Error("Choose a world, account, repository and destination.");
    const r = value as ChunkerActionsRequest;
    if (!NAME.test(r.owner ?? "") || !NAME.test(r.repo ?? "") ||
        typeof r.worldFolder !== "string" || !isAbsolute(r.worldFolder) ||
        typeof r.outputDirectory !== "string" || !isAbsolute(r.outputDirectory) ||
        !/^[A-Z][A-Z0-9_]{0,79}$/.test(r.targetFormat ?? "")) throw new Error("The conversion has an invalid repository, folder or target format.");
    const config = validateChunkerCliConfig(r.config);
    if (config === null || Buffer.byteLength(JSON.stringify(config)) > 48_000) throw new Error("Conversion configuration is invalid or exceeds 48 KB.");
    return { owner: r.owner, repo: r.repo, worldFolder: r.worldFolder, outputDirectory: r.outputDirectory,
        targetFormat: r.targetFormat, config, ...(typeof r.accountId === "string" ? { accountId: r.accountId } : {}),
        acknowledgeUpload: r.acknowledgeUpload === true, acknowledgePublic: r.acknowledgePublic === true };
}
async function workflowText(options: Options): Promise<string> {
    if (options.packaged) return readFile(join(options.resourcesDir, "workflows", CHUNK_WORKFLOW_FILE), "utf8");
    let directory = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 12; depth++) {
        const candidate = join(directory, ".github", "workflows", CHUNK_WORKFLOW_FILE);
        try { return await readFile(candidate, "utf8"); } catch { /* Search this checkout only. */ }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    throw new Error("The packaged Chunker workflow is missing. Repair this installation before preparing a repository.");
}
export function installChunkerActionsIpc(options: Options): { dispose(): void } {
    const active = new Map<string, AbortController>();
    const records = new Map<string, ChunkerActionsRecord>();
    const root = () => join(options.dataDir(), "chunker-actions");
    const save = async (record: ChunkerActionsRecord) => {
        record.updatedAt = new Date().toISOString();
        records.set(record.id, record);
        await mkdir(root(), { recursive: true });
        const path = join(root(), `${record.id}.json`);
        const temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(record));
        for (let attempt = 0; ; attempt++) {
            try { await rename(temp, path); break; } catch (error) {
                if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
    };
    const load = async (id: unknown) => {
        if (typeof id !== "string" || !ID.test(id)) throw new Error("Choose a recorded conversion.");
        const record = records.get(id) ?? JSON.parse(await readFile(join(root(), `${id}.json`), "utf8")) as ChunkerActionsRecord;
        if (record.id !== id) throw new Error("Conversion record identity does not match.");
        record.request = requestOf(record.request);
        return record;
    };
    const transport = async (r: ChunkerActionsRequest, signal?: AbortSignal) => {
        const lease = await options.account(r.accountId, "write", signal);
        if (!lease) throw new Error("Sign in from GitHub accounts, then select that account here.");
        return brokerCliTransport({ lease, ...(signal ? { signal } : {}) });
    };
    const run = async (record: ChunkerActionsRecord) => {
        if (active.has(record.id)) return;
        const controller = new AbortController();
        active.set(record.id, controller);
        try {
            const r = record.request;
            const outputRelative = relative(r.worldFolder, r.outputDirectory);
            if (outputRelative === '' || (!outputRelative.startsWith('..') && !isAbsolute(outputRelative))) throw new Error("The output must be outside the source world.");
            if (await stat(r.outputDirectory).catch(() => null)) throw new Error("Choose a new output directory before uploading.");
            const api = await transport(r, controller.signal);
            const repository = await api.readRepository(r.owner, r.repo);
            if (!repository.canWrite) throw new Error("The selected account cannot write to this repository.");
            if (!r.acknowledgeUpload || (!repository.private && !r.acknowledgePublic)) throw new Error("Confirm the world upload and public visibility before starting.");
            const recipe = await api.readFile(r.owner, r.repo, `.github/workflows/${CHUNK_WORKFLOW_FILE}`);
            if (!recipe || !Buffer.from(recipe.contentBase64, "base64").toString("utf8").includes("chunker-config:")) throw new Error("Prepare this repository with the complete Chunker workflow before uploading.");
            if (!record.world) {
                record.state = "uploading";
                await save(record);
                let persistence = Promise.resolve();
                const uploaded = await uploadWorldForRender({ transport: api, owner: r.owner, repo: r.repo,
                    worldFolder: r.worldFolder, storageDir: options.dataDir(), partSize: 500 * 1024 * 1024,
                    ...(record.upload ? { resume: record.upload } : {}), signal: controller.signal,
                    onEvent: (event) => {
                        if (event.type === "release") {
                            record.upload = { tag: event.tag, archiveName: event.archiveName };
                            persistence = persistence.then(() => save(record));
                        }
                        if (event.type === "progress") { record.bytesDone = event.bytesDone; record.bytesTotal = event.bytesTotal; }
                        if (event.type === "log") record.message = event.message;
                        // The release event is followed by an awaited save before dispatch. In-memory progress is polled live.
                    },
                });
                await persistence;
                await save(record);
                if (!uploaded.ok) throw new Error(uploaded.failure.message);
                record.world = `${uploaded.summary.tag}/${uploaded.summary.archive}.cheaplfs`;
                await save(record);
            }
            if (!record.dispatchedAt) {
                const branch = await api.readDefaultBranch(r.owner, r.repo);
                record.state = "dispatching";
                record.dispatchedAt = new Date().toISOString();
                await save(record);
                await api.dispatchWorkflow(r.owner, r.repo, CHUNK_WORKFLOW_FILE, branch, {
                    "world-source": "release-asset", world: record.world, "world-repository": `${r.owner}/${r.repo}`,
                    "target-format": r.targetFormat, "output-name": `converted-${record.id}`, output: "artifact",
                    "max-jobs": "64", "regions-per-shard": "64", "prune-bounds": "",
                    "chunker-config": JSON.stringify({ ...r.config, operationId: record.id }),
                });
            }
            record.state = "waiting";
            record.message = "Dispatch accepted. Check progress to find the run and collect its verified result.";
            await save(record);
        } catch (error) {
            record.state = controller.signal.aborted ? "cancelled" : "failed";
            record.message = error instanceof Error ? error.message : String(error);
            await save(record);
        } finally { active.delete(record.id); }
    };
    const handle = (name: typeof CHUNKER_ACTION_CHANNELS[number], operation: (value: unknown) => Promise<unknown>) =>
        options.ipcMain.handle(name, async (_event, value: unknown) => {
            try { return { ok: true, value: await operation(value) }; }
            catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
        });
    handle("chunkerActions:prepare", async (value) => {
        const r = requestOf(value);
        const api = await transport(r);
        const content = await workflowText(options);
        const prior = await api.readFile(r.owner, r.repo, `.github/workflows/${CHUNK_WORKFLOW_FILE}`);
        const encoded = Buffer.from(content).toString("base64");
        if (prior?.contentBase64.replace(/\s/g, "") === encoded) return { changed: false };
        const result = await api.writeFile(r.owner, r.repo, `.github/workflows/${CHUNK_WORKFLOW_FILE}`, encoded,
            "Configure complete Chunker conversion workflow", prior?.sha);
        return { changed: true, commitSha: result.commitSha };
    });
    handle("chunkerActions:start", async (value) => {
        const r = requestOf(value);
        if ([...records.values()].some((entry) => active.has(entry.id) && entry.request.owner === r.owner && entry.request.repo === r.repo)) throw new Error("A conversion for this repository is already active.");
        const record: ChunkerActionsRecord = { id: randomUUID(), request: r, state: "uploading", message: "Checking the repository before upload.", bytesDone: 0, bytesTotal: 0, upload: null, world: null, dispatchedAt: null, run: null, jobs: [], archiveSha256: null, updatedAt: new Date().toISOString() };
        await save(record);
        void run(record);
        return record;
    });
    handle("chunkerActions:list", async () => {
        const names = await readdir(root()).catch(() => []);
        return Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => load(name.slice(0, -5))));
    });
    handle("chunkerActions:check", async (value) => {
        const record = await load(value);
        if (active.has(record.id)) return record;
        const r = record.request;
        const api = await transport(r);
        if (!record.dispatchedAt) { void run(record); return record; }
        if (!record.run) {
            // Correlate by the exact operation id in run-name, never the nearest timestamp.
            const lease = await options.account(r.accountId, "read");
            if (!lease) throw new Error("The selected account is unavailable.");
            const answer = await lease.run(["run", "list", "--repo", `${r.owner}/${r.repo}`, "--workflow", CHUNK_WORKFLOW_FILE, "--limit", "100", "--json", "databaseId,displayTitle"]);
            if (answer.code !== 0) throw new Error("GitHub could not list conversion runs. Retry progress lookup.");
            const matches = (JSON.parse(answer.stdout) as { databaseId: number; displayTitle: string }[]).filter((entry) => entry.displayTitle === `Chunker ${record.id}`);
            if (matches.length > 1) throw new Error("Several runs have this conversion identity; no result was selected.");
            if (matches[0]) record.run = await api.readRun(r.owner, r.repo, matches[0].databaseId);
        } else record.run = await api.readRun(r.owner, r.repo, record.run.id);
        if (record.run) {
            record.jobs = await api.readRunJobs(r.owner, r.repo, record.run.id);
            record.state = record.run.status === "completed" ? (record.run.conclusion === "success" ? "completed" : "failed") : "waiting";
            record.message = `${record.run.status}: ${record.run.conclusion ?? "no conclusion yet"}`;
        }
        await save(record);
        return record;
    });
    handle("chunkerActions:collect", async (value) => {
        const record = await load(value);
        if (!record.run || record.state !== "completed") throw new Error("Wait for a successful conversion before collecting.");
        const r = record.request;
        const api = await transport(r);
        const outputs = (await api.listRunArtifacts(r.owner, r.repo, record.run.id)).filter((item) => item.name === "converted-world" && !item.expired);
        if (outputs.length !== 1 || !outputs[0]?.digest?.match(/^sha256:[a-f0-9]{64}$/)) throw new Error("The run must provide exactly one unexpired converted-world artifact with a published SHA-256.");
        if (await stat(r.outputDirectory).catch(() => null)) throw new Error("Choose a new output folder; collection never replaces an existing world.");
        const archive = join(root(), `${record.id}.zip`);
        await api.downloadArtifact(r.owner, r.repo, outputs[0], archive);
        const hash = await sha256File(archive);
        if (`sha256:${hash}` !== outputs[0].digest) throw new Error("The downloaded result does not match GitHub's digest. Nothing was installed.");
        const staging = join(root(), `${record.id}-download-${randomUUID()}`);
        await extractZip(archive, staging);
        const inner = join(staging, `converted-${record.id}.zip`);
        if (!(await stat(inner)).isFile()) throw new Error("The expected converted world archive is missing.");
        const prepared = `${r.outputDirectory}.collecting-${record.id}`;
        await extractZip(inner, prepared);
        const entries = await readdir(prepared);
        if (!entries.includes("level.dat")) throw new Error("The conversion archive has no level.dat at its root.");
        await mkdir(dirname(r.outputDirectory), { recursive: true });
        await rename(prepared, r.outputDirectory);
        record.archiveSha256 = hash;
        record.state = "collected";
        record.message = "The digest matched and the converted world was collected into the selected new folder.";
        await save(record);
        return record;
    });
    handle("chunkerActions:cancel", async (value) => {
        const record = await load(value);
        active.get(record.id)?.abort();
        if (record.run && record.run.status !== "completed") {
            const lease = await options.account(record.request.accountId, "write");
            if (!lease) throw new Error("The selected account is unavailable.");
            const result = await lease.run(["run", "cancel", String(record.run.id), "--repo", `${record.request.owner}/${record.request.repo}`]);
            if (result.code !== 0) throw new Error("GitHub did not accept cancellation; check the run again.");
        }
        record.message = "Cancellation requested. Already uploaded source parts remain available for recovery.";
        await save(record);
        return record;
    });
    return { dispose() { for (const controller of active.values()) controller.abort(); for (const channel of CHUNKER_ACTION_CHANNELS) options.ipcMain.removeHandler(channel); } };
}
