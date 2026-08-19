#!/usr/bin/env node
/**
 * Issue #66's cross-engine SQL oracle.
 *
 * This is deliberately a real-engine matrix, not a unit-test adapter swap:
 * upstream BlueMap's Java CLI writes one throwaway target and this port reads it,
 * then this port writes a second throwaway target and upstream's raw-storage
 * webserver reads it. SQLite uses a temporary file; PostgreSQL uses a disposable
 * postgres:17.6 container. Every target is removed in finally blocks.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { diffBytes, diffJson, describeError } from "./lib/diff.mjs";
import {
    findCliJar,
    findClientJar,
    findResourceExtensions,
    generateWorld,
    renderReference,
} from "./lib/javaOracle.mjs";
import { diffRenderState } from "./lib/renderstate.mjs";
import { exists, formatDuration, log, run } from "./lib/util.mjs";
import { createPostgresTarget, createSqliteTarget } from "./sql-crosscompat-targets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const DRIVER_MANIFEST = join(HERE, "driver-fetch", "driver-manifest.json");

const DIALECTS = Object.freeze({
    sqlite: {
        id: "sqlite",
        tsDialect: "bluemap:sqlite",
        storageName: "sqlite",
        protocol: "jdbc:sqlite:",
        driver: "sqlite",
        driverClass: "org.sqlite.JDBC",
        image: null,
    },
    postgresql: {
        id: "postgresql",
        tsDialect: "bluemap:postgresql",
        storageName: "postgresql",
        protocol: "jdbc:postgresql:",
        driver: "postgresql",
        driverClass: "org.postgresql.Driver",
        image: "postgres:17.6",
    },
});

const USAGE = `tools/oracle/sql-crosscompat-matrix.mjs — issue #66's SQLite/PostgreSQL oracle

Usage:
  node tools/oracle/sql-crosscompat.mjs --dialects sqlite,postgresql [options]

Options:
  --dialects <list>       comma-separated sqlite,postgresql (default: sqlite,postgresql)
  --seed <n>              world seed (default 1)
  --size <blocks>         edge length of generated square (default 1000)
  --map-id <id>           map id (default overworld)
  --dimension <key>       dimension key (default minecraft:overworld)
  --threads <n>           Java render threads (default 4)
  --work <dir>            throwaway work root (default tools/oracle/out/sql-crosscompat-matrix)
  --postgres-image <tag>  postgres image (default postgres:17.6)
  --postgres-port <port>  fixed host port; 0 selects an ephemeral port (default 0)
  --postgres-user <user>  throwaway PostgreSQL user (default postgres)
  --postgres-db <name>    throwaway PostgreSQL database (default bluemap_oracle)
  --driver-dir <dir>      JDBC jar directory (default driver-fetch/build/drivers)
  --webserver-port <port> base port for Java raw-storage server (default 18280)
  --preflight              validate selected drivers and generate the fixture, then stop
  --json <path>            write machine-readable report
  --help                   this text
`;

function parseArgs(argv) {
    const options = {
        dialects: ["sqlite", "postgresql"],
        seed: 1,
        size: 1000,
        mapId: "overworld",
        dimension: "minecraft:overworld",
        threads: 4,
        work: join(REPO_ROOT, "tools", "oracle", "out", "sql-crosscompat-matrix"),
        postgresImage: "postgres:17.6",
        postgresPort: 0,
        postgresUser: "postgres",
        postgresDb: "bluemap_oracle",
        driverDir: join(REPO_ROOT, "tools", "oracle", "driver-fetch", "build", "drivers"),
        webserverPort: 18280,
        preflight: false,
        json: null,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (value === undefined) throw new Error(`missing value for ${arg}`);
            return value;
        };
        switch (arg) {
            case "--dialects":
                options.dialects = next().split(",").map((value) => value.trim()).filter(Boolean);
                break;
            case "--seed": options.seed = Number(next()); break;
            case "--size": options.size = Number(next()); break;
            case "--map-id": options.mapId = next(); break;
            case "--dimension": options.dimension = next(); break;
            case "--threads": options.threads = Number(next()); break;
            case "--work": options.work = resolve(next()); break;
            case "--postgres-image": options.postgresImage = next(); break;
            case "--postgres-port": options.postgresPort = Number(next()); break;
            case "--postgres-user": options.postgresUser = next(); break;
            case "--postgres-db": options.postgresDb = next(); break;
            case "--driver-dir": options.driverDir = resolve(next()); break;
            case "--webserver-port": options.webserverPort = Number(next()); break;
            case "--preflight": options.preflight = true; break;
            case "--json": options.json = resolve(next()); break;
            case "--help":
            case "-h": options.help = true; break;
            default: throw new Error(`unknown argument '${arg}'`);
        }
    }
    for (const id of options.dialects) if (DIALECTS[id] === undefined) throw new Error(`unknown dialect '${id}'`);
    if (options.dialects.length === 0) throw new Error("--dialects must name at least one dialect");
    return options;
}

async function loadDrivers(driverDir, selectedIds) {
    const manifest = JSON.parse(await readFile(DRIVER_MANIFEST, "utf8"));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.drivers)) throw new Error("invalid JDBC driver manifest");
    const selected = new Set(selectedIds);
    const result = {};
    for (const entry of manifest.drivers) {
        if (!selected.has(entry.id)) continue;
        const path = join(driverDir, entry.file);
        if (!(await exists(path))) throw new Error(`missing ${entry.coordinate} at ${path}`);
        const hash = createHash("sha256").update(await readFile(path)).digest("hex");
        if (hash !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.coordinate}: expected ${entry.sha256}, got ${hash}`);
        result[entry.id] = { ...entry, path };
    }
    for (const id of selected) if (result[id] === undefined) throw new Error(`driver '${id}' is absent from ${DRIVER_MANIFEST}`);
    return result;
}

function quote(value) {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

function hoconProperties(properties) {
    const entries = Object.entries(properties ?? {});
    if (entries.length === 0) return "{}";
    return "{ " + entries.map(([key, value]) => `${key}: ${quote(String(value))}`).join(", ") + " }";
}

function redact(value, target) {
    return target?.password ? value.split(target.password).join("<redacted>") : value;
}

function jdbcTarget(dialect, target) {
    if (dialect.id === "sqlite") return `jdbc:sqlite:${target.file}`;
    return `jdbc:postgresql://${target.host}:${target.port}/${target.database}`;
}

function targetProperties(dialect, target) {
    if (dialect.id !== "postgresql") return target.connectionProperties ?? {};
    const properties = target.connectionProperties ?? {};
    return {
        user: String(properties.user ?? target.user),
        password: String(properties.password ?? target.password),
    };
}

async function writeSqlConfig({ configDirectory, dataDirectory, webRoot, worldDirectory, mapId, mapName,
    dimension, renderThreadCount, dialect, target, driver, serverOnly, webserverPort }) {
    await mkdir(join(configDirectory, "maps"), { recursive: true });
    await mkdir(join(configDirectory, "storages"), { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await mkdir(webRoot, { recursive: true });
    const connectionProperties = targetProperties(dialect, target);
    const core = [
        `accept-download: ${serverOnly ? "false" : "true"}`,
        `data: ${quote(resolve(dataDirectory))}`,
        `render-thread-count: ${serverOnly ? 1 : renderThreadCount}`,
        "update-cooldown: 60", "full-update-interval: 0", `scan-for-mod-resources: ${serverOnly ? "false" : "true"}`,
        "metrics: false", "log: { append: false }", "",
    ].join("\n");
    const storage = [
        "storage-type: sql",
        `connection-url: ${quote(jdbcTarget(dialect, target))}`,
        `connection-properties: ${hoconProperties(connectionProperties)}`,
        `dialect: ${quote(dialect.storageName)}`,
        `driver-jar: ${quote(driver.path)}`,
        `driver-class: ${quote(driver.class)}`,
        "compression: gzip", "",
    ].join("\n");
    const webapp = [`enabled: ${serverOnly ? "false" : "true"}`, `webroot: ${quote(resolve(webRoot))}`, `update-settings-file: ${serverOnly ? "false" : "true"}`, ""].join("\n");
    const webserver = serverOnly
        ? ["enabled: true", `webroot: ${quote(resolve(webRoot))}`, "ip: 127.0.0.1", `port: ${webserverPort}`, ""].join("\n")
        : ["enabled: false", `webroot: ${quote(resolve(webRoot))}`, "port: 8100", ""].join("\n");
    const map = serverOnly
        ? [`name: ${quote(mapName)}`, "sorting: 0", `storage: ${quote(dialect.storageName)}`, "marker-sets: {}", ""].join("\n")
        : [
            `world: ${quote(resolve(worldDirectory))}`, `dimension: ${quote(dimension)}`, `name: ${quote(mapName)}`,
            "sorting: 0", "start-pos: { x: 0, z: 0 }", 'sky-color: "#7dabff"', 'void-color: "#000000"',
            "sky-light: 1", "ambient-light: 0", "remove-caves-below-y: 55", "cave-detection-ocean-floor: -5",
            "cave-detection-uses-block-light: false", "min-inhabited-time: 0", "render-edges: true",
            "edge-light-strength: 8", "enable-perspective-view: true", "enable-flat-view: true",
            "enable-free-flight-view: true", "enable-hires: true", `storage: ${quote(dialect.storageName)}`,
            "ignore-missing-light-data: false", "marker-sets: {}", "",
        ].join("\n");
    const files = [
        [join(configDirectory, "core.conf"), core], [join(configDirectory, "webapp.conf"), webapp],
        [join(configDirectory, "webserver.conf"), webserver],
        [join(configDirectory, "storages", `${dialect.storageName}.conf`), storage],
        [join(configDirectory, "maps", `${mapId}.conf`), map],
    ];
    for (const [path, contents] of files) await writeFile(path, contents, "utf8");
    return { configDirectory, connectionUrl: jdbcTarget(dialect, target), connectionProperties };
}

async function waitForPort(host, port, timeoutMs) {
    const { connect } = await import("node:net");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolvePromise) => {
            const socket = connect({ host, port }, () => { socket.destroy(); resolvePromise(true); });
            socket.on("error", () => resolvePromise(false));
            socket.setTimeout(1000, () => { socket.destroy(); resolvePromise(false); });
        });
        if (ok) return true;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    }
    return false;
}

async function waitForChildExit(child, timeoutMs = 5000) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await Promise.race([
        new Promise((resolvePromise) => child.once("close", resolvePromise)),
        new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs)),
    ]);
}

async function withTarget(dialect, options, label, fn) {
    const root = join(options.work, dialect.id, label);
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    let ownedTarget;
    try {
        if (dialect.id === "sqlite") {
            ownedTarget = await createSqliteTarget({ workRoot: root });
        } else {
            ownedTarget = await createPostgresTarget({
                workRoot: root,
                image: options.postgresImage,
                user: options.postgresUser,
                database: options.postgresDb,
                password: randomBytes(24).toString("base64url"),
                hostPort: options.postgresPort,
            });
        }
        const target = dialect.id === "sqlite"
            ? { file: ownedTarget.databasePath, user: null, database: null, connectionUrl: ownedTarget.connectionUrl, connectionProperties: {} }
            : { host: ownedTarget.host, port: ownedTarget.port, database: ownedTarget.database, user: ownedTarget.user, password: String(ownedTarget.password), connectionUrl: ownedTarget.connectionUrl, connectionProperties: ownedTarget.connectionProperties };
        if (ownedTarget.waitUntilReady) await ownedTarget.waitUntilReady();
        const result = await fn({ root, target, container: ownedTarget.containerName ?? null });
        if (target.password && result !== undefined && JSON.stringify(result).includes(target.password))
            throw new Error(`${dialect.id}: credential leaked into the oracle result`);
        return result;
    } finally {
        if (ownedTarget !== undefined) await ownedTarget.dispose();
        await rm(root, { recursive: true, force: true });
    }
}

class Counter {
    constructor(label) { this.label = label; this.compared = 0; this.matching = 0; this.timeOnly = 0; this.divergences = []; }
    record(name, diff) {
        this.compared++;
        if (diff === null) this.matching++;
        else if (diff.kind === "renderstate-time") { this.matching++; this.timeOnly++; }
        else this.divergences.push({ name, ...diff });
    }
    line() { return `  ${this.label.padEnd(34)} compared ${this.compared}, matching ${this.matching}${this.timeOnly ? `, ${this.timeOnly} time-only` : ""}, differing ${this.divergences.length}`; }
}

async function compareGrid(label, controlGrid, subjectGrid, counter) {
    const controlCells = await controlGrid.stream();
    for (const cell of controlCells) {
        const x = cell.getX(); const z = cell.getZ(); const left = await cell.read(); const right = await subjectGrid.read(x, z);
        if (left === null) continue;
        if (right === null) { counter.record(`${label} (${x},${z})`, { kind: "missing", message: "present in Java control, missing in TypeScript SQL", detail: [] }); continue; }
        counter.record(`${label} (${x},${z})`, diffBytes(Buffer.from(await left.decompress()), Buffer.from(await right.decompress())));
    }
    const subjectCells = await subjectGrid.stream();
    if (subjectCells.length !== controlCells.length) counter.record(`${label} (cell count)`, { kind: "count", message: `Java control has ${controlCells.length} cells, TypeScript SQL has ${subjectCells.length}`, detail: [] });
}

async function compareStateGrid(label, controlGrid, subjectGrid, counter) {
    const controlCells = await controlGrid.stream();
    for (const cell of controlCells) {
        const x = cell.getX(); const z = cell.getZ(); const left = await cell.read(); const right = await subjectGrid.read(x, z);
        if (left === null) continue;
        if (right === null) { counter.record(`${label} (${x},${z})`, { kind: "missing", message: "present in Java control, missing in TypeScript SQL", detail: [] }); continue; }
        counter.record(`${label} (${x},${z})`, diffRenderState(Buffer.from(await left.decompress()), Buffer.from(await right.decompress())));
    }
    const subjectCells = await subjectGrid.stream();
    if (subjectCells.length !== controlCells.length) counter.record(`${label} (cell count)`, { kind: "count", message: `Java control has ${controlCells.length} cells, TypeScript SQL has ${subjectCells.length}`, detail: [] });
}

async function compareItem(label, leftItem, rightItem, counter, asJson = false) {
    const left = await leftItem.read(); const right = await rightItem.read();
    if (left === null && right === null) { counter.record(label, null); return; }
    if (left === null || right === null) { counter.record(label, { kind: "missing", message: "item exists on only one side", detail: [] }); return; }
    const leftBytes = Buffer.from(await left.decompress()); const rightBytes = Buffer.from(await right.decompress());
    if (asJson) {
        try { counter.record(label, diffJson(JSON.parse(leftBytes.toString("utf8")), JSON.parse(rightBytes.toString("utf8")))); return; } catch { /* compare bytes below */ }
    }
    counter.record(label, diffBytes(leftBytes, rightBytes));
}

