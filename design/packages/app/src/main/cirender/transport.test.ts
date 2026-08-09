/** The CI transport consumes one already-selected gh broker lease and never reroutes it. */

import { describe, expect, it } from "vitest";
import { fakeGhAccountLease } from "../ghcli/testLease.js";
import {
    RecordingGitHub,
    recordingGhAccountProvider,
    repositoryJson,
} from "./recordingGitHub.js";
import { brokerCliTransport, resolveTransport } from "./transport.js";

const OWNER = "o";
const REPO = "r";
const WORKFLOW = "render-world.yml";

async function resolve(github: RecordingGitHub, signedIn = true) {
    const lease = await recordingGhAccountProvider(github, { signedIn })();
    return resolveTransport({ owner: OWNER, repo: REPO, workflowFile: WORKFLOW, lease });
}

describe("gh CLI broker transport", () => {
    it("uses the selected account lease for the whole operation", async () => {
        const github = new RecordingGitHub()
            .on("GET", /actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render", state: "active", path: `.github/workflows/${WORKFLOW}` },
            })
            .on("GET", /repos\/o\/r$/, {
                status: 200,
                json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate: true }),
            });

        const resolved = await resolve(github);
        expect(resolved.report.route).toBe("gh");
        expect(resolved.report.gh).toMatchObject({ account: "octocat", usable: true });
        await expect(resolved.transport?.readRepository(OWNER, REPO)).resolves.toMatchObject({
            fullName: `${OWNER}/${REPO}`,
        });
    });

    it("does not fall back when the selected lease cannot see the repository", async () => {
        const github = new RecordingGitHub().on("GET", /actions\/workflows\/render-world\.yml$/, {
            status: 403,
            json: { message: "forbidden" },
        });
        const resolved = await resolve(github);
        expect(resolved.transport).toBeNull();
        expect(resolved.report.gh.recovery).toBe("github-settings");
    });

    it("offers direct reauthentication when no broker lease exists", async () => {
        const github = new RecordingGitHub();
        const resolved = await resolve(github, false);
        expect(resolved.transport).toBeNull();
        expect(resolved.report.describe).toContain("GitHub Settings");
        expect(github.calls).toHaveLength(0);
    });

    it("never supplies an authorization header from renderer-owned state", async () => {
        let authorization: string | null = "unobserved";
        const lease = fakeGhAccountLease({
            login: "octocat",
            api: async (_url, init) => {
                authorization = new Headers(init?.headers).get("authorization");
                return Response.json({
                    id: 1,
                    name: "Render",
                    state: "active",
                    path: `.github/workflows/${WORKFLOW}`,
                });
            },
        });
        const resolved = await resolveTransport({
            owner: OWNER,
            repo: REPO,
            workflowFile: WORKFLOW,
            lease,
        });
        expect(authorization).toBeNull();
        expect(resolved.report.ready).toBe(true);
    });

    it("builds API requests from the exact selected enterprise host", async () => {
        const seen: string[] = [];
        const lease = fakeGhAccountLease({
            host: "ghe.example",
            login: "enterprise-user",
            api: async (url) => {
                seen.push(url);
                return Response.json({
                    id: 1,
                    name: "Render",
                    state: "active",
                    path: `.github/workflows/${WORKFLOW}`,
                });
            },
        });

        const resolved = await resolveTransport({
            owner: OWNER,
            repo: REPO,
            workflowFile: WORKFLOW,
            lease,
        });

        expect(resolved.report.ready).toBe(true);
        expect(seen).toEqual([
            `https://ghe.example/api/v3/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}`,
        ]);
    });

    it("describes the main-process lease as a GitHub CLI account", () => {
        const transport = brokerCliTransport({ lease: fakeGhAccountLease({ login: "octocat" }) });
        expect(transport.describe).toContain("GitHub CLI account");
        expect(transport.describe).not.toContain("in this application");
    });
});
