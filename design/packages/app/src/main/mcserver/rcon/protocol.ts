/**
 * The Source RCON wire format, and nothing else.
 *
 * Pure encode/decode over `Uint8Array`. No socket, no timers, no state - `client.ts` owns
 * all of that. Keeping this file pure is what lets every edge of the format (a packet cut
 * in half by the network, one oversized beyond the protocol's own ceiling, a reply that
 * arrives as more than one packet) be tested without a real server anywhere in sight.
 *
 * Wire shape, all little-endian:
 *
 *   int32  length      (byte count of everything AFTER this field)
 *   int32  requestId
 *   int32  type         (3 = SERVERDATA_AUTH, 2 = SERVERDATA_EXECCOMMAND / AUTH_RESPONSE, 0 = SERVERDATA_RESPONSE_VALUE)
 *   ...body, null-terminated ASCII...
 *   \0     one trailing pad byte
 *
 * `length` therefore covers requestId + type + body + its own null + the trailing pad,
 * i.e. `10 + body.byteLength`.
 *
 * THE ONE DETAIL THAT MATTERS MOST: a failed SERVERDATA_AUTH does not come back as an
 * error packet. It comes back as an ordinary SERVERDATA_AUTH_RESPONSE (type 2) whose
 * `requestId` is -1. That -1 is the *entire* signal that the password was wrong. A
 * client that only checks the packet's `type` and ignores `requestId` will treat a
 * rejected password as a successful login - which is the bug this module exists to make
 * impossible to write by accident. `client.ts` must check `requestId === -1` before it
 * checks anything else about an auth reply.
 */

export const RCON_TYPE_AUTH = 3;
export const RCON_TYPE_COMMAND = 2;
/** Also the type of a successful (or failed) auth response - the protocol reuses it. */
export const RCON_TYPE_RESPONSE_VALUE = 0;

/** The request id an auth failure always answers with. Not a sentinel we invented. */
export const RCON_AUTH_FAILED_ID = -1;

/**
 * The protocol's own hard ceiling on a packet body. Real servers reply in far fewer
 * bytes; a body claiming to be bigger than this is either a corrupt stream or something
 * that is not actually speaking RCON, and either way it must never be trusted enough to
 * allocate a buffer for.
 */
export const RCON_MAX_BODY_BYTES = 4096 + 12;

/** Header is requestId(4) + type(4); the encoded frame also carries length(4) up front. */
const HEADER_BYTES = 8;
const LENGTH_FIELD_BYTES = 4;
/** Body is followed by its own null terminator plus one trailing pad byte. */
const TRAILER_BYTES = 2;

export interface RconPacket {
    readonly requestId: number;
    readonly type: number;
    readonly body: string;
}

/** Encodes one packet as the exact bytes that go on the wire. */
export function encodePacket(packet: RconPacket): Uint8Array {
    const bodyBytes = asciiBytes(packet.body);
    const payloadLength = HEADER_BYTES + bodyBytes.byteLength + TRAILER_BYTES;
    const frame = new Uint8Array(LENGTH_FIELD_BYTES + payloadLength);
    const view = new DataView(frame.buffer);

    view.setInt32(0, payloadLength, true);
    view.setInt32(4, packet.requestId, true);
    view.setInt32(8, packet.type, true);
    frame.set(bodyBytes, 12);
    // Body null terminator + trailing pad byte are already zero from `new Uint8Array`.
    return frame;
}

/** Encodes a request body as ASCII, replacing anything outside the printable range with `?`. */
function asciiBytes(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        out[index] = code >= 0x20 && code <= 0x7e ? code : 0x3f;
    }
    return out;
}

export type DecodeResult =
    | { readonly status: "incomplete" }
    | { readonly status: "too-large"; readonly declaredLength: number }
    | { readonly status: "ok"; readonly packet: RconPacket; readonly consumed: number };

/**
 * Reads one packet off the front of `buffer`, if a whole one is there yet.
 *
 * Never throws and never assumes the caller has a whole packet: a socket delivers bytes
 * in whatever chunks the network felt like, so a length prefix that has arrived but whose
 * body has not is `incomplete`, not an error. The caller keeps `buffer` and appends the
 * next chunk before trying again.
 */
export function decodePacket(buffer: Uint8Array): DecodeResult {
    if (buffer.byteLength < LENGTH_FIELD_BYTES) return { status: "incomplete" };

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const declaredLength = view.getInt32(0, true);

    if (declaredLength < HEADER_BYTES + TRAILER_BYTES || declaredLength > RCON_MAX_BODY_BYTES) {
        return { status: "too-large", declaredLength };
    }

    const totalFrame = LENGTH_FIELD_BYTES + declaredLength;
    if (buffer.byteLength < totalFrame) return { status: "incomplete" };

    const requestId = view.getInt32(4, true);
    const type = view.getInt32(8, true);
    const bodyStart = 12;
    const bodyEnd = totalFrame - TRAILER_BYTES;
    const bodyBytes = buffer.subarray(bodyStart, bodyEnd);
    const body = decodeAscii(bodyBytes);

    return { status: "ok", packet: { requestId, type, body }, consumed: totalFrame };
}

function decodeAscii(bytes: Uint8Array): string {
    let out = "";
    for (let index = 0; index < bytes.byteLength; index += 1) {
        out += String.fromCharCode(bytes[index] as number);
    }
    return out;
}

/**
 * Splits every complete packet out of `buffer` (a single read can carry more than one -
 * a long console reply is often chunked by the server into several RESPONSE_VALUE
 * packets), returning the leftover bytes that were not yet a whole packet.
 */
export function decodeAll(buffer: Uint8Array): {
    readonly packets: readonly RconPacket[];
    readonly rest: Uint8Array;
    readonly oversized: boolean;
} {
    const packets: RconPacket[] = [];
    let cursor = buffer;
    while (true) {
        const result = decodePacket(cursor);
        if (result.status === "incomplete") {
            return { packets, rest: cursor, oversized: false };
        }
        if (result.status === "too-large") {
            return { packets, rest: cursor, oversized: true };
        }
        packets.push(result.packet);
        cursor = cursor.subarray(result.consumed);
    }
}
