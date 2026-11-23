import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseLiveViewerConfig } from "./config.js";

function valid(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Record<string, unknown>;
}

function mutate(change: (config: Record<string, any>) => void): ReturnType<typeof parseLiveViewerConfig> {
    const config = valid() as Record<string, any>;
    change(config);
    return parseLiveViewerConfig(config);
}

describe("parseLiveViewerConfig", () => {
    it("accepts the defaults", () => {
        const result = parseLiveViewerConfig(valid());
        expect(result.ok).toBe(true);
    });

    it("names the first wrong field", () => {
        const cases: [string, (c: Record<string, any>) => void][] = [
            ["schema", (c) => (c.schema = 2)],
            ["kind", (c) => (c.kind = "map")],
            ["server.host", (c) => (c.server.host = "bad host!")],
            ["server.port", (c) => (c.server.port = 70000)],
            ["version", (c) => (c.version = "latest")],
            ["botName", (c) => (c.botName = "no")],
            ["auth", (c) => (c.auth = "password")],
            ["viewDistance", (c) => (c.viewDistance = 40)],
            ["camera", (c) => (c.camera = "orbit")],
            ["mouseLook", (c) => (c.mouseLook = "yes")],
            ["behaviours.reconnect.delaySeconds", (c) => (c.behaviours.reconnect.delaySeconds = 0)],
            ["behaviours.reconnect.tries", (c) => (c.behaviours.reconnect.tries = 5000)],
            ["behaviours.follow.player", (c) => (c.behaviours.follow.player = "bad name")],
            ["behaviours.lookAtPlayers", (c) => (c.behaviours.lookAtPlayers = 1)],
        ];
        for (const [field, change] of cases) {
            const result = mutate(change);
            expect(result.ok, field).toBe(false);
            if (!result.ok) expect(result.field).toBe(field);
        }
    });

    it("requires a player name when following is on", () => {
        const result = mutate((c) => {
            c.behaviours.follow.enabled = true;
            c.behaviours.follow.player = "";
        });
        expect(result.ok).toBe(false);
        const ok = mutate((c) => {
            c.behaviours.follow.enabled = true;
            c.behaviours.follow.player = "Steve";
        });
        expect(ok.ok).toBe(true);
    });

    it("accepts a bracketed IPv6 host and a pinned version", () => {
        const result = mutate((c) => {
            c.server.host = "[fd00::1]";
            c.version = "1.21.4";
        });
        expect(result.ok).toBe(true);
    });

    it("rejects non-object input and oversized vocabulary values", () => {
        expect(parseLiveViewerConfig(null).ok).toBe(false);
        expect(parseLiveViewerConfig([]).ok).toBe(false);
        const huge = mutate((c) => (c.vocabulary = { a: "x".repeat(401) }));
        expect(huge.ok).toBe(false);
    });

    it("does not let a vocabulary key reach the prototype", () => {
        const result = parseLiveViewerConfig(JSON.parse('{"schema":1,"kind":"viewer","server":{"host":"a.example","port":25565},"version":"auto","botName":"LensBot","auth":"offline","viewDistance":6,"camera":"follow","mouseLook":true,"showPlayers":true,"showChat":true,"behaviours":{"reconnect":{"enabled":true,"delaySeconds":10,"tries":5},"follow":{"enabled":false,"player":""},"lookAtPlayers":false,"relayChat":true,"sleepAtNight":false},"vocabulary":{"__proto__":"x"}}'));
        expect(result.ok).toBe(true);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});
