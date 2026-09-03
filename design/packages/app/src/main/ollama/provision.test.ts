import { describe, expect, it } from "vitest";
import { PINNED_OLLAMA, readOllamaRuntimeState, resolveOllamaRuntime } from "./index.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
    it("rehashes a persisted executable before trusting the managed runtime", async () => {
        const root = await mkdtemp(join(tmpdir(), "worldlens-ollama-rehash-"));
        try {
            const runtimeRoot = join(root, "ollama-runtime");
            await mkdir(runtimeRoot, { recursive: true });
            const executable = join(runtimeRoot, "ollama.exe");
            const bytes = Buffer.from("verified executable");
            await writeFile(executable, bytes);
            const executableSha256 = createHash("sha256").update(bytes).digest("hex");
            await writeFile(join(runtimeRoot, "state.json"), JSON.stringify({ version: "v0.32.5", origin: "managed", executable, asset: PINNED_OLLAMA.asset, sha256: PINNED_OLLAMA.sha256, executableSha256, installedAt: new Date().toISOString() }));
            expect(await readOllamaRuntimeState(root)).not.toBeNull();
            await writeFile(executable, Buffer.from("tampered executable"));
            expect(await readOllamaRuntimeState(root)).toBeNull();
        } finally { await rm(root, { recursive: true, force: true }); }
    });
});
