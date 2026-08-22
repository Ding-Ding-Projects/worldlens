import { describe, expect, it } from "vitest";

import {
    buildPlayerCommand,
    isValidPlayerName,
    parseBannedPlayers,
    parseNameUuidList,
    parsePlayerList,
} from "./model.js";

describe("isValidPlayerName", () => {
    it("accepts real Minecraft usernames", () => {
        expect(isValidPlayerName("alice")).toBe(true);
        expect(isValidPlayerName("Bob_The_Builder")).toBe(true);
        expect(isValidPlayerName("_")).toBe(true);
        expect(isValidPlayerName("a".repeat(16))).toBe(true);
    });

    it("rejects empty and over-length names", () => {
        expect(isValidPlayerName("")).toBe(false);
        expect(isValidPlayerName("a".repeat(17))).toBe(false);
    });

    it("THE critical case: rejects a name containing a space, which could forge a second command", () => {
        expect(isValidPlayerName("alice ban bob")).toBe(false);
    });

    it("rejects a name containing a newline", () => {
        expect(isValidPlayerName("alice\nban bob")).toBe(false);
    });

    it("rejects names with punctuation Minecraft never allows", () => {
        expect(isValidPlayerName("alice;drop")).toBe(false);
        expect(isValidPlayerName("alice\"quoted\"")).toBe(false);
        expect(isValidPlayerName("alice.bob")).toBe(false);
        expect(isValidPlayerName("alice/bob")).toBe(false);
    });

    it("rejects non-string input without throwing", () => {
        expect(isValidPlayerName(123 as unknown)).toBe(false);
        expect(isValidPlayerName(null)).toBe(false);
        expect(isValidPlayerName(undefined)).toBe(false);
    });
});

describe("parsePlayerList", () => {
    it("parses zero players online", () => {
        const result = parsePlayerList("There are 0 of a max of 20 players online:");
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual({ online: 0, max: 20, players: [] });
    });

    it("parses several players online", () => {
        const result = parsePlayerList(
            "There are 3 of a max of 20 players online: alice, Bob_The_Builder, carol",
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value.online).toBe(3);
        expect(result.value.max).toBe(20);
        expect(result.value.players.map((player) => player.name)).toEqual([
            "alice",
            "Bob_The_Builder",
            "carol",
        ]);
    });

    it("parses a single player without breaking on the trailing colon variants", () => {
        const result = parsePlayerList("There are 1 of a max of 5 players online: alice");
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value.players).toEqual([{ name: "alice" }]);
    });

    it("tolerates trailing whitespace/newlines from the RCON reply", () => {
        const result = parsePlayerList("There are 1 of a max of 5 players online: alice\n");
        expect(result.ok).toBe(true);
    });

    it("refuses an unrecognised reply shape rather than guessing", () => {
        const result = parsePlayerList("Unknown command");
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses an empty reply", () => {
        const result = parsePlayerList("");
        expect(result.ok).toBe(false);
    });
});

describe("parseNameUuidList (ops.json / whitelist.json)", () => {
    it("parses a well-formed list", () => {
        const json = JSON.stringify([
            { uuid: "11111111-1111-1111-1111-111111111111", name: "alice", level: 4 },
            { uuid: "22222222-2222-2222-2222-222222222222", name: "bob", level: 4 },
        ]);
        const result = parseNameUuidList(json);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual([
            { name: "alice", uuid: "11111111-1111-1111-1111-111111111111" },
            { name: "bob", uuid: "22222222-2222-2222-2222-222222222222" },
        ]);
    });

    it("parses an empty list", () => {
        const result = parseNameUuidList("[]");
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual([]);
    });

    it("drops a malformed entry without failing the whole file", () => {
        const json = JSON.stringify([
            { uuid: "1", name: "alice" },
            { uuid: "2" }, // no name - dropped
            "not even an object", // dropped
            { uuid: "3", name: "carol" },
        ]);
        const result = parseNameUuidList(json);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value.map((entry) => entry.name)).toEqual(["alice", "carol"]);
    });

    it("refuses invalid JSON", () => {
        const result = parseNameUuidList("{not json");
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses JSON that is not a list", () => {
        const result = parseNameUuidList('{"name": "alice"}');
        expect(result.ok).toBe(false);
    });

    it("tolerates a missing uuid field", () => {
        const result = parseNameUuidList(JSON.stringify([{ name: "alice" }]));
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual([{ name: "alice", uuid: null }]);
    });
});

