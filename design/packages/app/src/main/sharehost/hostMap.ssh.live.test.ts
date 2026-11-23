/**
 * Hosting a map on a real SSH host, opt-in.
 *
 * Runs only when `WORLDLENS_LIVE_SSH` names a host as `user@host` (optionally `:port`) whose
 * key is already in `~/.ssh/known_hosts` and whose account can run Docker. It does what a
 * person does from the dialog: stream the bundled image over SSH into `docker load`, pack a
 * map into a volume on that host, start the container, check health and the access code from
 * this PC at the host's own network address, then list and remove it. It never touches a
 * container it did not create.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sshExecutor } from "./exec.js";
import { hostMap, type HostMapDeps } from "./hostMap.js";
import { ShareHostManager } from "./manager.js";
import { createMemoryRegistry } from "./registry.js";

const spec = process.env["WORLDLENS_LIVE_SSH"] ?? "";
const match = /^([^@\s]+)@([^:\s]+)(?::(\d+))?$/u.exec(spec);

describe.skipIf(match === null)("hostMap against a real SSH host", () => {
    it("hosts, serves, protects, lists and removes a map over SSH", async () => {
        const [, user, host, port] = match!;
        const work = await mkdtemp(join(tmpdir(), "worldlens-live-ssh-"));
        const executor = sshExecutor({
            target: { id: "live-ssh", label: "live SSH host", host: host!, port: Number(port ?? 22), user: user!, identityFile: null, workDir: "~/.worldlens/renders", docker: "docker" },
            knownHostsFile: join(homedir(), ".ssh", "known_hosts"),
            userKnownHostsFile: null,
        });
        const remoteArch = (await executor.exec("docker", ["info", "--format", "{{.Architecture}}"])).stdout.trim();
        const archName = remoteArch === "aarch64" ? "arm64" : "amd64";

        // The same bundled image the packaged app ships, built for the remote's architecture.
        const imageTar = join(work, "image.tar");
        execFileSync("docker", ["buildx", "build", "--platform", `linux/${archName}`, "--provenance=false", "-t", "worldlens-map-server:bundled", "--output", `type=docker,dest=${imageTar}`, join(__dirname, "..", "..", "..", "..", "mapserver")]);
        const tarBody = await readFile(imageTar);
        execFileSync("docker", ["load", "-i", imageTar]);
        const layers = JSON.parse(execFileSync("docker", ["image", "inspect", "--format", "{{json .RootFS.Layers}}", "worldlens-map-server:bundled"]).toString()) as string[];
        const imageDir = join(work, "image");
        await mkdir(imageDir);
        await writeFile(join(imageDir, `worldlens-map-server-${archName}.tar`), tarBody);
        await writeFile(join(imageDir, "mapserver-image.json"), JSON.stringify({ version: 1, image: "worldlens-map-server", tag: "bundled", appVersion: "live-ssh", images: { [archName]: { file: `worldlens-map-server-${archName}.tar`, sha256: createHash("sha256").update(tarBody).digest("hex"), layers } } }));

        const web = join(work, "web");
        await mkdir(join(web, "maps", "overworld"), { recursive: true });
        await writeFile(join(web, "index.html"), "<html>viewer over ssh</html>");
        await writeFile(join(web, "settings.json"), JSON.stringify({ maps: ["overworld"] }));
        await writeFile(join(web, "maps", "overworld", "0.prbm.gz"), Buffer.from("gz-tile"));

        const registry = createMemoryRegistry();
        const deps: HostMapDeps = { executorFor: () => Promise.resolve(executor), webRootFor: () => web, bundledImageDir: () => imageDir, registry, tempDir: () => work, healthAttempts: 30 };
        const outcome = await hostMap(deps, { renderId: "live-ssh", target: { kind: "ssh", targetId: "live-ssh" }, name: "live-ssh-test", port: 18110, maps: ["overworld"], startOnBoot: false, accessCode: true, lan: true }, (e) => { if (e.type === "step") console.log(e.step, e.state, e.meta); });
        if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
        const manager = new ShareHostManager({ registry, executorFor: () => Promise.resolve(executor), bundledImageDir: () => imageDir });
        try {
            const { link, accessName, accessCode } = outcome.result;
            console.log("link", link);
            expect(link).toContain(host!);
            expect((await fetch(`${link}health`)).status).toBe(200);
            expect((await fetch(link)).status).toBe(401);
            const auth = { headers: { Authorization: `Basic ${Buffer.from(`${accessName ?? ""}:${accessCode ?? ""}`).toString("base64")}` } };
            expect(await (await fetch(link, auth)).text()).toContain("viewer over ssh");
            expect((await manager.list())[0]?.state).toBe("running");
        } finally {
            const removed = await manager.remove(outcome.result.instanceId);
            expect(removed.ok).toBe(true);
        }
        expect(await registry.list()).toEqual([]);
    }, 600_000);
});
