#!/usr/bin/env node
/**
 * Fails when the Chunker GitHub Actions UI stops covering a workflow_dispatch input.
 *
 * `.github/workflows/chunk-world.yml`'s `workflow_dispatch.inputs` block is the contract:
 * every field it declares is something a person can be asked to fill in when they trigger
 * the workflow from GitHub's own UI. The desktop app dispatches the same workflow through
 * `ChunkerActionsPanel.vue` and `chunkeractions/ipc.ts`, and a field the app never exposes
 * is a field a user of the app cannot control - either it silently takes the workflow's
 * default forever, or (worse) the app hard-codes a value that quietly overrides what the
 * user asked for.
 *
 * This is a hand-written inventory rather than a heuristic, on purpose: a rule that only
 * checked "does *some* UI file mention this string" would pass on a control that exists in
 * a `<!-- ... -->` comment, in the schema-editor's raw JSON, or in a leftover string
 * nobody wired to anything. Each row below names the exact input, the exact literal that
 * must appear in the UI component (a `data-test` attribute on the real control, or - for
 * `target-format` and `chunker-config`, which are wired through other existing surfaces -
 * the literal that proves that wiring), and the exact literal that must appear in the
 * dispatch call the main process actually sends to GitHub.
 *
 *   node scripts/check-chunker-ui-inventory.mjs          # report and exit non-zero on a gap
 *   node scripts/check-chunker-ui-inventory.mjs --list   # print the inventory
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "chunk-world.yml");
const PANEL_PATH = join(REPO_ROOT, "design/packages/ui/src/components/chunker/ChunkerActionsPanel.vue");
const SCREEN_PATH = join(REPO_ROOT, "design/packages/ui/src/components/chunker/ChunkerScreen.vue");
const IPC_PATH = join(REPO_ROOT, "design/packages/app/src/main/chunkeractions/ipc.ts");

/**
 * Every workflow_dispatch input `chunk-world.yml` declares, in the order it declares them,
 * with the exact UI literal and exact dispatch literal that must exist for it.
 *
 * `uiFile` names which component owns the control: most inputs are controls on the actions
 * panel itself; `target-format` reuses the version picker that already lives on the wider
 * Chunker screen (the same picker local conversion uses), and `chunker-config` is composed
 * by the existing schema editor rather than being one field.
 *
 * A row whose literal is a prop binding also names `uiOwner`, the component that binding
 * must sit on. The Chunker screen renders one panel per conversion route and those panels
 * take similarly named props from the same variables, so the identical attribute text can
 * appear on more than one element; without the owner an unanchored substring search is
 * satisfied by the wrong element and stops being able to notice the right one disappearing.
 */
const INVENTORY = [
    {
        input: "chunker-config",
        uiFile: "panel",
        uiLiteral: ":config=\"cliConfig\"",
        // Composed by the existing guided/advanced schema editor and passed straight through
        // as the `config` prop; checked on the screen, not the panel. The neighbouring
        // <ChunkerContainerPanel> for the docker/ssh route carries the same `:config="cliConfig"`
        // text, so this row is anchored to the element it is actually about.
        checkOn: "screen",
        uiOwner: "ChunkerActionsPanel",
        dispatchLiteral: '"chunker-config": JSON.stringify(',
    },
    {
        input: "world-source",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-world-source"',
        dispatchLiteral: '"world-source": r.worldSource',
    },
    {
        input: "world",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-world"',
        dispatchLiteral: "world: record.world!",
    },
    {
        input: "world-repository",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-world-repository"',
        dispatchLiteral: '"world-repository":',
    },
    {
        input: "target-format",
        uiFile: "panel",
        uiLiteral: ":target-format=\"targetVersionId\"",
        // The panel receives the format as a prop from the screen's own version picker
        // (`data-test-base="chunker-version"`), the same list the local-conversion route
        // uses; checked on the screen, not the panel, and anchored to the panel element for
        // the same reason `chunker-config` is.
        checkOn: "screen",
        uiOwner: "ChunkerActionsPanel",
        dispatchLiteral: '"target-format": r.targetFormat',
    },
    {
        input: "prune-bounds",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-prune-mode"',
        dispatchLiteral: '"prune-bounds": r.pruneBounds',
    },
    {
        input: "output-name",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-output-name"',
        dispatchLiteral: '"output-name": record.dispatchedOutputName',
    },
    {
        input: "output",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-output"',
        dispatchLiteral: "output: r.output",
    },
    {
        input: "max-jobs",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-max-jobs"',
        dispatchLiteral: '"max-jobs": r.maxJobs',
    },
    {
        input: "regions-per-shard",
        uiFile: "panel",
        uiLiteral: 'data-test="chunker-actions-regions-per-shard"',
        dispatchLiteral: '"regions-per-shard": r.regionsPerShard',
    },
];

