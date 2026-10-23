// Runs the validator as the workflow does: through the built @worldlens/shared. Skips with a
// named reason when that build is absent, so a fresh checkout reports the missing build
// rather than a false failure of the script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = existsSync(
  resolve(here, "../design/packages/shared/dist/worldGenerationConfig.js"),
);
const { main } = await import("./worldgen-config.mjs");

const valid = {
  version: 1,
  engine: "synthetic",
  seed: 20261023,
  size: 1000,
  worldName: "gui-test-world",
  format: "1.20.4",
  outputMode: "folder",
  source: {
    flavour: "vanilla",
    version: "1.21.4",
    pregenerationRadius: 500,
    worldType: "default",
    generateStructures: true,
    dimensions: { overworld: true, nether: false, end: false },
  },
};

test(
  "accepts the application's document and writes the outputs the workflow reads",
  { skip: built ? false : "design/packages/shared is not built" },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "worldgen-config-"));
    try {
      process.env.WORLDGEN_TEST_CONFIG = JSON.stringify(valid);
      const output = join(dir, "github-output");
      const written = join(dir, "generation-config.json");
      assert.equal(
        await main([
          "--env",
          "WORLDGEN_TEST_CONFIG",
          "--write",
          written,
          "--github-output",
          output,
        ]),
        0,
      );
      assert.deepEqual(JSON.parse(readFileSync(written, "utf8")), valid);
      const lines = readFileSync(output, "utf8").trim().split("\n").sort();
      assert.deepEqual(lines, [
        "engine=synthetic",
        "format=1.20.4",
        "seed=20261023",
        "size=1000",
        "world-name=gui-test-world",
      ]);
    } finally {
      delete process.env.WORLDGEN_TEST_CONFIG;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "refuses a document with an engine the runner cannot generate",
  { skip: built ? false : "design/packages/shared is not built" },
  async () => {
    process.env.WORLDGEN_TEST_CONFIG = JSON.stringify({
      ...valid,
      engine: "vanilla-server",
    });
    try {
      assert.equal(await main(["--env", "WORLDGEN_TEST_CONFIG"]), 1);
    } finally {
      delete process.env.WORLDGEN_TEST_CONFIG;
    }
  },
);

test("refuses an empty input and a bad document before importing anything", async () => {
  process.env.WORLDGEN_TEST_CONFIG = "";
  try {
    assert.equal(await main(["--env", "WORLDGEN_TEST_CONFIG"]), 1);
  } finally {
    delete process.env.WORLDGEN_TEST_CONFIG;
  }
  assert.equal(await main([]), 2);
  assert.equal(await main(["--env", "A", "--file", "b"]), 2);
});
