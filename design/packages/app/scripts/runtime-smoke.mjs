import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureOllamaRuntime, readOllamaRuntimeState, restartOllamaRuntime, rollbackOllamaRuntime, stopOllamaRuntimeAndWait, waitForOllamaReadiness } from "../dist/main/ollama/provision.js";

const execFileAsync = promisify(execFile);
const dataDir = process.env.WORLDLENS_SMOKE_ROOT ?? await mkdtemp(join(tmpdir(), "worldlens-ollama-runtime-smoke-"));
let executable = null;
try {
    const answer = await ensureOllamaRuntime({ dataDir });
    if (!answer.ok) throw new Error(answer.message);
    executable = answer.state.executable;
    await execFileAsync(executable, ["--version"], { windowsHide: true, timeout: 30_000 });
    if (!await stopOllamaRuntimeAndWait(executable)) throw new Error("The managed runtime did not stop.");
    restartOllamaRuntime(executable);
    await waitForOllamaReadiness();
    if (!await stopOllamaRuntimeAndWait(executable)) throw new Error("The managed runtime did not stop after restart.");
    await rollbackOllamaRuntime(dataDir);
    if (await readOllamaRuntimeState(dataDir) !== null) throw new Error("Managed Ollama rollback left persisted runtime state behind.");
    console.log("Managed Ollama runtime smoke verified download, version, readiness, stop, restart, rollback, and cleanup.");
} finally {
    await stopOllamaRuntimeAndWait(executable ?? undefined);
    await rm(dataDir, { recursive: true, force: true });
}
