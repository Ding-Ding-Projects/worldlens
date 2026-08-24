import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "describe-jars.mjs");
const VERSION = "5.23";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

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

test("describe-jars emits the real packager manifest version fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "worldlens-describe-jars-"));
    const stage = join(root, "stage");
    const output = join(root, "out");
    await mkdir(stage, { recursive: true });
    await writeFile(join(stage, `cli-${VERSION}-shadow.jar`), jarFixture());
    try {
        execFileSync(process.execPath, [
            SCRIPT,
            "--stage", stage,
            "--out", output,
            "--vendor", root,
            "--expect-version", VERSION,
            "--upstream-commit", COMMIT,
            "--allow-partial",
        ], {
            cwd: dirname(HERE),
            env: { ...process.env, GITHUB_RUN_ID: "12345", GITHUB_RUN_ATTEMPT: "1" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
        assert.equal(manifest.source.version, VERSION);
        assert.ok(manifest.jars.length > 0);
        for (const jar of manifest.jars) {
            assert.equal(jar.version, VERSION);
            assert.equal(jar.source.version, VERSION);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
