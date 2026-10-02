import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, delimiter, join, relative, isAbsolute } from "node:path";
import { fail, ok, type Answer } from "./transport/types.js";

export type InstallerRunner = (
    javaPath: string,
    args: readonly string[],
    serverDir: string,
    timeoutMs?: number,
) => Promise<{ ok: boolean; message: string }>;

/** A bounded executable invocation, never a generated shell script. */
export const runJavaInstaller: InstallerRunner = (javaPath, args, serverDir, timeoutMs = 600_000) =>
    new Promise((resolve) => {
        const env = { ...process.env };
        if (isAbsolute(javaPath)) {
            env.JAVA_HOME = dirname(dirname(javaPath));
            const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
            env[pathKey] = `${dirname(javaPath)}${delimiter}${env[pathKey] ?? ""}`;
        }
        execFile(
            javaPath,
            [...args],
            {
                cwd: serverDir,
                windowsHide: true,
                env,
                timeout: Math.min(timeoutMs, 1_800_000),
                maxBuffer: 4 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                resolve({
                    ok: error === null,
                    message:
                        error === null
                            ? "Installer completed."
                            : String(stderr || stdout || error.message).slice(-4_000),
                });
            },
        );
    });

async function verifiedOutput(root: string, path: string): Promise<boolean> {
    try {
        const canonicalRoot = await realpath(root);
        const canonicalPath = await realpath(path);
        const within = relative(canonicalRoot, canonicalPath);
        if (within.startsWith("..") || isAbsolute(within)) return false;
        const info = await stat(path);
        return info.isFile() && info.size > 0;
    } catch {
        return false;
    }
}

export async function installLocalLoader(options: {
    flavour: "forge" | "neoforge";
    version: string;
    javaPath: string;
    installerPath: string;
    serverDir: string;
    runner?: InstallerRunner;
}): Promise<Answer<{ jarPath: string; argsFile?: string }>> {
    const result = await (options.runner ?? runJavaInstaller)(
        options.javaPath,
        ["-jar", options.installerPath, "--installServer", options.serverDir],
        options.serverDir,
    );
    if (!result.ok)
        return fail(
            "command-failed",
            `${options.flavour} installation did not complete.`,
            result.message,
        );
    const coordinates =
        options.flavour === "forge"
            ? ["net", "minecraftforge", "forge"]
            : ["net", "neoforged", "neoforge"];
    const argsFile = join(
        options.serverDir,
        "libraries",
        ...coordinates,
        options.version,
        "win_args.txt",
    );
    if (await verifiedOutput(options.serverDir, argsFile)) {
        const info = await stat(argsFile);
        if (info.size > 1024 * 1024)
            return fail(
                "invalid-request",
                "The generated Java argument file exceeds the supported size.",
            );
        const args = await readFile(argsFile, "utf8");
        if (args.trim() === "" || args.includes("\0"))
            return fail("invalid-request", "The generated Java argument file is unreadable.");
        return ok({ jarPath: options.installerPath, argsFile });
    }
    if (options.flavour === "forge") {
        const jarPath = join(options.serverDir, `forge-${options.version}.jar`);
        if (await verifiedOutput(options.serverDir, jarPath)) return ok({ jarPath });
    }
    return fail(
        "not-found",
        "The installer reported success but did not produce its expected server launcher. No server record was saved.",
    );
}
