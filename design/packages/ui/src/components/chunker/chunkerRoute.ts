/**
 * Where a Chunker conversion actually runs, as a model with no Vue and no bridge in it.
 *
 * A conversion is a long, memory-hungry Java process over somebody's whole world, so the
 * answer to "which machine does the work" is a real decision rather than a preference:
 *
 * ```
 * local            this computer, the way every other Chunker run in this app already works
 * docker           a container on this computer, for a different Java and a memory ceiling
 * github-actions   GitHub's runners, so a laptop that cannot hold the world does not have to
 * ssh              another machine over SSH, which costs an upload of the world both ways
 * ```
 *
 * ## Why readiness is a coded reason and never a bare boolean
 *
 * "Docker is not available" is the sentence somebody reads after installing Docker Desktop
 * and never starting it, and it sends them to download software they already have. Every
 * refusal here therefore names the exact unmet condition ({@link ChunkerRouteReason}) and,
 * where the application can genuinely do something about it, the in-app action that would
 * fix it ({@link ChunkerRouteFix}). A picker built on this can leave every route visible and
 * disabled-with-its-reason, which is what the guided-forms rule asks for, instead of hiding
 * three of the four and leaving somebody to wonder why.
 *
 * ## Why the reasons are ids rather than sentences
 *
 * This module deliberately returns no user-facing prose. Every sentence the picker shows
 * goes through the copy catalogue so it exists in all three language modes and at both
 * funny-level extremes, and a model that pre-baked English would quietly become the one
 * surface that could not. {@link reasonCopyKey} maps an id onto the catalogue key, so the
 * two cannot drift apart without a compile error.
 *
 * Concrete identifiers are the exception and travel as plain data: an image name, an
 * `owner/repo`, a `user@host`. Those are facts rather than voice, they are the same in
 * every language, and {@link describeRoute} hands them to the surface as `detail` so the
 * catalogue string can stay a sentence with no interpolation to get wrong.
 */

/* -------------------------------------------------------------------------- */
/* The four routes                                                             */
/* -------------------------------------------------------------------------- */

export type ChunkerRouteId = "local" | "docker" | "github-actions" | "ssh" | "aws";

/** Every route, in the order a picker should offer them: cheapest and nearest first. */
export const CHUNKER_ROUTE_IDS: readonly ChunkerRouteId[] = [
    "local",
    "docker",
    "github-actions",
    "ssh",
    // Last, deliberately. It is the only route that spends money without being asked a
    // second time, so it should not be the one somebody picks by reaching for the top.
    "aws",
] as const;

/**
 * A chosen route, with whatever that particular route needs to be startable.
 *
 * Discriminated on `kind` rather than being one flat record with four optional halves,
 * because "a GitHub route with no repository" and "an SSH route with no host" are states a
 * flat shape lets a caller construct and this one does not, at least not silently: the
 * fields are present and null, which is a decision the picker has to make rather than a
 * field it can forget exists.
 */
export type ChunkerRoute =
    | { readonly kind: "local" }
    | {
          readonly kind: "docker";
          /** The image a container run would use, when the shell has named one. */
          readonly image: string | null;
      }
    | {
          readonly kind: "github-actions";
          readonly owner: string | null;
          readonly repo: string | null;
      }
    | {
          readonly kind: "ssh";
          /** The saved machine's own id, as `remoteTargets.ts` stores it. */
          readonly targetId: string | null;
          /** What that machine is called, for display only. */
          readonly label: string | null;
      }
    | {
          readonly kind: "aws";
          /** The region the render stack is provisioned in. Null until one is chosen. */
          readonly region: string | null;
      };

/** The id of a chosen route, for anything keyed by route rather than carrying one. */
export function routeIdOf(route: ChunkerRoute): ChunkerRouteId {
    return route.kind;
}

/**
 * An empty route of that kind.
 *
 * Empty rather than guessed: a GitHub route arrives with no repository and an SSH route
 * with no machine, because inventing either would produce a route that looks startable and
 * is not. The picker fills them in from a real choice.
 */
export function defaultRouteFor(id: ChunkerRouteId): ChunkerRoute {
    switch (id) {
        case "local":
            return { kind: "local" };
        case "docker":
            return { kind: "docker", image: null };
        case "github-actions":
            return { kind: "github-actions", owner: null, repo: null };
        case "ssh":
            return { kind: "ssh", targetId: null, label: null };
        case "aws":
            return { kind: "aws", region: null };
    }
}

/* -------------------------------------------------------------------------- */
/* Describing one                                                              */
/* -------------------------------------------------------------------------- */

