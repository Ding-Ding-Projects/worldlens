/** One GitHub transport built from one main-process-only gh credential lease. */
import {
    createBackupRelease,
    findExistingAssets,
    findReleaseByTag,
    readRepository as readRepositoryOverRest,
} from "../backup/index.js";
import type { BackupRelease } from "../backup/index.js";
import { ghApiBaseForHost } from "../ghcli/credentialBroker.js";
import type { GhCliAccountLease } from "../ghcli/credentialBroker.js";
import {
    dispatchWorkflow,
    findDispatchedRun,
    githubApiJson,
    githubApiSendJson,
    isRepositoryEmpty,
    listRunArtifacts,
    readActionsPolicy,
    readDefaultBranch,
    readJobLogTail,
    readRepositoryFile,
    readRepositoryVariable,
    readRun,
    readRunJobs,
    readWorkflow,
    writeRepositoryFile,
    writeRepositoryVariable,
    LOG_TAIL_LINES,
    ActionsCallError,
} from "./actions.js";
import type {
    ActionsPolicy,
    RepositoryFile,
    WorkflowArtifact,
    WorkflowJob,
    WorkflowRun,
    WorkflowSummary,
} from "./actions.js";
import type { GhStatus } from "./gh.js";

export type CiRoute = "gh";

/** A repository as GitHub describes it, in the only four facts a sync acts on. */
export interface CiRepositoryFacts {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    /** True only when GitHub says this credential has push access. Never assumed. */
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

/** The exact default-branch tip against which a managed workflow update is planned. */
export interface CiRepositoryHead {
    readonly branch: string;
    readonly sha: string | null;
}

export interface CiAtomicRepositoryFile {
    readonly path: string;
    readonly contentBase64: string;
}

export interface CiAtomicCommitRequest {
    readonly branch: string;
    /** A real parent commit. GitHub's Git Data API cannot create a ref in an empty repository. */
    readonly expectedHeadSha: string;
    readonly files: readonly CiAtomicRepositoryFile[];
    readonly message: string;
}

/** A typed optimistic-concurrency refusal; callers may safely invite a retry. */
export class CiAtomicCommitConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CiAtomicCommitConflictError";
    }
}

/** The release a world's assets go on. Only what either route can answer for both. */
export interface CiRelease {
    readonly id: number;
    readonly tag: string;
    readonly htmlUrl: string;
}

/**
 * One asset already on a release, as a resumed upload sees it.
 *
 * Only assets GitHub reports as `uploaded` are ever described here. An asset stuck in
 * `starter` or `new` is one whose upload did not finish, and treating it as present
 * because its name matched is exactly how a resumed upload leaves a truncated part that
 * nothing notices until a restore.
 */
export interface CiReleaseAsset {
    readonly name: string;
    readonly size: number;
}

export interface CiUploadProgress {
    readonly bytesSent: number;
    readonly bytesTotal: number;
}

export interface CiAssetUpload {
    readonly release: CiRelease;
    readonly owner: string;
    readonly repo: string;
    /** The name the asset must land under. Derived from the content, never from a guess. */
    readonly assetName: string;
    readonly filePath: string;
    readonly bytes: number;
    readonly onProgress?: ((progress: CiUploadProgress) => void) | undefined;
}

/** Everything the sync loop asks of GitHub, in one place, for either credential. */
export interface CiTransport {
    readonly route: CiRoute;
    /** One phrase naming the credential in play, for a message a person has to act on. */
    readonly describe: string;
    /**
     * False when this route cannot publish a world at all.
     *
     * Both routes can, now that the transfer is route-aware. The flag survives because
     * "can start a render" and "can publish a world" are still two different capabilities,
     * and a future route that only reads must be able to say so here rather than failing
     * somewhere inside a packer.
     */
    readonly canUpload: boolean;

