/**
 * Test doubles for the hosting tests: a scripted executor and a bundled image on disk.
 *
 * A scripted answer table, first match wins, and an unmatched command fails the test by
 * answering 127 with a message that names it, so a code path nobody scripted cannot pass by
 * quietly succeeding.
 */
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandOutput } from "@worldlens/dockhand";
import type { Executor } from "./exec.js";

export function out(partial: Partial<CommandOutput> = {}): CommandOutput {
    return {
        ok: partial.ok ?? true,
        exitCode: partial.exitCode ?? (partial.ok === false ? 1 : 0),
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

export interface Script { readonly when: RegExp; readonly answer: CommandOutput | (() => CommandOutput) }

export interface FakeExecutor extends Executor {
    readonly calls: string[];
    readonly stdinFiles: string[];
}

export function fakeExecutor(script: readonly Script[], kind: "local" | "ssh" = "local", label = "this PC"): FakeExecutor {
    const calls: string[] = [];
    const stdinFiles: string[] = [];
    const answer = (line: string): CommandOutput => {
        calls.push(line);
        for (const entry of script) if (entry.when.test(line)) return typeof entry.answer === "function" ? entry.answer() : entry.answer;
        return out({ ok: false, exitCode: 127, stderr: `the fake executor was not told what to answer for: ${line}` });
    };
    return {
        kind, docker: "docker", label, calls, stdinFiles,
        exec: (command, args) => Promise.resolve(answer(`${command} ${args.join(" ")}`)),
        execWithStdin: (command, args, options) => { stdinFiles.push(options.stdinFile); return Promise.resolve(answer(`${command} ${args.join(" ")} <stdin`)); },
    };
}

/** A bundled image folder: a manifest and a tar whose checksum really matches. */
export async function bundledImageFixture(arch: "amd64" | "arm64" = "amd64", layers: readonly string[] = ["sha256:layer1"]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "worldlens-image-"));
    const body = Buffer.from(`image-${arch}`);
    await writeFile(join(dir, `worldlens-map-server-${arch}.tar`), body);
    await writeFile(join(dir, "mapserver-image.json"), JSON.stringify({
        version: 1, image: "worldlens-map-server", tag: "bundled", appVersion: "0.1.0",
        images: { [arch]: { file: `worldlens-map-server-${arch}.tar`, sha256: createHash("sha256").update(body).digest("hex"), layers } },
    }));
    return dir;
}
