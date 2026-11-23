import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuthCache, parseSecretFile } from "./authCache.js";
import { BotSupervisor, buildBotOptions, isNight } from "./bot.js";
import { DEFAULT_CONFIG, type LiveViewerConfig } from "./config.js";
import { customiseIndex, escapeHtml, overlayScript } from "./view.js";
import { relevantVocabulary, replaceWhole } from "./vocabulary.js";
import { proxyAllowList, webClientDefaults } from "./webClient.js";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";

function config(change: Partial<LiveViewerConfig> = {}): LiveViewerConfig {
    return { ...DEFAULT_CONFIG, server: { host: "mc.example", port: 25565 }, ...change };
}

describe("vocabulary", () => {
    it("replaces whole strings only", () => {
        expect(replaceWhole("Chat", { Chat: "Talk" })).toBe("Talk");
        expect(replaceWhole("Chat window", { Chat: "Talk" })).toBe("Chat window");
        expect(replaceWhole("chat", { Chat: "Talk" })).toBe("Talk");
    });

    it("sends the container only the entries it can display", () => {
        const subset = relevantVocabulary({ "Live viewer": "Viewer X", "Settings": "Gear", Chat: "Talk" });
        expect(subset).toEqual({ "Live viewer": "Viewer X", Chat: "Talk" });
        expect(Object.keys(subset)).not.toContain("Settings");
    });
});

describe("authCache", () => {
    const folders: string[] = [];
    afterEach(() => {
        for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
    });

    it("rejects a secret file that is not the expected shape", () => {
        expect(parseSecretFile("not json")).toBeNull();
        expect(parseSecretFile(JSON.stringify({ version: 2, clientId: CLIENT_ID, caches: {} }))).toBeNull();
        expect(parseSecretFile(JSON.stringify({ version: 1, clientId: "x", caches: {} }))).toBeNull();
        expect(parseSecretFile(JSON.stringify({ version: 1, clientId: CLIENT_ID, caches: [] }))).toBeNull();
        expect(parseSecretFile(JSON.stringify({ version: 1, clientId: CLIENT_ID, caches: { live: { token: "t" } } }))).not.toBeNull();
    });

    it("writes refreshed tokens back to the same file with owner-only mode", async () => {
        const folder = mkdtempSync(join(tmpdir(), "lv-auth-"));
        folders.push(folder);
        const path = join(folder, "auth.json");
        writeFileSync(path, JSON.stringify({ version: 1, clientId: CLIENT_ID, caches: { live: { token: "old" } } }));
        const cache = loadAuthCache(path);
        expect(cache).not.toBeNull();
        const live = cache!.factory({ cacheName: "live" });
        expect(await live.getCached()).toEqual({ token: "old" });
        await live.setCachedPartial({ refreshed: true });
        const stored = JSON.parse(readFileSync(path, "utf8")) as { caches: { live: unknown } };
        expect(stored.caches.live).toEqual({ token: "old", refreshed: true });
        const unknown = cache!.factory({ cacheName: "xbl" });
        expect(await unknown.getCached()).toEqual({});
    });

    it("returns null for a missing file", () => {
        expect(loadAuthCache(join(tmpdir(), "does-not-exist-lv.json"))).toBeNull();
    });
});

describe("buildBotOptions", () => {
    it("leaves the version to detection when it is auto", () => {
        const options = buildBotOptions(config(), null) as unknown as Record<string, unknown>;
        expect(options.version).toBeUndefined();
        expect(options.auth).toBe("offline");
        expect(options.host).toBe("mc.example");
    });

    it("pins a chosen version", () => {
        expect((buildBotOptions(config({ version: "1.20.4" }), null) as unknown as Record<string, unknown>).version).toBe("1.20.4");
    });

    it("uses the cache factory, never a token, for Microsoft sign-in", () => {
        const factory = () => ({ getCached: async () => ({}), setCached: async () => undefined, setCachedPartial: async () => undefined, reset: async () => undefined });
        const options = buildBotOptions(config({ auth: "microsoft" }), { clientId: CLIENT_ID, factory }) as unknown as Record<string, unknown>;
        expect(options.auth).toBe("microsoft");
        expect(options.profilesFolder).toBe(factory);
        expect(JSON.stringify(Object.keys(options))).not.toMatch(/token|password/i);
    });
});

describe("isNight", () => {
    it("covers the bed window", () => {
        expect(isNight(6000)).toBe(false);
        expect(isNight(13000)).toBe(true);
        expect(isNight(23459)).toBe(true);
        expect(isNight(23460)).toBe(false);
    });
});

class FakeBot extends EventEmitter {
    username = "LensBot";
    version = "1.21.4";
    quit = vi.fn();
    end = vi.fn();
}

