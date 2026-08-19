/**
 * Durable proof that this installed profile has reached the Worldlens release feed.
 *
 * Until that proof exists the updater checks the current feed first and may fall back to
 * the legacy repository for the one bridge release. Once the current feed actually
 * delivers an update, the exact current/legacy repository-and-channel identity pair is
 * recorded atomically and later launches stop consulting the legacy source. Release-feed
 * URLs end in the installed version, so persisting those URLs would make every new build
 * forget the previous build's confirmation. A changed identity pair still invalidates the
 * record; a stale confirmation must never silently bless a different repository or channel.
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

export const UPDATE_FEED_HANDOFF_FILE = ".worldlens-update-feed-handoff.json";
/** Small enough to read during launch without allowing a corrupt file to allocate freely. */
export const UPDATE_FEED_HANDOFF_MAX_BYTES = 4_096;

interface HandoffRecord {
    readonly version: 2;
    readonly currentIdentity: string;
    readonly legacyIdentity: string;
    readonly confirmedAt: string;
}

export interface UpdateFeedHandoff {
    isCurrentConfirmed(currentIdentity: string, legacyIdentity: string): boolean;
    confirmCurrent(currentIdentity: string, legacyIdentity: string): void;
}

function record(value: unknown): HandoffRecord | null {
    if (typeof value !== "object" || value === null) return null;
    const candidate = value as Partial<HandoffRecord>;
    if (
        candidate.version !== 2 ||
        typeof candidate.currentIdentity !== "string" ||
        typeof candidate.legacyIdentity !== "string" ||
        candidate.currentIdentity.length > 256 ||
        candidate.legacyIdentity.length > 256 ||
        candidate.currentIdentity.trim() === "" ||
        candidate.legacyIdentity.trim() === "" ||
        typeof candidate.confirmedAt !== "string" ||
        candidate.confirmedAt.length > 64
    ) {
        return null;
    }
    try {
        if (new Date(candidate.confirmedAt).toISOString() !== candidate.confirmedAt) return null;
    } catch {
        return null;
    }
    return candidate as HandoffRecord;
}

function readHandoff(path: string): string {
    if (lstatSync(path).isSymbolicLink()) {
        throw new Error("update feed handoff must not be a symbolic link");
    }
    const handle = openSync(path, "r");
    try {
        const metadata = fstatSync(handle);
        if (!metadata.isFile() || metadata.size > UPDATE_FEED_HANDOFF_MAX_BYTES) {
            throw new Error("update feed handoff is not one bounded regular file");
        }
        const bytes = Buffer.alloc(UPDATE_FEED_HANDOFF_MAX_BYTES + 1);
        let count = 0;
        while (count < bytes.length) {
            const received = readSync(handle, bytes, count, bytes.length - count, count);
            if (received === 0) break;
            count += received;
        }
        if (count > UPDATE_FEED_HANDOFF_MAX_BYTES) {
            throw new Error("update feed handoff exceeds its byte limit");
        }
        return bytes.subarray(0, count).toString("utf8");
    } finally {
        closeSync(handle);
    }
}

export function createFileUpdateFeedHandoff(
    dataDirectory: string,
    now: () => Date = () => new Date(),
): UpdateFeedHandoff {
    const path = join(dataDirectory, UPDATE_FEED_HANDOFF_FILE);

    const read = (): HandoffRecord | null => {
        try {
            return record(JSON.parse(readHandoff(path)) as unknown);
        } catch {
            return null;
        }
    };

    return {
        isCurrentConfirmed(currentIdentity, legacyIdentity) {
            const stored = read();
            return (
                stored !== null &&
                stored.currentIdentity === currentIdentity &&
                stored.legacyIdentity === legacyIdentity
            );
        },
        confirmCurrent(currentIdentity, legacyIdentity) {
            mkdirSync(dirname(path), { recursive: true });
            const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
            try {
                writeFileSync(
                    temporary,
                    `${JSON.stringify(
                        {
                            version: 2,
                            currentIdentity,
                            legacyIdentity,
                            confirmedAt: now().toISOString(),
                        } satisfies HandoffRecord,
                        null,
                        4,
                    )}\n`,
                    "utf8",
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
    };
}
