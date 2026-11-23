/**
 * Who may manage a server through its management site, and how they prove it.
 *
 * - The first person to register while there are no accounts becomes the **owner** with full
 *   administrator rights, and open registration closes in the same step. Everyone after that
 *   joins through a single-use invitation from an owner or admin.
 * - Sign-in can need a password, a passkey, an authenticator code, or any combination: the
 *   owner picks the site's policy, and an account can only be saved in a state that can still
 *   meet it, so nobody is locked out by a policy change.
 * - Passwords are stored as scrypt verifiers, authenticator secrets as base32, passkeys as
 *   public keys only.
 *
 * Pure state plus a snapshot for persistence; the HTTP layer and storage sit outside.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import type { StoredPasskey } from "./passkey.js";
import { verifyTotp } from "./totp.js";

export type Factor = "password" | "passkey" | "totp";
export const FACTORS: readonly Factor[] = ["password", "passkey", "totp"];
export type Role = "owner" | "admin" | "operator" | "viewer";

export interface Account {
    readonly id: string;
    name: string;
    role: Role;
    passwordVerifier: string | null;
    totpSecret: string | null;
    totpLastStep: number | null;
    passkeys: StoredPasskey[];
    readonly createdAt: string;
}

export interface AccountsSnapshot {
    readonly version: 1;
    readonly policy: readonly Factor[];
    readonly accounts: readonly Account[];
    /** SHA-256 of each unused invitation code, with its role and expiry. */
    readonly invitations: readonly {
        readonly hash: string;
        readonly role: Exclude<Role, "owner">;
        readonly expires: string;
    }[];
}

export function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
    const N = 16384;
    return `scrypt$${N}$8$1$${salt.toString("hex")}$${scryptSync(password, salt, 32, { N, r: 8, p: 1 }).toString("hex")}`;
}

