/**
 * The Actions calls, against the recording fake.
 *
 * Two things here are worth more than the rest. The first is that a dispatched run is
 * correlated **by creation time**, with an allowance for a local clock that disagrees with
 * GitHub's - without it, a machine running a couple of seconds fast waits for ever for a
 * run it has already been given. The second is that a log that cannot be read answers null
 * rather than throwing: a missing log must never replace the render failure it was fetched
 * to explain.
 */

import { describe, expect, it } from "vitest";
import {
    ActionsCallError,
    RENDER_WORKFLOW_FILE,
    dispatchWorkflow,
    findDispatchedRun,
    listRunArtifacts,
    readDefaultBranch,
    readJobLogTail,
    readRepositoryVariable,
    readRun,
    readRunJobs,
    writeRepositoryVariable,
} from "./actions.js";
import {
    RecordingGitHub,
    artifactJson,
    jobJson,
    repositoryJson,
    runJson,
} from "./recordingGitHub.js";

const API = "https://api.test";
const TOKEN = "t0k3n";

function options(github: RecordingGitHub) {
    return { fetch: github.fetch, token: TOKEN, apiBase: API };
}

describe("dispatching", () => {
    it("sends the ref and every input as one JSON body", async () => {
        const github = new RecordingGitHub().on("POST", "/dispatches", { status: 204 });
        await dispatchWorkflow(
            "o",
            "r",
            RENDER_WORKFLOW_FILE,
            "main",
            { "map-id": "world", dimension: "minecraft:overworld" },
            options(github),
        );

        const call = github.calls[0];
        expect(call?.method).toBe("POST");
        expect(call?.url).toContain(`/actions/workflows/${RENDER_WORKFLOW_FILE}/dispatches`);
        expect(JSON.parse(call?.body ?? "{}")).toEqual({
            ref: "main",
            inputs: { "map-id": "world", dimension: "minecraft:overworld" },
        });
    });

    it("explains a 422 as a workflow that would not accept the request", async () => {
        const github = new RecordingGitHub().on("POST", "/dispatches", {
            status: 422,
            json: { message: "Required input 'map-id' not provided" },
        });
        await expect(
            dispatchWorkflow("o", "r", RENDER_WORKFLOW_FILE, "main", {}, options(github)),
        ).rejects.toThrowError(/workflow_dispatch trigger/);
    });

    it("explains a 403 as a permission the token does not have", async () => {
        const github = new RecordingGitHub().on("POST", "/dispatches", { status: 403, json: {} });
        await expect(
            dispatchWorkflow("o", "r", RENDER_WORKFLOW_FILE, "main", {}, options(github)),
        ).rejects.toThrowError(/permission/);
    });

    it("explains a 404 as either missing or invisible, never as one of the two", async () => {
        const github = new RecordingGitHub().on("POST", "/dispatches", { status: 404, json: {} });
        const caught = await dispatchWorkflow(
            "o",
            "r",
            RENDER_WORKFLOW_FILE,
            "main",
            {},
            options(github),
        ).catch((error: unknown) => error);
        expect(caught).toBeInstanceOf(ActionsCallError);
        expect((caught as ActionsCallError).message).toContain("looks exactly like a");
        expect((caught as ActionsCallError).status).toBe(404);
    });
});

