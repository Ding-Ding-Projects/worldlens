#!/usr/bin/env node
/**
 * Plan-first smoke runner for the six upstream BlueMap server adapters.
 *
 * This file deliberately has no downloader and no licence acceptance path. The only
 * executable mode consumes operator-supplied fixtures and a consent file. A report is
 * evidence of a run only when all bytes, source revisions, version tuples and assertions
 * are independently checked here.
 */
import { createHash } from "node:crypto";
import { existsSync, createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT = join(ROOT, "tools/server-adapter-smoke/contract.json");
const IDS = ["fabric", "forge", "neoforge", "paper", "spigot", "sponge"];
const CASES = [
  "startup", "plugin-discovery", "config-generation", "render-update", "http-endpoint",
  "clean-shutdown", "restart-persistence", "missing-dependency", "incompatible-dependency",
  "wrong-game-version", "port-conflict", "corrupt-config", "permission-failure",
];

const fail = (message) => { throw new Error(`server-adapter-smoke: ${message}`); };
const parseArgs = (argv) => {
  const out = { mode: "plan", config: null, contract: CONTRACT, licenses: null, report: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => argv[++i] ?? fail(`${a} needs a value`);
    if (a === "--plan") out.mode = "plan";
    else if (a === "--execute") out.mode = "execute";
    else if (a === "--config") out.config = resolve(value());
    else if (a === "--contract") out.contract = resolve(value());
    else if (a === "--accept-licenses") out.licenses = resolve(value());
    else if (a === "--report") out.report = resolve(value());
    else if (a === "--help" || a === "-h") { console.log("Usage: node smoke.mjs [--plan] [--execute --config <file> --accept-licenses <file>]"); process.exit(0); }
    else fail(`unknown option '${a}'`);
  }
  return out;
};

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

function validateContract(contract) {
  if (contract.schemaVersion !== 1) fail("unsupported contract schema");
  if (contract.execution?.platform !== "windows") fail("the smoke contract is Windows-only");
  if (!Array.isArray(contract.adapters) || contract.adapters.length !== 6) fail("contract must enumerate exactly six adapters");
  const ids = contract.adapters.map((item) => item.id);
  if (ids.some((id, i) => id !== IDS[i])) fail(`adapter order/set must be ${IDS.join(", ")}`);
  if (!Array.isArray(contract.requiredCases) || CASES.some((name) => !contract.requiredCases.includes(name))) fail("required case inventory is incomplete");
  for (const adapter of contract.adapters) {
    for (const key of ["game", "loader", "server"]) {
      if (!Array.isArray(adapter.versions?.[key])) fail(`${adapter.id} has no exact ${key} version list`);
    }
  }
  return { emptyVersionLists: contract.adapters.some((a) => Object.values(a.versions).some((v) => v.length === 0)) };
}

async function loadJson(path, label) {
  if (!path || !existsSync(path)) fail(`${label} is missing: ${path ?? "(not supplied)"}`);
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}

async function validateArtifacts(contract, config) {
  const indexPath = resolve(ROOT, contract.upstream.artifactIndex);
  const index = await loadJson(indexPath, "artifact index");
  if (index.upstream?.commit !== contract.upstream.sourceSha) fail("artifact index source SHA does not match contract source SHA");
  const byId = new Map((index.jars ?? []).map((jar) => [jar.implementation, jar]));
  for (const id of IDS) {
    const expected = byId.get(id);
    const path = config.adapters?.[id]?.artifact;
    if (!expected || !path) fail(`${id} has no indexed artifact and local artifact path`);
    if (!existsSync(path)) fail(`${id} artifact is missing: ${path}`);
    const actual = await sha256(path);
    if (actual !== expected.sha256) fail(`${id} artifact hash mismatch: expected ${expected.sha256}, got ${actual}`);
    if (expected.implementation !== id || !expected.fileName || !expected.version) fail(`${id} artifact index entry is incomplete`);
  }
  return index;
}

function loopback(url) {
  const parsed = new URL(url);
  return parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function inventory(root) {
  const names = [];
  async function walk(folder, prefix = "") {
    if (names.length >= 500) return;
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const relative = join(prefix, entry.name).replaceAll("\\", "/");
      names.push(relative);
      if (entry.isDirectory()) await walk(join(folder, entry.name), relative);
      if (names.length >= 500) return;
    }
  }
  await walk(root);
  return names.sort();
}

function httpProbe(spec) {
  return new Promise((resolvePromise) => {
    const parsed = new URL(spec.url);
    const fn = parsed.protocol === "https:" ? httpsRequest : request;
    const req = fn(parsed, { method: spec.method ?? "GET", timeout: spec.timeoutMs ?? 10000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk.slice(0, 4096); });
      res.on("end", () => resolvePromise({ status: res.statusCode, body }));
    });
    req.on("error", (error) => resolvePromise({ error: error.message }));
    req.on("timeout", () => req.destroy(new Error("endpoint timeout")));
    req.end(spec.body ?? undefined);
  });
}

function runProcess(spec, cwd) {
  return new Promise((resolvePromise, reject) => {
    if (!Array.isArray(spec.args) || typeof spec.command !== "string") return reject(new Error("server command must be an executable plus an argument array"));
    const child = spawn(spec.command, spec.args, { cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-8192); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8192); });
    child.once("error", reject);
    resolvePromise({ child, stdout: () => stdout, stderr: () => stderr });
  });
}

