import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Provision only the reviewed official release tag used by the pinned fork's version derivation. */
export function ensureBlueMapReleaseTag({
  releaseTag,
  releaseCommit,
  checkOnly = false,
  runGit,
}) {
  if (
    !/^v\d+\.\d+(?:\.\d+)?$/u.test(releaseTag ?? "") ||
    !/^[a-f0-9]{40}$/u.test(releaseCommit ?? "")
  ) {
    return { ok: false, detail: "Invalid pinned BlueMap release identity." };
  }
  const ref = `refs/tags/${releaseTag}`;
  let result = runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
  if (result.status !== 0) {
    if (checkOnly)
      return {
        ok: false,
        detail: `Official BlueMap tag ${releaseTag} is missing from the fork checkout.`,
      };
    result = runGit([
      "fetch",
      "--no-tags",
      "https://github.com/BlueMap-Minecraft/BlueMap.git",
      `${ref}:${ref}`,
    ]);
    if (result.status !== 0)
      return {
        ok: false,
        detail: `Could not fetch official BlueMap tag ${releaseTag}.`,
      };
    result = runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
  }
  if (result.status !== 0 || result.stdout?.trim() !== releaseCommit) {
    return {
      ok: false,
      detail: `BlueMap tag ${releaseTag} does not resolve to the reviewed official release commit. Existing tags are never overwritten.`,
    };
  }
  if (
    runGit(["merge-base", "--is-ancestor", releaseCommit, "HEAD"]).status !== 0
  ) {
    return {
      ok: false,
      detail: `The pinned BlueMap fork does not contain official release ${releaseTag}.`,
    };
  }
  const selected = runGit(["describe", "--tags", "--abbrev=0"]);
  if (selected.status !== 0 || selected.stdout?.trim() !== releaseTag) {
    return {
      ok: false,
      detail: `BlueMap version derivation does not select reviewed tag ${releaseTag}. Existing refs were preserved.`,
    };
  }
  return {
    ok: true,
    detail: `Official BlueMap tag ${releaseTag} is verified against the pinned release.`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const release = JSON.parse(readFileSync(join(root, "scripts", "bluemap-source.json"), "utf8"));
  const result = ensureBlueMapReleaseTag({ ...release, runGit: (args) => spawnSync("git", ["-C", join(root, "vendor", "BlueMap-Material"), ...args], {
    encoding: "utf8", shell: false, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }) });
  process.stdout.write(`${result.detail}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
