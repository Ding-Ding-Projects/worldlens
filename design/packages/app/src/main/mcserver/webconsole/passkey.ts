/**
 * Passkeys (WebAuthn) for the server management site, verified with node:crypto alone.
 *
 * Registration accepts the `none` attestation format, which is what browsers send unless a
 * site asks for more: the site learns the credential's public key, not who made the device.
 * Keys are ES256 (P-256, COSE -7) or Ed25519 (COSE -8), the two every platform authenticator
 * offers. Both ceremonies check the type, the one-time challenge, the origin, the relying party
 * id hash and the user-present flag; sign-in also checks the signature and that the signature
 * counter moved forward (a counter that goes backwards suggests a cloned key).
 */
import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";

/* ----------------------------------- CBOR ---------------------------------- */

type Cbor =
    number | bigint | string | Uint8Array | boolean | null | undefined | Cbor[] | Map<Cbor, Cbor>;

/** A minimal CBOR decoder: enough for attestation objects and COSE keys. */
export function decodeCbor(bytes: Uint8Array): { value: Cbor; end: number } {
    let at = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const need = (n: number): void => {
        if (at + n > bytes.length) throw new Error("CBOR ended early.");
    };
    const length = (info: number): number => {
        if (info < 24) return info;
        if (info === 24) return (need(1), bytes[at++]!);
        if (info === 25) return (need(2), (at += 2), view.getUint16(at - 2));
        if (info === 26) return (need(4), (at += 4), view.getUint32(at - 4));
        if (info === 27) {
            need(8);
            const big = view.getBigUint64(at);
            at += 8;
            if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR length too large.");
            return Number(big);
        }
        throw new Error("Indefinite CBOR lengths are not supported.");
    };
    const item = (depth: number): Cbor => {
        if (depth > 16) throw new Error("CBOR nested too deeply.");
        need(1);
        const head = bytes[at++]!;
        const major = head >> 5;
        const info = head & 31;
        switch (major) {
            case 0:
                return length(info);
            case 1:
                return -1 - length(info);
            case 2: {
                const n = length(info);
                need(n);
                at += n;
                return bytes.slice(at - n, at);
            }
            case 3: {
                const n = length(info);
                need(n);
                at += n;
                return new TextDecoder().decode(bytes.subarray(at - n, at));
            }
            case 4: {
                const n = length(info);
                const out: Cbor[] = [];
                for (let i = 0; i < n; i++) out.push(item(depth + 1));
                return out;
            }
            case 5: {
                const n = length(info);
                const out = new Map<Cbor, Cbor>();
                for (let i = 0; i < n; i++) out.set(item(depth + 1), item(depth + 1));
                return out;
            }
            case 7:
                if (info === 20) return false;
                if (info === 21) return true;
                if (info === 22) return null;
                if (info === 23) return undefined;
                throw new Error("Unsupported CBOR simple value.");
            default:
                throw new Error("Unsupported CBOR type.");
        }
    };
    const value = item(0);
    return { value, end: at };
}

/* --------------------------------- Pieces ---------------------------------- */

const b64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
const fromB64url = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, "base64url"));
const sha256 = (bytes: Uint8Array | string): Buffer => createHash("sha256").update(bytes).digest();

export const newChallenge = (): string => b64url(randomBytes(32));

export interface AuthData {
    readonly rpIdHash: Uint8Array;
    readonly userPresent: boolean;
    readonly userVerified: boolean;
    readonly signCount: number;
    readonly credentialId?: Uint8Array;
    readonly publicKey?: Map<Cbor, Cbor>;
}

export function parseAuthData(bytes: Uint8Array): AuthData {
    if (bytes.length < 37) throw new Error("Authenticator data is too short.");
    const flags = bytes[32]!;
    const signCount = new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0);
    const base = {
        rpIdHash: bytes.slice(0, 32),
        userPresent: (flags & 0x01) !== 0,
        userVerified: (flags & 0x04) !== 0,
        signCount,
    };
    if ((flags & 0x40) === 0) return base;
    if (bytes.length < 55) throw new Error("Attested credential data is too short.");
    const idLength = new DataView(bytes.buffer, bytes.byteOffset + 53, 2).getUint16(0);
    const credentialId = bytes.slice(55, 55 + idLength);
    const key = decodeCbor(bytes.subarray(55 + idLength)).value;
    if (!(key instanceof Map)) throw new Error("The credential public key is not a COSE key.");
    return { ...base, credentialId, publicKey: key };
}

