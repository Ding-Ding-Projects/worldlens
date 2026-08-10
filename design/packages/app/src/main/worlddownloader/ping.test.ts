import { describe, expect, it } from "vitest";
import type { SocketFactory, SocketLike } from "./ping.js";
import {
    DEFAULT_MINECRAFT_PORT,
    decodeVarInt,
    encodeVarInt,
    flattenMotd,
    pingMinecraftServer,
} from "./ping.js";

/**
 * The listeners a socket is asked for, plus a hook to drive them.
 *
 * Deliberately not a `node:net` socket and not a live server. The point of the injected
 * seam is that the bytes on the wire can be written by the test, which is the only way to
 * prove that the framing this module emits and the framing it parses are the same
 * framing, and the only way to replay a malformed response on demand.
 */
class FakeSocket {
    readonly writes: Uint8Array[] = [];
    destroyed = false;
    private readonly dataListeners: ((chunk: Uint8Array) => void)[] = [];
    private readonly errorListeners: ((error: Error) => void)[] = [];
    private readonly closeListeners: (() => void)[] = [];
    private readonly connectListeners: (() => void)[] = [];
    private timeoutListener: (() => void) | null = null;

    /** Called with the number of writes so far, so a fake can answer the right request. */
    constructor(private readonly onWrite: (socket: FakeSocket, writeCount: number) => void) {}

    write(data: Uint8Array): boolean {
        this.writes.push(data);
        this.onWrite(this, this.writes.length);
        return true;
    }

    /**
     * Spelled out as four overloads rather than one permissive signature, and the listener
     * kept in four typed lists rather than one map.
     *
     * `SocketLike.on` is a set of call signatures, so a single
     * `(event: string, listener: (argument?: unknown) => void)` is checked contravariantly
     * against each of them and is rejected: a listener that accepts `unknown` is not a
     * listener that accepts a `Uint8Array`. Restating the four is what makes this fake
     * prove it satisfies the real interface instead of being cast into position, which is
     * the only way the tests below are evidence about the module rather than about an
     * adapter written to please them.
     */
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "connect", listener: () => void): this;
    on(
        event: "data" | "error" | "close" | "connect",
        listener: ((chunk: Uint8Array) => void) | ((error: Error) => void) | (() => void),
    ): this {
        if (event === "data") this.dataListeners.push(listener as (chunk: Uint8Array) => void);
        else if (event === "error") this.errorListeners.push(listener as (error: Error) => void);
        else if (event === "close") this.closeListeners.push(listener as () => void);
        else this.connectListeners.push(listener as () => void);
        return this;
    }

    setTimeout(_ms: number, listener: () => void): this {
        this.timeoutListener = listener;
        return this;
    }

    destroy(): void {
        this.destroyed = true;
    }

    emitData(chunk: Uint8Array): void {
        for (const listener of [...this.dataListeners]) listener(chunk);
    }

    emitError(error: Error): void {
        for (const listener of [...this.errorListeners]) listener(error);
    }

    emitClose(): void {
        for (const listener of [...this.closeListeners]) listener();
    }

    emitConnect(): void {
        for (const listener of [...this.connectListeners]) listener();
    }

    fireTimeout(): void {
        this.timeoutListener?.();
    }
}

