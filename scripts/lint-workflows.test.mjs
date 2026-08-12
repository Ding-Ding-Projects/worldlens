import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  ACTION_INVENTORIES,
  PINNED_ACTIONS,
  RELEASE_JOB_FINGERPRINT,
  WATCHED_SCRIPT_STEPS,
  WATCHED_STEP_FINGERPRINTS,
  actionDependencyProblems,
  jobFingerprint,
  lintText,
  scriptRegions,
  stepFingerprint,
} from "./lint-workflows.mjs";

const FILE = ".github/workflows/ci.yml";
const BUILD_JARS_FILE = ".github/workflows/build-jars.yml";
const WATCHED = WATCHED_SCRIPT_STEPS[FILE];
const ONE_INPUT = {
  Publish: {
    NAME: {
      expression: "steps.dish.outputs.name",
      uses: ["printf '%s\\n' \"$NAME\""],
      implicit: false,
    },
  },
};

function workflowAt(revision) {
  return execFileSync("git", ["show", `${revision}:${FILE}`], {
    encoding: "utf8",
  });
}

function rawExpressionProblems(problems) {
  return problems.filter((problem) =>
    problem.message.startsWith("Actions expression is interpolated"),
  );
}

function oneStep({
  env = "NAME: ${{ steps.dish.outputs.name }}",
  run = "printf '%s\\n' \"$NAME\"",
}) {
  return `jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          ${env}\n        run: ${run}\n`;
}

test("the exact recovered workflow fails at its original 11 executable expression sites", () => {
  const problems = lintText(workflowAt("98988e3"), FILE, WATCHED);
  assert.equal(rawExpressionProblems(problems).length, 11);
});

test("the exact e137779 baseline exposes all 19 later executable expression sites", () => {
  const problems = lintText(
    workflowAt("e13777927876a3d7898778f18193e9465bc97cc2"),
    FILE,
    WATCHED,
  );
  assert.deepEqual(
    rawExpressionProblems(problems).map((problem) => problem.line),
    [
      803, 809, 810, 810, 812, 812, 812, 814, 827, 830, 878, 882, 901, 915, 952,
      955, 989, 992, 999,
    ],
  );
});

test("the checked-in workflow has exact provenance and quoted data-only sinks", () => {
  const workflow = readFileSync(FILE, "utf8");
  assert.deepEqual(
    lintText(workflow, FILE, WATCHED, WATCHED_STEP_FINGERPRINTS[FILE]),
    [],
  );
  for (const [stepName, fingerprint] of Object.entries(
    WATCHED_STEP_FINGERPRINTS[FILE],
  )) {
    assert.deepEqual(stepFingerprint(workflow, stepName), fingerprint);
  }
});

