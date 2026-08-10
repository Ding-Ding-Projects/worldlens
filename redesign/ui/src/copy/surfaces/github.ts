/**
 * The GitHub account screen: the status row, the device-flow panel, the personal access
 * token form, and the sign-out confirmation.
 *
 * One module per surface, spread into `appCopy.ts`. The split is not cosmetic: the
 * catalogue is the one file in this package that several people edit at once, and a single
 * two-thousand-entry object literal makes every one of those edits touch the same hunk.
 *
 * ## What is deliberately *not* here
 *
 * `settings.github.title` and `settings.github.tokenScopes` are written directly in
 * `appCopy.ts`, and `settings.github.description`, `.whatFor`, `.signedOut` and
 * `.unsupported` belong to `surfaces/settings.ts`, which is the screen that introduces this
 * one. They are all `settings.github.*` and none of them belongs here; an entry here would
 * be shadowed anyway, because `appCopy.ts` spreads the surface modules before its own
 * entries.
 *
 * ## The one rule this surface adds
 *
 * Every string here is within reach of a credential, so none of them ever quotes one. No
 * level says how long a token is, what it starts with, or what was typed: a refusal names
 * what was wrong with the token (unknown to GitHub, missing a permission) and stops there,
 * so nothing that could reach a screenshot, a notice or a bug report carries a secret. The
 * device code is the one value shown on purpose, because it is a short-lived pairing string
 * that is worthless without the account holder approving it in their own browser.
 *
 * Two distinctions carry real consequences and are pinned as facts at every level:
 *
 *  - **revoked versus deleted.** `settings.github.revoked` is GitHub confirming the token
 *    is dead everywhere. `settings.github.notRevoked` is the token being gone from this
 *    computer with no such confirmation, so the grant may still be listed on the account.
 *    Rounding the second up to the first tells somebody they are safe when they are not.
 *  - **signed in versus signed in without a scope.** `settings.github.missingScopes` and
 *    `settings.github.tokenMissingScopes` both name the exact scope strings, because
 *    "something went wrong with permissions" is not something anybody can act on.
 *
 * Scope names, account names and GitHub's own error text stay identical in both languages
 * for the same reason a filename does: a translated `read:org` sends the reader looking for
 * a permission that does not exist.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const GITHUB_VOICED = {
    /* ---------------------------------------------------------------- */
    /* Where the sign-in is kept, and for how long                       */
    /* ---------------------------------------------------------------- */

    /*
     * The same fact from two places: the row that offers a sign-in warns before, and the
     * row that reports one warns after. Both say the sign-in ends when the app closes,
     * because a session that silently evaporates overnight reads as the app forgetting
     * things at random rather than as this machine having nowhere to keep it.
     */

    /* ---------------------------------------------------------------- */
    /* Signing out: what GitHub confirmed, and what it did not           */
    /* ---------------------------------------------------------------- */

    /*
     * These two are the reason this module has a header comment. They differ by exactly one
     * thing, and it is the thing that matters: whether GitHub confirmed the revocation.
     * `revoked` may say the token works nowhere; `notRevoked` may not, and every level of it
     * keeps "may still be listed on your account" so the reader knows there is somewhere
     * else to look.
     */
    /*
     * The body of the sign-out confirmation, so it is the one text a reader is deciding
     * against. It carries four facts at every level: the token is deleted from this
     * computer, GitHub is asked to revoke it, it stops working everywhere rather than only
     * here, and nothing already rendered or downloaded is touched.
     */

    /* ---------------------------------------------------------------- */
    /* The device flow                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * The explanation somebody reads before deciding to trust this. Both security clauses
     * survive level 5 word for word: no password is typed into this app, and the token it
     * receives stays in the app.
     */
    /*
     * A sign-in started before this screen opened. Its code was handed out somewhere this
     * panel cannot see, so it genuinely cannot be shown, which every level says outright
     * rather than leaving a blank space where a code should be.
     */
    /*
     * A failed copy is not a failed sign-in, and the code has not been lost with it. Every
     * level points back at the screen, because the alternative is a reader asking for a new
     * code they do not need.
     */

    /* ---------------------------------------------------------------- */
    /* The four ways a sign-in ends without signing anybody in           */
    /* ---------------------------------------------------------------- */

    /*
     * Refused, expired, cancelled and simply unfinished are four different things and the
     * reader's next move differs for each. None of them may borrow another's wording: an
     * expired code needs a new code, a refusal needs a different answer on GitHub, and a
     * cancellation needs nothing at all.
     */
    /*
     * The one that reports nothing about *why*, because the panel does not know. It says
     * only that the flow did not finish, and no level may improve on that by guessing at a
     * cause the app never learned.
     */

    /* ---------------------------------------------------------------- */
    /* Signed in, but not with enough                                    */
    /* ---------------------------------------------------------------- */

    /*
     * Two keys, two routes in, one fact: the account is signed in and the app still cannot
     * do its job, because `{scopes}` are missing. The scope strings are GitHub's own and
     * stay identical in both languages, since a translated `read:org` is a permission
     * nobody can go and grant.
     */

    /* ---------------------------------------------------------------- */
    /* The status row's two footnotes                                    */
    /* ---------------------------------------------------------------- */

    /*
     * An empty permissions list means two opposite things depending on the token, so this
     * one exists to say which: silence from the token, not an absence of grants. Reading it
     * as "no permissions" sends somebody off to re-issue a token that was fine.
     */
    /* Sits directly after the expiry date, which is why it stays a parenthesis. */

} as const satisfies Record<string, VoicedString>;

export const GITHUB_FIXED = {
    /* The account row's own actions. */

    /* The device flow, in the order the panel walks through it. */
    /*
     * `{spelled}` is the device code with its characters separated, so a screen reader says
     * it letter by letter instead of trying to pronounce it as a word. Never shorten this
     * label to the point where the code stops being in it.
     */

    /*
     * How the app got its token. These three are GitHub's own names for three different
     * things, and the difference decides whether a scope list exists at all, so they are
     * kept as names rather than translated into a description of each.
     */

    /* The status row's field names. */
    /* An empty grant, as distinct from a token that reports no list. See the voiced key. */

    /*
     * Signing out, and the confirmation it opens. There is no "stay signed in" key here any
     * more: the confirmation used to be a bespoke inline yes/no, and now it is
     * ConfigSuperConfirm, the shared super-confirmation gate, whose Emergency exit and
     * Escape path are its own component's copy rather than this surface's.
     */

} as const satisfies Record<string, FixedString>;

export const GITHUB_FACTS = {
    // A sign-in that ends with the app is a fact about this machine, not about the account.

    // Confirmed dead everywhere ...
    // ... versus gone from here, with the grant possibly still standing on the account.

    // The code survived the failed copy, so every level says where it still is.

    // Four endings, four different next moves, so none of them may borrow another's words.

    // The scope strings are GitHub's own and are the only actionable part of the sentence.

    // Silence from the token, not an absence of permissions.

} as const satisfies Record<
    keyof typeof GITHUB_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
