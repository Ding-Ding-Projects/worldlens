/**
 * Hosting against a real local Docker daemon.
 *
 * Skipped unless `WORLDLENS_LIVE_DOCKER=1`, and it needs the image tagged
 * `worldlens-map-server:bundled` to exist (`docker build -t worldlens-map-server:bundled
 * design/packages/mapserver`). It proves what the scripted tests cannot: that the real image
 * unpacks a real tar into a volume, serves the files with and without the `.gz` suffix,
 * enforces the access code, answers `/health` from this PC at the detected LAN address, and
 * that the manager removes exactly what was created.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localExecutor } from "./exec.js";
import { hostMap, type HostMapDeps } from "./hostMap.js";
import { ShareHostManager } from "./manager.js";
import { createMemoryRegistry } from "./registry.js";

const live = process.env["WORLDLENS_LIVE_DOCKER"] === "1";

describe.skipIf(!live)("hostMap against a real Docker daemon", () => {
    it("hosts, serves, protects, lists and removes a map", async () => {
        const work = await mkdtemp(join(tmpdir(), "worldlens-live-"));
        const arch = execFileSync("docker", ["info", "--format", "{{.Architecture}}"]).toString().trim();
        const archName = arch === "aarch64" ? "arm64" : "amd64";
        const imageTar = join(work, "image.tar");
        execFileSync("docker", ["save", "worldlens-map-server:bundled", "-o", imageTar]);
        const layers = JSON.parse(execFileSync("docker", ["image", "inspect", "--format", "{{json .RootFS.Layers}}", "worldlens-map-server:bundled"]).toString()) as string[];
        // Remove it so the run below has to stream the tar through a real `docker load`.
        execFileSync("docker", ["rmi", "worldlens-map-server:bundled"]);
        const imageDir = join(work, "image");
        await mkdir(imageDir);
        const tarBody = await readFile(imageTar);
        await writeFile(join(imageDir, `worldlens-map-server-${archName}.tar`), tarBody);
        await writeFile(join(imageDir, "mapserver-image.json"), JSON.stringify({ version: 1, image: "worldlens-map-server", tag: "bundled", appVersion: "live", images: { [archName]: { file: `worldlens-map-server-${archName}.tar`, sha256: createHash("sha256").update(tarBody).digest("hex"), layers } } }));

        const web = join(work, "web");
        await mkdir(join(web, "maps", "overworld"), { recursive: true });
        await writeFile(join(web, "index.html"), "<html>viewer</html>");
        await writeFile(join(web, "settings.json"), JSON.stringify({ maps: ["overworld"] }));
        await writeFile(join(web, "maps", "overworld", "0.prbm.gz"), Buffer.from("gz-tile"));

        const registry = createMemoryRegistry();
        const executor = localExecutor();
        const deps: HostMapDeps = { executorFor: () => Promise.resolve(executor), webRootFor: () => web, bundledImageDir: () => imageDir, registry, tempDir: () => work, healthAttempts: 20 };
        const outcome = await hostMap(deps, { renderId: "live", target: { kind: "local" }, name: "live-test", port: 18100, maps: ["overworld"], startOnBoot: false, accessCode: true, lan: true }, (e) => { if (e.type === "step") console.log(e.step, e.state, e.meta); });
        if (!outcome.ok) throw new Error(JSON.stringify(outcome.failure));
        const manager = new ShareHostManager({ registry, executorFor: () => Promise.resolve(executor), bundledImageDir: () => imageDir });
        try {
            const { link, accessName, accessCode } = outcome.result;
            console.log("link", link);
            expect((await fetch(`${link}health`)).status).toBe(200);
            expect((await fetch(link)).status).toBe(401);
            const auth = { headers: { Authorization: `Basic ${Buffer.from(`${accessName ?? ""}:${accessCode ?? ""}`).toString("base64")}` } };
            expect(await (await fetch(link, auth)).text()).toContain("viewer");
            const raw = await fetch(`${link}maps/overworld/0.prbm.gz`, auth);
            expect(Buffer.from(await raw.arrayBuffer()).toString()).toBe("gz-tile");
            const settings = (await (await fetch(`${link}settings.json`, auth)).json()) as { clientDecompression: boolean };
            expect(settings.clientDecompression).toBe(true);
            const listed = await manager.list();
            expect(listed[0]?.state).toBe("running");
        } finally {
            const removed = await manager.remove(outcome.result.instanceId);
            expect(removed.ok).toBe(true);
        }
        expect(await registry.list()).toEqual([]);
    }, 240_000);
});
