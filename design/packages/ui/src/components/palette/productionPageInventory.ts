/** Complete hand-written inventory of the adult App.vue tab pages. */
export const PRODUCTION_APP_PAGE_IDS = [
    "world",
    "projects",
    "cirender",
    "structures",
    "chunker",
    "authenticator",
    "locks",
    "support",
    "browserExtension",
    "renders",
    "servers",
    "mcservers",
    "backups",
    "pages",
    "worldrepo",
    "preview",
    "docs",
    "ollama",
    "remoteHosting",
    "dockerHosting",
    "screenshots",
] as const;

export function assertProductionPageIds(
    ids: readonly string[],
    expected: readonly string[] = PRODUCTION_APP_PAGE_IDS,
): void {
    const actual = new Set(ids);
    for (const id of expected) {
        if (!actual.has(id)) throw new Error(`Production page is missing from palette: ${id}`);
    }
}
