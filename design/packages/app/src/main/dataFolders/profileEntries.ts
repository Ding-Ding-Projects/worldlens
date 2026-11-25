/**
 * What lives in the profile folder, sorted into the three kinds the data folder feature
 * cares about.
 *
 *  - **Volatile**: caches, GPU and code caches, crash dumps, logs, locks and temporary files.
 *    Rebuildable or meaningless on another machine. Left out of history, and not copied when
 *    the profile moves (a lock held by the running application could not be copied anyway).
 *  - **Rebuildable**: downloaded runtimes, jars and rendered output that the application can
 *    fetch or render again, and which would make the history enormous. Left out of history,
 *    but copied when the profile moves because the person may not want to download them again.
 *  - **Credential-bearing**: files that hold secrets. Recorded in the local history exactly as
 *    they sit on disk (never decrypted, never copied into a new form), and left out of what is
 *    sent to a remote unless the person explicitly chooses otherwise on a local network host.
 *
 * Each list is written out by hand, and a test pins them, so a path cannot become credential
 * bearing or volatile by accident of a pattern.
 */

/** Directory names that hold rebuildable browser-engine state, wherever they appear. */
export const VOLATILE_DIRECTORY_NAMES: readonly string[] = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GrShaderCache",
    "GraphiteDawnCache",
    "ShaderCache",
    "blob_storage",
    "Crashpad",
    "Session Storage",
    "logs",
];

/** File names that are lock or process-ownership markers, wherever they appear. */
export const VOLATILE_FILE_NAMES: readonly string[] = [
    "LOCK",
    "lockfile",
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    ".worldlens-lock",
];

/** File name suffixes that mark temporary or lock files. */
export const VOLATILE_FILE_SUFFIXES: readonly string[] = [".tmp", ".lock", ".log", ".dmp"];

/** Top-level folders of rebuildable data, relative to the profile folder. */
export const REBUILDABLE_DIRECTORIES: readonly string[] = [
    "maps",
    "java",
    "engines",
    "render-engines",
    "ollama",
    "ollama-runtime",
    "spigot-builds",
    "vdisk",
    "screenshot-gallery",
    "world-downloader",
    "extensions-builtin",
];

/** Directory names that hold credential material, wherever they appear. */
export const CREDENTIAL_DIRECTORY_NAMES: readonly string[] = [
    "github-accounts",
    "lock-secrets",
    "rcon-secrets",
    "protected-bot-accounts",
    ".ssh",
];

/** File names that hold credential material, wherever they appear. */
export const CREDENTIAL_FILE_NAMES: readonly string[] = [
    "github-credential.json",
    "runtime-settings-credentials.json",
    "runtime-settings-history-credential.json",
    "world-downloader-credential.json",
    "credential.json",
    "toy-locks.v1.json",
    "secret.txt",
];

/** Words that mark a file name as credential material, for names no list could predict. */
const CREDENTIAL_NAME_PATTERN =
    /(credential|secret|password|passphrase|passwd|token|private[-_]?key|id_rsa|id_ed25519|\.pem$|\.p12$|\.pfx$|\.key$)/i;

function segmentsOf(relativePath: string): string[] {
    return relativePath.split(/[\\/]+/).filter((segment) => segment !== "");
}

/** True when a profile-relative path is a volatile entry (cache, lock, crash dump, log). */
export function isVolatilePath(relativePath: string): boolean {
    const segments = segmentsOf(relativePath);
    if (segments.length === 0) return false;
    for (const directory of segments.slice(0, -1)) {
        if (VOLATILE_DIRECTORY_NAMES.includes(directory)) return true;
    }
    const last = segments[segments.length - 1] as string;
    if (VOLATILE_DIRECTORY_NAMES.includes(last)) return true;
    if (VOLATILE_FILE_NAMES.includes(last)) return true;
    return VOLATILE_FILE_SUFFIXES.some((suffix) => last.toLowerCase().endsWith(suffix));
}