describe("finding the run a dispatch produced", () => {
    const since = new Date("2026-08-04T10:00:00Z");

    function runsRoute(github: RecordingGitHub, runs: unknown[]): RecordingGitHub {
        return github.on("GET", "/runs?event=workflow_dispatch", {
            status: 200,
            json: { workflow_runs: runs },
        });
    }

    it("takes the newest run created at or after the dispatch", async () => {
        const github = runsRoute(new RecordingGitHub(), [
            runJson({ id: 5, status: "completed", createdAt: "2026-08-04T09:00:00Z" }),
            runJson({ id: 7, status: "queued", createdAt: "2026-08-04T10:00:01Z" }),
            runJson({ id: 6, status: "queued", createdAt: "2026-08-04T10:00:00Z" }),
        ]);
        const found = await findDispatchedRun(
            "o",
            "r",
            RENDER_WORKFLOW_FILE,
            since,
            options(github),
        );
        expect(found?.id).toBe(7);
    });

    it("ignores runs that predate the dispatch, however recent", async () => {
        const github = runsRoute(new RecordingGitHub(), [
            runJson({ id: 5, status: "completed", createdAt: "2026-08-04T09:59:00Z" }),
        ]);
        expect(
            await findDispatchedRun("o", "r", RENDER_WORKFLOW_FILE, since, options(github)),
        ).toBeNull();
    });

    it("still finds the run when this computer's clock is a few seconds fast", async () => {
        // GitHub stamped it a second before the local clock says the dispatch happened.
        // Without the skew allowance this waits for a run it has already been handed.
        const github = runsRoute(new RecordingGitHub(), [
            runJson({ id: 7, status: "queued", createdAt: "2026-08-04T09:59:59Z" }),
        ]);
        expect(
            (await findDispatchedRun("o", "r", RENDER_WORKFLOW_FILE, since, options(github)))?.id,
        ).toBe(7);
    });

    it("answers null for a workflow that has no runs yet, rather than throwing", async () => {
        const github = runsRoute(new RecordingGitHub(), []);
        expect(
            await findDispatchedRun("o", "r", RENDER_WORKFLOW_FILE, since, options(github)),
        ).toBeNull();
    });
});

describe("reading a run", () => {
    it("passes GitHub's status and conclusion through untouched", async () => {
        const github = new RecordingGitHub().on("GET", /\/actions\/runs\/7$/, {
            status: 200,
            json: runJson({ id: 7, status: "in_progress" }),
        });
        const run = await readRun("o", "r", 7, options(github));
        expect(run.status).toBe("in_progress");
        expect(run.conclusion).toBeNull();
        expect(run.headSha).toHaveLength(40);
    });

    it("reports a status it has never heard of as unknown, not as completed", async () => {
        const github = new RecordingGitHub().on("GET", /\/actions\/runs\/7$/, {
            status: 200,
            json: runJson({ id: 7, status: "some_future_state" }),
        });
        expect((await readRun("o", "r", 7, options(github))).status).toBe("unknown");
    });

    it("reads every job with its own state", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/runs/7/jobs", {
            status: 200,
            json: {
                jobs: [
                    jobJson({
                        id: 1,
                        name: "Build the BlueMap CLI",
                        status: "completed",
                        conclusion: "success",
                    }),
                    {
                        ...(jobJson({ id: 2, name: "Wave 1", status: "in_progress" }) as object),
                        steps: [
                            {
                                number: 14,
                                name: "Verify the merge",
                                status: "completed",
                                conclusion: "success",
                                started_at: "2026-08-04T10:10:00Z",
                                completed_at: "2026-08-04T10:10:01Z",
                            },
                            {
                                number: 15,
                                name: "Assemble the complete map",
                                status: "in_progress",
                                conclusion: null,
                                started_at: "2026-08-04T10:10:01Z",
                                completed_at: null,
                            },
                        ],
                    },
                ],
            },
        });
        const jobs = await readRunJobs("o", "r", 7, options(github));
        expect(jobs.map((job) => [job.id, job.status, job.conclusion])).toEqual([
            [1, "completed", "success"],
            [2, "in_progress", null],
        ]);
        expect(jobs[1]?.steps.map((step) => [step.number, step.name, step.conclusion])).toEqual([
            [14, "Verify the merge", "success"],
            [15, "Assemble the complete map", null],
        ]);
        expect(jobs[0]?.stepsComplete).toBe(false);
        expect(jobs[1]?.stepsComplete).toBe(true);
    });

    it("marks a job incomplete when any raw step is malformed", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/runs/7/jobs", {
            status: 200,
            json: {
                jobs: [
                    {
                        ...(jobJson({ id: 2, name: "Merge group 0", status: "completed", conclusion: "failure" }) as object),
                        steps: [
                            {
                                number: 14,
                                name: "Verify the merge",
                                status: "completed",
                                conclusion: "success",
                                started_at: null,
                                completed_at: null,
                            },
                            { number: "fifteen", name: "unreadable" },
                        ],
                    },
                ],
            },
        });

        const jobs = await readRunJobs("o", "r", 7, options(github));

        expect(jobs[0]?.steps).toHaveLength(1);
        expect(jobs[0]?.stepsComplete).toBe(false);
    });

    it("reads beyond the first 100 jobs before reporting the inventory", async () => {
        const first = Array.from({ length: 100 }, (_, index) =>
            jobJson({
                id: index + 1,
                name: `Wave ${String(index + 1)}`,
                status: "completed",
                conclusion: "success",
            }),
        );
        const github = new RecordingGitHub().on(
            "GET",
            "/actions/runs/7/jobs",
            { status: 200, json: { total_count: 101, jobs: first } },
            {
                status: 200,
                json: {
                    total_count: 101,
                    jobs: [
                        jobJson({
                            id: 101,
                            name: "Publish to Pages",
                            status: "completed",
                            conclusion: "failure",
                        }),
                    ],
                },
            },
        );

        const jobs = await readRunJobs("o", "r", 7, options(github));

        expect(jobs).toHaveLength(101);
        expect(jobs[100]?.name).toBe("Publish to Pages");
        expect(github.countOf("/actions/runs/7/jobs", "GET")).toBe(2);
    });

    it("fails closed on a full jobs page with no completeness evidence", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/runs/7/jobs", {
            status: 200,
            json: {
                jobs: Array.from({ length: 100 }, (_, index) =>
                    jobJson({
                        id: index + 1,
                        name: `Job ${String(index + 1)}`,
                        status: "completed",
                        conclusion: "success",
                    }),
                ),
            },
        });

        await expect(readRunJobs("o", "r", 7, options(github))).rejects.toThrowError(
            /may be truncated/,
        );
    });
});