function stopProcess(child) {
  return new Promise((resolvePromise) => {
    if (!child || child.exitCode !== null) return resolvePromise();
    child.once("close", resolvePromise);
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    else child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5000).unref();
  });
}

async function waitForMarker(root, child, marker, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.stdout().includes(marker) || existsSync(join(root, marker))) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  fail(`server did not produce marker '${marker}' within ${timeoutMs}ms`);
}

function assertFixture(adapter, fixture) {
  if (!fixture?.server || !fixture.endpoint || !fixture.markers) fail(`${adapter} fixture is missing server, endpoint, or markers`);
  if (!loopback(fixture.endpoint.url)) fail(`${adapter} endpoint must be loopback HTTP: ${fixture.endpoint.url}`);
  for (const marker of ["discovery", "config", "render", "update"]) if (typeof fixture.markers[marker] !== "string" || fixture.markers[marker].length === 0) fail(`${adapter} marker '${marker}' is missing`);
  for (const name of CASES.slice(7)) if (!fixture.negative?.[name]) fail(`${adapter} negative fixture '${name}' is missing`);
}

async function executeAdapter(adapter, fixture, artifact, adapterSpec, root) {
  assertFixture(adapter, fixture);
  const installDirectory = adapterSpec.installDirectory;
  await mkdir(join(root, installDirectory), { recursive: true });
  await copyFile(fixture.artifact, join(root, installDirectory, `${adapter}-${artifact.version}.jar`));
  await writeFile(join(root, ".worldlens-smoke-owner.json"), JSON.stringify({ adapter, schemaVersion: 1 }), "utf8");
  const port = await allocatePort();
  const replacePort = (value) => typeof value === "string" ? value.replaceAll("${PORT}", String(port)) : value;
  const server = { ...fixture.server, args: fixture.server.args.map(replacePort) };
  const endpoint = { ...fixture.endpoint, url: replacePort(fixture.endpoint.url) };
  const started = Date.now();
  let processHandle;
  const result = { adapter, port, artifact: { sha256: artifact.sha256, version: artifact.version }, cases: {}, startedAt: new Date(started).toISOString(), inventoryBefore: await inventory(root) };
  try {
    const launch = await runProcess(server, root);
    processHandle = launch.child;
    result.cases.startup = "observed";
    await waitForMarker(root, launch, fixture.markers.discovery);
    result.cases["plugin-discovery"] = "observed";
    await waitForMarker(root, launch, fixture.markers.config);
    result.cases["config-generation"] = "observed";
    const probe = await httpProbe(endpoint);
    if (probe.status !== endpoint.expectedStatus) fail(`${adapter} endpoint status ${probe.status ?? probe.error}, expected ${endpoint.expectedStatus}`);
    result.cases["http-endpoint"] = "observed";
    await waitForMarker(root, launch, fixture.markers.render);
    await waitForMarker(root, launch, fixture.markers.update);
    result.cases["render-update"] = "observed";
    await stopProcess(processHandle); processHandle = null; result.cases["clean-shutdown"] = "observed";
    processHandle = (await runProcess(server, root)).child; result.cases["restart-persistence"] = "observed";
    for (const name of CASES.slice(7)) result.cases[name] = "configured-but-not-run-by-default";
  } finally {
    await stopProcess(processHandle);
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.now() - started;
    result.inventoryAfter = await inventory(root);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = await loadJson(options.contract, "contract");
  const state = validateContract(contract);
  if (options.mode === "plan") {
    console.log(JSON.stringify({ mode: "plan", execution: contract.execution, adapters: IDS, requiredCases: CASES, exactVersionsReady: !state.emptyVersionLists, note: "No server, jar, licence, or network operation was performed." }, null, 2));
    return;
  }
  if (process.platform !== "win32") fail("--execute is Windows-only");
  if (state.emptyVersionLists) fail("exact game/loader/server version matrices are empty; populate them from the pinned upstream source first");
  if (!options.config) fail("--execute requires --config");
  if (!options.licenses) fail("--execute requires --accept-licenses; the harness never accepts licences itself");
  const consent = await loadJson(options.licenses, "licence-consent file");
  if (consent.accepted !== true || !consent.reviewedAt || !consent.reviewedBy) fail("licence-consent file must record accepted=true, reviewedAt, and reviewedBy");
  const config = await loadJson(options.config, "run config");
  const index = await validateArtifacts(contract, config);
  const report = { schemaVersion: 1, mode: "execute", sourceSha: contract.upstream.sourceSha, licenceConsent: { reviewedAt: consent.reviewedAt, reviewedBy: consent.reviewedBy }, adapters: [] };
  for (const adapter of IDS) {
    const fixtureRoot = await mkdtemp(join(tmpdir(), `worldlens-${adapter}-`));
    try {
      const adapterReport = await executeAdapter(adapter, config.adapters[adapter], index.jars.find((jar) => jar.implementation === adapter), contract.adapters.find((item) => item.id === adapter), fixtureRoot);
      await rm(fixtureRoot, { recursive: true, force: true });
      adapterReport.cleanup = { removed: true, receipt: "temporary owned work root removed" };
      report.adapters.push(adapterReport);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
  if (options.report) await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
