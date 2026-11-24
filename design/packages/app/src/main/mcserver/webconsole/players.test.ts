import { describe, expect, it } from "vitest";
import { cleanCommand, knownPlayers, sendCommand } from "./players.js";
import { fail, ok } from "../transport/types.js";

function files(map: Record<string, string>) {
    return {
        fileRead: async (path: string) =>
            map[path] === undefined
                ? fail<never>("not-found", "missing")
                : ok({ bytes: new Uint8Array(Buffer.from(map[path]!)), hash: "h", size: 1, truncated: false }),
    };
}

describe("players on the management site", () => {
    it("merges the server's player files by name", async () => {
        const answer = await knownPlayers(
            files({
                "usercache.json": JSON.stringify([{ name: "Steve", uuid: "u1" }, { name: "Alex", uuid: "u2" }]),
                "ops.json": JSON.stringify([{ name: "steve", uuid: "u1", level: 4 }]),
                "whitelist.json": JSON.stringify([{ name: "Alex", uuid: "u2" }]),
                "banned-players.json": JSON.stringify([{ name: "Herobrine", uuid: "u3", reason: "spooky" }]),
            }),
        );
        expect(answer.ok && answer.value).toEqual([
            { name: "Alex", uuid: "u2", op: false, whitelisted: true, banned: false, banReason: null },
            { name: "Herobrine", uuid: "u3", op: false, whitelisted: false, banned: true, banReason: "spooky" },
            { name: "Steve", uuid: "u1", op: true, whitelisted: false, banned: false, banReason: null },
        ]);
    });

    it("says so when the server has never run", async () => {
        const answer = await knownPlayers(files({}));
        expect(answer.ok).toBe(false);
    });

    it("cleans a typed command and sends it once through a console session", async () => {
        expect(cleanCommand("/say hi")).toEqual({ ok: true, value: "say hi" });
        expect(cleanCommand("say hi\nop me").ok).toBe(false);
        expect(cleanCommand("").ok).toBe(false);
        const sent: string[] = [];
        let detached = false;
        const answer = await sendCommand(
            {
                attach: async () =>
                    ok({
                        lines: (async function* () {})(),
                        send: async (c: string) => {
                            sent.push(c);
                            return ok(undefined);
                        },
                        closed: new Promise(() => {}),
                        detach: () => {
                            detached = true;
                        },
                    }) as never,
            },
            "list",
        );
        expect(answer.ok).toBe(true);
        expect(sent).toEqual(["list"]);
        expect(detached).toBe(true);
    });
});
