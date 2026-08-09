/**
 * The persisted half of the world downloader's configuration, and the one thing it must never
 * contain.
 *
 * ## Two records, kept apart on purpose
 *
 * A download is started from two pieces of state: a settings record, which is a server address, a
 * folder and a few dozen option values, and an access token. Only one of those is a secret, and
 * the cheapest way to guarantee the secret never ends up in a settings export, a support bundle,
 * a synchronised profile folder or a screenshot is for the two to live in different files written
 * by different modules with different rules. `secret.ts` owns the token and encrypts it;
 * this module owns everything else and writes it in the clear, because a server address is not a
 * secret and pretending it is would mean a Keychain prompt every time the form is opened.
 *
 * That separation is only worth anything if it is enforced rather than assumed, so
 * {@link readDownloaderSettings} actively strips anything token-shaped out of what it parses. A
 * settings file that has somehow acquired a `token` field - written by an older build, by a
 * hand-edit, by a well-meaning migration - must not be able to smuggle one back into a record
 * that this application freely exports.
 *
 * ## Why the reader distrusts its own file
 *
 * The file is JSON on the user's disk, which means it can be anything: hand-edited, truncated by
 * a power cut, written by a future version of this application, or copied out of somebody else's
 * profile. `JSON.parse` returning an object proves the bytes were syntactically JSON and nothing
 * whatsoever about their shape, so every field is checked individually and a record that fails
 * any check is reported as no record at all.
 *
 * Returning null rather than a partially-repaired object is deliberate. A half-trusted settings
 * record produces a malformed argument vector, and the failure surfaces as the downloader
 * refusing to start with a message about a flag nobody typed. Starting from the defaults is a
 * state a person can see and correct.
 *
 * ## Why the write is staged and renamed
 *
 * Exactly the reasoning `../java/installation.ts` gives for its own record. A plain write that is
 * interrupted leaves a truncated file, and a truncated JSON file that still happens to parse is
 * the worst available outcome, because it is a lie that passes validation. A rename is atomic, so
 * what is on disk is either the previous settings or the new ones and never a state that never
 * existed.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
    DOWNLOADER_OPTIONS_BY_KEY,
    SUPPORTED_MINECRAFT_VERSIONS,
} from "@worldlens/shared/dist/downloaderOptions.js";
import type {
    DownloaderAccount,
    DownloaderAccountMode,
    DownloaderSettings,
} from "@worldlens/shared/dist/downloaderOptions.js";

/** Bumped if the meaning of a stored field changes in a way an older reader would misread. */
export const DOWNLOADER_SETTINGS_VERSION = 1;

export interface StoredDownloaderSettings {
    readonly version: number;
    readonly settings: DownloaderSettings;
    /** ISO-8601 with offset, so a settings surface can say how old the stored record is. */
    readonly savedAt: string;
}

/**
 * The version a fresh installation starts on.
 *
 * 1.21 rather than the newest anchor in the list, because the picker exists to describe the game
 * the person is actually going to connect with, and the newest entry in that table is always the
 * least exercised one. A default that is wrong for most people is worse than a default that is
 * merely not the newest.
 */
export const DEFAULT_DECLARED_VERSION = "1.21";

/** `<dataDir>/world-downloader/settings.json`, beside the installed jar record. */
export function downloaderSettingsFile(dataDir: string): string {
    return join(dataDir, "world-downloader", "settings.json");
}

/**
 * The starting point: nothing chosen, nothing assumed.
 *
 * The server and the folder are empty rather than guessed, which is what makes the validation
 * messages in `validateDownloaderSettings` the first thing a person sees rather than a plausible
 * looking value they have to notice is wrong. `options` is empty for the same reason it is a
 * sparse record everywhere else: a missing key means "whatever the tool itself does", and writing
 * out the tool's own defaults would freeze today's version of them into somebody's profile.
 */
export function defaultDownloaderSettings(): DownloaderSettings {
    return {
        server: "",
        outputFolder: "",
        declaredVersion: DEFAULT_DECLARED_VERSION,
        account: { mode: "microsoft", username: "" },
        options: {},
    };
}

/**
 * Field names that are never stored here, whatever a file on disk claims.
 *
 * The option keys this module accepts are checked against the shared schema, so none of these can
 * currently reach the `options` record anyway. The list exists for the day somebody adds an option
 * key with one of these names and does not think about this file: a stripped value is a bug report
 * about a control that does not persist, while a value that survives is a secret in a plaintext
 * file that gets exported. The first of those is found in a minute and the second is not found at
 * all.
 */
const SECRET_SHAPED_KEYS: readonly string[] = [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "password",
    "secret",
    "apiKey",
];

