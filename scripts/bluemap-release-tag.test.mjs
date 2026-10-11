import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureBlueMapReleaseTag } from "./bluemap-release-tag.mjs";
const releaseCommit = "a".repeat(40);
function fixture({
  exists = true,
  actual = releaseCommit,
  ancestor = true,
  fetchSucceeds = true,
  checkOnly = false,
  selected = "v5.29",
} = {}) {
  const calls = [];
  let found = exists;
  const result = ensureBlueMapReleaseTag({
    releaseTag: "v5.29",
    releaseCommit,
    checkOnly,
    runGit: (args) => {
      calls.push(args);
      if (args[0] === "rev-parse")
        return { status: found ? 0 : 1, stdout: found ? actual + "\n" : "" };
      if (args[0] === "fetch") {
        found = fetchSucceeds;
        return { status: fetchSucceeds ? 0 : 1 };
      }
      if (args[0] === "describe") return { status: 0, stdout: selected };
      return { status: ancestor ? 0 : 1 };
    },
  });
  return { result, calls };
}
test("a matching existing tag is reused without network mutation", () => {
  const { result, calls } = fixture();
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
});
test("missing tags are fetched only from the official source and verified", () => {
  const { result, calls } = fixture({ exists: false });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[1], [
    "fetch",
    "--no-tags",
    "https://github.com/BlueMap-Minecraft/BlueMap.git",
    "refs/tags/v5.29:refs/tags/v5.29",
  ]);
});
test("check-only missing tags, failed fetches, wrong tags and missing ancestry fail closed", () => {
  for (const options of [
    { exists: false, checkOnly: true },
    { exists: false, fetchSucceeds: false },
    { actual: "b".repeat(40) },
    { ancestor: false },
  ])
    assert.equal(fixture(options).result.ok, false);
  assert.equal(fixture({ actual: "b".repeat(40) }).calls.length, 1);
});
test("malformed pinned identities never invoke Git", () => {
  assert.equal(
    ensureBlueMapReleaseTag({
      releaseTag: "v5.29;unexpected",
      releaseCommit,
      runGit: () => {
        throw new Error("must not run");
      },
    }).ok,
    false,
  );
});
test("another selected tag and timeout-shaped fetch results are not accepted", () => {
  assert.equal(fixture({ selected: "v5.23" }).result.ok, false);
  assert.equal(
    ensureBlueMapReleaseTag({
      releaseTag: "v5.29",
      releaseCommit,
      runGit: () => ({ status: null, error: { code: "ETIMEDOUT" } }),
    }).ok,
    false,
  );
});
