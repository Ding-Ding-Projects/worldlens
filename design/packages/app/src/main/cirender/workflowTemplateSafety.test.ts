/**
 * Guards the exact defect this repository shipped once: `render-world.yml`'s `cli` job
 * checked out this repository with `submodules: recursive` and built the submodule it
 * brought along, which only ever worked here - a repository this application bootstraps
 * for somebody else has no such submodule, so the checkout "succeeded" and the very next
 * step failed with "No such file or directory" for `vendor/BlueMap".
 *
 * These tests run the scanner in three ways: synthetic snippets shaped like the historical
 * bug and its fix, so the scanner's own logic is proven independent of today's file
 * contents; the real templates {@link loadCiWorkflowTemplates} hands the bootstrap writer,
 * derived from its own file list rather than three hard-coded names, so a fourth template
 * added later is covered automatically; and a byte-identical check against the committed
 * `.github/workflows/` files, because this exact defect could equally have arrived as a fix
 * applied to a packaged copy and not the checkout copy, or the other way round.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CI_WORKFLOW_FILE_NAMES, loadCiWorkflowTemplates } from "./workflowTemplates.js";
import {
    findSelfOnlyPathAssumptions,
    findSelfOnlyPathAssumptionsAcrossTemplates,
} from "./workflowTemplateSafety.js";

/**
 * The repository root, walked to independently of anything `workflowTemplates.ts` itself
 * uses to find `.github/workflows` - this file's directory is a fixed six levels below it
 * (cirender -> main -> src -> app -> packages -> design -> repository root), so this stays
 * a plain constant path rather than reusing the loader's own walking logic, which is the
 * very thing the byte-identical test below needs to check independently.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..");

describe("findSelfOnlyPathAssumptions", () => {
    it("flags a checkout that asks for this repository's own submodule", () => {
        const yaml = [
            "name: Test",
            "jobs:",
            "  cli:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "        with:",
            "          submodules: recursive",
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings).toContainEqual(
            expect.objectContaining({ job: "cli", reason: expect.stringContaining("submodule") }),
        );
    });

    it("flags a vendor/ path a job never creates for itself - the exact historical bug", () => {
        // This is render-world.yml's old cli job, before the fix: checkout the repository
        // with its submodule, then build straight out of the directory that checkout was
        // trusted to have populated.
        const yaml = [
            "name: Test",
            "jobs:",
            "  cli:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "        with:",
            "          submodules: recursive",
            "      - name: Build the shadow jar",
            "        working-directory: vendor/BlueMap",
            "        run: ./gradlew --no-daemon :cli:shadowJar",
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings.some((finding) => finding.reason.includes("vendor/BlueMap"))).toBe(true);
    });

    it("does not flag a vendor/ path the same job clones fresh for itself", () => {
        // This is render-world.yml's fixed cli job: no checkout at all, BlueMap cloned
        // straight from upstream into vendor/BlueMap before anything reads that directory.
        const yaml = [
            "name: Test",
            "jobs:",
            "  cli:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - name: Clone BlueMap at the pinned commit",
            "        run: |",
            "          git clone --quiet https://github.com/BlueMap-Minecraft/BlueMap.git vendor/BlueMap",
            "      - name: Build the shadow jar",
            "        working-directory: vendor/BlueMap",
            "        run: ./gradlew --no-daemon :cli:shadowJar",
            "      - name: Collect the jar",
            "        run: |",
            "          jar=$(find vendor/BlueMap/implementations/cli/build/libs -name '*.jar')",
        ].join("\n");

        expect(findSelfOnlyPathAssumptions("test.yml", yaml)).toEqual([]);
    });

    it("does not flag a job with no self-only path reference and no submodule", () => {
        const yaml = [
            "name: Test",
            "jobs:",
            "  render:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "      - name: Install",
            "        working-directory: somewhere-else",
            "        run: pnpm install --frozen-lockfile",
        ].join("\n");

        expect(findSelfOnlyPathAssumptions("test.yml", yaml)).toEqual([]);
    });

    it("flags a bare working-directory: design a job never checked out - the render-shard-wave.yml historical bug", () => {
        // This is render-shard-wave.yml's old render job, before the fix: check out the
        // dispatching repository (which never has design/) and then set working-directory
        // straight to the top-level directory that checkout was trusted to have populated.
        const yaml = [
            "name: Test",
            "jobs:",
            "  render:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "      - name: Install",
            "        working-directory: design",
            "        run: pnpm install --frozen-lockfile",
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings.some((finding) => finding.reason.includes("design"))).toBe(true);
    });

    it("flags a bare scripts/, packages/ or tools/ path a job never checked out", () => {
        for (const dir of ["scripts", "packages", "tools"]) {
            const yaml = [
                "name: Test",
                "jobs:",
                "  render:",
                "    runs-on: ubuntu-24.04",
                "    steps:",
                "      - uses: actions/checkout@abc123",
                "      - name: Run it",
                `        run: node ${dir}/thing.mjs`,
            ].join("\n");

            const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

            expect(
                findings.some((finding) => finding.reason.includes(dir)),
                `expected a finding mentioning "${dir}"`,
            ).toBe(true);
        }
    });

    it("does not flag design/, scripts/, packages/ or tools/ once the job clones this project itself - the render-world.yml fix", () => {
        const yaml = [
            "name: Test",
            "jobs:",
            "  plan:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - name: Check out the render toolchain",
            "        run: |",
            "          git clone https://github.com/Ding-Ding-Projects/worldlens.git toolchain",
            "          git -C toolchain checkout deadbeef",
            "      - name: Install",
            "        working-directory: toolchain/design",
            "        run: pnpm install --frozen-lockfile",
            "      - name: Plan the render",
            "        run: node toolchain/design/packages/render-actions/dist/cli.js plan",
        ].join("\n");

        expect(findSelfOnlyPathAssumptions("test.yml", yaml)).toEqual([]);
    });

    it("does not flag a bare path inside a step whose own working-directory already sits inside the established clone", () => {
        // This is render-world.yml's "Build the documentation site to publish alongside
        // the map" step: working-directory is toolchain/design, so the bare
        // packages/site/scripts/assert-base-path.mjs it runs is perfectly safe - it never
        // gets a "toolchain/" prefix in the text because it does not need one at runtime.
        const yaml = [
            "name: Test",
            "jobs:",
            "  merge:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - name: Check out the render toolchain",
            "        run: |",
            "          git clone https://github.com/Ding-Ding-Projects/worldlens.git toolchain",
            "      - name: Build the documentation site",
            "        working-directory: toolchain/design",
            "        run: |",
            "          pnpm --filter @worldlens/site build",
            "          node packages/site/scripts/assert-base-path.mjs",
        ].join("\n");

        expect(findSelfOnlyPathAssumptions("test.yml", yaml)).toEqual([]);
    });

    it("flags a pnpm --filter naming a workspace package the job never checked out", () => {
        const yaml = [
            "name: Test",
            "jobs:",
            "  check:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "      - name: Build the planner",
            '        run: pnpm --filter "@worldlens/render-actions..." run build',
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings.some((finding) => finding.reason.includes("@worldlens/render-actions"))).toBe(
            true,
        );
    });

    it("does not mistake a doc comment naming design/packages/... for a real dependency on it", () => {
        // Every one of this project's own workflow files documents its toolchain-clone fix
        // in prose that names design/packages/... paths directly, in comment lines that are
        // never executed. A scanner that cannot tell a comment from code would flag its own
        // fixed files.
        const yaml = [
            "name: Test",
            "jobs:",
            "  plan:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      # See design/packages/render-actions/src/plan/disk.ts for the estimate.",
            "      - name: Check out the render toolchain",
            "        run: |",
            "          set -euo pipefail",
            "          # scripts/join-parts.mjs is what rejoins a split release asset.",
            "          git clone https://github.com/Ding-Ding-Projects/worldlens.git toolchain",
            "      - name: Install",
            "        working-directory: toolchain/design",
            "        run: pnpm install --frozen-lockfile",
        ].join("\n");

        expect(findSelfOnlyPathAssumptions("test.yml", yaml)).toEqual([]);
    });

    it("flags design/ hidden behind a directory name the job never actually cloned anything into", () => {
        // A first draft of this check trusted the literal text shape "toolchain/design/…"
        // as proof of safety on sight, regardless of whether the job had really cloned
        // anything into "toolchain". Proven wrong against this project's own
        // render-shard-wave.yml: deleting its "Check out the render toolchain" step while
        // leaving every "toolchain/design/…" reference untouched stayed green under that
        // first draft, because none of those references were literally bare "design/…" -
        // they all still said "toolchain/" first. A self-only path is exactly as unsafe
        // camouflaged behind an unestablished directory name as it is written bare.
        const yaml = [
            "name: Test",
            "jobs:",
            "  render:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "      - name: Install",
            "        working-directory: toolchain/design",
            "        run: pnpm install --frozen-lockfile",
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings.some((finding) => finding.reason.includes("design"))).toBe(true);
    });

    it("handles a self-only path finding on a workflow file using Windows CRLF line endings", () => {
        // The exact bug this repository's own guard shipped with once: a line-anchored
        // regex that never matches once every line carries a trailing "\r", so the guard
        // silently passes a checkout with the defect still in it. See the module doc
        // comment on splitJobs for how CRLF is normalized before any of this runs.
        const yaml = [
            "name: Test",
            "jobs:",
            "  render:",
            "    runs-on: ubuntu-24.04",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "      - name: Install",
            "        working-directory: design",
            "        run: pnpm install --frozen-lockfile",
        ].join("\r\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings.some((finding) => finding.reason.includes("design"))).toBe(true);
    });

    it("scopes findings to the job they actually belong to", () => {
        const yaml = [
            "name: Test",
            "jobs:",
            "  cli:",
            "    steps:",
            "      - uses: actions/checkout@abc123",
            "        with:",
            "          submodules: recursive",
            "  render:",
            "    steps:",
            "      - run: echo fine",
        ].join("\n");

        const findings = findSelfOnlyPathAssumptions("test.yml", yaml);

        expect(findings).toEqual([
            expect.objectContaining({ job: "cli" }) as unknown as { job: string },
        ]);
    });
});

describe("findSelfOnlyPathAssumptionsAcrossTemplates against the real templates", () => {
    it("is clean for every template this application actually bootstraps", async () => {
        // Derived from the application's own list of template files - CI_WORKFLOW_FILE_NAMES
        // - rather than hard-coding three names here, so a fourth template added later is
        // covered by this test without anyone remembering to update it.
        expect(CI_WORKFLOW_FILE_NAMES.length).toBeGreaterThan(0);

        const loaded = await loadCiWorkflowTemplates();
        const findings = findSelfOnlyPathAssumptionsAcrossTemplates(loaded.templates);

        expect(findings).toEqual([]);
    });
});

describe("the bootstrapped templates are byte-identical to the committed workflow files", () => {
    it("matches loadCiWorkflowTemplates() against .github/workflows/ read independently", async () => {
        const loaded = await loadCiWorkflowTemplates();
        expect(loaded.templates).toHaveLength(CI_WORKFLOW_FILE_NAMES.length);

        for (const name of CI_WORKFLOW_FILE_NAMES) {
            const template = loaded.templates.find(
                (candidate) => candidate.path === `.github/workflows/${name}`,
            );
            expect(template, `loadCiWorkflowTemplates() has no entry for ${name}`).toBeDefined();

            const actual = await readFile(join(REPO_ROOT, ".github", "workflows", name), "utf8");
            expect(template?.content, `${name} diverges from the committed workflow file`).toBe(
                actual,
            );
        }
    });
});
