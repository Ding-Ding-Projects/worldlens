/**
 * Image references CI has published, pinned by digest, offered as the default choice so nobody
 * has to find a digest in a CI summary. Each line names the run it came from; a newer image is
 * fine to choose instead, and the pickers still accept any digest-pinned reference.
 */

/** `hosted-image` job of CI run 45350438213 (commit b5313d8, version 1.0.2435), 2026-11-24. */
export const PUBLISHED_HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:00f60380d5428869a9dc63d47757131dce3b9e13cd20c86d201d807671c6df21";

/**
 * `server-site-image` job of CI run 45350438213 (commit b5313d8, version 1.0.2435), 2026-11-24.
 * Checked here before pinning: with the pinned itzg image and the boot script's flags, the
 * signed-in page, commands, the live console and a data pack upload all worked. Earlier
 * images registered the wrong server folder (1.0.2414) or 404ed after sign-in (1.0.2342).
 */
export const PUBLISHED_SERVER_SITE_IMAGE: string | null = "ghcr.io/ding-ding-projects/worldlens-server-site@sha256:b52f6f1e71c8b98131a1a709a9db9ba83776d3b9181764a147fd40fc4556d661";

/**
 * A Minecraft server image to start from: itzg/minecraft-server (Apache-2.0, a community image,
 * not made by WorldLens or Mojang), `latest` as resolved on 2026-11-23. Any other pinned server
 * image that reads EULA and MEMORY and serves on 25565 works the same way.
 */
export const SUGGESTED_SERVER_IMAGE = "docker.io/itzg/minecraft-server@sha256:dc15f05423064860968043de873316dbd0c027a7d9c8354826229d7c20dd4619";
