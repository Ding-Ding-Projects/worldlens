import { it, expect, vi } from "vitest";
const downloads = vi.hoisted(() => ({ resolve: vi.fn(), download: vi.fn() }));
vi.mock("../java/adoptium.js", () => ({ resolveTemurinRelease: downloads.resolve }));
vi.mock("../java/download.js", () => ({ downloadVerified: downloads.download }));
import { ensureWslJava } from "./wslJava.js";
import type { CommandRunner } from "./command.js";
const ok = (stdout = "", stderr = "") => ({
    ok: true,
    exitCode: 0,
    spawnError: null,
    stdout,
    stderr,
});
it("verifies the Linux archive before extracting in the selected user's private application directory", async () => {
    downloads.resolve.mockResolvedValue({
        url: "https://example.invalid/java.tar.gz",
        sha256: "a".repeat(64),
        size: 100,
        fileName: "java.tar.gz",
    });
    downloads.download.mockResolvedValue({ path: "C:\\cache\\java.tar.gz" });
    const runner = vi.fn<CommandRunner>(async (_cmd, args) => {
        if (args.includes("uname")) return ok("x86_64\n");
        if (args.includes("wslpath")) return ok("/mnt/c/cache/java.tar.gz\n");
        if (args.includes('printf "%s" "$HOME"')) return ok("/home/render-user");
        if (args.includes("-version")) return ok("", 'openjdk version "25.0.2"');
        expect(downloads.download).toHaveBeenCalled();
        return ok();
    });
    const result = await ensureWslJava({ distribution: "Ubuntu", cacheDir: "C:\\cache", runner });
    expect(downloads.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ platform: "linux", architecture: "x64", feature: 25 }),
    );
    expect(downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({ sha256: "a".repeat(64), expectedSize: 100 }),
    );
    const extraction = runner.mock.calls.find((call) => call[1].includes("worldlens-java-supervisor"))!;
    expect(extraction[1]).toContain("/home/render-user/.local/share/worldlens/java");
    expect(extraction[1].join(" ")).toContain("flock -n 9");
    expect(extraction[1].join(" ")).toContain("timeout --signal=TERM --kill-after=5s 100s");
    expect(extraction[1].slice(0, 3)).toEqual(["--distribution", "Ubuntu", "--exec"]);
    expect(result).toEqual({
        distribution: "Ubuntu",
        javaVersion: "25.0.2",
        javaExecutable: `/home/render-user/.local/share/worldlens/java/${"a".repeat(64)}/bin/java`,
    });
});
it("does nothing when preparation has already been cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = vi.fn<CommandRunner>();
    await expect(
        ensureWslJava({
            distribution: "Ubuntu",
            cacheDir: "C:\\cache",
            signal: controller.signal,
            runner,
        }),
    ).rejects.toThrow();
    expect(runner).not.toHaveBeenCalled();
});


it.each([[75, "holds the setup lock"], [124, "stopped extraction"], [null, "state is unconfirmed"], [137, "state is unconfirmed"]] as const)(
    "reports installation outcome %s without claiming an installed runtime", async (exitCode, message) => {
        downloads.resolve.mockResolvedValue({ url: "https://example.invalid/java.tar.gz", sha256: "a".repeat(64), size: 100 });
        downloads.download.mockResolvedValue({ path: "C:\\cache\\java.tar.gz" });
        const runner = vi.fn<CommandRunner>(async (_cmd, args) => {
            if (args.includes("uname")) return ok("x86_64");
            if (args.includes("wslpath")) return ok("/mnt/c/cache/java.tar.gz");
            if (args.includes('printf "%s" "$HOME"')) return ok("/home/render-user");
            return { ...ok(), ok: false, exitCode };
        });
        await expect(ensureWslJava({ distribution: "Ubuntu", cacheDir: "C:\\cache", runner })).rejects.toThrow(message);
        expect(runner.mock.calls.some((call) => call[1].includes("-version"))).toBe(false);
    },
);
