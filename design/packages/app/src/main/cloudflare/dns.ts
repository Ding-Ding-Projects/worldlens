/**
 * Pointing a domain at whichever host is serving the map.
 *
 * Three hosting routes, three record shapes, one rule they all share: **a record that has
 * been written is not a site that is working**. DNS has to propagate, a certificate has to
 * be issued, and the origin has to actually answer. Reporting "live" the moment the API
 * call returns is the single most tempting lie this file could tell, because the call
 * really did succeed - and the person then opens the address, gets an error, and concludes
 * the app is broken rather than that it is thirty seconds early.
 *
 * So {@link DomainState} has a `pending` that means pending.
 */
import { CloudflareCallError } from "./api.js";
import type { CloudflareClient, CloudflareDnsRecord } from "./api.js";

/** Which hosting route a domain is being pointed at. */
export type HostingRouteId = "github-pages" | "aws-cloudfront" | "local";

/** Where a domain has actually got to. */
export type DomainState =
    | "not-configured"
    /** The record exists at Cloudflare but has not been confirmed serving yet. */
    | "pending"
    /** Confirmed: the record resolves and the origin answered. */
    | "live"
    /** The record exists but points somewhere other than this project's host. */
    | "conflict"
    | "failed";

export interface DomainStatus {
    readonly state: DomainState;
    readonly hostname: string;
    /** What the record currently points at, or null when there is no record. */
    readonly target: string | null;
    /** One sentence a person can act on. Empty when there is nothing to act on. */
    readonly detail: string;
}

/** What a hosting route needs a record to say. */
export interface DomainTarget {
    readonly route: HostingRouteId;
    /**
     * The value the record must carry.
     *
     * For Pages this is `<owner>.github.io`; for CloudFront the distribution's domain
     * name; for a tunnel the `<tunnel-id>.cfargotunnel.com` hostname.
     */
    readonly content: string;
}

/**
 * The record type each route needs, and whether Cloudflare should proxy it.
 *
 * The proxy decision is not cosmetic. A tunnel **must** be proxied - the
 * `cfargotunnel.com` target only resolves through Cloudflare's edge, so an unproxied
 * record for it points at something the public internet cannot reach at all. GitHub Pages
 * must **not** be proxied by default, because Pages issues its own certificate and
 * proxying in front of it before that certificate exists produces a redirect loop that is
 * genuinely hard to diagnose.
 */
export function recordShapeFor(target: DomainTarget): {
    readonly type: string;
    readonly proxied: boolean;
} {
    switch (target.route) {
        case "local":
            return { type: "CNAME", proxied: true };
        case "aws-cloudfront":
            return { type: "CNAME", proxied: false };
        case "github-pages":
            return { type: "CNAME", proxied: false };
    }
}

export interface ApplyDomainRequest {
    readonly client: CloudflareClient;
    readonly zoneId: string;
    readonly hostname: string;
    readonly target: DomainTarget;
    /**
     * Replace a record that points somewhere else.
     *
     * Off by default, and that is deliberate: a record already at this name may be
     * somebody's live website. Overwriting it silently is the kind of destructive act that
     * only shows up when their site goes down.
     */
    readonly replaceConflicting?: boolean | undefined;
}

/** Creates or updates the record, and reports honestly what state it is in. */
export async function applyDomain(request: ApplyDomainRequest): Promise<DomainStatus> {
    const { client, zoneId, hostname, target } = request;
    const shape = recordShapeFor(target);

    let existing: readonly CloudflareDnsRecord[];
    try {
        existing = await client.findDnsRecords(zoneId, hostname);
    } catch (error) {
        return failure(hostname, error);
    }

    const ours = existing.find((record) => record.content === target.content);
    const conflicting = existing.find((record) => record.content !== target.content);

    if (conflicting && !ours && request.replaceConflicting !== true) {
        return {
            state: "conflict",
            hostname,
            target: conflicting.content,
            detail:
                `${hostname} already points at ${conflicting.content}. ` +
                `Nothing has been changed - if that record is not needed, replacing it is an ` +
                `explicit choice, because it may be serving a site right now.`,
        };
    }

    try {
        const record = ours ?? conflicting;
        const written = record
            ? await client.updateDnsRecord(zoneId, record.id, {
                  type: shape.type,
                  name: hostname,
                  content: target.content,
                  proxied: shape.proxied,
              })
            : await client.createDnsRecord(zoneId, {
                  type: shape.type,
                  name: hostname,
                  content: target.content,
                  proxied: shape.proxied,
              });

        return {
            state: "pending",
            hostname,
            target: written.content,
            detail:
                `The record is set. It usually starts working within a minute or two, and the ` +
                `certificate can take a little longer. This will say it is live once the address ` +
                `actually answers - not before.`,
        };
    } catch (error) {
        return failure(hostname, error);
    }
}

/**
 * Checks whether the address really answers.
 *
 * The only thing that turns `pending` into `live`. A record read back from Cloudflare
 * proves the record exists, which is exactly what was already known - it says nothing
 * about whether anybody on the internet can reach the site.
 */
export async function confirmDomainLive(options: {
    readonly hostname: string;
    readonly fetch?: (
        url: string,
        init: { readonly method: string; readonly signal?: AbortSignal | undefined },
    ) => Promise<{ readonly ok: boolean; readonly status: number }>;
    readonly timeoutMs?: number | undefined;
}): Promise<DomainStatus> {
    const doFetch =
        options.fetch ??
        (globalThis.fetch as unknown as NonNullable<typeof options.fetch>);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

    try {
        const response = await doFetch(`https://${options.hostname}/`, {
            method: "HEAD",
            signal: controller.signal,
        });
        if (response.ok || (response.status >= 200 && response.status < 400)) {
            return {
                state: "live",
                hostname: options.hostname,
                target: null,
                detail: "",
            };
        }
        return {
            state: "pending",
            hostname: options.hostname,
            target: null,
            detail: `https://${options.hostname}/ answered ${response.status}. It may still be starting up.`,
        };
    } catch {
        // A failure here is overwhelmingly "not propagated yet" rather than "broken
        // forever", and saying `failed` would send somebody off to fix a working setup.
        return {
            state: "pending",
            hostname: options.hostname,
            target: null,
            detail: `https://${options.hostname}/ is not answering yet. DNS can take a few minutes.`,
        };
    } finally {
        clearTimeout(timer);
    }
}

/** Removes the record. Returns quietly when there was none to remove. */
export async function removeDomain(options: {
    readonly client: CloudflareClient;
    readonly zoneId: string;
    readonly hostname: string;
}): Promise<void> {
    const records = await options.client.findDnsRecords(options.zoneId, options.hostname);
    for (const record of records) {
        await options.client.deleteDnsRecord(options.zoneId, record.id);
    }
}

function failure(hostname: string, error: unknown): DomainStatus {
    if (error instanceof CloudflareCallError) {
        return { state: "failed", hostname, target: null, detail: error.message };
    }
    return {
        state: "failed",
        hostname,
        target: null,
        detail: error instanceof Error ? error.message : "The request to Cloudflare failed.",
    };
}
