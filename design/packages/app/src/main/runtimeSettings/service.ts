import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

export interface RuntimeExternalRequest {
    readonly id: string;
    readonly source: "https" | "homeAssistant";
    readonly url: string;
    readonly entityId?: string;
}
export interface RuntimeConfiguredSource {
    readonly id: string;
    readonly source: "https" | "homeAssistant";
    readonly url: string;
    readonly entityId?: string;
    readonly credentialRef?: string;
}
export interface RuntimeExternalAnswer {
    readonly ok: boolean;
    readonly message: string;
    readonly values?: Readonly<Record<string, string | number>>;
    readonly authRequired?: boolean;
}
export interface RuntimeStatusRecord {
    readonly registered: boolean;
    readonly deliveryAvailable: boolean;
    readonly source: "local-main-process";
    readonly message: string;
}

const PRIVATE_V4 = [
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./,
    /^192\.0\.0\./,
    /^192\.0\.2\./,
    /^192\.168\./,
    /^198\.18\./,
    /^198\.19\./,
    /^198\.51\.100\./,
    /^203\.0\.113\./,
    /^22[4-9]\./,
    /^23\d\./,
    /^24\d\./,
    /^25[0-5]\./,
];
export function isBlockedRuntimeAddress(address: string): boolean {
    if (isIP(address) === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
    if (isIP(address) === 6) {
        const normalized = address.toLowerCase();
        if (normalized.startsWith("::ffff:")) return isBlockedRuntimeAddress(normalized.slice(7));
        return (
            normalized === "::1" ||
            normalized.startsWith("fe80:") ||
            normalized.startsWith("fc") ||
            normalized.startsWith("fd") ||
            normalized.startsWith("ff") ||
            normalized === "::"
        );
    }
    return true;
}

export function validateRuntimeExternalUrl(
    raw: string,
    allowLoopbackDev = false,
): { ok: true; url: URL } | { ok: false; message: string } {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, message: "The external settings URL is not valid." };
    }
    if (url.username || url.password)
        return { ok: false, message: "External settings URLs cannot contain credentials." };
    const loopback =
        url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (
        isIP(url.hostname) !== 0 &&
        isBlockedRuntimeAddress(url.hostname) &&
        !(allowLoopbackDev && loopback && url.protocol === "http:")
    )
        return {
            ok: false,
            message:
                "External settings cannot target a private, local, reserved or multicast address.",
        };
    if (url.protocol !== "https:" && !(allowLoopbackDev && url.protocol === "http:" && loopback))
        return {
            ok: false,
            message:
                "External settings require HTTPS. HTTP is allowed only for an explicit loopback development source.",
        };
    if (url.port && !/^(443|80|3000|8099)$/.test(url.port))
        return {
            ok: false,
            message: "That external settings port is outside the bounded allowlist.",
        };
    return { ok: true, url };
}

function validateValues(value: unknown): Readonly<Record<string, string | number>> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const allowed = new Set([
        "language",
        "theme",
        "density",
        "accent",
        "fontFamily",
        "fontSize",
        "motion",
        "displayName",
    ]);
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 8) return null;
    const result: Record<string, string | number> = {};
    for (const [key, raw] of entries) {
        if (!allowed.has(key)) return null;
        if (key === "fontSize") {
            if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0.75 || raw > 2)
                return null;
            result[key] = raw;
        } else if (typeof raw !== "string" || raw.length > (key === "displayName" ? 120 : 512))
            return null;
        else result[key] = raw;
    }
    return result;
}

export interface RuntimeSettingsService {
    refresh(request: RuntimeExternalRequest): Promise<RuntimeExternalAnswer>;
    status(): RuntimeStatusRecord;
    dispose(): void;
}

async function withDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    return await new Promise<T>((resolve, reject) => {
        const abort = (): void =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        signal.addEventListener("abort", abort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", abort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", abort);
                reject(error);
            },
        );
    });
}

