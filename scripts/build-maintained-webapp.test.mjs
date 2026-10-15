import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildMaintainedWebapp } from "./build-maintained-webapp.mjs";

function fixture(fn) {
    const repoRoot = mkdtempSync(join(tmpdir(), "worldlens-viewer-build-"));
    const source = join(repoRoot, "vendor", "BlueMap-Material", "common", "webapp");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "package.json"), "{}");
    writeFileSync(join(source, "package-lock.json"), "{}");
    try { fn({ repoRoot, source }); } finally { rmSync(repoRoot, { recursive: true, force: true }); }
}
function bundle(source) {
    mkdirSync(join(source, "dist", "assets"), { recursive: true });
    writeFileSync(join(source, "dist", "index.html"), "<html>fixture</html>");
    writeFileSync(join(source, "dist", "assets", "viewer.js"), "export {};");
    writeFileSync(join(source, "dist", "assets", "viewer.css"), "body{}");
}
test("installs the pinned viewer and builds it before exposing assets to consumers", () => fixture(({ repoRoot, source }) => {
    const calls = [];
    const result = buildMaintainedWebapp({ repoRoot, platform: "linux", run(command, args, options) {
        calls.push([command, args]);
        assert.equal(options.cwd, source);
        assert.equal(options.shell, false);
        if (args[0] === "run") bundle(source);
        return { status: 0 };
    } });
    assert.deepEqual(calls, [["npm", ["ci", "--no-audit", "--no-fund"]], ["npm", ["run", "build"]]]);
    assert.equal(result.output, join(source, "dist"));
}));
test("a failed install never proceeds to build or accepts a previous warm bundle", () => fixture(({ repoRoot, source }) => {
    bundle(source);
    let calls = 0;
    assert.throws(() => buildMaintainedWebapp({ repoRoot, run() { calls++; return { status: 17 }; } }), /npm ci did not complete/);
    assert.equal(calls, 1);
}));
test("a failed build never reports a previous warm bundle as success", () => fixture(({ repoRoot, source }) => {
    bundle(source);
    assert.throws(() => buildMaintainedWebapp({ repoRoot, run(_command, args) { return { status: args[0] === "run" ? 19 : 0 }; } }), /npm run did not complete/);
}));
test("exit zero without real viewer outputs fails", () => fixture(({ repoRoot }) => {
    assert.throws(() => buildMaintainedWebapp({ repoRoot, run() { return { status: 0 }; } }), /without a complete/);
}));
test("absent pinned source fails before invoking npm", () => fixture(({ repoRoot, source }) => {
    rmSync(join(source, "package-lock.json"));
    assert.throws(() => buildMaintainedWebapp({ repoRoot, run() { assert.fail("npm must not run"); } }), /source is missing package-lock.json/);
}));
test("Windows npm uses fixed arguments with cwd outside the shell command", () => fixture(({ repoRoot, source }) => {
    buildMaintainedWebapp({ repoRoot, platform: "win32", run(command, args, options) {
        assert.equal(command, "npm");
        assert.equal(options.shell, true);
        assert.equal(options.cwd, source);
        assert(!args.some((arg) => arg.includes(source)));
        if (args[0] === "run") bundle(source);
        return { status: 0 };
    } });
}));