    readWorkflow(owner: string, repo: string, workflowFile: string): Promise<WorkflowSummary>;
    readDefaultBranch(owner: string, repo: string): Promise<string>;
    dispatchWorkflow(
        owner: string,
        repo: string,
        workflowFile: string,
        ref: string,
        inputs: Readonly<Record<string, string>>,
    ): Promise<void>;
    findDispatchedRun(
        owner: string,
        repo: string,
        workflowFile: string,
        since: Date,
    ): Promise<WorkflowRun | null>;
    readRun(owner: string, repo: string, runId: number): Promise<WorkflowRun>;
    readRunJobs(owner: string, repo: string, runId: number): Promise<readonly WorkflowJob[]>;
    readJobLogTail(
        owner: string,
        repo: string,
        jobId: number,
        maxLines?: number,
    ): Promise<string | null>;
    listRunArtifacts(
        owner: string,
        repo: string,
        runId: number,
    ): Promise<readonly WorkflowArtifact[]>;
    downloadArtifact(
        owner: string,
        repo: string,
        artifact: WorkflowArtifact,
        destination: string,
        onBytes?: (done: number, total: number) => void,
    ): Promise<void>;
    /** True when that release still carries that asset, in an uploaded state. */
    releaseHasAsset(owner: string, repo: string, tag: string, assetName: string): Promise<boolean>;

    /* -- the transfer, which is the only part that differs between the routes -- */

    /**
     * The repository, read by **the credential that is about to upload to it**.
     *
     * Deliberately not delegated to the backup surface. The public/private answer decides
     * whether a world is about to become a public download, and reading it with one
     * credential while publishing with another is how a repository that one of them cannot
     * see gets treated as private by default.
     */
    readRepository(owner: string, repo: string): Promise<CiRepositoryFacts>;
    /** One release by its tag, or null when there is none. Read-only, by construction. */
    findRelease(owner: string, repo: string, tag: string): Promise<CiRelease | null>;
    /**
     * Creates a **new** release, and refuses a tag that already exists.
     *
     * The append-only rule `main/backup/` enforces, enforced the same way on both routes:
     * adopting an existing tag is precisely how a second upload's assets land beside - or
     * over - a first one's. Carrying on with an interrupted upload goes through
     * {@link findRelease} instead, which reads and never writes.
     */
    createRelease(
        owner: string,
        repo: string,
        tag: string,
        name: string,
        body: string,
    ): Promise<CiRelease>;
    /**
     * What that release already holds, by asset name, so a resumed upload can skip it.
     *
     * The one call that makes resuming cheap: without it a dropped connection costs the
     * whole world again rather than the part that was in flight.
     */
    listReleaseAssets(
        owner: string,
        repo: string,
        tag: string,
    ): Promise<ReadonlyMap<string, CiReleaseAsset>>;
    /** Puts one staged file on the release under `assetName`. */
    uploadReleaseAsset(upload: CiAssetUpload): Promise<void>;

    /* -- scheduled re-rendering: the repository variables that configure it -- */

    /**
     * One repository variable, or null when it is not set.
     *
     * This is how the CI-render screen's scheduling section both writes its own
     * configuration (`CIRENDER_SCHEDULE_ENABLED`, `CIRENDER_SCHEDULE_CADENCE`, ...) and
     * reads back what `.github/workflows/scheduled-render.yml` last found
     * (`CIRENDER_SCHEDULE_LAST_CHECK_AT` and friends) - see `schedule.ts`. Never a secret:
     * a repository variable is plain text visible in the repository's own settings.
     */
    readVariable(owner: string, repo: string, name: string): Promise<string | null>;
    /** Creates or updates one repository variable. */
    writeVariable(owner: string, repo: string, name: string, value: string): Promise<void>;

    /* -- repository bootstrap: does the repository even have what a run needs? -- */

