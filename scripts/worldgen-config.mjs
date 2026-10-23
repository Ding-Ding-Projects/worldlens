#!/usr/bin/env node
/**
 * Validates a world-generation configuration on a GitHub Actions runner, with the same code
 * the desktop application uses to build and check it.
 *
 * `.github/workflows/worldgen.yml` receives the document as a `workflow_dispatch` input. The
 * workflow binds that input to an environment variable and runs this script, which reads
 * it, validates it through `@worldlens/shared`'s `parseWorldGenerationConfig` (built just
 * before, by the same job), writes the normalised copy to a file for the receipt, and emits
 * the exact CLI flags and names the following steps need as step outputs. No value from the
 * input is ever interpolated into shell text; everything crosses as a file or an output.
 *
 *   node scripts/worldgen-config.mjs --env GENERATION_CONFIG --write generation-config.json \
 *       --github-output "$GITHUB_OUTPUT"
 *
 * Exit codes: 0 valid, 1 refused (the reason is printed as an Actions error annotation),
 * 2 usage.
 */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_DIST = join(
  REPO_ROOT,
  "design/packages/shared/dist/worldGenerationConfig.js",
);

function usage(message) {
  process.stderr.write(
    `${message}\n\nUsage: node scripts/worldgen-config.mjs (--env NAME | --file PATH) [--write PATH] [--github-output PATH]\n`,
  );
  return 2;
}

export async function main(argv) {
  let envName = null;
  let file = null;
  let write = null;
  let githubOutput = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "--env":
        envName = next();
        break;
      case "--file":
        file = next();
        break;
      case "--write":
        write = next();
        break;
      case "--github-output":
        githubOutput = next();
        break;
      default:
        return usage(`Unknown argument: ${arg}`);
    }
  }
  if ((envName === null) === (file === null))
    return usage("Give exactly one of --env or --file.");

  const text =
    envName !== null
      ? (process.env[envName] ?? "")
      : readFileSync(file, "utf8");
  if (text.trim() === "") {
    console.log(
      `::error::The generation configuration is empty. Dispatch the workflow with the JSON the application exports.`,
    );
    return 1;
  }

  let shared;
  try {
    shared = await import(pathToFileURL(SHARED_DIST).href);
  } catch (error) {
    console.log(
      `::error::@worldlens/shared is not built (${SHARED_DIST}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const result = shared.parseWorldGenerationConfigText(text);
  if (!result.ok) {
    console.log(
      `::error::Refusing the generation configuration: ${result.message}`,
    );
    return 1;
  }
  const { config } = result;
  const cliArguments = shared.worldgenCliArgumentsFor(config);
  if (cliArguments === null) {
    console.log(
      `::error::The '${config.engine}' engine has no runner on GitHub Actions yet. Only the synthetic engine can generate here; choose it in the application and dispatch again.`,
    );
    return 1;
  }

  if (write !== null)
    writeFileSync(write, JSON.stringify(config, null, 2) + "\n");

  const outputs = {
    "world-name": config.worldName,
    seed: String(config.seed),
    size: String(config.size),
    format: config.format,
    engine: config.engine,
  };
  if (githubOutput !== null) {
    appendFileSync(
      githubOutput,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  }
  process.stdout.write(
    `Generation configuration accepted: ${config.worldName}, seed ${config.seed}, ${config.size}x${config.size} blocks, format ${config.format}, engine ${config.engine}.\n` +
      `worldgen ${cliArguments.join(" ")}\n`,
  );
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.log(
        `::error::${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    },
  );
}
