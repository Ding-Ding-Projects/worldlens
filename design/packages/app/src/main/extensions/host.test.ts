import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installBuiltins } from "./builtins.js";
import { ExtensionHost, MANIFEST_FILE, parseManifest, strippedEnvironment } from "./host.js";

let dir: string;
let host: ExtensionHost;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-ext-"));
    await installBuiltins(path.join(dir, "builtin"));
    host = new ExtensionHost({ builtIn: path.join(dir, "builtin"), user: path.join(dir, "user") }, path.join(dir, "state.json"), process.execPath, { ...process.env, GITHUB_TOKEN: "secret-value" });
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

async function userExtension(id: string, manifest: Record<string, unknown>, main: string): Promise<void> {
    const folder = path.join(dir, "user", id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, MANIFEST_FILE), JSON.stringify({ manifestVersion: 1, id, name: id, version: "1.0.0", run: { command: "node", args: ["main.js"] }, permissions: [], commands: [{ id: "go", title: "Go", input: "none" }], ...manifest }));
    await fs.writeFile(path.join(folder, "main.js"), main);
}

const MARKERS = { markers: [{ set: "Spawn", label: 'Town, "hall"', type: "poi", x: 10, y: 64, z: -20 }, { set: "Spawn", label: "=SUM(A1)", type: "poi", x: 1, y: 2, z: 3 }] };

describe("manifests", () => {
    it("names every problem instead of guessing", () => {
        const bad = parseManifest({ manifestVersion: 2, id: "Bad Id", run: { command: "/usr/bin/evil" }, permissions: ["read-passwords"], commands: [{ id: "x", title: "X", input: "markers" }] });
        expect(bad.manifest).toBeNull();
        expect(bad.problems.join(" ")).toMatch(/manifestVersion.*id must.*name is required.*version must.*run.command.*Unknown permissions: read-passwords.*must declare the read-markers/u);
    });
});

describe("the built-in extensions", () => {
    it("are on, and turn markers into CSV with spreadsheet formulas neutralised", async () => {
        const list = await host.list();
        expect(list.filter((r) => r.builtIn).map((r) => [r.manifest?.id, r.enabled])).toEqual(expect.arrayContaining([["marker-csv", true], ["marker-geojson", true], ["map-report", true]]));
        const out = await host.run("marker-csv", "export", MARKERS);
        expect(out.ok, out.message + out.stderr).toBe(true);
        expect(out.output!.name).toBe("markers.csv");
        expect(out.output!.text.split("\r\n")).toEqual(["set,label,type,x,y,z", 'Spawn,"Town, ""hall""",poi,10,64,-20', `Spawn,"'=SUM(A1)",poi,1,2,3`, ""]);
    });

    it("write GeoJSON and a Markdown report", async () => {
        const geo = await host.run("marker-geojson", "export", MARKERS);
        expect(JSON.parse(geo.output!.text).features[0].geometry.coordinates).toEqual([10, 20, 64]);
        const report = await host.run("map-report", "report", { map: "Bayville", id: "world", markerSets: [{ label: "Spawn", count: 2 }] });
        expect(report.output!.text).toContain("| Spawn | 2 |");
    });
});

describe("running other people's extensions", () => {
    it("asks for consent first and again when permissions change", async () => {
        await userExtension("hello", {}, `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({ok:true,message:"hi"})+"\\n"));`);
        expect((await host.list()).find((r) => r.manifest?.id === "hello")).toMatchObject({ enabled: false, needsConsent: true });
        expect((await host.run("hello", "go", null)).message).toMatch(/permissions changed|Turn the extension on/u);
        await host.setEnabled("hello", true);
        expect((await host.run("hello", "go", null)).message).toBe("hi");
        const file = path.join(dir, "user", "hello", MANIFEST_FILE);
        const m = JSON.parse(await fs.readFile(file, "utf8"));
        await fs.writeFile(file, JSON.stringify({ ...m, permissions: ["read-markers"] }));
        expect((await host.list()).find((r) => r.manifest?.id === "hello")).toMatchObject({ enabled: false, needsConsent: true });
    });

    it("hands over no secrets and only the input the command declares", async () => {
        await userExtension("spy", {}, `let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({ok:true,message:JSON.stringify({env:Object.keys(process.env),req:JSON.parse(d)})})+"\\n"));`);
        await host.setEnabled("spy", true);
        const seen = JSON.parse((await host.run("spy", "go", { markers: [1, 2, 3] })).message);
        expect(seen.env).not.toContain("GITHUB_TOKEN");
        expect(seen.req).toEqual({ protocol: 1, command: "go", input: null });
        expect(Object.keys(strippedEnvironment({ HOME: "/h", AWS_SECRET_ACCESS_KEY: "x", PATH: "/bin" }))).toEqual(["PATH", "WORLDLENS_EXTENSION_PROTOCOL", "PYTHONIOENCODING"]);
    });

    it("stops a program at its time and size limits", async () => {
        await userExtension("slow", { limits: { timeoutMs: 600 } }, "setTimeout(() => {}, 60000);");
        await host.setEnabled("slow", true);
        const slow = await host.run("slow", "go", null);
        expect(slow.ok).toBe(false);
        expect(slow.message).toMatch(/did not answer within 1 seconds/u);
        expect(slow.ms).toBeLessThan(5000);
        await userExtension("loud", { limits: { maxOutputBytes: 2048 } }, `process.stdout.write("x".repeat(100000));`);
        await host.setEnabled("loud", true);
        expect((await host.run("loud", "go", null)).message).toMatch(/passed the 2 KB limit/u);
    });

    it("refuses a program outside its folder and reports a bad answer plainly", async () => {
        await userExtension("escape", { run: { command: "../../bin/sh" } }, "");
        expect((await host.list()).find((r) => r.folder.endsWith("escape"))?.problems.join(" ")).toMatch(/run.command/u);
        await userExtension("noisy", {}, `console.log("hello there");`);
        await host.setEnabled("noisy", true);
        expect((await host.run("noisy", "go", null)).message).toBe("It answered with something that is not one JSON line.");
    });
});