    /** True when the repository has never had a commit - no default-branch ref exists yet. */
    isRepositoryEmpty(owner: string, repo: string): Promise<boolean>;
    /** Whether GitHub will run a workflow here at all, independent of the workflow's own state. */
    readActionsPolicy(owner: string, repo: string): Promise<ActionsPolicy>;
    /**
     * The scopes this credential's token carries, when they can be read at all.
     *
     * Session-only in any meaningful sense: `gh` manages its own token and exposes no way
     * to read its scopes back, so this route always answers `null` - "not checked" rather
     * than "none", exactly the distinction {@link RouteGhReport} already draws elsewhere.
     */
    readTokenScopes(): Promise<{ readonly scopes: readonly string[] | null }>;
    /** One file's content at a path, optionally pinned to an exact commit, or null when absent. */
    readFile(
        owner: string,
        repo: string,
        path: string,
        ref?: string,
    ): Promise<RepositoryFile | null>;
    /**
     * Creates or updates one file at a path, on the default branch - including the very
     * first commit of a repository that has none yet. `sha` is required to update a file
     * that already exists and must be omitted to create one that does not.
     */
    writeFile(
        owner: string,
        repo: string,
        path: string,
        contentBase64: string,
        message: string,
        sha?: string,
    ): Promise<{ readonly sha: string; readonly commitSha: string | null }>;
    /** Reads the default branch and its exact current tip; null is a genuinely empty repository. */
    readRepositoryHead?: ((owner: string, repo: string) => Promise<CiRepositoryHead>) | undefined;
    /** Makes every supplied file visible in one guarded Git commit, or makes none visible. */
    commitFilesAtomically?: (
        owner: string,
        repo: string,
        request: CiAtomicCommitRequest,
    ) => Promise<{ readonly commitSha: string }>;
}

export interface BrokerCliTransportOptions {
    readonly lease: GhCliAccountLease;
    readonly signal?: AbortSignal | undefined;
    /** How the interface names this credential. The account login when it is known. */
    readonly account?: string | null | undefined;
}

interface GitDataApi {
    get(endpoint: string): Promise<unknown>;
    send(endpoint: string, method: "POST" | "PATCH", body: unknown): Promise<unknown>;
}

function recordOf(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, what: string): string {
    if (typeof value === "string" && value.length > 0) return value;
    throw new ActionsCallError(`GitHub did not answer with ${what}.`, 0, what);
}

function repositoryPath(owner: string, repo: string): string {
    return `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function refPath(branch: string): string {
    return `heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
}

async function readHeadWithApi(
    api: GitDataApi,
    owner: string,
    repo: string,
): Promise<CiRepositoryHead> {
    const root = repositoryPath(owner, repo);
    const repository = recordOf(await api.get(root));
    const branch = requiredString(
        repository["default_branch"],
        `the default branch for ${owner}/${repo}`,
    );
    try {
        const ref = recordOf(await api.get(`${root}/git/ref/${refPath(branch)}`));
        const object = recordOf(ref["object"]);
        return {
            branch,
            sha: requiredString(object["sha"], `the tip of ${owner}/${repo}:${branch}`),
        };
    } catch (error) {
        if (error instanceof ActionsCallError && error.status === 404) return { branch, sha: null };
        throw error;
    }
}

/**
 * Builds blobs, a tree and a commit out of sight, then advances one ref with `force:false`.
 * Object creation may fail or leave unreachable objects, but repository-visible bytes change
 * only at the final ref update, which GitHub applies atomically against the expected parent.
 */
async function commitFilesWithApi(
    api: GitDataApi,
    owner: string,
    repo: string,
    request: CiAtomicCommitRequest,
): Promise<{ readonly commitSha: string }> {
    const root = repositoryPath(owner, repo);
    const current = await readHeadWithApi(api, owner, repo);
    if (current.branch !== request.branch || current.sha !== request.expectedHeadSha) {
        throw new CiAtomicCommitConflictError(
            `${owner}/${repo}:${request.branch} moved while the managed workflows were being checked. Nothing was committed.`,
        );
    }

    const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const file of request.files) {
        const blob = recordOf(
            await api.send(`${root}/git/blobs`, "POST", {
                content: file.contentBase64,
                encoding: "base64",
            }),
        );
        treeEntries.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: requiredString(blob["sha"], `the blob sha for ${file.path}`),
        });
    }

    const parent = recordOf(
        await api.get(`${root}/git/commits/${encodeURIComponent(request.expectedHeadSha)}`),
    );
    const parentTree = recordOf(parent["tree"]);
    const baseTree = requiredString(parentTree["sha"], `the tree for ${request.expectedHeadSha}`);
    const tree = recordOf(
        await api.send(`${root}/git/trees`, "POST", {
            base_tree: baseTree,
            tree: treeEntries,
        }),
    );
    const treeSha = requiredString(tree["sha"], "the managed workflow tree sha");
    const commit = recordOf(
        await api.send(`${root}/git/commits`, "POST", {
            message: request.message,
            tree: treeSha,
            parents: [request.expectedHeadSha],
        }),
    );
    const commitSha = requiredString(commit["sha"], "the managed workflow commit sha");

    try {
        await api.send(`${root}/git/refs/${refPath(request.branch)}`, "PATCH", {
            sha: commitSha,
            force: false,
        });
    } catch (error) {
        if (error instanceof ActionsCallError && (error.status === 409 || error.status === 422)) {
            throw new CiAtomicCommitConflictError(
                `${owner}/${repo}:${request.branch} changed before the managed workflow commit could land. Nothing was overwritten.`,
            );
        }
        throw error;
    }
    return { commitSha };
}

