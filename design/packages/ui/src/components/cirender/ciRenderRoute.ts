/**
 * Where a cloud render runs, and where its map is served from.
 *
 * Two independent choices, deliberately. Rendering on GitHub Actions and hosting on AWS is
 * a perfectly reasonable combination, and so is rendering on AWS and hosting on Pages;
 * tying them together would rule both out for no reason a person would recognise.
 *
 * Modelled on `../chunker/chunkerRoute.ts`, down to the details that look like ceremony and
 * are not:
 *
 * - **Every route is always visible.** An unavailable one is shown disabled, carrying the
 *   reason it cannot be used. Hiding it instead means somebody who expected the option
 *   concludes the build does not have it, and goes looking somewhere else.
 * - **Reasons are coded ids, never English.** Each maps to a catalogue key, so every
 *   sentence exists in all three language modes and at both funny-level extremes.
 * - **Keys are written out one literal at a time**, never interpolated from an id. The
 *   catalogue's coverage test finds keys by reading source text, so a key that only exists
 *   as a runtime string is one it reports as translating nothing.
 */

/* -------------------------------------------------------------------------- */
/* Render routes                                                               */
/* -------------------------------------------------------------------------- */

export type CiRenderRouteId = "github-actions" | "aws-batch";

/** Ordered as the picker shows them. GitHub first: it is the one that needs no setup. */
export const CI_RENDER_ROUTE_IDS: readonly CiRenderRouteId[] = ["github-actions", "aws-batch"];

/** One render route, carrying whatever it has been pointed at. */
export type CiRenderRoute =
    | {
          readonly kind: "github-actions";
          readonly owner: string | null;
          readonly repo: string | null;
      }
    | {
          readonly kind: "aws-batch";
          readonly profile: string | null;
          readonly region: string | null;
          readonly bucket: string | null;
      };

/** A route pointed at nothing yet. Never a placeholder that reads like a real value. */
export function defaultRenderRoute(id: CiRenderRouteId): CiRenderRoute {
    switch (id) {
        case "github-actions":
            return { kind: "github-actions", owner: null, repo: null };
        case "aws-batch":
            return { kind: "aws-batch", profile: null, region: null, bucket: null };
    }
}

/** Why a render route cannot be used right now. */
export type CiRenderRouteReason =
    | "gh-unsupported"
    | "gh-signed-out"
    | "aws-unsupported"
    | "aws-cli-missing"
    | "aws-signed-out"
    | "aws-no-profile"
    | "aws-no-region"
    | "aws-not-provisioned";

const RENDER_REASON_COPY: Readonly<Record<CiRenderRouteReason, { readonly copyKey: string }>> = {
    "gh-unsupported": { copyKey: "ciRenderRoute.reason.gh-unsupported" },
    "gh-signed-out": { copyKey: "ciRenderRoute.reason.gh-signed-out" },
    "aws-unsupported": { copyKey: "ciRenderRoute.reason.aws-unsupported" },
    "aws-cli-missing": { copyKey: "ciRenderRoute.reason.aws-cli-missing" },
    "aws-signed-out": { copyKey: "ciRenderRoute.reason.aws-signed-out" },
    "aws-no-profile": { copyKey: "ciRenderRoute.reason.aws-no-profile" },
    "aws-no-region": { copyKey: "ciRenderRoute.reason.aws-no-region" },
    "aws-not-provisioned": { copyKey: "ciRenderRoute.reason.aws-not-provisioned" },
};

/** The catalogue key carrying that reason's sentence. Keeps ids and copy from drifting. */
export function renderReasonCopyKey(reason: CiRenderRouteReason): string {
    return RENDER_REASON_COPY[reason].copyKey;
}

/**
 * Something this app can actually do about a refusal, from the picker itself.
 *
 * `null` where nothing here would help. A build compiled without a channel does not grow
 * one because somebody pressed a button, and offering an action that cannot work is worse
 * than offering none.
 */
export type CiRenderRouteFix =
    | "sign-in-github"
    | "install-aws-cli"
    | "sign-in-aws"
    | "choose-aws-profile"
    | "choose-aws-region"
    | "provision-aws";

export function renderRouteFix(reason: CiRenderRouteReason): CiRenderRouteFix | null {
    switch (reason) {
        case "gh-signed-out":
            return "sign-in-github";
        case "aws-cli-missing":
            return "install-aws-cli";
        case "aws-signed-out":
            return "sign-in-aws";
        case "aws-no-profile":
            return "choose-aws-profile";
        case "aws-no-region":
            return "choose-aws-region";
        case "aws-not-provisioned":
            return "provision-aws";
        case "gh-unsupported":
        case "aws-unsupported":
            // This build does not carry the channel. No button makes that untrue.
            return null;
    }
}

/** What a surface needs to render one route: catalogue keys and hard facts. */
export interface CiRenderRouteDescription {
    readonly id: CiRenderRouteId;
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly summaryKey: string;
    readonly summaryFallback: string;
    /**
     * The concrete thing this route points at, or null when it points at nothing yet.
     *
     * An `owner/repo`, a profile and region. Never a sentence, so it is safe to show
     * unchanged in every language mode.
     */
    readonly detail: string | null;
}

