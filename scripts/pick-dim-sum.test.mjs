import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  fetchJson,
  parseArgs,
  selectUnusedDish,
  validateAsset,
  validateDish,
  workflowOutputText,
} from "./pick-dim-sum.mjs";

function validDish(altEn = "Warm tea-house photograph of Classic Har Gow") {
  return {
    id: "hk-dish-0001",
    slug: "classic-har-gow",
    name: { en: "Classic Har Gow", zhHant: "蝦餃。「茶樓」" },
    jyutping: "haa1 gaau2",
    image: { alt: { en: altEn } },
  };
}

function validResult() {
  return {
    ...validateDish(validDish(), "hk-dish-0001"),
    fileName: "hk-dish-0001-classic-har-gow.png",
    bytes: 4096,
    volume: "catalog-v1.1",
    sourceUrl:
      "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.1/" +
      "hk-dish-0001-classic-har-gow.png",
  };
}

test("authoritative bilingual names and the real 235-character alt are accepted", () => {
  const prefix = "Warm tea-house photograph of Classic Har Gow, showing ";
  const alt = prefix + "a".repeat(235 - prefix.length);
  const result = validateDish(validDish(alt), "hk-dish-0001");
  assert.equal(result.nameEn, "Classic Har Gow");
  assert.equal(result.nameZh, "蝦餃。「茶樓」");
  assert.equal(result.altEn, alt);
  assert.throws(() => validateDish(validDish("a".repeat(236)), "hk-dish-0001"), /235/);
});

test("an exhausted catalog fails without reusing an earlier release code name", () => {
  assert.equal(selectUnusedDish([validDish()], 1).nameEn, "Classic Har Gow");
  assert.throws(
    () => selectUnusedDish([validDish()], 2),
    /no unused published-name record hk-dish-0002/,
  );
});

test("network metadata is bounded to one published public catalog asset URL", () => {
  const result = validResult();
  const asset = validateAsset(
    {
      name: result.fileName,
      size: result.bytes,
      browser_download_url: result.sourceUrl,
    },
    result.volume,
    result.fileName,
  );
  assert.equal(asset.sourceUrl, result.sourceUrl);
  for (const unsafe of [
    `https://example.invalid/${result.fileName}`,
    `https://github.com/Ding-Ding-Projects/other/releases/download/${result.volume}/${result.fileName}`,
    `${result.sourceUrl}?download=1`,
  ]) {
    assert.throws(
      () =>
        validateAsset(
          { name: result.fileName, size: result.bytes, browser_download_url: unsafe },
          result.volume,
          result.fileName,
        ),
      /selected catalog release asset URL/,
    );
  }
});

test("workflow output contains only validated names, alt text, and the public photo URL", () => {
  const output = workflowOutputText(validResult());
  assert.deepEqual(
    output.split("\n").map((line) => line.slice(0, line.indexOf("="))),
    ["dish_name_en", "dish_name_zh", "dish_alt_en", "dish_photo_url"],
  );
  assert.match(output, /Ding-Ding-Projects\/dim-sum-photos\/releases\/download/);
});

test("control, Markdown-active, wrong-type, and traversal-shaped metadata is rejected", () => {
  for (const unsafe of ["\n", "\r", "\0", "\u2028", "`", "$", '"', ";", "&", "|", "<", ">", "[", "]"]) {
    const dish = validDish();
    dish.name.en = `Unsafe${unsafe}metadata`;
    assert.throws(() => validateDish(dish, "hk-dish-0001"), /dish\.name\.en/);
  }
  const traversal = validDish();
  traversal.slug = "../escape";
  assert.throws(() => validateDish(traversal, "hk-dish-0001"), /dish\.slug/);
  assert.throws(() => workflowOutputText({ ...validResult(), nameEn: 42 }), /text/);
});

test("arguments no longer expose an output directory because no photo is written", () => {
  assert.deepEqual(parseArgs(["node", "script", "--ordinal", "42", "--json"]), {
    ordinal: 42,
    json: true,
  });
  assert.throws(() => parseArgs(["node", "script", "--out", "copied-photo"]), /unknown/);
  assert.throws(() => parseArgs(["node", "script", "--ordinal", "0"]), /1 through/);
});

test("the consumer picker has no photo-byte download or filesystem-write implementation", () => {
  const source = readFileSync(new URL("./pick-dim-sum.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(asset\.sourceUrl/);
  assert.doesNotMatch(source, /writeFile\(|mkdir\(|verifyPng|readBoundedResponse/);
  assert.doesNotMatch(source, /--out/);
});

test("catalog metadata intake has a real deadline and a streamed byte ceiling", async () => {
  await assert.rejects(
    fetchJson("https://example.invalid/hangs", false, {
      fetchImpl: () => new Promise(() => {}),
      timeoutMs: 10,
      maxBytes: 64,
    }),
    /timed out after 10 ms/,
  );

  await assert.rejects(
    fetchJson("https://example.invalid/oversized", false, {
      fetchImpl: async () => new Response(new Uint8Array(65), { status: 200 }),
      timeoutMs: 1_000,
      maxBytes: 64,
    }),
    /64-byte boundary/,
  );

  assert.deepEqual(
    await fetchJson("https://example.invalid/valid", false, {
      fetchImpl: async () => new Response('{"ok":true}', { status: 200 }),
      timeoutMs: 1_000,
      maxBytes: 64,
    }),
    { ok: true },
  );
});