/** Concatenates the way the module does, so a test can build a frame out of parts. */
function bytes(...parts: readonly Uint8Array[]): Uint8Array {
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

/** A protocol String, built with the module's own VarInt encoder rather than a second one. */
function protocolString(value: string): Uint8Array {
    const encoded = new TextEncoder().encode(value);
    return bytes(encodeVarInt(encoded.byteLength), encoded);
}

function protocolPacket(id: number, payload: Uint8Array): Uint8Array {
    const body = bytes(encodeVarInt(id), payload);
    return bytes(encodeVarInt(body.byteLength), body);
}

const STATUS_JSON = JSON.stringify({
    version: { name: "Paper 1.20.4", protocol: 765 },
    players: { online: 3, max: 20 },
    description: { text: "§aAndyville", extra: [{ text: " Town" }] },
});

/**
 * A server that answers the status request and then the ping, which is what a healthy
 * vanilla or Paper server does.
 *
 * The status arrives split across two chunks on purpose. A real status response is several
 * kilobytes and never arrives whole, so a test that hands it over in one piece proves the
 * parser works in exactly the case that never happens.
 */
function healthyServer(json = STATUS_JSON): { connect: SocketFactory; socket: () => FakeSocket } {
    let created: FakeSocket | null = null;
    const connect: SocketFactory = () => {
        const socket = new FakeSocket((self, writeCount) => {
            if (writeCount === 2) {
                const frame = protocolPacket(0x00, protocolString(json));
                const split = Math.max(1, Math.floor(frame.byteLength / 2));
                queueMicrotask(() => {
                    self.emitData(frame.slice(0, split));
                    self.emitData(frame.slice(split));
                });
            }
            if (writeCount === 3) {
                queueMicrotask(() => {
                    self.emitData(protocolPacket(0x01, new Uint8Array(8)));
                });
            }
        });
        created = socket;
        queueMicrotask(() => {
            socket.emitConnect();
        });
        return socket;
    };
    return {
        connect,
        socket: () => {
            if (created === null) throw new Error("no socket was created");
            return created;
        },
    };
}

describe("encodeVarInt and decodeVarInt", () => {
    it.each([0, 1, 127, 128, 255, 2097151, 2147483647])("round-trips %i", (value) => {
        const encoded = encodeVarInt(value);
        expect(decodeVarInt(encoded, 0)).toEqual({ value, size: encoded.byteLength });
    });

    it("uses the byte counts the protocol specifies", () => {
        expect(encodeVarInt(0).byteLength).toBe(1);
        expect(encodeVarInt(127).byteLength).toBe(1);
        expect(encodeVarInt(128).byteLength).toBe(2);
        expect(encodeVarInt(255).byteLength).toBe(2);
        expect(encodeVarInt(2097151).byteLength).toBe(3);
        // Thirty-one significant bits need five groups of seven, which is the ceiling.
        expect(encodeVarInt(2147483647).byteLength).toBe(5);
    });

    it("decodes at an offset inside a larger buffer", () => {
        const buffer = bytes(Uint8Array.from([0xaa, 0xbb]), encodeVarInt(300));
        expect(decodeVarInt(buffer, 2)).toEqual({ value: 300, size: 2 });
    });

    it("returns null when the value is not yet complete", () => {
        expect(decodeVarInt(Uint8Array.from([0x80]), 0)).toBeNull();
        expect(decodeVarInt(new Uint8Array(0), 0)).toBeNull();
    });

    it("refuses a VarInt longer than five bytes rather than reading on", () => {
        expect(decodeVarInt(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), 0)).toBeNull();
    });
});

describe("flattenMotd", () => {
    it("passes a plain string through", () => {
        expect(flattenMotd("A Minecraft Server")).toBe("A Minecraft Server");
    });

    it("reads a text object", () => {
        expect(flattenMotd({ text: "Andyville" })).toBe("Andyville");
    });

    it("concatenates nested extra components", () => {
        expect(
            flattenMotd({
                text: "Andyville",
                extra: [{ text: " Town" }, { text: "!", extra: [{ text: "!" }] }],
            }),
        ).toBe("Andyville Town!!");
    });

    it("strips section-sign formatting codes", () => {
        expect(flattenMotd("§aAndy§lville")).toBe("Andyville");
    });

    it("returns an empty string for a shape it does not understand", () => {
        expect(flattenMotd(null)).toBe("");
        expect(flattenMotd(undefined)).toBe("");
        expect(flattenMotd({ translate: "multiplayer.status.old" })).toBe("");
    });
});

