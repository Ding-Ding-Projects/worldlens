/** Pure repository-name suggestion plus renderer-visible result shapes for gh CLI routing. */

/** One person or organisation the signed-in account could publish a render under. */
export interface CiOwnerChoice {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export type CiOwnerChoicesAnswer =
    | { readonly ok: true; readonly login: string; readonly owners: readonly CiOwnerChoice[] }
    | {
          readonly ok: false;
          /** False when the reason is simply that nobody is signed in yet. */
          readonly signedIn: boolean;
          readonly message: string;
          readonly needsSignIn?: boolean;
      };
/* Repository-name suggestion. */

/**
 * GitHub's own limit. Longer names are refused outright rather than truncated server-side,
 * so a suggestion that ignored this would offer something that fails the moment it is used.
 */
export const MAX_CI_REPOSITORY_NAME_LENGTH = 100;

/** What a repository name falls back to when nothing usable survives sanitising. */
export const CI_REPOSITORY_NAME_FALLBACK = "minecraft-map";

const RESERVED_REPOSITORY_NAMES = new Set([".", ".."]);

/**
 * A world or map name, sanitized to a name GitHub will actually accept.
 *
 * GitHub repository names may hold only ASCII letters, digits, `.`, `-` and `_`; may not
 * be exactly `.` or `..`; may not end in `.git`; and are capped at
 * {@link MAX_CI_REPOSITORY_NAME_LENGTH} characters. This is pure and does no network call -
 * it is a suggestion; the gh CLI repository view/create route establishes the real state.
 */
export function suggestCiRepositoryName(sourceName: string): string {
    // Accented Latin letters lose their accent rather than their letter - "Café" becomes
    // "Cafe", not "Caf". Anything left outside ASCII after that is not a letter this
    // sanitizer knows how to keep, and is treated like any other disallowed character.
    const normalized = sourceName.normalize("NFKD").replace(/[̀-ͯ]/g, "");

    let candidate = normalized.replace(/[^A-Za-z0-9._-]+/g, "-");
    candidate = candidate.replace(/-{2,}/g, "-");
    candidate = candidate.replace(/^[.-]+|[.-]+$/g, "");

    if (/\.git$/i.test(candidate)) {
        candidate = candidate.slice(0, -".git".length).replace(/[.-]+$/g, "");
    }

    if (candidate.length > MAX_CI_REPOSITORY_NAME_LENGTH) {
        candidate = candidate.slice(0, MAX_CI_REPOSITORY_NAME_LENGTH).replace(/[.-]+$/g, "");
        // The cap can land exactly on a `.git` boundary that was not there before the cut -
        // "a".repeat(96) + ".git" + "bcd" ends in "bcd" pre-truncation, but slicing to 100
        // characters reveals a trailing ".git" that never existed at the string's real end.
        // Looped rather than a single strip, so a pathological run of repeated ".git"
        // suffixes exposed the same way cannot survive either.
        while (/\.git$/i.test(candidate)) {
            candidate = candidate.slice(0, -".git".length).replace(/[.-]+$/g, "");
        }
    }

    if (candidate === "" || RESERVED_REPOSITORY_NAMES.has(candidate)) {
        return CI_REPOSITORY_NAME_FALLBACK;
    }
    return candidate;
}

/* -------------------------------------------------------------------------------------- */
/* Checking availability                                                                    */
/* -------------------------------------------------------------------------------------- */

export type CiRepositoryNameAvailability =
    | { readonly status: "available"; readonly owner: string; readonly repo: string }
    | {
          readonly status: "taken";
          readonly owner: string;
          readonly repo: string;
          readonly private: boolean;
          readonly htmlUrl: string | null;
      }
    | {
          readonly status: "unknown";
          readonly owner: string;
          readonly repo: string;
          /** Why this could not be answered - offline, unauthorized, an odd status. */
          readonly message: string;
      };
