import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyWebapp } from "../design/packages/cli/scripts/copy-webapp.mjs";

test("CLI stages the maintained viewer and removes obsolete output", async () => {
    const root = await mkdtemp(join(tmpdir(), "worldlens-cli-viewer-"));
    try {
        const source = join(root, "vendor", "BlueMap-Material", "common", "webapp", "dist");
        const packageRoot = join(root, "cli");
        await mkdir(join(source, "assets"), { recursive: true });
        await writeFile(join(source, "index.html"), "<html>maintained viewer</html>");
        await writeFile(join(source, "assets", "viewer.js"), "real fixture script");
        await writeFile(join(source, "assets", "viewer.css"), "real fixture styles");
        await mkdir(join(packageRoot, "dist", "webapp"), { recursive: true });
        await writeFile(join(packageRoot, "dist", "webapp", "obsolete.txt"), "old output");
        const result = await copyWebapp({ repoRoot: root, packageRoot });
        assert.equal(await readFile(join(result.destination, "index.html"), "utf8"), "<html>maintained viewer</html>");
        await assert.rejects(readFile(join(result.destination, "obsolete.txt")), { code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing maintained assets fail before deleting an existing CLI viewer", async () => {
    const root = await mkdtemp(join(tmpdir(), "worldlens-cli-viewer-"));
    try {
        const packageRoot = join(root, "cli");
        await mkdir(join(packageRoot, "dist", "webapp"), { recursive: true });
        const existing = join(packageRoot, "dist", "webapp", "index.html");
        await writeFile(existing, "retained output");
        await assert.rejects(copyWebapp({ repoRoot: root, packageRoot }), /bundle is incomplete/u);
        assert.equal(await readFile(existing, "utf8"), "retained output");
    } finally { await rm(root, { recursive: true, force: true }); }
});