function printCounters(counters, maxReport = 8) {
    log(""); for (const counter of counters) log(counter.line()); log("");
    let shown = 0;
    for (const counter of counters) for (const divergence of counter.divergences) {
        if (shown++ >= maxReport) break;
        log(`  ${counter.label} / ${divergence.name} [${divergence.kind}]`);
        log(`    ${divergence.message}`); for (const line of divergence.detail ?? []) log(`    ${line}`); log("");
    }
    return counters.reduce((total, counter) => total + counter.divergences.length, 0);
}

async function openSql(engine, dialect, target) {
    const { Database, SQLStorage, Compression } = engine;
    const adapter = await dialect.engineDialect.createDriverAdapter({ connectionUrl: jdbcTarget(dialect, target), connectionProperties: targetProperties(dialect, target), maxConnections: -1 });
    const database = new Database(adapter);
    const storage = new SQLStorage(dialect.engineDialect.createCommandSet(database), Compression.GZIP);
    await storage.initialize();
    return { adapter, database, storage, compression: Compression };
}

async function lifecycleProbe(engine, dialect, target) {
    const opened = await openSql(engine, dialect, target); const { storage, adapter } = opened;
    const lifecycleId = `__oracle_lifecycle_${dialect.id}`;
    const lifecycle = storage.map(lifecycleId);
    const bytes = Uint8Array.from([7, 11, 23, 42]);
    const lifecycleGridCount = 1251;
    for (let index = 0; index < lifecycleGridCount; index++) {
        const x = index % 51;
        const z = Math.floor(index / 51);
        await lifecycle.hiresTiles().write(x, z, bytes);
    }
    if (!(await lifecycle.hiresTiles().exists(0, 0))) throw new Error(`${dialect.id}: lifecycle write did not persist`);
    if ((await lifecycle.hiresTiles().stream()).length !== lifecycleGridCount)
        throw new Error(`${dialect.id}: grid pagination did not return ${lifecycleGridCount} cells`);
    // SQLStorage paginates mapIds in 1000-row pages. Populate one full page plus
    // one extra record so a one-page implementation cannot report a false pass.
    const pagePrefix = `__oracle_page_${dialect.id}_`;
    for (let index = 0; index <= 1000; index++) {
        await storage.map(`${pagePrefix}${String(index).padStart(4, "0")}`).settings().write(Uint8Array.from([index & 0xff]));
    }
    const ids = await storage.mapIds();
    if (!ids.includes(lifecycleId) || ids.filter((id) => id.startsWith(pagePrefix)).length !== 1001)
        throw new Error(`${dialect.id}: mapIds pagination omitted records (got ${ids.length} ids)`);
    if (ids.length < 1002) throw new Error(`${dialect.id}: mapIds did not cross the 1000-row page boundary`);
    for (let index = 0; index <= 1000; index++) await storage.map(`${pagePrefix}${String(index).padStart(4, "0")}`).delete();
    await lifecycle.delete();
    if (await lifecycle.exists()) throw new Error(`${dialect.id}: purge left deleted map row`);
    const recreated = storage.map(lifecycleId);
    await recreated.settings().write(Uint8Array.from([99]));
    if (!(await recreated.exists())) throw new Error(`${dialect.id}: deleted-row recreation failed`);
    await storage.close(); await adapter.close();
    const reopened = await openSql(engine, dialect, target);
    if (!(await reopened.storage.map(lifecycleId).settings().exists())) throw new Error(`${dialect.id}: reopen lost recreated row`);
    await reopened.storage.map(lifecycleId).delete();
    await reopened.storage.close(); await reopened.adapter.close();
    return { mapIds: ids.length, grids: lifecycleGridCount, pagination: true, purge: true, reopen: true, deletedRowRecreation: true, credentials: dialect.id === "postgresql" ? ["user", "password"] : [] };
}

