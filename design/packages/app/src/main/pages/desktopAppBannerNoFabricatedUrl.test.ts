/**
 * A dedicated guard that the desktop-app banner never renders a download button pointing
 * at a guessed installer URL.
 *
 * `renderDesktopAppBanner` and `resolveDesktopAppRelease` already have their own
 * behavioural coverage in `desktopAppBanner.test.ts`. This file exists for one narrower
 * claim, phrased so it cannot be satisfied by accident: when no release resolution has
 * been verified as carrying a real installer, the rendered markup contains no
 * `installerUrl`-shaped download link at all - only the honest fallback link to the
 * releases page. A regression here would mean somebody constructed a URL from a tag name,
 * a version guess, or any other unverified string and rendered it as if it were a real,
 * checked download - exactly the failure this banner exists to refuse.
 */

import { describe, expect, it } from "vitest";
import { DESKTOP_APP_OWNER, DESKTOP_APP_REPO, renderDesktopAppBanner } from "./desktopAppBanner.js";
import type { DesktopAppResolution } from "./desktopAppBanner.js";

const RELEASES_PAGE = `https://github.com/${DESKTOP_APP_OWNER}/${DESKTOP_APP_REPO}/releases`;

/** Every `href="..."` attribute value found in the rendered markup, in order. */
function hrefs(html: string): string[] {
    return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

describe("renderDesktopAppBanner never fabricates a download URL", () => {
    it("with no verified installer, links only the real releases page and no other URL", () => {
        const resolution: DesktopAppResolution = {
            available: false,
            releaseUrl: RELEASES_PAGE,
            reason: "release v0.4.0 has no asset whose name ends in -Setup.exe",
        };
        const html = renderDesktopAppBanner(resolution);
        const found = hrefs(html);

        expect(found).toEqual([RELEASES_PAGE]);
        // No download-styled control appears at all - the honest state renders a
        // secondary link, never anything carrying the download button's own class.
        expect(html).not.toContain('class="wl-banner-download"');
        // The unverified reason is stated in the markup, not hidden or replaced by a
        // guess at what the installer would have been called.
        expect(html).toContain(resolution.reason);
    });

    it("with a verified installer, the button href is exactly the checked asset URL, byte for byte", () => {
        const resolution: DesktopAppResolution = {
            available: true,
            version: "0.4.0",
            releaseUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v0.4.0",
            installerName: "Worldlens-0.4.0-Setup.exe",
            installerUrl:
                "https://github.com/Ding-Ding-Projects/worldlens/releases/download/v0.4.0/Worldlens-0.4.0-Setup.exe",
            installerBytes: 87_654_321,
        };
        const html = renderDesktopAppBanner(resolution);
        const found = hrefs(html);

        // Exactly one link, and it is the verified asset URL this resolution actually
        // carried - never a URL assembled from the tag, the version, or the repo alone.
        expect(found).toEqual([resolution.installerUrl]);
        expect(html).toContain('class="wl-banner-download"');
    });

    it("never assembles a download URL from the tag, version, owner, or repo by string concatenation", () => {
        // A fabricated-URL regression is most likely to look like a plausible-seeming
        // template such as `.../releases/download/v${version}/...-Setup.exe` built from
        // pieces the resolver did not itself verify. Guard the unavailable branch's
        // rendering against ever containing that template shape, regardless of what a
        // future edit might name it.
        const resolution: DesktopAppResolution = {
            available: false,
            releaseUrl: RELEASES_PAGE,
            reason: "the release could not be read",
        };
        const html = renderDesktopAppBanner(resolution);
        expect(html).not.toMatch(/releases\/download\//);
        expect(html).not.toContain("-Setup.exe");
    });
});
