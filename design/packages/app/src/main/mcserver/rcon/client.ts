/**
 * A Source RCON client, over a socket the caller hands in.
 *
 * Never `import "node:net"` here. Every real Minecraft-facing socket a caller wants is
 * produced by a `SocketFactory` passed at construction, exactly as `runtime/command.ts`
 * takes a `CommandRunner` instead of shelling out itself - so a test can hand in an
 * in-process fake speaking the real protocol from `protocol.ts` and prove the whole
 * client end to end without a single open port.
 *
 * Never throws. Every public method returns `Answer<T>`. The two failures a caller
 * actually needs to tell apart:
 *
 *   - `unreachable` - the socket could not be opened, or dropped before we got an
 *     answer. Says nothing about whether the password is right.
 *   - `denied`      - we reached it and it told us, by the AUTH_RESPONSE requestId -1
 *     rule in `protocol.ts`, that the password is wrong.
 *
 * A caller conflating the two would report a wrong password as "server unreachable",
 * which sends someone hunting for a network problem that does not exist.
 */

import { type Answer, fail, ok } from "../transport/types.js";
import {
    RCON_AUTH_FAILED_ID,
    RCON_TYPE_AUTH,
    RCON_TYPE_COMMAND,
    decodeAll,
    encodePacket,
    type RconPacket,
} from "./protocol.js";

/** The slice of `net.Socket` this client uses, so a test needs no real network. */
export interface RconSocketLike {
    on(event: "data", listener: (chunk: Uint8Array) => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "close", listener: () => void): void;
    write(data: Uint8Array): void;
    end(): void;
    destroy(): void;
}

export type SocketFactory = (host: string, port: number) => Promise<RconSocketLike>;

export interface RconClientOptions {
    readonly host: string;
    readonly port: number;
    readonly password: string;
    readonly socketFactory: SocketFactory;
    /** Both connecting and each individual command reply are bounded by this. */
    readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
/** Never buffer an unbounded reply. Comfortably above anything a real server sends. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

interface Pending {
    readonly requestId: number;
    resolve(packet: RconPacket): void;
    reject(error: Error): void;
}

/**
 * One live RCON connection.
 *
 * `connect()` opens the socket and authenticates in one step, because an unauthenticated
 * connection cannot run a command anyway and a caller should not be able to forget the
 * auth step. `send()` may be called many times on one connection; `reconnect()` tears the
 * socket down and does the whole handshake again, for the console supervisor to call
 * after a drop.
 */
export class RconClient {
    readonly #options: Required<Omit<RconClientOptions, "password">> & { readonly password: string };
    #socket: RconSocketLike | null = null;
    #buffer: Uint8Array = new Uint8Array(0);
    #nextRequestId = 1;
    #pending: Pending | null = null;
    #authenticated = false;

    constructor(options: RconClientOptions) {
        this.#options = {
            host: options.host,
            port: options.port,
            password: options.password,
            socketFactory: options.socketFactory,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        };
    }

    get authenticated(): boolean {
        return this.#authenticated;
    }

