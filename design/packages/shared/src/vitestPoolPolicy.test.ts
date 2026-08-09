import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const configPath = fileURLToPath(new URL("../../../vitest.config.ts", import.meta.url));
const configSource = readFileSync(configPath, "utf8");

function hasSafePoolPolicy(source: string): boolean {
    const executableSource = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");

    return (
        /pool:\s*["']forks["']/u.test(executableSource) &&
        /maxForks:\s*1/u.test(executableSource) &&
        /minForks:\s*1/u.test(executableSource) &&
        !/singleFork:\s*true/u.test(executableSource) &&
        !/isolate:\s*false/u.test(executableSource)
    );
}

describe("the full-suite worker boundary", () => {
    it("uses one isolated fork without the memory-unsafe singleFork mode", () => {
        expect(hasSafePoolPolicy(configSource)).toBe(true);
    });

    it("rejects the reproduced two-fork setting and both unsafe isolation shortcuts", () => {
        expect(hasSafePoolPolicy(configSource.replace("maxForks: 1", "maxForks: 2"))).toBe(false);
        expect(hasSafePoolPolicy(configSource.replace("minForks: 1", "minForks: 2"))).toBe(false);
        expect(hasSafePoolPolicy(`${configSource}\nsingleFork: true`)).toBe(false);
        expect(hasSafePoolPolicy(`${configSource}\nisolate: false`)).toBe(false);
    });
});
