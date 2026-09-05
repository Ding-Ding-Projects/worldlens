/**
 * Finding Chunker, and being honest when it is not there.
 *
 * Every probe is injected, so none of this touches a disk or a network and none of it
 * needs Chunker installed. "Chunker is absent" is the state this suite cares about most,
 * because it is the state of every machine that has never converted a world and the one
 * the app has to describe well.
 */

import { describe, expect, it } from "vitest";
import {
    CHUNKER_JAR_ENV,
    PINNED_CHUNKER,
    bundledChunkerJarPath,
    chunkerJarPath,
    findChunker,
    pinnedRelease,
    versionFromJarName,
} from "./chunker.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A probe that says yes to exactly these paths. */
function probeFor(...present: string[]): (path: string) => Promise<boolean> {
    const set = new Set(present);
    return async (path) => set.has(path);
}

const none = async (): Promise<boolean> => false;

/** A digest probe that always answers with the pinned hash, i.e. an intact bundled jar. */
const goodDigest = async (): Promise<string> => PINNED_CHUNKER.sha256;

/**
 * The bundled copy, which is the whole reason this file changed.
 *
 * v1.0.2026's installer contained `resources/bundled/chunker/chunker-cli-1.19.1.jar` -
 * 31,790,149 bytes, the exact pinned asset - and `findChunker` had no option that could
 * name that directory, so every packaged build reported the converter as absent. These
 * tests are the ones that would have gone red on the shipped code.
 */
describe("the Chunker that ships inside the installer", () => {
    const resources = "/app/resources";
    const bundled = bundledChunkerJarPath(resources);

    it("finds it, and reports where it came from", async () => {
        const lookup = await findChunker({
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: probeFor(bundled),
            digest: goodDigest,
        });

        expect(lookup.found).toBe(true);
        if (!lookup.found) throw new Error("unreachable");
        expect(lookup.source).toBe("bundled");
        expect(lookup.jarPath).toBe(bundled);
        expect(lookup.version).toBe(PINNED_CHUNKER.version);
    });

    it("is preferred over a copy an earlier version downloaded", async () => {
        const downloaded = chunkerJarPath("/data");
        const lookup = await findChunker({
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: probeFor(bundled, downloaded),
            digest: goodDigest,
        });

        expect(lookup.found).toBe(true);
        if (!lookup.found) throw new Error("unreachable");
        expect(lookup.source).toBe("bundled");
    });

    it("yields to a jar the person configured, and says which one is running", async () => {
        // Explicit beats implicit. Somebody who names a converter in settings means it, and
        // quietly running a different one is how an afternoon disappears.
        const lookup = await findChunker({
            configuredJar: "/mine/chunker-cli-1.20.0.jar",
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: probeFor(bundled, "/mine/chunker-cli-1.20.0.jar"),
            digest: goodDigest,
        });

        expect(lookup.found).toBe(true);
        if (!lookup.found) throw new Error("unreachable");
        expect(lookup.source).toBe("configured");
    });

    it("refuses a bundled jar whose bytes are not the bytes this release pinned", async () => {
        const lookup = await findChunker({
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: probeFor(bundled),
            digest: async () => "0".repeat(64),
        });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.reason).toContain("integrity check");
        expect(lookup.reason).toContain("has not been run");
        // Falling through to the downloader would be worse than refusing: it would run a
        // converter nobody verified on somebody's only copy of a world.
        expect(lookup.remedy).toBe("configure");
    });

    it("falls back to the downloaded copy when nothing is staged, as a checkout does", async () => {
        const downloaded = chunkerJarPath("/data");
        const lookup = await findChunker({
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: probeFor(downloaded),
            digest: goodDigest,
        });

        expect(lookup.found).toBe(true);
        if (!lookup.found) throw new Error("unreachable");
        expect(lookup.source).toBe("downloaded");
        expect(lookup.jarPath).toBe(downloaded);
    });

    it("names the bundled path among the places it looked when nothing is found", async () => {
        // So the refusal is checkable rather than a shrug: the one directory that matters on
        // a packaged build is the one a bug report needs to see in the message.
        const lookup = await findChunker({
            dataDir: "/data",
            resourcesPath: resources,
            env: {},
            probe: none,
            digest: goodDigest,
        });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.searched).toContain(bundled);
    });
});

describe("the pinned Chunker and the committed bundle manifest", () => {
    it("agree, so the packaged assertion and the resolver check the same jar", () => {
        const manifest = JSON.parse(
            readFileSync(
                fileURLToPath(new URL("../../../bundled-runtimes.manifest.json", import.meta.url)),
                "utf8",
            ),
        ) as { chunker: { version: string; asset: string; sha256: string; sizeBytes: number; url: string } };

        expect(manifest.chunker.version).toBe(PINNED_CHUNKER.version);
        expect(manifest.chunker.asset).toBe(PINNED_CHUNKER.asset);
        expect(manifest.chunker.sha256).toBe(PINNED_CHUNKER.sha256);
        expect(manifest.chunker.sizeBytes).toBe(PINNED_CHUNKER.sizeBytes);
        expect(manifest.chunker.url).toBe(PINNED_CHUNKER.url);
    });
});