test("tag-trigger and generated-changelog execution scope fail closed", () => {
  const workflow = readFileSync(FILE, "utf8").replaceAll("\r\n", "\n");
  assert.deepEqual(actionDependencyProblems(workflow, FILE), []);
  assert.deepEqual(
    actionDependencyProblems(workflow.replaceAll("\n", "\r\n"), FILE),
    [],
  );

  const stepStart = workflow.indexOf(
    "      - name: Verify generated changelog is current",
  );
  const stepEnd = workflow.indexOf("\n      - name: actionlint", stepStart);
  assert.ok(stepStart >= 0);
  assert.ok(stepEnd > stepStart);
  const changelogStep = workflow.slice(stepStart, stepEnd);
  const withoutChangelogStep =
    workflow.slice(0, stepStart) + workflow.slice(stepEnd + 1);
  const checkInstall = "      - run: pnpm install --frozen-lockfile";
  assert.ok(withoutChangelogStep.includes(checkInstall));

  const mutations = [
    [
      "relocated into the check job",
      withoutChangelogStep.replace(
        checkInstall,
        `${changelogStep}\n\n${checkInstall}`,
      ),
      /must exist exactly once inside the workflows job/,
    ],
    [
      "extra executable command",
      workflow.replace(
        "          node scripts/build-changelog.mjs --check",
        "          node scripts/build-changelog.mjs --check\n          echo unexpected",
      ),
      /must contain only its reviewed executable commands/,
    ],
    ...[">", ">-", ">+"].map((scalar) => [
      `folded changelog command block ${scalar}`,
      workflow.replace(
        changelogStep,
        changelogStep.replace("        run: |", `        run: ${scalar}`),
      ),
      /must use the exact literal run block scalar/,
    ]),
    [
      "continue on error",
      workflow.replace(
        "          node scripts/build-changelog.mjs --check",
        "          node scripts/build-changelog.mjs --check\n        continue-on-error: true",
      ),
      /may not continue after an error/,
    ],
    [
      "quoted continue-on-error key",
      workflow.replace(
        "          node scripts/build-changelog.mjs --check",
        "          node scripts/build-changelog.mjs --check\n        'continue-on-error': true",
      ),
      /may not continue after an error/,
    ],
    [
      "inverted tag condition",
      workflow.replace(
        "        if: github.ref_type != 'tag'",
        "        if: github.ref_type == 'tag'",
      ),
      /must use exactly the reviewed non-tag condition/,
    ],
    [
      "relaxed always condition",
      workflow.replace(
        "        if: github.ref_type != 'tag'",
        "        if: always()",
      ),
      /must use exactly the reviewed non-tag condition/,
    ],
    [
      "duplicate changelog step",
      workflow.replace(
        "\n      - name: actionlint",
        `\n${changelogStep}\n\n      - name: actionlint`,
      ),
      /must exist exactly once inside the workflows job/,
    ],
    [
      "tag guard on actionlint",
      workflow.replace(
        "      - name: actionlint\n",
        "      - name: actionlint\n        if: github.ref_type != 'tag'\n",
      ),
      /workflow condition inventory/,
    ],
    [
      "tag guard on the check job",
      workflow.replace(
        "  check:\n    name: Lint, build, test\n",
        "  check:\n    name: Lint, build, test\n    if: github.ref_type != 'tag'\n",
      ),
      /workflow condition inventory/,
    ],
    [
      "folded alternate tag predicate",
      workflow.replace(
        "      - name: actionlint\n",
        [
          "      - name: actionlint",
          "        if: >-",
          "          !startsWith(github.ref, 'refs/tags/')",
          "",
        ].join("\n"),
      ),
      /workflow condition inventory/,
    ],
    [
      "generic condition on another validation step",
      workflow.replace(
        "      - name: actionlint\n",
        "      - name: actionlint\n        if: false\n",
      ),
      /workflow condition inventory/,
    ],
    ...["'", '"'].flatMap((quote) => [
      [
        `${quote}quoted inline condition key`,
        workflow.replace(
          "      - name: actionlint\n",
          `      - name: actionlint\n        ${quote}if${quote}: false\n`,
        ),
        /canonical unquoted spelling/,
      ],
      [
        `${quote}quoted folded condition key`,
        workflow.replace(
          "      - name: actionlint\n",
          [
            "      - name: actionlint",
            `        ${quote}if${quote}: >-`,
            "          !startsWith(github.ref, 'refs/tags/')",
            "",
          ].join("\n"),
        ),
        /canonical unquoted spelling/,
      ],
      [
        `${quote}quoted extra trigger key`,
        workflow.replace(
          "    type: boolean\n",
          `    type: boolean\n  ${quote}schedule${quote}:\n    - cron: '0 0 * * *'\n`,
        ),
        /canonical unquoted spelling/,
      ],
    ]),
    [
      "push restricted to main",
      workflow.replace(
        "  push:\n  pull_request:",
        "  push:\n    branches: [main]\n  pull_request:",
      ),
      /push must remain unrestricted/,
    ],
    [
      "workflow dispatch trigger removed",
      workflow.replace(
        "  workflow_dispatch:\n",
        "  workflow_dispatch_removed:\n",
      ),
      /root triggers must be exactly unrestricted/,
    ],
  ];

  for (const [name, mutated, expectedProblem] of mutations) {
    assert.notEqual(mutated, workflow, name);
    assert.ok(
      actionDependencyProblems(mutated, FILE).some((problem) =>
        expectedProblem.test(problem.message),
      ),
      name,
    );
  }
});

