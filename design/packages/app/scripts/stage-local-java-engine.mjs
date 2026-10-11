import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyJarFile } from "./jar-verifier.mjs";
import {
    BLUEMAP_SOURCE_PATH,
    BLUEMAP_SOURCE_REPOSITORY,
    STAGED_JAVA_ENGINE_SCHEMA,
    validateStagedJavaEngine,
} from "./staged-java-engine.mjs";

/** A local build must carry the same structured source and byte binding as a downloaded build. */
export async function stageLocalJavaEngine({
    gradleDirectory,
    stagingDirectory,
    expectedCommit,
    releaseCommit,
    releaseTag,
}) {
    const stamp = JSON.parse(
        await readFile(join(gradleDirectory, "worldlens-jar-provenance.json"), "utf8"),
    );
    if (
        !/^[a-f0-9]{40}$/u.test(expectedCommit ?? "") ||
        !/^[a-f0-9]{40}$/u.test(releaseCommit ?? "") ||
        stamp.commit !== expectedCommit ||
        stamp.releaseCommit !== releaseCommit
    ) {
        throw new Error(
            "Local BlueMap build provenance does not match the selected source and official release.",
        );
    }
    const releaseVersion = /^v\d+\.\d+(?:\.\d+)?$/u.test(releaseTag ?? "")
        ? releaseTag.slice(1)
        : null;
    if (
        releaseVersion === null ||
        typeof stamp.version !== "string" ||
        !(stamp.version === releaseVersion || stamp.version.startsWith(`${releaseVersion}-`))
    ) {
        throw new Error(
            "Local BlueMap version label does not match the reviewed official release tag.",
        );
    }
    if (
        !/^\d+\.\d+(?:[-.][0-9A-Za-z.-]+)*$/u.test(stamp.version ?? "") ||
        !/^[a-f0-9]{64}$/u.test(stamp.sha256 ?? "")
    ) {
        throw new Error(
            "Local BlueMap build has no complete version and digest receipt. Rebuild through the root entrypoint.",
        );
    }
    const original = join(gradleDirectory, `cli-${stamp.version}-shadow.jar`);
    const actual = await verifyJarFile(original, { root: gradleDirectory });
    if (!actual.ok || actual.size !== stamp.size || actual.sha256 !== stamp.sha256) {
        throw new Error(
            "Local BlueMap JAR differs from its build receipt or is not a valid archive.",
        );
    }
    const source = {
        repository: BLUEMAP_SOURCE_REPOSITORY,
        path: BLUEMAP_SOURCE_PATH,
        commit: expectedCommit,
        version: stamp.version,
    };
    const cli = {
        implementation: "cli",
        version: stamp.version,
        fileName: `bluemap-${stamp.version}-cli.jar`,
        size: actual.size,
        sha256: actual.sha256,
        source,
    };
    await mkdir(stagingDirectory, { recursive: true });
    await copyFile(original, join(stagingDirectory, cli.fileName));
    const manifest = {
        schemaVersion: STAGED_JAVA_ENGINE_SCHEMA,
        source,
        producer: { kind: "local-root-build", builtAt: stamp.builtAt ?? null, releaseCommit },
        jars: [cli],
    };
    await writeFile(
        join(stagingDirectory, "manifest.json"),
        `${JSON.stringify(manifest, null, 4)}\n`,
        "utf8",
    );
    return validateStagedJavaEngine(stagingDirectory, {
        expectedCommit,
        expectedVersion: stamp.version,
    });
}
