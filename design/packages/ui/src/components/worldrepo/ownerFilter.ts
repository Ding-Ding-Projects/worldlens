/**
 * Narrowing a repository list to the owner somebody just chose.
 *
 * The repository picker fetches every repository the signed-in account can write to -
 * personal and organization alike, up to three hundred of them - and then showed all of
 * them regardless of which owner was selected. Choosing an organization set the owner and
 * changed nothing else, so the list sat there looking identical and the control read as
 * broken. It was not broken; it simply was not connected to anything.
 *
 * The fix is a filter rather than another fetch. The organization's repositories are
 * already in the list that was loaded for the account, so asking the network again would
 * cost a round trip to display data that is on screen already - and would fail differently
 * when offline, for a narrowing operation that never needed the network at all.
 */

/** The shape this cares about. Deliberately structural, so a caller's richer type fits. */
export interface OwnedRepository {
    readonly owner: string;
    readonly fullName: string;
}

export interface OwnerFilterResult<T> {
    /** What to show. */
    readonly shown: readonly T[];
    /** How many were hidden purely because of the owner. */
    readonly hiddenByOwner: number;
    /**
     * True when an owner is selected and it has nothing.
     *
     * Distinguished from "no results" generally, because the two need different sentences:
     * an empty search says to search differently, an empty owner says the organization has
     * no repository this account may write to, which is a fact about permissions.
     */
    readonly ownerIsEmpty: boolean;
}

/**
 * Applies the owner narrowing on top of whatever the search already matched.
 *
 * Owner comparison is case-insensitive because GitHub treats owner names that way and a
 * picker that returned `Ding-Ding-Projects` while a record held `ding-ding-projects` would
 * hide every repository for a reason nobody could see.
 */
export function filterByOwner<T extends OwnedRepository>(
    matched: readonly T[],
    all: readonly T[],
    owner: string | null,
): OwnerFilterResult<T> {
    if (owner === null || owner.trim() === "") {
        return { shown: matched, hiddenByOwner: 0, ownerIsEmpty: false };
    }

    const wanted = owner.trim().toLowerCase();
    const shown = matched.filter((entry) => entry.owner.toLowerCase() === wanted);
    const ownerHasAny = all.some((entry) => entry.owner.toLowerCase() === wanted);

    return {
        shown,
        hiddenByOwner: matched.length - shown.length,
        ownerIsEmpty: !ownerHasAny,
    };
}

/** Every owner that actually appears in the list, in the order they first appear. */
export function ownersPresent(all: readonly OwnedRepository[]): readonly string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const entry of all) {
        const key = entry.owner.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        order.push(entry.owner);
    }
    return order;
}