function pinnedHttpsRequest(
    url: URL,
    address: string,
    headers: Record<string, string>,
    signal: AbortSignal,
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const request = httpsRequest(
            {
                hostname: address,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method: "GET",
                headers: { ...headers, Host: url.host },
                servername: url.hostname,
                lookup: (_hostname, _options, callback) =>
                    callback(null, address, isIP(address) as 4 | 6),
            },
            (response) => {
                const chunks: Buffer[] = [];
                let size = 0;
                response.on("data", (chunk: Buffer) => {
                    size += chunk.length;
                    if (size <= 512 * 1024) chunks.push(chunk);
                    else request.destroy(new Error("response-limit"));
                });
                response.on("end", () =>
                    resolve({
                        status: response.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString("utf8"),
                    }),
                );
                response.on("error", reject);
            },
        );
        request.on("error", reject);
        signal.addEventListener(
            "abort",
            () => request.destroy(Object.assign(new Error("Aborted"), { name: "AbortError" })),
            { once: true },
        );
        request.end();
    });
}
export function createRuntimeSettingsService(
    options: {
        fetcher?: typeof fetch;
        readCredential?: (reference: string) => Promise<string | null>;
        readConfiguredSource?: (id: string) => RuntimeConfiguredSource | null;
    } = {},
): RuntimeSettingsService {
    const fetcher = options.fetcher ?? fetch;
    let generation = 0;
    return {
        status: () => ({
            registered: false,
            deliveryAvailable: false,
            source: "local-main-process",
            message:
                "Authenticated Status Hub delivery is not configured for this build. No submission route is exposed.",
        }),
        async refresh(request) {
            const run = ++generation;
            if (typeof request.id !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(request.id))
                return { ok: false, message: "The external rule id is not valid." };
            const configured =
                request.source === "homeAssistant"
                    ? (options.readConfiguredSource?.(request.id) ?? null)
                    : null;
            if (
                request.source === "homeAssistant" &&
                (configured === null || configured.source !== "homeAssistant")
            )
                return {
                    ok: false,
                    message:
                        "Home Assistant source configuration is unavailable in the main process.",
                    authRequired: true,
                };
            if (configured !== null && configured.id !== request.id)
                return {
                    ok: false,
                    message: "The configured external source id does not match the requested rule.",
                };
            if (
                request.source === "homeAssistant" &&
                (configured?.entityId === undefined ||
                    !/^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+$/.test(configured.entityId))
            )
                return {
                    ok: false,
                    message: "The configured Home Assistant entity id is not valid.",
                };
            const requestUrl = configured?.url ?? request.url;
            const checked = validateRuntimeExternalUrl(requestUrl, false);
            if (!checked.ok) return checked;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            let addresses: string[];
            try {
                addresses = (
                    await withDeadline(
                        lookup(checked.url.hostname, { all: true, verbatim: true }),
                        controller.signal,
                    )
                ).map((entry) => entry.address);
            } catch {
                clearTimeout(timeout);
                return { ok: false, message: "The external settings host could not be resolved." };
            }
            if (addresses.length === 0 || addresses.some(isBlockedRuntimeAddress)) {
                clearTimeout(timeout);
                return {
                    ok: false,
                    message:
                        "The external settings host resolves to a private, local, reserved or multicast address.",
                };
            }
            const headers: Record<string, string> = { Accept: "application/json" };
            if (request.source === "homeAssistant") {
                const reference = configured?.credentialRef ?? "";
                const token = await options.readCredential?.(reference);
                if (token === null || token === undefined) {
                    clearTimeout(timeout);
                    return {
                        ok: false,
                        message:
                            "Home Assistant credentials are unavailable in the operating-system vault.",
                        authRequired: true,
                    };
                }
                headers.Authorization = `Bearer ${token}`;
            }
            try {
                const response =
                    options.fetcher !== undefined
                        ? await fetcher(checked.url, {
                              method: "GET",
                              headers,
                              redirect: "error",
                              signal: controller.signal,
                          })
                        : null;
                const pinned =
                    options.fetcher === undefined
                        ? await pinnedHttpsRequest(
                              checked.url,
                              addresses[0]!,
                              headers,
                              controller.signal,
                          )
                        : null;
                if (run !== generation)
                    return {
                        ok: false,
                        message: "A newer external settings refresh superseded this response.",
                    };
                const afterAddresses = (
                    await lookup(checked.url.hostname, { all: true, verbatim: true })
                ).map((entry) => entry.address);
                if (
                    afterAddresses.length === 0 ||
                    afterAddresses.some(isBlockedRuntimeAddress) ||
                    afterAddresses.some((address) => !addresses.includes(address))
                )
                    return {
                        ok: false,
                        message:
                            "The external settings host changed address during the request, so the response was discarded.",
                    };
                const status = response?.status ?? pinned?.status ?? 0;
                if (status === 401 || status === 403)
                    return {
                        ok: false,
                        message: "The external settings source rejected its credential.",
                        authRequired: true,
                    };
                if (response !== null && !response.ok)
                    return {
                        ok: false,
                        message: `The external settings source answered HTTP ${response.status}.`,
                    };
                const body = response !== null ? await response.text() : (pinned?.body ?? "");
                if (body.length > 512 * 1024)
                    return {
                        ok: false,
                        message: "The external settings response exceeded the 512 KiB limit.",
                    };
                const parsed: unknown = JSON.parse(body);
                const values =
                    request.source === "homeAssistant"
                        ? typeof parsed === "object" &&
                          parsed !== null &&
                          (parsed as { state?: unknown }).state === "on"
                            ? validateValues((parsed as { attributes?: unknown }).attributes)
                            : {}
                        : validateValues(parsed);
                if (values === null)
                    return {
                        ok: false,
                        message:
                            "The external settings response contains an unknown or invalid field.",
                    };
                return {
                    ok: true,
                    message: "The external settings response was validated in the main process.",
                    values,
                };
            } catch (error) {
                return {
                    ok: false,
                    message:
                        error instanceof Error && error.name === "AbortError"
                            ? "The external settings request timed out or was cancelled."
                            : "The external settings source could not be reached.",
                };
            } finally {
                clearTimeout(timeout);
            }
        },
        dispose() {
            generation += 1;
        },
    };
}
