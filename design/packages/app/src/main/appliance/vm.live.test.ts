/**
 * One-click VirtualBox or VMware hosting of an appliance, opt-in.
 *
 * Runs only when `WORLDLENS_LIVE_VBOX_BASE` points at a built appliance base image and
 * VirtualBox is installed. It drives the real builder exactly as the dialog does: compose the
 * disk with a small map, create and start the VM in VirtualBox, wait for its address, and check
 * the link from this PC. It then stops and removes only the VM it created.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApplianceBuilder } from "./builder.js";
import { nodeCommandRunner } from "./commands.js";
import { InstanceRegistry } from "./registry.js";

const base = process.env["WORLDLENS_LIVE_VBOX_BASE"] ?? "";
// "virtualbox" (default) or "vmware": the same test drives either one-click target.
const target = process.env["WORLDLENS_LIVE_VM_TARGET"] === "vmware" ? "vmware" : "virtualbox";

async function sha256(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest("hex");
}

describe.skipIf(base === "")("appliance in a real hypervisor", () => {
    it("composes, starts, answers on its link from this PC, and is removed", async () => {
        const work = await mkdtemp(join(tmpdir(), "worldlens-live-vbox-"));
        const map = join(work, "map");
        await mkdir(map, { recursive: true });
        await writeFile(join(map, "index.html"), "<html>appliance in a hypervisor</html>");
        await writeFile(join(map, "settings.json"), JSON.stringify({ maps: [] }));
        const baseSha = await sha256(base);
        const registry = new InstanceRegistry(join(work, "appliance"));
        const builder = new ApplianceBuilder({
            root: join(work, "appliance"),
            base: () => Promise.resolve({ path: base, sha256: baseSha }),
            runner: nodeCommandRunner,
            diskRunner: null,
            registry,
            vocabulary: () => Promise.resolve({}),
        });
        const tools = await builder.tools();
        console.log("tools", JSON.stringify(tools));
        const result = await builder.build(
            { target, mapRoot: map, vmName: `worldlens-live-${Date.now()}`, network: "nat", memoryMb: 1024, cpus: 2, hostName: "worldlens-live", port: 18190, accessCode: null },
            (progress) => console.log("progress", JSON.stringify(progress).slice(0, 300)),
        );
        console.log("result", JSON.stringify({ ok: result.ok, link: result.link, message: result.message, steps: result.steps.map((s) => `${s.id}:${s.state}:${s.meta}`) }));
        try {
            expect(result.ok).toBe(true);
            const page = await fetch(result.link ?? "");
            expect(page.status).toBe(200);
            expect(await page.text()).toContain("appliance in a hypervisor");
        } finally {
            if (result.instanceId !== null) {
                await builder.stop(result.instanceId, true).catch(() => undefined);
                await builder.remove(result.instanceId);
            }
        }
        expect(await registry.list()).toEqual([]);
    }, 900_000);
});
