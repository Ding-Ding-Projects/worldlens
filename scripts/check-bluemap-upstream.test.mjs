import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyComparison,
  classifyGhFailure,
  describeReport,
  readPinnedCommit,
  shortSha,
} from "./check-bluemap-upstream.mjs";

const PIN = "e664c1abdf697c64703401dca1d7e1956f755f65";

test("a missing gh binary is named as such rather than as a network problem", () => {
  const failure = classifyGhFailure({
    error: { code: "ENOENT" },
    stderr: "",
    status: null,
  });
  assert.equal(failure.reason, "gh-missing");
});

test("gh's own connection failure is reported as offline, not as up to date", () => {
  const failure = classifyGhFailure({
    error: null,
    status: 1,
    stderr:
      "error connecting to github.com\ncheck your internet connection or https://githubstatus.com",
  });
  assert.equal(failure.reason, "offline");
  assert.match(failure.message, /not the same as being up to date/);
});

test("an unauthenticated gh points the reader at the command that fixes it", () => {
  const failure = classifyGhFailure({
    error: null,
    status: 1,
    stderr: "gh: To use GitHub CLI in a GitHub Actions workflow, gh auth login",
  });
  assert.equal(failure.reason, "unauthenticated");
  assert.match(failure.message, /gh auth login/);
});

test("rate limiting is its own reason, because waiting is the fix", () => {
  const failure = classifyGhFailure({
    error: null,
    status: 1,
    stderr: "HTTP 403: API rate limit exceeded for user ID 1",
  });
  assert.equal(failure.reason, "rate-limited");
});

test("a 404 is not silently folded into some other failure", () => {
  const failure = classifyGhFailure({
    error: null,
    status: 1,
    stderr: "gh: Not Found (HTTP 404)",
  });
  assert.equal(failure.reason, "not-found");
});

test("an unrecognised failure keeps gh's own first line instead of inventing one", () => {
  const failure = classifyGhFailure({
    error: null,
    status: 1,
    stderr: "something nobody has seen before\nsecond line",
  });
  assert.equal(failure.reason, "gh-failed");
  assert.match(failure.message, /something nobody has seen before/);
  assert.doesNotMatch(failure.message, /second line/);
});

test("GitHub's head-relative status is translated to the pin's point of view", () => {
  // GitHub says "ahead" when the upstream target is ahead of our pin, which is us
  // being behind. Inverting this would make every report say the opposite thing.
  assert.equal(classifyComparison("ahead"), "behind");
  assert.equal(classifyComparison("behind"), "ahead");
  assert.equal(classifyComparison("identical"), "level");
  assert.equal(classifyComparison("diverged"), "diverged");
  assert.equal(classifyComparison("something-else"), "unknown");
});

test("a failed check never renders as a level or up-to-date sentence", () => {
  const line = describeReport({
    determined: false,
    reason: "offline",
    message: "GitHub could not be reached",
  });
  assert.match(line, /^unknown: /);
  assert.doesNotMatch(line, /level|up to date|behind|ahead/);
});

test("each determined status renders with the real tag and short shas", () => {
  const base = {
    determined: true,
    pinnedCommit: PIN,
    upstreamRef: "v5.23",
    upstreamCommit: "4c4cbc291b361ceff6ee239448e9f988f9019dbb",
    commitsBehind: 9,
    commitsAhead: 0,
  };
  assert.match(
    describeReport({ ...base, status: "behind" }),
    /^behind: vendored BlueMap e664c1abdf69 is 9 commits behind v5\.23 \(4c4cbc291b36\)$/,
  );
  assert.match(
    describeReport({ ...base, status: "level" }),
    /^level: .*e664c1abdf69 is exactly v5\.23/,
  );
  assert.match(
    describeReport({ ...base, status: "ahead", commitsAhead: 3 }),
    /^ahead: .*3 commits ahead of v5\.23/,
  );
  assert.match(describeReport({ ...base, status: "diverged" }), /^diverged: /);
});

test("the pin falls back to the parent tree when the submodule is not checked out", () => {
  const run = (_command, args) => {
    if (args.includes("rev-parse")) {
      return { status: 128, stdout: "", stderr: "not a git repository" };
    }
    return {
      status: 0,
      stdout: `160000 commit ${PIN}\tvendor/BlueMap\n`,
      stderr: "",
    };
  };
  const pin = readPinnedCommit({ run });
  assert.equal(pin.ok, true);
  assert.equal(pin.commit, PIN);
  assert.equal(pin.source, "parent-index");
});

test("no pin anywhere is reported rather than guessed at", () => {
  const run = () => ({ status: 128, stdout: "", stderr: "no" });
  const pin = readPinnedCommit({ run });
  assert.equal(pin.ok, false);
  assert.equal(pin.reason, "no-pin");
});

test("shortSha tolerates a value that never arrived", () => {
  assert.equal(shortSha(undefined), "unknown");
  assert.equal(shortSha(PIN), "e664c1abdf69");
});