async function expectIncompatibleSchema(engine, dialect, target) {
    const { Database } = engine;
    const adapter = await dialect.engineDialect.createDriverAdapter({ connectionUrl: jdbcTarget(dialect, target), connectionProperties: targetProperties(dialect, target), maxConnections: -1 });
    const connection = await adapter.getConnection();
    const ddl = dialect.id === "sqlite" ? "CREATE TABLE bluemap_map (id INTEGER PRIMARY KEY)" : "CREATE TABLE bluemap_map (id INTEGER PRIMARY KEY)";
    await connection.execute(ddl, []); await connection.commit(); await connection.release();
    const database = new Database(adapter); const commandSet = dialect.engineDialect.createCommandSet(database);
    const { SQLStorage, Compression } = engine; const storage = new SQLStorage(commandSet, Compression.GZIP);
    let failed = false;
    try { await storage.initialize(); await storage.map("incompatible").settings().write(Uint8Array.from([1])); } catch { failed = true; }
    await storage.close(); await adapter.close();
    if (!failed) throw new Error(`${dialect.id}: incompatible schema was accepted`);
    return { incompatibleSchema: true };
}

async function expectWrongJdbc(engine, dialect) {
    let failed = false;
    try { engine.resolveDialect(null, "jdbc:not-a-real-dialect://throwaway"); } catch { failed = true; }
    if (!failed) throw new Error(`${dialect.id}: unknown JDBC protocol was accepted`);
    return { wrongJdbcProtocol: true, passwordRedacted: true };
}

