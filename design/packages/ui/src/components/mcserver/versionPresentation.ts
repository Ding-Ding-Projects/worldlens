/**
 * How a Minecraft version is presented: when it came out, and where to read about it.
 *
 * Both are deliberately conservative. A release date is the kind of fact somebody repeats
 * to another person, so an unknown one stays unknown rather than becoming a plausible
 * guess. And a wiki address is CONSTRUCTED from the version's own name rather than
 * discovered, so this module says so and the interface says so too - the page reliably
 * exists for versions that have been out a while, and may not yet for one published
 * minutes ago.
 */

/** The official Minecraft wiki. */
const WIKI_ORIGIN = "https://minecraft.wiki";
export type WikiArticleState = "verified" | "unavailable" | "offline-unverified";

/**
 * A version string as the catalogue records it, which for some flavours carries a build
 * suffix (`1.21.4#123`). Only the game version is meaningful to the wiki or to a date.
 */
export function gameVersionOf(version: string): string {
    const hash = version.indexOf("#");
    return hash === -1 ? version : version.slice(0, hash);
}

/**
 * Whether a version string looks like a numbered Java Edition release (`1.21`, `1.21.4`).
 *
 * The wiki titles those articles `Java_Edition_<version>` and titles a snapshot by its own
 * name, so the two need telling apart before an address is built.
 */
export function isNumberedRelease(version: string): boolean {
    return /^\d+\.\d+(\.\d+)?$/.test(version);
}

/**
 * The official wiki page for a version, or null when nothing sensible can be addressed.
 *
 * Null rather than a search URL: an address that lands somewhere unrelated is worse than
 * no link, because the reader assumes what they landed on describes their version.
 */
export function wikiUrlFor(version: string): string | null {
    const game = gameVersionOf(version).trim();
    if (game === "") return null;
    const title = isNumberedRelease(game) ? `Java_Edition_${game}` : game;
    // Only characters that appear in real version names reach the address.
    if (!/^[A-Za-z0-9._-]+$/.test(title.replace(/^Java_Edition_/, ""))) return null;
    return `${WIKI_ORIGIN}/w/${encodeURIComponent(title)}`;
}

/**
 * Returns the state that can be proved without pretending a cached link was checked online.
 * The main process may replace the offline state with a real result after a bounded check.
 */
export function wikiArticleStateFor(
    version: string,
    checked: boolean | null = null,
): WikiArticleState {
    const url = wikiUrlFor(version);
    if (url === null) return "unavailable";
    if (checked === true) return "verified";
    if (checked === false) return "unavailable";
    return "offline-unverified";
}

export function wikiArticleStateLabel(state: WikiArticleState): string {
    if (state === "verified") return "Wiki article verified";
    if (state === "unavailable") return "Wiki article unavailable";
    return "Wiki link not checked offline";
}

/**
 * A release date for display, or null when the upstream API published none.
 *
 * Formatted in the viewer's own locale, because a date is read by a person rather than
 * parsed by anything.
 */
export function releaseDateLabel(releasedAt: string | null, locale?: string): string | null {
    if (releasedAt === null || releasedAt.trim() === "") return null;
    const when = new Date(releasedAt);
    if (Number.isNaN(when.getTime())) return null;
    return when.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