/** A main-process broker lease used over the REST API for one complete operation. */
export function brokerCliTransport(options: BrokerCliTransportOptions): CiTransport {
    const call = {
        fetch: (url: string, init?: RequestInit) => options.lease.api(url, init),
        apiBase: ghApiBaseForHost(options.lease.host),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const gitDataApi: GitDataApi = {
        get: (endpoint) => githubApiJson(endpoint, call),
        send: (endpoint, method, body) => githubApiSendJson(endpoint, method, body, call),
    };

    /*
     * Named rather than reached for through `this`, because `releaseHasAsset` is defined
     * as "the listing contains it". One definition of what counts as present is what stops
     * the resumed-upload skip and the unchanged-world check from drifting apart.
     */
    const listReleaseAssets = async (
        owner: string,
        repo: string,
        tag: string,
    ): Promise<ReadonlyMap<string, CiReleaseAsset>> => {
        const found = new Map<string, CiReleaseAsset>();
        try {
            // `findExistingAssets` already keeps only the `uploaded` ones, which is the
            // distinction a resumed upload turns on.
            for (const [name, asset] of await findExistingAssets(owner, repo, tag, call)) {
                found.set(name, { name, size: asset.size });
            }
        } catch {
            // A release that cannot be read is treated as holding nothing, so its contents
            // are uploaded again. That costs an upload and is always correct; guessing the
            // other way dispatches a run whose first step finds nothing.
            return found;
        }
        return found;
    };

    return {
        route: "gh",
        describe:
            options.account === null || options.account === undefined
                ? "the selected GitHub CLI account"
                : `the selected GitHub CLI account (${options.account})`,
        canUpload: true,
        readWorkflow: (owner, repo, file) => readWorkflow(owner, repo, file, call),
        readDefaultBranch: (owner, repo) => readDefaultBranch(owner, repo, call),
        dispatchWorkflow: (owner, repo, file, ref, inputs) =>
            dispatchWorkflow(owner, repo, file, ref, inputs, call),
        findDispatchedRun: (owner, repo, file, since) =>
            findDispatchedRun(owner, repo, file, since, call),
        readRun: (owner, repo, runId) => readRun(owner, repo, runId, call),
        readRunJobs: (owner, repo, runId) => readRunJobs(owner, repo, runId, call),
        readJobLogTail: (owner, repo, jobId, maxLines) =>
            readJobLogTail(owner, repo, jobId, call, maxLines ?? LOG_TAIL_LINES),
        listRunArtifacts: (owner, repo, runId) => listRunArtifacts(owner, repo, runId, call),
        async downloadArtifact(_owner, _repo, artifact, destination, onBytes): Promise<void> {
            const result = await options.lease.downloadApi(artifact.archiveDownloadUrl, destination, {
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            });
            if (!result.started || result.code !== 0) {
                throw new ActionsCallError(
                    "GitHub CLI could not download the workflow artifact.",
                    cliHttpStatus(result.stderr),
                    artifact.archiveDownloadUrl,
                    [401, 403].includes(cliHttpStatus(result.stderr)),
                );
            }
            onBytes?.(result.bytes, artifact.sizeInBytes);
        },
        async releaseHasAsset(owner, repo, tag, assetName): Promise<boolean> {
            // Derived from the listing rather than answered separately, so "is it there"
            // and "may a resumed upload skip it" can never disagree about what counts.
            return (await listReleaseAssets(owner, repo, tag)).has(assetName);
        },

        async readRepository(owner, repo): Promise<CiRepositoryFacts> {
            const repository = await readRepositoryOverRest(owner, repo, call);
            return {
                owner: repository.owner,
                repo: repository.name,
                fullName: repository.fullName,
                private: repository.private,
                canWrite: repository.canWrite,
                htmlUrl: repository.htmlUrl,
            };
        },

        async findRelease(owner, repo, tag): Promise<CiRelease | null> {
            const release = await findReleaseByTag(owner, repo, tag, call);
            return release === null
                ? null
                : { id: release.id, tag: release.tag, htmlUrl: release.htmlUrl };
        },

        async createRelease(owner, repo, tag, name, body): Promise<CiRelease> {
            const release = await createBackupRelease(owner, repo, tag, name, body, call);
            return { id: release.id, tag: release.tag, htmlUrl: release.htmlUrl };
        },

        listReleaseAssets,

        async uploadReleaseAsset(upload): Promise<void> {
            // `uploadAsset` streams from disk and only reads the release's id, so the
            // narrow {@link CiRelease} both routes can answer is widened here rather than
            // making every caller carry a whole GitHub release record.
            const release: BackupRelease = {
                id: upload.release.id,
                tag: upload.release.tag,
                name: upload.release.tag,
                htmlUrl: upload.release.htmlUrl,
                uploadUrl: "",
                assets: [],
                createdAt: "",
            };
            const result = await options.lease.uploadReleaseAsset(
                upload.owner,
                upload.repo,
                release.tag,
                upload.assetName,
                upload.filePath,
                options.signal === undefined ? {} : { signal: options.signal },
            );
            if (!result.started || result.code !== 0) {
                throw new ActionsCallError(
                    "GitHub CLI could not upload the release asset.",
                    cliHttpStatus(result.stderr),
                    `${upload.owner}/${upload.repo}#${release.tag}`,
                    [401, 403].includes(cliHttpStatus(result.stderr)),
                );
            }
            upload.onProgress?.({ bytesSent: upload.bytes, bytesTotal: upload.bytes });
        },

        readVariable: (owner, repo, name) => readRepositoryVariable(owner, repo, name, call),
        writeVariable: (owner, repo, name, value) =>
            writeRepositoryVariable(owner, repo, name, value, call),

        isRepositoryEmpty: (owner, repo) => isRepositoryEmpty(owner, repo, call),
        readActionsPolicy: (owner, repo) => readActionsPolicy(owner, repo, call),
        readTokenScopes: async () => ({
            scopes: options.lease.scopesReported ? options.lease.scopes : null,
        }),
        readFile: (owner, repo, path, ref) => readRepositoryFile(owner, repo, path, call, ref),
        writeFile: (owner, repo, path, contentBase64, message, sha) =>
            writeRepositoryFile(owner, repo, path, contentBase64, message, call, sha),
        readRepositoryHead: (owner, repo) => readHeadWithApi(gitDataApi, owner, repo),
        commitFilesAtomically: (owner, repo, request) =>
            commitFilesWithApi(gitDataApi, owner, repo, request),
    };
}

/* -------------------------------------------------------------------------- */
/* Choosing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the report says about `gh`, including the case where it was never asked.
 *
 * `detectGh` answers three states and they are genuinely different remedies - install it,
 * sign in to it in a terminal, or nothing. **"Not checked" is a fourth thing and is not one
 * of them.** When the in-app sign-in works, `gh` is deliberately not probed, and reporting
 * that as "not installed" would put a sentence on the screen telling somebody to install
 * software they already have. So the report widens the state by exactly one value, and the
 * detector's own contract stays honest at three.
 */
export interface RouteGhReport extends Omit<GhStatus, "availability"> {
    readonly availability: GhStatus["availability"] | "not-checked";
    readonly usable: boolean;
    readonly reason: string | null;
    /** The same-surface recovery the renderer should offer when this route is blocked. */
    readonly recovery: "github-settings" | "dependencies" | null;
}

export interface RouteReport {
    readonly route: CiRoute | null;
    /** What the interface shows: which credential is driving, or why none can. */
    readonly describe: string;
    readonly gh: RouteGhReport;
    /** False when the selected gh account cannot drive this operation. */
    readonly ready: boolean;
    /** True only when the chosen route can also upload a world. */
    readonly canUpload: boolean;
}

export interface ResolveTransportOptions {
    readonly owner: string;
    readonly repo: string;
    readonly workflowFile: string;
    /** One already-selected main-process gh account lease. */
    readonly lease: GhCliAccountLease | null;
    readonly signal?: AbortSignal | undefined;
    /**
     * The capability probe used to decide whether a candidate route is usable.
     *
     * Defaults to `readWorkflow(owner, repo, workflowFile)` - the cheapest call that proves
     * a credential can see Actions on a repository that already has the workflow. A
     * repository being **bootstrapped** does not have it yet by definition, so
     * `bootstrap.ts` passes a weaker probe here (`readRepository`) that only asks whether
     * the credential can see the repository at all, which is everything a write needs to
     * start with.
     */
    readonly probe?:
        ((transport: CiTransport, owner: string, repo: string) => Promise<unknown>) | undefined;
}

export interface ResolvedTransport {
    readonly report: RouteReport;
    /** Null when neither credential could drive a render. `report` says why. */
    readonly transport: CiTransport | null;
}

/**
 * Builds one REST transport from the already-selected broker lease.
 *
 * Credential discovery, account selection and write-identity validation happen before
 * this function is called. There is deliberately no fallback candidate here: one operation
 * gets one lease, probes once and then keeps that exact account for every request.
 */
export async function resolveTransport(
    options: ResolveTransportOptions,
): Promise<ResolvedTransport> {
    const probe =
        options.probe ??
        ((transport, owner, repo) => transport.readWorkflow(owner, repo, options.workflowFile));
    if (options.lease === null) {
        const reason =
            "No gh CLI account credential is available. Sign in or reauthenticate from GitHub Settings.";
        return {
            transport: null,
            report: {
                route: null,
                describe: reason,
                gh: {
                    availability: "signed-out",
                    version: null,
                    account: null,
                    host: null,
                    scopes: null,
                    message: reason,
                    usable: false,
                    reason,
                    recovery: "github-settings",
                },
                ready: false,
                canUpload: false,
            },
        };
    }

    const transport = brokerCliTransport({
        lease: options.lease,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        account: options.lease.login,
    });
    try {
        await probe(transport, options.owner, options.repo);
        return {
            transport,
            report: {
                route: "gh",
                describe: `Using ${transport.describe}.`,
                gh: {
                    availability: "ready",
                    version: null,
                    account: options.lease.login,
                    host: options.lease.host,
                    scopes: options.lease.scopesReported ? options.lease.scopes : null,
                    message: `Using ${transport.describe}.`,
                    usable: true,
                    reason: null,
                    recovery: null,
                },
                ready: true,
                canUpload: true,
            },
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            transport: null,
            report: {
                route: null,
                describe: `The selected GitHub CLI account cannot start this operation: ${reason}`,
                gh: {
                    availability: "ready",
                    version: null,
                    account: options.lease.login,
                    host: options.lease.host,
                    scopes: options.lease.scopesReported ? options.lease.scopes : null,
                    message: reason,
                    usable: false,
                    reason,
                    recovery: "github-settings",
                },
                ready: false,
                canUpload: false,
            },
        };
    }
}

function cliHttpStatus(stderr: string): number {
    const raw = /(?:\(HTTP |HTTP )(\d{3})/.exec(stderr)?.[1];
    return raw === undefined ? 0 : Number.parseInt(raw, 10);
}
