/**
 * Image references CI has published, pinned by digest, offered as the default choice so nobody
 * has to find a digest in a CI summary. Each line names the run it came from; a newer image is
 * fine to choose instead, and the pickers still accept any digest-pinned reference.
 */

/** `hosted-image` job of CI run 45351724377 (commit 784d2e2, version 1.0.2439), 2026-11-24. */
export const PUBLISHED_HOSTED_IMAGE =
    "ghcr.io/ding-ding-projects/worldlens-hosted@sha256:a24d49d3a7d55b60848f49094b3ccdce6fe07262a1d55c84fe4e3f76e314b773";

/**
 * `server-site-image` job of CI run 45351724377 (commit 784d2e2, version 1.0.2439), 2026-11-24.
 * Checked here before pinning against a real vanilla 26.3 server in the pinned itzg image with
 * the boot script's flags: the signed-in page, commands, a live console line, and (with
 * 1.0.2435, same paths) a data pack uploaded, enabled and its function run. Earlier images
 * dropped live console lines (1.0.2435), used the wrong server folder (1.0.2414) or 404ed
 * after sign-in (1.0.2342).
 */
export const PUBLISHED_SERVER_SITE_IMAGE: string | null = "ghcr.io/ding-ding-projects/worldlens-server-site@sha256:8d4077568f5f847c0c9d73c186e1032de47a4362395b383044fcd9d18f01330f";

/**
 * A Minecraft server image to start from: itzg/minecraft-server (Apache-2.0, a community image,
 * not made by WorldLens or Mojang), `latest` as resolved on 2026-11-23. Any other pinned server
 * image that reads EULA and MEMORY and serves on 25565 works the same way.
 */
export const SUGGESTED_SERVER_IMAGE = "docker.io/itzg/minecraft-server@sha256:dc15f05423064860968043de873316dbd0c027a7d9c8354826229d7c20dd4619";
