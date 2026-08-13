import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

type HostedRunner = "ubuntu-24.04" | "windows-2022";

/**
 * The tools a job needs beyond what its own steps install for themselves.
 *
 * Only `gh` so far, and it earns the entry because it is the one dependency nothing in a workflow
 * ever installs: it arrives preinstalled on the hosted images, which is exactly what makes it easy
 * to depend on without noticing. A job that reaches for it on an image that stopped shipping it,
 * or on any runner outside the standard hosted set, fails partway through with a shell reporting
 * an unknown command rather than with a missing-dependency message anybody can act on.
 */
type JobTool = "gh";

interface RunnerJob {
    readonly workflow: string;
    readonly job: string;
    readonly runner: HostedRunner;
    readonly tools: readonly JobTool[];
}

interface ReusableWorkflowJob {
    readonly workflow: string;
    readonly job: string;
    readonly uses: string;
    /** A reusable call runs no steps of its own, so its tools are the called workflow's. */
    readonly tools: readonly JobTool[];
}

type WorkflowJob = RunnerJob | ReusableWorkflowJob;

const WORKFLOWS = [
    "build-jars.yml",
    "chunk-world.yml",
    "ci.yml",
    "pages.yml",
    "render-private-world.yml",
    "render-shard-wave.yml",
    "render-world.yml",
    "scheduled-render.yml",
] as const;

/**
 * Completeness guard, intentionally hand-written. Every workflow job is named here,
 * including reusable-workflow calls (which cannot legally declare `runs-on`). Adding,
 * removing, or renaming a job must update this inventory in the same commit.
 *
 * Each entry also declares the tools that job needs but does not install, which is checked
 * against what the job's own steps actually invoke, in both directions.
 */
const WORKFLOW_JOBS: readonly WorkflowJob[] = [
    { workflow: "build-jars.yml", job: "build", runner: "ubuntu-24.04", tools: [] },
    { workflow: "chunk-world.yml", job: "plan", runner: "ubuntu-24.04", tools: ["gh"] },
    { workflow: "chunk-world.yml", job: "convert", runner: "ubuntu-24.04", tools: [] },
    { workflow: "chunk-world.yml", job: "assemble", runner: "ubuntu-24.04", tools: ["gh"] },
    { workflow: "ci.yml", job: "workflows", runner: "ubuntu-24.04", tools: [] },
    { workflow: "ci.yml", job: "check", runner: "ubuntu-24.04", tools: [] },
    { workflow: "ci.yml", job: "package", runner: "windows-2022", tools: [] },
    { workflow: "ci.yml", job: "jars", uses: "./.github/workflows/build-jars.yml", tools: [] },
    { workflow: "ci.yml", job: "config-java-roundtrip", runner: "ubuntu-24.04", tools: [] },
    { workflow: "ci.yml", job: "test-world", runner: "ubuntu-24.04", tools: [] },
    { workflow: "ci.yml", job: "screenshots", runner: "ubuntu-24.04", tools: [] },
    { workflow: "ci.yml", job: "release", runner: "ubuntu-24.04", tools: ["gh"] },
    { workflow: "pages.yml", job: "build", runner: "ubuntu-24.04", tools: [] },
    { workflow: "pages.yml", job: "deploy", runner: "ubuntu-24.04", tools: [] },
    {
        workflow: "render-private-world.yml",
        job: "preflight",
        runner: "ubuntu-24.04",
        tools: ["gh"],
    },
    { workflow: "render-private-world.yml", job: "cli", runner: "ubuntu-24.04", tools: [] },
    { workflow: "render-private-world.yml", job: "prepare", runner: "ubuntu-24.04", tools: ["gh"] },
    { workflow: "render-private-world.yml", job: "render", runner: "ubuntu-24.04", tools: ["gh"] },
    {
        workflow: "render-private-world.yml",
        job: "assemble",
        runner: "ubuntu-24.04",
        tools: ["gh"],
    },
    { workflow: "render-private-world.yml", job: "cleanup", runner: "ubuntu-24.04", tools: ["gh"] },
    { workflow: "render-shard-wave.yml", job: "render", runner: "ubuntu-24.04", tools: [] },
    { workflow: "render-world.yml", job: "cli", runner: "ubuntu-24.04", tools: [] },
    { workflow: "render-world.yml", job: "plan", runner: "ubuntu-24.04", tools: ["gh"] },
    ...Array.from({ length: 12 }, (_, index) => ({
        workflow: "render-world.yml",
        job: `wave${index + 1}`,
        uses: "./.github/workflows/render-shard-wave.yml",
        tools: [] as readonly JobTool[],
    })),
    { workflow: "render-world.yml", job: "merge", runner: "ubuntu-24.04", tools: [] },
    { workflow: "render-world.yml", job: "merge-lowres", runner: "ubuntu-24.04", tools: [] },
    { workflow: "render-world.yml", job: "publish", runner: "ubuntu-24.04", tools: [] },
    { workflow: "scheduled-render.yml", job: "check", runner: "ubuntu-24.04", tools: ["gh"] },
];

