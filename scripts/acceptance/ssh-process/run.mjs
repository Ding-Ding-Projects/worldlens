#!/usr/bin/env node
/** Explicit Linux-only acceptance: owns a disposable local Docker target and fixture keys. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "linux") throw new Error("This fixture requires Linux and the local Docker socket.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const folder = mkdtempSync(join(tmpdir(), "worldlens-ssh-acceptance-"));
const name = `worldlens-ssh-acceptance-${folder.split("-").at(-1).toLowerCase()}`;
const image = `${name}:fixture`;
const env = { ...process.env };
for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete env[key];
let container = null;
let imageBuilt = false;
const receipt = { startedAt: new Date().toISOString(), sourceCommit: null, imageId: null, result: "failed", cleanup: "pending", limits: "Real loopback SSH backend only; synthetic cached catalogue; no desktop UI, remote installation, Minecraft launch or Windows acceptance." };
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024, ...options });
    if (result.error || result.status !== 0) throw new Error(`${command} did not complete successfully (status ${result.status}). ${result.stderr ?? ""}`);
    return result.stdout?.trim() ?? "";
}
const docker = (args, options) => run("docker", ["--host=unix:///var/run/docker.sock", ...args], options);
try {
    receipt.sourceCommit = run("git", ["rev-parse", "HEAD"]);
    receipt.sourceTreeClean = run("git", ["status", "--porcelain"]) === "";
    receipt.acceptanceFilesSha256 = Object.fromEntries(["scripts/acceptance/ssh-process/Dockerfile", "scripts/acceptance/ssh-process/run.mjs", "design/packages/app/src/main/mcserver/sshProcessPreflight.realNetwork.test.ts", "design/packages/app/src/main/mcserver/sshProcessPreflight.ts"].map((file) => [file, createHash("sha256").update(readFileSync(join(root, file))).digest("hex")]));
    docker(["info", "--format", "{{.ServerVersion}}"]);
    docker(["build", "--tag", image, resolve(root, "scripts/acceptance/ssh-process")], { stdio: "inherit" });
    imageBuilt = true;
    receipt.imageId = docker(["image", "inspect", "--format", "{{.Id}}", image]);
    // systemd needs its own writable cgroup namespace. No host paths or daemon socket
    // are mounted, no host network is used, and the only published port is loopback.
    container = docker(["create", "--name", name, "--label", "worldlens.acceptance=ssh-process", "--privileged", "--cgroupns=private", "--tmpfs", "/run", "--tmpfs", "/run/lock", "--tmpfs", "/tmp", "--publish", "127.0.0.1::22", image]);
    docker(["start", container]);
    const binding = docker(["port", container, "22/tcp"]);
    const match = /^127\.0\.0\.1:(\d+)$/u.exec(binding);
    if (!match) throw new Error("The fixture SSH port was not bound exclusively to loopback.");
    const port = match[1];
    for (const key of ["client", "unauthorized"]) run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(folder, key)]);
    docker(["cp", join(folder, "client.pub"), `${container}:/home/fixture/.ssh/authorized_keys`]);
    docker(["exec", container, "sh", "-ec", "chown fixture:fixture /home/fixture/.ssh/authorized_keys; chmod 600 /home/fixture/.ssh/authorized_keys; printf 'preserve-existing-content\\n' > /srv/worldlens-acceptance/preserved.txt; chown fixture:fixture /srv/worldlens-acceptance/preserved.txt; systemctl start ssh.service; systemctl is-active ssh.service"]);
    const publicKey = docker(["exec", container, "head", "-n", "1", "/etc/ssh/ssh_host_ed25519_key.pub"]).split(/\s+/u);
    if (publicKey[0] !== "ssh-ed25519" || !publicKey[1]) throw new Error("Fixture host public key is unavailable.");
    writeFileSync(join(folder, "known_hosts"), `[127.0.0.1]:${port} ${publicKey[0]} ${publicKey[1]}\n`, { mode: 0o600 });
    docker(["exec", "--detach", "--user", "fixture", container, "systemd-socket-activate", "--listen=25566", "--accept", "/usr/bin/true"]);
    const result = spawnSync("corepack", ["pnpm", "exec", "vitest", "run", "packages/app/src/main/mcserver/sshProcessPreflight.realNetwork.test.ts"], {
        cwd: join(root, "design"), env: { ...env, WORLDLENS_SSH_PROCESS_FIXTURE_DIR: folder, WORLDLENS_SSH_PROCESS_FIXTURE_PORT: port },
        encoding: "utf8", timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
    });
    writeFileSync(join(folder, "tests.log"), `${result.stdout ?? ""}${result.stderr ?? ""}`);
    process.stdout.write(result.stdout ?? "");
    if (result.error || result.status !== 0) throw new Error(`Live readiness acceptance failed; see ${join(folder, "tests.log")}.`);
    receipt.result = "passed";
} finally {
    const cleanupFailures = [];
    if (container) {
        try {
            docker(["stop", "--time", "15", container]);
            docker(["rm", container]);
            if (docker(["ps", "--all", "--quiet", "--filter", `id=${container}`]) !== "") throw new Error("Owned container remains.");
        }
        catch { cleanupFailures.push("container"); }
    }
    if (imageBuilt && cleanupFailures.length === 0) {
        try { docker(["image", "rm", image]); } catch { cleanupFailures.push("fixture-image"); }
    }
    for (const key of ["client", "client.pub", "unauthorized", "unauthorized.pub", "known_hosts"]) {
        try { rmSync(join(folder, key), { force: true }); } catch { cleanupFailures.push("fixture-key-file"); }
    }
    receipt.cleanup = cleanupFailures.length ? `incomplete: ${cleanupFailures.join(", ")}` : "owned container, image tag and fixture keys removed";
    receipt.finishedAt = new Date().toISOString();
    writeFileSync(join(folder, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(`Acceptance receipt: ${join(folder, "receipt.json")}`);
    if (cleanupFailures.length) process.exitCode = 1;
}
