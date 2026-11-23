/**
 * Hosts a real viewer on this machine's real Docker, against a real Minecraft server.
 *
 * Skipped unless explicitly enabled, exactly like the other real-network tests, because it
 * needs a Docker daemon, the staged image (`pnpm --filter @worldlens/app run
 * stage:liveviewer-image`) and a server in offline mode to join:
 *
 *   LIVEVIEWER_REAL_DOCKER=1 LIVEVIEWER_REAL_SERVER=host:25565 npx vitest run \
 *     packages/app/src/main/liveviewer/service.realDocker.test.ts
 *
 * What it proves that the fake-runner tests cannot: that the commands in `plan.ts` are
 * accepted by Docker, that the config reaches the container through the volume, that the
 * container serves the viewer page and health route on the published port, and that the
 * bot actually joins.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@worldlens/liveviewer";
import { readBundledImage } from "./bundledImage.js";
import { InstanceRegistry } from "./registry.js";
import { LiveViewerService } from "./service.js";

const ENABLED = process.env.LIVEVIEWER_REAL_DOCKER === "1" && (process.env.LIVEVIEWER_REAL_SERVER ?? "") !== "";
const here = fileURLToPath(new URL(".", import.meta.url));
const stagedImage = resolve(here, "../../../dist/liveviewer");

describe.skipIf(!ENABLED)("real Docker", () => {
    it("hosts a viewer, joins a real server, answers on the LAN link, and removes everything it made", async () => {
        const [host, portText] = (process.env.LIVEVIEWER_REAL_SERVER as string).split(":");
        const folder = await mkdtemp(join(tmpdir(), "lv-real-"));
        try {
            const service = new LiveViewerService({
                registry: new InstanceRegistry(folder),
                owner: "real-docker-test",
                resolveSsh: () => null,
                accounts: null,
                bundledImage: () => readBundledImage(stagedImage),
                healthTimeoutMs: 120_000,
            });
            const answer = await service.host({
                config: { ...DEFAULT_CONFIG, server: { host: host as string, port: Number(portText ?? 25565) }, botName: "LensBotTest" },
                target: { kind: "local" },
                hostPort: 3917,
                name: "Real Docker test",
            });
            expect(answer.ok, JSON.stringify(answer.ok ? "" : answer.failure)).toBe(true);
            if (!answer.ok) return;
            expect(answer.verification.linkReachable).toBe(true);
            expect(answer.verification.botJoined).toBe(true);

            const page = await fetch(answer.instance.url);
            expect(page.status).toBe(200);
            expect(await page.text()).toContain("<title>");

            const listed = await service.list();
            expect(listed[0]).toMatchObject({ state: "running", botConnected: true });

            const removed = await service.remove(answer.instance.id, "Real Docker test");
            expect(removed.ok).toBe(true);
        } finally {
            await rm(folder, { recursive: true, force: true });
        }
    }, 300_000);
});
