import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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

/**
 * Picks the first candidate JDK that is actually new enough, not the first one that answers.
 *
 * The distinction is the whole function. Candidates are ordered PATH first, then JAVA_HOME, then
 * the JDK the application provisions for itself, and PATH is the one place an unrelated older
 * java is almost guaranteed to be sitting: a developer machine that has ever built anything in
 * Java has one, and so does every hosted CI image. Stopping there and comparing the version
 * afterwards meant the two candidates added to find a usable JDK were never probed at all, and
 * the failure told the reader to set JAVA_HOME while JAVA_HOME was already pointing at a JDK that
 * would have satisfied it.
 *
 * The highest version seen is still returned when nothing satisfies the requirement, so the
 * caller can name the java this machine does have rather than claiming it has none.
 */
export function selectJavaCandidate({ candidates, requiredMajor, readMajor }) {
  let best = null;
  for (const candidate of candidates) {
    const major = readMajor(candidate);
    if (typeof major !== "number" || !Number.isFinite(major)) continue;
    if (best === null || major > best.major) best = { candidate, major };
    if (major >= requiredMajor) break;
  }
  return best;
}

/**
 * Pulls the version out of `gh --version`, or null when that is not what answered.
 *
 * `gh --version` prints `gh version 2.96.0 (2026-07-11)` followed by a release URL, so the
 * version is the third word of the first line and nothing else in the output resembles it. The
 * parse is deliberately anchored to the `gh version` prefix rather than to "the first thing that
 * looks like a number": a candidate path can easily be some other program entirely, and a wrapper
 * or shim that prints its own banner must be treated as "this is not gh" rather than have a
 * version invented for it from whatever digits it happened to emit.
 */
export function parseGhVersion(output) {
  const match = /\bgh version\s+(\d+\.\d+(?:\.\d+)?)/i.exec(String(output ?? ""));
  return match === null ? null : match[1];
}

/**
 * Picks the first candidate that really is the GitHub CLI.
 *
 * Ordered exactly like the Java candidates above and for the same reason: PATH first because that
 * is what a developer expects to be used, then an explicit environment override, then the
 * conventional install roots the application itself pins in
 * `design/packages/app/src/main/ghcli/executable.ts`. A candidate that does not answer with a `gh
 * version` banner is skipped rather than reported, so a stale shim on PATH cannot make the step
 * claim gh is installed while every later call fails.
 */
export function selectGhCandidate({ candidates, readVersion }) {
  for (const candidate of candidates) {
    const version = readVersion(candidate);
    if (typeof version === "string" && version.length > 0) {
      return { candidate, version };
    }
  }
  return null;
}

/**
 * Decides which of the three gh states a probe actually found.
 *
 * The three are genuinely different problems with genuinely different fixes, and collapsing any
 * two of them sends the reader somewhere useless: "not installed" tells someone with a working gh
 * to install a second one, and "not authenticated" tells someone with no gh at all to run a
 * command they do not have. So an absent executable, an executable nobody has signed in to, and a
 * working signed-in CLI each get their own answer.
 *
 * Signed-in state is read from `gh auth status --json hosts`, which is the same structured route
 * the application uses, and which answers exit code 0 with an empty host map when nobody is
 * signed in. That matters here: the plain-text form of the command exits non-zero in that case,
 * so a status probe built on it cannot tell "nobody is signed in" apart from "the command broke".
 * An output that parses as neither is reported as unreadable rather than as either of the two
 * real answers, because a gh too old to understand `--json` is a third thing again and guessing
 * between them is exactly what this function exists to avoid.
 */
export function classifyGhAuthStatus({ started, output }) {
  if (started !== true) return "unreadable";
  let parsed;
  try {
    parsed = JSON.parse(String(output ?? ""));
  } catch {
    // A gh that predates `--json` on this command prints its usage text, and a fatal error
    // prints prose. Neither is a statement about whether anybody is signed in, whatever the
    // exit code was, so the exit code is deliberately not consulted here.
    return "unreadable";
  }
  if (parsed === null || typeof parsed !== "object") return "unreadable";
  const hosts = parsed.hosts;
  if (typeof hosts !== "object" || hosts === null || Array.isArray(hosts)) {
    return "unreadable";
  }
  const signedIn = Object.values(hosts).some(
    (entries) => Array.isArray(entries) && entries.length > 0,
  );
  return signedIn ? "authenticated" : "unauthenticated";
}

/**
 * The provenance stamp lives beside the jars, not inside them, because the jar is
 * produced by upstream's Gradle build and we do not want to modify it.
 */
export const JAR_STAMP_NAME = "worldlens-jar-provenance.json";

