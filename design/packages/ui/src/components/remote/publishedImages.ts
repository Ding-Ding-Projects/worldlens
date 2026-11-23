/**
 * Image references CI has published, pinned by digest, offered as the default choice so nobody
 * has to find a digest in a CI summary. Each line names the run it came from; a newer image is
 * fine to choose instead, and the pickers still accept any digest-pinned reference.
 */

/** `hosted-image` job of CI run 45278760421 (commit bde9835, version 1.0.2340), 2026-11-23. */
export const PUBLISHED_HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:ed9d646bf15f8f5ea3cfbf2fe4b568d0e7b18630aa2b631118ed337beee3eb7c";

/** Not published yet: the first `server-site-image` job had not finished when this was written. */
export const PUBLISHED_SERVER_SITE_IMAGE: string | null = null;
