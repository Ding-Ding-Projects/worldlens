/**
 * Talking to Cloudflare, bounded, from the main process only.
 *
 * No SDK. A third-party client would want the token as a constructor argument and hold it
 * for its lifetime, which is precisely the shape `credentials.ts` refuses to allow: the
 * token here is borrowed for one request through {@link CloudflareCredentialStore.useToken}
 * and is never stored on an object that outlives the call.
 *
 * Every response is read defensively. Cloudflare's envelope is consistent - a `success`
 * flag, a `result`, and an `errors` array - but a proxy, a captive portal or an outage can
 * put anything at all on the other end of an HTTPS request, and a client that assumes the
 * shape will throw somewhere unhelpful instead of saying what happened.
 */

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/** How long any one request may take before it is abandoned. */
export const CLOUDFLARE_TIMEOUT_MS = 20_000;

/** The largest response body this will read, so a hostile endpoint cannot exhaust memory. */
export const CLOUDFLARE_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** One error Cloudflare reported, in its own words. */
export interface CloudflareApiError {
    readonly code: number;
    readonly message: string;
}

/** Thrown when Cloudflare refused, or when the response was not one. */
export class CloudflareCallError extends Error {
    readonly status: number;
    readonly errors: readonly CloudflareApiError[];
    /** True when the surface should offer its token-and-scopes recovery action. */
    readonly needsToken: boolean;

    constructor(
        message: string,
        status: number,
        errors: readonly CloudflareApiError[] = [],
        needsToken = false,
    ) {
        super(message);
        this.name = "CloudflareCallError";
        this.status = status;
        this.errors = errors;
        this.needsToken = needsToken;
    }
}

/** How a request is made. An interface so every test here runs with no network at all. */
export type CloudflareFetch = (
    url: string,
    init: {
        readonly method: string;
        readonly headers: Readonly<Record<string, string>>;
        readonly body?: string | undefined;
        readonly signal?: AbortSignal | undefined;
    },
) => Promise<{
    readonly status: number;
    readonly ok: boolean;
    text(): Promise<string>;
}>;

export interface CloudflareClientOptions {
    /**
     * Borrows the token for one request.
     *
     * Deliberately a borrower rather than the token itself: this client never has a value
     * it could log, serialise or hand on, only the ability to ask for one per call.
     */
    readonly withToken: <T>(operation: (token: string) => Promise<T>) => Promise<T | null>;
    readonly fetch?: CloudflareFetch;
    readonly signal?: AbortSignal | undefined;
}

interface CloudflareEnvelope<T> {
    readonly success?: boolean;
    readonly result?: T;
    readonly errors?: readonly { readonly code?: number; readonly message?: string }[];
}

/** One Cloudflare zone - a domain the account controls. */
export interface CloudflareZone {
    readonly id: string;
    readonly name: string;
    /** `active` for a zone actually serving; anything else needs the person's attention. */
    readonly status: string;
}

/** One DNS record, in the fields this app sets or reads. */
export interface CloudflareDnsRecord {
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly content: string;
    readonly proxied: boolean;
}

export interface CloudflareAccount {
    readonly id: string;
    readonly name: string;
}

/** A bounded Cloudflare client. Holds no credential of its own. */
export class CloudflareClient {
    readonly #withToken: CloudflareClientOptions["withToken"];
    readonly #fetch: CloudflareFetch;
    readonly #signal: AbortSignal | undefined;

    constructor(options: CloudflareClientOptions) {
        this.#withToken = options.withToken;
        this.#fetch = options.fetch ?? (globalThis.fetch as unknown as CloudflareFetch);
        this.#signal = options.signal;
    }

    /**
     * Verifies the token and returns what it can see.
     *
     * The right first call: it proves the token is real and accepted without changing
     * anything, and its failure is the one a person can actually act on.
     */
    async verify(): Promise<{ readonly valid: boolean; readonly detail: string }> {
        try {
            await this.#call<{ readonly status?: string }>("GET", "/user/tokens/verify");
            return { valid: true, detail: "" };
        } catch (error) {
            if (error instanceof CloudflareCallError) {
                return { valid: false, detail: error.message };
            }
            throw error;
        }
    }