function workflowInputs() {
    if (!existsSync(WORKFLOW_PATH)) return [];
    const text = readFileSync(WORKFLOW_PATH, "utf8").replace(/\r\n/g, "\n");
    const block = /workflow_dispatch:\n\s+inputs:\n([\s\S]*?)\n(?:permissions:|on:|jobs:)/.exec(text);
    if (block === null) return [];
    // Top-level input names are indented exactly six spaces under `inputs:` in this file and
    // followed by a colon - a nested key (`description:`, `type:`, an `options:` entry) sits
    // deeper or starts with `-`, so this does not need to understand YAML in general.
    return [...block[1].matchAll(/^ {6}([a-z][a-z0-9-]*):\n/gm)].map((m) => m[1]);
}

function escapeForRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `source` carries `uiLiteral`, and - when the row names a `uiOwner` - carries it
 * inside that component's own opening tag rather than anywhere in the file. `[^>]*` cannot
 * cross the `>` that ends the tag it started in, so a sibling element that happens to carry
 * the same attribute text does not satisfy the row.
 */
function hasUiLiteral(source, row) {
    if (row.uiOwner === undefined) return source.includes(row.uiLiteral);
    const pattern = new RegExp(`<${escapeForRegExp(row.uiOwner)}\\b[^>]*${escapeForRegExp(row.uiLiteral)}`);
    return pattern.test(source);
}

function reportOf() {
    const declared = workflowInputs();
    const findings = [];

    const panel = existsSync(PANEL_PATH) ? readFileSync(PANEL_PATH, "utf8") : null;
    const screen = existsSync(SCREEN_PATH) ? readFileSync(SCREEN_PATH, "utf8") : null;
    const ipc = existsSync(IPC_PATH) ? readFileSync(IPC_PATH, "utf8") : null;

    if (panel === null) findings.push({ input: "*", why: `missing ${PANEL_PATH}` });
    if (screen === null) findings.push({ input: "*", why: `missing ${SCREEN_PATH}` });
    if (ipc === null) findings.push({ input: "*", why: `missing ${IPC_PATH}` });

    const byInput = new Map(INVENTORY.map((row) => [row.input, row]));

    for (const input of declared) {
        const row = byInput.get(input);
        if (row === undefined) {
            findings.push({ input, why: "declared in the workflow but absent from the hand-written UI inventory" });
            continue;
        }
        if (panel !== null && screen !== null) {
            const source = row.checkOn === "screen" ? screen : panel;
            const sourceName = row.checkOn === "screen" ? "ChunkerScreen.vue" : "ChunkerActionsPanel.vue";
            if (!hasUiLiteral(source, row)) {
                const where = row.uiOwner === undefined ? sourceName : `${sourceName}'s <${row.uiOwner}> element`;
                findings.push({ input, why: `expected literal ${JSON.stringify(row.uiLiteral)} in ${where}` });
            }
        }
        if (ipc !== null && !ipc.includes(row.dispatchLiteral)) {
            findings.push({ input, why: `expected literal ${JSON.stringify(row.dispatchLiteral)} in chunkeractions/ipc.ts's dispatchWorkflow call` });
        }
    }

    for (const row of INVENTORY) {
        if (!declared.includes(row.input)) {
            findings.push({ input: row.input, why: "named in the UI inventory but no longer declared by the workflow" });
        }
    }

    return { declared, findings };
}

function main() {
    const args = process.argv.slice(2);
    const { declared, findings } = reportOf();

    if (args.includes("--list")) {
        console.log(`chunk-world.yml declares ${String(declared.length)} workflow_dispatch inputs:`);
        for (const input of declared) console.log(`  - ${input}`);
        console.log(`the hand-written UI inventory covers ${String(INVENTORY.length)} of them.`);
        if (findings.length > 0) {
            console.log("gaps:");
            for (const finding of findings) console.log(`  - ${finding.input}: ${finding.why}`);
        }
        process.exit(findings.length > 0 ? 1 : 0);
    }

    if (findings.length > 0) {
        console.error("The Chunker GitHub Actions UI disagrees with chunk-world.yml's workflow_dispatch inputs:");
        for (const finding of findings) console.error(`  - ${finding.input}: ${finding.why}`);
        process.exit(1);
    }

    console.log(`Every one of chunk-world.yml's ${String(declared.length)} workflow_dispatch inputs has a UI control and a dispatch field.`);
}

main();
