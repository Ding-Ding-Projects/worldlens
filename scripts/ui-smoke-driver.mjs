#!/usr/bin/env node

/**
 * Entry point for the final smoke run.
 *
 * This file owns preflight and evidence policy. The existing run-worldlens driver owns the
 * Lowlevel MCP transport and background input. Keeping that transport in one tested skill
 * avoids a second homemade input path that could accidentally touch the visible desktop.
 * Until the integrated candidate is ready, --plan-only is the only supported mode.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateMatrix } from "./ui-smoke-matrix.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "docs/ui-smoke/smoke-matrix.json");

function parse(argv) {
  const args = { planOnly: false, execute: false, report: null, matrix: matrixPath };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--plan-only") args.planOnly = true;
    else if (value === "--execute") args.execute = true;
    else if (value === "--matrix") args.matrix = resolve(argv[++index]);
    else if (value === "--report") args.report = resolve(argv[++index]);
    else if (value === "--built-artifact") args.builtArtifact = resolve(argv[++index]);
    else if (value === "--profile") args.profile = resolve(argv[++index]);
    else if (value === "--desktop") args.desktop = argv[++index];
    else if (value === "--manifest") args.manifest = resolve(argv[++index]);
    else throw new Error(`unknown driver argument: ${value}`);
  }
  return args;
}

function fail(message) {
  throw new Error(`ui-smoke-driver: ${message}`);
}

function main(argv) {
  const args = parse(argv);
  const matrix = JSON.parse(readFileSync(args.matrix, "utf8"));
  const summary = validateMatrix(matrix);
  const report = {
    schemaVersion: 1,
    status: args.planOnly || !args.execute ? "plan-only" : "not-started",
    matrix: args.matrix.replaceAll("\\", "/"),
    matrixCommit: null,
    driver: matrix.execution.driver,
    rowCount: summary.rowCount,
    requiredRouteCount: summary.routeCount,
    lowlevel: {
      route: "cheap-lowlevel-hidden-desktop",
      targetRule: "exactly one page target with the expected loopback URL",
      windowRule: "resolve Chrome_WidgetWin_1 with non-empty title and non-zero size, never by index",
      inputRule: "physical or background input only, never visible desktop input",
    },
    captures: [],
  };

  if (args.execute && !args.planOnly) {
    if (matrix.execution.finalSmoke !== "ready") fail("matrix finalSmoke is not ready; integrate the candidate before opening the app");
    for (const required of ["builtArtifact", "profile", "desktop", "manifest"]) {
      if (!args[required]) fail(`--${required.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required for --execute`);
    }
    if (!process.env.WORLDLENS_CDP_PORT) fail("WORLDLENS_CDP_PORT is required after a cheap Lowlevel hidden-desktop launch");
    fail("execution is intentionally delegated to .claude/skills/run-worldlens/driver.mjs after integration; no app was launched by this pre-integration lane");
  }

  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`ui-smoke-driver: plan-only, ${summary.rowCount} rows, ${summary.routeCount} required routes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
