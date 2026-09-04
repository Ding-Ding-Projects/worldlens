import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeGhAccountLease } from "../ghcli/testLease.js";
import {
    CI_BOOTSTRAP_MARKER_FILE,
    CI_BOOTSTRAP_MARKER_TOOL,
    CI_BOOTSTRAP_MARKER_VERSION,
    bootstrapCiRepository,
} from "./bootstrap.js";
import type { CiWorkflowTemplate } from "./bootstrap.js";

const OWNER = "octocat";
const REPO = "a-map";

/**
 * What the repository homepage should point at.
 *
 * GitHub reports the Pages site root, and the site root is the documentation site - the
 * render workflow copies the map into `map/` beside it. The two are deliberately different
 * values now, so they get different names here rather than one literal typed twice.
 */
const MAP_URL = `https://${OWNER}.github.io/${REPO}/map/`;
const API = "https://api.test";
const TEMPLATE_VERSION = 2;

const WORKFLOW_A: CiWorkflowTemplate = {
    path: ".github/workflows/render-world.yml",
    content: "name: Render world v2\n",
};
const WORKFLOW_B: CiWorkflowTemplate = {
    path: ".github/workflows/render-shard-wave.yml",
    content: "name: Render shard wave v2\n",
};
const WORKFLOW_C: CiWorkflowTemplate = {
    path: ".github/workflows/scheduled-render.yml",
    content: "name: Scheduled render v2\n",
};
const TEMPLATES = [WORKFLOW_A, WORKFLOW_B, WORKFLOW_C] as const;