describe("when Chunker is not installed", () => {
    it("says so honestly, names what it is, and offers to fetch it", async () => {
        const lookup = await findChunker({ dataDir: "/data", env: {}, probe: none });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");

        // The message has to carry three facts: the app normally ships this, this build
        // has not got it, and the app itself can fetch the same pinned jar. It must not
        // say the app does not bundle Chunker - it does, and saying otherwise is what
        // v1.0.2026 told every user while carrying the jar in its own installer.
        expect(lookup.reason).toContain("normally ships inside this app");
        expect(lookup.reason).toContain("no copy of it on disk");
        expect(lookup.reason).toContain("Hive Games");
        expect(lookup.reason).toContain("digest-verified");
        expect(lookup.reason).not.toContain("does not bundle");
        expect(lookup.remedy).toBe("download");

        // And it names where it looked, so the message is checkable rather than a shrug.
        expect(lookup.searched).toContain(chunkerJarPath("/data"));
    });

    it("does not reject - a machine without Chunker is ordinary, not exceptional", async () => {
        // If this ever throws, every caller has to wrap a perfectly normal screen in a
        // try/catch to render it.
        await expect(findChunker({ probe: none, env: {} })).resolves.toMatchObject({
            found: false,
        });
    });

    it("still answers when there is nowhere to keep a downloaded copy", async () => {
        const lookup = await findChunker({ dataDir: null, env: {}, probe: none });
        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.searched).toEqual([]);
    });
});

describe("finding an installed Chunker", () => {
    it("uses a copy the app downloaded", async () => {
        const jar = chunkerJarPath("/data");
        const lookup = await findChunker({ dataDir: "/data", env: {}, probe: probeFor(jar) });

        expect(lookup).toMatchObject({
            found: true,
            source: "downloaded",
            jarPath: jar,
            version: PINNED_CHUNKER.version,
        });
    });

    it("prefers a configured jar over one the app downloaded", async () => {
        const configured = "/opt/chunker/chunker-cli-1.18.0.jar";
        const lookup = await findChunker({
            dataDir: "/data",
            configuredJar: configured,
            env: {},
            probe: probeFor(configured, chunkerJarPath("/data")),
        });

        expect(lookup).toMatchObject({ found: true, source: "configured", jarPath: configured });
    });

    it("reports a configured jar that is missing instead of quietly using another", async () => {
        // Silently falling back would run a different converter than the one that was
        // named, which is how somebody spends an afternoon wondering why a setting does
        // nothing.
        const lookup = await findChunker({
            dataDir: "/data",
            configuredJar: "/opt/gone.jar",
            env: {},
            probe: probeFor(chunkerJarPath("/data")),
        });

        expect(lookup.found).toBe(false);
        if (lookup.found) throw new Error("unreachable");
        expect(lookup.reason).toContain("/opt/gone.jar");
        expect(lookup.remedy).toBe("configure");
    });

    it("honours the environment variable, and reports it by name when it is wrong", async () => {
        const good = await findChunker({
            env: { [CHUNKER_JAR_ENV]: "/ci/chunker-cli-1.19.1.jar" },
            probe: probeFor("/ci/chunker-cli-1.19.1.jar"),
        });
        expect(good).toMatchObject({ found: true, source: "environment" });

        const bad = await findChunker({
            env: { [CHUNKER_JAR_ENV]: "/ci/missing.jar" },
            probe: none,
        });
        expect(bad.found).toBe(false);
        if (bad.found) throw new Error("unreachable");
        expect(bad.reason).toContain(CHUNKER_JAR_ENV);
    });
});

describe("reading a version from a jar name", () => {
    it("reads the version the app's own downloads carry", () => {
        expect(versionFromJarName("/x/chunker-cli-1.19.1.jar")).toBe("1.19.1");
        expect(versionFromJarName("C:\\x\\chunker-cli-1.20.0.jar")).toBe("1.20.0");
    });

    it("answers null rather than guessing at a name that says nothing", () => {
        // A jar somebody renamed is a jar whose version is unknown. Inventing one would put
        // a wrong version into a provenance record, which is worse than an empty field.
        expect(versionFromJarName("/x/chunker.jar")).toBeNull();
        expect(versionFromJarName("/x/converter.jar")).toBeNull();
    });
});

describe("the release the app would fetch", () => {
    it("is pinned in source, and says plainly what the digest does and does not prove", () => {
        const release = pinnedRelease();

        expect(release.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(release.digestTrust).toBe("pinned");
        expect(release.url.startsWith("https://")).toBe(true);

        // The honesty requirement, asserted rather than trusted to stay in the prose: the
        // note must not imply a publisher signature, because there is not one.
        expect(release.verificationNote).toContain("do not publish a signature");
    });
});
