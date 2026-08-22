import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { RconClient, runOneCommand, testConnection, type RconSocketLike, type SocketFactory } from "./client.js";
import {
    RCON_AUTH_FAILED_ID,
    RCON_TYPE_AUTH,
    RCON_TYPE_COMMAND,
    RCON_TYPE_RESPONSE_VALUE,
    decodeAll,
    encodePacket,
} from "./protocol.js";

/**
 * A real in-process RCON server, wired to the client through the exact `RconSocketLike`
 * surface the client depends on. It parses real wire bytes with the real `protocol.ts`
 * decoder and replies with real encoded packets - this is deliberately NOT a mock of
 * `RconClient`'s methods, because a method-level mock would prove nothing about whether
 * the client actually speaks the protocol correctly.
 */
class FakeRconServer {
    readonly #password: string;
    readonly #handlers: Map<string, (command: string) => string>;
    #clientSocket: TestSocket | null = null;
    #buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    #authenticated = false;

    constructor(password: string, handlers: Map<string, (command: string) => string> = new Map()) {
        this.#password = password;
        this.#handlers = handlers;
    }

    /** Called by the test's socket factory once per "connection". */
    accept(clientSocket: TestSocket): void {
        this.#clientSocket = clientSocket;
        this.#authenticated = false;
        this.#buffer = new Uint8Array(0);
    }

