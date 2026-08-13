#!/usr/bin/env node
/**
 * Reports whether the vendored BlueMap pin has fallen behind upstream's newest release.
 *
 * This project compiles vendor/BlueMap from source and ships the resulting jars, so the
 * pinned commit is not a version number in a manifest: it is third-party code that ends
 * up inside the product. That is why the comparison is against a tagged RELEASE and not
 * against the default branch. Building whatever the default branch happens to hold means
 * compiling and shipping code that nobody has reviewed, seconds after it was pushed, and
 * the person who would notice is a user rather than a maintainer. A release is the same
 * freshness with a human decision already behind it. The --branch flag exists for someone
 * who genuinely wants the tip and understands they are taking that decision themselves.
 *
 * The script never advances the pin on its own, and never reports "up to date" when it
 * failed to ask. Those are different facts: one says upstream has nothing new, the other
 * says we do not know, and conflating them is exactly how a project sits three versions
 * behind believing it is current. Every failure path below therefore reports its own
 * reason and leaves the pin untouched.
 *
 *   node scripts/check-bluemap-upstream.mjs            # human-readable one-line report
 *   node scripts/check-bluemap-upstream.mjs --json     # same facts, machine-readable
 *   node scripts/check-bluemap-upstream.mjs --branch   # compare against the tip instead
 *   node scripts/check-bluemap-upstream.mjs --advance  # move the pin, stage nothing
 *
 * Exit codes: 0 when the comparison was actually made, whatever its answer, because a
 * tool that fails when there is news is a tool people turn off. 1 when the comparison
 * could not be made at all, or when --advance was asked for and could not be completed.
 */

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(repoRoot, "vendor", "BlueMap");

export const UPSTREAM_REPOSITORY = "BlueMap-Minecraft/BlueMap";

const HELP = `check-bluemap-upstream - is the vendored BlueMap pin behind upstream?

  --json      print the report as JSON instead of a sentence
  --branch    compare against the default branch tip rather than the newest release.
              This opts in to building third-party code that has had no release
              review, so prefer the default unless you know why you want the tip.
  --advance   move the vendored submodule to the newer commit and stage nothing,
              leaving the commit to a person. Refuses if the submodule is dirty.
  --help      show this text
`;

/** Runs a command and keeps every stream, because gh reports its failures on stderr. */
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

/**
 * Turns a failed gh invocation into one of a small set of named reasons.
 *
 * The distinction matters to the caller rather than to this function: "gh is not
 * installed" and "GitHub said 404" both leave the pin alone, but only one of them is
 * worth telling a developer to fix. Anything unrecognised keeps gh's own first line,
 * which is more useful than a generic sentence we invented.
 */
export function classifyGhFailure({ error, stderr, status }) {
  if (error !== null && error !== undefined) {
    if (error.code === "ENOENT") {
      return {
        reason: "gh-missing",
        message:
          "the gh CLI is not installed, so upstream could not be checked at all",
      };
    }
    return { reason: "gh-failed", message: String(error.message ?? error) };
  }
  const text = String(stderr ?? "");
  const lower = text.toLowerCase();
  if (
    lower.includes("gh auth login") ||
    lower.includes("authentication token") ||
    lower.includes("requires authentication") ||
    lower.includes("bad credentials")
  ) {
    return {
      reason: "unauthenticated",
      message:
        "gh is not authenticated for this host, so upstream could not be checked. Run: gh auth login",
    };
  }
  if (lower.includes("rate limit")) {
    return {
      reason: "rate-limited",
      message:
        "GitHub rate-limited the request, so upstream could not be checked right now",
    };
  }
  if (
    lower.includes("error connecting to") ||
    lower.includes("check your internet connection") ||
    lower.includes("dial tcp") ||
    lower.includes("no such host") ||
    lower.includes("lookup ") ||
    lower.includes("connection refused") ||
    lower.includes("network is unreachable") ||
    lower.includes("i/o timeout") ||
    lower.includes("certificate")
  ) {
    return {
      reason: "offline",
      message:
        "GitHub could not be reached, so upstream could not be checked. This is not the same as being up to date.",
    };
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return {
      reason: "not-found",
      message: `GitHub returned not-found for ${UPSTREAM_REPOSITORY}`,
    };
  }
  const firstLine = text.trim().split(/\r?\n/)[0] ?? "";
  return {
    reason: "gh-failed",
    message:
      firstLine.length > 0
        ? `gh failed: ${firstLine}`
        : `gh exited ${String(status)} without explaining why`,
  };
}

/** Calls the GitHub API through gh so the request inherits whatever auth already exists. */
function ghApi(path, jqFilter = null) {
  const args = ["api", path];
  if (jqFilter !== null) args.push("--jq", jqFilter);
  const result = capture("gh", args);
  if (result.status !== 0 || result.error !== null) {
    return { ok: false, ...classifyGhFailure(result) };
  }
  const text = result.stdout.trim();
  if (jqFilter !== null) return { ok: true, text };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      reason: "gh-failed",
      message: "gh returned something that is not JSON",
    };
  }
}

