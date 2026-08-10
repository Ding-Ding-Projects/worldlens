/**
 * The real runner writing a real file to a real disk.
 *
 * `gh.test.ts` fakes `runToFile` wholesale, which is why a version of it that could never
 * resolve shipped: the download simply hung, and because the credential broker serializes its
 * work, every later gh operation hung behind it until the application restarted. These tests
 * drive the genuine `nodeProcessRunner`, and each carries its own timeout so a regression fails
 * as a failure rather than as a suite that never finishes.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { nodeProcessRunner } from "./gh.js";

let folder: string;

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "worldlens-runtofile-"));
});

afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
});

describe("nodeProcessRunner().runToFile, against a real child process", () => {
    it("resolves for a payload small enough to close before the file flushes", async () => {
        const destination = join(folder, "small.txt");
        const result = await nodeProcessRunner().runToFile(
            process.execPath,
            ["-e", "process.stdout.write('worldlens')"],
            destination,
        );

        expect(result).toMatchObject({ started: true, code: 0, bytes: 9 });
        expect(await readFile(destination, "utf8")).toBe("worldlens");
    }, 15_000);

    it("resolves for a payload large enough to still be flushing at close", async () => {
        const destination = join(folder, "large.txt");
        const result = await nodeProcessRunner().runToFile(
            process.execPath,
            ["-e", "process.stdout.write('x'.repeat(5_000_000))"],
            destination,
        );

        expect(result).toMatchObject({ started: true, code: 0, bytes: 5_000_000 });
        expect((await readFile(destination)).length).toBe(5_000_000);
    }, 30_000);

    it("resolves with the child's failing exit code rather than hanging", async () => {
        const destination = join(folder, "failed.txt");
        const result = await nodeProcessRunner().runToFile(
            process.execPath,
            ["-e", "process.stdout.write('partial'); process.exit(3)"],
            destination,
        );

        expect(result).toMatchObject({ started: true, code: 3 });
    }, 15_000);

    it("reports a missing executable instead of waiting for a close that never comes", async () => {
        const result = await nodeProcessRunner().runToFile(
            join(folder, "definitely-not-here"),
            [],
            join(folder, "unused.txt"),
        );

        expect(result.started).toBe(false);
        expect(result.code).toBeNull();
    }, 15_000);
});
