/**
 * A real Minecraft server-list ping, spoken over a real socket.
 *
 * This exists because "Test connection" is otherwise a lie. A control that resolves a
 * hostname, or opens a TCP connection and closes it again, can show a green tick for a
 * host that is running a web server, for a Minecraft server that is still generating
 * spawn chunks and refusing logins, and for a proxy that accepts every connection it is
 * offered. None of those are the thing the user is about to point a world downloader at.
 * The only test that answers the question actually being asked is the one the vanilla
 * client's server list performs: complete the status handshake and read back what the
 * server says it is.
 *
 * The protocol is small enough that implementing it is cheaper than depending on somebody
 * else's implementation of it, and it has not changed since 1.7. Four packets, one
 * variable-length integer encoding, one length-prefixed string, one JSON blob.
 *
 * ## Everything is a value
 *
 * Nothing here rejects. A refused connection, an unresolvable hostname, a silent host and
 * a host that answers with something that is not this protocol are four different things
 * for a person to do about them, and the surface reporting the result needs to tell them
 * apart. A thrown `Error` with an `errno` buried in it does not let it.
 *
 * ## Why the socket is injected
 *
 * The seam is the whole reason this module is testable. A test that had to stand up a
 * listening TCP server to prove the framing is correct would be slow, would be flaky on a
 * shared runner that is short of ports, and would still not be able to replay the exact
 * malformed responses that the parsing has to survive. Handing in a socket lets a test
 * write the bytes itself, which is also the only honest way to prove the encoder and the
 * decoder agree.
 */

import { createConnection } from "node:net";

/** What a Minecraft server listens on unless it was told otherwise. */
export const DEFAULT_MINECRAFT_PORT = 25565;

/**
 * The protocol number the ping claims to be.
 *
 * 47 is 1.8. A status ping is answered regardless of whether the claimed version is one
 * the server would actually let in, so the number chosen only has to be one that no
 * server or proxy in front of one treats as a reason to hang up early, and 47 is the most
 * widely tolerated value there is.
 */
const DEFAULT_PROTOCOL_VERSION = 47;

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * The largest packet body this will assemble before giving up on the connection.
 *
 * A status response is a few kilobytes even with a base64 server icon in it. Trusting a
 * declared length without a ceiling means a host that answers with a five-byte varint
 * claiming two gigabytes gets this process to allocate towards two gigabytes on its
 * behalf, which is a denial of service handed over for free by a "test connection"
 * button.
 */
const MAX_PACKET_BYTES = 2 * 1024 * 1024;

/**
 * How long to wait for the pong after the status response has already arrived.
 *
 * The status is the answer; the pong only refines it with a latency figure. Plenty of
 * servers, and rather more proxies, simply never send one. Waiting the full connection
 * timeout for an optional extra would make every ping against such a host take eight
 * seconds to report a success it already had in hand, so the optional part gets its own
 * short deadline and its absence costs a null rather than the whole result.
 */
const PONG_GRACE_MS = 1500;

export interface PingOptions {
    readonly host: string;
    readonly port?: number;
    /** What we claim to be. Defaults to 47, which is 1.8. */
    readonly protocolVersion?: number;
    readonly timeoutMs?: number;
    /** Injected seam. Defaults to a real TCP socket from `node:net`. */
    readonly connect?: SocketFactory;
}

/**
 * The shape this module needs from a socket, which `node:net`'s `Socket` satisfies.
 *
 * Deliberately the smallest surface that does the job rather than the real `Socket` type.
 * A narrow structural type is what makes a test fake a few lines long instead of a
 * subclass, and it also documents exactly how much of a socket's behaviour the parsing
 * below is allowed to depend on.
 */
export interface SocketLike {
    write(data: Uint8Array): unknown;
    on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
    on(event: "error", listener: (error: Error) => void): unknown;
    on(event: "close", listener: () => void): unknown;
    on(event: "connect", listener: () => void): unknown;
    setTimeout(ms: number, listener: () => void): unknown;
    destroy(): unknown;
}

export type SocketFactory = (host: string, port: number) => SocketLike;

export type PingResult =
    | {
          readonly ok: true;
          readonly versionName: string;
          readonly protocol: number;
          readonly online: number | null;
          readonly max: number | null;
          readonly motd: string;
          readonly latencyMs: number | null;
      }
    | {
          readonly ok: false;
          readonly code: "dns" | "refused" | "timeout" | "protocol" | "closed";
          readonly message: string;
      };

