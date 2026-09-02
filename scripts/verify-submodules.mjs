import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  assert.equal(result.error, undefined, `git could not be started: ${result.error?.message ?? "unknown error"}`);
  assert.equal(result.status, 0, `git ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
  return result.stdout.trim();
}

export function gitlinks(repo, lsTree = git(repo, ["ls-files", "-s"])) {
  return lsTree.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const match = /^(160000) ([0-9a-f]{40}) 0\t(.+)$/.exec(line);
    return match ? [{ mode: match[1], expected: match[2], path: match[3] }] : [];
  });
}

export function verifyGitlinks(repo, entries = gitlinks(repo)) {
  for (const entry of entries) {
    const submodule = resolve(repo, entry.path);
    let actualTop;
    try {
      actualTop = resolve(git(submodule, ["rev-parse", "--show-toplevel"]));
    } catch (error) {
      throw new Error(`submodule ${entry.path} is not initialized: ${error.message}`);
    }
    assert.equal(actualTop, submodule, `submodule ${entry.path} is not initialized; git resolved the parent checkout instead`);
    const actual = git(submodule, ["rev-parse", "HEAD"]);
    assert.equal(actual, entry.expected, `submodule ${entry.path} is at ${actual}, expected ${entry.expected}`);
  }
  return entries.length;
}

export function initializeAndVerify(repo) {
  git(repo, ["submodule", "sync", "--recursive"]);
  git(repo, ["submodule", "update", "--init", "--recursive"]);
  return verifyGitlinks(repo);
}

if (process.argv.includes("--init")) {
  const repoFlag = process.argv.indexOf("--repo");
  const repo = repoFlag >= 0 ? resolve(process.argv[repoFlag + 1]) : process.cwd();
  process.stdout.write(`verified ${initializeAndVerify(repo)} gitlink(s)\n`);
} else if (process.argv.includes("--check")) {
  const repoFlag = process.argv.indexOf("--repo");
  const repo = repoFlag >= 0 ? resolve(process.argv[repoFlag + 1]) : process.cwd();
  process.stdout.write(`verified ${verifyGitlinks(repo)} gitlink(s)\n`);
}
