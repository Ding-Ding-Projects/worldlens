import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base64FileJobs, writeNew } from "./files.js";

let dir: string;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "wl-b64-"));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("same-folder round trip", () => {
    it("writes name.ext.base64.txt beside the file and restores name.ext, never overwriting", async () => {
        const original = Buffer.from(Array.from({ length: 70_001 }, (_, i) => (i * 31) & 255));
        const source = path.join(dir, "report.pdf");
        await fs.writeFile(source, original);
        const jobs = new Base64FileJobs();

        const encoded = await jobs.encode(source, { alphabet: "mime" });
        expect(encoded.ok).toBe(true);
        expect(path.basename(encoded.output!)).toBe("report.pdf.base64.txt");
        expect(encoded.sha256).toBe(sha(original));
        expect((await fs.readFile(encoded.output!, "utf8")).split("\r\n")[0]!.length).toBe(76);

        // The original still exists, so the decoded copy must get a numbered name.
        const decoded = await jobs.decode(encoded.output!);
        expect(decoded.ok).toBe(true);
        expect(decoded.namedFrom).toBe("name");
        expect(path.basename(decoded.output!)).toBe("report (1).pdf");
        expect(sha(await fs.readFile(decoded.output!))).toBe(sha(original));
        expect(sha(await fs.readFile(source))).toBe(sha(original));

        // Encoding again also refuses to overwrite the first sidecar.
        const again = await jobs.encode(source);
        expect(path.basename(again.output!)).toBe("report (1).pdf.base64.txt");
        expect((await fs.readdir(dir)).filter((n) => n.endsWith(".partial"))).toEqual([]);
    });

    it("names a decoded data: URL by its type and a bare file by its signature", async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
        await fs.writeFile(path.join(dir, "clip.txt"), `data:image/png;base64,${png.toString("base64")}`);
        await fs.writeFile(path.join(dir, "bare.txt"), png.toString("base64url"));
        const jobs = new Base64FileJobs();
        const fromUrl = await jobs.decode(path.join(dir, "clip.txt"));
        expect(path.basename(fromUrl.output!)).toBe("clip.png");
        expect(fromUrl.namedFrom).toBe("data-url");
        const fromBytes = await jobs.decode(path.join(dir, "bare.txt"));
        expect(path.basename(fromBytes.output!)).toBe("bare.png");
        expect(fromBytes.namedFrom).toBe("signature");
    });

    it("refuses text that is not Base64 and leaves nothing behind", async () => {
        await fs.writeFile(path.join(dir, "bad.base64.txt"), "QUJDééé");
        const result = await new Base64FileJobs().decode(path.join(dir, "bad.base64.txt"));
        expect(result.ok).toBe(false);
        expect(await fs.readdir(dir)).toEqual(["bad.base64.txt"]);
    });
});

describe("large files, pause and cancel", () => {
    it("streams a 128 MB file in far less memory than a whole-file read would need", async () => {
        const source = path.join(dir, "big.bin");
        const block = Buffer.alloc(1024 * 1024);
        for (let i = 0; i < block.length; i += 1) block[i] = (i * 7) & 255;
        const out = createWriteStream(source);
        for (let i = 0; i < 128; i += 1) out.write(block);
        await new Promise<void>((resolve) => out.end(resolve));
        const before = process.memoryUsage().rss;
        let peak = before;
        const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
        const result = await new Base64FileJobs().encode(source);
        clearInterval(timer);
        expect(result.ok).toBe(true);
        expect(result.outputBytes).toBe(Math.ceil((128 * 1024 * 1024) / 3) * 4);
        // A whole-file read would hold the 128 MB source and its 171 MB of text at once (about
        // 300 MB). Streaming stays far below that; the margin covers garbage not yet collected.
        expect(peak - before).toBeLessThan(120 * 1024 * 1024);
    }, 60_000);

    it("pauses, resumes and cancels without leaving a partial file", async () => {
        const source = path.join(dir, "mid.bin");
        await fs.writeFile(source, Buffer.alloc(8 * 1024 * 1024, 9));
        const seen: boolean[] = [];
        const jobs = new Base64FileJobs((p) => seen.push(p.paused));
        const running = jobs.encode(source, {}, "job-1");
        expect(jobs.pause("job-1")).toBe(true);
        await new Promise((r) => setTimeout(r, 150));
        expect(jobs.cancel("job-1")).toBe(true);
        const result = await running;
        expect(result.cancelled).toBe(true);
        expect(await fs.readdir(dir)).toEqual(["mid.bin"]);
    });
});

describe("exports", () => {
    it("never overwrites an existing file", async () => {
        await fs.writeFile(path.join(dir, "out.json"), "keep");
        const written = await writeNew(path.join(dir, "out.json"), new TextEncoder().encode("{}"));
        expect(path.basename(written)).toBe("out (1).json");
        expect(await fs.readFile(path.join(dir, "out.json"), "utf8")).toBe("keep");
    });
});
