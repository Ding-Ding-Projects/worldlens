import { describe, expect, it } from "vitest";
import { PINNED_OLLAMA, readOllamaRuntimeState, resolveOllamaRuntime } from "./index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Ollama runtime acquisition", () => {
    it("keeps an immutable official pin and no manual URL route", () => {
        expect(PINNED_OLLAMA.url).toContain("github.com/ollama/ollama/releases/download/v0.32.5");
        expect(PINNED_OLLAMA.sha256).toHaveLength(64);
        expect(PINNED_OLLAMA.sizeBytes).toBeGreaterThan(1_000_000_000);
        expect(resolveOllamaRuntime({}).origin).toBe("unavailable");
        expect(resolveOllamaRuntime({}).reason).toContain("automatic acquisition");
    });
    it("refuses a missing or stale persisted origin instead of silently trusting it", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-ollama-state-"));
        try { expect(await readOllamaRuntimeState(root)).toBeNull(); } finally { await rm(root, { recursive: true, force: true }); }
    });
});
