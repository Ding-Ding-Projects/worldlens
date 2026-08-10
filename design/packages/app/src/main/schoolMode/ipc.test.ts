import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerSchoolModeHandlers, SCHOOL_MODE_CHANNELS } from "./ipc.js";

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

let applicationDataDirectory: string;
let handlers: Map<string, Handler>;
let ipcMain: {
    handle: (channel: string, handler: Handler) => void;
    removeHandler: (channel: string) => void;
};

beforeEach(async () => {
    applicationDataDirectory = await mkdtemp(join(tmpdir(), "worldlens-school-mode-ipc-"));
    handlers = new Map();
    ipcMain = {
        handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
        removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    };
});

afterEach(async () => {
    await rm(applicationDataDirectory, { recursive: true, force: true });
});

describe("School-mode IPC", () => {
    it("registers only the five narrow record operations and removes exactly them on disposal", async () => {
        const registration = registerSchoolModeHandlers(ipcMain as never, { applicationDataDirectory });
        expect([...handlers.keys()].sort()).toEqual(Object.values(SCHOOL_MODE_CHANNELS).sort());

        const enable = handlers.get(SCHOOL_MODE_CHANNELS.enable);
        const read = handlers.get(SCHOOL_MODE_CHANNELS.read);
        if (enable === undefined || read === undefined) throw new Error("School-mode handlers were not registered.");

        const credential = "test-only-unlock";
        await expect(enable({}, { name: "Host bridge", credential })).resolves.toMatchObject({
            ok: true,
            state: { enabled: true, name: "Host bridge", credentialConfigured: true },
        });
        const snapshot = await read({});
        expect(JSON.stringify(snapshot)).not.toContain(credential);
        expect(JSON.stringify(snapshot)).not.toContain("hash");
        expect(JSON.stringify(snapshot)).not.toContain("salt");

        registration.dispose();
        expect(handlers.size).toBe(0);
    });
});