    async listAccounts(): Promise<readonly CloudflareAccount[]> {
        const result = await this.#call<readonly { id?: string; name?: string }[]>(
            "GET",
            "/accounts",
        );
        return (result ?? [])
            .filter((entry): entry is { id: string; name: string } =>
                typeof entry.id === "string" && typeof entry.name === "string",
            )
            .map((entry) => ({ id: entry.id, name: entry.name }));
    }

    /** Every zone this token can see, which is every domain it may set a record on. */
    async listZones(): Promise<readonly CloudflareZone[]> {
        const result = await this.#call<
            readonly { id?: string; name?: string; status?: string }[]
        >("GET", "/zones?per_page=50");
        return (result ?? [])
            .filter((entry): entry is { id: string; name: string; status?: string } =>
                typeof entry.id === "string" && typeof entry.name === "string",
            )
            .map((entry) => ({ id: entry.id, name: entry.name, status: entry.status ?? "unknown" }));
    }

    /** The records at one exact name, so an existing one is updated rather than duplicated. */
    async findDnsRecords(
        zoneId: string,
        name: string,
    ): Promise<readonly CloudflareDnsRecord[]> {
        const result = await this.#call<readonly Record<string, unknown>[]>(
            "GET",
            `/zones/${encodeURIComponent(zoneId)}/dns_records?name=${encodeURIComponent(name)}`,
        );
        return (result ?? []).map(readRecord).filter((record): record is CloudflareDnsRecord =>
            record !== null,
        );
    }

    async createDnsRecord(
        zoneId: string,
        record: {
            readonly type: string;
            readonly name: string;
            readonly content: string;
            readonly proxied: boolean;
        },
    ): Promise<CloudflareDnsRecord> {
        const result = await this.#call<Record<string, unknown>>(
            "POST",
            `/zones/${encodeURIComponent(zoneId)}/dns_records`,
            record,
        );
        const parsed = readRecord(result ?? {});
        if (!parsed) {
            throw new CloudflareCallError("Cloudflare created the record but described it oddly.", 200);
        }
        return parsed;
    }

    async updateDnsRecord(
        zoneId: string,
        recordId: string,
        record: {
            readonly type: string;
            readonly name: string;
            readonly content: string;
            readonly proxied: boolean;
        },
    ): Promise<CloudflareDnsRecord> {
        const result = await this.#call<Record<string, unknown>>(
            "PUT",
            `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
            record,
        );
        const parsed = readRecord(result ?? {});
        if (!parsed) {
            throw new CloudflareCallError("Cloudflare updated the record but described it oddly.", 200);
        }
        return parsed;
    }

    async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
        await this.#call(
            "DELETE",
            `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
        );
    }

    /* -- tunnels -- */

    async createTunnel(
        accountId: string,
        name: string,
    ): Promise<{ readonly id: string; readonly token: string }> {
        const result = await this.#call<{ id?: string; token?: string }>(
            "POST",
            `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel`,
            { name, config_src: "cloudflare" },
        );
        if (!result?.id || !result.token) {
            throw new CloudflareCallError("Cloudflare created a tunnel without returning it.", 200);
        }
        return { id: result.id, token: result.token };
    }

    async deleteTunnel(accountId: string, tunnelId: string): Promise<void> {
        await this.#call(
            "DELETE",
            `/accounts/${encodeURIComponent(accountId)}/cfd_tunnel/${encodeURIComponent(tunnelId)}`,
        );
    }

    async #call<T>(method: string, path: string, body?: unknown): Promise<T | null> {
        const answer = await this.#withToken(async (token) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CLOUDFLARE_TIMEOUT_MS);
            // A request that never settles is worse than one that fails, because a caught
            // rejection is handled and a pending promise simply stops the whole flow with
            // nothing on screen to say why.
            const signal = this.#signal
                ? anySignal([this.#signal, controller.signal])
                : controller.signal;

            try {
                const response = await this.#fetch(`${CLOUDFLARE_API_BASE}${path}`, {
                    method,
                    headers: {
                        // The one place the token appears, on one request, never retained.
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal,
                });

                const text = await response.text();
                if (text.length > CLOUDFLARE_MAX_BODY_BYTES) {
                    throw new CloudflareCallError(
                        "Cloudflare returned an implausibly large response.",
                        response.status,
                    );
                }

                let envelope: CloudflareEnvelope<T>;
                try {
                    envelope = JSON.parse(text) as CloudflareEnvelope<T>;
                } catch {
                    throw new CloudflareCallError(
                        `Cloudflare returned ${response.status} with a body that was not JSON. ` +
                            `Something between this computer and Cloudflare may be intercepting the request.`,
                        response.status,
                    );
                }

                if (!response.ok || envelope.success === false) {
                    throw refusalFrom(response.status, envelope);
                }
                return (envelope.result ?? null) as T | null;
            } finally {
                clearTimeout(timer);
            }
        });

        if (answer === undefined) {
            return null;
        }
        // `withToken` answers null when there is no token at all, which is a different
        // thing from a call that succeeded and returned nothing.
        return answer;
    }
}

function readRecord(raw: Record<string, unknown>): CloudflareDnsRecord | null {
    const { id, type, name, content, proxied } = raw as {
        id?: unknown;
        type?: unknown;
        name?: unknown;
        content?: unknown;
        proxied?: unknown;
    };
    if (
        typeof id !== "string" ||
        typeof type !== "string" ||
        typeof name !== "string" ||
        typeof content !== "string"
    ) {
        return null;
    }
    return { id, type, name, content, proxied: proxied === true };
}

function refusalFrom(status: number, envelope: CloudflareEnvelope<unknown>): CloudflareCallError {
    const errors = (envelope.errors ?? []).map((error) => ({
        code: typeof error.code === "number" ? error.code : 0,
        message: typeof error.message === "string" ? error.message : "",
    }));

    if (status === 401 || status === 403) {
        return new CloudflareCallError(
            errors[0]?.message ||
                "Cloudflare refused this token. It may be missing the DNS or Tunnel permission.",
            status,
            errors,
            true,
        );
    }
    const detail = errors.map((error) => error.message).filter(Boolean).join("; ");
    return new CloudflareCallError(
        detail || `Cloudflare refused the request with status ${status}.`,
        status,
        errors,
    );
}

/** Combines signals, since AbortSignal.any is not available on every supported runtime. */
function anySignal(signals: readonly AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort();
            break;
        }
        signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return controller.signal;
}