/** Reads the commit the submodule is actually checked out at, falling back to the index. */
export function readPinnedCommit({ run = capture } = {}) {
  const inSubmodule = run("git", ["-C", vendorRoot, "rev-parse", "HEAD"]);
  const direct = inSubmodule.stdout.trim().split(/\s+/)[0] ?? "";
  if (inSubmodule.status === 0 && /^[0-9a-f]{40}$/i.test(direct)) {
    return { ok: true, commit: direct, source: "submodule-head" };
  }
  // A submodule that has never been initialised still has a commit recorded in the
  // parent tree, and that is the pin a reader of this repository cares about.
  const fromIndex = run("git", [
    "-C",
    repoRoot,
    "ls-tree",
    "HEAD",
    "vendor/BlueMap",
  ]);
  const match = /^\d+\s+commit\s+([0-9a-f]{40})/.exec(fromIndex.stdout.trim());
  if (fromIndex.status === 0 && match !== null) {
    return { ok: true, commit: match[1], source: "parent-index" };
  }
  return {
    ok: false,
    reason: "no-pin",
    message:
      "could not read the vendor/BlueMap pin from either the submodule or the parent tree",
  };
}

export function shortSha(commit) {
  return typeof commit === "string" ? commit.slice(0, 12) : "unknown";
}

/** Resolves a ref to the commit it ultimately names, peeling an annotated tag object. */
function resolveTagCommit(tag) {
  const ref = ghApi(
    `repos/${UPSTREAM_REPOSITORY}/git/ref/tags/${encodeURIComponent(tag)}`,
  );
  if (!ref.ok) return ref;
  const object = ref.data?.object ?? {};
  if (object.type === "commit" && typeof object.sha === "string") {
    return { ok: true, commit: object.sha };
  }
  if (object.type === "tag" && typeof object.sha === "string") {
    // An annotated tag is its own object, and the commit is one dereference away.
    // Reporting the tag object's sha here would print a sha that names nothing a
    // reader can check out.
    const peeled = ghApi(`repos/${UPSTREAM_REPOSITORY}/git/tags/${object.sha}`);
    if (!peeled.ok) return peeled;
    const commit = peeled.data?.object?.sha;
    if (typeof commit === "string") return { ok: true, commit };
  }
  return {
    ok: false,
    reason: "gh-failed",
    message: `could not resolve tag ${tag} to a commit`,
  };
}

/** Finds the target the pin should be compared against: newest release, or branch tip. */
function upstreamTarget(useBranch) {
  if (useBranch) {
    const repository = ghApi(`repos/${UPSTREAM_REPOSITORY}`);
    if (!repository.ok) return repository;
    const branch = repository.data?.default_branch;
    if (typeof branch !== "string") {
      return {
        ok: false,
        reason: "gh-failed",
        message: "upstream did not report a default branch",
      };
    }
    const head = ghApi(
      `repos/${UPSTREAM_REPOSITORY}/commits/${encodeURIComponent(branch)}`,
    );
    if (!head.ok) return head;
    const commit = head.data?.sha;
    if (typeof commit !== "string") {
      return {
        ok: false,
        reason: "gh-failed",
        message: `could not read the tip of ${branch}`,
      };
    }
    return { ok: true, ref: branch, kind: "branch", commit };
  }

  const latest = ghApi(`repos/${UPSTREAM_REPOSITORY}/releases/latest`);
  if (!latest.ok) {
    // A repository with no published release answers 404 here, which is a real and
    // reportable state rather than a transport failure, so it gets its own reason.
    if (latest.reason === "not-found") {
      return {
        ok: false,
        reason: "no-releases",
        message: `${UPSTREAM_REPOSITORY} has no published release to compare against`,
      };
    }
    return latest;
  }
  const tag = latest.data?.tag_name;
  if (typeof tag !== "string" || tag.length === 0) {
    return {
      ok: false,
      reason: "no-releases",
      message: `${UPSTREAM_REPOSITORY} has no published release to compare against`,
    };
  }
  const resolved = resolveTagCommit(tag);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    ref: tag,
    kind: "release",
    commit: resolved.commit,
    publishedAt:
      typeof latest.data?.published_at === "string"
        ? latest.data.published_at
        : null,
  };
}

/**
 * Turns GitHub's compare answer into this script's vocabulary.
 *
 * GitHub phrases the status from the head's point of view, so "ahead" there means the
 * upstream target is ahead of us, which is us being behind. Getting that backwards would
 * silently invert every report this script prints, so the translation is explicit.
 */
export function classifyComparison(status) {
  if (status === "identical") return "level";
  if (status === "ahead") return "behind";
  if (status === "behind") return "ahead";
  if (status === "diverged") return "diverged";
  return "unknown";
}

