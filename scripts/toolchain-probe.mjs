import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "scripts", "toolchain-manifest.json"), "utf8"));

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.error, undefined, `${command} could not be started: ${result.error?.message ?? "unknown error"}`);
  assert.equal(result.status, 0, `${command} exited ${result.status}: ${result.stderr}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function exactLine(output, pattern, label) {
  const line = output.split(/\r?\n/).find((candidate) => pattern.test(candidate));
  assert.ok(line, `${label} did not report the required version grammar: ${output}`);
  return line;
}

export function probe(tool) {
  if (tool === "manifest") {
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.winget.node.version, "24.19.0");
    assert.equal(manifest.winget.git.version, "2.55.0.3");
    assert.equal(manifest.winget.gh.version, "2.98.0");
    for (const item of [manifest.portable.git, manifest.portable.gh]) {
      assert.match(item.sha256.x64, /^[0-9a-f]{64}$/);
      assert.match(item.sha256.arm64, /^[0-9a-f]{64}$/);
    }
    assert.match(manifest.portable.node.sha256.x64, /^[0-9a-f]{64}$/);
    assert.match(manifest.portable.node.sha256.arm64, /^[0-9a-f]{64}$/);
    assert.match(manifest.java.sha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.java.release, "jdk-25.0.4+7");
    assert.equal(manifest.java.version, "25.0.4+7");
    return "manifest-valid";
  }
  if (tool === "node") {
    const output = run(process.execPath, ["--version"]);
    const line = exactLine(output, /^v(?:22\.20\.0|24\.19\.0)$/, "Node");
    return line.slice(1);
  }
  if (tool === "git") {
    const output = run("git", ["--version"]);
    const line = exactLine(output, /^git version 2\.55\.0(?:\.windows\.3)?$/, "Git");
    return /^git version (\d+\.\d+\.\d+)/.exec(line)[1];
  }
  if (tool === "gh") {
    const output = run("gh", ["--version"]);
    const line = exactLine(output, /^gh version (?:2\.97\.0|2\.98\.0)\b/, "GitHub CLI");
    return /^gh version ([0-9.]+)/.exec(line)[1];
  }
  throw new Error(`unknown tool ${tool}`);
}

const tool = process.argv[2];
if (tool) {
  const value = probe(tool);
  process.stdout.write(`${value}\n`);
}

export { manifest };