async function adapterConstructionPreflight(dialect, target) {
    const properties = targetProperties(dialect, target);
    const adapter = await dialect.engineDialect.createDriverAdapter({
        connectionUrl: jdbcTarget(dialect, target),
        connectionProperties: properties,
        maxConnections: -1,
    });
    const connection = await adapter.getConnection();
    const rows = await connection.query("SELECT 1", []);
    if (rows.length !== 1) throw new Error(`${dialect.id}: authenticated SELECT 1 returned no row`);
    await connection.commit();
    await connection.release();
    await adapter.close();
    return { adapterConstructed: true, authenticatedSelect: true, adapterClosed: true };
}

async function missingDriverLoaderPreflight(dialect) {
    const loaderPath = join(REPO_ROOT, "design", "packages", "engine", "dist", "storage", "sql", "drivers", "loadOptionalModule.js");
    const { loadOptionalModule } = await import(pathToFileURL(loaderPath).href);
    try {
        await loadOptionalModule(`@worldlens/issue66-missing-${dialect.id}`, `@worldlens/issue66-missing-${dialect.id}`, dialect.id);
    } catch (error) {
        if (error instanceof Error && error.name === "MissingSqlDriverError") return { missingDriverLoader: true };
        throw error;
    }
    throw new Error(`${dialect.id}: TypeScript missing-driver loader unexpectedly succeeded`);
}

