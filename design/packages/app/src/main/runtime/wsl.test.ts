import { describe, expect, it, vi } from "vitest";
import { parseWslDistributions, probeWsl, wslPath, planWslLaunch } from "./wsl.js";
import type { CommandOutput, CommandRunner } from "./command.js";
const output = (stdout = "", stderr = "", ok = true): CommandOutput => ({
    stdout,
    stderr,
    ok,
    exitCode: ok ? 0 : 1,
    spawnError: null,
});
describe("WSL render adapter", () => {
    it("excludes internal Docker distributions and decodes Windows list output", () => {
        expect(
            parseWslDistributions(
                "\uFEFFU\0b\0u\0n\0t\0u\0\r\0\n\0docker-desktop\r\ndocker-desktop-data\r\nwork-linux\r\n",
            ),
        ).toEqual(["Ubuntu", "work-linux"]);
    });
    it("prefers Ubuntu only for an initial suggestion and probes Linux Java", async () => {
        const runner = vi
            .fn<CommandRunner>()
            .mockResolvedValueOnce(output("docker-desktop\nwork-linux\nUbuntu\n"))
            .mockResolvedValueOnce(output("", 'openjdk version "25.0.1"'));
        expect(await probeWsl(undefined, runner, "win32")).toMatchObject({
            selected: "Ubuntu",
            ready: true,
            javaVersion: "25.0.1",
        });
        expect(runner.mock.calls[1]?.[1]).toEqual([
            "--distribution",
            "Ubuntu",
            "--exec",
            "java",
            "-version",
        ]);
    });
    it("never substitutes another distribution for a missing explicit choice", async () => {
        const runner = vi.fn<CommandRunner>().mockResolvedValue(output("Ubuntu\n"));
        expect(await probeWsl("removed", runner, "win32")).toMatchObject({
            selected: "removed",
            ready: false,
        });
        expect(runner).toHaveBeenCalledTimes(1);
    });
    it("reports missing WSL and obsolete Linux Java without modifying the distribution", async () => {
        const runner = vi
            .fn<CommandRunner>()
            .mockResolvedValue(output("", "missing", false))
            .mockResolvedValueOnce(output("Ubuntu\n"))
            .mockResolvedValueOnce(output("", 'openjdk version "21.0.2"'));
        expect(await probeWsl("Ubuntu", runner, "win32")).toMatchObject({
            ready: false,
            javaVersion: null,
        });
        expect(runner).toHaveBeenCalledTimes(3);
        expect(await probeWsl(undefined, runner, "linux")).toMatchObject({
            ready: false,
            available: false,
        });
        expect(runner).toHaveBeenCalledTimes(3);
    });
    it("uses wslpath and passes punctuation as one argument", async () => {
        const runner = vi.fn<CommandRunner>().mockResolvedValue(output("/custom/c/world & data\n"));
        expect(await wslPath("C:\\world & data", "Ubuntu", runner)).toBe("/custom/c/world & data");
        expect(runner.mock.calls[0]?.[1]).toEqual([
            "--distribution",
            "Ubuntu",
            "--exec",
            "wslpath",
            "-a",
            "-u",
            "C:\\world & data",
        ]);
        await expect(wslPath("\\\\server\\world", "Ubuntu", runner)).rejects.toThrow(
            "network shares",
        );
        await expect(wslPath("\\\\wsl.localhost\\Other\\world", "Ubuntu", runner)).rejects.toThrow(
            "another WSL",
        );
        expect(
            await wslPath("\\\\wsl.localhost\\Ubuntu\\home\\user\\world", "Ubuntu", runner),
        ).toBe("/home/user/world");
    });
    it("pins launch directory, translated config and jar, preserves flags, and binds cancellation", async () => {
        const runner: CommandRunner = async (_command, args) =>
            output(
                `/custom/c/${String(args.at(-1))
                    .replace(/^C:[\\/]/, "")
                    .replaceAll("\\", "/")}\n`,
            );
        const launch = await planWslLaunch(
            {
                role: "render",
                distribution: "Ubuntu",
                cwd: "C:\\render run",
                configDir: "C:\\render run\\config",
                jarPath: "C:\\engine & one.jar",
                force: true,
                jvmArgs: ["-Xmx4g"],
            },
            runner,
        );
        expect(launch.mode).toBe("wsl");
        expect(launch.args.slice(0, 5)).toEqual([
            "--distribution",
            "Ubuntu",
            "--cd",
            "/custom/c/render run",
            "--exec",
        ]);
        expect(launch.args).toContain("/custom/c/engine & one.jar");
        expect(launch.args).toContain("/custom/c/render run/config");
        expect(launch.args.slice(-8)).toEqual([
            "-Xmx4g",
            "-jar",
            "/custom/c/engine & one.jar",
            "-c",
            "/custom/c/render run/config",
            "-r",
            "-s",
            "-f",
        ]);
        expect(launch.wsl?.distribution).toBe("Ubuntu");
        expect(launch.wsl?.token).toMatch(/^[a-f0-9-]+$/);
    });
});
