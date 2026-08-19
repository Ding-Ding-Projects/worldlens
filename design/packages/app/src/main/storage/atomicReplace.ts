/**
 * Crash-safe text replacement for the small state files owned by the main process.
 *
 * A unique sibling staging file prevents concurrent writers from moving each other's bytes.
 * The final rename is retried only for the transient sharing failures Windows reports when a
 * scanner, indexer, or another writer briefly has the destination open. Every other failure is
 * returned immediately, and the staging file is removed on either outcome.
 */

import { randomBytes } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";

export type AsyncFileReplace = (source: string, destination: string) => Promise<void>;

const RETRY_DELAYS_MS = [8, 16, 32, 64, 128] as const;
const TRANSIENT_REPLACE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const SYNC_WAIT_CELL = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function uniqueSibling(target: string): string {
    return `${target}.${String(process.pid)}.${randomBytes(6).toString("hex")}.writing`;
}

function isTransientReplaceFailure(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) return false;
    return TRANSIENT_REPLACE_CODES.has(String((error as { readonly code?: unknown }).code));
}

function wait(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/** Replaces one sibling file, retrying only short-lived destination sharing failures. */
export async function replaceFileWithRetry(
    source: string,
    destination: string,
    replace: AsyncFileReplace = rename,
): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await replace(source, destination);
            return;
        } catch (error) {
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay === undefined || !isTransientReplaceFailure(error)) throw error;
            await wait(delay);
        }
    }
}

/** Synchronous counterpart for callers that must fsync their staged bytes first. */
export function replaceFileWithRetrySync(source: string, destination: string): void {
    for (let attempt = 0; ; attempt += 1) {
        try {
            renameSync(source, destination);
            return;
        } catch (error) {
            const delay = RETRY_DELAYS_MS[attempt];
            if (delay === undefined || !isTransientReplaceFailure(error)) throw error;
            Atomics.wait(SYNC_WAIT_CELL, 0, 0, delay);
        }
    }
}

/** Writes UTF-8 text through a unique sibling and a bounded atomic replacement. */
export async function atomicWriteTextFile(target: string, text: string): Promise<void> {
    const staging = uniqueSibling(target);
    try {
        await writeFile(staging, text, "utf8");
        await replaceFileWithRetry(staging, target);
    } finally {
        await rm(staging, { force: true }).catch(() => undefined);
    }
}

/** Synchronous counterpart for the three tiny settings stores with synchronous APIs. */
export function atomicWriteTextFileSync(target: string, text: string): void {
    const staging = uniqueSibling(target);
    try {
        writeFileSync(staging, text, "utf8");
        replaceFileWithRetrySync(staging, target);
    } finally {
        try {
            rmSync(staging, { force: true });
        } catch {
            // The original write/replace result remains the useful outcome.
        }
    }
}
