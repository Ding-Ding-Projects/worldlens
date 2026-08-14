/**
 * A guard against the exact defect this repository already shipped once: a workflow this
 * application commits into somebody else's repository that quietly depends on a path which
 * only exists in this repository's own checkout.
 *
 * `render-world.yml` used to check out this repository with `submodules: recursive` and
 * build `vendor/BlueMap` from the submodule that checkout brought along. That only ever
 * worked here. A repository this application bootstraps for somebody else carries only the
 * three workflow files `bootstrap.ts` writes and has no `vendor/BlueMap` submodule, so the
 * checkout step "succeeded" (there was nothing to fail) and the very next step failed in
 * forty-one seconds with "No such file or directory" for `vendor/BlueMap`. The fix was to
 * stop trusting a checkout to hand the job that directory and clone BlueMap fresh from
 * upstream inside the job instead - see the `cli` job's own comment in `render-world.yml`.
 *
 * The same shape of bug turned out not to be limited to `vendor/`. Every reference to this
 * project's own `design/`, `scripts/`, `packages/` or `tools/` directories - the planner,
 * the docs site build, `join-parts.mjs`, a `pnpm --filter` naming a workspace package -
 * carried the identical assumption: that whoever dispatched the workflow had this project's
 * own tree sitting beside `.github/workflows`, which is true only inside this repository
 * itself. The fix follows the same shape as the vendor one: clone this project fresh at a
 * pinned commit into a `toolchain/` directory inside the job, and read every one of those
 * paths out of that clone instead of assuming they are already there. See each of
 * `render-world.yml`, `render-shard-wave.yml` and `scheduled-render.yml`'s own "Check out
 * the render toolchain" step.
 *
 * A `vendor/` or self-only-directory reference is not forbidden outright: the fixed jobs
 * still set `working-directory: vendor/BlueMap` or `working-directory: toolchain/design`
 * and read paths underneath them, and both are fine because the same job clones that exact
 * directory itself before touching it. What this module refuses is a job that references
 * one of these paths without ever creating it - a checkout step that asks for a submodule
 * at all (a bootstrapped repository never has one), a bare reference to `vendor/`,
 * `design/`, `scripts/`, `packages/` or `tools/` that the job never established with its
 * own clone, or a `pnpm --filter` naming one of this project's workspace packages from a
 * directory the job never proved contains that workspace.
 *
 * This is a plain scan over the raw YAML text - splitting on job and step boundaries, then
 * on whitespace within a step - in the same style the rest of this project's workflow
 * tooling uses (see `scripts/lint-workflows.mjs`), rather than a full YAML parse: the job
 * structure this needs to see - top-level job names, each job's own block of lines, and
 * within it each step's own block and its `working-directory:` - is a small, stable shape
 * that a parser would not make any safer to read.
 */

export interface SelfOnlyPathFinding {
    readonly file: string;
    readonly job: string;
    readonly reason: string;
}

/** Matches a job's own header line directly under `jobs:`, e.g. `  cli:`. */
const JOB_HEADER = /^  ([A-Za-z][\w-]*):\s*$/;

/** A checkout step asking for a submodule, by any spelling GitHub Actions accepts. */
const SUBMODULES_KEY = /^\s*submodules:\s*\S+/m;

/** Any path under `vendor/`, wherever it appears in a job's text. */
const VENDOR_PATH = /\bvendor\/\S+/g;

/**
 * A job "establishes" a `vendor/…` path when it clones something into that path itself,
 * in the same run script that later reads it. `git clone … vendor/BlueMap` is the shape
 * the fixed `cli` job actually uses; this stays deliberately narrow rather than treating
 * any mention of `vendor/` as self-established, which would defeat the whole guard.
 */
const ESTABLISHES_VENDOR = /git\s+clone\b[^\n]*\bvendor\/\S+/;

