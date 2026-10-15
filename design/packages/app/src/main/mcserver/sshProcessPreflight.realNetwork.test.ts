/** Opt-in acceptance against an owned loopback Linux/systemd/SSH fixture.
 * No CommandRunner mock: saved profiles, cached catalogue parsing and OpenSSH are real.
 * Fixture keys and host trust are supplied outside the repository; this suite never
 * installs a server, changes remote trust, or configures the remote service manager.
 */
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHostProfileStore, HOST_PROFILES_FILE } from "./hostProfiles.js";
import {
    FLAVOUR_IDS,
    CATALOGUE_FILE,
    CATALOGUE_CACHE_SHAPE,
    readCachedCatalogue,
} from "./flavours/catalogue.js";
import { preflightSshProcessCreation } from "./sshProcessPreflight.js";
import { execFileCommandRunner } from "../runtime/command.js";
import { remoteCommandLine, sshScriptArguments } from "../remote/ssh.js";

const fixtureDir = process.env["WORLDLENS_SSH_PROCESS_FIXTURE_DIR"];
const fixturePort = Number(process.env["WORLDLENS_SSH_PROCESS_FIXTURE_PORT"]);
const enabled = fixtureDir !== undefined;

describe.skipIf(!enabled)("real loopback SSH process readiness", () => {
    let dataRoot: string;
    const ownedFolders: string[] = [];
    beforeAll(async () => {
        if (
            !fixtureDir ||
            !isAbsolute(fixtureDir) ||
            !Number.isInteger(fixturePort) ||
            fixturePort < 1024 ||
            fixturePort > 65535
        )
            throw new Error(
                "Supply an absolute owned fixture directory and its unprivileged loopback SSH port.",
            );
        dataRoot = await mkdtemp(join(tmpdir(), "worldlens-ssh-readiness-"));
        ownedFolders.push(dataRoot);
        await writeFile(join(dataRoot, "untrusted_hosts"), "", { mode: 0o600 });
    });
    afterAll(async () => {
        for (const path of ownedFolders) await rm(path, { recursive: true, force: true });
    });

    async function observe({
        trusted = true,
        identity = "client",
        workDir = "/srv/worldlens-acceptance",
        port = 25565,
    } = {}) {
        const dataFolder = await mkdtemp(join(dataRoot, "profile-"));
        const knownHostsFile = trusted
            ? join(fixtureDir!, "known_hosts")
            : join(dataRoot, "untrusted_hosts");
        const store = createHostProfileStore({
            dataFolder,
            knownHostsFile,
            userKnownHostsFile: null,
        });
        const saved = await store.save({
            hostId: "acceptance",
            target: {
                id: "acceptance",
                label: "Owned Linux acceptance fixture",
                host: "127.0.0.1",
                port: fixturePort,
                user: "fixture",
                identityFile: join(fixtureDir!, identity),
                workDir,
            },
        });
        expect(saved.ok).toBe(true);
        await writeFile(
            join(dataFolder, CATALOGUE_FILE),
            JSON.stringify({
                shape: CATALOGUE_CACHE_SHAPE,
                fetchedAt: new Date().toISOString(),
                completeness: "partial",
                failures: [],
                sourceRevision: null,
                flavours: FLAVOUR_IDS.map((flavour) => ({
                    flavour,
                    complete: false,
                    versions:
                        flavour === "vanilla"
                            ? [
                                  {
                                      version: "1.21.4",
                                      stability: "release",
                                      javaFeature: 21,
                                      downloadUrl: null,
                                      sha256: null,
                                      releasedAt: null,
                                  },
                              ]
                            : [],
                })),
            }),
        );
        const files = [
            knownHostsFile,
            join(dataFolder, HOST_PROFILES_FILE),
            join(dataFolder, CATALOGUE_FILE),
        ];
        const before = await Promise.all(files.map((path) => readFile(path)));
        const answer = await preflightSshProcessCreation(
            { hostId: "acceptance", minecraftVersion: "1.21.4", memoryMb: 512, port },
            { hostProfiles: store, readCatalogue: () => readCachedCatalogue(dataFolder) },
        );
        expect(await Promise.all(files.map((path) => readFile(path)))).toEqual(before);
        if (!answer.ok)
            throw new Error(`Readiness did not return a report: ${answer.failure.code}`);
        expect(answer.value.canCreate).toBe(false);
        return { report: answer.value, connection: store.sshHost("acceptance")! };
    }

    it("observes all eight prerequisites over real SSH without granting creation", async () => {
        const { report, connection } = await observe();
        expect(report.checks).toEqual(
            ["ssh", "platform", "supervisor", "directory", "java", "memory", "disk", "port"].map(
                (stage) => ({ stage, state: "passed", code: "ready" }),
            ),
        );
        expect(report.ready).toBe(true);
        expect(report.javaFeature).toBeGreaterThanOrEqual(21);
        expect(report.serverParent).toBe("/srv/worldlens-acceptance");
        const files = await execFileCommandRunner(
            "ssh",
            sshScriptArguments(
                connection,
                remoteCommandLine([
                    "find",
                    "/srv/worldlens-acceptance",
                    "-mindepth",
                    "1",
                    "-printf",
                    "%f\n",
                ]),
            ),
            { timeoutMs: 10_000 },
        );
        expect(files.ok).toBe(true);
        expect(files.stdout).toBe("preserved.txt\n");
        const content = await execFileCommandRunner(
            "ssh",
            sshScriptArguments(
                connection,
                remoteCommandLine(["sha256sum", "/srv/worldlens-acceptance/preserved.txt"]),
            ),
            { timeoutMs: 10_000 },
        );
        expect(content.ok).toBe(true);
        expect(content.stdout.split(/\s/u)[0]).toBe(
            "1c2fb4ac6159ce1c3b6db592fb56c131e8c8897e0dc54c9dfca796568e1a48b0",
        );
    }, 40_000);

    it("refuses an untrusted host without modifying trust", async () => {
        const { report } = await observe({ trusted: false });
        expect(report.ready).toBe(false);
        expect(report.checks).toEqual([
            { stage: "ssh", state: "blocked", code: "host-key-unknown" },
        ]);
    }, 40_000);

    it("refuses an unauthorized key without password fallback", async () => {
        const { report } = await observe({ identity: "unauthorized" });
        expect(report.ready).toBe(false);
        expect(report.checks).toEqual([{ stage: "ssh", state: "blocked", code: "auth-refused" }]);
    }, 40_000);

    it("refuses a missing parent instead of creating it", async () => {
        const { report, connection } = await observe({
            workDir: "/srv/worldlens-acceptance/missing",
        });
        expect(report.ready).toBe(false);
        expect(report.checks.at(-1)).toEqual({
            stage: "directory",
            state: "blocked",
            code: "existing-canonical-directory-required",
        });
        const absent = await execFileCommandRunner(
            "ssh",
            sshScriptArguments(
                connection,
                remoteCommandLine(["test", "!", "-e", "/srv/worldlens-acceptance/missing"]),
            ),
            { timeoutMs: 10_000 },
        );
        expect(absent.ok).toBe(true);
    }, 40_000);

    it("detects a real listening TCP port", async () => {
        const { report } = await observe({ port: 25566 });
        expect(report.ready).toBe(false);
        expect(report.checks.at(-1)).toEqual({
            stage: "port",
            state: "blocked",
            code: "port-occupied",
        });
    }, 40_000);
});
