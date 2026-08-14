/**
 * Naming the desktop application on a map this application publishes.
 *
 * ## The gap this closes
 *
 * A published map is a bare BlueMap viewer. Somebody who is handed the link sees a world
 * they can fly around and nothing that says what made it, so the thing that could give
 * them the exact same viewer for their own worlds is invisible to the one audience most
 * likely to want it. This module writes a small, clearly labelled section into the
 * published page naming the application and, when a real installer exists, linking to it.
 *
 * ## Absent rather than wrong
 *
 * The install link is never typed by hand and never guessed from a version number. It
 * comes from asking GitHub for this project's own newest published release and checking
 * that a genuine Squirrel.Windows installer is attached to it - the same three files
 * (`*-Setup.exe`, `RELEASES`, a `.nupkg`) the site's own `fetch-release.mjs` requires,
 * because a `-Setup.exe` on its own could be an unrelated file somebody uploaded to a
 * release for another reason. When that check fails for any reason, the banner still
 * renders, but without a button: it links the releases page and says plainly that no
 * verified installer was found. Nothing here fabricates a URL to make the section look
 * complete.
 *
 * ## Unsigned, and said so before the click
 *
 * This project permanently ships unsigned Windows installers. A download button that
 * hands somebody an unsigned `.exe` with no warning is a button that looks like a scam
 * the moment Windows objects to it, so the banner states the installer is unsigned and
 * that the operating system will show an unknown-publisher warning before the button is
 * ever reached.
 *
 * ## Self-contained
 *
 * The banner is inline HTML and inline CSS written straight into the published page. No
 * CDN script, no remote font, no analytics and no tracking pixel - matching the rest of
 * what `prepareStaticHost` already ships into a published map.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchRelease, ReleaseRequestError } from "../download/release.js";
import type { FetchLike, ReleaseAsset, ReleaseInfo } from "../download/release.js";

/** Where the desktop application's own releases are published. Never the map's own repository. */
export const DESKTOP_APP_OWNER = "Ding-Ding-Projects";
export const DESKTOP_APP_REPO = "worldlens";

/** The marker HTML comment guarding against writing the banner into a page twice. */
export const DESKTOP_APP_BANNER_MARKER = "<!-- worldlens-desktop-app-banner -->";

/** Below this, whatever matched `*-Setup.exe` is a stub or an unrelated file, not the installer. */
const MIN_INSTALLER_BYTES = 10 * 1024 * 1024;

const SETUP_ASSET = /-setup\.exe$/i;
const RELEASES_MANIFEST = "RELEASES";
const NUPKG_ASSET = /\.nupkg$/i;

/** A verified installer, ready to be linked, or the reason none could be verified. */
export type DesktopAppResolution =
    | {
          readonly available: true;
          readonly version: string;
          readonly releaseUrl: string;
          readonly installerName: string;
          readonly installerUrl: string;
          readonly installerBytes: number;
      }
    | {
          readonly available: false;
          readonly releaseUrl: string;
          readonly reason: string;
      };

function releasePageUrl(owner: string, repo: string): string {
    return `https://github.com/${owner}/${repo}/releases`;
}

/** The version inside a tag such as `v0.1.0` or `v0.1.0-build.37`. */
function versionFromTag(tag: string): string {
    const match = /^v?(\d+\.\d+\.\d+)/.exec(tag);
    return match !== null ? (match[1] as string) : tag;
}

/**
 * Picks the one asset that is genuinely the Squirrel installer, or says why none qualifies.
 *
 * Mirrors `design/packages/site/scripts/fetch-release.mjs`'s `findInstaller`, on purpose:
 * the site's download button and this banner are answering the same question about the
 * same releases, and a map published from one machine should never claim an installer
 * exists when the site itself would have refused to offer it.
 */
function findInstaller(release: ReleaseInfo): { readonly asset: ReleaseAsset } | { readonly reason: string } {
    const candidates = release.assets.filter((asset) => SETUP_ASSET.test(asset.name));
    if (candidates.length === 0) {
        return { reason: `release ${release.tag} has no asset whose name ends in -Setup.exe` };
    }
    if (candidates.length > 1) {
        return {
            reason: `release ${release.tag} has more than one installer candidate (${candidates
                .map((asset) => asset.name)
                .join(", ")})`,
        };
    }

    const installer = candidates[0] as ReleaseAsset;
    if (installer.size < MIN_INSTALLER_BYTES) {
        return { reason: `${installer.name} is only ${String(installer.size)} bytes, too small to be the installer` };
    }

    const hasManifest = release.assets.some((asset) => asset.name === RELEASES_MANIFEST);
    const hasPackage = release.assets.some((asset) => NUPKG_ASSET.test(asset.name));
    if (!hasManifest || !hasPackage) {
        return { reason: `release ${release.tag} is missing the Squirrel ${RELEASES_MANIFEST} manifest or a .nupkg package` };
    }

    return { asset: installer };
}

/**
 * Asks GitHub for this project's own newest published release and verifies its installer.
 *
 * Uses `fetchRelease` with no tag, which asks for `latest` - GitHub's own definition of
 * the newest release that is neither a draft nor a prerelease. Any failure, from a network
 * problem to a release that exists but carries no verifiable installer, comes back as an
 * `available: false` resolution rather than an exception, because a map's publish must
 * never fail over whether this project has shipped an installer lately.
 */
