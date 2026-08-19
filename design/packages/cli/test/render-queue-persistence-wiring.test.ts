import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cliSource = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

function sourceLines(source: string): string[] {
    return source.replaceAll("\r\n", "\n").split("\n");
}

function exactLineIndex(lines: string[], line: string, from = 0): number {
    return lines.findIndex((candidate, index) => index >= from && candidate === line);
}

function exactLineCount(lines: string[], line: string): number {
    return lines.filter((candidate) => candidate === line).length;
}

function assertCliPersistenceWiring(source: string): void {
    const lines = sourceLines(source);
    const importLine = 'import { RenderQueuePersistence } from "@worldlens/server";';
    const mapBuildLine = "            maps = built.maps;";
    const terminalBoundary = "            if (actions.render !== null || actions.startWebserver !== null) {";
    const constructorLine = "                renderQueuePersistence = new RenderQueuePersistence(renderManager, {";
    const fileLine = '                    file: join(resolveConfigPath(loaded.core.data), "tasks.dat"),';
    const mapsLine = "                    maps,";
    const startupLine = "                await renderQueuePersistence.start();";

    expect(exactLineIndex(lines, importLine)).toBeGreaterThanOrEqual(0);
    const mapBuildIndex = exactLineIndex(lines, mapBuildLine);
    expect(mapBuildIndex).toBeGreaterThanOrEqual(0);

    const terminalBoundaryIndex = exactLineIndex(lines, terminalBoundary, mapBuildIndex + 1);
    expect(terminalBoundaryIndex).toBeGreaterThan(mapBuildIndex);

    const constructorIndexes: number[] = [];
    for (let index = exactLineIndex(lines, constructorLine); index >= 0; index = exactLineIndex(lines, constructorLine, index + 1)) {
        constructorIndexes.push(index);
    }
    expect(constructorIndexes).toHaveLength(2);
    expect(constructorIndexes[0]).toBeGreaterThan(terminalBoundaryIndex);
    expect(constructorIndexes[1]).toBeGreaterThan(constructorIndexes[0]);

    for (const constructorIndex of constructorIndexes) {
        expect(exactLineIndex(lines, fileLine, constructorIndex + 1)).toBeLessThan(constructorIndex + 6);
        expect(exactLineIndex(lines, mapsLine, constructorIndex + 1)).toBeLessThan(constructorIndex + 6);
        expect(exactLineIndex(lines, startupLine, constructorIndex + 1)).toBeLessThan(constructorIndex + 12);
    }

    expect(exactLineCount(lines, fileLine)).toBe(2);
    expect(exactLineCount(lines, startupLine)).toBe(2);
}

function assertShutdownPersistenceWiring(source: string): void {
    const lines = sourceLines(source);
    const shutdownLine = "    await result.renderQueuePersistence?.shutdown();";
    expect(exactLineCount(lines, shutdownLine)).toBe(1);
}

describe("CLI render queue persistence startup and shutdown wiring", () => {
    it("imports and constructs persistence after maps are built at both startup paths", () => {
        assertCliPersistenceWiring(cliSource);
    });

    it("uses the resolved core.data directory and tasks.dat for every persistence instance", () => {
        const lines = sourceLines(cliSource);
        expect(exactLineCount(lines, '                    file: join(resolveConfigPath(loaded.core.data), "tasks.dat"),')).toBe(2);
    });

    it("starts every constructed persistence instance before the CLI action continues", () => {
        const lines = sourceLines(cliSource);
        const constructorLine = "                renderQueuePersistence = new RenderQueuePersistence(renderManager, {";
        const startupLine = "                await renderQueuePersistence.start();";
        let constructorIndex = -1;
        for (let count = 0; count < 2; count += 1) {
            constructorIndex = exactLineIndex(lines, constructorLine, constructorIndex + 1);
            const startupIndex = exactLineIndex(lines, startupLine, constructorIndex + 1);
            expect(startupIndex).toBeGreaterThan(constructorIndex);
            expect(startupIndex - constructorIndex).toBeLessThan(12);
        }
    });

    it("keeps persistence behind the render-or-webserver terminal action boundary", () => {
        const lines = sourceLines(cliSource);
        const boundaryIndex = exactLineIndex(lines, "            if (actions.render !== null || actions.startWebserver !== null) {");
        const firstConstructorIndex = exactLineIndex(lines, "                renderQueuePersistence = new RenderQueuePersistence(renderManager, {", boundaryIndex + 1);
        expect(boundaryIndex).toBeGreaterThanOrEqual(0);
        expect(firstConstructorIndex).toBeGreaterThan(boundaryIndex);
        expect(exactLineIndex(lines, "        } else if (actions.updateMarkers !== null) {")).toBeGreaterThan(firstConstructorIndex);
    });

    it("flushes the queue through persistence shutdown during executable shutdown", () => {
        assertShutdownPersistenceWiring(indexSource);
    });

    it("turns red when the exact startup or shutdown wiring is commented or removed, then returns green", () => {
        expect(() => assertCliPersistenceWiring(cliSource.replace("                await renderQueuePersistence.start();", "                // await renderQueuePersistence.start();"))).toThrow();
        expect(() => assertCliPersistenceWiring(cliSource.replace("                await renderQueuePersistence.start();", ""))).toThrow();

        expect(() => assertShutdownPersistenceWiring(indexSource.replace("    await result.renderQueuePersistence?.shutdown();", "    // await result.renderQueuePersistence?.shutdown();"))).toThrow();
        expect(() => assertShutdownPersistenceWiring(indexSource.replace("    await result.renderQueuePersistence?.shutdown();", ""))).toThrow();

        expect(() => assertCliPersistenceWiring(cliSource)).not.toThrow();
        expect(() => assertShutdownPersistenceWiring(indexSource)).not.toThrow();
    });
});
