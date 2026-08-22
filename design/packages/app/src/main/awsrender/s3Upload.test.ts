/**
 * Putting a world into S3, against a fake process runner.
 *
 * The assertions worth reading twice are the negative ones, and they encode the two
 * decisions this route was built on.
 *
 * **A world past 1.5 GB uploads as one object.** The Actions route splits a world into
 * verified parts because a GitHub release asset caps at 1.5 GB. S3 has no such ceiling,
 * so importing that splitting here would cost a whole extra pass over the world for a
 * limitation belonging to a service that is not involved. If somebody ever wires the
 * packer into this path, this test goes red before the wasted pass ships.
 *
 * **A reuse is only ever a digest match.** Matching on size alone would eventually render
 * somebody's old world and report it as their new one, which is the worst failure this
 * file can have because it looks like a success.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256File } from "@worldlens/parts";
import { awsCliLease } from "./credentialBroker.js";
import { S3_DIGEST_METADATA_KEY, uploadToS3 } from "./s3Upload.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "../cirender/gh.js";

interface Call {
    readonly command: string;
    readonly args: readonly string[];
}

interface FakeRunner extends ProcessRunner {
    readonly calls: Call[];
    /** Answers keyed by the first meaningful argument pair, e.g. "s3api head-object". */
    reply(match: string, result: Partial<ProcessResult>): void;
}

function fakeRunner(): FakeRunner {
    const calls: Call[] = [];
    const replies = new Map<string, Partial<ProcessResult>>();

    const answerFor = (args: readonly string[]): ProcessResult => {
        for (const [match, reply] of replies) {
            if (args.join(" ").includes(match)) {
                return { started: true, code: 0, stdout: "", stderr: "", ...reply };
            }
        }
        return { started: true, code: 0, stdout: "", stderr: "" };
    };

    return {
        calls,
        reply(match, result) {
            replies.set(match, result);
        },
        async run(command, args): Promise<ProcessResult> {
            calls.push({ command, args });
            return answerFor(args);
        },
        async runToFile(command, args): Promise<ProcessToFileResult> {
            calls.push({ command, args });
            return { started: true, code: 0, bytes: 0, stderr: "" };
        },
    };
}

let directory = "";

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "worldlens-s3-"));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

function leaseOver(runner: ProcessRunner) {
    return awsCliLease({ profile: "render", region: "eu-west-2", accountId: "123", runner });
}

