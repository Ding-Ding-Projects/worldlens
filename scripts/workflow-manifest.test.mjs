/**
 * The manifest has one job: answer questions about this repository's shape without
 * anybody having written the answers down. So these tests are mostly about the
 * difference between discovering a fact and restating one.
 *
 * The load-bearing case is the rename. `design/packages/app` appears as a literal
 * in a dozen workflow steps today, and the whole reason this module exists is that
 * moving it silently breaks Der Machine. A test that only checks today's paths
 * would pass just as happily on a module that hard-coded them.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { readWorkflowManifest } from "./workflow-manifest.mjs";

const BUILDER_CONFIG = `module.exports = {
    appId: "dev.example.desktop",
    productName: "Example",
    squirrelWindows: { artifactName: "Example-\${version}-Setup.\${ext}" },
    extraResources: [
        { from: "../../../.github/workflows", to: "workflows", filter: ["a.yml", "b.yml"] },
    ],
};
`;

/** Builds a throwaway workspace whose app package sits at a caller-chosen path. */
async function fixture(appPath) {
    const root = await mkdtemp(join(tmpdir(), "wl-manifest-"));
    const design = join(root, "design");
    await mkdir(join(design, "packages"), { recursive: true });
    await writeFile(join(design, "pnpm-workspace.yaml"), "packages:\n    - packages/*\n");
    await writeFile(
        join(design, "package.json"),
        JSON.stringify({ name: "w", engines: { node: ">=22" }, packageManager: "pnpm@10.33.0" }),
    );

    const packages = {
        [appPath]: "@worldlens/app",
        site: "@worldlens/site",
        cli: "@worldlens/cli",
        worldgen: "@worldlens/worldgen",
    };
    for (const [dir, name] of Object.entries(packages)) {
        const full = join(design, "packages", dir);
        await mkdir(full, { recursive: true });
        await writeFile(join(full, "package.json"), JSON.stringify({ name }));
    }
    await writeFile(join(design, "packages", appPath, "electron-builder.config.cjs"), BUILDER_CONFIG);
    return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("finds the app by its package name, wherever the directory sits", async () => {
    // The same package under two different paths must produce two different
    // answers, from identical code. If this passed with a hard-coded
    // "design/packages/app" it would only pass for the first of the two.
    const a = await fixture("app");
    const b = await fixture("desktop-shell");
    try {
        assert.equal(readWorkflowManifest({ repoRoot: a.root }).appDir, "design/packages/app");
        assert.equal(
            readWorkflowManifest({ repoRoot: b.root }).appDir,
            "design/packages/desktop-shell",
        );
    } finally {
        await a.cleanup();
        await b.cleanup();
    }
});

test("emits POSIX separators, because these strings land in YAML", async () => {
    const { root, cleanup } = await fixture("app");
    try {
        const manifest = readWorkflowManifest({ repoRoot: root });
        for (const value of Object.values(manifest)) {
            if (typeof value === "string") assert.ok(!value.includes("\\"), value);
        }
    } finally {
        await cleanup();
    }
});

test("reads the Node major from engines rather than from a workflow", async () => {
    const { root, cleanup } = await fixture("app");
    try {
        assert.equal(readWorkflowManifest({ repoRoot: root }).nodeMajor, "22");
    } finally {
        await cleanup();
    }
});

test("takes the managed workflow names from the packaging config", async () => {
    // These are the files that actually ship inside the installer. Reading them
    // here rather than keeping a second list is the point: two lists of the same
    // thing are two lists that will disagree.
    const { root, cleanup } = await fixture("app");
    try {
        const manifest = readWorkflowManifest({ repoRoot: root });
        assert.deepEqual([...manifest.managedWorkflowFiles], ["a.yml", "b.yml"]);
        assert.equal(manifest.managedWorkflowDir, ".github/workflows");
    } finally {
        await cleanup();
    }
});

test("refuses to guess when a package it needs is gone", async () => {
    const { root, cleanup } = await fixture("app");
    try {
        await rm(join(root, "design", "packages", "site"), { recursive: true, force: true });
        assert.throws(() => readWorkflowManifest({ repoRoot: root }), /@worldlens\/site/);
    } finally {
        await cleanup();
    }
});

test("does not leak the builder config's environment mutations", async () => {
    // electron-builder.config.cjs deletes CSC_* variables and sets
    // CSC_IDENTITY_AUTO_DISCOVERY as a side effect of being loaded. Harmless in a
    // short-lived generator, not harmless inside a test worker, so it is contained.
    const { root, cleanup } = await fixture("app");
    process.env.CSC_LINK = "sentinel";
    try {
        readWorkflowManifest({ repoRoot: root });
        assert.equal(process.env.CSC_LINK, "sentinel");
    } finally {
        delete process.env.CSC_LINK;
        await cleanup();
    }
});
