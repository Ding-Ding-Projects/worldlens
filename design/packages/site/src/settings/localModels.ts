/**
 * Talking to a local model runtime from a page, and being straight about the limits.
 *
 * The full contract is an app feature: an exhaustive catalogue, batch pulls with durable
 * progress, hardware-fit verdicts from real RAM and VRAM, and harness launching from an
 * allowlist. A page can do none of that, and the boundary is not a shortcoming to apologise
 * for - it is the browser sandbox doing its job. What the contract asks of a browser-only
 * surface is the closest locally mediated equivalent with its boundary documented, and that
 * is what this is.
 *
 * ## What it can honestly do
 *
 * Ask a runtime already listening on this machine what models are installed, and report the
 * answer. That is a real capability and worth having: somebody reading these docs can find
 * out whether their own setup is reachable without leaving the page.
 *
 * ## Four things it will not do, each for a reason worth stating
 *
 * **It never proxies.** Every request goes from this browser straight to the loopback address
 * the visitor named. Nothing is relayed through a server of ours, so nothing about a
 * visitor's models reaches anybody else - and a page that proxied "for convenience" would be
 * a page that had seen the list.
 *
 * **It never guesses hardware fit.** The browser cannot see RAM, VRAM or the driver, and the
 * contract is explicit that a verdict inferred from a model's name is not a verdict. So the
 * answer here is "unknown", which is the honest one, rather than a confident label derived
 * from a string.
 *
 * **It never pulls or deletes.** Downloading many gigabytes, or removing a model somebody
 * else's work depends on, is not a thing a documentation page should be able to start.
 *
 * **It never launches anything.** Harness launching is allowlisted orchestration by an
 * application that owns a process boundary. A page owns none.
 *
 * ## Failure has to stay distinguishable
 *
 * "Not running", "running but refusing this origin" and "something else went wrong" send a
 * person to three different places. A browser reports a blocked cross-origin request and a
 * refused connection identically, so this says so plainly rather than picking one and
 * sounding certain.
 */

/** The default address a local runtime listens on. */
export const DEFAULT_ENDPOINT = "http://127.0.0.1:11434";

/** How long to wait before calling it unreachable. Long enough for a busy machine. */
export const PROBE_TIMEOUT_MS = 3000;

export interface LocalModel {
    readonly name: string;
    /** Bytes, as the runtime reported them. Null when it did not say. */
    readonly bytes: number | null;
    /**
     * Whether this model will run well here.
     *
     * Always "unknown" from a page. The browser cannot see RAM, VRAM or the driver, and the
     * contract is explicit that a verdict guessed from a name is not a verdict.
     */
    readonly fit: "unknown";
}

export type LocalModelsResult =
    | { readonly ok: true; readonly models: readonly LocalModel[]; readonly endpoint: string }
    | { readonly ok: false; readonly reason: LocalModelsFailure; readonly detail: string };

export type LocalModelsFailure =
    | "not-an-address"
    | "not-loopback"
    | "unreachable-or-blocked"
    | "timed-out"
    | "unexpected-answer";

/**
 * Whether an address is one this may talk to.
 *
 * Loopback only, and checked before any request is made. A field that accepted any host would
 * let a page somebody was merely reading make requests to an address chosen by whatever they
 * pasted in, which is a scanner rather than a settings control.
 */
export function endpointAllowed(raw: string): { allowed: boolean; reason: LocalModelsFailure | null } {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { allowed: false, reason: "not-an-address" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { allowed: false, reason: "not-an-address" };
    }
    const host = url.hostname.toLowerCase();
    const loopback =
        host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    return loopback ? { allowed: true, reason: null } : { allowed: false, reason: "not-loopback" };
}

/** The models a runtime reports, or an honest account of why there is no answer. */
export async function listLocalModels(
    endpoint: string = DEFAULT_ENDPOINT,
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<LocalModelsResult> {
    const check = endpointAllowed(endpoint);
    if (!check.allowed) {
        return {
            ok: false,
            reason: check.reason ?? "not-an-address",
            detail:
                check.reason === "not-loopback"
                    ? "This only talks to a runtime on this machine. An address somewhere else " +
                      "would make this page a scanner rather than a settings control."
                    : "That is not an address this can use.",
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(`${endpoint.replace(/\/$/, "")}/api/tags`, {
            signal: controller.signal,
        });
        if (!response.ok) {
            return {
                ok: false,
                reason: "unexpected-answer",
                detail: `Something answered at that address, but with ${String(response.status)}.`,
            };
        }
        const body: unknown = await response.json();
        const models = (body as { models?: unknown }).models;
        if (!Array.isArray(models)) {
            return {
                ok: false,
                reason: "unexpected-answer",
                detail: "Something answered, but not with a model list. It may not be the runtime.",
            };
        }
        return {
            ok: true,
            endpoint,
            models: models.flatMap((entry): LocalModel[] => {
                const record = entry as Record<string, unknown>;
                if (typeof record.name !== "string") return [];
                return [
                    {
                        name: record.name,
                        bytes: typeof record.size === "number" ? record.size : null,
                        fit: "unknown",
                    },
                ];
            }),
        };
    } catch (error) {
        // A browser reports a blocked cross-origin request and a refused connection
        // identically, so naming one of them would be a guess stated as a fact. The three
        // possibilities send a person to three different places, so all three are named.
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
            ok: false,
            reason: aborted ? "timed-out" : "unreachable-or-blocked",
            detail: aborted
                ? "Nothing answered in time. It may be busy, or it may not be running."
                : "No answer. Either nothing is running there, or it is running and does not " +
                  "accept requests from this page - a browser reports those two identically, " +
                  "so this cannot tell you which.",
        };
    } finally {
        clearTimeout(timer);
    }
}

/** What this surface cannot do, stated where somebody would otherwise go looking for it. */
export const PAGE_BOUNDARY: readonly string[] = [
    "Nothing is relayed through a server. Requests go from this browser straight to the " +
        "address you name, so no list of your models reaches anybody else.",
    "It cannot tell you whether a model will run well here. A browser cannot see your RAM, " +
        "your graphics card or your driver, and a verdict guessed from a model's name is not " +
        "a verdict.",
    "It cannot download or delete a model. Fetching many gigabytes, or removing one that " +
        "something else depends on, is not a thing a documentation page should be able to start.",
    "It cannot launch anything. That needs an application that owns a process boundary, and a " +
        "page owns none.",
];
