import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import {
  basename,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function verifyElectronArchive(archive, checksumsFile) {
  const checksums = JSON.parse(readFileSync(checksumsFile, "utf8"));
  const name = basename(archive);
  const expected = checksums[name];
  if (typeof expected !== "string" || !/^[0-9a-f]{64}$/i.test(expected)) {
    throw new Error(
      `electron checksum manifest has no valid SHA-256 for ${name}`,
    );
  }

  const actual = sha256File(archive);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `cached Electron archive failed SHA-256 verification: ${name}`,
    );
  }
  return actual.toLowerCase();
}

/**
 * Refuse to recursively remove anything that is not a real child of the
 * explicitly supplied parent. The component walk is intentionally lexical:
 * resolving the path first would follow an existing junction and hide the
 * reparse point that makes recursive deletion unsafe.
 */
export function assertSafeDeletionTarget(directory, allowedParent) {
  if (typeof allowedParent !== "string" || allowedParent.length === 0) {
    throw new Error("recursive deletion requires an explicit allowed parent");
  }

  const parent = resolve(allowedParent);
  const target = resolve(directory);
  const distance = relative(parent, target);
  if (
    distance.length === 0 ||
    isAbsolute(distance) ||
    distance === ".." ||
    distance.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(
      `refusing to recursively delete outside ${parent}: ${target}`,
    );
  }

  const root = parse(target).root;
  const components = target
    .slice(root.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  let current = root;
  for (const component of components) {
    current = join(current, component);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `refusing to recursively delete through a reparse point: ${current}`,
        );
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
  }
}

export function resetDirectory(directory, allowedParent) {
  assertSafeDeletionTarget(directory, allowedParent);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

export function hasShadowJar(directory) {
  if (!existsSync(directory)) return false;
  return readdirSync(directory).some((name) => {
    if (!name.endsWith("-shadow.jar")) return false;
    const file = join(directory, name);
    let stats;
    try {
      stats = lstatSync(file);
    } catch {
      return false;
    }
    if (!stats.isFile() || stats.size < 4096) return false;

    const bytes = readFileSync(file);
    if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      return false;
    }
    const tail = bytes.subarray(Math.max(0, bytes.length - 65_557));
    const endOfCentralDirectory = tail.lastIndexOf(
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    );
    if (endOfCentralDirectory < 0) return false;
    const endOffset = bytes.length - tail.length + endOfCentralDirectory;
    if (endOffset + 22 > bytes.length) return false;
    const entries = bytes.readUInt16LE(endOffset + 10);
    const centralSize = bytes.readUInt32LE(endOffset + 12);
    const centralOffset = bytes.readUInt32LE(endOffset + 16);
    if (entries === 0 || centralOffset + centralSize > endOffset) return false;
    return bytes.readUInt32LE(centralOffset) === 0x02014b50;
  });
}
