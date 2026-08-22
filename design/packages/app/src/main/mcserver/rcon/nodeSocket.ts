/**
 * The one place `client.ts`'s `SocketFactory` shape meets a real `net.Socket`.
 *
 * Everything under `rcon/` is written against the injected `RconSocketLike` interface so
 * it can be tested without a network. This file is the production wiring for that
 * interface - deliberately the only file in the feature allowed to `import "node:net"`
 * for RCON - and it is exercised by `ipc.ts`'s real handlers, never unit-tested itself
 * beyond a type check, exactly as `dockerhosting/manager.ts`'s own `createConnection`
 * call is real infrastructure rather than a unit to verify in isolation.
 */

import { createConnection } from "node:net";

import type { RconSocketLike, SocketFactory } from "./client.js";

export const realRconSocketFactory: SocketFactory = (host, port) =>
    new Promise<RconSocketLike>((resolve, reject) => {
        const socket = createConnection({ host, port });
        let settled = false;

        socket.once("connect", () => {
            settled = true;
            resolve(socket as unknown as RconSocketLike);
        });
        socket.once("error", (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
    });
