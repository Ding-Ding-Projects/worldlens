/**
 * A region file as a 32 by 32 picture of its chunks.
 *
 * Design: `design/design-sources/nbt-editor-full/Region.dc.html`. Each cell is one chunk slot of
 * the region, placed by its position inside the region (chunk coordinate modulo 32), and shaded
 * by the metric the person picked. A slot with no chunk is drawn empty; a chunk the editor cannot
 * open (an unsupported compression, an external `.mcc` file it cannot reach) is drawn as such and
 * says why. Pure, so placement, shading and the facts line are unit tests.
 */
import type { RegionChunk } from "./nbtEditorBridge.js";

export type RegionMetric = "size" | "saved" | "compression";

export interface RegionCell {
    readonly lx: number;
    readonly lz: number;
    readonly chunk: RegionChunk | null;
    /** 0..1 shade for present chunks; null for empty slots. */
    readonly level: number | null;
    readonly state: "missing" | "present" | "unsupported";
    readonly label: string;
}

const COMPRESSION: Readonly<Record<number, string>> = {
    1: "gzip",
    2: "zlib",
    3: "none",
    4: "LZ4",
    127: "custom",
};

/** `2` → `zlib`, `130` → `zlib, in a .mcc file`. */
export function compressionName(type: number): string {
    const external = type >= 128;
    const base = COMPRESSION[external ? type - 128 : type] ?? `type ${type}`;
    return external ? `${base}, in a .mcc file` : base;
}

export function local(coord: number): number {
    return ((coord % 32) + 32) % 32;
}

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function formatSaved(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "never";
    const d = new Date(timestamp * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Every slot of the region in row order (z then x), shaded by `metric`. */
export function regionCells(chunks: readonly RegionChunk[], metric: RegionMetric): RegionCell[] {
    const bySlot = new Map<number, RegionChunk>();
    for (const c of chunks) bySlot.set(local(c.z) * 32 + local(c.x), c);
    const present = [...bySlot.values()];
    const sizes = present.map((c) => c.size);
    const times = present.map((c) => c.timestamp).filter((t) => t > 0);
    const [minS, maxS] = [Math.min(...sizes), Math.max(...sizes)];
    const [minT, maxT] = [Math.min(...times), Math.max(...times)];
    const span = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 1);
    const cells: RegionCell[] = [];
    for (let lz = 0; lz < 32; lz++) {
        for (let lx = 0; lx < 32; lx++) {
            const chunk = bySlot.get(lz * 32 + lx) ?? null;
            if (chunk === null) {
                cells.push({
                    lx,
                    lz,
                    chunk,
                    level: null,
                    state: "missing",
                    label: `Slot ${lx}, ${lz}: no chunk`,
                });
                continue;
            }
            const unsupported = !chunk.readable;
            const level =
                metric === "size"
                    ? span(chunk.size, minS, maxS)
                    : metric === "saved"
                      ? chunk.timestamp > 0
                          ? span(chunk.timestamp, minT, maxT)
                          : 0
                      : chunk.compressionType === 2
                        ? 0.5
                        : 1;
            const facts =
                metric === "size"
                    ? formatSize(chunk.size)
                    : metric === "saved"
                      ? `saved ${formatSaved(chunk.timestamp)}`
                      : compressionName(chunk.compressionType);
            cells.push({
                lx,
                lz,
                chunk,
                level,
                state: unsupported ? "unsupported" : "present",
                label: `Chunk ${chunk.x}, ${chunk.z}: ${facts}${unsupported ? `, ${chunk.unsupported ?? "cannot be opened here"}` : ""}`,
            });
        }
    }
    return cells;
}

/** Legend ends for the current metric, from the chunks actually present. */
export function legend(
    chunks: readonly RegionChunk[],
    metric: RegionMetric,
): readonly [string, string] {
    if (chunks.length === 0) return ["", ""];
    if (metric === "size") {
        const sizes = chunks.map((c) => c.size);
        return [formatSize(Math.min(...sizes)), formatSize(Math.max(...sizes))];
    }
    if (metric === "saved") {
        const times = chunks.map((c) => c.timestamp).filter((t) => t > 0);
        return times.length === 0
            ? ["never", "never"]
            : [formatSaved(Math.min(...times)), formatSaved(Math.max(...times))];
    }
    return ["zlib", "other"];
}

/** Arrow-key movement inside the 32 by 32 grid, clamped at the edges. */
export function moveFocus(index: number, key: string): number | null {
    const x = index % 32;
    const z = Math.floor(index / 32);
    switch (key) {
        case "ArrowLeft":
            return x > 0 ? index - 1 : index;
        case "ArrowRight":
            return x < 31 ? index + 1 : index;
        case "ArrowUp":
            return z > 0 ? index - 32 : index;
        case "ArrowDown":
            return z < 31 ? index + 32 : index;
        case "Home":
            return z * 32;
        case "End":
            return z * 32 + 31;
        default:
            return null;
    }
}