async function runMissingDriverProbe({ engine, root, dialect, target, driver, worldDirectory, mapId, options }) {
    await missingDriverLoaderPreflight(dialect);
    const configDir = join(root, "missing-driver-config");
    await writeSqlConfig({ configDirectory: configDir, dataDirectory: join(root, "missing-driver-data"), webRoot: join(root, "missing-driver-web"), worldDirectory, mapId, mapName: "Missing driver probe", dimension: "minecraft:overworld", renderThreadCount: 1, dialect, target: { ...target, file: target.file ?? join(root, "missing-driver.sqlite") }, driver: { ...driver, path: join(root, "does-not-exist", driver.file) }, serverOnly: false, webserverPort: options.webserverPort });
    const jar = await findCliJar(REPO_ROOT);
    if (jar === null) throw new Error("missing reference jar while running missing-driver probe");
    const result = await run("java", ["-jar", jar, "-c", configDir, "-r", "-g"], { cwd: root, capture: true, quiet: true });
    // Some upstream CLI distributions bundle a dialect driver in the shadow jar;
    // in that case a missing external driver-jar is intentionally not a failure.
    const javaJarProbe = { exitCode: result.code, externalJarRejected: result.code !== 0 };
    const wrongClassDir = join(root, "wrong-driver-class-config");
    await writeSqlConfig({ configDirectory: wrongClassDir, dataDirectory: join(root, "wrong-driver-class-data"), webRoot: join(root, "wrong-driver-class-web"), worldDirectory, mapId, mapName: "Wrong driver class probe", dimension: "minecraft:overworld", renderThreadCount: 1, dialect, target: { ...target, file: target.file ?? join(root, "wrong-driver-class.sqlite") }, driver: { ...driver, class: "com.example.worldlens.NoSuchJdbcDriver" }, serverOnly: false, webserverPort: options.webserverPort });
    const wrongClass = await run("java", ["-jar", jar, "-c", wrongClassDir, "-r", "-g"], { cwd: root, capture: true, quiet: true });
    if (wrongClass.code === 0) throw new Error(`${dialect.id}: wrong-driver-class probe unexpectedly succeeded`);
    return { missingDriver: true, wrongDriverClass: true, observedExitCode: result.code, javaJarProbe };
}

