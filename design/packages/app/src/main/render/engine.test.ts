/**
 * Pinning the production default: `upstreamJavaEngine` is the `resolveEngine` the app
 * wires into local and remote rendering, and it must keep resolving to the Java engine.
 *
 * D17 keeps the Java renderer as the standing default (amended 2026-08-05, after the
 * Phase D parity gate closed): the TypeScript mesher becomes the default only through a
 * later, separately verified switch decision, not by drift. If a future change swaps
 * this resolver for one that returns `engine: "typescript"`, this test is the one that
 * has to be edited on purpose - a silent flip elsewhere in the wiring will not.
 *
 * `ensureJava` and `resolveCliJar` are mocked so the test proves what the resolver
 * *returns* without needing a real JDK or a built jar on the machine running it.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import type { BlueMapJar } from "../java/jars.js";
import type { EnsureJavaResult } from "../java/index.js";

const javaModule = vi.hoisted(() => ({
    resolveCliJar: vi.fn(),
    ensureJava: vi.fn(),
}));

vi.mock("../java/index.js", () => ({
    resolveCliJar: javaModule.resolveCliJar,
    ensureJava: javaModule.ensureJava,
    NoUsableJavaError: class NoUsableJavaError extends Error {},
}));

const installModule = vi.hoisted(() => ({ installCliJar: vi.fn() }));
vi.mock("../java/installCliJar.js", () => ({ installCliJar: installModule.installCliJar }));

import { upstreamJavaEngine } from "./engine.js";

const JAR: BlueMapJar = {
    implementation: "cli",
    path: "/jars/cli-5.22-27-shadow.jar",
    version: "5.22-27",
    source: "bundled",
};

const JAVA: EnsureJavaResult = {
    installation: {
        source: "PATH",
        executable: "/jdk/bin/java",
        home: "/jdk",
        version: { feature: 25, version: "25.0.3", runtime: "OpenJDK Runtime Environment Temurin-25.0.3+9" },
    },
    provisioned: false,
    record: null,
    rejected: [],
};

describe("upstreamJavaEngine", () => {
    it("resolves to the Java engine, pinning it as the standing default (D17, amended 2026-08-05)", async () => {
        javaModule.resolveCliJar.mockReturnValue(JAR);
        javaModule.ensureJava.mockResolvedValue(JAVA);

        const resolveEngine = upstreamJavaEngine({ dataDir: "/data" });
        const resolved = await resolveEngine();

        // The literal that matters: not "typescript", and not anything else the union
        // might one day grow. A future engine switch has to change this assertion by
        // name, on purpose, rather than happen as a side effect of touching the wiring.
        expect(resolved.engine).toBe("upstream-java");
        expect(resolved).toEqual({
            engine: "upstream-java",
            engineVersion: "5.22-27",
            launch: "java-cli",
            enginePath: "/jars/cli-5.22-27-shadow.jar",
            javaExecutable: "/jdk/bin/java",
            javaVersion: "25.0.3",
        });
    });

    /*
     * The exact condition that shipped in release 1.0.1745.
     *
     * That installer carried `resources/jars/bluemap-5.23-cli.jar` - 6,646,010 bytes, digest
     * matching the index the same release published, a correct and working engine - beside a
     * render-engine manifest reading `available: false, version: null, jar: null`. The resolver
     * consulted the manifest, believed it over the file, and every render ended with "The BlueMap
     * engine is not installed."
     *
     * The manifest is a description. `resolveCliJar` has already found the artefact. A document
     * that disagrees is a document to fix, and it does not get a vote on whether the program runs.
     *
     * Watched failing before being trusted: restoring the throw in `describeStagedJavaArtifact`'s
     * place turns this red with exactly the message users were shown.
     */
    it("renders with the staged jar even when the packaged manifest denies it exists", async () => {
        javaModule.resolveCliJar.mockReturnValue(JAR);
        javaModule.ensureJava.mockResolvedValue(JAVA);

        const manifestDirectory = await mkdtemp(join(tmpdir(), "worldlens-engine-manifest-"));
        await mkdir(join(manifestDirectory, "render-engines"), { recursive: true });
        await writeFile(
            join(manifestDirectory, "render-engines", "manifest.json"),
            JSON.stringify({
                manifestVersion: 1,
                engines: {
                    "upstream-java": {
                        id: "upstream-java",
                        label: "BlueMap engine (Java)",
                        version: null,
                        available: false,
                        requiresJvm: true,
                        jar: null,
                    },
                },
            }),
            "utf8",
        );

        const resolveEngine = upstreamJavaEngine({
            dataDir: "/data",
            resourcesPath: manifestDirectory,
        });

        const resolved = await resolveEngine();
        expect(resolved.engine).toBe("upstream-java");
        expect(resolved.enginePath).toBe(JAR.path);
        expect(resolved.engineVersion).toBe(JAR.version);
    });

    /*
     * The owner's other requirement: a build that arrived without an engine installs one rather
     * than telling the person it is not installed. `ensureJava` already does this for the runtime.
     *
     * The second `resolveCliJar` call is what proves the install was actually consulted: the first
     * throws exactly as it does on a machine with no jar anywhere, and the resolver only succeeds
     * because it looked again after installing.
     */
    it("installs the engine when no jar is found anywhere, instead of giving up", async () => {
        installModule.installCliJar.mockReset();
        javaModule.resolveCliJar
            .mockImplementationOnce(() => {
                throw new Error("no BlueMap cli jar found; looked in: /nowhere");
            })
            .mockReturnValueOnce(JAR);
        installModule.installCliJar.mockResolvedValue("/data/engines/jars/bluemap-5.23-cli.jar");
        javaModule.ensureJava.mockResolvedValue(JAVA);

        const resolved = await upstreamJavaEngine({ dataDir: "/data" })();

        expect(installModule.installCliJar).toHaveBeenCalledTimes(1);
        expect(installModule.installCliJar.mock.calls[0]?.[0]).toMatchObject({ dataDir: "/data" });
        expect(resolved.engine).toBe("upstream-java");
    });

    /*
     * A failed install must not bury the real problem. "Could not reach github.com" on its own
     * reads as a network blip; the state that matters is that this build has no engine, and the
     * download attempt is context for that rather than a replacement for it.
     */
    it("reports the missing engine, not just the download error, when installing fails", async () => {
        installModule.installCliJar.mockReset();
        javaModule.resolveCliJar.mockImplementation(() => {
            throw new Error("no BlueMap cli jar found; looked in: /nowhere");
        });
        installModule.installCliJar.mockRejectedValue(new Error("could not reach the release host"));

        await expect(upstreamJavaEngine({ dataDir: "/data" })()).rejects.toThrow(
            /no BlueMap cli jar found[\s\S]*Installing one automatically also failed[\s\S]*could not reach the release host/,
        );

        javaModule.resolveCliJar.mockReset();
    });

    /*
     * A missing manifest is the same answer. A build that never staged one, or a file that was
     * removed or truncated, is not a reason to refuse a jar that is sitting on disk.
     */
    it("renders with the staged jar when there is no manifest at all", async () => {
        javaModule.resolveCliJar.mockReturnValue(JAR);
        javaModule.ensureJava.mockResolvedValue(JAVA);

        const empty = await mkdtemp(join(tmpdir(), "worldlens-engine-nomanifest-"));
        const resolveEngine = upstreamJavaEngine({ dataDir: "/data", resourcesPath: empty });

        const resolved = await resolveEngine();
        expect(resolved.engine).toBe("upstream-java");
        expect(resolved.enginePath).toBe(JAR.path);
    });
});
