/**
 * Where the web console's password record lives on disk.
 *
 * The record itself is already ciphertext (see `password.ts` - it is the output of
 * `safeStorage.encryptString`), so this file's only job is putting those bytes somewhere
 * durable and reading them back. Same shape as `locks/store.ts`'s `putSecret`/`getSecret`.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteTextFile } from "../../storage/atomicReplace.js";

export const WEBCONSOLE_PASSWORD_FILE = "webconsole-password.v1.bin";

export class WebConsolePasswordStore {
    readonly #file: string;

    constructor(dataFolder: string) {
        this.#file = join(dataFolder, WEBCONSOLE_PASSWORD_FILE);
    }

    async put(ciphertext: Buffer): Promise<void> {
        await mkdir(dirname(this.#file), { recursive: true });
        await atomicWriteTextFile(this.#file, ciphertext.toString("base64"));
    }

    async get(): Promise<Buffer | null> {
        try {
            const base64 = await readFile(this.#file, "utf8");
            return Buffer.from(base64, "base64");
        } catch {
            return null;
        }
    }

    async clear(): Promise<void> {
        try {
            await rm(this.#file, { force: true });
        } catch {
            /* already gone */
        }
    }
}
