/**
 * Image references CI has published, pinned by digest, offered as the default choice so nobody
 * has to find a digest in a CI summary. Each line names the run it came from; a newer image is
 * fine to choose instead, and the pickers still accept any digest-pinned reference.
 */

/** `hosted-image` job of CI run 45342848152 (commit e1bb8a4, version 1.0.2414), 2026-11-24. */
export const PUBLISHED_HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:ac80725fbdcf993c7205ff99058bbab354cb32ef6e974b93cae166faef7f0097";

/**
 * `server-site-image` job of CI run 45342848152 (commit e1bb8a4, version 1.0.2414), 2026-11-24.
 * The first image with the signed-in management page; the one before it (1.0.2342) answered
 * 404 after sign-in.
 */
export const PUBLISHED_SERVER_SITE_IMAGE: string | null = "ghcr.io/ding-ding-projects/worldlens-server-site@sha256:74eca0fd5a8a0b2f507a8fd7b732ad1867be4ee76b701bf2541eaa63316ed477";

/**
 * A Minecraft server image to start from: itzg/minecraft-server (Apache-2.0, a community image,
 * not made by WorldLens or Mojang), `latest` as resolved on 2026-11-23. Any other pinned server
 * image that reads EULA and MEMORY and serves on 25565 works the same way.
 */
export const SUGGESTED_SERVER_IMAGE = "docker.io/itzg/minecraft-server@sha256:dc15f05423064860968043de873316dbd0c027a7d9c8354826229d7c20dd4619";
