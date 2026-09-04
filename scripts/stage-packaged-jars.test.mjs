import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, open, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
    BLUEMAP_SOURCE_PATH,
    BLUEMAP_SOURCE_REPOSITORY,
} from "../design/packages/app/scripts/staged-java-engine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "stage-packaged-jars.mjs");
const SCRIPT_SOURCE = readFileSync(SCRIPT, "utf8");
const VERSION = "5.23";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RUN_ID = "12345";
const RUN_ATTEMPT = "1";

function jarFixture() {
    const entries = [
        ["META-INF/MANIFEST.MF", Buffer.from("Manifest-Version: 1.0\nMain-Class: org.example.Main\n")],
        ["org/example/Main.class", Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65])],
    ];
    const chunks = [];
    const records = [];
    let offset = 0;
    for (const [name, bytes] of entries) {
        const nameBytes = Buffer.from(name);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt32LE(bytes.length, 18);
        header.writeUInt32LE(bytes.length, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        chunks.push(header, nameBytes, bytes);
        records.push({ nameBytes, bytes, offset });
        offset += header.length + nameBytes.length + bytes.length;
    }
    const centralOffset = offset;
    for (const record of records) {
        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(20, 6);
        header.writeUInt32LE(record.bytes.length, 20);
        header.writeUInt32LE(record.bytes.length, 24);
        header.writeUInt16LE(record.nameBytes.length, 28);
        header.writeUInt32LE(record.offset, 42);
        chunks.push(header, record.nameBytes);
        offset += header.length + record.nameBytes.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(records.length, 8);
    end.writeUInt16LE(records.length, 10);
    end.writeUInt32LE(offset - centralOffset, 12);
    end.writeUInt32LE(centralOffset, 16);
    const result = Buffer.concat([...chunks, end]);
    return Buffer.concat([result, Buffer.alloc(Math.max(0, 4096 - result.length))]);
}

function manifest(bytes, overrides = {}) {
    const fileName = overrides.fileName ?? `bluemap-${VERSION}-cli.jar`;
    // Imported rather than retyped: the validator compares against these exact
    // constants, so a fixture with its own copy would keep passing after the real
    // source moved - which is precisely what happened when the build was pointed at
    // the fork and this test was the only thing that noticed.
    const source = {
        repository: BLUEMAP_SOURCE_REPOSITORY,
        commit: COMMIT,
        path: BLUEMAP_SOURCE_PATH,
        version: VERSION,
    };
    return {
        schemaVersion: 1,
        generatedAt: "2026-08-24T00:00:00.000Z",
        workflow: overrides.workflow ?? { runId: RUN_ID, runAttempt: RUN_ATTEMPT },
        source,
        requiredJavaFeature: 25,
        jars: [{
            implementation: "cli",
            version: overrides.version ?? VERSION,
            fileName,
            size: overrides.size ?? bytes.length,
            sha256: overrides.sha256 ?? createHash("sha256").update(bytes).digest("hex"),
            source,
        }],
    };
}

async function fixture(overrides = {}) {
    const root = await mkdtemp(join(tmpdir(), "worldlens-stage-jars-"));
    const artifactDir = join(root, "download");
    const stageDir = join(root, "stage");
    await mkdir(artifactDir, { recursive: true });
    const bytes = jarFixture();
    const fileName = `bluemap-${VERSION}-cli.jar`;
    if (overrides.writeJar !== false) await writeFile(join(artifactDir, fileName), bytes);
    await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest(bytes, overrides), null, 2)}\n`);
    return { root, artifactDir, stageDir, manifestPath: join(root, "manifest.json"), bytes };
}

function run(item, identity = {}) {
    try {
        execFileSync(process.execPath, [
            SCRIPT,
            "--artifact-dir", item.artifactDir,
            "--manifest", item.manifestPath,
            "--stage", item.stageDir,
            "--expected-version", identity.version ?? VERSION,
            "--expected-commit", identity.commit ?? COMMIT,
            "--expected-run-id", identity.runId ?? RUN_ID,
            "--expected-run-attempt", identity.runAttempt ?? RUN_ATTEMPT,
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return { ok: true, output: "" };
    } catch (error) {
        return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
}

function assertCanonicalStageContract(source) {
    assert.match(source, /^[ \t]*assertExpectedIdentity\(options\);[ \t]*$/m, "identity preflight call disappeared");
    assert.match(source, /actual\.size !== cli\.size \|\| actual\.sha256 !== cli\.sha256/, "artifact hash comparison disappeared");
}

function sourceWithLineEnding(source, eol) {
    return source.replace(/\r\n?/g, "\n").replace(/\n/g, eol);
}

function removeExactSourceLine(source, expectedLine) {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/);
    const index = lines.findIndex((line) => line.trim() === expectedLine);
    assert.notEqual(index, -1, `mutation anchor is absent: ${expectedLine}`);
    lines.splice(index, 1);
    return lines.join(eol);
}

function replaceSourceFragment(source, fragment, replacement) {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/);
    const index = lines.findIndex((line) => line.includes(fragment));
    assert.notEqual(index, -1, `mutation fragment is absent: ${fragment}`);
    lines[index] = lines[index].replace(fragment, replacement);
    return lines.join(eol);
}

test("the canonical identity preflight mutation turns red", () => {
    for (const eol of ["\n", "\r\n"]) {
        const fixtureSource = sourceWithLineEnding(SCRIPT_SOURCE, eol);
        const mutated = removeExactSourceLine(fixtureSource, "assertExpectedIdentity(options);");
        assert.notEqual(mutated, fixtureSource);
        assert.throws(() => assertCanonicalStageContract(mutated), /identity preflight/);
    }
});

test("the canonical hash comparison mutation turns red", () => {
    for (const eol of ["\n", "\r\n"]) {
        const fixtureSource = sourceWithLineEnding(SCRIPT_SOURCE, eol);
        const mutated = replaceSourceFragment(
            fixtureSource,
            "actual.size !== cli.size || actual.sha256 !== cli.sha256",
            "false",
        );
        assert.notEqual(mutated, fixtureSource);
        assert.throws(() => assertCanonicalStageContract(mutated), /artifact hash/);
    }
});

test("stages a workflow-shaped CLI artifact and writes the authoritative manifest", async () => {
    const item = await fixture();
    const result = run(item);
    assert.equal(result.ok, true, result.output);
    const staged = JSON.parse(await readFile(join(item.stageDir, "manifest.json"), "utf8"));
    assert.equal(staged.source.commit, COMMIT);
    assert.equal(staged.jars[0].fileName, `bluemap-${VERSION}-cli.jar`);
    assert.equal(staged.jars[0].size, item.bytes.length);
});

test("accepts the exact downloaded manifest shape with top-level JAR version", async () => {
    const item = await fixture();
    const downloaded = JSON.parse(await readFile(item.manifestPath, "utf8"));
    assert.equal(downloaded.source.version, VERSION);
    assert.equal(downloaded.jars[0].version, VERSION);
    assert.equal(downloaded.jars[0].source.version, VERSION);
    assert.equal(run(item).ok, true);
});

test("names a missing top-level JAR version field", async () => {
    const item = await fixture();
    const downloaded = JSON.parse(await readFile(item.manifestPath, "utf8"));
    delete downloaded.jars[0].version;
    await writeFile(item.manifestPath, `${JSON.stringify(downloaded, null, 2)}\n`);
    const result = run(item);
    assert.equal(result.ok, false);
    assert.match(result.output, /manifest\.jars\[cli\]\.version mismatch/);
});

for (const [name, overrides] of [
    ["missing manifest", { manifestMissing: true }],
    ["wrong digest", { sha256: "f".repeat(64) }],
    ["stale workflow run", { workflow: { runId: "99999", runAttempt: "1" } }],
    ["wrong version", { version: "5.22" }],
    ["wrong file path", { fileName: "../escape.jar" }],
    ["physical JAR absence", { writeJar: false }],
]) {
    test(`fails closed for ${name}`, async () => {
        const item = await fixture(overrides);
        if (overrides.manifestMissing) {
            const { rm } = await import("node:fs/promises");
            await rm(item.manifestPath);
        }
        const result = run(item);
        assert.equal(result.ok, false, `negative fixture unexpectedly passed: ${name}`);
    });
}

for (const [name, identity] of [
    ["empty version", { version: "" }],
    ["malformed version", { version: "five.twenty-three" }],
    ["empty source commit", { commit: "" }],
    ["malformed source commit", { commit: "g".repeat(40) }],
    ["empty run ID", { runId: "" }],
    ["malformed run ID", { runId: "run-123" }],
    ["empty run attempt", { runAttempt: "" }],
    ["malformed run attempt", { runAttempt: "attempt-1" }],
]) {
    test(`rejects ${name} before touching the artifact`, async () => {
        const item = await fixture();
        const result = run(item, identity);
        assert.equal(result.ok, false, `identity fixture unexpectedly passed: ${name}`);
        assert.match(result.output, /expected BlueMap|expected workflow/);
    });
}

test("rejects an oversized artifact before hashing its bytes", async () => {
    const item = await fixture();
    const jarPath = join(item.artifactDir, `bluemap-${VERSION}-cli.jar`);
    const handle = await open(jarPath, "r+");
    try {
        await handle.truncate(512 * 1024 * 1024 + 1);
    } finally {
        await handle.close();
    }
    const result = run(item);
    assert.equal(result.ok, false);
    assert.match(result.output, /invalid JAR|hard byte limit|exceeds/);
});

test("rejects a symlinked artifact before hashing or staging", async (t) => {
    const item = await fixture();
    const jarPath = join(item.artifactDir, `bluemap-${VERSION}-cli.jar`);
    const target = join(item.root, "outside.jar");
    await writeFile(target, item.bytes);
    await unlink(jarPath);
    try {
        await symlink(target, jarPath);
    } catch (error) {
        t.skip(`symlink creation unavailable on this host: ${String(error)}`);
        return;
    }
    const result = run(item);
    assert.equal(result.ok, false);
    assert.match(result.output, /symlink|reparse|JAR path/);
});