describe("BotSupervisor", () => {
    it("reports connected after spawn and announces the join with the vocabulary applied", () => {
        const bots: FakeBot[] = [];
        const supervisor = new BotSupervisor({
            config: config({ vocabulary: { "Joined the server": "Arrived" } }),
            authCache: null,
            createBot: () => {
                const bot = new FakeBot();
                bots.push(bot);
                return bot as never;
            },
        });
        const lines: string[] = [];
        supervisor.on("chat", (line) => lines.push(line.text));
        supervisor.start();
        expect(supervisor.health().state).toBe("connecting");
        bots[0]!.emit("spawn");
        expect(supervisor.health()).toMatchObject({ state: "connected", botConnected: true, minecraftVersion: "1.21.4" });
        expect(lines).toEqual(["Arrived"]);
    });

    it("reconnects after a kick, up to the configured tries, then fails", () => {
        vi.useFakeTimers();
        try {
            const bots: FakeBot[] = [];
            const supervisor = new BotSupervisor({
                config: config({ behaviours: { ...DEFAULT_CONFIG.behaviours, reconnect: { enabled: true, delaySeconds: 2, tries: 2 } } }),
                authCache: null,
                createBot: () => {
                    const bot = new FakeBot();
                    bots.push(bot);
                    return bot as never;
                },
            });
            supervisor.start();
            bots[0]!.emit("kicked", "Server restarting");
            expect(supervisor.health()).toMatchObject({ state: "reconnecting", lastError: expect.stringContaining("kicked") });
            vi.advanceTimersByTime(2000);
            expect(bots).toHaveLength(2);
            bots[1]!.emit("end", "closed");
            expect(supervisor.health().state).toBe("failed");
            vi.advanceTimersByTime(60_000);
            expect(bots).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("gives up an attempt that never spawns and never errors, as a silent server does", () => {
        vi.useFakeTimers();
        try {
            const bots: FakeBot[] = [];
            const supervisor = new BotSupervisor({
                config: config({ behaviours: { ...DEFAULT_CONFIG.behaviours, reconnect: { enabled: true, delaySeconds: 5, tries: 3 } } }),
                authCache: null,
                joinTimeoutMs: 10_000,
                createBot: () => {
                    const bot = new FakeBot();
                    bots.push(bot);
                    return bot as never;
                },
            });
            supervisor.start();
            vi.advanceTimersByTime(9_999);
            expect(supervisor.health().state).toBe("connecting");
            vi.advanceTimersByTime(1);
            expect(supervisor.health()).toMatchObject({ state: "reconnecting", lastError: "timed out waiting to join the server" });
            expect(bots[0]!.end).toHaveBeenCalled();
            vi.advanceTimersByTime(5_000);
            expect(bots).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not reconnect when the behaviour is off", () => {
        const bots: FakeBot[] = [];
        const supervisor = new BotSupervisor({
            config: config({ behaviours: { ...DEFAULT_CONFIG.behaviours, reconnect: { enabled: false, delaySeconds: 1, tries: 5 } } }),
            authCache: null,
            createBot: () => {
                const bot = new FakeBot();
                bots.push(bot);
                return bot as never;
            },
        });
        supervisor.start();
        bots[0]!.emit("error", new Error("ECONNREFUSED"));
        expect(supervisor.health().state).toBe("failed");
    });

    it("stops cleanly and quits the bot", () => {
        const bots: FakeBot[] = [];
        const supervisor = new BotSupervisor({ config: config(), authCache: null, createBot: () => { const b = new FakeBot(); bots.push(b); return b as never; } });
        supervisor.start();
        supervisor.stop();
        expect(supervisor.health().state).toBe("stopped");
        expect(bots[0]!.quit).toHaveBeenCalled();
    });
});

describe("viewer page", () => {
    const html = "<html><head><title>Prismarine Viewer</title></head><body></body></html>";

    it("replaces the title and escapes it", () => {
        expect(customiseIndex(html, config(), 'A <b>"x"</b>')).toContain("<title>A &lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>");
        expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;");
    });

    it("disables canvas pointer input when mouse look is off and adds the chat panel only when chat is on", () => {
        const off = customiseIndex(html, config({ mouseLook: false, showChat: false }), "T");
        expect(off).toContain("pointer-events:none");
        expect(off).not.toContain("overlay.js");
        const on = customiseIndex(html, config({ mouseLook: true, showChat: true }), "T");
        expect(on).not.toContain("pointer-events:none");
        expect(on).toContain("/lv/overlay.js");
    });

    it("builds an overlay that writes text, never markup", () => {
        const script = overlayScript("Talk", "Waiting");
        expect(script).toContain("textContent");
        expect(script).not.toContain("innerHTML");
        expect(script).toContain('"Talk"');
    });
});

describe("web client", () => {
    it("allows the proxy to reach exactly the configured server", () => {
        expect(proxyAllowList(config())).toEqual([{ host: "mc.example", port: 25565 }]);
    });

    it("defaults to the configured address and the detected version", () => {
        expect(webClientDefaults(config(), "1.20.1")).toMatchObject({ defaultHost: "mc.example", defaultHostPort: 25565, defaultVersion: "1.20.1" });
        expect(webClientDefaults(config({ version: "1.19.4" }), "1.20.1").defaultVersion).toBe("1.19.4");
        expect(webClientDefaults(config(), null).defaultVersion).toBe("1.18.2");
    });
});
