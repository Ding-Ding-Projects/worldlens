import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MANIFEST_FILE } from "./host.js";

/**
 * The extensions that ship with Worldlens. They use the same manifest, protocol, permissions
 * and limits as anyone else's, and run in their own process on the app's own runtime, so they
 * are also the working proof that the protocol does what the author article says.
 *
 * They are written out to the app's data folder on start (and rewritten only when their files
 * change), because a packaged app's resources are read-only and the host runs extensions from
 * folders.
 */

const READ_REQUEST = `
function readRequest(done) {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { data += c; });
  process.stdin.on("end", () => {
    try { done(JSON.parse(data)); }
    catch (e) { answer({ ok: false, message: "The request was not JSON." }); }
  });
}
function answer(value) { process.stdout.write(JSON.stringify(value) + "\\n"); }
`;

export const BUILTIN_EXTENSIONS: readonly { readonly id: string; readonly files: Readonly<Record<string, string>> }[] = [
    {
        id: "marker-csv",
        files: {
            [MANIFEST_FILE]: JSON.stringify(
                {
                    manifestVersion: 1,
                    id: "marker-csv",
                    name: "Markers as CSV",
                    version: "1.0.0",
                    description: "Writes every marker of the open map as a spreadsheet-ready CSV: set, label, type and block position.",
                    run: { command: "node", args: ["main.js"] },
                    permissions: ["read-markers", "produce-file"],
                    commands: [{ id: "export", title: "Markers as CSV", input: "markers" }],
                    limits: { timeoutMs: 10000, maxOutputBytes: 4194304 },
                },
                null,
                2,
            ),
            "main.js": `"use strict";${READ_REQUEST}
const cell = (v) => { if (typeof v === "number") return Number.isFinite(v) ? String(v) : ""; const s = v === null || v === undefined ? "" : String(v); return /[",\\r\\n]/.test(s) || /^[=+\\-@]/.test(s) ? '"' + (/^[=+\\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"' : s; };
readRequest((request) => {
  const markers = Array.isArray(request.input && request.input.markers) ? request.input.markers : [];
  const rows = [["set", "label", "type", "x", "y", "z"]];
  for (const m of markers) rows.push([m.set, m.label, m.type, m.x, m.y, m.z]);
  answer({ ok: true, message: markers.length + " markers written.", output: { kind: "text", name: "markers.csv", text: rows.map((r) => r.map(cell).join(",")).join("\\r\\n") + "\\r\\n" } });
});
`,
        },
    },
    {
        id: "marker-geojson",
        files: {
            [MANIFEST_FILE]: JSON.stringify(
                {
                    manifestVersion: 1,
                    id: "marker-geojson",
                    name: "Markers as GeoJSON",
                    version: "1.0.0",
                    description: "Writes the open map's markers as GeoJSON points (x east, z south, y as height) for mapping and GIS tools.",
                    run: { command: "node", args: ["main.js"] },
                    permissions: ["read-markers", "produce-file"],
                    commands: [{ id: "export", title: "Markers as GeoJSON", input: "markers" }],
                    limits: { timeoutMs: 10000, maxOutputBytes: 8388608 },
                },
                null,
                2,
            ),
            "main.js": `"use strict";${READ_REQUEST}
readRequest((request) => {
  const markers = Array.isArray(request.input && request.input.markers) ? request.input.markers : [];
  const features = markers.filter((m) => Number.isFinite(m.x) && Number.isFinite(m.z)).map((m) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [m.x, -m.z, Number.isFinite(m.y) ? m.y : 0] },
    properties: { set: m.set, label: m.label, type: m.type, x: m.x, y: m.y, z: m.z },
  }));
  answer({ ok: true, message: features.length + " points written.", output: { kind: "text", name: "markers.geojson", text: JSON.stringify({ type: "FeatureCollection", features: features }, null, 2) } });
});
`,
        },
    },
    {
        id: "map-report",
        files: {
            [MANIFEST_FILE]: JSON.stringify(
                {
                    manifestVersion: 1,
                    id: "map-report",
                    name: "Map report",
                    version: "1.0.0",
                    description: "Writes a short Markdown report of the open map: its name and id and how many markers each set has.",
                    run: { command: "node", args: ["main.js"] },
                    permissions: ["read-map-summary", "produce-file"],
                    commands: [{ id: "report", title: "Map report (Markdown)", input: "map-summary" }],
                    limits: { timeoutMs: 10000, maxOutputBytes: 1048576 },
                },
                null,
                2,
            ),
            "main.js": `"use strict";${READ_REQUEST}
const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[|\\\\\`*_[\\]<>]/g, (c) => "\\\\" + c);
readRequest((request) => {
  const s = request.input || {};
  const sets = Array.isArray(s.markerSets) ? s.markerSets : [];
  const total = sets.reduce((n, x) => n + (Number(x.count) || 0), 0);
  const lines = ["# " + esc(s.map || "Map"), ""];
  if (s.id) lines.push("- Map id: " + esc(s.id));
  if (s.world) lines.push("- World: " + esc(s.world));
  if (s.dimension) lines.push("- Dimension: " + esc(s.dimension));
  lines.push("- Markers: " + total, "");
  if (sets.length) { lines.push("| Marker set | Markers |", "| --- | ---: |"); for (const x of sets) lines.push("| " + esc(x.label) + " | " + (Number(x.count) || 0) + " |"); }
  answer({ ok: true, message: "Report written.", output: { kind: "text", name: "map-report.md", text: lines.join("\\n") + "\\n" } });
});
`,
        },
    },
];

/** Writes the built-in extensions into `root`, rewriting a file only when it changed. */
export async function installBuiltins(root: string): Promise<void> {
    for (const ext of BUILTIN_EXTENSIONS) {
        const dir = path.join(root, ext.id);
        await fs.mkdir(dir, { recursive: true });
        for (const [name, text] of Object.entries(ext.files)) {
            const file = path.join(dir, name);
            const current = await fs.readFile(file, "utf8").catch(() => null);
            if (current !== null && createHash("sha256").update(current).digest("hex") === createHash("sha256").update(text).digest("hex")) continue;
            await fs.writeFile(file, text, "utf8");
        }
    }
}
