import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface RuntimeReachabilityEntry {
    readonly id: string;
    readonly implementation: string;
    readonly implementationBoundary: RegExp;
    readonly caller: string;
    readonly callerBoundary: RegExp;
}

/**
 * Hand-written inventory of complete runtime surfaces that must have a production caller.
 *
 * Keep each boundary exact: a descendant selector, commented-out call, or renamed symbol
 * must not satisfy this proof. New complete runtime handlers/classes belong here before they
 * can be considered reachable.
 */
const RUNTIME_REACHABILITY_INVENTORY: readonly RuntimeReachabilityEntry[] = [
    {
        id: "engine-process",
        implementation: "process.ts",
        implementationBoundary: /^export class EngineProcess\b/m,
        caller: "../render/orchestrator.ts",
        callerBoundary: /^\s*: new EngineProcess\(\{/m,
    },
    {
        id: "container-handoff-store",
        implementation: "handoff.ts",
        implementationBoundary: /^export class ContainerHandoffStore\b/m,
        caller: "../render/ipc.ts",
        callerBoundary: /^\s*options\.containers \?\? new ContainerHandoffStore\(\{/m,
    },
    {
        id: "container-reattacher",
        implementation: "reattach.ts",
        implementationBoundary: /^export class ContainerReattacher\b/m,
        caller: "../index.ts",
        callerBoundary: /^\s*const reattacher = new ContainerReattacher\(\{/m,
    },
    {
        id: "runtime-ipc-handlers",
        implementation: "ipc.ts",
        implementationBoundary: /^export function registerRuntimeHandlers\(/m,
        caller: "../index.ts",
        callerBoundary: /^\s*runtimeIpc = registerRuntimeHandlers\(ipcMain, \{ reattacher \}\);/m,
    },
];

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));

async function source(relativePath: string): Promise<string> {
    return await readFile(resolve(runtimeDirectory, relativePath), "utf8");
}

describe("runtime reachability inventory", () => {
    it("keeps a non-empty, unique hand-written inventory", () => {
        const ids = RUNTIME_REACHABILITY_INVENTORY.map((entry) => entry.id);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each(RUNTIME_REACHABILITY_INVENTORY)("$id has an exact implementation boundary and production caller", async (entry) => {
        const implementation = await source(entry.implementation);
        const caller = await source(entry.caller);

        expect(implementation).toMatch(entry.implementationBoundary);
        expect(caller).toMatch(entry.callerBoundary);
    });
});
