import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SafeStorageLike } from "../worlddownloader/credentialStore.js";

const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export interface PreparedAccess { reference: string; username: string; state: "prepared" }
export interface AccessPresence { reference: string; username: string; state: "prepared" | "provisioned" | "verified" | "unavailable" }
export interface PasswordVerifier { algorithm: "scrypt-v1"; salt: string; digest: string }
export interface BootstrapAccess { username: string; verifier: PasswordVerifier }
export async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
    if (password.length < 12 || password.length > 1024) throw new Error("Choose a password between 12 and 1024 characters.");
    const salt = randomBytes(32).toString("hex");
    const digest = await derive(password, salt);
    return { algorithm: "scrypt-v1", salt, digest: digest.toString("hex") };
}
export async function verifyPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
    if (password.length > 1024 || verifier.algorithm !== "scrypt-v1" || !/^[a-f0-9]{64}$/u.test(verifier.salt) || !/^[a-f0-9]{128}$/u.test(verifier.digest)) return false;
    const actual = await derive(password, verifier.salt);
    return timingSafeEqual(actual, Buffer.from(verifier.digest, "hex"));
}
/** Storage root is private application data, never a project or export directory. */
export class ProtectedAccessStore {
    private readonly consumed = new Set<string>();
    constructor(private readonly root: string, private readonly protection: SafeStorageLike & { getSelectedStorageBackend?: () => string }) {}
    private ensureProtection(): void {
        if (!this.protection.isEncryptionAvailable() || this.protection.getSelectedStorageBackend?.() === "basic_text") throw new Error("Protected credential storage is unavailable.");
    }
    async prepare(username: string, password: string): Promise<PreparedAccess> {
        this.ensureProtection();
        if (!/^[\p{L}\p{N}_.@-]{1,80}$/u.test(username)) throw new Error("Enter a valid administrator username.");
        const reference = randomUUID();
        const verifier = await createPasswordVerifier(password);
        const encrypted = this.protection.encryptString(JSON.stringify({ username, verifier }));
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await writeFile(join(this.root, reference + ".bin"), encrypted, { mode: 0o600, flag: "wx" });
        await writeFile(join(this.root, reference + ".status.json"), JSON.stringify({ reference, username, state: "prepared" }), { mode: 0o600, flag: "wx" });
        return { reference, username, state: "prepared" };
    }
    async read(reference: string): Promise<AccessPresence> {
        if (!/^[a-f0-9-]{36}$/u.test(reference)) throw new Error("Invalid access reference.");
        const value = JSON.parse(await readFile(join(this.root, reference + ".status.json"), "utf8")) as AccessPresence;
        if (value.reference !== reference || !["prepared", "provisioned", "verified", "unavailable"].includes(value.state)) throw new Error("Access state is unavailable.");
        if (value.state === "prepared") { try { await lstat(join(this.root, reference + ".bin")); } catch { return { ...value, state: "unavailable" }; } }
        return value;
    }
    async consumeBootstrap(reference: string, deliver: (access: BootstrapAccess) => Promise<void>): Promise<void> {
        this.ensureProtection();
        if (!/^[a-f0-9-]{36}$/u.test(reference) || this.consumed.has(reference)) throw new Error("Access preparation is unavailable or already provisioned.");
        this.consumed.add(reference);
        const claimed = join(this.root, reference + ".claimed");
        try {
            // Claim before delivery. A crash cannot make the same bootstrap reusable.
            await rename(join(this.root, reference + ".bin"), claimed);
            const encrypted = await readFile(claimed);
            const access = JSON.parse(this.protection.decryptString(encrypted)) as BootstrapAccess;
            await deliver(access);
            await rm(claimed);
            await writeFile(join(this.root, reference + ".status.json"), JSON.stringify({ reference, username: access.username, state: "provisioned" }), { mode: 0o600 });
        } catch { throw new Error("Protected bootstrap did not complete. Prepare new access before retrying."); }
    }
}
