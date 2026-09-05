#!/usr/bin/env node
/**
 * Fails when a workflow states something about this repository that is no longer true.
 *
 * The workflows are full of facts they cannot check: `design/packages/app` as a
 * literal path, `node-version: 22` while the real constraint lives in
 * `engines.node`, the product name copied out of the packaging config. None of
 * those are wrong today. All of them go wrong silently the moment somebody moves
 * a package or bumps a runtime, and the first thing that notices is a red run
 * minutes into CI, far from the cause.
 *
 * So this compares what the workflows *say* against what
 * `workflow-manifest.mjs` *discovers*, and reports the difference in the form of
 * the edit that would fix it.
 *
 * It is a local check, deliberately. GitHub Actions runs no tests and gates nothing
 * here, so a guard that only ran in CI would never run at all.
 *
 *   node scripts/check-workflow-drift.mjs          # report and exit non-zero on drift
 *   node scripts/check-workflow-drift.mjs --list   # show what is being checked
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readWorkflowManifest } from "./workflow-manifest.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github", "workflows");

/**
 * Every claim a workflow makes that the repository can settle for itself.
 *
 * Hand-written rather than derived, and that is the point. A rule that only
 * checked the paths it happened to find would pass on a workflow that had stopped
 * mentioning the app at all - which is the failure mode a completeness list
 * exists to catch. Adding a fact here is a deliberate act.
 */
function claims(manifest) {
    return [
        {
            id: "app-dir",
            // The literal that appears most, and the one a rename breaks worst.
            pattern: /(?<![\w./-])design\/packages\/app(?![\w-])/g,
            expected: manifest.appDir,
            why: "the app package directory",
        },
        {
            id: "site-dir",
            pattern: /(?<![\w./-])design\/packages\/site(?![\w-])/g,
            expected: manifest.siteDir,
            why: "the documentation site package directory",
        },
        {
            id: "cli-dir",
            pattern: /(?<![\w./-])design\/packages\/cli(?![\w-])/g,
            expected: manifest.cliDir,
            why: "the CLI package directory",
        },
        {
            id: "worldgen-dir",
            pattern: /(?<![\w./-])design\/packages\/worldgen(?![\w-])/g,
            expected: manifest.worldgenDir,
            why: "the worldgen package directory",
        },
        {
            id: "node-version",
            pattern: /node-version:\s*"?(\d+)"?/g,
            expected: manifest.nodeMajor,
            why: "the Node major from engines.node",
            capture: 1,
        },
        {
            id: "package-manager-file",
            pattern: /package_json_file:\s*(\S+)/g,
            expected: manifest.packageManagerFile,
            why: "the workspace root package.json pnpm reads",
            capture: 1,
        },
    ];
}

function workflowFiles() {
    return readdirSync(WORKFLOW_DIR)
        .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
        .sort();
}

/** Line number of an index, so a report points at something a person can open. */
function lineOf(text, index) {
    return text.slice(0, index).split("\n").length;
}

/**
 * The Chunker formats the workflow offers, against the ones the app offers.
 *
 * `chunk-world.yml` used to take this as free text, so a typo dispatched happily and
 * failed minutes later on a runner with "unknown format". It is a choice list now, which
 * means there are two lists of the same thing - and two lists of the same thing drift.
 * This is the check that stops them: the app's list is the one a person edits, and the
 * workflow's must match it exactly, in the same order, because the first entry is also
 * the default.
 */
/**
 * The Chunker Tow Fat and the workflow must name the same Chunker.
 *
 * The workflow downloads a published jar by tag; the Yern Geen builds one from the vendored
 * source. Two different Chunkers converting the same world is the kind of difference nobody
 * notices until a world comes back subtly wrong from one route and not the other - and
 * nothing on either side states its version, so it would never be diagnosed.
 *
 * Chunker declares no version anywhere in its source, so the tag is the only record. This
 * resolves that tag inside the checked-out Tow Fat and compares it with the commit the Oak
 * Kay actually pins, which is offline and exact. An uninitialised Tow Fat is skipped rather
 * than reported: a fresh checkout without --recurse-submodules has nothing to compare, and
 * failing there would be a complaint about the clone rather than about drift.
 */