test("complete run and env fingerprints reject indirect execution and harmless drift", () => {
  const workflow = readFileSync(FILE, "utf8");
  const anchor = 'if [ -n "$DISH_NAME_EN" ]; then';
  for (const extra of [
    "printenv DISH_NAME_EN | bash",
    'eval "$(printenv DISH_NAME_EN)"',
    'key=DISH_NAME_EN; eval "${!key}"',
    'export PAYLOAD="$(printenv DISH_NAME_EN)"; bash -c "$PAYLOAD"',
    'echo "harmless reviewed change"',
  ]) {
    const mutated = workflow.replace(
      anchor,
      `${anchor}\n              ${extra}`,
    );
    const problems = lintText(
      mutated,
      FILE,
      WATCHED,
      WATCHED_STEP_FINGERPRINTS[FILE],
    );
    assert.ok(
      problems.some((problem) =>
        /watched run block changed outside its reviewed SHA-256 contract/.test(
          problem.message,
        ),
      ),
      extra,
    );
  }

  const extraEnv = workflow.replace(
    "DISH_NAME_EN: ${{ steps.dish.outputs.dish_name_en }}",
    'DISH_NAME_EN: ${{ steps.dish.outputs.dish_name_en }}\n          REVIEW_NOTE: "harmless"',
  );
  assert.ok(
    lintText(extraEnv, FILE, WATCHED, WATCHED_STEP_FINGERPRINTS[FILE]).some(
      (problem) =>
        /watched env block changed outside its reviewed SHA-256 contract/.test(
          problem.message,
        ),
    ),
  );
});

function injectAdjacentReleaseStep(workflow) {
  const publish = /^ {6}- name: Publish(?<newline>\r?\n)/m.exec(workflow);
  assert.ok(publish, "the Publish step anchor must exist before mutation");
  const newline = publish.groups.newline;
  const injected = workflow.replace(
    publish[0],
    "      - name: Unreviewed adjacent shell" +
      newline +
      '        run: echo "${{ github.event.issue.title }}"' +
      newline +
      newline +
      "      - name: Publish" +
      newline,
  );
  assert.notEqual(
    injected,
    workflow,
    "the adjacent-step fixture must change the workflow before diagnostics are checked",
  );
  return injected;
}

for (const [lineEnding, workflow] of [
  ["LF", readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")],
  ["CRLF", readFileSync(FILE, "utf8").replace(/\r?\n/g, "\r\n")],
]) {
  test(`an adjacent executable release step cannot escape the reviewed inventory (${lineEnding})`, () => {
    const injected = injectAdjacentReleaseStep(workflow);
    const problems = [
      ...lintText(injected, FILE, WATCHED, WATCHED_STEP_FINGERPRINTS[FILE]),
      ...actionDependencyProblems(injected, FILE),
    ];
    assert.ok(
      problems.some((problem) =>
        problem.message.startsWith("Actions expression is interpolated"),
      ),
    );
    assert.ok(
      problems.some((problem) =>
        /complete release job changed outside its reviewed SHA-256 contract/.test(
          problem.message,
        ),
      ),
    );
    assert.equal(jobFingerprint(workflow, "release"), RELEASE_JOB_FINGERPRINT);
  });
}

test("all 117 actions in every executable workflow are SHA-pinned and checkouts erase credentials", () => {
  const inventoryFiles = Object.keys(ACTION_INVENTORIES).sort();
  const workflowFiles = readdirSync(".github/workflows")
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => `.github/workflows/${name}`)
    .sort();
  assert.deepEqual(inventoryFiles, workflowFiles);

  for (const file of inventoryFiles) {
    assert.deepEqual(
      actionDependencyProblems(readFileSync(file, "utf8"), file),
      [],
    );
  }
  assert.equal(
    Object.values(ACTION_INVENTORIES).reduce(
      (total, inventory) =>
        total +
        Object.values(inventory).reduce((sum, item) => sum + item.count, 0),
      0,
    ),
    117,
  );
  assert.equal(Object.keys(PINNED_ACTIONS).length, 6);
});

