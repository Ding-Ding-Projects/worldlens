import { createRequire } from "node:module";
import { fork } from "node:child_process";
import { randomUUID, createPrivateKey, createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProtectedAccount } from "./mineflayer.js";
export interface ProtectedDevicePrompt {
    accountRef: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
}
export interface JavaAccountSession {
    accessToken: string;
    profile: { id: string; name: string };
    certificates: Record<string, unknown> | null;
}
interface StoredAccount {
    schemaVersion: 1;
    reference: string;
    clientId: string;
    label: string;
    caches: Record<string, unknown>;
}
interface StorageRuntime {
    app: { getPath(name: "userData"): string };
    safeStorage: {
        isEncryptionAvailable(): boolean;
        encryptString(value: string): Buffer;
        decryptString(value: Buffer): string;
        getSelectedStorageBackend?(): string;
    };
}
/** OS-protected storage plus isolated, non-logging Microsoft device authentication. */
export class ProtectedBotAccounts {
    readonly #runtime: StorageRuntime;
    readonly #prompt: (prompt: ProtectedDevicePrompt) => void;
    readonly #workerPath: string;
    readonly #active = new Map<string, Promise<JavaAccountSession>>();
    readonly #cancel = new Map<string, () => void>();
    constructor(
        prompt: (prompt: ProtectedDevicePrompt) => void,
        workerPath = fileURLToPath(new URL("./auth-worker.mjs", import.meta.url)),
        runtime?: StorageRuntime,
    ) {
        this.#runtime = runtime ?? (createRequire(import.meta.url)("electron") as StorageRuntime);
        this.#prompt = prompt;
        this.#workerPath = workerPath;
        if (
            !this.#runtime.safeStorage.isEncryptionAvailable() ||
            this.#runtime.safeStorage.getSelectedStorageBackend?.() === "basic_text"
        )
            throw new Error("OS-protected account storage is unavailable.");
    }
    #path(reference: string): string {
        if (!/^[a-f0-9-]{36}$/.test(reference))
            throw new Error("Invalid protected account reference.");
        return join(
            this.#runtime.app.getPath("userData"),
            "protected-bot-accounts",
            `${reference}.bin`,
        );
    }
    async #store(account: StoredAccount): Promise<void> {
        const text = JSON.stringify(account);
        if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Account cache exceeds limit.");
        const destination = this.#path(account.reference),
            temporary = `${destination}.${randomUUID()}.tmp`;
        await mkdir(join(this.#runtime.app.getPath("userData"), "protected-bot-accounts"), {
            recursive: true,
            mode: 0o700,
        });
        const encrypted = this.#runtime.safeStorage.encryptString(text);
        await writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 });
        try {
            await rename(temporary, destination);
        } finally {
            await rm(temporary, { force: true });
        }
    }
    async #read(reference: string): Promise<StoredAccount> {
        const encrypted = await readFile(this.#path(reference));
        if (encrypted.length > 2 * 1024 * 1024) throw new Error("Account cache exceeds limit.");
        const account = JSON.parse(
            this.#runtime.safeStorage.decryptString(encrypted),
        ) as StoredAccount;
        if (
            account.schemaVersion !== 1 ||
            account.reference !== reference ||
            !account.caches ||
            !/^[a-f0-9-]{36}$/i.test(account.clientId)
        )
            throw new Error("Invalid protected account record.");
        return account;
    }
    /** The client id is the application's registered Microsoft public-client identifier, never a client secret. */
    async createMicrosoftAccount(
        label: string,
        clientId: string,
    ): Promise<{ accountRef: string; label: string }> {
        if (
            !label ||
            label.length > 80 ||
            /[\r\n\0]/.test(label) ||
            !/^[a-f0-9-]{36}$/i.test(clientId)
        )
            throw new Error("Valid account label and registered public client id required.");
        const reference = randomUUID();
        await this.#store({ schemaVersion: 1, reference, label, clientId, caches: {} });
        return { accountRef: reference, label };
    }
    async authorize(reference: string): Promise<void> {
        await this.#read(reference);
    }
    async authenticate(reference: string): Promise<JavaAccountSession> {
        const previous = this.#active.get(reference);
        if (previous) return previous;
        const attempt = this.#authenticate(reference);
        this.#active.set(reference, attempt);
        try {
            return await attempt;
        } finally {
            this.#active.delete(reference);
        }
    }
    async #authenticate(reference: string): Promise<JavaAccountSession> {
        const account = await this.#read(reference);
        const environment: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
        delete environment.DEBUG;
        delete environment.NODE_OPTIONS;
        const workerOptions = {
            silent: true,
            windowsHide: true,
            serialization: "advanced" as const,
            env: environment,
        };
        const child = fork(this.#workerPath, [], workerOptions);
        child.stdout?.resume();
        child.stderr?.resume();
        return await new Promise<JavaAccountSession>((resolveSession, reject) => {
            let settled = false,
                writes = Promise.resolve();
            const finish = (session?: JavaAccountSession): void => {
                if (settled) return;
                settled = true;
                this.#cancel.delete(reference);
                clearTimeout(timer);
                child.kill();
                if (session) resolveSession(session);
                else reject(new Error("Protected Microsoft sign-in did not complete."));
            };
            this.#cancel.set(reference, () => finish());
            const timer = setTimeout(() => finish(), 15 * 60 * 1000);
            child.on("message", (raw) => {
                const message = raw as Record<string, unknown>;
                if (message.kind === "store") {
                    writes = writes
                        .then(async () => {
                            account.caches = message.caches as Record<string, unknown>;
                            await this.#store(account);
                            child.send({ kind: "stored", id: message.id, ok: true });
                        })
                        .catch(() => {
                            child.send({ kind: "stored", id: message.id, ok: false });
                            finish();
                        });
                } else if (message.kind === "device") {
                    const uri = String(message.verificationUri);
                    if (
                        !/^https:\/\/(?:microsoft\.com|www\.microsoft\.com|login\.microsoftonline\.com|microsoft\.com\/link)(?:\/|$)/i.test(
                            uri,
                        )
                    ) {
                        finish();
                        return;
                    }
                    this.#prompt({
                        accountRef: reference,
                        userCode: String(message.userCode),
                        verificationUri: uri,
                        expiresIn: Number(message.expiresIn),
                    });
                } else if (message.kind === "session") {
                    void writes.then(() => finish(message.session as JavaAccountSession));
                } else if (message.kind === "failed") finish();
            });
            child.once("error", () => finish());
            child.once("exit", () => {
                if (!settled) finish();
            });
            child.send({
                kind: "start",
                reference,
                clientId: account.clientId,
                caches: account.caches,
            });
        });
    }
    cancelAuthentication(reference: string): void {
        this.#cancel.get(reference)?.();
    }
    async mineflayerAccount(reference: string): Promise<ProtectedAccount> {
        await this.authorize(reference);
        return {
            username: reference,
            auth: "microsoft",
            authenticate: async (client, options) => {
                const session = await this.authenticate(reference);
                client.session = {
                    accessToken: session.accessToken,
                    selectedProfile: session.profile,
                    availableProfile: [session.profile],
                };
                client.username = session.profile.name;
                options.accessToken = session.accessToken;
                options.haveCredentials = true;
                if (session.certificates) {
                    const certificates = session.certificates as {
                        profileKeys?: { privateDER?: Buffer; publicDER?: Buffer };
                    };
                    const keys = certificates.profileKeys;
                    if (keys?.privateDER && keys.publicDER)
                        Object.assign(client, {
                            ...session.certificates,
                            profileKeys: {
                                ...keys,
                                private: createPrivateKey({
                                    key: keys.privateDER,
                                    format: "der",
                                    type: "pkcs8",
                                }),
                                public: createPublicKey({
                                    key: keys.publicDER,
                                    format: "der",
                                    type: "spki",
                                }),
                            },
                        });
                }
                options.connect(client);
            },
        };
    }
}
