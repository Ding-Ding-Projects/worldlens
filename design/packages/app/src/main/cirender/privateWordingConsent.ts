/**
 * Whether this render may write the operator's own private wording into a target
 * repository.
 *
 * The default is no, always, and the default is what ships. Everything this app
 * writes into somebody's repository is neutral wording, and that stays true unless
 * two separate things are both true at the moment of writing: the person explicitly
 * consented for that exact repository, and that exact repository has just been
 * confirmed private by the credential that is about to write to it.
 *
 * Both halves matter, and neither is sufficient.
 *
 * Consent alone is not enough because a repository can change. Somebody consents on
 * Monday for a private repository, flips it public on Tuesday, and renders on
 * Wednesday - a consent recorded once and trusted forever would publish on Wednesday.
 * So the visibility answer has a freshness window and is re-read before every write
 * rather than remembered.
 *
 * A private repository alone is not enough either. Private is a property of the
 * repository; consent is a decision by a person. Inferring one from the other means
 * deciding on somebody's behalf what they wanted written down.
 *
 * Everything fails closed. Public, unknown, unreachable, stale, a different
 * repository, an expired decision - every one of them answers "use the neutral
 * wording", because the failure modes are not symmetric: neutral wording in a private
 * repository is a missed nicety, and private wording in a public one cannot be undone.
 */

/** How long a visibility reading may be relied on. Deliberately short. */
export const VISIBILITY_FRESHNESS_MS = 60_000;

/** A repository, identified the way the rest of this module identifies one. */
export interface ConsentTarget {
    readonly owner: string;
    readonly repo: string;
}

/**
 * A decision a person made, about one repository, in one sitting.
 *
 * There is no "remember this" and no "apply to all". A decision names its target and
 * expires, because standing permission over a moving target is the thing that goes
 * wrong quietly.
 */
export interface PrivateWordingConsent {
    readonly target: ConsentTarget;
    /** When the person agreed, as epoch milliseconds. */
    readonly grantedAt: number;
    /** How long the decision holds. The caller chooses; the gate enforces. */
    readonly holdsForMs: number;
}

/** What the credential that is about to write just observed about the repository. */
export interface VisibilityReading {
    readonly target: ConsentTarget;
    readonly isPrivate: boolean;
    /** When it was read, as epoch milliseconds. Not when it was cached. */
    readonly readAt: number;
}

export type WordingDecision =
    | { readonly wording: "private" }
    | { readonly wording: "neutral"; readonly because: string };

function sameTarget(a: ConsentTarget, b: ConsentTarget): boolean {
    // Case-insensitive because forges treat owner and repository names that way, and a
    // consent for "Owner/Repo" that did not cover "owner/repo" would fail open on the
    // next call rather than closed.
    return (
        a.owner.trim().toLowerCase() === b.owner.trim().toLowerCase() &&
        a.repo.trim().toLowerCase() === b.repo.trim().toLowerCase()
    );
}

/**
 * Decides, for one write, at one moment.
 *
 * Call it immediately before writing, with a visibility reading taken immediately
 * before that. Its answer is about this write and no other.
 */
export function decideWording(options: {
    readonly target: ConsentTarget;
    readonly consent: PrivateWordingConsent | null;
    readonly visibility: VisibilityReading | null;
    readonly now: number;
    readonly freshnessMs?: number;
}): WordingDecision {
    const { target, consent, visibility, now } = options;
    const freshnessMs = options.freshnessMs ?? VISIBILITY_FRESHNESS_MS;

    if (consent === null) {
        return { wording: "neutral", because: "nobody has agreed to private wording here" };
    }
    if (!sameTarget(consent.target, target)) {
        return {
            wording: "neutral",
            because: `the agreement names ${consent.target.owner}/${consent.target.repo}, not ${target.owner}/${target.repo}`,
        };
    }
    if (now < consent.grantedAt || now - consent.grantedAt > consent.holdsForMs) {
        return { wording: "neutral", because: "the agreement has expired" };
    }

    if (visibility === null) {
        return {
            wording: "neutral",
            because: "the repository's visibility could not be read just now",
        };
    }
    if (!sameTarget(visibility.target, target)) {
        return {
            wording: "neutral",
            because: `the visibility reading is for ${visibility.target.owner}/${visibility.target.repo}, not ${target.owner}/${target.repo}`,
        };
    }
    // A reading from the future is a clock problem, and a clock problem is not a reason
    // to trust it.
    if (now < visibility.readAt || now - visibility.readAt > freshnessMs) {
        return {
            wording: "neutral",
            because: "the visibility reading is too old to rely on; read it again",
        };
    }
    if (!visibility.isPrivate) {
        return { wording: "neutral", because: "the repository is public" };
    }

    return { wording: "private" };
}

/**
 * The one-line explanation a surface shows when it declined.
 *
 * Separated so the reason is stated in words rather than implied by an absence -
 * silently writing neutral wording looks identical to the feature not existing.
 */
export function describeDecision(decision: WordingDecision): string {
    return decision.wording === "private"
        ? "Writing your own wording, because this repository is private and you agreed to it."
        : `Writing neutral wording, because ${decision.because}.`;
}
