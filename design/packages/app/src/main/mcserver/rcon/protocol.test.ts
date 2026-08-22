import { describe, expect, it } from "vitest";

import {
    RCON_AUTH_FAILED_ID,
    RCON_MAX_BODY_BYTES,
    RCON_TYPE_AUTH,
    RCON_TYPE_COMMAND,
    RCON_TYPE_RESPONSE_VALUE,
    decodeAll,
    decodePacket,
    encodePacket,
} from "./protocol.js";

function concat(...parts: readonly Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    return out;
}

describe("rcon protocol: encode/decode round trip", () => {
    it("round-trips an AUTH packet", () => {
        const encoded = encodePacket({ requestId: 1, type: RCON_TYPE_AUTH, body: "hunter2" });
        const decoded = decodePacket(encoded);
        expect(decoded.status).toBe("ok");
        if (decoded.status !== "ok") throw new Error("unreachable");
        expect(decoded.packet).toEqual({ requestId: 1, type: RCON_TYPE_AUTH, body: "hunter2" });
        expect(decoded.consumed).toBe(encoded.byteLength);
    });

    it("round-trips a COMMAND packet with an empty body", () => {
        const encoded = encodePacket({ requestId: 7, type: RCON_TYPE_COMMAND, body: "" });
        const decoded = decodePacket(encoded);
        expect(decoded.status).toBe("ok");
        if (decoded.status !== "ok") throw new Error("unreachable");
        expect(decoded.packet.body).toBe("");
    });

    it("encodes the length field as everything after the length field itself", () => {
        const encoded = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body: "list" });
        const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
        const declared = view.getInt32(0, true);
        // 4 (requestId) + 4 (type) + 4 (body "list") + 1 (null) + 1 (pad) = 14
        expect(declared).toBe(14);
        expect(encoded.byteLength).toBe(4 + declared);
    });

    it("replaces non-ASCII-printable characters with '?' rather than corrupting the frame", () => {
        const encoded = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body: "say héllo\n" });
        const decoded = decodePacket(encoded);
        expect(decoded.status).toBe("ok");
        if (decoded.status !== "ok") throw new Error("unreachable");
        expect(decoded.packet.body).toBe("say h?llo?");
    });
});

describe("rcon protocol: the auth failure signal", () => {
    it("THE critical case: a failed auth is type=AUTH_RESPONSE with requestId -1, not an error packet", () => {
        // This is exactly what a real server sends back for a wrong password: an ordinary
        // packet of type 2 (the same type as a successful auth response) whose requestId
        // is -1. Nothing about the packet's shape says "failure" except that one field.
        const encoded = encodePacket({
            requestId: RCON_AUTH_FAILED_ID,
            type: RCON_TYPE_RESPONSE_VALUE,
            body: "",
        });
        const decoded = decodePacket(encoded);
        expect(decoded.status).toBe("ok");
        if (decoded.status !== "ok") throw new Error("unreachable");
        expect(decoded.packet.requestId).toBe(-1);
        // A caller that only looked at `type` here would see a perfectly ordinary reply.
        expect(decoded.packet.type).toBe(RCON_TYPE_RESPONSE_VALUE);
    });

    it("a successful auth echoes the request's own requestId back, never -1", () => {
        const encoded = encodePacket({ requestId: 42, type: RCON_TYPE_RESPONSE_VALUE, body: "" });
        const decoded = decodePacket(encoded);
        if (decoded.status !== "ok") throw new Error("unreachable");
        expect(decoded.packet.requestId).not.toBe(RCON_AUTH_FAILED_ID);
        expect(decoded.packet.requestId).toBe(42);
    });
});