export function describeRenderRoute(route: CiRenderRoute): CiRenderRouteDescription {
    switch (route.kind) {
        case "github-actions":
            return {
                id: "github-actions",
                labelKey: "ciRenderRoute.label.github-actions",
                labelFallback: "GitHub Actions",
                summaryKey: "ciRenderRoute.summary.github-actions",
                summaryFallback:
                    "Renders on GitHub's runners. Nothing to set up beyond a repository, and no bill.",
                detail: route.owner && route.repo ? `${route.owner}/${route.repo}` : null,
            };
        case "aws-batch":
            return {
                id: "aws-batch",
                labelKey: "ciRenderRoute.label.aws-batch",
                labelFallback: "AWS Batch",
                summaryKey: "ciRenderRoute.summary.aws-batch",
                summaryFallback:
                    "Renders on Fargate, with no world-size limit and CPU you choose. You pay AWS for what it uses.",
                detail:
                    route.profile && route.region ? `${route.profile} · ${route.region}` : null,
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Hosting routes                                                              */
/* -------------------------------------------------------------------------- */

export type CiHostingRouteId = "github-pages" | "aws-cloudfront" | "local";

export const CI_HOSTING_ROUTE_IDS: readonly CiHostingRouteId[] = [
    "github-pages",
    "aws-cloudfront",
    "local",
];

export type CiHostingRouteReason =
    | "pages-unsupported"
    | "pages-signed-out"
    | "cloudfront-unsupported"
    | "cloudfront-not-provisioned"
    | "local-unsupported"
    | "local-not-running"
    | "no-cloudflare-token"
    | "cloudflared-missing"
    | "zone-not-owned"
    | "tunnel-disconnected";

const HOSTING_REASON_COPY: Readonly<Record<CiHostingRouteReason, { readonly copyKey: string }>> = {
    "pages-unsupported": { copyKey: "ciHostingRoute.reason.pages-unsupported" },
    "pages-signed-out": { copyKey: "ciHostingRoute.reason.pages-signed-out" },
    "cloudfront-unsupported": { copyKey: "ciHostingRoute.reason.cloudfront-unsupported" },
    "cloudfront-not-provisioned": { copyKey: "ciHostingRoute.reason.cloudfront-not-provisioned" },
    "local-unsupported": { copyKey: "ciHostingRoute.reason.local-unsupported" },
    "local-not-running": { copyKey: "ciHostingRoute.reason.local-not-running" },
    "no-cloudflare-token": { copyKey: "ciHostingRoute.reason.no-cloudflare-token" },
    "cloudflared-missing": { copyKey: "ciHostingRoute.reason.cloudflared-missing" },
    "zone-not-owned": { copyKey: "ciHostingRoute.reason.zone-not-owned" },
    "tunnel-disconnected": { copyKey: "ciHostingRoute.reason.tunnel-disconnected" },
};

export function hostingReasonCopyKey(reason: CiHostingRouteReason): string {
    return HOSTING_REASON_COPY[reason].copyKey;
}

export interface CiHostingRouteDescription {
    readonly id: CiHostingRouteId;
    readonly labelKey: string;
    readonly labelFallback: string;
    readonly summaryKey: string;
    readonly summaryFallback: string;
}

export function describeHostingRoute(id: CiHostingRouteId): CiHostingRouteDescription {
    switch (id) {
        case "github-pages":
            return {
                id,
                labelKey: "ciHostingRoute.label.github-pages",
                labelFallback: "GitHub Pages",
                summaryKey: "ciHostingRoute.summary.github-pages",
                summaryFallback: "Served free from the repository. Public, and no bill.",
            };
        case "aws-cloudfront":
            return {
                id,
                labelKey: "ciHostingRoute.label.aws-cloudfront",
                labelFallback: "AWS CloudFront",
                summaryKey: "ciHostingRoute.summary.aws-cloudfront",
                summaryFallback:
                    "Served from your S3 bucket through a global cache. You pay for storage and traffic.",
            };
        case "local":
            return {
                id,
                labelKey: "ciHostingRoute.label.local",
                labelFallback: "This computer",
                summaryKey: "ciHostingRoute.summary.local",
                summaryFallback:
                    "Served from this machine. Add a Cloudflare tunnel to reach it from anywhere.",
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Readiness                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether a route can be used, and why not when it cannot.
 *
 * `ready: null` means **unmeasured** and is deliberately distinct from `false`, which
 * means unavailable. The same distinction `chunkerRouteHost.ts` draws: a probe that threw
 * has told us nothing, and rendering that as "unavailable" is a claim nobody checked.
 */
export interface CiRouteReadiness<Reason> {
    readonly ready: boolean | null;
    readonly reason: Reason | null;
}

export const UNMEASURED: CiRouteReadiness<never> = { ready: null, reason: null };
