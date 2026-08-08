#!/usr/bin/env node
/**
 * Resolve a release code name and its already-published public catalog photo URL.
 *
 * This consumer repository never downloads, copies, or attaches the photo. The
 * public `Ding-Ding-Projects/dim-sum-photos` release asset remains the sole byte
 * authority; Worldlens release notes link to it directly.
 *
 * Usage:
 *   node scripts/pick-dim-sum.mjs --ordinal 1
 *   node scripts/pick-dim-sum.mjs --ordinal 1 --json
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATALOG_REPO = "Ding-Ding-Projects/dim-sum-photos";
const CATALOG_INDEX_URL = `https://raw.githubusercontent.com/${CATALOG_REPO}/main/catalog/index.json`;
const RELEASES_API = `https://api.github.com/repos/${CATALOG_REPO}/releases?per_page=100`;
const MAX_CATALOG_DISHES = 10_000;
const MAX_RELEASES = 100;
const MAX_ASSETS_PER_RELEASE = 1_000;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const SAFE_HUMAN_TEXT = /^[\p{L}\p{M}\p{N} '’.,，。、「」《》·-]+$/u;
const SAFE_ID = /^hk-dish-\d{4}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){0,20}$/;
const SAFE_VOLUME = /^catalog-v1[A-Za-z0-9._-]{0,88}$/;
const SAFE_FILE_NAME = /^hk-dish-\d{4}-[a-z0-9]+(?:-[a-z0-9]+){0,20}\.png$/;
const CONTROL_OR_SEPARATOR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function metadataError(field, reason) {
  return new Error(`catalog metadata field ${field} failed validation: ${reason}`);
}

function requireObject(field, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw metadataError(field, "expected an object");
  }
  return value;
}

function requireArray(field, value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw metadataError(field, `expected ${min}-${max} records`);
  }
  return value;
}

function requireString(field, value, { min = 1, max, pattern } = {}) {
  if (typeof value !== "string") throw metadataError(field, "expected text");
  const length = [...value].length;
  if (length < min || length > max) {
    throw metadataError(field, `expected ${min}-${max} characters`);
  }
  if (CONTROL_OR_SEPARATOR.test(value)) {
    throw metadataError(field, "control and line-separator characters are forbidden");
  }
  if (pattern && !pattern.test(value)) {
    throw metadataError(field, "contains characters outside the permitted set");
  }
  return value;
}

function validateDish(dish, expectedId) {
  requireObject("dish", dish);
  const id = requireString("dish.id", dish.id, { min: 12, max: 12, pattern: SAFE_ID });
  if (id !== expectedId) throw metadataError("dish.id", "does not match the selected ordinal");
  const slug = requireString("dish.slug", dish.slug, {
    min: 1,
    max: 120,
    pattern: SAFE_SLUG,
  });
  const name = requireObject("dish.name", dish.name);
  const image = requireObject("dish.image", dish.image);
  const alt = requireObject("dish.image.alt", image.alt);
  return {
    id,
    slug,
    nameEn: requireString("dish.name.en", name.en, {
      max: 120,
      pattern: SAFE_HUMAN_TEXT,
    }),
    nameZh: requireString("dish.name.zhHant", name.zhHant, {
      max: 64,
      pattern: SAFE_HUMAN_TEXT,
    }),
    jyutping: requireString("dish.jyutping", dish.jyutping, {
      max: 120,
      pattern: SAFE_HUMAN_TEXT,
    }),
    altEn: requireString("dish.image.alt.en", alt.en, {
      max: 235,
      pattern: SAFE_HUMAN_TEXT,
    }),
  };
}

function selectUnusedDish(dishes, ordinal) {
  requireArray("catalog.dishes", dishes, 1, MAX_CATALOG_DISHES);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error("release ordinal must be a positive integer");
  }
  const requestedId = `hk-dish-${String(ordinal).padStart(4, "0")}`;
  const rawDish = dishes.find((dish) => dish?.id === requestedId);
  if (!rawDish) {
    throw new Error(
      `catalog has no unused published-name record ${requestedId}; refusing to reuse an earlier code name`,
    );
  }
  return validateDish(rawDish, requestedId);
}

function validateAsset(asset, volume, expectedFileName) {
  requireObject("asset", asset);
  const fileName = requireString("asset.name", asset.name, {
    max: 180,
    pattern: SAFE_FILE_NAME,
  });
  if (fileName !== expectedFileName) {
    throw metadataError("asset.name", "does not match the selected dish");
  }
  if (!Number.isSafeInteger(asset.size) || asset.size < 24 || asset.size > MAX_IMAGE_BYTES) {
    throw metadataError("asset.size", `expected 24-${MAX_IMAGE_BYTES} bytes`);
  }
  const sourceUrl = requireString(
    "asset.browser_download_url",
    asset.browser_download_url,
    { max: 500 },
  );
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw metadataError("asset.browser_download_url", "expected an absolute URL");
  }
  const expectedPath = `/${CATALOG_REPO}/releases/download/${volume}/${fileName}`;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== expectedPath
  ) {
    throw metadataError(
      "asset.browser_download_url",
      "expected the selected catalog release asset URL",
    );
  }
  return { fileName, size: asset.size, sourceUrl };
}

function workflowOutputText(result) {
  const entries = {
    dish_name_en: requireString("workflow.dish_name_en", result.nameEn, {
      max: 120,
      pattern: SAFE_HUMAN_TEXT,
    }),
    dish_name_zh: requireString("workflow.dish_name_zh", result.nameZh, {
      max: 64,
      pattern: SAFE_HUMAN_TEXT,
    }),
    dish_alt_en: requireString("workflow.dish_alt_en", result.altEn, {
      max: 235,
      pattern: SAFE_HUMAN_TEXT,
    }),
    dish_photo_url: validateAsset(
      {
        name: result.fileName,
        size: result.bytes,
        browser_download_url: result.sourceUrl,
      },
      result.volume,
      result.fileName,
    ).sourceUrl,
  };
  return Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseArgs(argv) {
  const args = { ordinal: 1, json: false };
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--ordinal") {
      if (index + 1 >= argv.length) throw new Error("--ordinal requires a value");
      args.ordinal = Number(argv[++index]);
    } else if (arg.startsWith("--ordinal=")) {
      args.ordinal = Number(arg.slice("--ordinal=".length));
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isSafeInteger(args.ordinal) || args.ordinal < 1 || args.ordinal > 1_000_000) {
    throw new Error("--ordinal must be an integer from 1 through 1000000");
  }
  return args;
}

function headers(authenticated) {
  const result = { accept: "application/json", "user-agent": "worldlens-release" };
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (authenticated && token) result.authorization = `Bearer ${token}`;
  return result;
}

async function readJsonBytes(response, maxBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      throw new Error("catalog response has an invalid Content-Length");
    }
    if (declaredBytes > maxBytes) {
      throw new Error(`catalog response exceeds the ${maxBytes}-byte boundary`);
    }
  }
  if (!response.body) throw new Error("catalog response has no body");

  const chunks = [];
  let received = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`catalog response exceeds the ${maxBytes}-byte boundary`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("catalog response is not bounded valid UTF-8 JSON");
  }
}

async function fetchJson(
  url,
  authenticated = false,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = FETCH_TIMEOUT_MS,
    maxBytes = MAX_METADATA_BYTES,
  } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("catalog timeout is outside the supported boundary");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_METADATA_BYTES) {
    throw new Error("catalog byte limit is outside the supported boundary");
  }
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`GET ${url} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  let response;
  try {
    response = await Promise.race([
      fetchImpl(url, {
        headers: headers(authenticated),
        signal: controller.signal,
        redirect: "error",
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  return readJsonBytes(response, maxBytes);
}

async function loadAssetIndex() {
  const releases = await fetchJson(RELEASES_API, true);
  requireArray("releases", releases, 1, MAX_RELEASES);
  const volumes = releases.filter(
    (release) =>
      typeof release?.tag_name === "string" && release.tag_name.startsWith("catalog"),
  );
  if (volumes.length === 0) throw new Error(`no catalog* releases found on ${CATALOG_REPO}`);

  const index = new Map();
  for (const volume of volumes) {
    const volumeName = requireString("release.tag_name", volume.tag_name, {
      max: 100,
      pattern: SAFE_VOLUME,
    });
    const assets = requireArray(
      `release.${volumeName}.assets`,
      volume.assets,
      0,
      MAX_ASSETS_PER_RELEASE,
    );
    for (const asset of assets) {
      if (typeof asset?.name !== "string" || !SAFE_FILE_NAME.test(asset.name)) continue;
      if (!index.has(asset.name)) index.set(asset.name, { asset, volume: volumeName });
    }
  }
  return index;
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = requireObject("catalog", await fetchJson(CATALOG_INDEX_URL));
  const dishes = requireArray("catalog.dishes", catalog.dishes, 1, MAX_CATALOG_DISHES);
  const dish = selectUnusedDish(dishes, args.ordinal);

  const fileName = `${dish.id}-${dish.slug}.png`;
  if (!SAFE_FILE_NAME.test(fileName)) throw metadataError("asset.name", "derived name is invalid");
  const assetEntry = (await loadAssetIndex()).get(fileName);
  if (!assetEntry) {
    throw new Error(
      `no published asset named ${fileName} in any catalog volume. ` +
        "The catalog is still in progress, so this record has no public image yet.",
    );
  }
  const asset = validateAsset(assetEntry.asset, assetEntry.volume, fileName);
  const result = {
    ...dish,
    fileName,
    bytes: asset.size,
    volume: assetEntry.volume,
    sourceUrl: asset.sourceUrl,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(
      `${result.nameEn} · ${result.nameZh} (${result.jyutping})\n` +
        `  ${result.sourceUrl}\n`,
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    process.stdout.write("Resolved public catalog metadata without downloading photo bytes.\n");
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_OUTPUT, workflowOutputText(result) + "\n");
  }
}

export {
  fetchJson,
  parseArgs,
  selectUnusedDish,
  validateAsset,
  validateDish,
  workflowOutputText,
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`pick-dim-sum failed: ${error.message}\n`);
    process.exit(1);
  });
}
