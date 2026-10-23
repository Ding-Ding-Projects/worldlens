import type { IpcMain } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildWorldGenerationConfig } from "@worldlens/shared";
vi.mock("../cirender/transport.js", () => ({ brokerCliTransport: vi.fn() }));
import { brokerCliTransport } from "../cirender/transport.js";
import { WORLDGEN_ACTION_CHANNELS, installWorldgenActionsIpc, requestOf } from "./ipc.js";

const config = buildWorldGenerationConfig({
    engine: "synthetic",
    seed: 20261023,
    worldName: "gui-test-world",
    pregenerationRadius: 500,
    version: "1.21.4",
    outputMode: "folder",
    flavour: "vanilla",
    worldType: "default",
    generateStructures: true,
    dimensions: { overworld: true, nether: false, end: false },
});

function install(account: unknown = async () => ({})) {
    const handlers = new Map<string, (event: unknown, value: unknown) => Promise<unknown>>();
    const service = installWorldgenActionsIpc({
        ipcMain: {
            handle: (name: string, handler: (event: unknown, value: unknown) => Promise<unknown>) =>
                handlers.set(name, handler),
            removeHandler: (name: string) => handlers.delete(name),
        } as unknown as IpcMain,
        account: account as never,
    });
    return {
        service,
        handlers,
        dispatch: (value: unknown) =>
            handlers.get("worldgenActions:dispatch")!({}, value) as Promise<{
                ok: boolean;
                value?: Record<string, unknown>;
                message?: string;
            }>,
    };
}

function api(
    dispatched: { file: string; ref: string; inputs: Record<string, string> }[],
    recipe = "on:\n  workflow_dispatch:\n    inputs:\n      generation-config:\n",
) {
    return {
        readRepository: async () => ({ canWrite: true, private: false }),
        readFile: async () => ({
            contentBase64: Buffer.from(recipe).toString("base64"),
            sha: "recipe",
        }),
        readDefaultBranch: async () => "main",
        dispatchWorkflow: async (
            _owner: string,
            _repo: string,
            file: string,
            ref: string,
            inputs: Record<string, string>,
        ) => {
            dispatched.push({ file, ref, inputs });
        },
    };
}

describe("worldgen dispatch request", () => {
    it("accepts the dialog's document and defaults the options to a rendered artifact", () => {
        const request = requestOf({ owner: "owner", repo: "repo", config });
        expect(request).toEqual({
            owner: "owner",
            repo: "repo",
            config,
            options: { render: true, publish: "artifact", dispatchRender: false },
        });
    });

    it.each([
        [{ owner: "../x", repo: "repo", config }, "owner and name"],
        [{ owner: "owner", repo: "repo", config: { ...config, size: 1 } }, "'size'"],
        [
            { owner: "owner", repo: "repo", config: { ...config, engine: "vanilla-server" } },
            "cannot run on GitHub Actions",
        ],
        [{ owner: "owner", repo: "repo", config, options: { publish: "pages" } }, "'publish'"],
        [
            { owner: "owner", repo: "repo", config, options: { dispatchRender: true } },
            "release asset",
        ],
        [null, "Choose a repository"],
    ])("refuses %j", (value, message) => {
        expect(() => requestOf(value)).toThrow(message);
    });
});

describe("worldgenActions:dispatch", () => {
    it("registers exactly its channels and removes them on dispose", () => {
        const { service, handlers } = install();
        expect([...handlers.keys()]).toEqual([...WORLDGEN_ACTION_CHANNELS]);
        service.dispose();
        expect(handlers.size).toBe(0);
    });

    it("dispatches worldgen.yml on the default branch with string-only inputs", async () => {
        const dispatched: { file: string; ref: string; inputs: Record<string, string> }[] = [];
        vi.mocked(brokerCliTransport).mockReturnValue(api(dispatched) as never);
        const { service, dispatch } = install();
        try {
            const answer = await dispatch({
                owner: "owner",
                repo: "repo",
                config,
                options: { render: true, publish: "release-asset", dispatchRender: true },
            });
            expect(answer.ok).toBe(true);
            expect(answer.value).toMatchObject({
                repository: "owner/repo",
                workflowFile: "worldgen.yml",
                ref: "main",
                runsUrl: "https://github.com/owner/repo/actions/workflows/worldgen.yml",
            });
            expect(dispatched).toHaveLength(1);
            expect(dispatched[0]!.file).toBe("worldgen.yml");
            expect(dispatched[0]!.ref).toBe("main");
            expect(dispatched[0]!.inputs).toMatchObject({
                render: "true",
                publish: "release-asset",
                "dispatch-render": "true",
            });
            expect(JSON.parse(dispatched[0]!.inputs["generation-config"]!)).toEqual(config);
        } finally {
            service.dispose();
            vi.mocked(brokerCliTransport).mockReset();
        }
    });

    it("refuses without a signed-in account and without the workflow in the repository", async () => {
        const dispatched: { file: string; ref: string; inputs: Record<string, string> }[] = [];
        const signedOut = install(async () => null);
        try {
            expect(
                await signedOut.dispatch({ owner: "owner", repo: "repo", config }),
            ).toMatchObject({ ok: false, message: expect.stringContaining("Sign in") });
        } finally {
            signedOut.service.dispose();
        }
        vi.mocked(brokerCliTransport).mockReturnValue(
            api(dispatched, "name: something else\n") as never,
        );
        const missing = install();
        try {
            expect(await missing.dispatch({ owner: "owner", repo: "repo", config })).toMatchObject({
                ok: false,
                message: expect.stringContaining("worldgen.yml"),
            });
            expect(dispatched).toHaveLength(0);
        } finally {
            missing.service.dispose();
            vi.mocked(brokerCliTransport).mockReset();
        }
    });
});