test("render provenance keeps its exact nested schema and fails closed on drift", () => {
  const workflow = readFileSync(FILE, "utf8");
  const eol = workflow.includes("\r\n") ? "\r\n" : "\n";
  const rendererLine =
    '            "renderer": "upstream BlueMap Java engine, built from the vendored source",';
  const seedLine = '              "seed": ${{ steps.world.outputs.seed }},';
  const sizeLine = '              "size": 1000';
  const hiresTilesLine =
    '            "hiresTiles": ${{ steps.render.outputs.tiles }},';
  const commitLine = '            "commit": "${{ github.sha }}",';
  const runLine = '            "run": "${{ github.run_id }}"';
  const worldBlock = [
    '            "world": {',
    seedLine,
    sizeLine,
    "            },",
  ].join(eol);
  const provenanceStepHeader = [
    "      - name: Record what rendered it",
    "        run: |",
  ].join(eol);
  const provenanceStep = [
    provenanceStepHeader,
    "          set -euo pipefail",
    '          cat > "$GITHUB_WORKSPACE/render-out/provenance.json" <<JSON',
    "          {",
    rendererLine,
    '            "world": {',
    seedLine,
    sizeLine,
    "            },",
    hiresTilesLine,
    commitLine,
    runLine,
    "          }",
    "          JSON",
    '          cat "$GITHUB_WORKSPACE/render-out/provenance.json"',
  ].join(eol);
  assert.ok(workflow.includes(provenanceStep));

  const duplicateWriterStep = provenanceStep.replace(
    "      - name: Record what rendered it",
    "      - name: Shadow render provenance writer",
  );
  const provenanceMutations = [
    [
      "forbidden engine key",
      workflow.replace(
        rendererLine,
        [rendererLine, '            "engine": "legacy",'].join(eol),
      ),
    ],
    [
      "flattened seed",
      workflow.replace(
        worldBlock,
        [
          '            "seed": ${{ steps.world.outputs.seed }},',
          '            "world": {',
          sizeLine,
          "            },",
        ].join(eol),
      ),
    ],
    [
      "forbidden sizeBlocks key",
      workflow.replace(
        worldBlock,
        [worldBlock, '            "sizeBlocks": 1000,'].join(eol),
      ),
    ],
    ["commit removed", workflow.replace(`${commitLine}${eol}`, "")],
    [
      "run removed",
      workflow.replace(
        `${commitLine}${eol}${runLine}`,
        '            "commit": "${{ github.sha }}"',
      ),
    ],
    [
      "seed quoted",
      workflow.replace(
        seedLine,
        '              "seed": "${{ steps.world.outputs.seed }}",',
      ),
    ],
    ["size quoted", workflow.replace(sizeLine, '              "size": "1000"')],
    [
      "hiresTiles quoted",
      workflow.replace(
        hiresTilesLine,
        '            "hiresTiles": "${{ steps.render.outputs.tiles }}",',
      ),
    ],
    [
      "duplicate writer",
      workflow.replace(
        `${provenanceStep}${eol}`,
        `${provenanceStep}${eol}${eol}${duplicateWriterStep}${eol}`,
      ),
    ],
    [
      "conditional writer",
      workflow.replace(
        provenanceStepHeader,
        [
          "      - name: Record what rendered it",
          "        if: false",
          "        run: |",
        ].join(eol),
      ),
    ],
    [
      "advisory writer",
      workflow.replace(
        provenanceStepHeader,
        [
          "      - name: Record what rendered it",
          "        continue-on-error: true",
          "        run: |",
        ].join(eol),
      ),
    ],
    [
      "renamed step",
      workflow.replace(
        "      - name: Record what rendered it",
        "      - name: Record render provenance",
      ),
    ],
    ["missing step", workflow.replace(provenanceStep, "")],
  ];
  for (const [name, mutated] of provenanceMutations) {
    assert.notEqual(mutated, workflow, name);
    assert.ok(
      actionDependencyProblems(mutated, FILE).some((problem) =>
        /render provenance must have exactly one named writer/.test(
          problem.message,
        ),
      ),
      name,
    );
  }
});