function sha256(text: string): string {
    return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

interface FakeRepoOptions {
    readonly files?: Readonly<Record<string, string>>;
    readonly headSha?: string | null;
    readonly scopes?: readonly string[] | null;
    readonly canWrite?: boolean;
    readonly actionsEnabled?: boolean;
    readonly pagesBuildType?: "workflow" | "legacy" | null;
    readonly homepage?: string | null;
}

interface FakeCommit {
    readonly parent: string | null;
    readonly files: Map<string, string>;
}

class FakeRepo {
    readonly files: Map<string, string>;
    headSha: string | null;
    refuseContentsWrite = false;
    seedLeavesRepositoryEmpty = false;
    scopes: readonly string[] | null;
    canWrite: boolean;
    actionsEnabled: boolean;
    pagesBuildType: "workflow" | "legacy" | null;
    homepage: string | null;
    pagesUrl = `https://${OWNER}.github.io/${REPO}/`;
    rejectPagesCreate = false;
    rejectHomepageEdit = false;
    ignoreHomepageEdit = false;
    moveHeadOnSecondRead = false;
    failAt: "blob" | "tree" | "commit" | null = null;
    readonly calls: { method: string; url: string; body: unknown }[] = [];
    readonly cliCalls: string[][] = [];
    #headReads = 0;
    #counter = 0;
    readonly #blobs = new Map<string, string>();
    readonly #trees = new Map<string, Map<string, string>>();
    readonly #commits = new Map<string, FakeCommit>();

    constructor(options: FakeRepoOptions = {}) {
        this.files = new Map(Object.entries(options.files ?? {}));
        this.headSha = options.headSha === undefined ? "head-0" : options.headSha;
        this.scopes = options.scopes === undefined ? ["repo", "workflow"] : options.scopes;
        this.canWrite = options.canWrite ?? true;
        this.actionsEnabled = options.actionsEnabled ?? true;
        this.pagesBuildType = options.pagesBuildType ?? null;
        this.homepage = options.homepage ?? null;
    }

    #next(prefix: string): string {
        this.#counter += 1;
        return `${prefix}-${this.#counter}`;
    }

    mutationCount(): number {
        return this.calls.filter(
            (call) => call.method === "POST" || call.method === "PUT" || call.method === "PATCH",
        ).length;
    }

    visibleCommitCount(): number {
        return this.calls.filter((call) => call.url.includes("/git/refs") && call.method !== "GET")
            .length;
    }

    seedMarker(
        installed: Readonly<Record<string, string>>,
        options: { version?: number; templateVersion?: number } = {},
    ): void {
        this.files.set(
            CI_BOOTSTRAP_MARKER_FILE,
            `${JSON.stringify(
                {
                    tool: CI_BOOTSTRAP_MARKER_TOOL,
                    version: options.version ?? CI_BOOTSTRAP_MARKER_VERSION,
                    templateVersion: options.templateVersion ?? TEMPLATE_VERSION,
                    files: Object.keys(installed),
                    fileHashes: Object.fromEntries(
                        Object.entries(installed).map(([path, content]) => [path, sha256(content)]),
                    ),
                    preparedAt: "2026-01-01T00:00:00.000Z",
                },
                null,
                2,
            )}\n`,
        );
    }

    readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = (init?.method ?? "GET").toUpperCase();
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
        this.calls.push({ method, url, body });
        const root = `${API}/repos/${OWNER}/${REPO}`;

        if (url === `${API}/rate_limit`) {
            const headers = new Headers({ "content-type": "application/json" });
            if (this.scopes !== null) headers.set("x-oauth-scopes", this.scopes.join(", "));
            return new Response("{}", { status: 200, headers });
        }
        if (url === root && method === "PATCH") {
            const request = body as { homepage?: unknown };
            this.homepage = typeof request.homepage === "string" ? request.homepage : null;
            return Response.json({ homepage: this.homepage });
        }
        if (url === root && method === "GET") {
            return Response.json({
                full_name: `${OWNER}/${REPO}`,
                name: REPO,
                owner: { login: OWNER },
                private: false,
                permissions: { push: this.canWrite },
                html_url: `https://github.test/${OWNER}/${REPO}`,
                homepage: this.homepage,
                default_branch: "main",
            });
        }
        if (url === `${root}/pages` && method === "GET") {
            return this.pagesBuildType === null
                ? Response.json({ message: "Not Found" }, { status: 404 })
                : Response.json({
                      build_type: this.pagesBuildType,
                      html_url: this.pagesUrl,
                  });
        }
        if (url === `${root}/pages` && (method === "POST" || method === "PUT")) {
            if (this.rejectPagesCreate) {
                return Response.json({ message: "Pages refused" }, { status: 403 });
            }
            const request = body as { build_type?: unknown };
            this.pagesBuildType = request.build_type === "workflow" ? "workflow" : "legacy";
            return Response.json(
                {
                    build_type: this.pagesBuildType,
                    html_url: this.pagesUrl,
                },
                { status: method === "POST" ? 201 : 200 },
            );
        }
        if (url === `${root}/actions/permissions` && method === "GET") {
            return Response.json({ enabled: this.actionsEnabled });
        }
        if (url === `${root}/git/ref/heads/main` && method === "GET") {
            this.#headReads += 1;
            if (this.moveHeadOnSecondRead && this.#headReads === 2) this.headSha = "external-head";
            return this.headSha === null
                ? Response.json({ message: "Not Found" }, { status: 404 })
                : Response.json({ ref: "refs/heads/main", object: { sha: this.headSha } });
        }
        // Models the one thing GitHub's Contents API can do that its Git Data API cannot:
        // create the very first commit of a repository that has none. Verified against a
        // real empty repository before this fake was written to match it.
        if (url.startsWith(`${root}/contents/`) && method === "PUT") {
            if (this.refuseContentsWrite) {
                return Response.json({ message: "Contents write refused" }, { status: 403 });
            }
            const parsedUrl = new URL(url);
            const contentsPath = `${new URL(root).pathname}/contents/`;
            const path = parsedUrl.pathname
                .slice(contentsPath.length)
                .split("/")
                .map(decodeURIComponent)
                .join("/");
            const request = body as { content: string };
            const content = Buffer.from(request.content, "base64").toString("utf8");
            this.files.set(path, content);
            const sha = this.#next("commit");
            if (!this.seedLeavesRepositoryEmpty) this.headSha = sha;
            return Response.json(
                { content: { sha: `file-${sha256(content).slice(0, 12)}` }, commit: { sha } },
                { status: 201 },
            );
        }
        if (url.startsWith(`${root}/contents/`) && method === "GET") {
            const parsedUrl = new URL(url);
            const contentsPath = `${new URL(root).pathname}/contents/`;
            const path = parsedUrl.pathname
                .slice(contentsPath.length)
                .split("/")
                .map(decodeURIComponent)
                .join("/");
            const content = this.files.get(path);
            return content === undefined
                ? Response.json({ message: "Not Found" }, { status: 404 })
                : Response.json({
                      sha: `file-${sha256(content).slice(0, 12)}`,
                      content: Buffer.from(content).toString("base64"),
                  });
        }
        if (url.startsWith(`${root}/git/commits/`) && method === "GET") {
            return Response.json({ sha: this.headSha, tree: { sha: "visible-tree" } });
        }
        if (url === `${root}/git/blobs` && method === "POST") {
            if (this.failAt === "blob")
                return Response.json({ message: "injected blob failure" }, { status: 500 });
            const request = body as { content: string };
            const sha = this.#next("blob");
            this.#blobs.set(sha, Buffer.from(request.content, "base64").toString("utf8"));
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/trees` && method === "POST") {
            if (this.failAt === "tree")
                return Response.json({ message: "injected tree failure" }, { status: 500 });
            const request = body as { tree: { path: string; sha: string }[] };
            const treeFiles = new Map(this.files);
            for (const entry of request.tree)
                treeFiles.set(entry.path, this.#blobs.get(entry.sha) ?? "");
            const sha = this.#next("tree");
            this.#trees.set(sha, treeFiles);
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/commits` && method === "POST") {
            if (this.failAt === "commit")
                return Response.json({ message: "injected commit failure" }, { status: 500 });
            const request = body as { tree: string; parents: string[] };
            const sha = this.#next("commit");
            this.#commits.set(sha, {
                parent: request.parents[0] ?? null,
                files: new Map(this.#trees.get(request.tree) ?? []),
            });
            return Response.json({ sha }, { status: 201 });
        }
        if (url === `${root}/git/refs/heads/main` && method === "PATCH") {
            const request = body as { sha: string; force: boolean };
            const commit = this.#commits.get(request.sha);
            if (request.force || commit === undefined || commit.parent !== this.headSha) {
                return Response.json({ message: "Reference update failed" }, { status: 422 });
            }
            this.files.clear();
            for (const [path, content] of commit.files) this.files.set(path, content);
            this.headSha = request.sha;
            return Response.json({ ref: "refs/heads/main", object: { sha: request.sha } });
        }
        return Response.json({ message: `no fake route for ${method} ${url}` }, { status: 404 });
    };

    readonly run = async (args: readonly string[]) => {
        this.cliCalls.push([...args]);
        if (args[0] === "repo" && args[1] === "edit") {
            if (this.rejectHomepageEdit) {
                return { started: true, code: 1, stdout: "", stderr: "HTTP 403: refused" } as const;
            }
            const homepageIndex = args.indexOf("--homepage");
            if (!this.ignoreHomepageEdit) {
                this.homepage = homepageIndex === -1 ? null : (args[homepageIndex + 1] ?? null);
            }
            return { started: true, code: 0, stdout: "", stderr: "" } as const;
        }
        if (args[0] === "repo" && args[1] === "view") {
            return {
                started: true,
                code: 0,
                stdout: JSON.stringify({ homepageUrl: this.homepage ?? "" }),
                stderr: "",
            } as const;
        }
        return {
            started: true,
            code: 1,
            stdout: "",
            stderr: "unexpected fake gh command",
        } as const;
    };
}

