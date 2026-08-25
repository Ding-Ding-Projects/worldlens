/**
 * The address of the document a person is accepting.
 *
 * Its own module, holding one constant, for a reason that is not tidiness. It used to live in
 * `consent.ts`, which imports Electron's `app` to find its own storage. Anything that wanted
 * the URL therefore pulled Electron in behind it - including the EULA viewer, which needs
 * only the string. That is invisible on a desktop and fatal in a container, where the bundled
 * Electron loader throws on its first line with a message about a failed installation.
 *
 * A constant with no dependencies belongs somewhere with no dependencies. `consent.ts`
 * re-exports it, so nothing that already imports it from there had to change.
 */
export const MOJANG_EULA_URL = "https://account.mojang.com/documents/minecraft_eula";
