/**
 * Dispatching `worldgen.yml` from the world generator dialog, through the GitHub CLI lease
 * every other cloud action in this process already uses.
 *
 * This is the `github-actions` runner of the world generator made real for the synthetic
 * engine. The renderer sends the configuration document it built (see
 * `@worldlens/shared`'s `worldGenerationConfig.ts`) plus the repository to run in; this
 * validates the document with the same module, confirms the repository carries the workflow
 * on its default branch, and starts one `workflow_dispatch`. It returns as soon as GitHub has
 * accepted the dispatch. A started run is not a generated world, and nothing here says
 * otherwise: the run is followed on GitHub, and its artifacts are what prove the world.
 *
 * Shaped after `chunkeractions/ipc.ts` deliberately, and much smaller: there is no upload
 * (the document is tiny and travels as the input itself) and no collection yet.
 */
import type { IpcMain } from "electron";
import {
    WORLDGEN_WORKFLOW_FILE,
    parseWorldGenerationConfig,
    worldgenCliArgumentsFor,
    worldgenDispatchInputs,
    type WorldGenerationConfig,
    type WorldgenDispatchOptions,
} from "@worldlens/shared";
import type { GhCliAccountProvider } from "../ghcli/credentialBroker.js";
import { brokerCliTransport } from "../cirender/transport.js";

export const WORLDGEN_ACTION_CHANNELS = ["worldgenActions:dispatch"] as const;

export interface WorldgenDispatchRequest {
    readonly accountId?: string;
    readonly owner: string;
    readonly repo: string;
    readonly config: WorldGenerationConfig;
    readonly options: WorldgenDispatchOptions;
}

export interface WorldgenDispatchReceipt {
    readonly repository: string;
    readonly workflowFile: string;
    readonly ref: string;
    readonly dispatchedAt: string;
    readonly inputs: Readonly<Record<string, string>>;
    /** Where the person follows the run. The run id is not known at dispatch time. */
    readonly runsUrl: string;
}

interface Options {
    readonly ipcMain: IpcMain;
    readonly account: GhCliAccountProvider;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const PUBLISH_MODES = ["artifact", "release-asset"] as const;

export function requestOf(value: unknown): WorldgenDispatchRequest {
    if (!value || typeof value !== "object")
        throw new Error("Choose a repository and build a generation configuration first.");
    const r = value as Record<string, unknown>;
    if (
        typeof r.owner !== "string" ||
        !NAME.test(r.owner) ||
        typeof r.repo !== "string" ||
        !NAME.test(r.repo)
    ) {
        throw new Error("The repository must be given as owner and name.");
    }
    if (r.accountId !== undefined && typeof r.accountId !== "string")
        throw new Error("The account id must be a string.");
    const parsed = parseWorldGenerationConfig(r.config);
    if (!parsed.ok) throw new Error(parsed.message);
    if (worldgenCliArgumentsFor(parsed.config) === null) {
        throw new Error(
            `The '${parsed.config.engine}' engine cannot run on GitHub Actions yet; only the built-in synthetic generator can.`,
        );
    }
    const options = (r.options ?? {}) as Record<string, unknown>;
    if (typeof options !== "object" || options === null)
        throw new Error("The dispatch options must be an object.");
    const publish = options.publish ?? "artifact";
    if (!(PUBLISH_MODES as readonly unknown[]).includes(publish))
        throw new Error("'publish' must be artifact or release-asset.");
    if (options.render !== undefined && typeof options.render !== "boolean")
        throw new Error("'render' must be true or false.");
    if (options.dispatchRender !== undefined && typeof options.dispatchRender !== "boolean")
        throw new Error("'dispatchRender' must be true or false.");
    const dispatchRender = options.dispatchRender === true;
    if (dispatchRender && publish !== "release-asset") {
        throw new Error(
            "Dispatching the map render needs the world published as a release asset; choose publish: release-asset.",
        );
    }
    return {
        ...(typeof r.accountId === "string" ? { accountId: r.accountId } : {}),
        owner: r.owner,
        repo: r.repo,
        config: parsed.config,
        options: {
            render: options.render !== false,
            publish: publish as WorldgenDispatchOptions["publish"],
            dispatchRender,
        },
    };
}

export function installWorldgenActionsIpc(options: Options): { dispose(): void } {
    const handle = (
        name: (typeof WORLDGEN_ACTION_CHANNELS)[number],
        operation: (value: unknown) => Promise<unknown>,
    ) =>
        options.ipcMain.handle(name, async (_event, value: unknown) => {
            try {
                return { ok: true, value: await operation(value) };
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        });

    handle("worldgenActions:dispatch", async (value): Promise<WorldgenDispatchReceipt> => {
        const r = requestOf(value);
        const lease = await options.account(r.accountId, "write");
        if (!lease) throw new Error("Sign in from GitHub accounts, then select that account here.");
        const api = brokerCliTransport({ lease });
        const repository = await api.readRepository(r.owner, r.repo);
        if (!repository.canWrite)
            throw new Error("The selected account cannot dispatch workflows in this repository.");
        const recipe = await api.readFile(
            r.owner,
            r.repo,
            `.github/workflows/${WORLDGEN_WORKFLOW_FILE}`,
        );
        if (
            !recipe ||
            !Buffer.from(recipe.contentBase64, "base64")
                .toString("utf8")
                .includes("generation-config:")
        ) {
            throw new Error(
                `${r.owner}/${r.repo} has no ${WORLDGEN_WORKFLOW_FILE} that accepts a generation configuration on its default branch. ` +
                    "Add this repository's .github/workflows/worldgen.yml there first.",
            );
        }
        const ref = await api.readDefaultBranch(r.owner, r.repo);
        const inputs = worldgenDispatchInputs(r.config, r.options);
        await api.dispatchWorkflow(r.owner, r.repo, WORLDGEN_WORKFLOW_FILE, ref, inputs);
        return {
            repository: `${r.owner}/${r.repo}`,
            workflowFile: WORLDGEN_WORKFLOW_FILE,
            ref,
            dispatchedAt: new Date().toISOString(),
            inputs,
            runsUrl: `https://github.com/${r.owner}/${r.repo}/actions/workflows/${WORLDGEN_WORKFLOW_FILE}`,
        };
    });

    return {
        dispose() {
            for (const name of WORLDGEN_ACTION_CHANNELS) options.ipcMain.removeHandler(name);
        },
    };
}