/**
 * Top-level directories that exist only in this project's own checkout - worldlens itself -
 * never in a repository this application bootstraps for somebody else: `bootstrap.ts`
 * writes only three workflow files plus a repository marker into a target repository,
 * nothing under any of these names.
 *
 * This list is hand-written rather than read off a real directory listing at scan time,
 * because this module runs inside the packaged application (see the module doc comment
 * above) scanning plain YAML text pulled out of a workflow template - it has no checkout of
 * this project to list at that point, only the string it was handed. Where something real
 * *can* ground a name it does: `design/` is the workspace root `design/pnpm-workspace.yaml`
 * lives in, and that file's own `packages:` glob names `packages/*` and `tools/*` as the
 * workspace package roots beneath it, which is where `packages` and `tools` come from
 * here. `scripts/` is this repository's own top-level release and build tooling directory,
 * sibling to `design/`, that `render-world.yml`'s release-asset path already reaches into
 * for `join-parts.mjs`. If this repository ever grows a new top-level directory that a
 * bootstrapped workflow could be tempted to reach into directly - a fifth sibling of
 * design/scripts/packages/tools - add its name to this array too.
 */
const SELF_ONLY_TOP_LEVEL_DIRS = ["design", "scripts", "packages", "tools"];

/**
 * The npm scope every workspace package under `design/` publishes under - see any of
 * `design/packages/*\/package.json`'s own `"name"` field, e.g. `"@worldlens/render-actions"`.
 * A `pnpm --filter` naming a package in this scope only resolves when pnpm is invoked from
 * inside a checkout of this project's own workspace, which is exactly the same self-only
 * assumption a bare `design/` path reference makes, just spelled as a package name instead
 * of a path.
 */
const WORKSPACE_PACKAGE_SCOPE = "@worldlens/";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A job establishes a self-only path root - a directory it has itself proven is a full,
 * pinned clone of this project - by cloning "worldlens" (this project's own repository
 * name) into some destination directory in the same job. `git clone
 * https://github.com/Ding-Ding-Projects/worldlens.git toolchain` is the shape every fixed
 * job in this project's own render-world.yml, render-shard-wave.yml and
 * scheduled-render.yml uses; this stays deliberately narrow, matching ESTABLISHES_VENDOR's
 * own narrowness above, rather than treating any mention of this project's repository URL
 * as establishing anything.
 */
const CLONE_DEST = /git\s+clone\b[^\n]*\bworldlens(?:\.git)?\s+(\S+)/g;

/** Every destination directory a job's own text clones this project into. */
function findCloneDests(jobText: string): string[] {
    const dests: string[] = [];
    for (const match of jobText.matchAll(CLONE_DEST)) {
        if (match[1] !== undefined) dests.push(match[1]);
    }
    return dests;
}

/** True when `dir` is exactly one of `dests`, or sits inside one - e.g. "toolchain/design" sits inside "toolchain". */
function isWithinEstablishedDest(dir: string, dests: readonly string[]): boolean {
    return dests.some((dest) => dir === dest || dir.startsWith(`${dest}/`));
}

/** A `pnpm --filter` naming a workspace package by its {@link WORKSPACE_PACKAGE_SCOPE}. */
const WORKSPACE_FILTER = new RegExp(
    String.raw`--filter\s+["']?${escapeRegExp(WORKSPACE_PACKAGE_SCOPE)}[\w.-]+`,
    "g",
);

/**
 * Splits a piece of step text into whitespace-delimited words, the way a shell or a YAML
 * scalar would - a plain `String.prototype.split` rather than a path-shaped regex, because
 * the token itself (not just its slashes) is what the segment check below needs to reason
 * about.
 */
