import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AccountBook } from "./accounts.js";
import { decodeCbor, verifyAssertion, verifyRegistration } from "./passkey.js";
import { base32Decode, base32Encode, otpauthUri, totpAt, verifyTotp } from "./totp.js";

/* A tiny CBOR encoder, only for building test fixtures. */
function cbor(v: unknown): Buffer {
    const head = (major: number, n: number): Buffer => {
        if (n < 24) return Buffer.from([(major << 5) | n]);
        if (n < 256) return Buffer.from([(major << 5) | 24, n]);
        const b = Buffer.alloc(3);
        b[0] = (major << 5) | 25;
        b.writeUInt16BE(n, 1);
        return b;
    };
    if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
    if (typeof v === "string")
        return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
    if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
    if (v instanceof Map)
        return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
    throw new Error("unsupported");
}

const RP = "mc.example.test";
const ORIGIN = `https://${RP}`;
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("authenticator codes", () => {
    it("matches the RFC 6238 SHA-1 test vectors and round-trips base32", () => {
        expect(SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        expect(Buffer.from(base32Decode(SECRET)).toString()).toBe("12345678901234567890");
        expect(totpAt(SECRET, 1)).toBe("287082");
        expect(totpAt(SECRET, Math.floor(1111111109 / 30))).toBe("081804");
        expect(otpauthUri(SECRET, "Steve", "Heapandyville")).toContain(
            "secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        );
    });

    it("accepts one step of drift and never the same step twice", () => {
        const now = 1_700_000_000_000;
        const step = Math.floor(now / 30_000);
        expect(verifyTotp(SECRET, totpAt(SECRET, step - 1), now, null)).toBe(step - 1);
        expect(verifyTotp(SECRET, totpAt(SECRET, step - 2), now, null)).toBeNull();
        expect(verifyTotp(SECRET, totpAt(SECRET, step), now, step)).toBeNull();
        expect(verifyTotp(SECRET, "12a456", now, null)).toBeNull();
    });
});

function authData(
    flags: number,
    count: number,
    attested?: { id: Buffer; key: Map<number, unknown> },
): Buffer {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(count);
    const parts: Uint8Array[] = [createHash("sha256").update(RP).digest(), Buffer.from([flags]), c];
    if (attested) {
        const len = Buffer.alloc(2);
        len.writeUInt16BE(attested.id.length);
        parts.push(Buffer.alloc(16), len, attested.id, cbor(attested.key));
    }
    return Buffer.concat(parts);
}
const client = (type: string, challenge: string, origin = ORIGIN) =>
    Buffer.from(JSON.stringify({ type, challenge, origin })).toString("base64url");

describe("passkeys", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const cose = new Map<number, unknown>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, "base64url")],
        [-3, Buffer.from(jwk.y, "base64url")],
    ]);
    const credId = Buffer.from("credential-1");
    const registration = (challenge: string, origin = ORIGIN) => ({
        clientDataJSON: client("webauthn.create", challenge, origin),
        attestationObject: cbor(
            new Map<string, unknown>([
                ["fmt", "none"],
                ["attStmt", new Map()],
                ["authData", authData(0x45, 0, { id: credId, key: cose })],
            ]),
        ).toString("base64url"),
        name: "Laptop",
        now: new Date(0),
    });

    it("decodes CBOR maps, byte strings and negatives", () => {
        const back = decodeCbor(
            cbor(
                new Map<number, unknown>([
                    [-2, Buffer.from([1, 2])],
                    [3, -7],
                ]),
            ),
        ).value as Map<number, unknown>;
        expect(back.get(3)).toBe(-7);
        expect(Array.from(back.get(-2) as Uint8Array)).toEqual([1, 2]);
    });

    it("registers, signs in, and refuses replays, wrong sites and bad signatures", () => {
        const stored = verifyRegistration(registration("c1"), {
            challenge: "c1",
            origin: ORIGIN,
            rpId: RP,
        });
        expect(stored).toMatchObject({ id: credId.toString("base64url"), alg: -7, name: "Laptop" });
        expect(() =>
            verifyRegistration(registration("c1", "https://evil.test"), {
                challenge: "c1",
                origin: ORIGIN,
                rpId: RP,
            }),
        ).toThrow(/different site/);
        expect(() =>
            verifyRegistration(registration("old"), { challenge: "c1", origin: ORIGIN, rpId: RP }),
        ).toThrow(/challenge/);

        const assertion = (challenge: string, count: number) => {
            const ad = authData(0x05, count);
            const cd = client("webauthn.get", challenge);
            const signature = sign(
                "sha256",
                Buffer.concat([
                    ad,
                    createHash("sha256").update(Buffer.from(cd, "base64url")).digest(),
                ]),
                privateKey,
            );
            return {
                credentialId: stored.id,
                clientDataJSON: cd,
                authenticatorData: ad.toString("base64url"),
                signature: signature.toString("base64url"),
            };
        };
        verifyAssertion(assertion("c2", 5), stored, {
            challenge: "c2",
            origin: ORIGIN,
            rpId: RP,
            requireUserVerification: true,
        });
        expect(stored.signCount).toBe(5);
        expect(() =>
            verifyAssertion(assertion("c3", 5), stored, {
                challenge: "c3",
                origin: ORIGIN,
                rpId: RP,
            }),
        ).toThrow(/counter/);
        const tampered = {
            ...assertion("c4", 9),
            signature: Buffer.alloc(70, 1).toString("base64url"),
        };
        expect(() =>
            verifyAssertion(tampered, stored, { challenge: "c4", origin: ORIGIN, rpId: RP }),
        ).toThrow();
    });
});

