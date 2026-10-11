import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stageLocalJavaEngine } from "../design/packages/app/scripts/stage-local-java-engine.mjs";

function jarFixture() {
  const entries = [
    [
      "META-INF/MANIFEST.MF",
      Buffer.from("Manifest-Version: 1.0\nMain-Class: org.example.Main\n"),
    ],
    [
      "org/example/Main.class",
      Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65]),
    ],
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
  return Buffer.concat([
    result,
    Buffer.alloc(Math.max(0, 4096 - result.length)),
  ]);
}

const expectedCommit = "a".repeat(40);
const releaseCommit = "b".repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "worldlens-local-java-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const gradleDirectory = join(root, "gradle");
  const stagingDirectory = join(root, "staged");
  await mkdir(gradleDirectory);
  const bytes = jarFixture();
  const jarPath = join(gradleDirectory, "cli-5.29-9-shadow.jar");
  const stampPath = join(gradleDirectory, "worldlens-jar-provenance.json");
  const stamp = {
    commit: expectedCommit,
    releaseCommit,
    version: "5.29-9",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    builtAt: "fixture timestamp",
  };
  await writeFile(jarPath, bytes);
  await writeFile(stampPath, JSON.stringify(stamp));
  return {
    gradleDirectory,
    stagingDirectory,
    expectedCommit,
    releaseCommit,
    releaseTag: "v5.29",
    jarPath,
    stampPath,
    stamp,
  };
}
test("local staging produces the strict source-bound packaging manifest", async (t) => {
  const item = await fixture(t);
  const result = await stageLocalJavaEngine(item);
  assert.equal(result.source.commit, expectedCommit);
  assert.equal(result.source.version, "5.29-9");
  assert.equal(result.cli.fileName, "bluemap-5.29-9-cli.jar");
  assert.equal(result.cli.sha256, item.stamp.sha256);
  assert.deepEqual(
    await readFile(result.jarPath),
    await readFile(item.jarPath),
  );
});
for (const [label, change] of [
  [
    "wrong release label",
    (stamp) => {
      stamp.version = "5.23-115";
    },
  ],
  [
    "stale source",
    (stamp) => {
      stamp.commit = "c".repeat(40);
    },
  ],
  [
    "stale release",
    (stamp) => {
      stamp.releaseCommit = "c".repeat(40);
    },
  ],
  [
    "missing digest",
    (stamp) => {
      delete stamp.sha256;
    },
  ],
  [
    "unsafe version",
    (stamp) => {
      stamp.version = "../../outside";
    },
  ],
  [
    "incorrect size",
    (stamp) => {
      stamp.size += 1;
    },
  ],
])
  test("local staging rejects " + label, async (t) => {
    const item = await fixture(t);
    change(item.stamp);
    await writeFile(item.stampPath, JSON.stringify(item.stamp));
    await assert.rejects(stageLocalJavaEngine(item));
  });
test("changed local archive bytes cannot inherit a valid receipt", async (t) => {
  const item = await fixture(t);
  await writeFile(item.jarPath, Buffer.from("changed bytes"));
  await assert.rejects(
    stageLocalJavaEngine(item),
    /differs from its build receipt/,
  );
});
