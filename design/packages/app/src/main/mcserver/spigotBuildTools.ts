import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fetchServerMetadata, type FetchText } from "./flavours/catalogue.js";
import { installServerJar, type FetchBinary } from "./install.js";
import { runJavaInstaller, type InstallerRunner } from "./localLoaderInstall.js";
import { fail, ok, type Answer } from "./transport/types.js";

export const BUILD_TOOLS_METADATA_URL =
    "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/api/json?tree=number,artifacts[relativePath,fileName]";
export interface SpigotBuildPlan {
    version: string;
    build: number;
    url: string;
    javaMin: number;
    javaMax: number;
    refs: Record<string, string>;
}

export async function resolveSpigotBuildPlan(
    version: string,
    fetchText: FetchText = fetchServerMetadata,
): Promise<Answer<SpigotBuildPlan>> {
    if (!/^(?:1\.[0-9]+|[0-9]{2}\.[0-9]+)(?:\.[0-9]+)?$/.test(version))
        return fail("invalid-request", "Choose a published Minecraft release for Spigot.");
    try {
        const versionMetadata = JSON.parse(
            await fetchText(`https://hub.spigotmc.org/versions/${version}.json`),
        ) as Record<string, unknown>;
        const tools = JSON.parse(await fetchText(BUILD_TOOLS_METADATA_URL)) as {
            number?: unknown;
            artifacts?: { fileName?: unknown; relativePath?: unknown }[];
        };
        const classes = versionMetadata.javaVersions;
        const refs = versionMetadata.refs;
        const requiredBuild = versionMetadata.toolsVersion;
        if (
            !Array.isArray(classes) ||
            classes.length !== 2 ||
            classes.some((value) => !Number.isInteger(value) || value < 52 || value > 144) ||
            classes[0] > classes[1]
        )
            return fail(
                "invalid-request",
                "Spigot did not publish a supported Java range for this release.",
            );
        if (
            typeof refs !== "object" ||
            refs === null ||
            !["BuildData", "Bukkit", "CraftBukkit", "Spigot"].every(
                (key) =>
                    typeof (refs as Record<string, unknown>)[key] === "string" &&
                    /^[a-f0-9]{40}$/.test((refs as Record<string, string>)[key]!),
            )
        )
            return fail("invalid-request", "Spigot source-revision metadata is incomplete.");
        if (
            !Number.isSafeInteger(tools.number) ||
            (tools.number as number) < 35 ||
            !Number.isSafeInteger(requiredBuild) ||
            (tools.number as number) < (requiredBuild as number) ||
            !Array.isArray(tools.artifacts) ||
            !tools.artifacts.some(
                (entry) =>
                    entry.fileName === "BuildTools.jar" &&
                    entry.relativePath === "target/BuildTools.jar",
            )
        )
            return fail("invalid-request", "No compatible published BuildTools JAR was found.");
        const build = tools.number as number;
        return ok({
            version,
            build,
            url: `https://hub.spigotmc.org/jenkins/job/BuildTools/${build}/artifact/target/BuildTools.jar`,
            javaMin: classes[0] - 44,
            javaMax: classes[1] - 44,
            refs: Object.fromEntries(
                ["BuildData", "Bukkit", "CraftBukkit", "Spigot"].map((key) => [
                    key,
                    (refs as Record<string, string>)[key]!,
                ]),
            ),
        });
    } catch (error) {
        return fail(
            "command-failed",
            "The requested Spigot release or BuildTools metadata could not be resolved.",
            String(error),
        );
    }
}

export async function buildSpigotServer(options: {
    plan: SpigotBuildPlan;
    javaPath: string;
    dataDir: string;
    serverDir: string;
    fetchBinary?: FetchBinary;
    runner?: InstallerRunner;
    now?: () => string;
}): Promise<Answer<{ jarPath: string }>> {
    try {
        const root = join(options.dataDir, "spigot-builds");
        await mkdir(root, { recursive: true });
        const workDir = await mkdtemp(join(root, "build-"));
        const toolPath = join(workDir, "BuildTools.jar");
        const downloaded = await installServerJar({
            url: options.plan.url,
            targetPath: toolPath,
            sha256: null,
            signal: AbortSignal.timeout(300_000),
            ...(options.fetchBinary === undefined ? {} : { fetchBinary: options.fetchBinary }),
        });
        if (!downloaded.ok) return downloaded;
        const result = await (options.runner ?? runJavaInstaller)(
            options.javaPath,
            [
                "-Djava.awt.headless=true",
                "-jar",
                toolPath,
                "--rev",
                options.plan.version,
                "--compile",
                "spigot",
                "--output-dir",
                workDir,
                "--final-name",
                "server.jar",
            ],
            workDir,
            1_800_000,
        );
        if (!result.ok)
            return fail(
                "command-failed",
                "Spigot BuildTools did not finish. Its isolated build directory was retained for diagnosis.",
                result.message,
            );
        const output = join(workDir, "server.jar");
        const info = await stat(output);
        if (!info.isFile() || info.size < 4 || info.size > 1024 * 1024 * 1024)
            return fail("invalid-request", "BuildTools produced no supported server JAR.");
        const handle = await open(output, "r");
        try {
            const signature = Buffer.alloc(4);
            await handle.read(signature, 0, 4, 0);
            if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
                return fail("invalid-request", "BuildTools output is not a JAR archive.");
        } finally {
            await handle.close();
        }
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(output)) hash.update(chunk);
        const jarPath = join(options.serverDir, "server.jar");
        await copyFile(output, jarPath, constants.COPYFILE_EXCL);
        await writeFile(
            join(options.serverDir, "worldlens-build-provenance.json"),
            JSON.stringify(
                {
                    schemaVersion: 1,
                    flavour: "spigot",
                    gameVersion: options.plan.version,
                    buildToolsBuild: options.plan.build,
                    buildToolsUrl: options.plan.url,
                    buildToolsSha256: downloaded.value.sha256,
                    serverJarSha256: hash.digest("hex"),
                    sourceRefs: options.plan.refs,
                    createdAt: options.now?.() ?? new Date().toISOString(),
                },
                null,
                2,
            ),
            { encoding: "utf8", flag: "wx" },
        );
        return ok({ jarPath });
    } catch (error) {
        return fail(
            "command-failed",
            "The compiled Spigot JAR or its provenance could not be saved. No server record was created.",
            String(error),
        );
    }
}