describe("a failing job's log", () => {
    it("answers the last lines only, so a megabyte of log does not cross", async () => {
        const lines = Array.from({ length: 500 }, (_, index) => `line ${String(index)}`);
        const github = new RecordingGitHub().on("GET", "/actions/jobs/42/logs", {
            status: 200,
            text: lines.join("\n"),
        });
        const tail = await readJobLogTail("o", "r", 42, options(github), 5);
        expect(tail?.split("\n")).toEqual([
            "line 495",
            "line 496",
            "line 497",
            "line 498",
            "line 499",
        ]);
    });

    it("answers null rather than throwing when the log has expired", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/jobs/42/logs", {
            status: 410,
            json: {},
        });
        expect(await readJobLogTail("o", "r", 42, options(github))).toBeNull();
    });

    it("answers null for a log with nothing in it", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/jobs/42/logs", {
            status: 200,
            text: "\n\n  \n",
        });
        expect(await readJobLogTail("o", "r", 42, options(github))).toBeNull();
    });
});

describe("artifacts and the ref", () => {
    it("reads the digest when GitHub published one, and null when it did not", async () => {
        const github = new RecordingGitHub().on("GET", "/actions/runs/7/artifacts", {
            status: 200,
            json: {
                artifacts: [
                    artifactJson({
                        id: 9,
                        name: "rendered-map",
                        bytes: 10,
                        digest: `sha256:${"a".repeat(64)}`,
                    }),
                    artifactJson({ id: 10, name: "world", bytes: 20 }),
                ],
            },
        });
        const artifacts = await listRunArtifacts("o", "r", 7, options(github));
        expect(artifacts[0]?.digest).toBe(`sha256:${"a".repeat(64)}`);
        expect(artifacts[1]?.digest).toBeNull();
    });

    it("reads beyond the first 100 artifacts before reporting the inventory", async () => {
        const first = Array.from({ length: 100 }, (_, index) =>
            artifactJson({ id: index + 1, name: `part-${String(index)}`, bytes: 10 }),
        );
        const github = new RecordingGitHub().on(
            "GET",
            "/actions/runs/7/artifacts",
            {
                status: 200,
                json: { artifacts: first },
                headers: {
                    link: '<https://api.test/repos/o/r/actions/runs/7/artifacts?per_page=100&page=2>; rel="next"',
                },
            },
            {
                status: 200,
                json: {
                    artifacts: [artifactJson({ id: 101, name: "rendered-map", bytes: 20 })],
                },
            },
        );

        const artifacts = await listRunArtifacts("o", "r", 7, options(github));

        expect(artifacts).toHaveLength(101);
        expect(artifacts[100]?.name).toBe("rendered-map");
        expect(github.countOf("/actions/runs/7/artifacts", "GET")).toBe(2);
    });

    it("reads the default branch rather than guessing at main", async () => {
        const github = new RecordingGitHub().on("GET", /\/repos\/o\/r$/, {
            status: 200,
            json: repositoryJson({
                owner: "o",
                repo: "r",
                isPrivate: true,
                defaultBranch: "master",
            }),
        });
        expect(await readDefaultBranch("o", "r", options(github))).toBe("master");
    });

    it("refuses rather than guessing when GitHub does not say which branch is default", async () => {
        const github = new RecordingGitHub().on("GET", /\/repos\/o\/r$/, {
            status: 200,
            json: { full_name: "o/r", name: "r", owner: { login: "o" } },
        });
        await expect(readDefaultBranch("o", "r", options(github))).rejects.toThrowError(
            /which branch is default/,
        );
    });
});