function looksSecret(key: string): boolean {
    const lower = key.toLowerCase();
    return SECRET_SHAPED_KEYS.some((candidate) => candidate.toLowerCase() === lower);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAccountMode(value: unknown): DownloaderAccountMode | null {
    return value === "microsoft" || value === "token" || value === "offline" ? value : null;
}

function readAccount(value: unknown): DownloaderAccount | null {
    if (!isRecord(value)) return null;
    const mode = readAccountMode(value["mode"]);
    const username = value["username"];
    if (mode === null) return null;
    if (typeof username !== "string") return null;
    return { mode, username };
}

/**
 * The option record, rebuilt from scratch out of only what belongs in it.
 *
 * Built rather than filtered, so that whatever else the parsed object was carrying - a key from a
 * newer build, a key from a hand-edit, a nested object, a function that survived a bad
 * serialisation round trip - simply has no route into the returned value. A filter leaves the
 * question "did I remember every case" open; a rebuild answers it.
 */
function readOptions(value: unknown): Readonly<Record<string, string | number | boolean>> {
    if (!isRecord(value)) return {};
    const options: Record<string, string | number | boolean> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (looksSecret(key)) continue;
        if (!DOWNLOADER_OPTIONS_BY_KEY.has(key)) continue;
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
            options[key] = entry;
        }
    }
    return options;
}

/**
 * The declared version, or the default when the stored one names nothing the tool knows about.
 *
 * This one field is repaired rather than treated as grounds for rejecting the whole record,
 * because the value is a label on a picker: a version anchor can be renamed or retired upstream,
 * and throwing away somebody's server address, output folder and thirty option values over a
 * string that no longer appears in a list would be a wildly disproportionate response. Every
 * other field is either structurally valid or the record is refused.
 */
function readDeclaredVersion(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_DECLARED_VERSION;
    return SUPPORTED_MINECRAFT_VERSIONS.some((anchor) => anchor.name === value)
        ? value
        : DEFAULT_DECLARED_VERSION;
}

/**
 * The stored settings, or null when there are none that can be trusted.
 *
 * Missing, unreadable, not JSON, not an object, written under a different schema version, or
 * carrying a field of the wrong type all read the same way: nothing is stored. That is the safe
 * direction every time. Being wrong costs somebody re-typing a server address, whereas trusting a
 * record that does not describe reality means building an argument vector out of it and handing
 * that to a JVM.
 */
export function readDownloaderSettings(dataDir: string): DownloaderSettings | null {
    let raw: string;
    try {
        raw = readFileSync(downloaderSettingsFile(dataDir), "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed["version"] !== DOWNLOADER_SETTINGS_VERSION) return null;

    const stored = parsed["settings"];
    if (!isRecord(stored)) return null;

    const server = stored["server"];
    const outputFolder = stored["outputFolder"];
    if (typeof server !== "string") return null;
    if (typeof outputFolder !== "string") return null;

    const account = readAccount(stored["account"]);
    if (account === null) return null;

    // Assembled field by field rather than spread from `stored`, which is what makes the secret
    // stripping above load-bearing: there is no path by which an unexpected key on the parsed
    // object reaches the returned record, because the returned record is built from a fixed list
    // of names.
    return {
        server,
        outputFolder,
        declaredVersion: readDeclaredVersion(stored["declaredVersion"]),
        account,
        options: readOptions(stored["options"]),
    };
}

/**
 * Writes the settings and returns exactly what was written.
 *
 * The returned envelope is the written one rather than a fresh read, so a caller that wants to
 * show "saved at" does not have to go back to disk for a value it just produced. The settings are
 * passed through {@link readOptions}' sibling logic on the way in as well: the renderer is not
 * trusted to have sent only known keys, and a settings file this application wrote should never
 * be the thing that reintroduces a key its own reader would strip.
 */
export function writeDownloaderSettings(
    dataDir: string,
    settings: DownloaderSettings,
): StoredDownloaderSettings {
    const record: StoredDownloaderSettings = {
        version: DOWNLOADER_SETTINGS_VERSION,
        settings: {
            server: settings.server,
            outputFolder: settings.outputFolder,
            declaredVersion: settings.declaredVersion,
            account: { mode: settings.account.mode, username: settings.account.username },
            options: readOptions(settings.options),
        },
        savedAt: new Date().toISOString(),
    };

    const file = downloaderSettingsFile(dataDir);
    mkdirSync(dirname(file), { recursive: true });
    const staging = `${file}.writing`;
    writeFileSync(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    renameSync(staging, file);
    return record;
}