/**
 * Encodes a VarInt: seven bits of payload per byte, high bit set on every byte except the
 * last, least significant group first.
 *
 * The unsigned right shift is doing real work rather than being a stylistic choice about
 * `>>` versus `>>>`. Minecraft's VarInt is a two's-complement 32-bit integer, so a
 * negative value has to walk its sign bits out over the full five bytes; an arithmetic
 * shift keeps feeding in ones and the loop never terminates.
 */
export function encodeVarInt(value: number): Uint8Array {
    const bytes: number[] = [];
    let remaining = value | 0;
    do {
        let byte = remaining & 0x7f;
        remaining >>>= 7;
        if (remaining !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (remaining !== 0);
    return Uint8Array.from(bytes);
}

/**
 * Decodes a VarInt at `offset`, or null when there is not yet enough to decode or when
 * what is there cannot be one.
 *
 * The two null cases are deliberately not distinguished, because both of them mean the
 * same thing to the only caller: do not act on this buffer. The caller distinguishes them
 * itself by how much data it holds, which it knows and this function would have to be
 * told.
 *
 * Five bytes is the hard ceiling. Thirty-five bits is already more than the thirty-two a
 * VarInt can represent, so a sixth continuation byte is not a large number, it is a
 * malformed stream or a host speaking something else entirely, and reading further would
 * be following a pointer supplied by whoever is on the other end.
 */
export function decodeVarInt(
    buffer: Uint8Array,
    offset: number,
): { value: number; size: number } | null {
    let value = 0;
    let size = 0;
    for (;;) {
        if (size >= 5) return null;
        const byte = buffer[offset + size];
        if (byte === undefined) return null;
        value |= (byte & 0x7f) << (7 * size);
        size += 1;
        if ((byte & 0x80) === 0) return { value: value | 0, size };
    }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
    let total = 0;
    for (const part of parts) total += part.byteLength;
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        joined.set(part, offset);
        offset += part.byteLength;
    }
    return joined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

/** A protocol String: the UTF-8 byte length as a VarInt, then those bytes. */
function encodeString(value: string): Uint8Array {
    const bytes = encoder.encode(value);
    return concat([encodeVarInt(bytes.byteLength), bytes]);
}

/**
 * Wraps a packet id and its payload in the outer length prefix.
 *
 * The length covers the id as well as the payload, which is the single easiest thing to
 * get wrong in this protocol and produces a stream that stays plausible for exactly one
 * packet before desynchronising by one byte.
 */
function encodePacket(id: number, payload: Uint8Array): Uint8Array {
    const body = concat([encodeVarInt(id), payload]);
    return concat([encodeVarInt(body.byteLength), body]);
}

function encodeUnsignedShort(value: number): Uint8Array {
    return Uint8Array.from([(value >>> 8) & 0xff, value & 0xff]);
}

/**
 * Flattens Minecraft's chat-component description into something a label can show.
 *
 * A description is a string on some servers, a `{ text, extra: [...] }` tree on others,
 * an array of components on a few, and any depth of nesting of those. Rendering the JSON
 * or the bare `[object Object]` that a naive read produces is worse than showing nothing,
 * because it looks like a bug in this app rather than a shape this app declined to handle.
 *
 * Section-sign colour codes are stripped as part of "plain text". They are formatting
 * instructions for a renderer that understands them, and this is not one; left in place
 * they show up as literal mojibake in the middle of a server's name.
 */
export function flattenMotd(description: unknown): string {
    return stripFormatting(collectMotd(description));
}

function collectMotd(description: unknown): string {
    if (typeof description === "string") return description;
    if (typeof description === "number" || typeof description === "boolean") {
        return String(description);
    }
    if (Array.isArray(description)) {
        return (description as readonly unknown[]).map(collectMotd).join("");
    }
    if (typeof description !== "object" || description === null) return "";

    const node = description as Record<string, unknown>;
    let text = typeof node["text"] === "string" ? node["text"] : "";
    const extra = node["extra"];
    if (Array.isArray(extra)) {
        for (const child of extra as readonly unknown[]) text += collectMotd(child);
    }
    return text;
}

function stripFormatting(value: string): string {
    return value.replace(/§[0-9a-fk-orA-FK-OR]/g, "");
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** What a parsed status JSON blob yields, before latency is known. */
type StatusFacts = Omit<Extract<PingResult, { ok: true }>, "ok" | "latencyMs">;

/**
 * Reads the status JSON, filling in for every field a server might omit.
 *
 * Every one of these fields is optional in practice. Modded servers, proxies and the
 * various "fake status" plugins all omit or restructure something, and none of that is a
 * reason to report a connection that plainly worked as a failure. `protocol` falls back to
 * -1 rather than 0 because 0 is a number that could plausibly be read as a real protocol
 * version, whereas -1 announces itself as "not stated".
 */
function readStatus(json: unknown): StatusFacts | null {
    const root = asRecord(json);
    if (root === null) return null;

    const version = asRecord(root["version"]);
    const players = asRecord(root["players"]);

    const versionName =
        version !== null && typeof version["name"] === "string" ? version["name"] : "unknown";
    const protocol = version === null ? null : readNumber(version, "protocol");

    return {
        versionName: stripFormatting(versionName),
        protocol: protocol ?? -1,
        online: players === null ? null : readNumber(players, "online"),
        max: players === null ? null : readNumber(players, "max"),
        motd: flattenMotd(root["description"]),
    };
}

/**
 * Maps a socket error onto one of the reportable codes.
 *
 * The `code` property is where the actionable difference lives: "there is no such host"
 * and "that host said no" look identical in an error message and need completely
 * different things from the person reading it. Anything unrecognised becomes `closed`
 * rather than being guessed at, because a wrong diagnosis sends somebody to check their
 * DNS when their firewall is the problem.
 */
function classify(error: unknown): {
    code: "dns" | "refused" | "timeout" | "closed";
    message: string;
} {
    const code =
        typeof error === "object" && error !== null
            ? (error as { code?: unknown }).code
            : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        return { code: "dns", message };
    }
    if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
        return { code: "refused", message };
    }
    if (code === "ETIMEDOUT") {
        return { code: "timeout", message };
    }
    return { code: "closed", message };
}

/**
 * The default socket factory, so that a caller who has no opinion about sockets does not
 * have to supply one and a caller who does can never be shadowed by this.
 *
 * `node:net`'s `Socket` already satisfies {@link SocketLike} structurally, which is the
 * point of keeping that interface as small as it is: the production path needs no adapter
 * and therefore has no adapter that a test could be quietly proving instead of the real
 * thing.
 */
const defaultConnect: SocketFactory = (host, port) => createConnection({ host, port });

/**
 * Performs the status exchange and reports what the server said.
 *
 * The exchange is a small state machine because the responses arrive as a byte stream
 * with no relationship to packet boundaries: a status response several kilobytes long
 * routinely arrives as a dozen chunks, and the pong can arrive glued to the tail of the
 * last one. Buffering everything and re-attempting the frame decode after each chunk is
 * the only parsing that is correct for both.
 */
export async function pingMinecraftServer(options: PingOptions): Promise<PingResult> {
    const port = options.port ?? DEFAULT_MINECRAFT_PORT;
    const protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const connect = options.connect ?? defaultConnect;

    let socket: SocketLike;
    try {
        socket = connect(options.host, port);
    } catch (error) {
        // A synchronous throw from the factory itself, which is what an invalid port or a
        // malformed host produces before any packet is ever sent.
        const classified = classify(error);
        return { ok: false, code: classified.code, message: classified.message };
    }

    return await new Promise<PingResult>((resolve) => {
        let settled = false;
        // Annotated rather than inferred, because `new Uint8Array(0)` infers the narrower
        // `Uint8Array<ArrayBuffer>` while a chunk off a socket is the wider
        // `Uint8Array<ArrayBufferLike>`, and the two do not assign in that direction.
        let pending: Uint8Array = new Uint8Array(0);
        let facts: StatusFacts | null = null;
        let pingSentAt: number | null = null;
        let pongTimer: ReturnType<typeof setTimeout> | null = null;

        const settle = (result: PingResult): void => {
            if (settled) return;
            settled = true;
            if (pongTimer !== null) clearTimeout(pongTimer);
            // Destroying is not optional politeness. Without it a socket whose server
            // never answers stays open until the operating system gives up on it, and a
            // surface that lets somebody press "Test connection" repeatedly would leak one
            // per press.
            try {
                socket.destroy();
            } catch {
                // A socket that is already gone is exactly the state being aimed at.
            }
            resolve(result);
        };

        const fail = (code: Extract<PingResult, { ok: false }>["code"], message: string): void => {
            settle({ ok: false, code, message });
        };

        /** Resolves with whatever the status said, with or without a latency figure. */
        const succeed = (latencyMs: number | null): void => {
            if (facts === null) {
                fail("protocol", "The server closed before sending a status response.");
                return;
            }
            settle({ ok: true, ...facts, latencyMs });
        };

        const handleFrame = (frame: Uint8Array): void => {
            const header = decodeVarInt(frame, 0);
            if (header === null) {
                fail("protocol", "A packet arrived with no readable packet id.");
                return;
            }

            if (facts === null) {
                if (header.value !== 0x00) {
                    fail(
                        "protocol",
                        `Expected a status response but the server sent packet 0x${header.value.toString(16)}.`,
                    );
                    return;
                }
                const stringHeader = decodeVarInt(frame, header.size);
                if (stringHeader === null) {
                    fail("protocol", "The status response carried no readable length prefix.");
                    return;
                }
                const start = header.size + stringHeader.size;
                const end = start + stringHeader.value;
                if (stringHeader.value < 0 || end > frame.byteLength) {
                    fail("protocol", "The status response declared more JSON than it contained.");
                    return;
                }

                let parsed: unknown;
                try {
                    parsed = JSON.parse(decoder.decode(frame.subarray(start, end)));
                } catch (error) {
                    fail(
                        "protocol",
                        `The status response was not JSON: ${error instanceof Error ? error.message : String(error)}`,
                    );
                    return;
                }
                const read = readStatus(parsed);
                if (read === null) {
                    fail("protocol", "The status response was JSON but not a status object.");
                    return;
                }
                facts = read;

                // The status is already in hand at this point, so everything below is an
                // optional refinement that must never be able to lose it.
                pingSentAt = Date.now();
                socket.write(encodePacket(0x01, new Uint8Array(8)));
                pongTimer = setTimeout(
                    () => {
                        succeed(null);
                    },
                    Math.min(PONG_GRACE_MS, timeoutMs),
                );
                // Unreferenced so an outstanding grace period can never be the only reason
                // the process is still alive at shutdown.
                pongTimer.unref();
                return;
            }

            if (header.value === 0x01) {
                succeed(pingSentAt === null ? null : Math.max(0, Date.now() - pingSentAt));
                return;
            }
            // Anything else after a status has been read is ignored rather than treated as
            // a failure: the answer is already known, and a chatty proxy appending
            // something unrecognised is not a reason to throw away a good result.
        };

        socket.on("connect", () => {
            const handshake = encodePacket(
                0x00,
                concat([
                    encodeVarInt(protocolVersion),
                    encodeString(options.host),
                    encodeUnsignedShort(port),
                    encodeVarInt(1),
                ]),
            );
            socket.write(handshake);
            socket.write(encodePacket(0x00, new Uint8Array(0)));
        });

        socket.on("data", (chunk) => {
            if (settled) return;
            pending = concat([pending, chunk]);
            if (pending.byteLength > MAX_PACKET_BYTES) {
                fail("protocol", "The server sent more data than a status response can contain.");
                return;
            }

            for (;;) {
                if (settled) return;
                const header = decodeVarInt(pending, 0);
                if (header === null) {
                    // Either a partial varint, which more data will complete, or a
                    // malformed one, which it never will. Five readable bytes without a
                    // terminator settles which of the two this is.
                    if (pending.byteLength >= 5) {
                        fail("protocol", "The server sent a malformed packet length.");
                    }
                    return;
                }
                if (header.value < 0 || header.value > MAX_PACKET_BYTES) {
                    fail(
                        "protocol",
                        `The server declared a ${String(header.value)} byte packet, which is not a status response.`,
                    );
                    return;
                }
                const end = header.size + header.value;
                if (pending.byteLength < end) return;

                const frame = pending.slice(header.size, end);
                pending = pending.slice(end);
                handleFrame(frame);
            }
        });

        socket.on("error", (error) => {
            const classified = classify(error);
            fail(classified.code, classified.message);
        });

        socket.on("close", () => {
            // A close after the status arrived is a complete answer that simply never got
            // its pong, which is a latency of null rather than a failed test.
            if (facts !== null) {
                succeed(null);
                return;
            }
            fail(
                "closed",
                `The connection to ${options.host}:${String(port)} closed before any status arrived.`,
            );
        });

        socket.setTimeout(timeoutMs, () => {
            if (facts !== null) {
                succeed(null);
                return;
            }
            fail(
                "timeout",
                `${options.host}:${String(port)} did not answer a status ping within ${String(timeoutMs)} ms.`,
            );
        });
    });
}