function workflowText(name: string): string {
    return readFileSync(join(repositoryRoot, ".github", "workflows", name), "utf8");
}

function jobBlocks(text: string): Map<string, string> {
    const jobsIndex = text.search(/^jobs:\s*$/m);
    expect(jobsIndex, "workflow must contain a top-level jobs mapping").toBeGreaterThanOrEqual(0);
    const jobsText = text.slice(jobsIndex);
    const starts = [...jobsText.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => ({
        name: match[1] as string,
        index: match.index,
    }));
    const blocks = new Map<string, string>();
    starts.forEach((start, index) => {
        blocks.set(
            start.name,
            jobsText.slice(start.index, starts[index + 1]?.index ?? jobsText.length),
        );
    });
    return blocks;
}

function jobKey(job: Pick<WorkflowJob, "workflow" | "job">): string {
    return `${job.workflow}:${job.job}`;
}

/**
 * Whether a job block really runs gh, as opposed to talking about it.
 *
 * Comment lines are dropped first, and that is not fastidiousness: these workflows explain
 * themselves at length, and several of the comments name `gh workflow run` or `gh release
 * download` while the step beside them does no such thing. Matching those would put a declared
 * dependency on jobs that have none, which makes the inventory describe the prose rather than the
 * commands. The subcommand list is deliberately explicit for the same reason, so an unrelated
 * word ending in "gh" cannot pass for an invocation.
 */