function extractTokens(text: string): string[] {
    return text.split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Strips the small set of characters this project's own YAML and shell text commonly wraps
 * or trails a path token in - quotes, backticks, and a stray trailing comma, semicolon or
 * closing bracket a shell or YAML construct can leave stuck to the end of a path - so a
 * token like `"@worldlens/render-actions..."` or `packages/site/dist)` is read as the path
 * it actually names.
 */
function stripTokenPunctuation(token: string): string {
    return token.replace(/^["'`]+/, "").replace(/["'`,;)}\]]+$/, "");
}

/**
 * Finds the self-only path this single token depends on without establishing, or `null`
 * when the token is fine.
 *
 * This walks the token's own "/"-separated segments looking for the first one that names
 * one of {@link SELF_ONLY_TOP_LEVEL_DIRS}, then checks whether everything *before* that
 * segment is one of `establishedDests` - a directory this job proved, by cloning this
 * project into it, actually holds a copy of this project. Only an exact match on that
 * leading prefix counts as established: a token like `toolchain/design/pnpm-lock.yaml` is
 * safe when `toolchain` is a real, job-established clone destination, and is flagged - the
 * same as a bare `design/pnpm-lock.yaml` would be - when it is not, because a self-only
 * path camouflaged behind an unestablished directory name is exactly as unsafe as a bare
 * one. This is what an earlier, purely textual version of this check got wrong: it treated
 * any `toolchain/design/…`-shaped text as safe on sight, which meant a job that referenced
 * that shape without ever actually cloning anything into `toolchain` passed regardless.
 *
 * Checking only the *first* self-only segment, rather than every segment in the token, is
 * also what keeps this from double-flagging "packages" a second time inside an
 * already-reported "design/packages/render-actions" - once the leading "design" segment is
 * resolved (established or not), the segments after it are just where that one path goes.
 */
function selfOnlyPathInToken(token: string, establishedDests: readonly string[]): string | null {
    const segments = token.split("/");
    const selfOnlyIndex = segments.findIndex((segment) => SELF_ONLY_TOP_LEVEL_DIRS.includes(segment));
    if (selfOnlyIndex === -1) return null;

    const prefix = segments.slice(0, selfOnlyIndex).join("/");
    if (establishedDests.includes(prefix)) return null;

    return segments.slice(selfOnlyIndex).join("/");
}

/** Splits a workflow file's raw text into { name, text } for every job under `jobs:`. */
function splitJobs(yaml: string): { readonly name: string; readonly text: string }[] {
    // Normalize CRLF first: this repository's checked-out workflow files can carry
    // Windows line endings, and every line-anchored regex below would otherwise see a
    // trailing "\r" glued to each line and never match.
    const lines = yaml.replace(/\r\n/g, "\n").split("\n");
    const jobsIndex = lines.findIndex((line) => line === "jobs:");
    if (jobsIndex === -1) return [];

    const headers: { readonly name: string; readonly lineIndex: number }[] = [];
    for (let i = jobsIndex + 1; i < lines.length; i += 1) {
        const match = JOB_HEADER.exec(lines[i] ?? "");
        if (match) headers.push({ name: match[1] ?? "", lineIndex: i });
    }

    return headers.map((header, position) => {
        const end = headers[position + 1]?.lineIndex ?? lines.length;
        return { name: header.name, text: lines.slice(header.lineIndex + 1, end).join("\n") };
    });
}

/**
 * Blanks out every full-line comment - a YAML `# ...` line, or a shell `# ...` line inside
 * a `run: |` block, both of which pass through unchanged into a job's raw text - before the
 * self-only-directory checks below scan it. Every one of this project's own workflow files
 * documents its "Check out the render toolchain" fix in prose that names design/packages/…
 * paths directly, in plain comment lines that are never actually executed; without this,
 * those doc comments would be indistinguishable from a real, unestablished dependency on
 * the same path. Line-blanking rather than line-removal keeps every other line's index
 * unchanged, which is what lets {@link splitSteps} below find step boundaries by position.
 */
function blankCommentLines(text: string): string {
    return text
        .split("\n")
        .map((line) => (line.trim().startsWith("#") ? "" : line))
        .join("\n");
}

/**
 * Splits one job's own text into per-step { workingDirectory, text }, at the six-space
 * step-list indent ("      - ") this project's workflow files use throughout.
 *
 * A step's `working-directory:` key only ever affects that same step's own `run:` block -
 * it has no effect on a `with:` input such as setup-node's `cache-dependency-path`, which
 * is always resolved against the job's default working directory regardless. Reading it
 * per step, rather than once per job, is what lets a step like "Build the documentation
 * site to publish alongside the map" - whose `working-directory: toolchain/design` makes
 * its own bare `packages/site/scripts/assert-base-path.mjs` reference perfectly safe -
 * pass, while a step with no such working directory, or one pointed somewhere this job
 * never proved contains this project's checkout, still gets flagged.
 */
function splitSteps(jobText: string): { readonly workingDirectory: string | null; readonly text: string }[] {
    const lines = jobText.split("\n");
    const starts: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (/^ {6}-\s/.test(lines[i] ?? "")) starts.push(i);
    }
    // No recognizable step boundaries at all - scan the whole job body as one "step" with
    // no working directory, rather than silently skipping it.
    if (starts.length === 0) return [{ workingDirectory: null, text: jobText }];

    return starts.map((start, position) => {
        const end = starts[position + 1] ?? lines.length;
        const stepLines = lines.slice(start, end);
        let workingDirectory: string | null = null;
        for (const line of stepLines) {
            const match = /^\s+working-directory:\s*(\S+)\s*$/.exec(line);
            if (match?.[1] !== undefined) {
                workingDirectory = match[1];
                break;
            }
        }
        return { workingDirectory, text: stepLines.join("\n") };
    });
}

/**
 * Scans one workflow template's raw YAML for a self-only path assumption: a submodule
 * checkout, a `vendor/…` reference that job never creates for itself, a bare reference to
 * this project's own `design/`, `scripts/`, `packages/` or `tools/` that the job never
 * established with its own pinned clone, or a `pnpm --filter` naming a workspace package
 * from a directory the job never proved contains that workspace. Returns one finding per
 * job per reason, empty when the template is safe to bootstrap anywhere.
 */
export function findSelfOnlyPathAssumptions(fileName: string, yaml: string): SelfOnlyPathFinding[] {
    const findings: SelfOnlyPathFinding[] = [];

    for (const job of splitJobs(yaml)) {
        if (SUBMODULES_KEY.test(job.text)) {
            findings.push({
                file: fileName,
                job: job.name,
                reason: "checks out a git submodule, which a bootstrapped repository never has",
            });
        }

        const vendorPaths = job.text.match(VENDOR_PATH) ?? [];
        if (vendorPaths.length > 0 && !ESTABLISHES_VENDOR.test(job.text)) {
            findings.push({
                file: fileName,
                job: job.name,
                reason:
                    `references ${vendorPaths[0]} without cloning it in the same job, ` +
                    "so it depends on a path that exists only in this repository",
            });
        }

        const dests = findCloneDests(job.text);
        const selfOnlyDirMatches: string[] = [];
        const workspaceFilterMatches: string[] = [];

        for (const step of splitSteps(blankCommentLines(job.text))) {
            // This step's own run block already executes inside a directory this job
            // proved is a full, pinned clone of this project - nothing it reads bare is a
            // self-only assumption, whatever the path looks like.
            const stepEstablished =
                step.workingDirectory !== null && isWithinEstablishedDest(step.workingDirectory, dests);
            if (stepEstablished) continue;

            for (const rawToken of extractTokens(step.text)) {
                const token = stripTokenPunctuation(rawToken);
                if (token === "") continue;
                const selfOnlyPath = selfOnlyPathInToken(token, dests);
                if (selfOnlyPath !== null) selfOnlyDirMatches.push(selfOnlyPath);
            }

            workspaceFilterMatches.push(...(step.text.match(WORKSPACE_FILTER) ?? []));
        }

        if (selfOnlyDirMatches.length > 0) {
            findings.push({
                file: fileName,
                job: job.name,
                reason:
                    `references ${selfOnlyDirMatches[0]} without checking out this project into the current directory first, ` +
                    "so it depends on a path that exists only in this repository's own checkout",
            });
        }

        if (workspaceFilterMatches.length > 0) {
            findings.push({
                file: fileName,
                job: job.name,
                reason:
                    `runs pnpm ${workspaceFilterMatches[0]} without checking out this project's own workspace into the current directory first, ` +
                    "so the named workspace package cannot resolve in a repository this application bootstraps for somebody else",
            });
        }
    }

    return findings;
}

/** Runs {@link findSelfOnlyPathAssumptions} across every loaded template. */
export function findSelfOnlyPathAssumptionsAcrossTemplates(
    templates: readonly { readonly path: string; readonly content: string }[],
): SelfOnlyPathFinding[] {
    return templates.flatMap((template) =>
        findSelfOnlyPathAssumptions(template.path, template.content),
    );
}