// The unsigned-installer warning is the one sentence in a release that a reader acts on
// before running an executable a stranger built, so it gets its own test rather than
// riding on the run-block digest. Each mutation below leaves the sentence itself present
// and untouched, which is exactly the shape an exact count of that line cannot catch.
test("the unsigned-installer warning cannot lose or detach its alert opener", () => {
  const workflow = readFileSync(FILE, "utf8");
  const opener = '            echo "> [!WARNING]"';
  const sentence =
    '            echo "> Worldlens for Windows is intentionally and permanently unsigned.';
  const openerAndSentence = new RegExp(
    `${opener.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r?\\n${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  assert.ok(
    openerAndSentence.test(workflow),
    "the adjacent warning pair must exist before mutation",
  );

  for (const [name, mutated] of [
    [
      "opener removed",
      workflow.replace(openerAndSentence, (pair) =>
        pair.slice(pair.indexOf(sentence)),
      ),
    ],
    [
      "opener separated from its sentence",
      workflow.replace(
        openerAndSentence,
        (pair) =>
          `${opener}\n            echo\n${pair.slice(pair.indexOf(sentence))}`,
      ),
    ],
  ]) {
    assert.notEqual(mutated, workflow, name);
    assert.ok(
      actionDependencyProblems(mutated, FILE).some((problem) =>
        /must run exactly once as consecutive lines/.test(problem.message),
      ),
      name,
    );
  }
});

test("mutable action tags, retained checkout credentials and missing root gates fail", () => {
  const workflow = readFileSync(FILE, "utf8");
  // The checkout's own line ending, for the two mutations below that span more than one
  // line. Everything else here replaces a fragment that never crosses a newline and so
  // reads the same on either platform, but a needle with a hard-coded "\n" in it simply
  // does not occur in a CRLF working copy - the replace silently changes nothing, the
  // mutation comes back identical to the original, and the test fails claiming a security
  // contract is missing when the workflow is entirely correct. That is the same failure
  // `DockerWorldSourcePanel.test.ts` records for the same reason.
  const eol = workflow.includes("\r\n") ? "\r\n" : "\n";
  assert.equal(
    workflow.match(/node scripts\/release-version\.mjs/g)?.length,
    2,
    "packaging and publication must both use the committed version resolver",
  );
  assert.equal(workflow.includes("-build.${GITHUB_RUN_NUMBER}"), false);

  const splitVersionIdentity = workflow.replace(
    'if [ "$tag" != "v$version" ]; then',
    'tag="v${version}-build.${GITHUB_RUN_NUMBER}"',
  );
  assert.notEqual(splitVersionIdentity, workflow);
  assert.ok(
    actionDependencyProblems(splitVersionIdentity, FILE).some((problem) =>
      /security contract must run exactly once/.test(problem.message),
    ),
  );

  const mutable = workflow.replace(
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/checkout@v4",
  );
  assert.ok(
    actionDependencyProblems(mutable, FILE).some((problem) =>
      /not in the exact SHA inventory/.test(problem.message),
    ),
  );

  const credentialed = workflow.replace(
    "persist-credentials: false",
    "persist-credentials: true",
  );
  assert.ok(
    actionDependencyProblems(credentialed, FILE).some((problem) =>
      /erase its credential/.test(problem.message),
    ),
  );

  const unwired = workflow.replace(
    "node --test scripts/bootstrap.test.mjs scripts/collect-squirrel-release.test.mjs scripts/lint-workflows.test.mjs scripts/pick-dim-sum.test.mjs scripts/release-asset-manifest.test.mjs scripts/release-version.test.mjs",
    "echo skipped",
  );
  assert.ok(
    actionDependencyProblems(unwired, FILE).some((problem) =>
      /security contract must run exactly once/.test(problem.message),
    ),
  );

  const unvalidatedOutput = workflow.replace(
    "printf 'ordinal=%s\\n' \"$ordinal\"",
    'echo "ordinal=$ordinal"',
  );
  assert.ok(
    actionDependencyProblems(unvalidatedOutput, FILE).some((problem) =>
      /security contract must run exactly once/.test(problem.message),
    ),
  );

  const skippedFatalGate = workflow.replace(
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip]",
    "needs: [check, workflows, package, jars, test-world]",
  );
  assert.notEqual(skippedFatalGate, workflow);
  assert.ok(
    actionDependencyProblems(skippedFatalGate, FILE).some((problem) =>
      /release must depend/.test(problem.message),
    ),
  );

  const lintGate = workflow.replace(
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip]",
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip, lint]",
  );
  assert.notEqual(lintGate, workflow);
  assert.ok(
    actionDependencyProblems(lintGate, FILE).some((problem) =>
      /every correctness job and no advisory job/.test(problem.message),
    ),
  );

  for (const job of [
    "check",
    "workflows",
    "package",
    "jars",
    "test-world",
    "config-java-roundtrip",
  ]) {
    const requiredLine = `      && needs.${job}.result == 'success'`;
    const relaxedEligibility = workflow.replace(requiredLine, "");
    assert.notEqual(relaxedEligibility, workflow, job);
    assert.ok(
      actionDependencyProblems(relaxedEligibility, FILE).some((problem) =>
        /release eligibility must require success from every correctness job/.test(
          problem.message,
        ),
      ),
      job,
    );
  }

  const nonWindowsPackage = workflow.replace(
    "    runs-on: windows-2022",
    "    runs-on: ubuntu-24.04",
  );
  assert.notEqual(nonWindowsPackage, workflow);
  assert.ok(
    actionDependencyProblems(nonWindowsPackage, FILE).some((problem) =>
      /release packaging must remain Windows-only/.test(problem.message),
    ),
  );

  const secondPublisher = workflow.replace(
    `  release:${eol}`,
    `  shadow-publisher:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Shadow publisher\n        run: |\n          gh release create "$RELEASE_TAG" \\\n\n  release:\n`,
  );
  assert.notEqual(secondPublisher, workflow);
  assert.ok(
    actionDependencyProblems(secondPublisher, FILE).some((problem) =>
      /exactly one reviewed release publisher/.test(problem.message),
    ),
  );

  const screenshotGate = workflow.replace(
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip]",
    "needs: [check, workflows, package, jars, test-world, config-java-roundtrip, screenshots]",
  );
  assert.notEqual(screenshotGate, workflow);
  assert.ok(
    actionDependencyProblems(screenshotGate, FILE).some((problem) =>
      /release must depend/.test(problem.message),
    ),
  );

  const screenshotsStart = workflow.indexOf(`  screenshots:${eol}`);
  const screenshotsEnd = workflow.indexOf(
    `${eol}  release:${eol}`,
    screenshotsStart,
  );
  assert.ok(screenshotsStart >= 0);
  assert.ok(screenshotsEnd > screenshotsStart);
  const screenshotsBlock = workflow.slice(screenshotsStart, screenshotsEnd);
  const fatalScreenshotsBlock = screenshotsBlock.replace(
    `${eol}    continue-on-error: true${eol}`,
    `${eol}    continue-on-error: false${eol}`,
  );
  assert.notEqual(fatalScreenshotsBlock, screenshotsBlock);
  const fatalScreenshots =
    workflow.slice(0, screenshotsStart) +
    fatalScreenshotsBlock +
    workflow.slice(screenshotsEnd);

  const screenshotEvidenceWith = (...extraLines) =>
    [
      "      - name: Check committed screenshot evidence",
      "        continue-on-error: true",
      ...extraLines,
      "        run: pnpm screenshots:check",
    ].join(eol);
  const screenshotEvidenceStep = screenshotEvidenceWith();
  assert.ok(workflow.includes(screenshotEvidenceStep));

  const screenshotEvidenceMutations = [
    [
      "renamed",
      workflow.replace(
        "      - name: Check committed screenshot evidence",
        "      - name: Audit committed screenshot evidence",
      ),
    ],
    [
      "fatal",
      workflow.replace(
        screenshotEvidenceStep,
        [
          "      - name: Check committed screenshot evidence",
          "        continue-on-error: false",
          "        run: pnpm screenshots:check",
        ].join(eol),
      ),
    ],
    [
      "conditional",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith("        if: false"),
      ),
    ],
    [
      "wrong step working directory",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith("        working-directory: ."),
      ),
    ],
    [
      "spaced conditional key",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith("        if : false"),
      ),
    ],
    [
      "quoted conditional key",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith('        "if": false'),
      ),
    ],
    [
      "spaced working-directory key",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith("        working-directory : ."),
      ),
    ],
    [
      "quoted working-directory key",
      workflow.replace(
        screenshotEvidenceStep,
        screenshotEvidenceWith('        "working-directory": .'),
      ),
    ],
    [
      "wrong check working directory",
      workflow.replace(
        [
          "    defaults:",
          "      run:",
          "        working-directory: design",
        ].join(eol),
        ["    defaults:", "      run:", "        working-directory: ."].join(
          eol,
        ),
      ),
    ],
    ["missing", workflow.replace(screenshotEvidenceStep, "")],
    [
      "moved after build",
      workflow
        .replace(`${screenshotEvidenceStep}${eol}`, "")
        .replace(
          "      - run: pnpm build",
          `      - run: pnpm build${eol}${screenshotEvidenceStep}`,
        ),
    ],
    [
      "duplicated",
      workflow.replace(
        screenshotEvidenceStep,
        `${screenshotEvidenceStep}${eol}${screenshotEvidenceStep}`,
      ),
    ],
  ];
  for (const [name, mutated] of screenshotEvidenceMutations) {
    assert.notEqual(mutated, workflow, name);
    assert.ok(
      actionDependencyProblems(mutated, FILE).some((problem) =>
        /committed screenshot evidence must run exactly once/.test(
          problem.message,
        ),
      ),
      name,
    );
  }

  const explicitUnrelatedWorkingDirectory = workflow.replace(
    "      - run: pnpm build",
    `      - run: pnpm build${eol}        working-directory: design`,
  );
  assert.notEqual(explicitUnrelatedWorkingDirectory, workflow);
  assert.equal(
    actionDependencyProblems(explicitUnrelatedWorkingDirectory, FILE).some(
      (problem) =>
        /committed screenshot evidence must run exactly once/.test(
          problem.message,
        ),
    ),
    false,
  );

  const collapsedApplicationDirectory = workflow.replace(
    `          $applicationDirectories = @(${eol}            @(${eol}`,
    `          $applicationDirectories = @(${eol}`,
  );
  assert.notEqual(collapsedApplicationDirectory, workflow);
  assert.ok(
    actionDependencyProblems(collapsedApplicationDirectory, FILE).some(
      (problem) =>
        /security contract must run exactly once/.test(problem.message),
    ),
  );
  assert.notEqual(fatalScreenshots, workflow);
  assert.ok(
    actionDependencyProblems(fatalScreenshots, FILE).some((problem) =>
      /screenshot capture must remain advisory/.test(problem.message),
    ),
  );

  const unboundedScreenshots = workflow.replace(
    `    timeout-minutes: 20${eol}`,
    "",
  );
  assert.notEqual(unboundedScreenshots, workflow);
  assert.ok(
    actionDependencyProblems(unboundedScreenshots, FILE).some((problem) =>
      /20-minute job timeout/.test(problem.message),
    ),
  );

  const floatingRunner = workflow.replace(
    "runs-on: ubuntu-24.04",
    "runs-on: ubuntu-latest",
  );
  assert.notEqual(floatingRunner, workflow);
  assert.ok(
    actionDependencyProblems(floatingRunner, FILE).some((problem) =>
      /explicit supported image/.test(problem.message),
    ),
  );

  const jarWorkflow = readFileSync(BUILD_JARS_FILE, "utf8");
  const mutableReusable = jarWorkflow.replace(
    "gradle/actions/setup-gradle@0b6dd653ba04f4f93bf581ec31e66cbd7dcb644d",
    "gradle/actions/setup-gradle@v4",
  );
  assert.ok(
    actionDependencyProblems(mutableReusable, BUILD_JARS_FILE).some((problem) =>
      /not in the exact SHA inventory/.test(problem.message),
    ),
  );

  const pagesFile = ".github/workflows/pages.yml";
  const mutablePages = readFileSync(pagesFile, "utf8").replace(
    "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
    "actions/deploy-pages@v4",
  );
  assert.ok(
    actionDependencyProblems(mutablePages, pagesFile).some((problem) =>
      /not in the exact SHA inventory/.test(problem.message),
    ),
  );
});

test("the small canonical contract shape passes", () => {
  assert.deepEqual(lintText(oneStep({}), FILE, ONE_INPUT), []);
});

test("the hand-written inventory fails when a watched step disappears", () => {
  const problems = lintText(oneStep({}), FILE, WATCHED);
  assert.equal(
    problems.filter((problem) =>
      /must exist exactly once/.test(problem.message),
    ).length,
    Object.keys(WATCHED).length - 1,
  );
});

test("multiline Actions expressions in a block script are rejected", () => {
  const workflow = `jobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          NAME: \${{ steps.dish.outputs.name }}\n        run: |\n          printf '%s\\n' "\${{\n            steps.dish.outputs.name\n          }}"\n`;
  const problems = lintText(workflow, FILE, ONE_INPUT);
  assert.equal(rawExpressionProblems(problems).length, 1);
});

test("YAML aliases cannot hide either a watched env mapping or watched script", () => {
  const aliasedEnv = `x-release-env: &release-env\n  NAME: \${{ steps.dish.outputs.name }}\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env: *release-env\n        run: printf '%s\\n' "$NAME"\n`;
  assert.ok(
    lintText(aliasedEnv, FILE, ONE_INPUT).some((problem) =>
      /canonical dynamic env binding/.test(problem.message),
    ),
  );

  const aliasedRun = `x-release-script: &release-script |\n  printf '%s\\n' "$NAME"\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        env:\n          NAME: \${{ steps.dish.outputs.name }}\n        run: *release-script\n`;
  assert.ok(
    lintText(aliasedRun, FILE, ONE_INPUT).some((problem) =>
      /anchors or aliases/.test(problem.message),
    ),
  );
});

test("a watched binding must preserve its declared expression provenance", () => {
  const workflow = oneStep({ env: "NAME: ${{ github.event.issue.title }}" });
  assert.ok(
    lintText(workflow, FILE, ONE_INPUT).some((problem) =>
      /canonical dynamic env binding/.test(problem.message),
    ),
  );
});

test("watched variables must remain double-quoted", () => {
  const workflow = oneStep({ run: "printf '%s\\n' $NAME" });
  assert.ok(
    lintText(workflow, FILE, ONE_INPUT).some((problem) =>
      /exact approved data-use/.test(problem.message),
    ),
  );
});

for (const [name, run] of [
  ["eval", 'eval "$NAME"'],
  ["bash -c", 'bash -c "$NAME"'],
  ["bash options before -c", 'bash --noprofile -c "$NAME"'],
  ["sh options before -c", 'sh -eu -c "$NAME"'],
  ["source", 'source "$NAME"'],
  ["command source", 'command source "$NAME"'],
  ["dot source", '. "$NAME"'],
  ["bash standard input", 'bash -s <<< "$NAME"'],
  ["pipe to bash", "printf '%s' \"$NAME\" | bash"],
  [
    "write then execute",
    "printf '%s' \"$NAME\" > /tmp/run.sh; bash /tmp/run.sh",
  ],
  ["indirect eval", 'cmd=eval; "$cmd" "$NAME"'],
  ["backtick substitution", "result=`printf '%s' \"$NAME\"`"],
  ["command substitution", "result=$(printf '%s' \"$NAME\")"],
  ["command position", '"$NAME" --version'],
]) {
  test(`${name} is outside the fail-closed data-use contract`, () => {
    assert.ok(
      lintText(oneStep({ run }), FILE, ONE_INPUT).some((problem) =>
        /exact approved data-use/.test(problem.message),
      ),
    );
  });
}

test("an undeclared dynamic environment binding is rejected", () => {
  const workflow = oneStep({
    env: "NAME: ${{ steps.dish.outputs.name }}\n          EXTRA: ${{ steps.dish.outputs.other }}",
  });
  const problems = lintText(workflow, FILE, ONE_INPUT);
  assert.ok(
    problems.some((problem) => /undeclared dynamic/.test(problem.message)),
  );
  assert.ok(
    problems.some((problem) => /inventory mismatch/.test(problem.message)),
  );
});

test("block parsing keeps comments inside a script and ignores YAML comments", () => {
  const regions = scriptRegions(String.raw`
# run: echo "\${{ ignored }}"
- name: Publish
  run: |
    # expression here is still script text: \${{ watched }}
- name: Next
  env:
    SAFE: \${{ structural }}
`);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].stepName, "Publish");
  assert.equal(regions[0].lines.length, 1);
});
