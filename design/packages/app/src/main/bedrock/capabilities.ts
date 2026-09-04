/** Read capabilities from the selected executable jar, never from its filename. */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
async function sha256File(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}
export interface ChunkerCapabilities { jarSha256: string; version: string; formats: string[]; options: string[] }
export async function probeChunker(java: string, jar: string): Promise<ChunkerCapabilities> {
    const hash = await sha256File(jar);
    const run = (args: string[]) => new Promise<string>((resolve, reject) => {
        const child = spawn(java, ["-jar", jar, ...args], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error("Chunker capability probe exceeded 30 seconds.")); }, 30_000);
        const receive = (chunk: Buffer) => { output += chunk.toString(); if (output.length > 512_000) { child.kill(); reject(new Error("Chunker capability response exceeds 512 KB.")); } };
        child.stdout.on("data", receive); child.stderr.on("data", receive);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", () => { clearTimeout(timer); resolve(output); });
    });
    const version = (await run(["--version"])).trim();
    const help = await run(["--help"]);
    const invalid = await run(["-f", "__WORLDLENS_CAPABILITY_PROBE__"]);
    const formats = [...new Set(invalid.match(/\b(?:JAVA|BEDROCK)_[A-Z0-9_]+\b/g) ?? [])];
    const options = [...new Set(help.match(/--[A-Za-z][A-Za-z0-9]+/g) ?? [])];
    if (!formats.length || !options.includes("--outputFormat")) throw new Error("The selected jar did not report its supported formats and options.");
    if (await sha256File(jar) !== hash) throw new Error("The selected Chunker jar changed during inspection.");
    return { jarSha256: hash, version, formats, options };
}
