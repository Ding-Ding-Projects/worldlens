/**
 * The desktop-app banner written into a published map, against a fake `fetch`.
 *
 * The rule worth testing twice is the one this whole file exists to enforce: the banner
 * never offers a download it cannot back with a real, verified asset. `resolveDesktopAppRelease`
 * is the only path a URL reaches the page through, so every case here either gives it a
 * release that genuinely qualifies or checks that it refuses one that almost does.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    DESKTOP_APP_BANNER_MARKER,
    injectDesktopAppBanner,
    renderDesktopAppBanner,
    resolveDesktopAppRelease,
} from "./desktopAppBanner.js";
import type { FetchLike } from "../download/release.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function releaseAsset(name: string, size = 200_000_000): unknown {
    return {
        name,
        size,
        browser_download_url: `https://github.com/Ding-Ding-Projects/worldlens/releases/download/v1.2.3/${name}`,
        url: `https://api.github.com/repos/Ding-Ding-Projects/worldlens/releases/assets/1?name=${name}`,
    };
}

function releasePayload(assets: readonly unknown[]): unknown {
    return {
        tag_name: "v1.2.3",
        name: "v1.2.3",
        html_url: "https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.2.3",
        assets,
    };
}

function fetchAlwaysAnswering(body: unknown, status = 200): FetchLike {
    return () => Promise.resolve(jsonResponse(body, status));
}

describe("resolving this project's own release", () => {
    it("accepts a release carrying a genuine Squirrel installer", async () => {
        const fetchImpl = fetchAlwaysAnswering(
            releasePayload([
                releaseAsset("Worldlens-1.2.3-Setup.exe"),
                releaseAsset("RELEASES", 400),
                releaseAsset("worldlens-1.2.3-full.nupkg", 90_000_000),
            ]),
        );

        const resolution = await resolveDesktopAppRelease(fetchImpl);
        expect(resolution.available).toBe(true);
        if (resolution.available) {
            expect(resolution.version).toBe("1.2.3");
            expect(resolution.installerName).toBe("Worldlens-1.2.3-Setup.exe");
            expect(resolution.installerUrl).toContain("Worldlens-1.2.3-Setup.exe");
        }
    });

    it("refuses a setup executable with no RELEASES manifest or .nupkg beside it", async () => {
        const fetchImpl = fetchAlwaysAnswering(releasePayload([releaseAsset("Worldlens-1.2.3-Setup.exe")]));

        const resolution = await resolveDesktopAppRelease(fetchImpl);
        expect(resolution.available).toBe(false);
        if (!resolution.available) {
            expect(resolution.reason).toContain("RELEASES");
            expect(resolution.releaseUrl).toBe("https://github.com/Ding-Ding-Projects/worldlens/releases");
        }
    });

    it("refuses a setup executable too small to be the real installer", async () => {
        const fetchImpl = fetchAlwaysAnswering(
            releasePayload([
                releaseAsset("Worldlens-1.2.3-Setup.exe", 1_000),
                releaseAsset("RELEASES", 400),
                releaseAsset("worldlens-1.2.3-full.nupkg", 90_000_000),
            ]),
        );

        const resolution = await resolveDesktopAppRelease(fetchImpl);
        expect(resolution.available).toBe(false);
        if (!resolution.available) expect(resolution.reason).toContain("too small");
    });

    it("refuses a release with no asset named like a Squirrel setup at all", async () => {
        const fetchImpl = fetchAlwaysAnswering(releasePayload([releaseAsset("readme.txt", 400)]));

        const resolution = await resolveDesktopAppRelease(fetchImpl);
        expect(resolution.available).toBe(false);
        if (!resolution.available) expect(resolution.reason).toContain("-Setup.exe");
    });

    it("answers unavailable, with a reason, rather than throwing when the request fails", async () => {
        const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse({ message: "Not Found" }, 404));

        const resolution = await resolveDesktopAppRelease(fetchImpl);
        expect(resolution.available).toBe(false);
        if (!resolution.available) expect(resolution.reason).toContain("404");
    });

    it("never guesses at another repository; it always asks about this project's own", async () => {
        let askedFor: string | null = null;
        const fetchImpl: FetchLike = (url) => {
            askedFor = String(url);
            return Promise.resolve(jsonResponse(releasePayload([]), 200));
        };
        await resolveDesktopAppRelease(fetchImpl);
        expect(askedFor).toContain("Ding-Ding-Projects/worldlens/releases/latest");
    });
});

describe("rendering the banner", () => {
    it("names the version, the size, and the unsigned-installer warning when a release is available", () => {
        const html = renderDesktopAppBanner({
            available: true,
            version: "1.2.3",
            releaseUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.2.3",
            installerName: "Worldlens-1.2.3-Setup.exe",
            installerUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases/download/v1.2.3/Worldlens-1.2.3-Setup.exe",
            installerBytes: 150_000_000,
        });

        expect(html).toContain("Worldlens-1.2.3-Setup.exe");
        expect(html).toContain("1.2.3");
        expect(html).toContain("intentionally and permanently unsigned");
        expect(html).toContain("https://github.com/Ding-Ding-Projects/worldlens/releases/download/v1.2.3/Worldlens-1.2.3-Setup.exe");
        expect(html).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    });

    it("links the releases page and states the reason, offering no button, when nothing verified", () => {
        const html = renderDesktopAppBanner({
            available: false,
            releaseUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases",
            reason: "release v1.2.3 has no asset whose name ends in -Setup.exe",
        });

        expect(html).toContain("https://github.com/Ding-Ding-Projects/worldlens/releases");
        expect(html).toContain("no asset whose name ends in -Setup.exe");
        expect(html).not.toContain("Download for Windows");
        expect(html).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
    });
});

describe("writing the banner into the published page", () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "wl-desktop-banner-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    const unavailable = {
        available: false as const,
        releaseUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases",
        reason: "no release found",
    };

    it("inserts the banner right before the closing body tag", async () => {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "index.html"), "<!doctype html><html><body><div id=\"app\"></div></body></html>", "utf8");

        const wrote = await injectDesktopAppBanner(root, unavailable);
        expect(wrote).toBe(true);

        const html = await readFile(join(root, "index.html"), "utf8");
        expect(html.indexOf(DESKTOP_APP_BANNER_MARKER)).toBeLessThan(html.indexOf("</body>"));
        expect(html).toContain("<div id=\"app\"></div>");
    });

    it("appends the banner when the page has no closing body tag", async () => {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "index.html"), "<!doctype html>", "utf8");

        const wrote = await injectDesktopAppBanner(root, unavailable);
        expect(wrote).toBe(true);

        const html = await readFile(join(root, "index.html"), "utf8");
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain(DESKTOP_APP_BANNER_MARKER);
    });

    it("never writes a second copy into a page that already carries the marker", async () => {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "index.html"), "<!doctype html><body></body>", "utf8");

        expect(await injectDesktopAppBanner(root, unavailable)).toBe(true);
        expect(await injectDesktopAppBanner(root, unavailable)).toBe(false);

        const html = await readFile(join(root, "index.html"), "utf8");
        expect(html.split(DESKTOP_APP_BANNER_MARKER).length - 1).toBe(1);
    });
});
