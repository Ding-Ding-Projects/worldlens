/**
 * Kid mode's copy, registered into the shared surface catalogue.
 *
 * The actual strings live in `kid/kidCopy.ts`, beside the feature that reads them, not here -
 * the rail labels, Home's kid-voiced hero line and quiet state, the sticker book, the grown-up
 * gate (both the no-code-set and the locked wordings, plus the toy-lock honesty statement), the
 * celebration copy, and the `kid-mode` settings row. That module already carries the exact
 * shape this file's siblings all carry: `KID_VOICED` is five-level prose in both languages,
 * `KID_FIXED` is one string per language with no level, and `KID_FACTS` names, for every
 * `KID_VOICED` key, the literal substrings a playful rewrite is not allowed to lose.
 *
 * This module is the three-line wiring `copy/surfaces/index.ts`'s own doc comment describes: an
 * import of the three consts, re-exported unchanged under the exact names this file's contract
 * requires, so kid mode's copy becomes a normal member of `SURFACE_VOICED` / `SURFACE_FIXED` /
 * `SURFACE_FACTS` - and, through those, of `APP_VOICED` / `APP_FIXED` / `FACTS` in
 * `appCopy.ts` - the same way every other surface's module is, without moving the strings
 * themselves out of the feature directory that owns them. `kid/kidCopy.ts` is not this file's
 * to edit; if its shape ever stops satisfying the contract, that is a defect to report against
 * that module, not something to patch around here.
 *
 * Kid mode deliberately rewords no destructive, security, accessibility or error string - every
 * kid-voiced sentence sits *beside* those sentences (the toy-lock honesty note next to the real
 * gate copy, the kid-mode settings blurb next to `settings.kidMode.accessibleNote`'s promise
 * that the accessible name never changes), never instead of them. So this module adds no new
 * exemption to `voiceNotFacts.test.ts`'s hand-picked representative list - that test does not
 * enumerate the whole catalogue and was never going to see these keys either way - and the real
 * guarantee for kid's own keys is the one every surface gets for free: `appCopy.ts`'s `FACTS`
 * is declared `satisfies Record<AppVoicedKey, ...>`, so `KID_FACTS` already has to (and does)
 * name a fact for every `KID_VOICED` key before this file can typecheck.
 */
export { KID_FACTS, KID_FIXED, KID_VOICED } from "../../kid/kidCopy.js";