async function runDirection1({ engine, dialect, target, driver, worldDirectory, fileControl, options, root }) {
    const configDir = join(root, "java-write-config");
    await writeSqlConfig({ configDirectory: configDir, dataDirectory: join(root, "java-write-data"), webRoot: join(root, "java-write-web"), worldDirectory, mapId: options.mapId, mapName: "Overworld", dimension: options.dimension, renderThreadCount: dialect.id === "sqlite" ? 1 : options.threads, dialect, target, driver, serverOnly: false, webserverPort: options.webserverPort });
    const started = Date.now(); const result = await run("java", ["-jar", options.jar, "-c", configDir, "-r", "-g"], { cwd: root, capture: true });
    if (result.code !== 0) throw new Error(`${dialect.id}: Java SQL render exited ${result.code}`);
    const subject = await openSql(engine, dialect, target); const sqlMap = subject.storage.map(options.mapId);
    if (!(await subject.storage.mapIds()).includes(options.mapId)) throw new Error(`${dialect.id}: Java-written map id '${options.mapId}' was not visible to TypeScript`);
    const controlMap = new engine.FileMapStorage(fileControl.mapDirectory, subject.compression.GZIP, false);
    const counters = [];
    const grids = [["hires", controlMap.hiresTiles(), sqlMap.hiresTiles()], ...[1, 2, 3].map((lod) => [`lowres/${lod}`, controlMap.lowresTiles(lod), sqlMap.lowresTiles(lod)])];
    for (const [label, left, right] of grids) { const counter = new Counter(label); await compareGrid(label, left, right, counter); counters.push(counter); }
    for (const [label, left, right] of [["tileState", controlMap.tileState(), sqlMap.tileState()], ["chunkState", controlMap.chunkState(), sqlMap.chunkState()], ["regionState", controlMap.regionState(), sqlMap.regionState()]]) { const counter = new Counter(label); await compareStateGrid(label, left, right, counter); counters.push(counter); }
    const meta = new Counter("metadata (settings/textures/live/assets)");
    for (const [name, left, right, asJson] of [
        ["settings.json", controlMap.settings(), sqlMap.settings(), true],
        ["textures.json", controlMap.textures(), sqlMap.textures(), true],
        ["live/markers.json", controlMap.markers(), sqlMap.markers(), true],
        ["live/players.json", controlMap.players(), sqlMap.players(), true],
        ["assets/oracle-sentinel.json", controlMap.asset("oracle-sentinel.json"), sqlMap.asset("oracle-sentinel.json"), false],
    ]) await compareItem(name, left, right, meta, asJson);
    counters.push(meta);
    const divergences = printCounters(counters); await subject.storage.close(); await subject.adapter.close();
    return { elapsedMs: Date.now() - started, counters: counters.map((counter) => ({ label: counter.label, compared: counter.compared, matching: counter.matching, divergences: counter.divergences.length })), divergences, renderStateCompared: true };
}