/** A COSE key as a node:crypto public key, plus its algorithm. */
export function coseToKey(cose: Map<Cbor, Cbor>): { key: KeyObject; alg: -7 | -8 } {
    const kty = cose.get(1);
    const alg = cose.get(3);
    if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
        const x = cose.get(-2);
        const y = cose.get(-3);
        if (
            !(x instanceof Uint8Array) ||
            !(y instanceof Uint8Array) ||
            x.length !== 32 ||
            y.length !== 32
        )
            throw new Error("Bad P-256 key.");
        return {
            key: createPublicKey({
                key: { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y) },
                format: "jwk",
            }),
            alg: -7,
        };
    }
    if (kty === 1 && alg === -8 && cose.get(-1) === 6) {
        const x = cose.get(-2);
        if (!(x instanceof Uint8Array) || x.length !== 32) throw new Error("Bad Ed25519 key.");
        return {
            key: createPublicKey({
                key: { kty: "OKP", crv: "Ed25519", x: b64url(x) },
                format: "jwk",
            }),
            alg: -8,
        };
    }
    throw new Error("Only ES256 and Ed25519 passkeys are supported.");
}

export interface StoredPasskey {
    readonly id: string;
    /** The public key as SPKI DER, base64url. */
    readonly publicKey: string;
    readonly alg: -7 | -8;
    signCount: number;
    readonly name: string;
    readonly addedAt: string;
}

export interface Expectation {
    readonly challenge: string;
    readonly origin: string;
    readonly rpId: string;
    readonly requireUserVerification?: boolean;
}

function checkClient(clientDataJSON: Uint8Array, type: string, expect: Expectation): void {
    let client: { type?: unknown; challenge?: unknown; origin?: unknown };
    try {
        client = JSON.parse(new TextDecoder().decode(clientDataJSON)) as typeof client;
    } catch {
        throw new Error("The browser's client data is not JSON.");
    }
    if (client.type !== type) throw new Error("Wrong passkey ceremony.");
    if (client.challenge !== expect.challenge)
        throw new Error("The challenge does not match; start again.");
    if (client.origin !== expect.origin)
        throw new Error("The passkey was used on a different site.");
}

function checkAuth(data: AuthData, expect: Expectation): void {
    if (!sha256(expect.rpId).equals(Buffer.from(data.rpIdHash)))
        throw new Error("The passkey belongs to a different site.");
    if (!data.userPresent) throw new Error("The passkey did not confirm someone was present.");
    if (expect.requireUserVerification === true && !data.userVerified)
        throw new Error("The passkey did not verify the person (PIN, fingerprint or face).");
}

/** Registration: returns the passkey to store, or throws with the reason. */
export function verifyRegistration(
    input: { clientDataJSON: string; attestationObject: string; name: string; now: Date },
    expect: Expectation,
): StoredPasskey {
    const clientData = fromB64url(input.clientDataJSON);
    checkClient(clientData, "webauthn.create", expect);
    const attestation = decodeCbor(fromB64url(input.attestationObject)).value;
    if (!(attestation instanceof Map)) throw new Error("The attestation is not a CBOR map.");
    if (attestation.get("fmt") !== "none")
        throw new Error("Only passkeys without device attestation are accepted.");
    const authBytes = attestation.get("authData");
    if (!(authBytes instanceof Uint8Array))
        throw new Error("The attestation has no authenticator data.");
    const data = parseAuthData(authBytes);
    checkAuth(data, expect);
    if (data.credentialId === undefined || data.publicKey === undefined)
        throw new Error("The passkey sent no credential.");
    const { key, alg } = coseToKey(data.publicKey);
    return {
        id: b64url(data.credentialId),
        publicKey: b64url(key.export({ format: "der", type: "spki" })),
        alg,
        signCount: data.signCount,
        name: input.name.slice(0, 64) || "Passkey",
        addedAt: input.now.toISOString(),
    };
}

/** Sign-in: verifies and moves the stored counter forward, or throws with the reason. */
export function verifyAssertion(
    input: {
        credentialId: string;
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
    },
    stored: StoredPasskey,
    expect: Expectation,
): void {
    if (input.credentialId !== stored.id)
        throw new Error("That passkey is not registered for this account.");
    const clientData = fromB64url(input.clientDataJSON);
    checkClient(clientData, "webauthn.get", expect);
    const authBytes = fromB64url(input.authenticatorData);
    const data = parseAuthData(authBytes);
    checkAuth(data, expect);
    const key = createPublicKey({
        key: Buffer.from(stored.publicKey, "base64url"),
        format: "der",
        type: "spki",
    });
    const signed = Buffer.concat([authBytes, sha256(clientData)]);
    const ok =
        stored.alg === -7
            ? verify("sha256", signed, key, Buffer.from(fromB64url(input.signature)))
            : verify(null, signed, key, Buffer.from(fromB64url(input.signature)));
    if (!ok) throw new Error("The passkey signature is not valid.");
    if ((data.signCount !== 0 || stored.signCount !== 0) && data.signCount <= stored.signCount)
        throw new Error("The passkey's counter went backwards; it may have been copied.");
    stored.signCount = data.signCount;
}