describe("management site accounts", () => {
    const now = new Date(1_700_000_000_000);
    const step = Math.floor(now.getTime() / 30_000);

    it("makes the first person the owner and then closes open registration", () => {
        const book = new AccountBook();
        expect(book.openForOwner).toBe(true);
        const owner = book.registerOwner({
            name: "SpongeBob",
            password: "krabby patty 42",
            totp: null,
            passkey: null,
            policy: ["password"],
            now,
        });
        expect(owner.role).toBe("owner");
        expect(book.openForOwner).toBe(false);
        expect(() =>
            book.registerOwner({
                name: "Plankton",
                password: "chum bucket 42",
                totp: null,
                passkey: null,
                policy: ["password"],
                now,
            }),
        ).toThrow(/already has an owner/);
        expect(book.signIn("spongebob", { password: "krabby patty 42" }, now)?.id).toBe(owner.id);
        expect(book.signIn("SpongeBob", { password: "wrong password!" }, now)).toBeNull();
    });

    it("needs every factor the owner chose, and the owner must set them all up first", () => {
        const book = new AccountBook();
        expect(() =>
            book.registerOwner({
                name: "Sandy",
                password: "texas karate 1",
                totp: null,
                passkey: null,
                policy: ["password", "totp"],
                now,
            }),
        ).toThrow(/totp/);
        book.registerOwner({
            name: "Sandy",
            password: "texas karate 1",
            totp: { secret: SECRET, code: totpAt(SECRET, step) },
            passkey: null,
            policy: ["password", "totp"],
            now,
        });
        const later = new Date(now.getTime() + 30_000);
        expect(book.signIn("Sandy", { password: "texas karate 1" }, later)).toBeNull();
        expect(
            book.signIn(
                "Sandy",
                { password: "texas karate 1", totpCode: totpAt(SECRET, step + 1) },
                later,
            ),
        ).not.toBeNull();
        expect(
            book.signIn(
                "Sandy",
                { password: "texas karate 1", totpCode: totpAt(SECRET, step + 1) },
                later,
            ),
        ).toBeNull();
    });

    it("invites by single-use code and refuses a policy that would lock someone out", () => {
        const book = new AccountBook();
        const owner = book.registerOwner({
            name: "Mr Krabs",
            password: "money money 1",
            totp: null,
            passkey: null,
            policy: ["password"],
            now,
        });
        const code = book.invite(owner, "operator", now);
        const squid = book.acceptInvitation(code, {
            name: "Squidward",
            password: "clarinet solo 1",
            totp: null,
            passkey: null,
            now,
        });
        expect(squid.role).toBe("operator");
        expect(() =>
            book.acceptInvitation(code, {
                name: "Patrick",
                password: "under a rock 1",
                totp: null,
                passkey: null,
                now,
            }),
        ).toThrow(/not valid/);
        expect(() => book.setPolicy(owner, ["password", "passkey"])).toThrow(/locked out/);
        expect(() => book.setPolicy(squid, ["password"])).toThrow(/Only the owner/);
        const restored = new AccountBook(book.snapshot());
        expect(restored.list().map((a) => a.name)).toEqual(["Mr Krabs", "Squidward"]);
        expect(JSON.stringify(book.snapshot())).not.toContain("money money 1");
    });
});
