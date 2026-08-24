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

import { describe, expect, it, vi } from "vitest";
import type { BlueMapJar } from "../java/jars.js";
import type { EnsureJavaResult } from "../java/index.js";

const javaModule = vi.hoisted(() => ({
    resolveCliJar: vi.fn(),
    ensureJava: vi.fn(),
}));
const provisioningModule = vi.hoisted(() => ({
    ensureManagedUpstreamJava: vi.fn(),
}));

vi.mock("../java/index.js", () => ({
    resolveCliJar: javaModule.resolveCliJar,
    ensureJava: javaModule.ensureJava,
    NoUsableJavaError: class NoUsableJavaError extends Error {},
}));
vi.mock("./engineProvisioning.js", () => ({
    ensureManagedUpstreamJava: provisioningModule.ensureManagedUpstreamJava,
}));

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
        version: {
            feature: 25,
            version: "25.0.3",
            runtime: "OpenJDK Runtime Environment Temurin-25.0.3+9",
        },
    },
    provisioned: false,
    record: null,
    rejected: [],
};

describe("upstreamJavaEngine", () => {
    it("uses the exact managed path after a repair instead of reselecting a bundled jar", async () => {
        javaModule.resolveCliJar.mockReturnValue({
            ...JAR,
            path: "/resources/jars/cli-5.23-shadow.jar",
            version: "5.23",
        });
        javaModule.ensureJava.mockResolvedValue(JAVA);
        provisioningModule.ensureManagedUpstreamJava.mockResolvedValue({
            jarPath: "/data/render-engines/upstream-java/bluemap-5.23-cli.jar",
            source: "managed",
            version: "5.23",
            reused: false,
        });

        const resolved = await upstreamJavaEngine({
            dataDir: "/data",
            resourcesPath: "/resources",
            probeEngine: async () => ({ ok: true }),
        })();

        expect(resolved.enginePath).toBe("/data/render-engines/upstream-java/bluemap-5.23-cli.jar");
        expect(resolved.engineSource).toBe("managed");
        expect(provisioningModule.ensureManagedUpstreamJava).toHaveBeenCalledOnce();
    });

    it("resolves to the Java engine, pinning it as the standing default (D17, amended 2026-08-05)", async () => {
        provisioningModule.ensureManagedUpstreamJava.mockResolvedValue(null);
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
            engineSource: "bundled",
        });
    });
});