describe("parseBannedPlayers (banned-players.json)", () => {
    it("parses a well-formed ban list with reason, source and expiry", () => {
        const json = JSON.stringify([
            {
                uuid: "11111111-1111-1111-1111-111111111111",
                name: "griefer",
                created: "2026-01-01 00:00:00 +0000",
                source: "Server",
                expires: "forever",
                reason: "Griefing spawn",
            },
        ]);
        const result = parseBannedPlayers(json);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual([
            {
                name: "griefer",
                uuid: "11111111-1111-1111-1111-111111111111",
                reason: "Griefing spawn",
                source: "Server",
                expires: "forever",
            },
        ]);
    });

    it("tolerates missing optional fields", () => {
        const result = parseBannedPlayers(JSON.stringify([{ name: "griefer" }]));
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).toEqual([
            { name: "griefer", uuid: null, reason: null, source: null, expires: null },
        ]);
    });

    it("refuses invalid JSON", () => {
        const result = parseBannedPlayers("not json at all");
        expect(result.ok).toBe(false);
    });
});

describe("buildPlayerCommand: the whole point of this module", () => {
    it("builds op/deop/whitelist/pardon commands for a valid name", () => {
        expect(buildPlayerCommand({ action: "op", name: "alice" })).toEqual({ ok: true, value: "op alice" });
        expect(buildPlayerCommand({ action: "deop", name: "alice" })).toEqual({ ok: true, value: "deop alice" });
        expect(buildPlayerCommand({ action: "whitelist-add", name: "alice" })).toEqual({
            ok: true,
            value: "whitelist add alice",
        });
        expect(buildPlayerCommand({ action: "whitelist-remove", name: "alice" })).toEqual({
            ok: true,
            value: "whitelist remove alice",
        });
        expect(buildPlayerCommand({ action: "pardon", name: "alice" })).toEqual({ ok: true, value: "pardon alice" });
    });

    it("builds kick and ban with a reason", () => {
        expect(buildPlayerCommand({ action: "kick", name: "alice", reason: "AFK too long" })).toEqual({
            ok: true,
            value: "kick alice AFK too long",
        });
        expect(buildPlayerCommand({ action: "ban", name: "alice", reason: "Griefing" })).toEqual({
            ok: true,
            value: "ban alice Griefing",
        });
    });

    it("builds kick and ban with no reason at all", () => {
        expect(buildPlayerCommand({ action: "kick", name: "alice" })).toEqual({ ok: true, value: "kick alice" });
        expect(buildPlayerCommand({ action: "ban", name: "alice" })).toEqual({ ok: true, value: "ban alice" });
    });

    it("THE critical case: refuses every action for a name that could forge a second command", () => {
        const actions = ["op", "deop", "whitelist-add", "whitelist-remove", "kick", "ban", "pardon"] as const;
        for (const action of actions) {
            const result = buildPlayerCommand({ action, name: "alice\nstop" });
            expect(result.ok).toBe(false);
            if (result.ok) throw new Error(`${action} should have refused an injected name`);
            expect(result.failure.code).toBe("invalid-request");
        }
    });

    it("refuses a name with a space specifically (the classic injection shape)", () => {
        const result = buildPlayerCommand({ action: "ban", name: "alice ban admin" });
        expect(result.ok).toBe(false);
    });

    it("strips control characters out of a ban/kick reason rather than passing them through raw", () => {
        const result = buildPlayerCommand({ action: "ban", name: "alice", reason: "line one\nline two" });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value).not.toContain("\n");
        expect(result.value).toBe("ban alice line one line two");
    });

    it("bounds an absurdly long reason", () => {
        const result = buildPlayerCommand({ action: "kick", name: "alice", reason: "x".repeat(10_000) });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("unreachable");
        expect(result.value.length).toBeLessThan(250);
    });
});
