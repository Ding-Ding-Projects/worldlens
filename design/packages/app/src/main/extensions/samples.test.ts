import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExtensionHost } from "./host.js";

/** The author guide's samples, run exactly as an installed extension would be. */
const samples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../docs/extensions-samples");
const hasPython = (() => {
    try {
        execFileSync("python3", ["--version"]);
        return true;
    } catch {
        return false;
    }
})();

let dir: string;
let host: ExtensionHost;
beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-ext-samples-"));
    host = new ExtensionHost({ builtIn: path.join(dir, "none"), user: samples }, path.join(dir, "state.json"));
});
afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const input = { markers: [{ set: "Spawn", label: "Hall", type: "poi", x: 0, y: 70, z: 0 }, { set: "Mines", label: "Shaft", type: "poi", x: 5, y: -40, z: 9 }] };

describe("the author guide's samples", () => {
    it("lists both with valid manifests", async () => {
        const list = await host.list();
        expect(list.map((r) => [r.manifest?.id, r.problems])).toEqual(expect.arrayContaining([["marker-count-python", []], ["marker-heights-node", []]]));
    });

    it("runs the Node sample", async () => {
        await host.setEnabled("marker-heights-node", true);
        const out = await host.run("marker-heights-node", "heights", input);
        expect(out.ok, out.message + out.stderr).toBe(true);
        expect(out.output!.text.split("\n")[0]).toContain("Hall");
    });

    it.runIf(hasPython)("runs the Python sample", async () => {
        await host.setEnabled("marker-count-python", true);
        const out = await host.run("marker-count-python", "count", input);
        expect(out.ok, out.message + out.stderr).toBe(true);
        expect(out.output!.text).toContain("set  Mines: 1");
    });
});