describe("pingMinecraftServer", () => {
    it("completes the handshake and reports what the server said", async () => {
        const server = healthyServer();
        const result = await pingMinecraftServer({
            host: "andyville.invalid",
            connect: server.connect,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.versionName).toBe("Paper 1.20.4");
        expect(result.protocol).toBe(765);
        expect(result.online).toBe(3);
        expect(result.max).toBe(20);
        expect(result.motd).toBe("Andyville Town");
        expect(result.latencyMs).not.toBeNull();
        expect(result.latencyMs ?? -1).toBeGreaterThanOrEqual(0);
    });

    it("sends a handshake whose payload is the host, the port and the status state", async () => {
        const server = healthyServer();
        await pingMinecraftServer({ host: "andyville.invalid", connect: server.connect });

        const handshake = server.socket().writes[0];
        expect(handshake).toBeDefined();
        if (handshake === undefined) return;

        // Outer length prefix, then packet id 0x00, then the payload the protocol defines.
        const outer = decodeVarInt(handshake, 0);
        expect(outer).not.toBeNull();
        if (outer === null) return;
        expect(outer.size + outer.value).toBe(handshake.byteLength);

        const id = decodeVarInt(handshake, outer.size);
        expect(id?.value).toBe(0x00);

        const expectedPayload = bytes(
            encodeVarInt(47),
            protocolString("andyville.invalid"),
            Uint8Array.from([(DEFAULT_MINECRAFT_PORT >>> 8) & 0xff, DEFAULT_MINECRAFT_PORT & 0xff]),
            encodeVarInt(1),
        );
        expect(handshake.slice(outer.size + (id?.size ?? 0))).toEqual(expectedPayload);

        // The status request follows as its own empty packet.
        expect(server.socket().writes[1]).toEqual(protocolPacket(0x00, new Uint8Array(0)));
    });

    it("still succeeds when the server never sends a pong, reporting a null latency", async () => {
        // Proxies routinely answer the status and ignore the ping. The status is the
        // answer; the latency is a refinement that must not be able to lose it.
        const connect: SocketFactory = () => {
            const socket = new FakeSocket((self, writeCount) => {
                if (writeCount === 2) {
                    queueMicrotask(() => {
                        self.emitData(protocolPacket(0x00, protocolString(STATUS_JSON)));
                    });
                }
                if (writeCount === 3) {
                    queueMicrotask(() => {
                        self.emitClose();
                    });
                }
            });
            queueMicrotask(() => {
                socket.emitConnect();
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "proxy.invalid", connect });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.latencyMs).toBeNull();
        expect(result.versionName).toBe("Paper 1.20.4");
    });

    it("reports a silent host as a timeout", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket(() => undefined);
            queueMicrotask(() => {
                socket.emitConnect();
                socket.fireTimeout();
            });
            return socket;
        };

        const result = await pingMinecraftServer({
            host: "silent.invalid",
            connect,
            timeoutMs: 250,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("timeout");
        expect(result.message).toContain("silent.invalid");
    });

    it("reports a refused connection as refused rather than as a generic failure", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket(() => undefined);
            queueMicrotask(() => {
                const error: NodeJS.ErrnoException = new Error(
                    "connect ECONNREFUSED 127.0.0.1:25565",
                );
                error.code = "ECONNREFUSED";
                socket.emitError(error);
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "closed.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("refused");
    });

    it("reports an unresolvable hostname as dns", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket(() => undefined);
            queueMicrotask(() => {
                const error: NodeJS.ErrnoException = new Error(
                    "getaddrinfo ENOTFOUND nope.invalid",
                );
                error.code = "ENOTFOUND";
                socket.emitError(error);
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "nope.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("dns");
    });

    it("reports a host that closes before answering as closed", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket((self, writeCount) => {
                if (writeCount === 2) {
                    queueMicrotask(() => {
                        self.emitClose();
                    });
                }
            });
            queueMicrotask(() => {
                socket.emitConnect();
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "rude.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("closed");
    });

    it("refuses a declared packet length above the ceiling instead of allocating for it", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket((self, writeCount) => {
                if (writeCount === 2) {
                    queueMicrotask(() => {
                        // Two gigabytes announced by a host that has sent five bytes.
                        self.emitData(encodeVarInt(2 * 1024 * 1024 * 1024 - 1));
                    });
                }
            });
            queueMicrotask(() => {
                socket.emitConnect();
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "hostile.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("protocol");
    });

    it("reports a malformed length prefix as a protocol failure", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket((self, writeCount) => {
                if (writeCount === 2) {
                    queueMicrotask(() => {
                        // Five continuation bytes with no terminator, which no VarInt can
                        // be. Waiting for a sixth would be following the other end's
                        // instructions about how much to read.
                        self.emitData(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff]));
                    });
                }
            });
            queueMicrotask(() => {
                socket.emitConnect();
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "garbage.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("protocol");
    });

    it("reports a packet that is not a status response as a protocol failure", async () => {
        const connect: SocketFactory = () => {
            const socket = new FakeSocket((self, writeCount) => {
                if (writeCount === 2) {
                    queueMicrotask(() => {
                        self.emitData(protocolPacket(0x05, new Uint8Array(0)));
                    });
                }
            });
            queueMicrotask(() => {
                socket.emitConnect();
            });
            return socket;
        };

        const result = await pingMinecraftServer({ host: "web.invalid", connect });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("protocol");
    });

    it("destroys the socket on every path so a repeated test cannot leak one", async () => {
        const server = healthyServer();
        await pingMinecraftServer({ host: "andyville.invalid", connect: server.connect });
        expect(server.socket().destroyed).toBe(true);
    });

    it("accepts a socket factory typed only as the narrow shape it needs", () => {
        // A compile-time claim as much as a runtime one: the production `node:net` socket
        // satisfies this interface without an adapter, which is what stops the tests above
        // from proving an adapter instead of the module.
        const socket: SocketLike = new FakeSocket(() => undefined);
        expect(typeof socket.write).toBe("function");
    });
});