describe("uploadToS3", () => {
    it("never reaches for the Actions route's part-splitting machinery", async () => {
        // A structural guard rather than a behavioural one, and deliberately so. Proving
        // "no splitting" by uploading something past 1.5 GB would mean writing 1.5 GB to
        // a temporary directory on every run of the suite - and a fixture that merely
        // *claims* a large size proves nothing about the code path, because the claim
        // never reaches the splitter either way.
        //
        // What actually goes wrong is somebody importing the packer here to "reuse" it.
        // That is exactly what this reads, and it goes red the moment it happens.
        const raw = await readFile(new URL("./s3Upload.ts", import.meta.url), "utf8");
        // Strip comments first. The file's own header explains why it does not import the
        // packer, and a guard that reads prose would fire on that explanation - which it
        // did, the first time this was written. A guard matching the documentation of the
        // rule rather than a breach of it is worse than none, because the only way to
        // quieten it is to delete the explanation.
        const source = raw
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

        // Anchored to import lines and call sites, never a bare substring: a renamed
        // symbol that still contains the old name must not satisfy this.
        expect(source).not.toMatch(/^\s*import[^\n]*\bfrom\s+["'][^"']*\/upload\.js["']/m);
        expect(source).not.toMatch(/\bCI_UPLOAD_PART_SIZE_BYTES\b/);
        expect(source).not.toMatch(/\bsplitFile\s*\(/);
        expect(source).not.toMatch(/\bmanifestNameFor\s*\(/);
        expect(source).not.toMatch(/\buploadWorldForRender\s*\(/);
    });

    it("reuses an object only when the digest matches, and transfers nothing when it does", async () => {
        const filePath = join(directory, "world.zip");
        await writeFile(filePath, "a world");
        const digest = await sha256File(filePath);
        const bytes = Buffer.byteLength("a world");

        const runner = fakeRunner();
        runner.reply("head-object", {
            stdout: JSON.stringify({
                ContentLength: bytes,
                Metadata: { [S3_DIGEST_METADATA_KEY]: digest },
            }),
        });

        const result = await uploadToS3({
            lease: leaseOver(runner),
            bucket: "worlds",
            key: "big/world.zip",
            filePath,
        });

        expect(result.reused).toBe(true);
        // Nothing was transferred at all, which is the whole point of the reuse branch.
        const copies = runner.calls.filter(
            (call) => call.args[4] === "s3" && call.args[5] === "cp",
        );
        expect(copies).toHaveLength(0);
    });

    it("transfers exactly one object, never a sequence of parts", async () => {
        const filePath = join(directory, "world.zip");
        await writeFile(filePath, "a world that is not there yet");

        const runner = fakeRunner();
        let headCalls = 0;
        runner.reply("head-object", { code: 1, stderr: "Not Found" });

        // First head-object answers 404 so the upload runs; the verifying head-object
        // afterwards must answer with the real length.
        const realRun = runner.run.bind(runner);
        runner.run = async (command, args) => {
            const result = await realRun(command, args);
            if (args.includes("head-object")) {
                headCalls += 1;
                if (headCalls > 1) {
                    return {
                        started: true,
                        code: 0,
                        stdout: JSON.stringify({ ContentLength: 29 }),
                        stderr: "",
                    };
                }
            }
            return result;
        };

        const result = await uploadToS3({
            lease: leaseOver(runner),
            bucket: "worlds",
            key: "big/world.zip",
            filePath,
        });

        expect(result.reused).toBe(false);
        const copies = runner.calls.filter(
            (call) => call.args[4] === "s3" && call.args[5] === "cp",
        );
        expect(copies).toHaveLength(1);
    });

    it("refuses to reuse an object whose digest does not match, even at the same size", async () => {
        const filePath = join(directory, "world.zip");
        await writeFile(filePath, "the new world");

        const runner = fakeRunner();
        let headCalls = 0;
        const realRun = runner.run.bind(runner);
        runner.run = async (command, args) => {
            if (args.includes("head-object")) {
                headCalls += 1;
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify({
                        ContentLength: 13,
                        Metadata: { [S3_DIGEST_METADATA_KEY]: "sha256:somebody-elses-world" },
                    }),
                    stderr: "",
                };
            }
            return realRun(command, args);
        };

        const result = await uploadToS3({
            lease: leaseOver(runner),
            bucket: "worlds",
            key: "big/world.zip",
            filePath,
        });

        expect(headCalls).toBeGreaterThan(0);
        expect(result.reused).toBe(false);
    });

    it("fails loudly when the object lands at the wrong size", async () => {
        const filePath = join(directory, "world.zip");
        await writeFile(filePath, "twelve bytes");

        const runner = fakeRunner();
        let headCalls = 0;
        const realRun = runner.run.bind(runner);
        runner.run = async (command, args) => {
            if (args.includes("head-object")) {
                headCalls += 1;
                if (headCalls === 1) {
                    return { started: true, code: 1, stdout: "", stderr: "Not Found" };
                }
                return {
                    started: true,
                    code: 0,
                    stdout: JSON.stringify({ ContentLength: 3 }),
                    stderr: "",
                };
            }
            return realRun(command, args);
        };

        await expect(
            uploadToS3({
                lease: leaseOver(runner),
                bucket: "worlds",
                key: "big/world.zip",
                filePath,
            }),
        ).rejects.toThrow(/is 3 bytes, not 12/);
    });
});