/**
 * True when a change at this profile-relative path is worth recording. Used by the folder
 * watcher so cache churn, locks, logs and rendering output never restart the quiet-period timer.
 */
export function isHistoryRelevantPath(relativePath: string): boolean {
    const segments = segmentsOf(relativePath);
    if (segments.length === 0) return true;
    if (segments[0] === ".git") return false;
    if (isVolatilePath(relativePath)) return false;
    return !REBUILDABLE_DIRECTORIES.includes(segments[0] as string);
}

/** True when a profile-relative path holds, or may hold, credential material. */
export function isCredentialPath(relativePath: string): boolean {
    const segments = segmentsOf(relativePath);
    if (segments.length === 0) return false;
    for (const directory of segments.slice(0, -1)) {
        if (CREDENTIAL_DIRECTORY_NAMES.includes(directory)) return true;
    }
    const last = segments[segments.length - 1] as string;
    if (CREDENTIAL_DIRECTORY_NAMES.includes(last)) return true;
    if (CREDENTIAL_FILE_NAMES.includes(last)) return true;
    return CREDENTIAL_NAME_PATTERN.test(last);
}

/** A sentence-per-line description of what a push leaves out, for the interface. */
export function describeCredentialExclusions(): readonly string[] {
    return [
        `Folders named ${CREDENTIAL_DIRECTORY_NAMES.join(", ")}, and everything inside them.`,
        `Files named ${CREDENTIAL_FILE_NAMES.join(", ")}.`,
        "Any file whose name contains credential, secret, password, passphrase, token or private key, and any .pem, .p12, .pfx or .key file.",
    ];
}

/** The ignore rules written to the profile folder's `.gitignore`, in a managed block. */
export const GITIGNORE_BEGIN = "# >>> Worldlens managed ignore rules (rewritten on every start) >>>";
export const GITIGNORE_END = "# <<< Worldlens managed ignore rules <<<";

export function managedIgnoreLines(nestedRepositories: readonly string[] = []): readonly string[] {
    const lines: string[] = [
        "# Rebuildable engine state, caches, locks, logs and crash dumps.",
        ...VOLATILE_DIRECTORY_NAMES.map((name) => `${gitignoreEscape(name)}/`),
        ...VOLATILE_FILE_NAMES.map((name) => gitignoreEscape(name)),
        ...VOLATILE_FILE_SUFFIXES.map((suffix) => `*${suffix}`),
        "# Downloaded or rendered data that can be fetched or rendered again.",
        ...REBUILDABLE_DIRECTORIES.map((name) => `/${name}/`),
        "*.jar",
    ];
    if (nestedRepositories.length > 0) {
        lines.push("# Folders that are Git repositories of their own and keep their own history.");
        for (const path of nestedRepositories) lines.push(`/${gitignoreEscape(path)}/`);
    }
    return lines;
}

function gitignoreEscape(value: string): string {
    return value.replace(/^[#!]/, "\\$&").replace(/ +$/g, (match) => match.replace(/ /g, "\\ "));
}

/**
 * Merges the managed block into whatever `.gitignore` text already exists, keeping every line
 * the person (or anything else) wrote outside the block exactly as it was.
 */
export function mergeManagedIgnore(existing: string | null, nestedRepositories: readonly string[]): string {
    const block = [GITIGNORE_BEGIN, ...managedIgnoreLines(nestedRepositories), GITIGNORE_END].join("\n");
    if (existing === null || existing.trim() === "") return `${block}\n`;
    const begin = existing.indexOf(GITIGNORE_BEGIN);
    const end = existing.indexOf(GITIGNORE_END);
    if (begin !== -1 && end !== -1 && end > begin) {
        return `${existing.slice(0, begin)}${block}${existing.slice(end + GITIGNORE_END.length)}`.replace(/\n*$/, "\n");
    }
    return `${existing.replace(/\n*$/, "\n")}\n${block}\n`;
}