describe("rcon protocol: partial and split reads", () => {
    it("reports incomplete when fewer than 4 bytes have arrived", () => {
        expect(decodePacket(new Uint8Array([1, 2, 3]))).toEqual({ status: "incomplete" });
    });

    it("reports incomplete when the length prefix arrived but the body has not", () => {
        const full = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body: "list" });
        const half = full.subarray(0, 6);
        expect(decodePacket(half)).toEqual({ status: "incomplete" });
    });

    it("decodeAll assembles one packet delivered across many small chunks", () => {
        const full = encodePacket({ requestId: 3, type: RCON_TYPE_COMMAND, body: "say hi" });
        // Simulate a socket that handed us the bytes one at a time.
        let buffered: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        let lastResult: ReturnType<typeof decodeAll> = { packets: [], rest: buffered, oversized: false };
        for (let index = 0; index < full.byteLength; index += 1) {
            buffered = concat(buffered, full.subarray(index, index + 1));
            lastResult = decodeAll(buffered);
            buffered = lastResult.rest;
        }
        expect(lastResult.packets).toHaveLength(1);
        expect(lastResult.packets[0]?.body).toBe("say hi");
        expect(lastResult.rest.byteLength).toBe(0);
    });

    it("decodeAll returns every packet in one read and the leftover bytes of a partial one", () => {
        const first = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body: "one" });
        const second = encodePacket({ requestId: 2, type: RCON_TYPE_COMMAND, body: "two" });
        const thirdFull = encodePacket({ requestId: 3, type: RCON_TYPE_COMMAND, body: "three" });
        const thirdPartial = thirdFull.subarray(0, thirdFull.byteLength - 3);

        const combined = concat(first, second, thirdPartial);
        const result = decodeAll(combined);

        expect(result.packets.map((packet) => packet.body)).toEqual(["one", "two"]);
        expect(result.oversized).toBe(false);
        expect(result.rest.byteLength).toBe(thirdPartial.byteLength);
    });

    it("decodeAll reassembles a multi-packet console reply (the long-response case)", () => {
        // A real server splits a long `list` or `help` reply across several
        // RESPONSE_VALUE packets sharing one requestId. The client's job (client.ts) is
        // to concatenate their bodies; this module's job is just to hand every packet
        // back in order.
        const part1 = encodePacket({ requestId: 9, type: RCON_TYPE_RESPONSE_VALUE, body: "Players: alice, " });
        const part2 = encodePacket({ requestId: 9, type: RCON_TYPE_RESPONSE_VALUE, body: "bob, carol" });
        const combined = concat(part1, part2);

        const result = decodeAll(combined);
        expect(result.packets).toHaveLength(2);
        expect(result.packets.every((packet) => packet.requestId === 9)).toBe(true);
        expect(result.packets.map((packet) => packet.body).join("")).toBe("Players: alice, bob, carol");
    });
});

describe("rcon protocol: oversized and hostile input", () => {
    it("rejects a declared length beyond the protocol's own ceiling", () => {
        const frame = new Uint8Array(4);
        new DataView(frame.buffer).setInt32(0, RCON_MAX_BODY_BYTES + 1, true);
        const decoded = decodePacket(frame);
        expect(decoded).toEqual({ status: "too-large", declaredLength: RCON_MAX_BODY_BYTES + 1 });
    });

    it("rejects a negative/garbage declared length rather than allocating from it", () => {
        const frame = new Uint8Array(4);
        new DataView(frame.buffer).setInt32(0, -1, true);
        const decoded = decodePacket(frame);
        expect(decoded.status).toBe("too-large");
    });

    it("decodeAll surfaces oversized:true and stops, without throwing", () => {
        const good = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body: "ok" });
        const badHeader = new Uint8Array(4);
        new DataView(badHeader.buffer).setInt32(0, 999_999, true);
        const combined = concat(good, badHeader);

        const result = decodeAll(combined);
        expect(result.packets.map((packet) => packet.body)).toEqual(["ok"]);
        expect(result.oversized).toBe(true);
    });

    it("accepts a body sitting exactly at the protocol ceiling", () => {
        const body = "x".repeat(RCON_MAX_BODY_BYTES - 10);
        const encoded = encodePacket({ requestId: 1, type: RCON_TYPE_COMMAND, body });
        const decoded = decodePacket(encoded);
        expect(decoded.status).toBe("ok");
    });
});