describe("repository variables, for scheduled re-rendering", () => {
    it("reads a set variable's value", async () => {
        const github = new RecordingGitHub().on(
            "GET",
            "/actions/variables/CIRENDER_SCHEDULE_ENABLED",
            {
                status: 200,
                json: { name: "CIRENDER_SCHEDULE_ENABLED", value: "true" },
            },
        );
        expect(
            await readRepositoryVariable("o", "r", "CIRENDER_SCHEDULE_ENABLED", options(github)),
        ).toBe("true");
    });

    it("reads null, never a refusal, for a variable that has not been set", async () => {
        const github = new RecordingGitHub().on(
            "GET",
            "/actions/variables/CIRENDER_SCHEDULE_ENABLED",
            {
                status: 404,
                json: { message: "Not Found" },
            },
        );
        expect(
            await readRepositoryVariable("o", "r", "CIRENDER_SCHEDULE_ENABLED", options(github)),
        ).toBeNull();
    });

    it("refuses a real failure rather than reading it as merely unset", async () => {
        const github = new RecordingGitHub().on(
            "GET",
            "/actions/variables/CIRENDER_SCHEDULE_ENABLED",
            {
                status: 403,
                json: { message: "Resource not accessible by integration" },
            },
        );
        await expect(
            readRepositoryVariable("o", "r", "CIRENDER_SCHEDULE_ENABLED", options(github)),
        ).rejects.toBeInstanceOf(ActionsCallError);
    });

    it("updates an existing variable with one PATCH and never falls through to create", async () => {
        const github = new RecordingGitHub().on(
            "PATCH",
            "/actions/variables/CIRENDER_SCHEDULE_CADENCE",
            {
                status: 204,
            },
        );
        await writeRepositoryVariable(
            "o",
            "r",
            "CIRENDER_SCHEDULE_CADENCE",
            "daily",
            options(github),
        );
        expect(github.countOf("/actions/variables/CIRENDER_SCHEDULE_CADENCE", "PATCH")).toBe(1);
        expect(github.countOf("/actions/variables", "POST")).toBe(0);
        expect(JSON.parse(github.calls[0]?.body ?? "{}")).toEqual({ value: "daily" });
    });

    it("creates the variable when the update 404s, because it does not exist yet", async () => {
        const github = new RecordingGitHub()
            .on("PATCH", "/actions/variables/CIRENDER_SCHEDULE_CADENCE", {
                status: 404,
                json: { message: "Not Found" },
            })
            .on("POST", "/actions/variables", { status: 201 });
        await writeRepositoryVariable(
            "o",
            "r",
            "CIRENDER_SCHEDULE_CADENCE",
            "daily",
            options(github),
        );
        expect(github.countOf("/actions/variables/CIRENDER_SCHEDULE_CADENCE", "PATCH")).toBe(1);
        expect(github.countOf("/actions/variables", "POST")).toBe(1);
        const created = github.calls.find((call) => call.method === "POST");
        expect(JSON.parse(created?.body ?? "{}")).toEqual({
            name: "CIRENDER_SCHEDULE_CADENCE",
            value: "daily",
        });
    });

    it("refuses rather than silently doing nothing when creating fails too", async () => {
        const github = new RecordingGitHub()
            .on("PATCH", "/actions/variables/CIRENDER_SCHEDULE_CADENCE", {
                status: 404,
                json: { message: "Not Found" },
            })
            .on("POST", "/actions/variables", {
                status: 403,
                json: { message: "Resource not accessible" },
            });
        await expect(
            writeRepositoryVariable(
                "o",
                "r",
                "CIRENDER_SCHEDULE_CADENCE",
                "daily",
                options(github),
            ),
        ).rejects.toBeInstanceOf(ActionsCallError);
    });
});
