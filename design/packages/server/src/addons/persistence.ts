import { access, appendFile, rename } from "node:fs/promises";
import { constants } from "node:fs";

/** Replace an installed package without exposing a half-written directory. */
export async function renameWithRetry(source: string, target: string, attempts = 6): Promise<void> {
    let last: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try { await rename(source, target); return; } catch (error) {
            last = error;
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw error;
            await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
        }
    }
    throw last instanceof Error ? last : new Error("add-on replacement failed");
}

export async function appendAddonJournal(path: string, event: { action: string; addonId: string; manifestSha256?: string }): Promise<void> {
    await access(path, constants.F_OK).catch(() => undefined);
    await appendFile(path, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, { encoding: "utf8" });
}
