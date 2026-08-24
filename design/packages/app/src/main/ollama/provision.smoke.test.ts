import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { ensureOllamaRuntime, restartOllamaRuntime, stopOllamaRuntime, waitForOllamaReadiness } from "./provision.js";

const execFileAsync = promisify(execFile);

describe("task-owned managed Ollama smoke", () => {
    it("downloads, verifies, serves, versions, stops, restarts and cleans the pinned runtime", async () => {
        if (process.env.RUN_OLLAMA_RUNTIME_SMOKE !== "1") return;
        const root = await mkdtemp(join(tmpdir(), "worldlens-ollama-task-smoke-"));
        try {
            const answer = await ensureOllamaRuntime({ dataDir: root });
            expect(answer.ok, answer.ok ? "" : answer.message).toBe(true);
            if (!answer.ok) return;
            await expect(execFileAsync(answer.state.executable, ["--version"], { windowsHide: true })).resolves.toBeTruthy();
            expect(stopOllamaRuntime(answer.state.executable)).toBe(true);
            restartOllamaRuntime(answer.state.executable);
            await expect(waitForOllamaReadiness()).resolves.toBeUndefined();
            expect(stopOllamaRuntime(answer.state.executable)).toBe(true);
        } finally { stopOllamaRuntime(); await rm(root, { recursive: true, force: true }); }
    }, 15 * 60_000);
});