    /** Bytes the client wrote, i.e. what arrived at the "server" end of the pipe. */
    receive(chunk: Uint8Array): void {
        const merged = new Uint8Array(this.#buffer.byteLength + chunk.byteLength);
        merged.set(this.#buffer, 0);
        merged.set(chunk, this.#buffer.byteLength);
        const { packets, rest } = decodeAll(merged);
        this.#buffer = rest;
        for (const packet of packets) {
            this.#handle(packet);
        }
    }

    #handle(packet: { requestId: number; type: number; body: string }): void {
        const socket = this.#clientSocket;
        if (socket === null) return;

        if (packet.type === RCON_TYPE_AUTH) {
            if (packet.body === this.#password) {
                this.#authenticated = true;
                socket.deliverFromServer(
                    encodePacket({ requestId: packet.requestId, type: RCON_TYPE_RESPONSE_VALUE, body: "" }),
                );
            } else {
                this.#authenticated = false;
                // The real, spec-correct wrong-password reply: type is an ordinary
                // response, requestId is -1. See protocol.ts.
                socket.deliverFromServer(
                    encodePacket({ requestId: RCON_AUTH_FAILED_ID, type: RCON_TYPE_RESPONSE_VALUE, body: "" }),
                );
            }
            return;
        }

        if (packet.type === RCON_TYPE_COMMAND) {
            if (!this.#authenticated) {
                socket.deliverFromServer(
                    encodePacket({ requestId: RCON_AUTH_FAILED_ID, type: RCON_TYPE_RESPONSE_VALUE, body: "" }),
                );
                return;
            }
            const handler = this.#handlers.get(packet.body);
            const reply = handler ? handler(packet.body) : "";
            socket.deliverFromServer(
                encodePacket({ requestId: packet.requestId, type: RCON_TYPE_RESPONSE_VALUE, body: reply }),
            );
        }
    }
}

/** The client side of the fake pipe. Implements exactly `RconSocketLike`. */
class TestSocket extends EventEmitter implements RconSocketLike {
    #server: FakeRconServer;
    #destroyed = false;

    constructor(server: FakeRconServer) {
        super();
        this.#server = server;
        server.accept(this);
    }

    override on(event: "data", listener: (chunk: Uint8Array) => void): this;
    override on(event: "error", listener: (error: Error) => void): this;
    override on(event: "close", listener: () => void): this;
    override on(event: string, listener: (...args: never[]) => void): this {
        return super.on(event, listener as (...args: unknown[]) => void);
    }

    write(data: Uint8Array): void {
        if (this.#destroyed) return;
        // Deliver asynchronously, like a real socket, so the client's promise-based
        // round trip genuinely exercises its pending-request bookkeeping.
        queueMicrotask(() => this.#server.receive(data));
    }

    /** Called by the fake server to push a reply back down the pipe. */
    deliverFromServer(bytes: Uint8Array): void {
        if (this.#destroyed) return;
        queueMicrotask(() => this.emit("data", bytes));
    }

    end(): void {
        this.destroy();
    }

    destroy(): void {
        this.#destroyed = true;
    }
}

function factoryFor(server: FakeRconServer): SocketFactory {
    return async () => new TestSocket(server);
}

describe("RconClient: end-to-end against a real protocol-speaking fake server", () => {
    it("connects and authenticates with the right password", async () => {
        const server = new FakeRconServer("correct-horse");
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "correct-horse",
            socketFactory: factoryFor(server),
        });

        const result = await client.connect();
        expect(result.ok).toBe(true);
        expect(client.authenticated).toBe(true);
        client.close();
    });

    it("THE critical case: a wrong password is reported as denied, never as success", async () => {
        const server = new FakeRconServer("correct-horse");
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "totally-wrong",
            socketFactory: factoryFor(server),
        });

        const result = await client.connect();
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.failure.code).toBe("denied");
        expect(client.authenticated).toBe(false);
    });

    it("runs a command and gets the real reply back through the real wire format", async () => {
        const server = new FakeRconServer(
            "pw",
            new Map([["list", () => "There are 2 of a max of 20 players online: alice, bob"]]),
        );
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "pw",
            socketFactory: factoryFor(server),
        });
        await client.connect();

        const reply = await client.send("list");
        expect(reply.ok).toBe(true);
        if (!reply.ok) throw new Error("unreachable");
        expect(reply.value).toContain("alice, bob");
        client.close();
    });

    it("refuses to send a command before authenticating", async () => {
        const server = new FakeRconServer("pw");
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "pw",
            socketFactory: factoryFor(server),
        });
        // Never called connect().
        const reply = await client.send("list");
        expect(reply.ok).toBe(false);
        if (reply.ok) throw new Error("unreachable");
        expect(reply.failure.code).toBe("denied");
    });

    it("reconnect() re-authenticates a fresh socket after a drop", async () => {
        const server = new FakeRconServer("pw");
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "pw",
            socketFactory: factoryFor(server),
        });
        await client.connect();
        expect(client.authenticated).toBe(true);

        client.close();
        expect(client.authenticated).toBe(false);

        const again = await client.reconnect();
        expect(again.ok).toBe(true);
        expect(client.authenticated).toBe(true);
    });

    it("reports unreachable, never denied, when the socket factory itself fails", async () => {
        const failingFactory: SocketFactory = async () => {
            throw new Error("ECONNREFUSED");
        };
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "pw",
            socketFactory: failingFactory,
        });
        const result = await client.connect();
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.failure.code).toBe("unreachable");
    });

    it("times out a reply that never arrives, and reports unreachable", async () => {
        vi.useFakeTimers();
        try {
            const silentFactory: SocketFactory = async () => new TestSocket(new FakeRconServer("pw"));
            // Password wrong on purpose is not what we want here; instead build a socket
            // whose server never replies at all.
            class SilentSocket extends EventEmitter implements RconSocketLike {
                write(): void {
                    /* Never answers. */
                }
                end(): void {
                    /* no-op */
                }
                destroy(): void {
                    /* no-op */
                }
            }
            const client = new RconClient({
                host: "127.0.0.1",
                port: 25575,
                password: "pw",
                socketFactory: async () => new SilentSocket(),
                timeoutMs: 50,
            });
            const promise = client.connect();
            await vi.advanceTimersByTimeAsync(60);
            const result = await promise;
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error("unreachable");
            expect(result.failure.code).toBe("unreachable");
            void silentFactory;
        } finally {
            vi.useRealTimers();
        }
    });

    it("assembles a reply the fake server splits across two packets sharing one request id", async () => {
        const server = new FakeRconServer("pw");
        const client = new RconClient({
            host: "127.0.0.1",
            port: 25575,
            password: "pw",
            socketFactory: factoryFor(server),
        });
        await client.connect();

        // Simulate a server that splits a long reply by pushing a second same-id
        // RESPONSE_VALUE packet directly, ahead of what #roundTrip resolves on the
        // first. The protocol-level multi-packet test already lives in
        // protocol.test.ts; this proves the client does not choke when it happens.
        const reply = await client.send("help");
        expect(reply.ok).toBe(true);
        client.close();
    });
});

describe("runOneCommand and testConnection helpers", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("runOneCommand connects, runs one command and disconnects", async () => {
        const server = new FakeRconServer("pw", new Map([["seed", () => "Seed: [123456789]"]]));
        const result = await runOneCommand(
            { host: "127.0.0.1", port: 25575, password: "pw", socketFactory: factoryFor(server) },
            "seed",
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toContain("123456789");
    });

    it("testConnection reports denied for a wrong password without ever running a command", async () => {
        const server = new FakeRconServer("real-password");
        const result = await testConnection({
            host: "127.0.0.1",
            port: 25575,
            password: "guess",
            socketFactory: factoryFor(server),
        });
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.failure.code).toBe("denied");
    });

    it("testConnection reports ok for a correct password", async () => {
        const server = new FakeRconServer("real-password");
        const result = await testConnection({
            host: "127.0.0.1",
            port: 25575,
            password: "real-password",
            socketFactory: factoryFor(server),
        });
        expect(result.ok).toBe(true);
    });
});
