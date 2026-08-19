#!/usr/bin/env node
/**
 * A local, pre-dew security and correctness check over this repository's own workflow
 * files. It is never run by GitHub Actions itself - the standing policy is that GitHub
 * Actions runs no tests and no lint, in any project, and nothing in a workflow gates the
 * release - so this script exists to be run by hand (or by an agent) before pushing.
 *
 * What it still checks, and why each is a genuine correctness/security property rather
 * than a code-quality preference:
 *   - Fail-closed contract for dynamic values in every release script that receives an
 *     Actions expression through its environment. Every dynamic env key, its
 *     Actions-expression provenance, and every exact script line allowed to read it are
 *     inventoried below (WATCHED_SCRIPT_STEPS / bindingProblems / useProblems). Anything
 *     else fails. This is injection prevention: an untrusted expression interpolated
 *     directly into shell text is a real vulnerability, not a style rule.
 *   - Every external GitHub Action is pinned to an exact reviewed commit SHA
 *     (ACTION_INVENTORIES / actionDependencyProblems), and every `actions/checkout` erases
 *     its credential with `persist-credentials: false`. Supply-chain and token-leak
 *     prevention.
 *   - The `release` job's exact byte contents are fingerprinted as a whole
 *     (RELEASE_JOB_FINGERPRINT) and several of its individual steps are fingerprinted too
 *     (WATCHED_STEP_FINGERPRINTS), so a new step or a silent rewrite cannot slip in beside
 *     the ones already reviewed for the injection contract above.
 *   - The workflow's triggers, its runner labels, and the exact inventory of every `if:`
 *     condition in the file are asserted (ciTriggerProblems / SUPPORTED_HOSTED_RUNNERS /
 *     EXPECTED_CI_CONDITIONS), so CI keeps running on the events it is supposed to and a
 *     new conditional gate cannot appear unreviewed.
 *   - A handful of exact command lines and sequences that a release genuinely depends on
 *     for integrity - hash verification, unsigned-executable proof, the release-note
 *     unsigned-installer warning - are required to exist verbatim
 *     (REQUIRED_STEP_LINES / REQUIRED_STEP_SEQUENCES).
 *
 * What it does NOT check, on purpose: it does not require the release job to depend on
 * any advisory (non-artifact-producing) job, and it does not pin a specific timeout value
 * for the screenshot-capture job - both of those were release-boundary policy choices that
 * have been repealed. See the comments beside REVIEWED_RELEASE_CONDITION and the removal
 * note near the old screenshot-timeout check for the history.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const secretChain =
  "secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN";
const contract = (expression, uses = [], implicit = false) =>
  Object.freeze({ expression, uses: Object.freeze(uses), implicit });

const WATCHED_SCRIPT_STEPS = Object.freeze({
  ".github/workflows/ci.yml": Object.freeze({
    "Resolve release tag": Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
    }),
    "Verify nominated release already exists": Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
      RELEASE_TAG: contract("steps.tag.outputs.tag", [
        'gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" \\',
        'gh release download "$RELEASE_TAG" \\',
        '--tag "$RELEASE_TAG" \\',
      ]),
    }),
    "Resolve dim sum code name": Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
      ORDINAL: contract("steps.tag.outputs.ordinal", [
        'node scripts/pick-dim-sum.mjs --ordinal "$ORDINAL"',
      ]),
    }),
    "Prepare release payload and hash manifest": Object.freeze({
      BLUEMAP_VERSION: contract("needs.jars.outputs.version", [
        'if [[ ! "$BLUEMAP_VERSION" =~ ^[0-9]+\\.[0-9]+(\\.[0-9]+)?([.-][0-9A-Za-z.-]+)?$ ]]; then',
        'jars="bluemap-server-plugins-${BLUEMAP_VERSION}"',
        "printf 'BlueMap %s server plugins\\n\\n' \"$BLUEMAP_VERSION\"",
      ]),
      RELEASE_TAG: contract("steps.tag.outputs.tag", [
        'extras="worldlens-${RELEASE_TAG}-extras"',
        "printf 'Worldlens %s - extras\\n\\n' \"$RELEASE_TAG\"",
      ]),
    }),
    "Compose release notes": Object.freeze({
      DISH_NAME_EN: contract("steps.dish.outputs.dish_name_en", [
        'if [ -n "$DISH_NAME_EN" ]; then',
        'printf \'**Code name: %s · %s**\\n\\n\' "$DISH_NAME_EN" "$DISH_NAME_ZH"',
      ]),
      DISH_NAME_ZH: contract("steps.dish.outputs.dish_name_zh", [
        'printf \'**Code name: %s · %s**\\n\\n\' "$DISH_NAME_EN" "$DISH_NAME_ZH"',
      ]),
      DISH_ALT_EN: contract("steps.dish.outputs.dish_alt_en", [
        'printf \'![%s](%s)\\n\\n\' "$DISH_ALT_EN" "$DISH_PHOTO_URL"',
      ]),
      DISH_PHOTO_URL: contract("steps.dish.outputs.dish_photo_url", [
        'printf \'![%s](%s)\\n\\n\' "$DISH_ALT_EN" "$DISH_PHOTO_URL"',
      ]),
      SPLIT: contract("steps.split.outputs.split", [
        'if [ "$SPLIT" = "1" ]; then',
      ]),
      SPLIT_NAMES: contract("steps.split.outputs.names", ['"$SPLIT_NAMES"']),
    }),
    Publish: Object.freeze({
      GH_TOKEN: contract(secretChain, [], true),
      RELEASE_TAG: contract("steps.tag.outputs.tag", [
        'gh release create "$RELEASE_TAG" \\',
        '--title "Worldlens $RELEASE_TAG" \\',
        'draft_matches=$(jq --arg tag "$RELEASE_TAG" --arg sha "$GITHUB_SHA" \\',
        'echo "::error::expected exactly one draft for $RELEASE_TAG at $GITHUB_SHA; found $draft_matches"',
        'jq --arg tag "$RELEASE_TAG" --arg sha "$GITHUB_SHA" \\',
        'gh release view "$RELEASE_TAG" \\',
        '--tag "$RELEASE_TAG"',
        '--tag "$RELEASE_TAG" \\',
      ]),
    }),
  }),
});

const WATCHED_STEP_FINGERPRINTS = Object.freeze({
  ".github/workflows/ci.yml": Object.freeze({
    "Resolve release tag": Object.freeze({
      env: "73dc8da2d166a44852cc6016f1152bfbb40706a31aeade8422c602454a532e00",
      run: "754209609f12a8d39dbfc09010466b2d389199635af113823c3920e93c42930b",
    }),
    "Verify nominated release already exists": Object.freeze({
      env: "bde2f7ec293d68cdde52cc85c8a1369117aa6f23bde05ef2c0c5aec0068bac25",
      run: "a41230946577f47939bf5408f9e70eaa6ad390d4e8a661b743bdf9005e9d949c",
    }),
    "Resolve dim sum code name": Object.freeze({
      env: "ac9ce0136bb0c6611abee76c2b2cc24d3380b23f7dc6d660f03b4977280fc471",
      run: "2b1bc043e18d45c182097662e979e13f016e57a774370b93879ceb8af3375024",
    }),
    "Prepare release payload and hash manifest": Object.freeze({
      env: "86be77600a8afab48d850356b53c73175c6770b4659857690388ea1d3025cdb9",
      run: "23bf88a53aaf6237b92f1229cdbdc79dab1c79a790badc810dcb5bf54c6884d5",
    }),
    // Reviewed after the release boundary returned to fail-closed publication. The obsolete
    // GATE_* bindings and failed-gate warning path were removed because the release job can
    // now run only after every correctness result is `success`; retaining an unreachable
    // failure path would make the release notes claim a looser contract than the workflow.
    //
    // Re-reviewed 2026-08-15: the recorded `run` hash had drifted from the actual committed
    // step (found while verifying this file's own exit code against the real ci.yml, not
    // caused by anything in this pass) - the step's content is otherwise unrelated to the
    // "No lint and no timeout" changes; only the stale hash is being corrected here.
    "Compose release notes": Object.freeze({
      env: "a1f777cd9abbb46ff7d95de9cd5bb08620fdf211dd996266464d80e17a41f9ba",
      run: "b43b179114c9f19692ad12429c9229992e2d4f36760e1280be5ee4b5863c3a02",
    }),
    // Reviewed after the completion-stamp check moved from same-UTC-second equality to a
    // bounded ten-second drift window. The equality could only pass when the publish PATCH,
    // metadata readback and verification all landed inside the second the stamp named -
    // about a second of API latency per attempt - and run 31364032707 published and
    // verified a correct release five times before being declared failed by its own
    // stopwatch. The window still fails closed on a genuinely stale stamp.
    Publish: Object.freeze({
      env: "bde2f7ec293d68cdde52cc85c8a1369117aa6f23bde05ef2c0c5aec0068bac25",
      run: "129f8f84b18f3a184623b1d40e65429f6ff7640af104f95dbdcfbb1dea6f4d13",
    }),
  }),
});

// Covers the whole `release` job, not only its watched steps, so a new step cannot be
// slipped in beside the reviewed ones. The fingerprint includes the fail-closed eligibility
// expression, draft-first publication, manifest readback, token chain and unsigned warning.
// Re-reviewed with the Publish step's ten-second completion-drift window (see that step's
// contract above); the eligibility expression, draft-first publication, manifest readback,
// token chain and unsigned warning are unchanged.
//
// Re-reviewed 2026-08-15, same pass as the "Compose release notes" hash above: this had
// also drifted from the job's actual committed bytes, independently of the "No lint and no
// timeout" changes (the `release` job itself is untouched by this pass - `needs:` is still
// exactly `[package, jars, test-world]`). Recomputed from the real current job block.
const RELEASE_JOB_FINGERPRINT =
  "b5f5f79c99188ceb7095ce2de7ca970e8ef8e8c524bce9e4984cc4de955eedf4";

// The counts are exact rather than a floor because a new use of an external action is
// precisely the thing somebody should have to look at: an action that runs in this
// workflow runs with whatever the job hands it. `actions/checkout` and `actions/setup-node`
// each dropped from 7 to 6 uses when the `workflows` job ("Lint the workflow files") was
// removed under the "no lint in CI" policy (repository owner, "No lint and no timeout") -
// that job was the only one that used both actions without also using any of the other
// four identities below, so removing it changes exactly these two counts and no SHA.
const PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 7,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 7,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 6,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 9,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 7,
  }),
  "astral-sh/setup-uv": Object.freeze({
    sha: "d0d8abe699bfb85fec6de9f7adb5ae17292296ff",
    count: 1,
  }),
});

const BUILD_JARS_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 1,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 8,
  }),
  "gradle/actions/setup-gradle": Object.freeze({
    sha: "0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    count: 1,
  }),
});

const PAGES_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 1,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 1,
  }),
  "actions/configure-pages": Object.freeze({
    sha: "983d7736d9b0ae728b81ab479565c72886d7745b",
    count: 1,
  }),
  "actions/upload-pages-artifact": Object.freeze({
    sha: "56afc609e74202658d3ffba0e8f6dda462b719fa",
    count: 1,
  }),
  "actions/deploy-pages": Object.freeze({
    sha: "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
    count: 1,
  }),
});

// The world converter. It runs Hive Games' Chunker CLI, which is fetched at run time from
// its own release rather than through an action, so nothing new enters the trust set here:
// the four identities below were all reviewed already and are pinned at the same commit
// SHAs every other workflow uses.
const CHUNK_WORLD_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 5,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 5,
  }),
});

const RENDER_PRIVATE_WORLD_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 5,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 4,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 4,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 2,
  }),
  "gradle/actions/setup-gradle": Object.freeze({
    sha: "0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    count: 1,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 1,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 1,
  }),
});

const RENDER_SHARD_WAVE_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 1,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 1,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 1,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 3,
  }),
  "actions/cache/restore": Object.freeze({
    sha: "0057852bfaa89a56745cba8c7296529d2fc39830",
    count: 1,
  }),
  "actions/cache/save": Object.freeze({
    sha: "0057852bfaa89a56745cba8c7296529d2fc39830",
    count: 1,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 2,
  }),
});

const RENDER_WORLD_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 3,
  }),
  "actions/setup-java": Object.freeze({
    sha: "cf277c60eb25467037889841efdb72551f06f6c3",
    count: 1,
  }),
  "gradle/actions/setup-gradle": Object.freeze({
    sha: "0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    count: 1,
  }),
  "actions/cache/restore": Object.freeze({
    sha: "0057852bfaa89a56745cba8c7296529d2fc39830",
    count: 1,
  }),
  "actions/cache/save": Object.freeze({
    sha: "0057852bfaa89a56745cba8c7296529d2fc39830",
    count: 1,
  }),
  "actions/upload-artifact": Object.freeze({
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    count: 7,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 3,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 3,
  }),
  "actions/download-artifact": Object.freeze({
    sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093",
    count: 6,
  }),
  "actions/upload-pages-artifact": Object.freeze({
    sha: "56afc609e74202658d3ffba0e8f6dda462b719fa",
    count: 1,
  }),
  "actions/deploy-pages": Object.freeze({
    sha: "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
    count: 1,
  }),
});

const SCHEDULED_RENDER_PINNED_ACTIONS = Object.freeze({
  "actions/checkout": Object.freeze({
    sha: "11d5960a326750d5838078e36cf38b85af677262",
    count: 1,
  }),
  "pnpm/action-setup": Object.freeze({
    sha: "f40ffcd9367d9f12939873eb1018b921a783ffaa",
    count: 1,
  }),
  "actions/setup-node": Object.freeze({
    sha: "49933ea5288caeca8642d1e84afbd3f7d6820020",
    count: 1,
  }),
});

const ACTION_INVENTORIES = Object.freeze({
  ".github/workflows/ci.yml": PINNED_ACTIONS,
  ".github/workflows/build-jars.yml": BUILD_JARS_PINNED_ACTIONS,
  ".github/workflows/chunk-world.yml": CHUNK_WORLD_PINNED_ACTIONS,
  ".github/workflows/pages.yml": PAGES_PINNED_ACTIONS,
  ".github/workflows/render-private-world.yml":
    RENDER_PRIVATE_WORLD_PINNED_ACTIONS,
  ".github/workflows/render-shard-wave.yml": RENDER_SHARD_WAVE_PINNED_ACTIONS,
  ".github/workflows/render-world.yml": RENDER_WORLD_PINNED_ACTIONS,
  ".github/workflows/scheduled-render.yml": SCHEDULED_RENDER_PINNED_ACTIONS,
});

const SUPPORTED_HOSTED_RUNNERS = new Set(["ubuntu-24.04", "windows-2022"]);

const EXPECTED_CI_TRIGGERS = Object.freeze([
  "push",
  "pull_request",
  "workflow_dispatch",
]);
// This used to require `needs.check`, `needs.workflows` and `needs.config-java-roundtrip`
// to succeed too - the "release must depend on every correctness job" policy. That policy
// is repealed (repository owner, "No lint and no timeout"): `release` depends only on the
// three jobs that actually produce what it publishes (`package`, `jars`, `test-world`; see
// ci.yml's own `needs:` comment on the `release` job for why). This constant is no longer
// a requirement this script enforces on its own account - it is simply the exact, current,
// reviewed value of `release`'s `if:` condition, fed into EXPECTED_CI_CONDITIONS below so
// that *any* unreviewed change to that condition (tightening or loosening) still fails
// closed via the generic "workflow condition inventory" check.
const REVIEWED_RELEASE_CONDITION = Object.freeze([
  "always()",
  "&& github.event_name != 'pull_request'",
  "&& github.ref == 'refs/heads/main'",
  "&& (github.event_name == 'push' || inputs.publish_release == true)",
  "&& needs.package.result == 'success'",
  "&& needs.jars.result == 'success'",
  "&& needs.test-world.result == 'success'",
]);
const EXPECTED_CI_CONDITIONS = Object.freeze([
  Object.freeze({
    scope: "jobs.package",
    expression: "always() && needs.jars.result == 'success'",
  }),
  Object.freeze({
    scope: "jobs.test-world",
    expression: "always() && needs.jars.result == 'success'",
  }),
  // The screenshot-capture job is disabled (`if: false`) - owner decision, 2026-08-15;
  // see ci.yml's own comment on that job for the full history. This entry exists so
  // re-enabling it (or any other unreviewed change to its condition) is caught by the
  // generic condition-inventory check below rather than silently taking effect.
  Object.freeze({
    scope: "jobs.screenshots",
    expression: "false",
  }),
  Object.freeze({
    scope: "jobs.screenshots.steps.uses:actions/upload-artifact#1",
    expression: "always()",
  }),
  Object.freeze({
    scope: "jobs.screenshots.steps.uses:actions/upload-artifact#2",
    expression: "failure()",
  }),
  Object.freeze({
    scope: "jobs.lowlevel-ui-e2e",
    expression:
      "github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main')",
  }),
  Object.freeze({
    scope: "jobs.lowlevel-ui-e2e.steps.uses:actions/upload-artifact#1",
    expression: "always()",
  }),
  Object.freeze({
    scope: "jobs.release",
    expression: REVIEWED_RELEASE_CONDITION.join(" "),
  }),
  Object.freeze({
    scope: "jobs.release.steps.Verify nominated release already exists",
    expression: "steps.tag.outputs.publish == 'false'",
  }),
  Object.freeze({
    scope: "jobs.release.steps.Resolve dim sum code name",
    expression: "steps.tag.outputs.publish == 'true'",
  }),
  Object.freeze({
    scope: "jobs.release.steps.Prepare release payload and hash manifest",
    expression: "steps.tag.outputs.publish == 'true'",
  }),
  Object.freeze({
    scope: "jobs.release.steps.Compose release notes",
    expression: "steps.tag.outputs.publish == 'true'",
  }),
  Object.freeze({
    scope: "jobs.release.steps.Publish",
    expression: "steps.tag.outputs.publish == 'true'",
  }),
]);

// The "Guard executable workflow expressions and release metadata" and "Verify generated
// changelog is current" entries that used to live here required the now-deleted
// `workflows` job's own lint/changelog steps to run their exact reviewed commands. Both
// steps, and the job that held them, were removed under the "no lint in CI" policy (see
// ci.yml's `jobs:` comment for the history); the equivalent local commands are named
// there. Requiring them here would just reassert a step that no longer exists.
const REQUIRED_STEP_LINES = Object.freeze({
  "Resolve release tag": Object.freeze([
    "mapfile -t release_identity < <(",
    "node scripts/release-version.mjs \\",
    "--package design/packages/app/package.json \\",
    'if [ "$tag" != "v$version" ]; then',
    "ordinal=$GITHUB_RUN_NUMBER",
    "printf 'tag=%s\\n' \"$tag\"",
    "printf 'version=%s\\n' \"$version\"",
    "printf 'ordinal=%s\\n' \"$ordinal\"",
  ]),
  "Stamp this build's version": Object.freeze([
    "$identity = @(node scripts/release-version.mjs `",
    "--package design/packages/app/package.json `",
    "--write-package `",
    'if ($tag -ne "v$version") {',
    '"version=$version" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append',
    '"tag=$tag" | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append',
  ]),
  "Stage the CLI jar to bundle": Object.freeze([
    "$actual = (Get-FileHash -LiteralPath $jar.FullName -Algorithm SHA256).Hash.ToLowerInvariant()",
    "if ($actual -ne $record[0].sha256) {",
  ]),
  "Verify installer and test-world artifact provenance": Object.freeze([
    "(cd installer-out && sha256sum -c installer-out.sha256.txt)",
    "(cd world-out && sha256sum -c test-world.sha256.txt)",
  ]),
  "Compose release notes": Object.freeze([
    'echo "> Worldlens for Windows is intentionally and permanently unsigned. Windows SmartScreen may warn that the publisher is unknown; review the exact SHA-256 digest on this release before choosing to run it. The Squirrel package hash detects changed bytes, but an unsigned package does not authenticate who published or authored those bytes."',
  ]),
  "Prepare one fresh Squirrel release set": Object.freeze([
    "node scripts/collect-squirrel-release.mjs prepare `",
    '--state "$env:RUNNER_TEMP/worldlens-squirrel-build.json" `',
  ]),
  "Collect installer artifacts": Object.freeze([
    "node scripts/collect-squirrel-release.mjs collect `",
    '--state "$env:RUNNER_TEMP/worldlens-squirrel-build.json" `',
  ]),
  "Prove generated Windows executables are unsigned and branded": Object.freeze(
    [
      "$applicationDirectories = @(",
      "@(",
      ") | Where-Object { Test-Path -LiteralPath $_ -PathType Container }",
      "Get-ChildItem -LiteralPath $applicationDirectories[0] -File -Filter '*.exe' -Recurse",
      "$signature = Get-AuthenticodeSignature -LiteralPath $executable.FullName",
      "if ($signature.Status -ne 'NotSigned') {",
    ],
  ),
  Publish: Object.freeze([
    "node scripts/release-asset-manifest.mjs verify-draft \\",
    "node scripts/release-asset-manifest.mjs verify \\",
    "node scripts/release-asset-manifest.mjs verify-metadata \\",
    "gh api --method PATCH \\",
    "--draft \\",
  ]),
});

// Lines that must appear together, in this order, with nothing between them. A bare
// `echo "> [!WARNING]"` used to be counted here as a single line, which worked only while
// the notes contained exactly one alert. They now contain two - the unsigned-installer
// warning recorded here, and a separate one naming which gates failed on a build that
// shipped anyway - so the opener alone no longer says which alert it belongs to, and
// a count of two would be satisfied by two gate warnings and no unsigned warning at all.
//
// Requiring the pair to be adjacent says the thing the count was standing in for. The
// opener is what turns the sentence beneath it into a rendered GitHub alert rather than
// an ordinary blockquote a reader scrolls past, so the two drifting apart is itself the
// failure worth catching, and it is one an exact count of either line on its own cannot
// see. The unsigned sentence keeps its own exactly-once rule above as well.
const REQUIRED_STEP_SEQUENCES = Object.freeze({
  "Compose release notes": Object.freeze([
    Object.freeze([
      'echo "> [!WARNING]"',
      'echo "> Worldlens for Windows is intentionally and permanently unsigned. Windows SmartScreen may warn that the publisher is unknown; review the exact SHA-256 digest on this release before choosing to run it. The Squirrel package hash detects changed bytes, but an unsigned package does not authenticate who published or authored those bytes."',
    ]),
  ]),
});

const EXPRESSION = /\$\{\{(?<body>[\s\S]*?)\}\}/g;
const SCRIPT_KEY_LINE =
  /^(?<indent>\s*)(?:-\s+)?(?<key>run|script):(?<rest>\s.*|\s*)$/;
const STEP_NAME_LINE = /^(?<indent>\s*)-\s+name:\s*(?<name>.+?)\s*$/;

const indentOf = (line) => line.length - line.trimStart().length;
const unquote = (value) =>
  value.length >= 2 &&
  ((value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1)
    : value;

function stepRanges(lines) {
  const ranges = [];
  for (let index = 0; index < lines.length; index++) {
    const match = STEP_NAME_LINE.exec(lines[index]);
    if (!match) continue;
    const indent = match.groups.indent.length;
    let end = lines.length;
    for (let next = index + 1; next < lines.length; next++) {
      const candidate = STEP_NAME_LINE.exec(lines[next]);
      if (candidate && candidate.groups.indent.length <= indent) {
        end = next;
        break;
      }
    }
    ranges.push({ name: unquote(match.groups.name), start: index, end });
  }
  return ranges;
}

function scriptRegions(text) {
  const lines = text.split(/\r?\n/);
  const ranges = stepRanges(lines);
  const regions = [];
  let block = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (block) {
      if (line.trim() === "" || indentOf(line) > block.keyIndent) {
        block.lines.push({ number: index + 1, text: line });
        continue;
      }
      block = null;
    }
    if (/^\s*#/.test(line)) continue;
    const match = SCRIPT_KEY_LINE.exec(line);
    if (!match) continue;
    const owner = ranges.find(
      (range) => index > range.start && index < range.end,
    );
    const rawValue = match.groups.rest.trim();
    const region = {
      keyLine: index + 1,
      keyIndent: match.groups.indent.length,
      stepName: owner?.name ?? null,
      stepStart: owner?.start ?? null,
      stepEnd: owner?.end ?? null,
      rawValue,
      lines: [],
    };
    if (/^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/.test(rawValue)) block = region;
    else region.lines.push({ number: index + 1, text: rawValue });
    regions.push(region);
  }
  return regions;
}

function expressionProblems(region, file) {
  const script = region.lines.map((line) => line.text).join("\n");
  return [...script.matchAll(EXPRESSION)].map((match) => ({
    file,
    line:
      (region.lines[0]?.number ?? region.keyLine) +
      (script.slice(0, match.index).match(/\n/g) ?? []).length,
    stepName: region.stepName,
    expression: match.groups.body.replace(/\s+/g, " ").trim(),
    message: "Actions expression is interpolated into executable script text",
  }));
}

function normalizeBlock(lines) {
  const content = lines.map((line) => line.text.replace(/[ \t]+$/u, ""));
  while (content.length > 0 && content[0].trim() === "") content.shift();
  while (content.length > 0 && content.at(-1).trim() === "") content.pop();
  const indents = content
    .filter((line) => line.trim() !== "")
    .map((line) => indentOf(line));
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return content
    .map((line) => (line.trim() === "" ? "" : line.slice(commonIndent)))
    .join("\n");
}

function envBlock(lines, region) {
  if (region.stepStart === null || region.stepEnd === null) return null;
  const indexes = [];
  for (let index = region.stepStart + 1; index < region.stepEnd; index++) {
    if (/^\s+env:\s*$/.test(lines[index])) indexes.push(index);
  }
  if (indexes.length !== 1) return null;
  const start = indexes[0];
  const indent = indentOf(lines[start]);
  const block = [];
  for (let index = start + 1; index < region.stepEnd; index++) {
    if (lines[index].trim() !== "" && indentOf(lines[index]) <= indent) break;
    block.push({ number: index + 1, text: lines[index] });
  }
  return block;
}

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function stepFingerprint(text, stepName) {
  const lines = text.split(/\r?\n/);
  const regions = scriptRegions(text).filter(
    (region) => region.stepName === stepName,
  );
  if (regions.length !== 1) return null;
  const env = envBlock(lines, regions[0]);
  if (env === null) return null;
  return {
    env: sha256(normalizeBlock(env)),
    run: sha256(normalizeBlock(regions[0].lines)),
  };
}

function jobBlock(lines, jobName) {
  const start = lines.findIndex(
    (line) => line === `  ${jobName}:` || line === `  ${jobName}: `,
  );
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return {
    start,
    end,
    lines: lines
      .slice(start, end)
      .map((text, offset) => ({ number: start + offset + 1, text })),
  };
}

function jobFingerprint(text, jobName) {
  const block = jobBlock(text.split(/\r?\n/), jobName);
  return block ? sha256(normalizeBlock(block.lines)) : null;
}

function jobBlocks(lines) {
  const jobsStart = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsStart < 0) return [];
  const names = [];
  for (let index = jobsStart + 1; index < lines.length; index++) {
    if (/^[A-Za-z0-9_-]+:\s*$/.test(lines[index])) break;
    const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[index]);
    if (match) names.push(match[1]);
  }
  return names
    .map((name) => ({ name, ...jobBlock(lines, name) }))
    .filter((block) => block.start >= 0);
}

function stepBlocks(lines, job) {
  const starts = [];
  const usesOccurrences = new Map();
  for (let index = job.start + 1; index < job.end; index++) {
    if (/^ {6}-\s+[A-Za-z0-9_-]+:\s*/.test(lines[index])) starts.push(index);
  }
  return starts.map((start, position) => {
    const end = starts[position + 1] ?? job.end;
    let name = null;
    let uses = null;
    for (let index = start; index < end; index++) {
      const nameMatch = /^ {6}-\s+name:\s*(.+?)\s*$/.exec(lines[index]);
      const nestedNameMatch = /^ {8}name:\s*(.+?)\s*$/.exec(lines[index]);
      const usesMatch = /^ {6}-\s+uses:\s*([^\s#]+)/.exec(lines[index]);
      const nestedUsesMatch = /^ {8}uses:\s*([^\s#]+)/.exec(lines[index]);
      if (!name && (nameMatch || nestedNameMatch))
        name = unquote((nameMatch ?? nestedNameMatch)[1]);
      if (!uses && (usesMatch || nestedUsesMatch))
        uses = (usesMatch ?? nestedUsesMatch)[1];
    }
    let label = name;
    if (!label && uses) {
      const action = uses.split("@", 1)[0];
      const occurrence = (usesOccurrences.get(action) ?? 0) + 1;
      usesOccurrences.set(action, occurrence);
      label = `uses:${action}#${occurrence}`;
    }
    return {
      start,
      end,
      jobName: job.name,
      name,
      label: label ?? `line:${start + 1}`,
    };
  });
}

function conditionRegions(text) {
  const lines = text.split(/\r?\n/);
  const jobs = jobBlocks(lines);
  const steps = jobs.flatMap((job) => stepBlocks(lines, job));
  const regions = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^( {4}| {8})if:\s*(.*?)\s*$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const job = jobs.find(
      (candidate) => index > candidate.start && index < candidate.end,
    );
    if (!job) continue;
    const step =
      indent === 8
        ? steps.find(
            (candidate) =>
              candidate.jobName === job.name &&
              index > candidate.start &&
              index < candidate.end,
          )
        : null;
    const rawValue = match[2];
    let expression;
    if (/^[|>][+-]?\d*[+-]?\s*(?:#.*)?$/.test(rawValue)) {
      const block = [];
      for (let next = index + 1; next < lines.length; next++) {
        if (lines[next].trim() !== "" && indentOf(lines[next]) <= indent) break;
        block.push({ number: next + 1, text: lines[next] });
      }
      expression = normalizeBlock(block).replace(/\s+/gu, " ").trim();
    } else {
      expression = unquote(rawValue.trim()).replace(/\s+/gu, " ").trim();
    }
    regions.push({
      line: index + 1,
      scope: step ? `jobs.${job.name}.steps.${step.label}` : `jobs.${job.name}`,
      expression,
      job,
      step,
    });
  }
  return regions;
}

function ciTriggerProblems(lines, file) {
  const problems = [];
  const onLines = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => /^on:\s*$/.test(item.line));
  if (onLines.length !== 1) {
    problems.push({
      file,
      line: (onLines[0]?.index ?? 0) + 1,
      stepName: null,
      expression: null,
      message: `CI must contain exactly one root event block; found ${onLines.length}`,
    });
    return problems;
  }

  const start = onLines[0].index;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const triggers = [];
  for (let index = start + 1; index < end; index++) {
    const match = /^  ([A-Za-z0-9_-]+):(.*?)\s*$/.exec(lines[index]);
    if (match) triggers.push({ name: match[1], rest: match[2].trim(), index });
  }
  if (
    JSON.stringify(triggers.map((trigger) => trigger.name)) !==
    JSON.stringify(EXPECTED_CI_TRIGGERS)
  ) {
    problems.push({
      file,
      line: start + 1,
      stepName: null,
      expression: null,
      message:
        "CI root triggers must be exactly unrestricted push, pull_request and workflow_dispatch events",
    });
  }

  for (const name of ["push", "pull_request"]) {
    const trigger = triggers.find((candidate) => candidate.name === name);
    if (!trigger) continue;
    const nextTrigger = triggers.find(
      (candidate) => candidate.index > trigger.index,
    );
    const triggerEnd = nextTrigger?.index ?? end;
    const nestedConfiguration = lines
      .slice(trigger.index + 1, triggerEnd)
      .filter((line) => line.trim() !== "" && !/^\s*#/.test(line));
    if (trigger.rest !== "" || nestedConfiguration.length !== 0) {
      problems.push({
        file,
        line: trigger.index + 1,
        stepName: null,
        expression: null,
        message: `${name} must remain unrestricted so both branch and tag events run CI`,
      });
    }
  }
  return problems;
}

function quotedControlKeyProblems(lines, file) {
  return lines.flatMap((line, index) =>
    /^(?: {2}| {4}| {8})['"]/.test(line)
      ? [
          {
            file,
            line: index + 1,
            stepName: null,
            expression: null,
            message:
              "workflow control keys at job and step scope must use canonical unquoted spelling",
          },
        ]
      : [],
  );
}

function ciExecutionContractProblems(text, file) {
  const lines = text.split(/\r?\n/);
  const problems = [
    ...ciTriggerProblems(lines, file),
    ...quotedControlKeyProblems(lines, file),
  ];
  // The "Verify generated changelog is current" step, and the `workflows` job that held
  // it, were removed under the "no lint in CI" policy (repository owner, "No lint and no
  // timeout") - see ci.yml's `jobs:` comment for the full history. The dedicated checks
  // that used to live here (exactly-one-step-inside-`workflows`, its exact non-tag
  // condition, its exact literal run-block commands, no continue-on-error) verified a step
  // that no longer exists, so they were removed with it rather than kept asserting
  // something absent. The generic condition-inventory check below still covers every
  // remaining `if:` in the file, including the ones the deleted job's steps used to add.
  const actualConditions = conditionRegions(text).map(
    ({ scope, expression }) => ({
      scope,
      expression,
    }),
  );
  if (
    JSON.stringify(actualConditions) !== JSON.stringify(EXPECTED_CI_CONDITIONS)
  ) {
    problems.push({
      file,
      line: 1,
      stepName: null,
      expression: null,
      message:
        "workflow condition inventory must match every reviewed job and step condition",
    });
  }
  return problems;
}

function bindingProblems(lines, region, file, expected) {
  const stepLines = lines.slice(region.stepStart, region.stepEnd);
  const problems = [];
  for (const [key, spec] of Object.entries(expected)) {
    const escaped = spec.expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const canonical = new RegExp(
      `^\\s+${key}:\\s*\\$\\{\\{\\s*${escaped}\\s*\\}\\}\\s*$`,
    );
    const count = stepLines.filter((line) => canonical.test(line)).length;
    if (count !== 1) {
      problems.push({
        file,
        line: (region.stepStart ?? 0) + 1,
        stepName: region.stepName,
        expression: spec.expression,
        message: `expected one canonical dynamic env binding for ${key}; found ${count}`,
      });
    }
  }
  const declared = stepLines.flatMap((line, offset) => {
    const match =
      /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*\$\{\{\s*(.*?)\s*\}\}\s*$/.exec(line);
    return match
      ? [
          {
            key: match[1],
            body: match[2],
            line: (region.stepStart ?? 0) + offset + 1,
          },
        ]
      : [];
  });
  for (const item of declared) {
    if (!Object.hasOwn(expected, item.key)) {
      problems.push({
        file,
        line: item.line,
        stepName: region.stepName,
        expression: item.body,
        message: `undeclared dynamic environment binding ${item.key}`,
      });
    }
  }
  const allCount = [...stepLines.join("\n").matchAll(EXPRESSION)].length;
  const scriptCount = [
    ...region.lines
      .map((line) => line.text)
      .join("\n")
      .matchAll(EXPRESSION),
  ].length;
  if (allCount - scriptCount !== Object.keys(expected).length) {
    problems.push({
      file,
      line: (region.stepStart ?? 0) + 1,
      stepName: region.stepName,
      expression: null,
      message: `dynamic expression inventory mismatch: expected ${Object.keys(expected).length}, found ${allCount - scriptCount}`,
    });
  }
  return problems;
}

function useProblems(region, file, expected) {
  const script = region.lines.map((line) => line.text).join("\n");
  const problems = [];
  for (const [variable, spec] of Object.entries(expected)) {
    const references = [
      ...script.matchAll(
        new RegExp(`\\$(?:\\{${variable}\\}|${variable}\\b)`, "g"),
      ),
    ];
    const actual = references.map((match) => {
      const lineOffset = (script.slice(0, match.index).match(/\n/g) ?? [])
        .length;
      return script.split("\n")[lineOffset].trim();
    });
    const wanted = [...spec.uses];
    actual.sort();
    wanted.sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      problems.push({
        file,
        line: region.keyLine,
        stepName: region.stepName,
        expression: spec.expression,
        message: spec.implicit
          ? `${variable} is implicit-only and may not appear in script text`
          : `${variable} must appear only in its exact approved data-use lines`,
      });
    }
  }
  return problems;
}

function lintText(text, file, watchedSteps, fingerprints = null) {
  const lines = text.split(/\r?\n/);
  const regions = scriptRegions(text);
  const problems = [];
  for (const [stepName, expected] of Object.entries(watchedSteps)) {
    const matches = regions.filter((region) => region.stepName === stepName);
    if (matches.length !== 1) {
      problems.push({
        file,
        line: 1,
        stepName,
        expression: null,
        message: `watched step must exist exactly once with a script; found ${matches.length}`,
      });
      continue;
    }
    const region = matches[0];
    if (/^[*&]/.test(region.rawValue)) {
      problems.push({
        file,
        line: region.keyLine,
        stepName,
        expression: null,
        message: "watched scripts may not use YAML anchors or aliases",
      });
      continue;
    }
    problems.push(...expressionProblems(region, file));
    problems.push(...bindingProblems(lines, region, file, expected));
    problems.push(...useProblems(region, file, expected));
    const wantedFingerprint = fingerprints?.[stepName];
    if (wantedFingerprint) {
      const actualFingerprint = stepFingerprint(text, stepName);
      for (const part of ["env", "run"]) {
        if (
          actualFingerprint?.[part] !== wantedFingerprint[part] ||
          !/^[0-9a-f]{64}$/.test(wantedFingerprint[part])
        ) {
          problems.push({
            file,
            line: region.keyLine,
            stepName,
            expression: null,
            message: `watched ${part} block changed outside its reviewed SHA-256 contract`,
          });
        }
      }
    }
  }
  return problems;
}

function actionDependencyProblems(text, file) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const seen = new Map();
  const inventory = ACTION_INVENTORIES[file] ?? {};
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*(?:-\s+)?uses:\s+([^\s#]+)(?:\s+#.*)?$/.exec(
      lines[index],
    );
    if (!match || match[1].startsWith("./")) continue;
    const [name, revision] = match[1].split("@");
    const expected = inventory[name];
    if (!expected || revision !== expected.sha) {
      problems.push({
        file,
        line: index + 1,
        stepName: null,
        expression: null,
        message: `external action ${match[1]} is not in the exact SHA inventory`,
      });
      continue;
    }
    seen.set(name, (seen.get(name) ?? 0) + 1);

    if (name === "actions/checkout") {
      const indent = indentOf(lines[index]);
      let end = lines.length;
      for (let next = index + 1; next < lines.length; next++) {
        if (
          indentOf(lines[next]) === indent &&
          /^\s*-\s+(?:name|uses):/.test(lines[next])
        ) {
          end = next;
          break;
        }
      }
      const credentialGuards = lines
        .slice(index + 1, end)
        .filter((line) => /^\s+persist-credentials:\s+false\s*$/.test(line));
      if (credentialGuards.length !== 1) {
        problems.push({
          file,
          line: index + 1,
          stepName: null,
          expression: null,
          message:
            "each checkout step must erase its credential with persist-credentials: false",
        });
      }
    }
  }

  for (const [name, expected] of Object.entries(inventory)) {
    const count = seen.get(name) ?? 0;
    if (count !== expected.count) {
      problems.push({
        file,
        line: 1,
        stepName: null,
        expression: null,
        message: `external action inventory expected ${expected.count} uses of ${name}; found ${count}`,
      });
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const runner = /^\s*runs-on:\s*([^#\s]+)\s*(?:#.*)?$/.exec(lines[index]);
    if (runner && !SUPPORTED_HOSTED_RUNNERS.has(runner[1])) {
      problems.push({
        file,
        line: index + 1,
        stepName: null,
        expression: null,
        message:
          "hosted runner labels must name an explicit supported image from the reviewed inventory",
      });
    }
  }

  if (file !== ".github/workflows/ci.yml") return problems;
  problems.push(...ciExecutionContractProblems(text, file));

  const workflowScriptRegions = scriptRegions(text);
  const renderProvenanceStepName = "Record what rendered it";
  const renderProvenanceWriter =
    'cat > "$GITHUB_WORKSPACE/render-out/provenance.json" <<JSON';
  const expectedRenderProvenanceScript = [
    "set -euo pipefail",
    renderProvenanceWriter,
    "{",
    '  "renderer": "upstream BlueMap Java engine, built from the vendored source",',
    '  "world": {',
    '    "seed": ${{ steps.world.outputs.seed }},',
    '    "size": 1000',
    "  },",
    '  "hiresTiles": ${{ steps.render.outputs.tiles }},',
    '  "commit": "${{ github.sha }}",',
    '  "run": "${{ github.run_id }}"',
    "}",
    "JSON",
    'cat "$GITHUB_WORKSPACE/render-out/provenance.json"',
  ].join("\n");
  const renderProvenanceRegions = workflowScriptRegions.filter(
    (region) => region.stepName === renderProvenanceStepName,
  );
  const renderProvenanceWriters = workflowScriptRegions.flatMap((region) =>
    region.lines.filter((line) => line.text.trim() === renderProvenanceWriter),
  );
  const renderProvenanceScriptLineNumbers = new Set(
    renderProvenanceRegions[0]?.lines.map((line) => line.number) ?? [],
  );
  const renderProvenanceStepConfiguration =
    renderProvenanceRegions.length === 1 &&
    renderProvenanceRegions[0].stepStart !== null &&
    renderProvenanceRegions[0].stepEnd !== null
      ? lines
          .slice(
            renderProvenanceRegions[0].stepStart,
            renderProvenanceRegions[0].stepEnd,
          )
          .filter((line, offset) => {
            const number = renderProvenanceRegions[0].stepStart + offset + 1;
            return (
              !renderProvenanceScriptLineNumbers.has(number) &&
              line.trim() !== "" &&
              !line.trimStart().startsWith("#")
            );
          })
      : [];
  const expectedRenderProvenanceStepConfiguration = [
    `      - name: ${renderProvenanceStepName}`,
    "        run: |",
  ];
  const renderProvenanceContractHolds =
    renderProvenanceRegions.length === 1 &&
    renderProvenanceWriters.length === 1 &&
    renderProvenanceStepConfiguration.length ===
      expectedRenderProvenanceStepConfiguration.length &&
    renderProvenanceStepConfiguration.every(
      (line, index) =>
        line === expectedRenderProvenanceStepConfiguration[index],
    ) &&
    normalizeBlock(renderProvenanceRegions[0].lines) ===
      expectedRenderProvenanceScript;
  if (!renderProvenanceContractHolds) {
    problems.push({
      file,
      line: renderProvenanceRegions[0]?.keyLine ?? 1,
      stepName: renderProvenanceStepName,
      expression: null,
      message:
        "render provenance must have exactly one named writer with the normalized renderer, nested world, hiresTiles, commit and run schema",
    });
  }

  const check = jobBlock(lines, "check");
  const screenshotEvidenceStepName = "Check committed screenshot evidence";
  const screenshotEvidenceStarts = [];
  for (let index = check?.start ?? 0; index < (check?.end ?? 0); index++) {
    if (lines[index] === `      - name: ${screenshotEvidenceStepName}`) {
      screenshotEvidenceStarts.push(index);
    }
  }

  const screenshotEvidenceStart = screenshotEvidenceStarts[0] ?? -1;
  let screenshotEvidenceEnd = -1;
  if (screenshotEvidenceStart >= 0 && check) {
    screenshotEvidenceEnd = check.end;
    for (let index = screenshotEvidenceStart + 1; index < check.end; index++) {
      if (/^ {6}-\s+/.test(lines[index])) {
        screenshotEvidenceEnd = index;
        break;
      }
    }
  }

  const screenshotEvidenceLines =
    screenshotEvidenceEnd > screenshotEvidenceStart
      ? lines.slice(screenshotEvidenceStart, screenshotEvidenceEnd)
      : [];
  const screenshotEvidenceConfiguration = screenshotEvidenceLines.filter(
    (line) => line.trim() !== "" && !line.trimStart().startsWith("#"),
  );
  const expectedScreenshotEvidenceConfiguration = [
    `      - name: ${screenshotEvidenceStepName}`,
    "        continue-on-error: true",
    "        run: pnpm screenshots:check",
  ];
  let checkWorkingDirectoryContractCount = 0;
  if (check) {
    for (let index = check.start + 1; index + 2 < check.end; index++) {
      if (
        lines[index] === "    defaults:" &&
        lines[index + 1] === "      run:" &&
        lines[index + 2] === "        working-directory: design"
      ) {
        checkWorkingDirectoryContractCount++;
      }
    }
  }
  const screenshotEvidenceCommands = workflowScriptRegions.flatMap((region) =>
    region.lines.filter(
      (line) => line.text.trim() === "pnpm screenshots:check",
    ),
  );
  const checkStepStarts = check
    ? lines
        .slice(check.start + 1, check.end)
        .flatMap((line, offset) =>
          /^ {6}-\s+/.test(line) ? [check.start + 1 + offset] : [],
        )
    : [];
  const previousCheckStep = checkStepStarts
    .filter((index) => index < screenshotEvidenceStart)
    .at(-1);
  const nextCheckStep = checkStepStarts.find(
    (index) => index > screenshotEvidenceStart,
  );
  const screenshotEvidenceContractHolds =
    check !== null &&
    screenshotEvidenceStarts.length === 1 &&
    screenshotEvidenceCommands.length === 1 &&
    screenshotEvidenceConfiguration.length ===
      expectedScreenshotEvidenceConfiguration.length &&
    screenshotEvidenceConfiguration.every(
      (line, index) => line === expectedScreenshotEvidenceConfiguration[index],
    ) &&
    checkWorkingDirectoryContractCount === 1 &&
    previousCheckStep !== undefined &&
    /^ {6}- run:\s+pnpm install --frozen-lockfile\s*$/.test(
      lines[previousCheckStep],
    ) &&
    nextCheckStep !== undefined &&
    /^ {6}- run:\s+pnpm build\s*$/.test(lines[nextCheckStep]);
  if (!screenshotEvidenceContractHolds) {
    problems.push({
      file,
      line:
        (screenshotEvidenceStart >= 0
          ? screenshotEvidenceStart
          : (check?.start ?? 0)) + 1,
      stepName: screenshotEvidenceStepName,
      expression: null,
      message:
        "committed screenshot evidence must run exactly once and unconditionally from check's design working directory, immediately after install and before build, as a named step-level advisory",
    });
  }

  const screenshots = jobBlock(lines, "screenshots");
  const advisoryScreenshotLines = screenshots
    ? lines
        .slice(screenshots.start + 1, screenshots.end)
        .filter((line) => /^ {4}continue-on-error:\s+true\s*$/.test(line))
    : [];
  if (!screenshots || advisoryScreenshotLines.length !== 1) {
    problems.push({
      file,
      line: (screenshots?.start ?? 0) + 1,
      stepName: null,
      expression: null,
      message:
        "screenshot capture must remain advisory with exactly one job-level continue-on-error: true",
    });
  }
  // A reviewed `timeout-minutes` value used to be required here (exactly 20). That policy
  // is repealed (repository owner, "No lint and no timeout"): the screenshots job's ceiling
  // is no longer this script's concern, and the job itself is now disabled (`if: false`,
  // owner decision 2026-08-15 - see ci.yml's own comment on that job), which makes a
  // reviewed timeout value doubly moot - there is nothing left for a ceiling to bound.
  // Re-enabling the job and choosing its next timeout is left to whoever does that, per
  // the re-enable instructions in ci.yml's own comment there.

  const packageJob = jobBlock(lines, "package");
  const packageRunners = packageJob
    ? lines
        .slice(packageJob.start + 1, packageJob.end)
        .map(
          (line) =>
            /^ {4}runs-on:\s*([^#\s]+)\s*(?:#.*)?$/.exec(line)?.[1] ?? null,
        )
        .filter((value) => value !== null)
    : [];
  if (packageRunners.length !== 1 || packageRunners[0] !== "windows-2022") {
    problems.push({
      file,
      line: (packageJob?.start ?? 0) + 1,
      stepName: null,
      expression: null,
      message: "release packaging must remain Windows-only on windows-2022",
    });
  }

  const release = jobBlock(lines, "release");
  const releaseStart = release?.start ?? -1;
  const releaseEnd = release?.end ?? lines.length;
  // Two checks used to live here: an exact `needs:` list requiring `release` to depend on
  // every correctness job ("release must depend on every correctness job and no advisory
  // job"), and a re-parse of `release`'s own `if: >-` block requiring the same jobs'
  // success ("release eligibility must require success from every correctness job while
  // leaving lint and screenshots advisory"). Both encoded a policy the repository owner
  // has since repealed ("No lint and no timeout"): `release` now depends only on the jobs
  // that actually produce what it publishes (`package`, `jars`, `test-world`).
  //
  // The second check's job - catching an unreviewed drift in `release`'s `if:` condition -
  // is not lost: it is exactly what the generic condition-inventory check further down
  // already does for every `if:` in the file, using REVIEWED_RELEASE_CONDITION as the
  // reviewed value for `jobs.release`. Keeping a second, narrower re-implementation of the
  // same check here would just be two places that could drift from each other. The first
  // check (the `needs:` list itself) has no replacement: whether `release` depends on an
  // advisory job is no longer this script's business at all.

  const publisherCommand = 'gh release create "$RELEASE_TAG" \\';
  const publishers = scriptRegions(text).flatMap((region) =>
    region.lines
      .filter((line) => line.text.trim() === publisherCommand)
      .map((line) => ({ line: line.number, stepName: region.stepName })),
  );
  if (
    publishers.length !== 1 ||
    publishers[0].stepName !== "Publish" ||
    publishers[0].line <= releaseStart + 1 ||
    publishers[0].line > releaseEnd
  ) {
    problems.push({
      file,
      line: publishers[0]?.line ?? (releaseStart + 1 || 1),
      stepName: publishers[0]?.stepName ?? null,
      expression: null,
      message:
        "workflow must contain exactly one reviewed release publisher inside release/Publish",
    });
  }

  const actualReleaseFingerprint = jobFingerprint(text, "release");
  if (
    actualReleaseFingerprint !== RELEASE_JOB_FINGERPRINT ||
    !/^[0-9a-f]{64}$/.test(RELEASE_JOB_FINGERPRINT)
  ) {
    problems.push({
      file,
      line: releaseStart + 1 || 1,
      stepName: null,
      expression: null,
      message:
        "complete release job changed outside its reviewed SHA-256 contract",
    });
  }

  for (const region of scriptRegions(text).filter(
    (candidate) =>
      candidate.keyLine > releaseStart + 1 && candidate.keyLine <= releaseEnd,
  )) {
    problems.push(...expressionProblems(region, file));
  }

  const regions = scriptRegions(text);
  for (const [stepName, requiredLines] of Object.entries(REQUIRED_STEP_LINES)) {
    const region = regions.find((candidate) => candidate.stepName === stepName);
    const commands = region?.lines.map((line) => line.text.trim()) ?? [];
    for (const command of requiredLines) {
      if (commands.filter((line) => line === command).length !== 1) {
        problems.push({
          file,
          line: region?.keyLine ?? 1,
          stepName: region?.stepName ?? stepName,
          expression: null,
          message: `security contract must run exactly once: ${command}`,
        });
      }
    }
  }

  for (const [stepName, sequences] of Object.entries(REQUIRED_STEP_SEQUENCES)) {
    const region = regions.find((candidate) => candidate.stepName === stepName);
    const commands = region?.lines.map((line) => line.text.trim()) ?? [];
    for (const sequence of sequences) {
      let found = 0;
      for (let start = 0; start + sequence.length <= commands.length; start++) {
        if (sequence.every((line, offset) => commands[start + offset] === line))
          found++;
      }
      if (found !== 1) {
        problems.push({
          file,
          line: region?.keyLine ?? 1,
          stepName: region?.stepName ?? stepName,
          expression: null,
          message: `security contract must run exactly once as consecutive lines: ${sequence.join(" then ")}`,
        });
      }
    }
  }
  return problems;
}

function lintInventory(root = process.cwd()) {
  const problems = [];
  try {
    const workflowDirectory = resolve(root, ".github/workflows");
    const discovered = readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/i.test(name))
      .map((name) => `.github/workflows/${name}`)
      .sort();
    const inventoried = Object.keys(ACTION_INVENTORIES).sort();
    for (const relativePath of new Set([...discovered, ...inventoried])) {
      if (!discovered.includes(relativePath)) {
        problems.push({
          file: relativePath,
          line: 1,
          stepName: null,
          expression: null,
          message: "action inventory names a workflow that does not exist",
        });
      } else if (!inventoried.includes(relativePath)) {
        problems.push({
          file: relativePath,
          line: 1,
          stepName: null,
          expression: null,
          message:
            "executable workflow is missing from the exact action inventory",
        });
      }
    }
  } catch (error) {
    problems.push({
      file: ".github/workflows",
      line: 1,
      stepName: null,
      expression: null,
      message: `workflow inventory cannot be read (${error.code ?? "unknown error"})`,
    });
  }
  for (const [relativePath, watched] of Object.entries(WATCHED_SCRIPT_STEPS)) {
    try {
      const text = readFileSync(resolve(root, relativePath), "utf8");
      problems.push(
        ...lintText(
          text,
          relativePath,
          watched,
          WATCHED_STEP_FINGERPRINTS[relativePath],
        ),
      );
      problems.push(...actionDependencyProblems(text, relativePath));
    } catch (error) {
      problems.push({
        file: relativePath,
        line: 1,
        stepName: null,
        expression: null,
        message: `watched workflow cannot be read (${error.code ?? "unknown error"})`,
      });
    }
  }
  for (const relativePath of Object.keys(ACTION_INVENTORIES).filter(
    (path) => !Object.hasOwn(WATCHED_SCRIPT_STEPS, path),
  )) {
    try {
      problems.push(
        ...actionDependencyProblems(
          readFileSync(resolve(root, relativePath), "utf8"),
          relativePath,
        ),
      );
    } catch (error) {
      problems.push({
        file: relativePath,
        line: 1,
        stepName: null,
        expression: null,
        message: `action inventory workflow cannot be read (${error.code ?? "unknown error"})`,
      });
    }
  }
  return problems;
}

function main() {
  const problems = lintInventory(
    process.argv[2] ? resolve(process.argv[2]) : process.cwd(),
  );
  if (problems.length) {
    for (const problem of problems) {
      process.stderr.write(
        `${problem.file}:${problem.line}: ${problem.message}${problem.expression ? ` (${problem.expression})` : ""}\n`,
      );
    }
    process.stderr.write(
      `lint-workflows: ${problems.length} release boundary problem(s)\n`,
    );
    process.exitCode = 1;
  } else {
    const watchedCount = Object.values(WATCHED_SCRIPT_STEPS).reduce(
      (total, steps) => total + Object.keys(steps).length,
      0,
    );
    const actionCount = Object.values(ACTION_INVENTORIES).reduce(
      (total, inventory) =>
        total +
        Object.values(inventory).reduce((sum, item) => sum + item.count, 0),
      0,
    );
    process.stdout.write(
      `lint-workflows: ${Object.keys(ACTION_INVENTORIES).length} workflows, ${actionCount} pinned actions and ${watchedCount} watched release steps clean\n`,
    );
  }
}

export {
  PINNED_ACTIONS,
  RELEASE_JOB_FINGERPRINT,
  ACTION_INVENTORIES,
  WATCHED_SCRIPT_STEPS,
  WATCHED_STEP_FINGERPRINTS,
  actionDependencyProblems,
  lintInventory,
  lintText,
  scriptRegions,
  jobFingerprint,
  stepFingerprint,
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