function run(repo: FakeRepo, templateVersion = TEMPLATE_VERSION, publishToPages = false) {
    return bootstrapCiRepository(
        { owner: OWNER, repo: REPO, publishToPages },
        {
            lease: fakeGhAccountLease({
                login: OWNER,
                scopes: repo.scopes ?? [],
                scopesReported: repo.scopes !== null,
                api: (url, init) => repo.fetch(url.replace("https://api.github.com", API), init),
                run: (args) => repo.run(args),
            }),
            templates: TEMPLATES,
            templateVersion,
            now: () => new Date("2026-08-07T12:00:00.000Z"),
        },
    );
}

function currentFiles(): Record<string, string> {
    return Object.fromEntries(TEMPLATES.map((template) => [template.path, template.content]));
}

describe("managed workflow bootstrap transaction", () => {
    it("enables workflow-backed Pages and verifies its URL as the repository homepage when requested", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.pages).toEqual({
            url: MAP_URL,
            buildType: "workflow",
            created: true,
            homepageUpdated: true,
        });
        expect(repo.pagesBuildType).toBe("workflow");
        expect(repo.homepage).toBe(MAP_URL);
        expect(repo.calls).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    method: "POST",
                    url: `${API}/repos/${OWNER}/${REPO}/pages`,
                }),
            ]),
        );
        expect(repo.cliCalls).toContainEqual([
            "repo",
            "edit",
            `github.com/${OWNER}/${REPO}`,
            "--homepage",
            MAP_URL,
        ]);
        expect(repo.cliCalls).toContainEqual([
            "repo",
            "view",
            `github.com/${OWNER}/${REPO}`,
            "--json",
            "homepageUrl",
        ]);
    });

    it("leaves Pages and the repository homepage untouched when the user did not request them", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files);

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.pages).toBeUndefined();
        expect(repo.pagesBuildType).toBeNull();
        expect(repo.homepage).toBeNull();
        expect(repo.calls.some((call) => call.url.endsWith("/pages"))).toBe(false);
    });

    it("refuses to replace an existing branch-backed Pages site", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({
            files,
            pagesBuildType: "legacy",
            homepage: "https://example.test/existing-site/",
        });
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result).toMatchObject({
            ok: false,
            failure: { code: "pages-configuration" },
        });
        expect(repo.pagesBuildType).toBe("legacy");
        expect(repo.homepage).toBe("https://example.test/existing-site/");
        expect(repo.cliCalls).toEqual([]);
        expect(
            repo.calls.some((call) => call.url.endsWith("/pages") && call.method !== "GET"),
        ).toBe(false);
    });

    it("reads back an existing workflow Pages URL without rewriting an identical homepage", async () => {
        const files = currentFiles();
        const url = MAP_URL;
        const repo = new FakeRepo({ files, pagesBuildType: "workflow", homepage: url });
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result).toMatchObject({
            ok: true,
            report: {
                pages: { url, buildType: "workflow", created: false, homepageUpdated: false },
            },
        });
        expect(repo.cliCalls.some((args) => args[1] === "edit")).toBe(false);
    });

    it("refuses a non-HTTPS Pages URL before touching the homepage", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files, pagesBuildType: "workflow" });
        repo.pagesUrl = "http://example.test/not-https/";
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result).toMatchObject({
            ok: false,
            failure: { code: "pages-configuration" },
        });
        expect(repo.homepage).toBeNull();
        expect(repo.cliCalls).toEqual([]);
    });

    it("reports a Pages creation refusal without attempting a homepage mutation", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.rejectPagesCreate = true;
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result).toMatchObject({
            ok: false,
            failure: { code: "pages-configuration" },
        });
        expect(repo.pagesBuildType).toBeNull();
        expect(repo.cliCalls).toEqual([]);
    });

    it("stops before dispatch evidence when gh refuses the homepage edit", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.rejectHomepageEdit = true;
        repo.seedMarker(files);

        const result = await run(repo, TEMPLATE_VERSION, true);

        expect(result).toMatchObject({
            ok: false,
            failure: { code: "pages-configuration" },
        });
        expect(repo.pagesBuildType).toBe("workflow");
        expect(repo.homepage).toBeNull();
    });

    it("fails a homepage read-back mismatch and succeeds on an idempotent retry", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.ignoreHomepageEdit = true;
        repo.seedMarker(files);

        const first = await run(repo, TEMPLATE_VERSION, true);
        expect(first).toMatchObject({
            ok: false,
            failure: { code: "pages-configuration" },
        });
        expect(repo.pagesBuildType).toBe("workflow");
        expect(repo.homepage).toBeNull();

        repo.ignoreHomepageEdit = false;
        const retried = await run(repo, TEMPLATE_VERSION, true);

        expect(retried).toMatchObject({
            ok: true,
            report: {
                pages: {
                    buildType: "workflow",
                    created: false,
                    homepageUpdated: true,
                },
            },
        });
        expect(repo.homepage).toBe(MAP_URL);
        expect(repo.calls.some((call) => call.method === "DELETE")).toBe(false);
        expect(
            repo.calls.some(
                (call) =>
                    call.url.includes("/git/refs/") &&
                    typeof call.body === "object" &&
                    call.body !== null &&
                    (call.body as { force?: unknown }).force === true,
            ),
        ).toBe(false);
    });

    it("performs no write when all three workflow bytes and the marker are current", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files);

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual([
            "unchanged",
            "unchanged",
            "unchanged",
        ]);
        expect(result.report.markerWritten).toBe(false);
        expect(repo.mutationCount()).toBe(0);
        expect(
            repo.calls
                .filter((call) => call.method === "GET" && call.url.includes("/contents/"))
                .every((call) => new URL(call.url).searchParams.get("ref") === "head-0"),
        ).toBe(true);
    });

    it("safely updates only bytes that still equal their recorded installed hash", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });

        const result = await run(repo);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.report.files.map((file) => file.action)).toEqual([
            "updated",
            "unchanged",
            "unchanged",
        ]);
        expect(repo.visibleCommitCount()).toBe(1);
        expect(repo.files.get(WORKFLOW_A.path)).toBe(WORKFLOW_A.content);
        const marker = JSON.parse(repo.files.get(CI_BOOTSTRAP_MARKER_FILE) ?? "{}") as {
            templateVersion?: number;
            fileHashes?: Record<string, string>;
        };
        expect(marker.templateVersion).toBe(TEMPLATE_VERSION);
        expect(marker.fileHashes?.[WORKFLOW_C.path]).toBe(sha256(WORKFLOW_C.content));
    });

    it("refuses a user edit whose bytes no longer match the installed SHA-256", async () => {
        const installed = currentFiles();
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        repo.files.set(WORKFLOW_A.path, "# user kept this customization\n");
        const before = new Map(repo.files);

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("managed-file-modified");
        expect(repo.files).toEqual(before);
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses to downgrade a newer marker schema", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.files.set(
            CI_BOOTSTRAP_MARKER_FILE,
            `${JSON.stringify({
                tool: CI_BOOTSTRAP_MARKER_TOOL,
                version: CI_BOOTSTRAP_MARKER_VERSION + 1,
                futureShape: { deliberately: "unknown to this build" },
            })}\n`,
        );

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("newer-marker-version");
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses to downgrade a newer managed template version", async () => {
        const files = currentFiles();
        const repo = new FakeRepo({ files });
        repo.seedMarker(files, { templateVersion: TEMPLATE_VERSION + 1 });

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("newer-template-version");
        expect(repo.mutationCount()).toBe(0);
    });

    it("refuses when the default branch moves between planning and commit", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        const before = new Map(repo.files);
        repo.moveHeadOnSecondRead = true;

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("concurrent-update");
        expect(repo.files).toEqual(before);
        expect(repo.visibleCommitCount()).toBe(0);
    });

    it("leaves visible repository state unchanged when object creation fails mid-transaction", async () => {
        const installed = {
            [WORKFLOW_A.path]: "name: Render world v1\n",
            [WORKFLOW_B.path]: WORKFLOW_B.content,
            [WORKFLOW_C.path]: WORKFLOW_C.content,
        };
        const repo = new FakeRepo({ files: installed });
        repo.seedMarker(installed, { templateVersion: 1 });
        const before = new Map(repo.files);
        const headBefore = repo.headSha;
        repo.failAt = "tree";

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("http-error");
        expect(repo.files).toEqual(before);
        expect(repo.headSha).toBe(headBefore);
        expect(repo.visibleCommitCount()).toBe(0);
    });

    it("gives an empty repository its first commit and then installs the workflows", async () => {
        const repo = new FakeRepo({ files: {}, headSha: null });

        const result = await run(repo);

        expect(result.ok).toBe(true);
        // The seed exists to give the guarded commit a parent, and the workflows still land.
        expect(repo.files.has("README.md")).toBe(true);
        for (const template of TEMPLATES) {
            expect(repo.files.get(template.path)).toBe(template.content);
        }
        expect(repo.headSha).not.toBeNull();
    });

    it("refuses when the repository is still empty after its starter commit was written", async () => {
        const repo = new FakeRepo({ files: {}, headSha: null });
        repo.seedLeavesRepositoryEmpty = true;

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("empty-repository");
        // No workflow was installed on a tip that does not exist.
        for (const template of TEMPLATES) {
            expect(repo.files.has(template.path)).toBe(false);
        }
    });

    it("reports the real refusal when the starter commit itself is rejected", async () => {
        const repo = new FakeRepo({ files: {}, headSha: null });
        repo.refuseContentsWrite = true;

        const result = await run(repo);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("http-error");
        expect(repo.files.size).toBe(0);
    });
});
