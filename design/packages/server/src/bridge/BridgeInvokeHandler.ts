import type * as http from "node:http";
import type { HttpHandler } from "../http/HttpServer.js";

/**
 * `POST /bridge/invoke` - the hosted equivalent of `ipcRenderer.invoke`.
 *
 * ## The distinction this file is built around
 *
 * There are two completely different kinds of failure here and collapsing them is the
 * classic way to make a remote API useless to debug:
 *
 *  - **The request never reached a handler.** Malformed body, unknown channel, refused by
 *    policy, too large. These are HTTP failures and get real HTTP status codes, because
 *    something outside the application went wrong and the status is the honest summary.
 *  - **A handler ran and threw.** These get **HTTP 200** carrying an error envelope, which
 *    the client transport unwraps and re-throws.
 *
 * The second looks wrong at a glance and is the important one. Every one of the ~350 methods
 * in the bridge was written against `ipcRenderer.invoke`, where a handler throwing produces a
 * rejected promise carrying that handler's own message. If a thrown handler became a 500, the
 * transport would have to guess whether a 500 meant "your render failed because the world is
 * unreadable" or "the server fell over", and callers would lose the message that says which.
 * So application failure travels in the body, transport failure travels in the status, and
 * the renderer's existing error handling keeps working unchanged.
 */
export interface BridgeInvokeOptions {
    /** Runs the channel. Must reject when the handler rejects. */
    readonly dispatch: (channel: string, args: readonly unknown[]) => Promise<unknown>;
    /** Whether this deployment answers this channel at all, and why not when it does not. */
    readonly permit: (channel: string) => BridgePermission;
    /**
     * Largest request body accepted, in bytes.
     *
     * There is no body parsing anywhere else in this server, so this is a genuinely new
     * exposure rather than an inherited setting. The bridge's own payloads are small - a
     * folder path, a config object - because everything large travels the other way, as a
     * response. A file upload needs its own streamed route rather than a bigger number here;
     * base64 through a JSON envelope would turn a 40 MB image into a multi-second parse.
     */
    readonly maximumBodyBytes?: number;
}

export type BridgePermission =
    | { readonly allowed: true }
    | { readonly allowed: false; readonly reason: string; readonly instead?: string };

const DEFAULT_MAXIMUM_BODY_BYTES = 8 * 1024 * 1024;

interface InvokeRequest {
    readonly channel: string;
    readonly args: readonly unknown[];
}

function parseRequest(text: string): InvokeRequest | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== "object") return null;
    const candidate = parsed as { channel?: unknown; args?: unknown };
    if (typeof candidate.channel !== "string" || candidate.channel === "") return null;
    // A missing `args` is a call with no arguments, which is most of them. An `args` that is
    // present and not an array is a malformed request rather than an empty one, because
    // silently treating it as empty would turn a client bug into a puzzling handler failure.
    if (candidate.args !== undefined && !Array.isArray(candidate.args)) return null;
    return { channel: candidate.channel, args: (candidate.args as unknown[] | undefined) ?? [] };
}

/** Either the body, or the reason there is not one. */
type BodyRead =
    | { readonly kind: "body"; readonly text: string }
    | { readonly kind: "too-large" }
    | { readonly kind: "aborted" };

/**
 * Read the body, stopping as soon as it is too long.
 *
 * It stops *reading* at the limit rather than reading to the end and complaining afterwards,
 * because consuming a body you have already decided to reject is doing the sender's work for
 * them. But it does not tear the socket down here either: the first version did, and the
 * client then saw a bare network error instead of a 413, which is the difference between "my
 * request was too big" and "the server is broken". The caller answers first and closes after.
 */
async function readBody(req: http.IncomingMessage, limit: number): Promise<BodyRead> {
    return await new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const settle = (value: BodyRead): void => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        req.on("data", (chunk: Buffer) => {
            if (settled) return;
            total += chunk.length;
            if (total > limit) {
                req.pause();
                settle({ kind: "too-large" });
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => settle({ kind: "body", text: Buffer.concat(chunks).toString("utf8") }));
        req.on("error", () => settle({ kind: "aborted" }));
        req.on("aborted", () => settle({ kind: "aborted" }));
    });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(text),
        // The same hardening the static handler applies. Set here too rather than centrally,
        // because there is no Electron session in a hosted deployment to attach headers for
        // us, and a JSON route with no nosniff is a JSON route a browser may decide to run.
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cache-control": "no-store",
    });
    res.end(text);
}

export class BridgeInvokeHandler implements HttpHandler {
    readonly #options: BridgeInvokeOptions;
    readonly #limit: number;

    constructor(options: BridgeInvokeOptions) {
        this.#options = options;
        this.#limit = options.maximumBodyBytes ?? DEFAULT_MAXIMUM_BODY_BYTES;
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/bridge/invoke") return false;

        // Claimed from here on. Anything under this path that is wrong gets an answer from
        // this handler rather than falling through to the static handler and producing a
        // 404 that reads as "the bridge is not deployed".
        if (req.method !== "POST") {
            send(res, 405, { error: { message: "The bridge accepts POST." } });
            return true;
        }

        const body = await readBody(req, this.#limit);
        if (body.kind === "aborted") return true;
        if (body.kind === "too-large") {
            // Answer, flush, and only then close. The rest of the body is never read, but the
            // sender still learns which limit it crossed rather than meeting a dead socket.
            res.setHeader("connection", "close");
            send(res, 413, {
                error: {
                    message: `A bridge request may not exceed ${String(this.#limit)} bytes.`,
                },
            });
            res.on("finish", () => req.destroy());
            return true;
        }

        const request = parseRequest(body.text);
        if (request === null) {
            send(res, 400, {
                error: { message: "A bridge request is {channel: string, args?: unknown[]}." },
            });
            return true;
        }

        const permission = this.#options.permit(request.channel);
        if (!permission.allowed) {
            // 403 rather than 404: the channel exists, and saying so is not a leak - the
            // whole channel list ships in the client bundle. What matters is that the reason
            // travels, so the interface can say why rather than looking broken.
            send(res, 403, {
                error: {
                    message: permission.reason,
                    channel: request.channel,
                    ...(permission.instead === undefined ? {} : { instead: permission.instead }),
                },
            });
            return true;
        }

        try {
            const result = await this.#options.dispatch(request.channel, request.args);
            send(res, 200, { ok: true, result });
        } catch (error) {
            // 200, deliberately. See the note at the top of this file: this is the handler's
            // own failure travelling to a caller that was written to expect exactly it.
            send(res, 200, {
                ok: false,
                error: { message: error instanceof Error ? error.message : String(error) },
            });
        }
        return true;
    }
}
