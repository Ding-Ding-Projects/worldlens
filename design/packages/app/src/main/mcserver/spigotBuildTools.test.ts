import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    BUILD_TOOLS_METADATA_URL,
    buildSpigotServer,
    resolveSpigotBuildPlan,
} from "./spigotBuildTools.js";

const refs = Object.fromEntries(
    ["BuildData", "Bukkit", "CraftBukkit", "Spigot"].map((key) => [key, "a".repeat(40)]),
);
const metadata = { refs, toolsVersion: 181, javaVersions: [65, 68] };
const tools = {
    number: 200,
    artifacts: [{ fileName: "BuildTools.jar", relativePath: "target/BuildTools.jar" }],
};
const fetchText = async (url: string) =>
    JSON.stringify(url === BUILD_TOOLS_METADATA_URL ? tools : metadata);
const toolBytes = Buffer.from("fixture tool bytes");
const outputBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);

describe("official Spigot BuildTools", () => {
    it("pins the published build and uses the release's Java range", async () => {
        const result = await resolveSpigotBuildPlan("1.21.4", fetchText);
        expect(result).toEqual({
            ok: true,
            value: {
                version: "1.21.4",
                build: 200,
                url: "https://hub.spigotmc.org/jenkins/job/BuildTools/200/artifact/target/BuildTools.jar",
                javaMin: 21,
                javaMax: 24,
                refs,
            },
        });
    });
    it("rejects unsupported release names without a request", async () => {
        let calls = 0;
        expect(
            (
                await resolveSpigotBuildPlan("../latest", async () => {
                    calls++;
                    return "{}";
                })
            ).ok,
        ).toBe(false);
        expect(calls).toBe(0);
    });
    it("rejects a tool older than the release requires", async () => {
        expect(
            (
                await resolveSpigotBuildPlan("1.21.4", async (url) =>
                    JSON.stringify(
                        url === BUILD_TOOLS_METADATA_URL ? { ...tools, number: 180 } : metadata,
                    ),
                )
            ).ok,
        ).toBe(false);
    });
    it.each([true, false])(
        "records only an independently verified compiled output: %s",
        async (emitOutput) => {
            const root = await mkdtemp(join(tmpdir(), "wl-spigot-test-"));
            const serverDir = join(root, "server");
            await mkdir(serverDir);
            try {
                const plan = await resolveSpigotBuildPlan("1.21.4", fetchText);
                if (!plan.ok) throw new Error("fixture plan failed");
                const result = await buildSpigotServer({
                    plan: plan.value,
                    javaPath: "fixture-java",
                    dataDir: root,
                    serverDir,
                    fetchBinary: async () => ({
                        ok: true,
                        status: 200,
                        headers: { get: () => String(toolBytes.length) },
                        body: (async function* () {
                            yield toolBytes;
                        })(),
                    }),
                    runner: async (_java, args, cwd, deadline) => {
                        expect(args).toEqual([
                            "-Djava.awt.headless=true",
                            "-jar",
                            join(cwd, "BuildTools.jar"),
                            "--rev",
                            "1.21.4",
                            "--compile",
                            "spigot",
                            "--output-dir",
                            cwd,
                            "--final-name",
                            "server.jar",
                        ]);
                        expect(deadline).toBe(1_800_000);
                        if (emitOutput) await writeFile(join(cwd, "server.jar"), outputBytes);
                        return { ok: true, message: "fixture completed" };
                    },
                });
                expect(result.ok).toBe(emitOutput);
                if (emitOutput) {
                    expect(await readFile(join(serverDir, "server.jar"))).toEqual(outputBytes);
                    const record = JSON.parse(
                        await readFile(join(serverDir, "worldlens-build-provenance.json"), "utf8"),
                    );
                    expect(record.buildToolsBuild).toBe(200);
                    expect(record.sourceRefs).toEqual(refs);
                    expect(record.buildToolsSha256).toBe(
                        createHash("sha256").update(toolBytes).digest("hex"),
                    );
                    expect(record.serverJarSha256).toBe(
                        createHash("sha256").update(outputBytes).digest("hex"),
                    );
                }
            } finally {
                await rm(root, { recursive: true, force: true });
            }
        },
    );
});