function compare(pinned, target) {
  const result = ghApi(
    `repos/${UPSTREAM_REPOSITORY}/compare/${pinned}...${target}`,
  );
  if (!result.ok) return result;
  const status = classifyComparison(result.data?.status);
  if (status === "unknown") {
    return {
      ok: false,
      reason: "gh-failed",
      message: "upstream comparison returned no usable status",
    };
  }
  return {
    ok: true,
    status,
    commitsBehind: Number(result.data?.ahead_by ?? 0),
    commitsAhead: Number(result.data?.behind_by ?? 0),
  };
}

/** Builds the whole report, so both the JSON and the sentence come from one place. */
function buildReport({ useBranch }) {
  const pin = readPinnedCommit();
  if (!pin.ok) {
    return { determined: false, reason: pin.reason, message: pin.message };
  }
  const target = upstreamTarget(useBranch);
  if (!target.ok) {
    return {
      determined: false,
      reason: target.reason,
      message: target.message,
      pinnedCommit: pin.commit,
    };
  }
  const comparison = compare(pin.commit, target.commit);
  if (!comparison.ok) {
    return {
      determined: false,
      reason: comparison.reason,
      message: comparison.message,
      pinnedCommit: pin.commit,
      upstreamRef: target.ref,
    };
  }
  return {
    determined: true,
    repository: UPSTREAM_REPOSITORY,
    comparedAgainst: target.kind,
    pinnedCommit: pin.commit,
    pinnedCommitSource: pin.source,
    upstreamRef: target.ref,
    upstreamCommit: target.commit,
    upstreamPublishedAt: target.publishedAt ?? null,
    status: comparison.status,
    commitsBehind: comparison.commitsBehind,
    commitsAhead: comparison.commitsAhead,
  };
}

/** One line, because this runs inside other people's build output. */
export function describeReport(report) {
  if (report.determined !== true) {
    return `unknown: ${report.message}`;
  }
  const pin = shortSha(report.pinnedCommit);
  const target = `${report.upstreamRef} (${shortSha(report.upstreamCommit)})`;
  if (report.status === "level") {
    return `level: vendored BlueMap ${pin} is exactly ${target}`;
  }
  if (report.status === "behind") {
    return `behind: vendored BlueMap ${pin} is ${report.commitsBehind} commits behind ${target}`;
  }
  if (report.status === "ahead") {
    return `ahead: vendored BlueMap ${pin} is ${report.commitsAhead} commits ahead of ${target}`;
  }
  return `diverged: vendored BlueMap ${pin} and ${target} have each moved separately`;
}

/**
 * Moves the submodule to the newer commit and stages nothing.
 *
 * Staging is deliberately left out. Advancing the pin changes which third-party source
 * this project compiles and ships, so it wants a person reading a diff and writing a
 * commit message, not a script that quietly prepared one on their behalf.
 */
function advance(report) {
  if (report.determined !== true) return { ok: false, message: report.message };
  if (report.status !== "behind") {
    return {
      ok: false,
      message: `nothing to advance to: the pin is ${report.status}`,
    };
  }
  const dirty = capture("git", ["-C", vendorRoot, "status", "--porcelain"]);
  if (dirty.status !== 0) {
    return {
      ok: false,
      message: "could not read the submodule status, so the pin was left alone",
    };
  }
  if (dirty.stdout.trim().length > 0) {
    return {
      ok: false,
      message:
        "vendor/BlueMap has uncommitted changes, so the pin was left alone",
    };
  }
  const fetched = capture("git", [
    "-C",
    vendorRoot,
    "fetch",
    "--tags",
    "origin",
  ]);
  if (fetched.status !== 0) {
    return {
      ok: false,
      message: `could not fetch upstream into the submodule: ${fetched.stderr.trim().split(/\r?\n/)[0] ?? ""}`,
    };
  }
  const checkout = capture("git", [
    "-C",
    vendorRoot,
    "checkout",
    "--detach",
    report.upstreamCommit,
  ]);
  if (checkout.status !== 0) {
    return {
      ok: false,
      message: `could not check out ${shortSha(report.upstreamCommit)} in the submodule`,
    };
  }
  return {
    ok: true,
    message:
      `vendor/BlueMap moved to ${report.upstreamRef} (${shortSha(report.upstreamCommit)}). ` +
      "Nothing was staged: review the change and commit it yourself.",
  };
}

/* -------------------------------------------------------------------------- */

function main(argv) {
  const args = new Set(argv);
  if (args.has("--help") || args.has("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  const asJson = args.has("--json");
  const report = buildReport({ useBranch: args.has("--branch") });

  let advanced = null;
  if (args.has("--advance")) advanced = advance(report);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(advanced === null ? report : { ...report, advanced }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(`${describeReport(report)}\n`);
    if (report.determined === true && report.status === "behind") {
      process.stdout.write(
        `  to advance: node scripts/check-bluemap-upstream.mjs --advance\n`,
      );
    }
    if (advanced !== null) {
      process.stdout.write(
        `  ${advanced.ok ? "advanced" : "not advanced"}: ${advanced.message}\n`,
      );
    }
  }

  if (report.determined !== true) return 1;
  if (advanced !== null && advanced.ok !== true) return 1;
  return 0;
}

// Only run when invoked directly, so the exported helpers stay importable from tests.
if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