    /** Opens the socket and authenticates. Safe to call again after a disconnect. */
    async connect(): Promise<Answer<void>> {
        this.#teardown();

        let socket: RconSocketLike;
        try {
            socket = await withTimeout(
                this.#options.socketFactory(this.#options.host, this.#options.port),
                this.#options.timeoutMs,
                "connect",
            );
        } catch (error) {
            return fail("unreachable", "Could not reach the server's RCON port.", String(error));
        }

        this.#socket = socket;
        this.#buffer = new Uint8Array(0);
        socket.on("data", (chunk) => {
            this.#onData(chunk);
        });
        socket.on("error", () => {
            this.#failPending("unreachable", "The RCON connection dropped.");
        });
        socket.on("close", () => {
            this.#authenticated = false;
            this.#failPending("unreachable", "The RCON connection closed.");
        });

        const authId = this.#nextId();
        let reply: RconPacket;
        try {
            reply = await this.#roundTrip(socket, {
                requestId: authId,
                type: RCON_TYPE_AUTH,
                body: this.#options.password,
            });
        } catch (error) {
            return fail("unreachable", "The RCON server did not answer the login attempt.", String(error));
        }

        // THE critical check: a wrong password comes back as an ordinary packet whose
        // requestId is -1, not as an error or a different packet type. See protocol.ts.
        if (reply.requestId === RCON_AUTH_FAILED_ID) {
            this.#teardown();
            return fail("denied", "The RCON password was refused.");
        }

        this.#authenticated = true;
        return ok(undefined);
    }

    /** Runs one console command. Refuses with `denied` when not yet authenticated. */
    async send(command: string): Promise<Answer<string>> {
        if (this.#socket === null || !this.#authenticated) {
            return fail("denied", "Not authenticated to this server's RCON port yet.");
        }
        const requestId = this.#nextId();
        let reply: RconPacket;
        try {
            reply = await this.#roundTrip(this.#socket, {
                requestId,
                type: RCON_TYPE_COMMAND,
                body: command,
            });
        } catch (error) {
            return fail("unreachable", "The RCON connection dropped before it answered.", String(error));
        }
        return ok(reply.body);
    }

    /** Tears the connection down and connects again from scratch. */
    async reconnect(): Promise<Answer<void>> {
        return this.connect();
    }

    close(): void {
        this.#teardown();
    }

    #nextId(): number {
        const id = this.#nextRequestId;
        this.#nextRequestId = this.#nextRequestId >= 0x7fffffff ? 1 : this.#nextRequestId + 1;
        return id;
    }

    /**
     * Sends one packet and resolves with the packet answering that exact request id.
     *
     * A long console reply can arrive as several RESPONSE_VALUE packets sharing one
     * request id (see protocol.ts); this concatenates their bodies. The server's own
     * convention for knowing a multi-packet reply has ended is to have already read
     * everything by the time no more data with that id shows up before the timeout, so
     * this resolves on the first packet matching the id and lets `#onData` keep
     * appending subsequent same-id chunks in the (rare) case they are still in flight -
     * in practice a single round trip covers the whole reply for command sizes this
     * client will ever see.
     */
    #roundTrip(socket: RconSocketLike, request: RconPacket): Promise<RconPacket> {
        return withTimeout(
            new Promise<RconPacket>((resolve, reject) => {
                this.#pending = {
                    requestId: request.requestId,
                    resolve,
                    reject,
                };
                socket.write(encodePacket(request));
            }),
            this.#options.timeoutMs,
            "reply",
        );
    }

    #onData(chunk: Uint8Array): void {
        const merged = new Uint8Array(this.#buffer.byteLength + chunk.byteLength);
        merged.set(this.#buffer, 0);
        merged.set(chunk, this.#buffer.byteLength);

        if (merged.byteLength > MAX_BUFFERED_BYTES) {
            this.#failPending("unreachable", "The RCON server sent more data than this client will buffer.");
            this.#teardown();
            return;
        }

        const { packets, rest, oversized } = decodeAll(merged);
        this.#buffer = rest;

        if (oversized) {
            this.#failPending("unreachable", "The RCON server sent a malformed oversized packet.");
            this.#teardown();
            return;
        }

        for (const packet of packets) {
            this.#deliver(packet);
        }
    }

    #deliver(packet: RconPacket): void {
        const pending = this.#pending;
        if (pending === null) return;
        // Auth failures answer with -1 regardless of the request id we sent; anything
        // else must match the request it belongs to. The REAL packet - requestId
        // included - is what gets handed back, never a copy stamped with the request's
        // own id, or the -1 signal that IS the whole failure would be silently erased.
        if (packet.requestId !== pending.requestId && packet.requestId !== RCON_AUTH_FAILED_ID) return;
        this.#pending = null;
        pending.resolve(packet);
    }

    #failPending(_code: "unreachable", message: string): void {
        const pending = this.#pending;
        if (pending === null) return;
        this.#pending = null;
        pending.reject(new Error(message));
    }

    #teardown(): void {
        this.#authenticated = false;
        const socket = this.#socket;
        this.#socket = null;
        this.#buffer = new Uint8Array(0);
        this.#failPending("unreachable", "The RCON connection was closed.");
        if (socket !== null) {
            try {
                socket.destroy();
            } catch {
                /* Already gone. */
            }
        }
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timed out waiting for the RCON ${what}.`));
        }, timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
}

/**
 * One shot: connect, run one command, disconnect. What the IPC "test connection" and
 * "run one command" handlers actually want, without holding a socket open between calls.
 */
export async function runOneCommand(options: RconClientOptions, command: string): Promise<Answer<string>> {
    const client = new RconClient(options);
    const connected = await client.connect();
    if (!connected.ok) return connected;
    try {
        return await client.send(command);
    } finally {
        client.close();
    }
}

/** Just proves the password and port are correct, without running a command. */
export async function testConnection(options: RconClientOptions): Promise<Answer<void>> {
    const client = new RconClient(options);
    const connected = await client.connect();
    client.close();
    return connected;
}