/** What a surface needs to render one route's name: a catalogue key and hard facts. */
export interface ChunkerRouteDescription {
    readonly id: ChunkerRouteId;
    /** The catalogue key for this route's short name. */
    readonly labelKey: string;
    /** The English fallback, for the `t(key, fallback)` call shape this package uses. */
    readonly labelFallback: string;
    /** The catalogue key for the one sentence saying what choosing it means. */
    readonly summaryKey: string;
    readonly summaryFallback: string;
    /**
     * The concrete identifier this route is pointed at, or null when it is not pointed at
     * anything yet. An image name, an `owner/repo`, a machine's label. Never a sentence,
     * so it is safe to show unchanged in every language mode.
     */
    readonly detail: string | null;
}

/**
 * The name, the one-line meaning, and the concrete thing this route points at.
 *
 * Takes the whole route rather than its id so `detail` can carry the repository or the
 * machine somebody actually chose. A route pointed at nothing yet reports `detail: null`
 * rather than a placeholder, and the surface says "not chosen yet" in its own words.
 */
export function describeRoute(route: ChunkerRoute): ChunkerRouteDescription {
    switch (route.kind) {
        case "local":
            return {
                id: "local",
                labelKey: "chunkerRoute.label.local",
                labelFallback: "This computer",
                summaryKey: "chunkerRoute.summary.local",
                summaryFallback: "Converts here, using the Chunker this app installed.",
                detail: null,
            };
        case "docker":
            return {
                id: "docker",
                labelKey: "chunkerRoute.label.docker",
                labelFallback: "A container on this computer",
                summaryKey: "chunkerRoute.summary.docker",
                summaryFallback:
                    "Converts here inside Docker, which brings its own Java and its own memory ceiling.",
                detail: route.image,
            };
        case "github-actions":
            return {
                id: "github-actions",
                labelKey: "chunkerRoute.label.githubActions",
                labelFallback: "GitHub's runners",
                summaryKey: "chunkerRoute.summary.githubActions",
                summaryFallback:
                    "Uploads the world to a repository and converts it on GitHub's machines.",
                detail:
                    route.owner === null || route.repo === null
                        ? null
                        : `${route.owner}/${route.repo}`,
            };
        case "aws":
            return {
                id: "aws",
                labelKey: "chunkerRoute.label.aws",
                labelFallback: "Amazon's machines",
                summaryKey: "chunkerRoute.summary.aws",
                // Says the cost out loud. Every other route is free at rest and this one is
                // not, and a person choosing between them cannot weigh that unless it is
                // written where the choice is made rather than discovered on a bill.
                summaryFallback:
                    "Sends the world to your own AWS account and converts it there. This one costs " +
                    "money while it runs, unlike every other route here.",
                detail: route.region,
            };
        case "ssh":
            return {
                id: "ssh",
                labelKey: "chunkerRoute.label.ssh",
                labelFallback: "Another machine over SSH",
                summaryKey: "chunkerRoute.summary.ssh",
                summaryFallback:
                    "Sends the world to a machine you have set up, converts it there, and brings it back.",
                detail: route.label,
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Readiness                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every way a route can be unavailable, one id per distinguishable sentence.
 *
 * Split finely on purpose. Docker alone has four, because "Docker Desktop is not installed"
 * and "Docker Desktop is installed and not running" send somebody to two completely
 * different places, and one shared "Docker is unavailable" would send half of them to the
 * wrong one.
 */
export type ChunkerRouteReason =
    | "local-unsupported"
    | "local-no-chunker"
    | "docker-unsupported"
    | "docker-not-installed"
    | "docker-daemon-down"
    | "docker-refused"
    | "docker-unusable"
    | "ci-unsupported"
    | "ci-signed-out"
    | "ssh-unsupported"
    | "ssh-no-hosts"
    | "aws-unsupported"
    | "aws-signed-out"
    | "aws-not-provisioned";

/**
 * Every reason's catalogue key, written out one literal at a time.
 *
 * Deliberately not built by interpolating the id into a template. The catalogue's own
 * coverage test finds a key by reading source text, so a key that only ever exists as a
 * runtime string is a key it reports as translating nothing - and the day somebody deletes
 * one of these sentences, a template would keep on asking for it and render the raw id.
 */
const REASON_COPY: Readonly<Record<ChunkerRouteReason, { readonly copyKey: string }>> = {
    "aws-unsupported": { copyKey: "chunkerRoute.reason.aws-unsupported" },
    "aws-signed-out": { copyKey: "chunkerRoute.reason.aws-signed-out" },
    "aws-not-provisioned": { copyKey: "chunkerRoute.reason.aws-not-provisioned" },
    "local-unsupported": { copyKey: "chunkerRoute.reason.local-unsupported" },
    "local-no-chunker": { copyKey: "chunkerRoute.reason.local-no-chunker" },
    "docker-unsupported": { copyKey: "chunkerRoute.reason.docker-unsupported" },
    "docker-not-installed": { copyKey: "chunkerRoute.reason.docker-not-installed" },
    "docker-daemon-down": { copyKey: "chunkerRoute.reason.docker-daemon-down" },
    "docker-refused": { copyKey: "chunkerRoute.reason.docker-refused" },
    "docker-unusable": { copyKey: "chunkerRoute.reason.docker-unusable" },
    "ci-unsupported": { copyKey: "chunkerRoute.reason.ci-unsupported" },
    "ci-signed-out": { copyKey: "chunkerRoute.reason.ci-signed-out" },
    "ssh-unsupported": { copyKey: "chunkerRoute.reason.ssh-unsupported" },
    "ssh-no-hosts": { copyKey: "chunkerRoute.reason.ssh-no-hosts" },
};

/** The catalogue key carrying that reason's sentence. Keeps ids and copy from drifting. */
export function reasonCopyKey(reason: ChunkerRouteReason): string {
    return REASON_COPY[reason].copyKey;
}

/**
 * Something the application can actually do about a refusal, from the picker itself.
 *
 * `null` where nothing in this app would help: a build compiled without a channel does not
 * grow one because somebody pressed a button, and offering an action that cannot work is
 * worse than offering none.
 */
export type ChunkerRouteFix =
    | "install-chunker"
    | "install-docker"
    | "start-docker"
    | "sign-in-github"
    | "add-ssh-host"
    | "sign-in-aws"
    | "provision-aws";

/** The one in-app action that would clear this reason, or null when there is none. */
export function fixFor(reason: ChunkerRouteReason): ChunkerRouteFix | null {
    switch (reason) {
        case "aws-signed-out":
            return "sign-in-aws";
        case "aws-not-provisioned":
            return "provision-aws";
        case "local-no-chunker":
            return "install-chunker";
        case "docker-not-installed":
            return "install-docker";
        case "docker-daemon-down":
            return "start-docker";
        case "ci-signed-out":
            return "sign-in-github";
        case "ssh-no-hosts":
            return "add-ssh-host";
        // A build with no channel for a route, a Docker that refused this account, and a
        // Docker that answered something nobody can act on are all outside this app's
        // reach. Each keeps its own sentence and gets no button.
        case "local-unsupported":
        case "docker-unsupported":
        case "docker-refused":
        case "docker-unusable":
        case "ci-unsupported":
        case "ssh-unsupported":
        case "aws-unsupported":
            return null;
    }
}

export type ChunkerRouteReadiness =
    | {
          readonly ready: true;
          /**
           * A fact worth showing beside a route that works: the image, the account, the
           * machine. Never a warning, and never prose - see the note at the top.
           */
          readonly detail: string | null;
      }
    | {
          readonly ready: false;
          readonly reason: ChunkerRouteReason;
          readonly fix: ChunkerRouteFix | null;
          /**
           * The underlying tool's own words, when there were any - Docker's error line, for
           * instance. Shown under the sentence as evidence, never in place of it.
           */
          readonly detail: string | null;
      };

/* -------------------------------------------------------------------------- */
/* What readiness is decided from                                              */
/* -------------------------------------------------------------------------- */

/** Docker's five states, named exactly as `remote/remoteBridge.ts` already names them. */
export type ChunkerDockerStatus =
    | "available"
    | "daemon-unreachable"
    | "not-installed"
    | "refused"
    | "unusable";

/**
 * Everything measured about this machine that decides which routes can run.
 *
 * Every field that could not be measured is `null` rather than `false`, and the two mean
 * genuinely different things here: `false` is "we looked and it is not there", `null` is
 * "this build could not look". They produce different sentences, because telling somebody
 * Chunker is missing when the truth is that nothing checked is how a person ends up
 * reinstalling something that was never broken.
 */
export interface ChunkerRouteFacts {
    readonly local: {
        /** False when this build has no Chunker channel at all. */
        readonly supported: boolean;
        /** True when the jar is on disk. Null when nothing could check. */
        readonly chunkerInstalled: boolean | null;
    };
    readonly docker: {
        readonly supported: boolean;
        readonly status: ChunkerDockerStatus | null;
        /** Docker's own words, when it had any. */
        readonly message: string | null;
        readonly image: string | null;
    };
    readonly githubActions: {
        readonly supported: boolean;
        readonly signedIn: boolean | null;
        /** The account that would drive it, e.g. a login. Facts only. */
        readonly account: string | null;
    };
    readonly ssh: {
        readonly supported: boolean;
        /** How many machines have been set up. Null when the store could not be read. */
        readonly hosts: number | null;
    };
    readonly aws: {
        readonly supported: boolean;
        /** Whether the AWS CLI has usable credentials. Null when it was not asked. */
        readonly signedIn: boolean | null;
        /**
         * Whether the render stack already exists in the chosen region.
         *
         * Kept apart from `signedIn` because they need different answers: signed out means
         * sign in, unprovisioned means create resources that will cost money. Collapsing
         * them into one "not ready" would offer the wrong fix half the time.
         */
        readonly provisioned: boolean | null;
        readonly region: string | null;
    };
}

/** Facts for a build that has measured nothing yet, so a picker can render before probing. */
export function unprobedFacts(): ChunkerRouteFacts {
    return {
        local: { supported: false, chunkerInstalled: null },
        docker: { supported: false, status: null, message: null, image: null },
        githubActions: { supported: false, signedIn: null, account: null },
        ssh: { supported: false, hosts: null },
        aws: { supported: false, signedIn: null, provisioned: null, region: null },
    };
}

/**
 * Whether that route can take a conversion right now, and the exact reason when it cannot.
 *
 * Unmeasured is treated as usable wherever the application can recover from being wrong.
 * A local Chunker that could not be checked stays selectable, because the conversion screen
 * offers to fetch the jar when it turns out to be missing; a Docker whose state is unknown
 * does not, because a container run that cannot start fails minutes in with a message
 * nobody expected. The asymmetry is deliberate: guess towards the route that can correct
 * itself, refuse the one that cannot.
 */
export function checkRoute(id: ChunkerRouteId, facts: ChunkerRouteFacts): ChunkerRouteReadiness {
    switch (id) {
        case "local": {
            if (!facts.local.supported) {
                return { ready: false, reason: "local-unsupported", fix: null, detail: null };
            }
            if (facts.local.chunkerInstalled === false) {
                return {
                    ready: false,
                    reason: "local-no-chunker",
                    fix: fixFor("local-no-chunker"),
                    detail: null,
                };
            }
            return { ready: true, detail: null };
        }
        case "docker": {
            if (!facts.docker.supported) {
                return { ready: false, reason: "docker-unsupported", fix: null, detail: null };
            }
            const status = facts.docker.status;
            if (status === "available") return { ready: true, detail: facts.docker.image };
            const reason: ChunkerRouteReason =
                status === "not-installed"
                    ? "docker-not-installed"
                    : status === "daemon-unreachable"
                      ? "docker-daemon-down"
                      : status === "refused"
                        ? "docker-refused"
                        : // Both a literal "unusable" and a state nothing could read land
                          // here. The sentence says the machine could not be asked, which
                          // is true of both and overstates neither.
                          "docker-unusable";
            return { ready: false, reason, fix: fixFor(reason), detail: facts.docker.message };
        }
        case "github-actions": {
            if (!facts.githubActions.supported) {
                return { ready: false, reason: "ci-unsupported", fix: null, detail: null };
            }
            if (facts.githubActions.signedIn === false) {
                return {
                    ready: false,
                    reason: "ci-signed-out",
                    fix: fixFor("ci-signed-out"),
                    detail: null,
                };
            }
            // Unknown stays selectable: the CI screen runs a real preflight of its own and
            // refuses there with far more detail than a probe could carry.
            return { ready: true, detail: facts.githubActions.account };
        }
        case "ssh": {
            if (!facts.ssh.supported) {
                return { ready: false, reason: "ssh-unsupported", fix: null, detail: null };
            }
            if (facts.ssh.hosts === 0) {
                return {
                    ready: false,
                    reason: "ssh-no-hosts",
                    fix: fixFor("ssh-no-hosts"),
                    detail: null,
                };
            }
            return { ready: true, detail: null };
        }
        case "aws": {
            if (!facts.aws.supported) {
                return { ready: false, reason: "aws-unsupported", fix: null, detail: null };
            }
            if (facts.aws.signedIn !== true) {
                return {
                    ready: false,
                    reason: "aws-signed-out",
                    fix: fixFor("aws-signed-out"),
                    detail: null,
                };
            }
            if (facts.aws.provisioned !== true) {
                return {
                    ready: false,
                    reason: "aws-not-provisioned",
                    fix: fixFor("aws-not-provisioned"),
                    detail: null,
                };
            }
            // The region is reported, not merely checked. It is what the bill will say.
            return { ready: true, detail: facts.aws.region };
        }
    }
}

/** Readiness for all four, in offer order, so a picker maps once over one array. */
export function checkAllRoutes(
    facts: ChunkerRouteFacts,
): readonly { readonly id: ChunkerRouteId; readonly readiness: ChunkerRouteReadiness }[] {
    return CHUNKER_ROUTE_IDS.map((id) => ({ id, readiness: checkRoute(id, facts) }));
}

/**
 * The first route that can actually run, or null when none of them can.
 *
 * Used to seed a picker, never to start anything: a route nobody chose should not begin a
 * multi-gigabyte conversion, and this only decides which radio is pre-selected.
 */
export function firstReadyRoute(facts: ChunkerRouteFacts): ChunkerRouteId | null {
    for (const id of CHUNKER_ROUTE_IDS) {
        if (checkRoute(id, facts).ready) return id;
    }
    return null;
}
