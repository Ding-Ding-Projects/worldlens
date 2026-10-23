import { expect, test } from "vitest";
import { ManagedImageOperations } from "./images.js";
import type { ProcessRunner } from "../cirender/gh.js";
const id = "sha256:" + "a".repeat(64);
test("upload requires explicit destination review and reads back the immutable manifest", async () => {
    const calls: string[][] = [];
    const runner: ProcessRunner = {
        async run(command, args) { calls.push([command, ...args]); return { started: true, code: 0, stdout: args.includes("--raw") ? JSON.stringify({ config: { digest: id } }) : args.includes("imagetools") ? JSON.stringify({ digest: id }) : "", stderr: "" }; },
        async runToFile() { throw new Error("unused"); },
    };
    const operations = new ManagedImageOperations(runner);
    await expect(operations.upload(id, { registry: "docker.io", namespace: "owner", repository: "map", tag: "v1", confirmed: false } as never)).rejects.toThrow("Review");
    expect(calls).toHaveLength(0);
    expect(await operations.upload(id, { registry: "docker.io", namespace: "owner", repository: "map", tag: "v1", confirmed: true })).toEqual({ reference: "docker.io/owner/map@" + id, digest: id });
    expect(calls).toEqual([
        ["docker", "image", "tag", id, "docker.io/owner/map:v1"],
        ["docker", "image", "push", "docker.io/owner/map:v1"],
        ["docker", "buildx", "imagetools", "inspect", "docker.io/owner/map:v1", "--format", "{{json .Manifest}}"],
        ["docker", "buildx", "imagetools", "inspect", "docker.io/owner/map@" + id, "--raw"],
    ]);
});
test("nonzero process exit stops upload before manifest verification", async () => {
    const calls: string[][] = [];
    const runner: ProcessRunner = { async run(command, args) { calls.push([command, ...args]); return { started: true, code: 1, stdout: "", stderr: "private diagnostic" }; }, async runToFile() { throw new Error("unused"); } };
    await expect(new ManagedImageOperations(runner).upload(id, { registry: "docker.io", namespace: "owner", repository: "map", tag: "v1", confirmed: true })).rejects.toThrow("did not complete");
    expect(calls).toHaveLength(1);
});
