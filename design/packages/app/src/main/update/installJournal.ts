/**
 * A durable receipt for the one update transition the user explicitly requested.
 *
 * Squirrel owns the actual replacement and rollback transaction, so the application cannot
 * truthfully claim success when `quitAndInstall()` returns: the old process is still running
 * at that moment. This record is written before the quit. The next process compares the
 * version that actually started with both ends of the requested transition and consumes the
 * record exactly once.
 *
 * The file contains versions and a timestamp only. It never contains a feed credential,
 * release-note body, package path, or user document. A malformed record is not trusted and is
 * reported as an unproven transition rather than silently promoted to success.
 */

import { randomBytes } from "node:crypto";
import {
    closeSync,
    fstatSync,
    fsyncSync,
    lstatSync,
    mkdirSync,
    openSync,
    readSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { replaceFileWithRetrySync } from "../storage/atomicReplace.js";
import { isStrictlyNewerVersion } from "./version.js";

export const UPDATE_INSTALL_JOURNAL_FILE = ".worldlens-update-install.json";
/** Small enough to read before the window opens without a corrupt local file stalling launch. */
export const UPDATE_INSTALL_JOURNAL_MAX_BYTES = 4_096;

export interface UpdateInstallAttempt {
    readonly schema: 1;
    readonly fromVersion: string;
    readonly targetVersion: string;
    readonly requestedAt: string;
}

export type UpdateInstallOutcome =
    | { readonly status: "none" }
    | { readonly status: "installed"; readonly attempt: UpdateInstallAttempt }
    | { readonly status: "rolled-back"; readonly attempt: UpdateInstallAttempt }
    | {
          readonly status: "version-mismatch";
          readonly attempt: UpdateInstallAttempt;
          readonly actualVersion: string;
      }
    | { readonly status: "corrupt" };

export interface UpdateInstallJournal {
    begin(fromVersion: string, targetVersion: string): void;
    reconcile(actualVersion: string): UpdateInstallOutcome;
    clear(): void;
}

const EXACT_VERSION =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

function exactVersion(value: unknown): value is string {
    return typeof value === "string" && value.length <= 64 && EXACT_VERSION.test(value);
}

function exactTimestamp(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 64) return false;
    try {
        return new Date(value).toISOString() === value;
    } catch {
        return false;
    }
}

function attempt(value: unknown): UpdateInstallAttempt | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<UpdateInstallAttempt>;
    if (
        candidate.schema !== 1 ||
        !exactVersion(candidate.fromVersion) ||
        !exactVersion(candidate.targetVersion) ||
        !exactTimestamp(candidate.requestedAt)
    ) {
        return null;
    }
    return candidate as UpdateInstallAttempt;
}

/**
 * Read at most one bounded record from a regular file.
 *
 * Looking at `stat.size` and then calling `readFileSync` is not a bound: the file can grow
 * between those calls and `readFileSync` will still allocate for all of it. The descriptor
 * stays open while this reads one byte past the limit, so both a pre-existing oversized file
 * and one growing concurrently fail before JSON parsing.
 */
function readJournal(path: string): string {
    if (lstatSync(path).isSymbolicLink()) {
        throw new Error("update install journal must not be a symbolic link");
    }
    const handle = openSync(path, "r");
    try {
        const metadata = fstatSync(handle);
        if (!metadata.isFile() || metadata.size > UPDATE_INSTALL_JOURNAL_MAX_BYTES) {
            throw new Error("update install journal is not one bounded regular file");
        }
        const bytes = Buffer.alloc(UPDATE_INSTALL_JOURNAL_MAX_BYTES + 1);
        let count = 0;
        while (count < bytes.length) {
            const received = readSync(handle, bytes, count, bytes.length - count, count);
            if (received === 0) break;
            count += received;
        }
        if (count > UPDATE_INSTALL_JOURNAL_MAX_BYTES) {
            throw new Error("update install journal exceeds its byte limit");
        }
        return bytes.subarray(0, count).toString("utf8");
    } finally {
        closeSync(handle);
    }
}

export function createFileUpdateInstallJournal(
    dataDirectory: string,
    now: () => Date = () => new Date(),
): UpdateInstallJournal {
    const path = join(dataDirectory, UPDATE_INSTALL_JOURNAL_FILE);

    const clear = (): void => {
        rmSync(path, { force: true });
    };

    return {
        begin(fromVersion, targetVersion) {
            if (!exactVersion(fromVersion) || !exactVersion(targetVersion)) {
                throw new Error("The update transition did not carry two exact bounded versions.");
            }
            if (!isStrictlyNewerVersion(targetVersion, fromVersion)) {
                throw new Error(
                    "The update transition target must be newer than the running version.",
                );
            }
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
            try {
                writeFileSync(
                    temporary,
                    `${JSON.stringify(
                        {
                            schema: 1,
                            fromVersion,
                            targetVersion,
                            requestedAt: now().toISOString(),
                        } satisfies UpdateInstallAttempt,
                        null,
                        4,
                    )}\n`,
                    { encoding: "utf8", mode: 0o600 },
                );
                const handle = openSync(temporary, "r+");
                try {
                    fsyncSync(handle);
                } finally {
                    closeSync(handle);
                }
                replaceFileWithRetrySync(temporary, path);
            } finally {
                rmSync(temporary, { force: true });
            }
        },

        reconcile(actualVersion) {
            let raw: unknown;
            try {
                raw = JSON.parse(readJournal(path)) as unknown;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "none" };
                return { status: "corrupt" };
            }

            const stored = attempt(raw);
            if (stored === null) return { status: "corrupt" };
            if (actualVersion === stored.targetVersion) {
                return { status: "installed", attempt: stored };
            }
            if (actualVersion === stored.fromVersion) {
                return { status: "rolled-back", attempt: stored };
            }
            return { status: "version-mismatch", attempt: stored, actualVersion };
        },

        clear,
    };
}
