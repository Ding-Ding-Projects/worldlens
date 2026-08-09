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
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const UPDATE_INSTALL_JOURNAL_FILE = ".worldlens-update-install.json";

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

function nonemptyBounded(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "" && value.length <= 128;
}

function attempt(value: unknown): UpdateInstallAttempt | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<UpdateInstallAttempt>;
    if (
        candidate.schema !== 1 ||
        !nonemptyBounded(candidate.fromVersion) ||
        !nonemptyBounded(candidate.targetVersion) ||
        !nonemptyBounded(candidate.requestedAt)
    ) {
        return null;
    }
    return candidate as UpdateInstallAttempt;
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
            if (!nonemptyBounded(fromVersion) || !nonemptyBounded(targetVersion)) {
                throw new Error("The update transition did not carry two bounded versions.");
            }
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
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
            renameSync(temporary, path);
        },

        reconcile(actualVersion) {
            let raw: unknown;
            try {
                raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "none" };
                clear();
                return { status: "corrupt" };
            }

            const stored = attempt(raw);
            clear();
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
