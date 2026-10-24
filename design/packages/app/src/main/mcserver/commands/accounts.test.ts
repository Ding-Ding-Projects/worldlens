import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProtectedBotAccounts } from "../bots/accounts.js";
describe("OS-protected account storage consumer", () => {
    it("uses protected encryption and rejects unsupported plaintext backends", () => {
        const runtime = {
            app: { getPath: () => "" },
            safeStorage: {
                isEncryptionAvailable: () => false,
                encryptString: () => Buffer.alloc(0),
                decryptString: () => "",
            },
        };
        expect(() => new ProtectedBotAccounts(() => {}, undefined, runtime)).toThrow(
            "OS-protected",
        );
        expect(
            () =>
                new ProtectedBotAccounts(() => {}, undefined, {
                    ...runtime,
                    safeStorage: {
                        ...runtime.safeStorage,
                        isEncryptionAvailable: () => true,
                        getSelectedStorageBackend: () => "basic_text",
                    },
                }),
        ).toThrow("OS-protected");
    });
    it("stores only encrypted account records and validates opaque references", async () => {
        const directory = await mkdtemp(join(tmpdir(), "worldlens-bot-account-test-"));
        const key = randomBytes(32);
        // Cryptographic test double only. Production uses the platform safeStorage provider.
        const runtime = {
            app: { getPath: () => directory },
            safeStorage: {
                isEncryptionAvailable: () => true,
                encryptString: (text: string) => {
                    const iv = randomBytes(12),
                        cipher = createCipheriv("aes-256-gcm", key, iv);
                    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
                    return Buffer.concat([iv, cipher.getAuthTag(), data]);
                },
                decryptString: (bytes: Buffer) => {
                    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
                    decipher.setAuthTag(bytes.subarray(12, 28));
                    return Buffer.concat([
                        decipher.update(bytes.subarray(28)),
                        decipher.final(),
                    ]).toString();
                },
            },
        };
        try {
            const accounts = new ProtectedBotAccounts(() => {}, undefined, runtime);
            const created = await accounts.createMicrosoftAccount(
                "Navigation account",
                "11111111-2222-3333-4444-555555555555",
            );
            await accounts.authorize(created.accountRef);
            expect(await accounts.list()).toEqual([created]);
            const files = await readdir(join(directory, "protected-bot-accounts"));
            expect(files).toEqual([created.accountRef + ".bin"]);
            expect(
                (await readFile(join(directory, "protected-bot-accounts", files[0]!))).toString(),
            ).not.toContain("Navigation account");
            await expect(accounts.authorize("../another-account")).rejects.toThrow("reference");
            await expect(accounts.createMicrosoftAccount("x", "not-a-client-id")).rejects.toThrow(
                "public client",
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
