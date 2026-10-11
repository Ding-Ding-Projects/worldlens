import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "../runtime/command.js";
import { MCSERVER_CHANNELS, registerMcServerHandlers, type IpcMainLike } from "./ipc.js";

vi.mock("../runtime/command.js", async (original) => ({
    ...await original<typeof import("../runtime/command.js")>(),
    execFileCommandRunner: vi.fn(),
}));

describe("production local adoption runner", () => {
    it.each([false, true])("reaches the default runner without factory injection: unavailable=%s", async (unavailable) => {
        const folder = await mkdtemp(join(tmpdir(), "wl-default-adoption-"));
        const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
        const ipc: IpcMainLike = {
            handle: (channel, handler) => { handlers.set(channel, handler as (...args: never[]) => Promise<unknown>); },
            removeHandler: (channel) => { handlers.delete(channel); },
        };
        const output: CommandOutput = unavailable
            ? { ok: false, exitCode: 1, stdout: "", stderr: "Fixture daemon unavailable", spawnError: null }
            : { ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null };
        vi.mocked(execFileCommandRunner).mockReset().mockResolvedValue(output);
        const registration = registerMcServerHandlers(ipc, { dataFolder: folder, safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("Unavailable in this fixture"); }, decryptString: () => { throw new Error("Unavailable in this fixture"); } } });
        try {
            const result = await handlers.get(MCSERVER_CHANNELS.adoptDiscover)!({} as never) as {
                ok: boolean; value?: readonly unknown[]; failure?: { code: string; message: string };
            };
            expect(execFileCommandRunner).toHaveBeenCalledOnce();
            expect(vi.mocked(execFileCommandRunner).mock.calls[0]?.[1]).toEqual(["ps", "-a", "--format", "{{json .}}"]);
            if (unavailable) {
                expect(result.ok).toBe(false);
                expect(result.failure?.code).toBe("unreachable");
            } else expect(result).toMatchObject({ ok: true, value: [] });
        } finally {
            registration.dispose();
            await rm(folder, { recursive: true, force: true });
        }
    });

    it("prefers an injected runner over the production default", async () => {
        const folder = await mkdtemp(join(tmpdir(), "wl-injected-adoption-"));
        const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
        const ipc: IpcMainLike = {
            handle: (channel, handler) => { handlers.set(channel, handler as (...args: never[]) => Promise<unknown>); },
            removeHandler: (channel) => { handlers.delete(channel); },
        };
        const injected = vi.fn<CommandRunner>().mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null });
        vi.mocked(execFileCommandRunner).mockReset();
        const registration = registerMcServerHandlers(ipc, { dataFolder: folder, safeStorage: { isEncryptionAvailable: () => false, encryptString: () => { throw new Error("Unavailable in this fixture"); }, decryptString: () => { throw new Error("Unavailable in this fixture"); } }, factory: { runner: injected } });
        try {
            await handlers.get(MCSERVER_CHANNELS.adoptDiscover)!({} as never);
            expect(injected).toHaveBeenCalledOnce();
            expect(execFileCommandRunner).not.toHaveBeenCalled();
        } finally {
            registration.dispose();
            await rm(folder, { recursive: true, force: true });
        }
    });
});
