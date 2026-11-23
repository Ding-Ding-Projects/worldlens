import { describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";
import { parseRequest, parseTarget, registerShareHostHandlers, SHARE_HOST_CHANNELS } from "./ipc.js";
import type { ShareHostService } from "./service.js";

function fakeIpc() {
    const handlers = new Map<string, (event: unknown, value?: unknown) => unknown>();
    const removed: string[] = [];
    const ipcMain = { handle: (c: string, h: (e: unknown, v?: unknown) => unknown) => { handlers.set(c, h); }, removeHandler: (c: string) => { removed.push(c); } } as unknown as IpcMain;
    return { ipcMain, handlers, removed };
}

const good = { renderId: "example", target: { kind: "local" }, name: "bayville-map", port: 8100, maps: ["overworld"], startOnBoot: true, accessCode: true, lan: true };

function service(overrides: Partial<ShareHostService> = {}): ShareHostService {
    return {
        registry: {} as never,
        manager: { list: vi.fn(() => Promise.resolve([])), start: vi.fn(() => Promise.resolve({ ok: true, message: "ok" })), stop: vi.fn(), restart: vi.fn(), update: vi.fn(), remove: vi.fn(() => Promise.resolve({ ok: true, message: "gone" })) } as never,
        check: vi.fn(() => Promise.resolve({ ok: true, where: "this PC", dockerVersion: "27.3", arch: "amd64", message: "" })),
        maps: vi.fn(() => Promise.resolve([{ id: "overworld", bytes: 5 }])),
        checkPort: vi.fn(() => Promise.resolve({ free: true, suggested: 8100 })),
        host: vi.fn(() => Promise.resolve({ ok: true, result: { instanceId: "a1b2c3d4", link: "http://192.0.2.1:8100/", where: "this PC", accessName: null, accessCode: null, checkedAt: "now" } })),
        ...overrides,
    } as ShareHostService;
}

describe("shareHost ipc", () => {
    it("registers every channel and removes them all on dispose", () => {
        const { ipcMain, handlers, removed } = fakeIpc();
        const ipc = registerShareHostHandlers(ipcMain, { service: service(), onEvent: () => undefined });
        expect([...handlers.keys()].sort()).toEqual([...SHARE_HOST_CHANNELS].sort());
        ipc.dispose();
        expect(removed.sort()).toEqual([...SHARE_HOST_CHANNELS].sort());
    });

    it("parses requests strictly", () => {
        expect(parseRequest(good)).toMatchObject({ name: "bayville-map", lan: true });
        expect(parseRequest({ ...good, port: "8100" })).toBeNull();
        expect(parseRequest({ ...good, maps: [1] })).toBeNull();
        expect(parseRequest({ ...good, target: { kind: "ssh" } })).toBeNull();
        expect(parseRequest(null)).toBeNull();
        expect(parseTarget({ kind: "ssh", targetId: "pi" })).toEqual({ kind: "ssh", targetId: "pi" });
        expect(parseTarget({ kind: "other" })).toBeNull();
    });

    it("hosts, forwards progress events with the operation id, and can be cancelled", async () => {
        const { ipcMain, handlers } = fakeIpc();
        const events: unknown[] = [];
        let seenSignal: AbortSignal | undefined;
        const svc = service({
            host: vi.fn((_r: unknown, onEvent: (e: unknown) => void, signal?: AbortSignal) => {
                seenSignal = signal;
                onEvent({ type: "step", step: "pack", state: "running", meta: "", at: "t" });
                return new Promise((resolve) => setTimeout(() => resolve({ ok: false, failure: { step: "pack", message: "cancelled", command: null, exitCode: null, output: "", fix: null } }), 10));
            }) as unknown as ShareHostService["host"],
        });
        registerShareHostHandlers(ipcMain, { service: svc, onEvent: (id, event) => events.push({ id, event }) });
        const pending = handlers.get("shareHost:host")?.({}, { request: good, operationId: "op1" }) as Promise<unknown>;
        await handlers.get("shareHost:cancel")?.({}, "op1");
        await pending;
        expect(seenSignal?.aborted).toBe(true);
        expect(events).toEqual([{ id: "op1", event: expect.objectContaining({ step: "pack" }) }]);
    });

    it("answers an invalid request without calling the service", async () => {
        const { ipcMain, handlers } = fakeIpc();
        const svc = service();
        registerShareHostHandlers(ipcMain, { service: svc, onEvent: () => undefined });
        const answer = await (handlers.get("shareHost:host")?.({}, { request: { nope: true }, operationId: "x" }) as Promise<{ ok: boolean }>);
        expect(answer.ok).toBe(false);
        expect(svc.host).not.toHaveBeenCalled();
        const bad = await (handlers.get("shareHost:remove")?.({}, "../../etc") as Promise<{ ok: boolean }>);
        expect(bad.ok).toBe(false);
        expect(svc.manager.remove).not.toHaveBeenCalled();
    });

    it("never rejects when the service throws", async () => {
        const { ipcMain, handlers } = fakeIpc();
        registerShareHostHandlers(ipcMain, { service: service({ check: vi.fn(() => Promise.reject(new Error("boom"))) }), onEvent: () => undefined });
        const answer = await (handlers.get("shareHost:check")?.({}, { kind: "local" }) as Promise<{ ok: boolean; message: string }>);
        expect(answer.ok).toBe(false);
        expect(answer.message).toBe("boom");
    });
});