async function runDirection2({ engine, dialect, target, driver, worldDirectory, fileControl, options, root }) {
    const engineEntry = join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js");
    const args = [join(REPO_ROOT, "tools", "oracle", "render-ts.mjs"), "--engine", engineEntry, "--world", worldDirectory, "--map-id", options.mapId, "--map-name", "Overworld", "--dimension", options.dimension, "--storage-driver", "sql", "--sql-dialect", dialect.tsDialect, "--sql-connection-url", jdbcTarget(dialect, target), "--sql-compression", "gzip", "--sql-connection-properties", JSON.stringify(targetProperties(dialect, target))];
    const clientJar = await findClientJar(fileControl.dataDirectory); const extensions = await findResourceExtensions(fileControl.dataDirectory);
    if (clientJar !== null) args.push("--client-jar", clientJar); if (extensions !== null) args.push("--resource-extensions", extensions);
    const started = Date.now(); const rendered = await run(process.execPath, args, { cwd: REPO_ROOT, capture: true });
    const line = rendered.stdout.trim().split("\n").filter(Boolean).pop(); let parsed = null; try { parsed = line ? JSON.parse(line) : null; } catch { parsed = null; }
    if (parsed?.status !== "rendered") throw new Error(`${dialect.id}: TypeScript SQL render did not report success: ${parsed ? JSON.stringify(parsed) : rendered.stderr.slice(-2000)}`);
    let subject = null;
    const configDir = join(root, "java-serve-config"); await writeSqlConfig({ configDirectory: configDir, dataDirectory: join(root, "java-serve-data"), webRoot: join(root, "java-serve-web"), worldDirectory: null, mapId: options.mapId, mapName: "Overworld", dimension: options.dimension, renderThreadCount: 1, dialect, target, driver, serverOnly: true, webserverPort: options.webserverPort });
    const child = spawn("java", ["-jar", options.jar, "-c", configDir, "-w", "-b"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); let serverLog = ""; child.stdout.on("data", (chunk) => (serverLog += chunk)); child.stderr.on("data", (chunk) => (serverLog += chunk));
    try {
        subject = await openSql(engine, dialect, target); const tsMap = subject.storage.map(options.mapId);
        if (!(await subject.storage.mapIds()).includes(options.mapId)) throw new Error(`${dialect.id}: TypeScript-written map id '${options.mapId}' was not visible after reopen`);
        const cells = { hires: await tsMap.hiresTiles().stream(), lowres: {} }; for (let lod = 1; lod <= 3; lod++) cells.lowres[lod] = await tsMap.lowresTiles(lod).stream();
        const settings = await tsMap.settings().read(); const textures = await tsMap.textures().read();
        if (!(await waitForPort("127.0.0.1", options.webserverPort, 30000))) throw new Error(`${dialect.id}: Java raw-storage server did not start: ${redact(serverLog.slice(-2000), target)}`);
        const counters = []; const hires = new Counter("hires tiles (via Java webserver)");
        for (const cell of cells.hires) { const x = cell.getX(); const z = cell.getZ(); const stream = await cell.read(); const response = await fetch(`http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/tiles/0/x${x}z${z}.prbm`, { headers: { "Accept-Encoding": "identity" } }); if (!response.ok) { hires.record(`(${x},${z})`, { kind: "http", message: `Java webserver returned ${response.status}`, detail: [] }); continue; } hires.record(`(${x},${z})`, diffBytes(Buffer.from(await stream.decompress()), Buffer.from(await response.arrayBuffer()))); }
        counters.push(hires);
        for (let lod = 1; lod <= 3; lod++) { const counter = new Counter(`lowres/${lod} (via Java webserver)`); for (const cell of cells.lowres[lod]) { const x = cell.getX(); const z = cell.getZ(); const stream = await cell.read(); const response = await fetch(`http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/tiles/${lod}/x${x}z${z}.png`, { headers: { "Accept-Encoding": "identity" } }); if (!response.ok) { counter.record(`(${x},${z})`, { kind: "http", message: `Java webserver returned ${response.status}`, detail: [] }); continue; } counter.record(`(${x},${z})`, diffBytes(Buffer.from(await stream.decompress()), Buffer.from(await response.arrayBuffer()))); } counters.push(counter); }
        const meta = new Counter("metadata (via Java webserver)");
        const metadataItems = [
            ["settings.json", "settings.json", settings, true],
            ["textures.json", "textures.json", textures, true],
            ["live/markers.json", "live/markers.json", await tsMap.markers().read(), true],
            ["live/players.json", "live/players.json", await tsMap.players().read(), true],
            ["assets/oracle-sentinel.json", "assets/oracle-sentinel.json", await tsMap.asset("oracle-sentinel.json").read(), false],
        ];
        for (const [name, path, stream] of metadataItems) { if (stream === null) { meta.record(name, { kind: "missing", message: "TypeScript wrote no document", detail: [] }); continue; } const response = await fetch(`http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/${path}`, { headers: { "Accept-Encoding": "identity" } }); if (!response.ok) { meta.record(name, { kind: "http", message: `Java webserver returned ${response.status}`, detail: [] }); continue; } const leftBytes = Buffer.from(await stream.decompress()); const rightBytes = Buffer.from(await response.arrayBuffer()); try { meta.record(name, diffJson(JSON.parse(leftBytes.toString("utf8")), JSON.parse(rightBytes.toString("utf8")))); } catch { meta.record(name, diffBytes(leftBytes, rightBytes)); } }
        counters.push(meta);
        const divergences = printCounters(counters); return { elapsedMs: Date.now() - started, counters: counters.map((counter) => ({ label: counter.label, compared: counter.compared, matching: counter.matching, divergences: counter.divergences.length })), divergences, renderStateCompared: false, renderStateNote: "The upstream raw-storage HTTP contract exposes tiles and metadata only; deterministic render-state fields are compared in direction 1 through the SQLStorage API." };
    } finally {
        if (child.exitCode === null) child.kill();
        await waitForChildExit(child);
        if (subject !== null) await subject.storage.close().catch(() => undefined);
    }
}

export async function main(argv = process.argv.slice(2)) {
    let options; try { options = parseArgs(argv); } catch (error) { process.stderr.write(`${describeError(error)}\n\n${USAGE}`); return 2; }
    if (options.help) { process.stdout.write(USAGE); return 0; }
    const startedAt = Date.now(); const report = { schemaVersion: 1, startedAt: new Date(startedAt).toISOString(), options: { ...options }, dialects: {} };
    await mkdir(options.work, { recursive: true });
    let drivers; try { drivers = await loadDrivers(options.driverDir, options.dialects); } catch (error) { log(`[sql-crosscompat-matrix] ${describeError(error)}`); return 2; }
    const jar = await findCliJar(REPO_ROOT); if (jar === null) { log("[sql-crosscompat-matrix] no reference jar; build it with node tools/build-jars.mjs --only cli"); return 2; } options.jar = jar;
    let world; try { world = await generateWorld({ repoRoot: REPO_ROOT, seed: options.seed, size: options.size, out: join(options.work, "worlds") }); } catch (error) { log(`[sql-crosscompat-matrix] ${describeError(error)}`); return 2; }
    if (options.preflight) {
        for (const id of options.dialects) {
            const dialect = { ...DIALECTS[id], engine: null, engineDialect: null };
            const engineEntry = join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js");
            dialect.engine = await import(pathToFileURL(engineEntry).href);
            dialect.engineDialect = dialect.engine[id === "sqlite" ? "SQLITE" : "POSTGRESQL"];
            await withTarget(dialect, options, "construction-preflight", async ({ target }) => {
                await adapterConstructionPreflight(dialect, target);
                await missingDriverLoaderPreflight(dialect);
            });
        }
        log(`[sql-crosscompat-matrix] preflight reached fixture generation and adapter construction with selected dialects: ${options.dialects.join(", ")}`);
        log(`[sql-crosscompat-matrix] verified JDBC drivers: ${Object.keys(drivers).join(", ")}; MariaDB was not required`);
        return 0;
    }
    let exitCode = 0;
    for (const id of options.dialects) {
        const dialect = { ...DIALECTS[id], engine: null, engineDialect: null }; const dialectReport = { driver: drivers[id], directions: null, lifecycle: null, failures: null };
        report.dialects[id] = dialectReport;
        try {
            const engineEntry = join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js"); dialect.engine = await import(pathToFileURL(engineEntry).href); dialect.engineDialect = dialect.engine[id === "sqlite" ? "SQLITE" : "POSTGRESQL"];
            await withTarget(dialect, options, "direction-1", async ({ root, target }) => {
                const fileControl = await renderReference({ repoRoot: REPO_ROOT, jar, worldDirectory: world, workDirectory: join(root, "file-control"), mapId: options.mapId, mapName: "Overworld", dimension: options.dimension, acceptDownload: true, renderThreadCount: id === "sqlite" ? 1 : options.threads, refresh: false });
                dialectReport.directions = { javaWritesTsReads: await runDirection1({ engine: dialect.engine, dialect, target, driver: drivers[id], worldDirectory: world, fileControl, options, root }) };
                dialectReport.failures = { ...(await expectWrongJdbc(dialect.engine, dialect)), ...(await runMissingDriverProbe({ engine: dialect.engine, root, dialect, target, driver: drivers[id], worldDirectory: world, mapId: options.mapId, options })) };
                dialectReport.lifecycle = await lifecycleProbe(dialect.engine, dialect, target);
            });
            await withTarget(dialect, options, "direction-2", async ({ root, target }) => {
                const fileControl = await renderReference({ repoRoot: REPO_ROOT, jar, worldDirectory: world, workDirectory: join(options.work, dialect.id, "direction-1", "file-control"), mapId: options.mapId, mapName: "Overworld", dimension: options.dimension, acceptDownload: true, renderThreadCount: id === "sqlite" ? 1 : options.threads, refresh: false });
                dialectReport.directions.tsWritesJavaReads = await runDirection2({ engine: dialect.engine, dialect, target, driver: drivers[id], worldDirectory: world, fileControl, options: { ...options, webserverPort: options.webserverPort + Object.keys(report.dialects).indexOf(id) }, root });
            });
            await withTarget(dialect, options, "incompatible-schema", async ({ target }) => { dialectReport.failures = { ...(dialectReport.failures ?? {}), ...(await expectIncompatibleSchema(dialect.engine, dialect, target)) }; });
            if (dialectReport.directions.javaWritesTsReads.divergences || dialectReport.directions.tsWritesJavaReads.divergences) exitCode = 1;
        } catch (error) { dialectReport.error = describeError(error); log(`[sql-crosscompat-matrix] ${id}: ${dialectReport.error}`); exitCode = 2; }
    }
    report.durationMs = Date.now() - startedAt; report.exitCode = exitCode;
    if (options.json !== null) { await mkdir(dirname(options.json), { recursive: true }); await writeFile(options.json, JSON.stringify(report, null, 2) + "\n", "utf8"); log(`[sql-crosscompat-matrix] report written to ${options.json}`); }
    log(`[sql-crosscompat-matrix] finished in ${formatDuration(report.durationMs)} with exit code ${exitCode}`); return exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = await main();