function chunkerVersionDrift(repoRoot) {
    const workflowPath = join(WORKFLOW_DIR, "chunk-world.yml");
    const towFat = join(repoRoot, "vendor/Chunker");
    if (!existsSync(workflowPath) || !existsSync(join(towFat, ".git"))) return [];

    const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");
    const tagMatch = /CHUNKER_TAG:\s*(\S+)/.exec(workflow);
    if (tagMatch === null) return [];
    const tag = tagMatch[1];

    const read = (args) => {
        try {
            return execFileSync("git", args, { cwd: towFat, encoding: "utf8" }).trim();
        } catch {
            return null;
        }
    };

    const tagSha = read(["rev-parse", tag + "^{commit}"]);
    const pinned = read(["rev-parse", "HEAD"]);

    // The app is the authority here, not this file and not the workflow. It is what ships to
    // people, its version is pinned to an exact published asset and digest, and the whole
    // point of the exercise is that GitHub Actions follows the Yern Geen rather than leading it.
    const appPath = join(repoRoot, "design/packages/app/src/main/bedrock/chunker.ts");
    const appVersion = existsSync(appPath)
        ? (/version:\s*"([^"]+)"/.exec(readFileSync(appPath, "utf8"))?.[1] ?? null)
        : null;
    if (appVersion !== null && appVersion !== tag) {
        return [
            {
                file: ".github/workflows/chunk-world.yml",
                line: workflow.slice(0, tagMatch.index).split("\n").length,
                id: "chunker-version",
                found: "workflow tag " + tag,
                expected: "the version the app bundles (" + appVersion + ")",
                why: "the Chunker the app ships and the Chunker the workflow downloads",
            },
        ];
    }

    if (tagSha === null || pinned === null || tagSha === pinned) return [];

    return [
        {
            file: ".github/workflows/chunk-world.yml",
            line: workflow.slice(0, tagMatch.index).split("\n").length,
            id: "chunker-version",
            found: "workflow tag " + tag + " (" + tagSha.slice(0, 8) + ")",
            expected: "the pinned Tow Fat (" + pinned.slice(0, 8) + ")",
            why: "the Chunker the app builds and the Chunker the workflow downloads",
        },
    ];
}

function chunkerFormatDrift(repoRoot) {
    const modelPath = join(repoRoot, "design/packages/ui/src/components/chunker/chunkerModel.ts");
    const workflowPath = join(WORKFLOW_DIR, "chunk-world.yml");
    if (!existsSync(modelPath) || !existsSync(workflowPath)) return [];

    const model = readFileSync(modelPath, "utf8");
    const expected = [...model.matchAll(/id:\s*"((?:JAVA|BEDROCK)_[0-9_]+)"/g)].map((m) => m[1]);

    const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");
    const block = /target-format:[\s\S]*?options:\n((?:\s+- \S+\n)+)/.exec(workflow);
    if (block === null) {
        return [
            {
                file: ".github/workflows/chunk-world.yml",
                line: 1,
                id: "chunker-formats",
                found: "no choice list",
                expected: `${String(expected.length)} formats`,
                why: "the Chunker target-format input",
            },
        ];
    }

    const actual = [...block[1].matchAll(/- (\S+)/g)].map((m) => m[1]);
    if (actual.join(",") === expected.join(",")) return [];
    return [
        {
            file: ".github/workflows/chunk-world.yml",
            line: workflow.slice(0, block.index ?? 0).split("\n").length,
            id: "chunker-formats",
            found: actual.join(", "),
            expected: expected.join(", "),
            why: "the Chunker formats, which the app's own list decides",
        },
    ];
}

export function findDrift({ repoRoot = REPO_ROOT } = {}) {
    const manifest = readWorkflowManifest({ repoRoot });
    const problems = [];

    for (const name of workflowFiles()) {
        const path = join(WORKFLOW_DIR, name);
        const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

        for (const claim of claims(manifest)) {
            for (const match of text.matchAll(claim.pattern)) {
                const actual = claim.capture === undefined ? match[0] : match[claim.capture];
                if (actual === claim.expected) continue;
                problems.push({
                    file: `.github/workflows/${name}`,
                    line: lineOf(text, match.index ?? 0),
                    id: claim.id,
                    found: actual,
                    expected: claim.expected,
                    why: claim.why,
                });
            }
        }
    }
    problems.push(...chunkerFormatDrift(repoRoot));
    problems.push(...chunkerVersionDrift(repoRoot));

    return { manifest, problems };
}

function main(argv) {
    const { manifest, problems } = findDrift();

    if (argv.includes("--list")) {
        process.stdout.write("Checking every workflow against the repository's real shape:\n");
        for (const claim of claims(manifest)) {
            process.stdout.write(`  ${claim.id.padEnd(22)} expects ${claim.expected}  (${claim.why})\n`);
        }
        process.stdout.write(`  across ${String(workflowFiles().length)} workflow files\n`);
        return 0;
    }

    if (problems.length === 0) {
        process.stdout.write(
            `check-workflow-drift: ${String(workflowFiles().length)} workflows agree with the repository ` +
                `(app at ${manifest.appDir}, Node ${manifest.nodeMajor})\n`,
        );
        return 0;
    }

    process.stderr.write("Workflows disagree with the repository as it is now:\n\n");
    for (const p of problems) {
        process.stderr.write(
            `  ${p.file}:${String(p.line)}\n` +
                `    ${p.why} is now ${p.expected}, but this says ${p.found}\n`,
        );
    }
    process.stderr.write(
        `\n${String(problems.length)} disagreement(s). Each one is a workflow that will fail at run time, ` +
            `minutes away from the change that caused it.\n`,
    );
    return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main(process.argv.slice(2)));
}
