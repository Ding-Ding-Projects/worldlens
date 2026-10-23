import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
const root = dirname(fileURLToPath(import.meta.url));
const distribution = {
    version: "1.13.1",
    file: "baritone-api-fabric-1.13.1.jar",
    sha256: "bfb79c3cdb8fe1f7697999b1f9c7f08ea29775f3b69d48ad90c387690ee67b05",
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
async function run(executable, args, options = {}) {
    return await new Promise((resolveRun, reject) => {
        const child = spawn(executable, args, {
            cwd: root,
            windowsHide: true,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            ...options,
        });
        let text = "";
        const collect = (chunk) => {
            text = (text + chunk.toString()).slice(-65536);
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        const timeout = setTimeout(
            () => {
                child.kill();
                reject(new Error("Bridge build exceeded its time limit."));
            },
            10 * 60 * 1000,
        );
        child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once("exit", (code) => {
            clearTimeout(timeout);
            if (code === 0) resolveRun(text);
            else reject(new Error(`Bridge build process exited with code ${code}.`));
        });
    });
}
/** Invoked by the owning root build entrypoint after its supported Java/Gradle bootstrap. */
export async function buildBaritoneBridge({ javaHome, gradleExecutable, outputDirectory }) {
    if (!javaHome || !gradleExecutable || !outputDirectory)
        throw new Error("Java, Gradle and output paths are required.");
    const environment = { ...process.env, JAVA_HOME: resolve(javaHome) };
    const java = join(resolve(javaHome), "bin", process.platform === "win32" ? "java.exe" : "java");
    if (!/version "21(?:\.|\")/.test(await run(java, ["-version"])))
        throw new Error("The bridge requires Java 21.");
    if (
        !/Gradle 8\.12\.1(?:\r?\n|\s)/.test(
            await run(gradleExecutable, ["--version"], { env: environment }),
        )
    )
        throw new Error("The reviewed bridge build requires Gradle 8.12.1.");
    const verified = join(root, "verified");
    await mkdir(verified, { recursive: true });
    const jar = join(verified, distribution.file);
    let cached = false;
    try {
        cached = digest(await readFile(jar)) === distribution.sha256;
    } catch {
        /* Download the missing cache. */
    }
    if (!cached)
        await run("gh", [
            "release",
            "download",
            `v${distribution.version}`,
            "--repo",
            "cabaletta/baritone",
            "--pattern",
            distribution.file,
            "--dir",
            verified,
            "--clobber",
        ]);
    if (digest(await readFile(jar)) !== distribution.sha256)
        throw new Error("Official Baritone distribution integrity check failed.");
    await run(gradleExecutable, ["--no-daemon", "--console=plain", "build"], { env: environment });
    const built = join(root, "build", "libs", "worldlens-baritone-client-1.0.0.jar");
    const bytes = await readFile(built);
    const bridgeSha256 = digest(bytes);
    const output = resolve(outputDirectory);
    await mkdir(output, { recursive: true });
    await copyFile(built, join(output, "worldlens-baritone-client-1.0.0.jar"));
    await copyFile(jar, join(output, distribution.file));
    const receipt = {
        schemaVersion: 1,
        minecraftVersion: "1.21.4",
        javaMajor: 21,
        fabricLoader: "0.16.9",
        baritoneVersion: distribution.version,
        baritoneSha256: distribution.sha256,
        bridgeVersion: "1.0.0",
        bridgeSha256,
        builtAt: new Date().toISOString(),
    };
    await writeFile(
        join(output, "baritone-build-receipt.json"),
        JSON.stringify(receipt, null, 2) + "\n",
    );
    return receipt;
}
