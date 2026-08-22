import { describe, expect, it } from "vitest";

import { SessionManager } from "./sessions.js";

function clockAt(startMs: number) {
    let now = startMs;
    return {
        now: () => now,
        advance(ms: number): void {
            now += ms;
        },
    };
}

describe("SessionManager", () => {
    it("accepts a freshly created session", () => {
        const clock = clockAt(0);
        const sessions = new SessionManager({ now: clock.now });
        const token = sessions.create();
        expect(sessions.touch(token)).toBe(true);
    });

    it("rejects an unknown token", () => {
        const sessions = new SessionManager();
        expect(sessions.touch("not-a-real-token")).toBe(false);
    });

    it("rejects a non-string or malformed token without throwing", () => {
        const sessions = new SessionManager();
        expect(sessions.touch(undefined)).toBe(false);
        expect(sessions.touch(123 as unknown as string)).toBe(false);
        expect(sessions.touch("")).toBe(false);
    });

    it("expires on idle timeout", () => {
        const clock = clockAt(0);
        const sessions = new SessionManager({ now: clock.now, idleTimeoutMs: 1_000, absoluteTimeoutMs: 100_000 });
        const token = sessions.create();
        clock.advance(999);
        expect(sessions.touch(token)).toBe(true); // touching resets idle clock
        clock.advance(999);
        expect(sessions.touch(token)).toBe(true);
        clock.advance(1_001);
        expect(sessions.touch(token)).toBe(false);
    });

    it("expires on absolute timeout even when kept active", () => {
        const clock = clockAt(0);
        const sessions = new SessionManager({ now: clock.now, idleTimeoutMs: 100_000, absoluteTimeoutMs: 2_000 });
        const token = sessions.create();
        clock.advance(1_000);
        expect(sessions.touch(token)).toBe(true);
        clock.advance(600);
        expect(sessions.touch(token)).toBe(true);
        clock.advance(600); // total 2200ms since creation - past the absolute cap
        expect(sessions.touch(token)).toBe(false);
    });

    it("revokes exactly one session", () => {
        const sessions = new SessionManager();
        const a = sessions.create();
        const b = sessions.create();
        sessions.revoke(a);
        expect(sessions.touch(a)).toBe(false);
        expect(sessions.touch(b)).toBe(true);
    });

    it("revoke-all clears every session", () => {
        const sessions = new SessionManager();
        const a = sessions.create();
        const b = sessions.create();
        sessions.revokeAll();
        expect(sessions.touch(a)).toBe(false);
        expect(sessions.touch(b)).toBe(false);
    });

    it("revoking an unknown token is a harmless no-op", () => {
        const sessions = new SessionManager();
        expect(() => sessions.revoke("never-issued")).not.toThrow();
    });

    it("mints tokens that do not collide across many creations", () => {
        const sessions = new SessionManager();
        const tokens = new Set<string>();
        for (let i = 0; i < 500; i += 1) tokens.add(sessions.create());
        expect(tokens.size).toBe(500);
    });
});
