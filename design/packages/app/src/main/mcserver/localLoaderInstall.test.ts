import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { installLocalLoader, runJavaInstaller } from "./localLoaderInstall.js";

describe("local mod-loader installation", () => {
    it.each(["forge", "neoforge"] as const)(
        "verifies %s generated arguments after invoking the installer",
        async (flavour) => {
            const root = await mkdtemp(join(tmpdir(), "wl-loader-"));
            const version = flavour === "forge" ? "1.21.4-54.0.0" : "21.4.1";
            const argsFile = join(
                root,
                "libraries",
                "net",
                flavour === "forge" ? "minecraftforge" : "neoforged",
                flavour,
                version,
                "win_args.txt",
            );
            try {
                const result = await installLocalLoader({
                    flavour,
                    version,
                    javaPath: "fixture-java",
                    installerPath: join(root, "installer.jar"),
                    serverDir: root,
                    runner: async (java, args, cwd) => {
                        expect(java).toBe("fixture-java");
                        expect(args).toEqual([
                            "-jar",
                            join(root, "installer.jar"),
                            "--installServer",
                            root,
                        ]);
                        expect(cwd).toBe(root);
                        await mkdir(dirname(argsFile), { recursive: true });
                        await writeFile(argsFile, "--launchTarget forgeserver\n");
                        return { ok: true, message: "installed" };
                    },
                });
                expect(result).toEqual({
                    ok: true,
                    value: { jarPath: join(root, "installer.jar"), argsFile },
                });
            } finally {
                await rm(root, { recursive: true, force: true });
            }
        },
    );
    it("refuses exit-zero without a generated launcher", async () => {
        const root = await mkdtemp(join(tmpdir(), "wl-loader-empty-"));
        try {
            const result = await installLocalLoader({
                flavour: "neoforge",
                version: "21.4.1",
                javaPath: "fixture-java",
                installerPath: join(root, "installer.jar"),
                serverDir: root,
                runner: async () => ({ ok: true, message: "no output" }),
            });
            expect(result.ok).toBe(false);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("runs the executable in the actual isolated install directory", async () => {
        const root = await mkdtemp(join(tmpdir(), "wl-loader-child-"));
        try {
            const result = await runJavaInstaller(
                process.execPath,
                ["-e", "require('node:fs').writeFileSync('child-proof.txt', 'created by child')"],
                root,
            );
            expect(result.ok).toBe(true);
            expect(await readFile(join(root, "child-proof.txt"), "utf8")).toBe("created by child");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
