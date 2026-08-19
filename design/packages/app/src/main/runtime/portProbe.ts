import { connect } from "node:net";

/** Answers whether something is listening on `host:port` right now. Never rejects. */
export type PortProbe = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

/** The default probe: one TCP connection, opened and immediately closed. */
export const tcpPortProbe: PortProbe = (host, port, timeoutMs) =>
    new Promise<boolean>((resolve) => {
        const socket = connect({ host, port });
        let settled = false;
        const finish = (answer: boolean): void => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(answer);
        };
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        // A refused connection is the ordinary answer while a server is still starting,
        // so it is "not yet" rather than an error worth reporting.
        socket.once("error", () => finish(false));
    });