export async function resolveDesktopAppRelease(
    fetchImpl: FetchLike,
    owner: string = DESKTOP_APP_OWNER,
    repo: string = DESKTOP_APP_REPO,
): Promise<DesktopAppResolution> {
    const fallback = releasePageUrl(owner, repo);
    try {
        const release = await fetchRelease(owner, repo, undefined, { fetch: fetchImpl });
        const found = findInstaller(release);
        if ("reason" in found) return { available: false, releaseUrl: fallback, reason: found.reason };
        return {
            available: true,
            version: versionFromTag(release.tag),
            releaseUrl: release.htmlUrl,
            installerName: found.asset.name,
            installerUrl: found.asset.downloadUrl,
            installerBytes: found.asset.size,
        };
    } catch (error) {
        const reason =
            error instanceof ReleaseRequestError
                ? `GitHub answered ${String(error.status)} for ${owner}/${repo}`
                : error instanceof Error
                  ? error.message
                  : "the release could not be read";
        return { available: false, releaseUrl: fallback, reason };
    }
}

function bytesAsText(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
    const units = ["KiB", "MiB", "GiB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index] ?? "KiB"}`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/**
 * Renders the banner section, self-contained down to its own inline CSS.
 *
 * Fixed to the bottom of the viewport rather than inserted into the page flow, because
 * this page's body is BlueMap's own viewer canvas: anything that reflows it risks
 * breaking layout this module has no business touching. `available: false` still names
 * the application and still links somewhere real - the releases page - so a reader who
 * arrives while a release happens to be between builds is never shown a dead end.
 */
export function renderDesktopAppBanner(resolution: DesktopAppResolution): string {
    const unsignedNotice =
        "Worldlens for Windows is intentionally and permanently unsigned. Windows will show an " +
        "unknown-publisher warning before it runs; that warning is expected and does not mean the " +
        "file is unsafe.";

    const action = resolution.available
        ? `<a class="wl-banner-download" href="${escapeHtml(resolution.installerUrl)}" rel="noopener noreferrer" aria-label="Download Worldlens ${escapeHtml(resolution.version)} for Windows, ${escapeHtml(bytesAsText(resolution.installerBytes))}, unsigned installer">Download for Windows &middot; ${escapeHtml(resolution.version)}</a>
      <p class="wl-banner-detail">${escapeHtml(resolution.installerName)} &middot; ${escapeHtml(bytesAsText(resolution.installerBytes))}</p>`
        : `<a class="wl-banner-download wl-banner-download--secondary" href="${escapeHtml(resolution.releaseUrl)}" rel="noopener noreferrer">Open the releases page</a>
      <p class="wl-banner-detail">No verified installer was found for this build of the page, so nothing here guesses a download URL. Reason: ${escapeHtml(resolution.reason)}</p>`;

    return `${DESKTOP_APP_BANNER_MARKER}
<aside class="wl-desktop-app-banner" role="complementary" aria-label="About the desktop application that made this map">
  <style>
    .wl-desktop-app-banner {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483000;
      max-width: 320px;
      padding: 12px 14px;
      border-radius: 10px;
      background: #12161c;
      color: #e8ecf1;
      border: 1px solid #2c3542;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      font: 13px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .wl-desktop-app-banner h2 {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #9fd0ff;
    }
    .wl-desktop-app-banner p { margin: 4px 0; }
    .wl-desktop-app-banner .wl-banner-caveat { font-size: 11px; color: #a9b3c1; }
    .wl-banner-download {
      display: inline-block;
      margin-top: 6px;
      padding: 8px 12px;
      border-radius: 6px;
      background: #4c8bf5;
      color: #0b0d10;
      font-weight: 700;
      text-decoration: none;
    }
    .wl-banner-download--secondary { background: #2c3542; color: #e8ecf1; }
    .wl-banner-detail { font-size: 11px; color: #a9b3c1; }
  </style>
  <h2>Made with Worldlens</h2>
  <p>This map was rendered and published by <strong>Worldlens</strong>, a free desktop application that turns a Minecraft world into a BlueMap you can host yourself.</p>
  ${action}
  <p class="wl-banner-caveat">${escapeHtml(unsignedNotice)}</p>
</aside>
`;
}

/**
 * Writes the banner into the published page's `index.html`, once.
 *
 * Inserted just before `</body>` so it sits over the finished viewer rather than inside
 * whatever BlueMap renders into the page body. A page with no closing body tag - which
 * only happens for a hand-written fixture in a test - gets the banner appended instead,
 * because refusing to publish over a detail this module does not actually depend on would
 * be the wrong kind of caution. Already carrying the marker means an earlier publish of
 * the same render already wrote it, so this is a no-op rather than a second copy.
 */
export async function injectDesktopAppBanner(webRoot: string, resolution: DesktopAppResolution): Promise<boolean> {
    const indexPath = join(webRoot, "index.html");
    const html = await readFile(indexPath, "utf8");
    if (html.includes(DESKTOP_APP_BANNER_MARKER)) return false;

    const banner = renderDesktopAppBanner(resolution);
    const closingBody = /<\/body>/i.exec(html);
    const next =
        closingBody !== null
            ? `${html.slice(0, closingBody.index)}${banner}${html.slice(closingBody.index)}`
            : `${html}\n${banner}`;

    await writeFile(indexPath, next, "utf8");
    return true;
}
