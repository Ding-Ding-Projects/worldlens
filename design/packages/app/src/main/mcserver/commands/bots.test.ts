import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
    MineflayerSession,
    type BotProfile,
    type MineflayerBot,
    type MineflayerRuntime,
} from "../bots/mineflayer.js";
const profile: BotProfile = {
    id: "bot",
    engine: "mineflayer",
    host: "127.0.0.1",
    port: 25565,
    accountRef: "protected:1",
    navigation: false,
    target: {
        serverId: "s",
        version: "1.21.4",
        distributionSha256: "a".repeat(64),
        connectionEpoch: "1",
        principalId: "p",
        permissionRevision: "1",
    },
};
function runtime(): { bot: MineflayerBot; runtime: MineflayerRuntime } {
    const bot = Object.assign(new EventEmitter(), {
        version: "1.21.4",
        _client: new EventEmitter(),
        loadPlugin: () => {},
        quit: () => {},
        chat: () => {},
    });
    return {
        bot,
        runtime: { version: "4.39.0", supportedVersions: ["1.21.4"], createBot: () => bot },
    };
}
describe("actual bot lifecycle observation", () => {
    it("does not claim connected before spawn and stops on actual connection end", async () => {
        const fixture = runtime();
        const session = new MineflayerSession(profile, fixture.runtime);
        await session.start(async () => ({ username: "TestBot", auth: "offline" }));
        expect(session.status.state).toBe("starting");
        (fixture.bot as unknown as EventEmitter).emit("spawn");
        expect(session.status.state).toBe("connected");
        (fixture.bot as unknown as EventEmitter).emit("end");
        expect(session.status.state).toBe("stopped");
    });
    it("does not connect after a cancelled protected-account resolution", async () => {
        const fixture = runtime();
        const session = new MineflayerSession(profile, fixture.runtime);
        let release!: (value: { username: string; auth: "offline" }) => void;
        const starting = session.start(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        );
        session.stop();
        release({ username: "TestBot", auth: "offline" });
        await starting;
        expect(session.status.state).toBe("stopped");
    });
    it("refuses unsupported 26.3 and unavailable navigation", () => {
        const fixture = runtime();
        expect(
            () =>
                new MineflayerSession(
                    { ...profile, target: { ...profile.target, version: "26.3" } },
                    fixture.runtime,
                ),
        ).toThrow("not supported");
        expect(
            () => new MineflayerSession({ ...profile, navigation: true }, fixture.runtime),
        ).toThrow("unavailable");
    });
    it("does not publish raw connection errors or server kick text", async () => {
        const fixture = runtime();
        const session = new MineflayerSession(profile, fixture.runtime);
        await session.start(async () => ({ username: "TestBot", auth: "offline" }));
        (fixture.bot as unknown as EventEmitter).emit(
            "error",
            new Error("sensitive account input"),
        );
        expect(session.status.state).toBe("failed");
        expect(JSON.stringify(session.status)).not.toContain("sensitive");
    });
});

import { spawn } from "node:child_process";
import { BaritoneSession } from "../bots/baritone.js";
function waitFor(session: BaritoneSession, state: string): Promise<void> {
    if (session.status.state === state) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error(`Missing state: ${state}`));
        }, 3000);
        const unsubscribe = session.onStatus((status) => {
            if (status.state === state) {
                clearTimeout(timer);
                unsubscribe();
                resolve();
            }
        });
    });
}
describe("owned Java bridge process controller", () => {
    it("waits for bridge world telemetry and sends navigation/cancellation to its owned child", async () => {
        // This child is a protocol fixture, not a Java or Minecraft runtime acceptance claim.
        const fixture = `
            const readline = require('node:readline');
            const emit = data => console.log('WORLDLENS_BOT_V1 ' + JSON.stringify({ version: '1.21.4', bridgeVersion: '1.0.0', ...data }));
            setTimeout(() => emit({state:'status',dimension:'minecraft:overworld',x:0,y:64,z:0,pathing:false}), 20);
            readline.createInterface({input:process.stdin}).on('line', line => {
                const request = JSON.parse(line);
                if(request.action === 'goto') emit({state:'accepted',id:request.id});
                if(request.action === 'cancel') emit({state:'cancelled',id:request.id});
                if(request.action === 'stop') process.exit(0);
            });
        `;
        const child = spawn(process.execPath, ["-e", fixture], { windowsHide: true });
        const session = new BaritoneSession(
            { ...profile, engine: "baritone" },
            {
                clientDirectory: "owned",
                bridgeJar: "bridge.jar",
                bridgeSha256: "a".repeat(64),
                baritoneJar: "baritone.jar",
                javaMajor: 21,
                minecraftVersion: "1.21.4",
                fabricLoader: "0.16.9",
            },
            { launch: async () => child },
        );
        try {
            await session.start();
            expect(session.status.state).toBe("starting");
            await waitFor(session, "connected");
            session.navigate({
                kind: "point",
                dimension: "minecraft:overworld",
                x: 1,
                y: 64,
                z: 2,
            });
            await waitFor(session, "navigating");
            session.cancelNavigation();
            await waitFor(session, "connected");
            session.stop();
            expect(session.status.state).toBe("stopping");
            await waitFor(session, "stopped");
        } finally {
            child.kill();
        }
    });
    it("refuses mismatched Java/distribution profiles before launching", () => {
        expect(
            () =>
                new BaritoneSession(
                    {
                        ...profile,
                        engine: "baritone",
                        target: { ...profile.target, version: "26.3" },
                    },
                    {
                        clientDirectory: "owned",
                        bridgeJar: "bridge.jar",
                        bridgeSha256: "a".repeat(64),
                        baritoneJar: "baritone.jar",
                        javaMajor: 21,
                        minecraftVersion: "26.3",
                        fabricLoader: "0.16.9",
                    },
                    {
                        launch: async () => {
                            throw new Error("must not run");
                        },
                    },
                ),
        ).toThrow("requires Java");
    });
});