/** Returns the short form used in human-facing messages, tolerating a short input. */
export function shortCommit(commit) {
  return typeof commit === "string" ? commit.slice(0, 12) : "unknown";
}

/**
 * The commit `git rev-parse HEAD` reported, or null when it reported no commit at all.
 *
 * This exists because the obvious reading of a failed `git` call is wrong in a way nothing
 * announces. The bootstrap captures stdout and stderr together so a failing command explains
 * itself in the log, which means a `git` that could not resolve the repository does not answer
 * with an empty string: it answers with `fatal: not a git repository...`, and the first
 * whitespace-separated word of that is the perfectly plausible looking `fatal:`. Stamped into
 * the provenance file, that string is then compared against on the next run and shown to the
 * user as the commit these jars were built from, which is a claim about upstream source that
 * nobody ever made. A source archive with no `.git` beside it is the ordinary way to reach it.
 *
 * So the status is what decides, and the shape is checked afterwards: a full 40-character
 * object name or nothing. Anything else is treated as "we could not read a commit", which the
 * caller is expected to say out loud rather than paper over with a plausible looking value.
 */
export function parseHeadCommit(result) {
  if (result === null || typeof result !== "object") return null;
  if (result.status !== 0) return null;
  const first = String(result.stdout ?? "")
    .trim()
    .split(/\s+/)[0];
  return typeof first === "string" && /^[0-9a-f]{40}$/i.test(first) ? first : null;
}

/**
 * Reads the stamp, treating every unreadable shape as absent rather than throwing.
 *
 * A stamp that cannot be parsed tells us nothing about which source the jars came
 * from, which is exactly the situation a rebuild resolves. Failing the step instead
 * would leave a developer stuck behind a one-line JSON file they never wrote by hand.
 */
export function readJarStamp(stampFile) {
  let raw;
  try {
    raw = readFileSync(stampFile, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  if (typeof parsed.commit !== "string" || parsed.commit.length === 0) {
    return null;
  }
  return parsed;
}

/**
 * Decides whether the built jars still correspond to the vendored source.
 *
 * The two conditions are deliberately conjunctive. Asking only whether a jar exists
 * is the defect this replaces: advancing the submodule left a stale jar in place
 * forever while the step reported success, so the product rendered with a renderer
 * built from code no longer in the tree. Asking only whether the stamp matches is
 * the mirror-image trap, because a stamp outlives a jar somebody deleted by hand.
 */
export function jarBuildState({
  jarDirectory,
  stampFile,
  sourceCommit,
  hasJar = hasShadowJar,
}) {
  if (!hasJar(jarDirectory)) {
    return { fresh: false, reason: "missing-jar", stampCommit: null };
  }
  const stamp = readJarStamp(stampFile);
  if (stamp === null) {
    return { fresh: false, reason: "missing-stamp", stampCommit: null };
  }
  if (stamp.commit !== sourceCommit) {
    return { fresh: false, reason: "stale", stampCommit: stamp.commit };
  }
  return { fresh: true, reason: "fresh", stampCommit: stamp.commit };
}

/**
 * Pulls the upstream version out of a shadow jar filename when one is encoded there.
 *
 * Upstream does not publish the version anywhere this script can read cheaply, so the
 * filename is the only source available. It is recorded for a human reading the stamp
 * and is never used to decide whether to rebuild, which is why an unparseable name is
 * simply omitted rather than treated as an error.
 */
export function shadowJarVersion(directory) {
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return null;
  }
  // The newest jar, not the first one the directory happens to list.
  //
  // Gradle does not remove the previous version's jar when the version changes, so after an
  // upgrade this directory holds both. Taking the first match meant taking whichever name sorted
  // earliest, and `cli-5.22-27-shadow.jar` sorts before `cli-5.23-shadow.jar`, so the very first
  // real upgrade this feature handled wrote a stamp reading `"version": "5.22-27"` beside a jar
  // built from 5.23. The commit is what decides a rebuild so nothing behaved wrongly, but a
  // provenance record whose one human-readable field is wrong is worse than one that omits it:
  // somebody reads the version, believes it, and stops looking.
  let newest = null;
  for (const name of names) {
    if (!name.endsWith("-shadow.jar")) continue;
    const match = /-(\d[\w.+-]*?)-(?:cli-)?shadow\.jar$/.exec(name);
    if (match === null) continue;
    let modified;
    try {
      modified = statSync(join(directory, name)).mtimeMs;
    } catch {
      // Vanished between the listing and the stat. Skip it rather than fail: this whole
      // function is decoration on the stamp and must never break a build.
      continue;
    }
    if (newest === null || modified > newest.modified) {
      newest = { version: match[1], modified };
    }
  }
  return newest === null ? null : newest.version;
}
