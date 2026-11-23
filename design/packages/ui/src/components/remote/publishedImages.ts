/**
 * Image references CI has published, pinned by digest, offered as the default choice so nobody
 * has to find a digest in a CI summary. Each line names the run it came from; a newer image is
 * fine to choose instead, and the pickers still accept any digest-pinned reference.
 */

/** `hosted-image` job of CI run 45278760421 (commit bde9835, version 1.0.2340), 2026-11-23. */
export const PUBLISHED_HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:ed9d646bf15f8f5ea3cfbf2fe4b568d0e7b18630aa2b631118ed337beee3eb7c";

/** `server-site-image` job of CI run 45280184307 (commit 6aade1a, version 1.0.2342), 2026-11-23. */
export const PUBLISHED_SERVER_SITE_IMAGE: string | null = "ghcr.io/ding-ding-projects/worldlens-server-site@sha256:090b05ea87f124db6ea6d7eef17e3ed0004d3b79585374444104f27108fecbfd";

/**
 * A Minecraft server image to start from: itzg/minecraft-server (Apache-2.0, a community image,
 * not made by WorldLens or Mojang), `latest` as resolved on 2026-11-23. Any other pinned server
 * image that reads EULA and MEMORY and serves on 25565 works the same way.
 */
export const SUGGESTED_SERVER_IMAGE = "docker.io/itzg/minecraft-server@sha256:dc15f05423064860968043de873316dbd0c027a7d9c8354826229d7c20dd4619";