function invokesGh(block: string): boolean {
    return block
        .split(/\r?\n/)
        .filter((line) => !/^\s*#/.test(line))
        .some((line) =>
            /(^|[\s|("'`$])gh\s+(api|auth|release|repo|run|variable|workflow)\b/.test(line),
        );
}

function runnerPolicyProblems(workflow: string, text: string): string[] {
    const problems: string[] = [];
    const allowed = new Set<HostedRunner>(["ubuntu-24.04", "windows-2022"]);
    const expectedJobs = WORKFLOW_JOBS.filter((entry) => entry.workflow === workflow);
    const blocks = jobBlocks(text);

    for (const expected of expectedJobs) {
        const block = blocks.get(expected.job);
        if (block === undefined) {
            problems.push(`${jobKey(expected)} is missing`);
            continue;
        }
        if (!("runner" in expected)) continue;
        const match = block.match(/^\s*runs-on:\s*(.+?)\s*$/m);
        const actual = match?.[1] ?? "<missing>";
        if (!allowed.has(actual as HostedRunner)) {
            problems.push(`${jobKey(expected)} uses unapproved runner ${actual}`);
        }
        if (actual !== expected.runner) {
            problems.push(`${jobKey(expected)} expected ${expected.runner}, found ${actual}`);
        }
    }
    return problems;
}

describe("GitHub-hosted runner policy", () => {
    it("inventories every workflow file and every job by hand", () => {
        const workflowDirectory = join(repositoryRoot, ".github", "workflows");
        const discoveredWorkflows = readdirSync(workflowDirectory)
            .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
            .sort();
        expect(discoveredWorkflows).toEqual([...WORKFLOWS].sort());

        const discoveredJobs = WORKFLOWS.flatMap((workflow) =>
            [...jobBlocks(workflowText(workflow)).keys()].map((job) => ({ workflow, job })),
        );
        expect(discoveredJobs.map(jobKey).sort()).toEqual(WORKFLOW_JOBS.map(jobKey).sort());
    });

    it("gives every executable job its declared standard hosted label", () => {
        for (const expected of WORKFLOW_JOBS) {
            const block = jobBlocks(workflowText(expected.workflow)).get(expected.job);
            expect(block, `${jobKey(expected)} must exist`).toBeDefined();
            if ("runner" in expected) {
                expect(block).toContain(`runs-on: ${expected.runner}`);
                expect(block).not.toMatch(/^\s*uses:\s*\.\/\.github\/workflows\//m);
            } else {
                expect(block).toContain(`uses: ${expected.uses}`);
                expect(block).not.toMatch(/^\s*runs-on:/m);
            }
        }
    });

    it("rejects self-hosted labels, expressions, and non-standard runner labels", () => {
        for (const workflow of WORKFLOWS) {
            const text = workflowText(workflow);
            expect(text.toLowerCase()).not.toContain("self-hosted");
            expect(runnerPolicyProblems(workflow, text)).toEqual([]);
        }
    });

    it("rejects mutable, self-hosted, expression, and unknown labels in every pinned inventory", () => {
        for (const workflowName of WORKFLOWS) {
            const workflow = workflowText(workflowName);
            for (const replacement of [
                "ubuntu-latest",
                "self-hosted",
                "${{ matrix.runner }}",
                "ubuntu-nightly",
            ]) {
                const mutated = workflow.replace(
                    "runs-on: ubuntu-24.04",
                    `runs-on: ${replacement}`,
                );
                expect(mutated, workflowName).not.toBe(workflow);
                expect(
                    runnerPolicyProblems(workflowName, mutated),
                    `${workflowName}: ${replacement}`,
                ).not.toEqual([]);
            }
        }
    });

    it("keeps the deleted self-hosted bootstrap out of workflows and the tree", () => {
        const removedPaths = [
            join(repositoryRoot, ".github", "actions", "bootstrap-self-hosted", "action.yml"),
            join(repositoryRoot, ".github", "scripts", "bootstrap-self-hosted-linux.sh"),
            join(repositoryRoot, ".github", "scripts", "bootstrap-self-hosted-windows.ps1"),
            join(repositoryRoot, "docs", "self-hosted-ci-bootstrap.md"),
        ];
        expect(removedPaths.filter(existsSync)).toEqual([]);
        for (const workflow of WORKFLOWS) {
            expect(workflowText(workflow)).not.toContain("bootstrap-self-hosted");
        }
    });

    it("makes every job that invokes gh declare it, and nothing else claim it", () => {
        for (const expected of WORKFLOW_JOBS) {
            const block = jobBlocks(workflowText(expected.workflow)).get(expected.job);
            expect(block, `${jobKey(expected)} must exist`).toBeDefined();
            const invokes = invokesGh(block ?? "");
            const declares = expected.tools.includes("gh");
            // Both directions, because each one alone is satisfied by the wrong tree. Checking
            // only that a declared tool is used lets a new gh call arrive undeclared, and
            // checking only that a used tool is declared lets a stale declaration outlive the
            // step it was written for, which is how an inventory quietly stops describing
            // anything.
            expect(declares, `${jobKey(expected)} invokes gh without declaring it`).toBe(invokes);
        }
    });

    it("would notice a gh call added to a job that declares no tools", () => {
        const clean = WORKFLOW_JOBS.find(
            (entry) => entry.workflow === "ci.yml" && entry.job === "check",
        );
        expect(clean?.tools).toEqual([]);
        const block = jobBlocks(workflowText("ci.yml")).get("check") ?? "";
        expect(invokesGh(block)).toBe(false);
        expect(invokesGh(`${block}\n        run: gh release view v1\n`)).toBe(true);
    });

    it("restores pull-request validation now that public jobs are isolated", () => {
        expect(workflowText("ci.yml")).toMatch(/^\s{2}pull_request:\s*$/m);
    });
});