export function checkPassword(password: string, verifier: string): boolean {
    const [scheme, n, r, p, salt, hash] = verifier.split("$");
    if (scheme !== "scrypt" || salt === undefined || hash === undefined) return false;
    const actual = scryptSync(password, Buffer.from(salt, "hex"), 32, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
    });
    const expected = Buffer.from(hash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const has = (a: Account, f: Factor): boolean =>
    f === "password"
        ? a.passwordVerifier !== null
        : f === "totp"
          ? a.totpSecret !== null
          : a.passkeys.length > 0;

export class AccountBook {
    private policy: Factor[];
    private readonly accounts: Account[];
    private invitations: { hash: string; role: Exclude<Role, "owner">; expires: string }[];

    constructor(snapshot?: AccountsSnapshot) {
        this.policy = snapshot ? [...snapshot.policy] : ["password"];
        this.accounts = snapshot
            ? snapshot.accounts.map((a) => ({ ...a, passkeys: a.passkeys.map((k) => ({ ...k })) }))
            : [];
        this.invitations = snapshot ? snapshot.invitations.map((i) => ({ ...i })) : [];
    }

    snapshot(): AccountsSnapshot {
        return {
            version: 1,
            policy: [...this.policy],
            accounts: this.accounts.map((a) => ({
                ...a,
                passkeys: a.passkeys.map((k) => ({ ...k })),
            })),
            invitations: this.invitations.map((i) => ({ ...i })),
        };
    }

    /** True until the first account exists: the sign-in page then offers "Set up as owner". */
    get openForOwner(): boolean {
        return this.accounts.length === 0;
    }

    get signInPolicy(): readonly Factor[] {
        return this.policy;
    }

    list(): readonly Account[] {
        return this.accounts;
    }

    find(name: string): Account | undefined {
        const key = name.trim().toLowerCase();
        return this.accounts.find((a) => a.name.toLowerCase() === key);
    }

    /** What an account still needs before it can sign in under the current policy. */
    missingFactors(account: Account): Factor[] {
        return this.policy.filter((f) => !has(account, f));
    }

    /**
     * Registers the first account as owner. The chosen policy must be met by what this first
     * person sets up now, so the site never starts in a state nobody can sign in to.
     */
    registerOwner(input: {
        name: string;
        password: string | null;
        totp: { secret: string; code: string } | null;
        passkey: StoredPasskey | null;
        policy: readonly Factor[];
        now: Date;
    }): Account {
        if (!this.openForOwner)
            throw new Error("This site already has an owner. Ask them for an invitation.");
        const policy = [...new Set(input.policy)].filter((f) => FACTORS.includes(f));
        if (policy.length === 0) throw new Error("Choose at least one way to sign in.");
        const account = this.newAccount(input.name, "owner", input.now);
        this.applyFactors(account, input);
        const missing = policy.filter((f) => !has(account, f));
        if (missing.length > 0)
            throw new Error(`Set up ${missing.join(" and ")} too: the sign-in you chose needs it.`);
        this.policy = policy;
        this.accounts.push(account);
        return account;
    }

    invite(by: Account, role: Exclude<Role, "owner">, now: Date, hours = 48): string {
        if (by.role !== "owner" && by.role !== "admin")
            throw new Error("Only an owner or admin can invite people.");
        if (role === "admin" && by.role !== "owner")
            throw new Error("Only the owner can invite another admin.");
        const code = randomBytes(18).toString("base64url");
        this.invitations.push({
            hash: createHash("sha256").update(code).digest("hex"),
            role,
            expires: new Date(now.getTime() + hours * 3600_000).toISOString(),
        });
        return code;
    }

    acceptInvitation(
        code: string,
        input: {
            name: string;
            password: string | null;
            totp: { secret: string; code: string } | null;
            passkey: StoredPasskey | null;
            now: Date;
        },
    ): Account {
        const hash = createHash("sha256").update(code).digest("hex");
        const index = this.invitations.findIndex(
            (i) => i.hash === hash && i.expires > input.now.toISOString(),
        );
        if (index < 0) throw new Error("This invitation is not valid or has expired.");
        const account = this.newAccount(input.name, this.invitations[index]!.role, input.now);
        this.applyFactors(account, input);
        const missing = this.missingFactors(account);
        if (missing.length > 0)
            throw new Error(`Set up ${missing.join(" and ")} too: this site's sign-in needs it.`);
        this.invitations.splice(index, 1);
        this.accounts.push(account);
        return account;
    }

    /** The owner changes the policy; refused when any account could no longer sign in. */
    setPolicy(by: Account, policy: readonly Factor[]): void {
        if (by.role !== "owner") throw new Error("Only the owner can change how people sign in.");
        const next = [...new Set(policy)].filter((f) => FACTORS.includes(f));
        if (next.length === 0) throw new Error("Choose at least one way to sign in.");
        const stuck = this.accounts.filter((a) => next.some((f) => !has(a, f)));
        if (stuck.length > 0)
            throw new Error(
                `${stuck.map((a) => a.name).join(", ")} would be locked out. Ask them to set it up first.`,
            );
        this.policy = next;
    }

    /** Checks the proofs given; true only when every factor in the policy is proven. */
    signIn(
        name: string,
        proof: { password?: string; totpCode?: string; passkeyVerified?: string },
        now: Date,
    ): Account | null {
        const account = this.find(name);
        if (account === undefined) {
            hashPassword(proof.password ?? "-"); // same work for an unknown name
            return null;
        }
        for (const f of this.policy) {
            if (
                f === "password" &&
                !(
                    account.passwordVerifier !== null &&
                    proof.password !== undefined &&
                    checkPassword(proof.password, account.passwordVerifier)
                )
            )
                return null;
            if (
                f === "passkey" &&
                !(
                    proof.passkeyVerified !== undefined &&
                    account.passkeys.some((k) => k.id === proof.passkeyVerified)
                )
            )
                return null;
            if (f === "totp") {
                if (account.totpSecret === null || proof.totpCode === undefined) return null;
                const step = verifyTotp(
                    account.totpSecret,
                    proof.totpCode,
                    now.getTime(),
                    account.totpLastStep,
                );
                if (step === null) return null;
                account.totpLastStep = step;
            }
        }
        return account;
    }

    remove(by: Account, id: string): void {
        if (by.role !== "owner" && by.role !== "admin")
            throw new Error("Only an owner or admin can remove people.");
        const target = this.accounts.find((a) => a.id === id);
        if (target === undefined) throw new Error("No such account.");
        if (target.role === "owner") throw new Error("The owner cannot be removed.");
        if (target.role === "admin" && by.role !== "owner")
            throw new Error("Only the owner can remove an admin.");
        this.accounts.splice(this.accounts.indexOf(target), 1);
    }

    private newAccount(name: string, role: Role, now: Date): Account {
        const clean = name.trim();
        if (!/^[\p{L}\p{N} _.-]{1,32}$/u.test(clean))
            throw new Error(
                "Names are 1 to 32 letters, numbers, spaces, dots, dashes or underscores.",
            );
        if (this.find(clean) !== undefined) throw new Error("That name is taken.");
        return {
            id: randomBytes(9).toString("base64url"),
            name: clean,
            role,
            passwordVerifier: null,
            totpSecret: null,
            totpLastStep: null,
            passkeys: [],
            createdAt: now.toISOString(),
        };
    }

    private applyFactors(
        account: Account,
        input: {
            password: string | null;
            totp: { secret: string; code: string } | null;
            passkey: StoredPasskey | null;
            now: Date;
        },
    ): void {
        if (input.password !== null) {
            if (input.password.length < 10)
                throw new Error("Passwords need at least 10 characters.");
            account.passwordVerifier = hashPassword(input.password);
        }
        if (input.totp !== null) {
            const step = verifyTotp(input.totp.secret, input.totp.code, input.now.getTime(), null);
            if (step === null)
                throw new Error(
                    "That authenticator code is not right; check the time on both devices.",
                );
            account.totpSecret = input.totp.secret;
            account.totpLastStep = step;
        }
        if (input.passkey !== null) account.passkeys.push({ ...input.passkey });
    }
}
