import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "stage-packaged-jars.mjs");
const VERSION = "5.23";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RUN_ID = "12345";

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
    const source = {
        repository: "https://github.com/BlueMap-Minecraft/BlueMap",
        commit: COMMIT,
        path: "vendor/BlueMap",
        version: VERSION,
    };
    return {
        schemaVersion: 1,
        generatedAt: "2026-08-24T00:00:00.000Z",
        workflow: overrides.workflow ?? { runId: RUN_ID, runAttempt: "1" },
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

function run(item) {
    try {
        execFileSync(process.execPath, [
            SCRIPT,
            "--artifact-dir", item.artifactDir,
            "--manifest", item.manifestPath,
            "--stage", item.stageDir,
            "--expected-version", VERSION,
            "--expected-commit", COMMIT,
            "--expected-run-id", RUN_ID,
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return { ok: true, output: "" };
    } catch (error) {
        return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
}

test("stages a workflow-shaped CLI artifact and writes the authoritative manifest", async () => {
    const item = await fixture();
    const result = run(item);
    assert.equal(result.ok, true, result.output);
    const staged = JSON.parse(await readFile(join(item.stageDir, "manifest.json"), "utf8"));
    assert.equal(staged.source.commit, COMMIT);
    assert.equal(staged.jars[0].fileName, `bluemap-${VERSION}-cli.jar`);
    assert.equal(staged.jars[0].size, item.bytes.length);
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
