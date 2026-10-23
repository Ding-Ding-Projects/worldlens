import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProtectedAccessStore, createPasswordVerifier, verifyPassword } from "./access.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("salted verification accepts only the correct password", async () => {
    const first = await createPasswordVerifier("test-only-password-1234");
    const second = await createPasswordVerifier("test-only-password-1234");
    expect(first.salt).not.toBe(second.salt);
    expect(await verifyPassword("test-only-password-1234", first)).toBe(true);
    expect(await verifyPassword("wrong", first)).toBe(false);
});
test("protected preparation exposes only a reference and bootstrap is consumed across restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "access-")); roots.push(root);
    const protection = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(Buffer.from(value).map(byte => byte ^ 0x5a)), decryptString: (value: Buffer) => Buffer.from(Buffer.from(value).map(byte => byte ^ 0x5a)).toString() };
    const store = new ProtectedAccessStore(root, protection);
    const result = await store.prepare("admin", "test-only-password-1234");
    expect(Object.keys(result).sort()).toEqual(["reference", "state", "username"]);
    const file = join(root, (await readdir(root))[0]!);
    expect((await readFile(file)).includes(Buffer.from("test-only-password-1234"))).toBe(false);
    await store.consumeBootstrap(result.reference, async access => { expect(access.username).toBe("admin"); expect(access.verifier.algorithm).toBe("scrypt-v1"); });
    await expect(new ProtectedAccessStore(root, protection).consumeBootstrap(result.reference, async () => { throw new Error("must not deliver twice"); })).rejects.toThrow("Prepare new access");
});
