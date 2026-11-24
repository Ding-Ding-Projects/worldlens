import { describe, expect, it } from "vitest";
import { installDataPack, levelName } from "./datapackInstall.js";
import { fail, ok } from "./transport/types.js";

const ZIP = new Uint8Array(Buffer.from("504b0506000000000000000000000000000000000000", "hex"));

function fakeTransport(props: string | null, existing: string[] = []) {
    const writes: { path: string; kind: unknown; expectedHash: unknown }[] = [];
    const dirs: string[] = [];
    return {
        writes,
        dirs,
        fileRead: async () =>
            props === null
                ? fail<never>("not-found", "no file")
                : ok({ bytes: new Uint8Array(Buffer.from(props)), hash: "h", size: props.length, truncated: false }),
        fileList: async () => ok(existing.map((name) => ({ name, kind: "file" as const, size: 1, modifiedAt: null }))),
        dirEnsure: async (path: string) => {
            dirs.push(path);
            return ok(undefined);
        },
        fileWrite: async (path: string, _b: Uint8Array, o: { kind?: unknown; expectedHash: unknown }) => {
            writes.push({ path, kind: o.kind, expectedHash: o.expectedHash });
            return ok({ hash: "x", size: 22, writtenAt: "now", backupPath: null });
        },
    };
}

describe("installing a data pack on a managed server", () => {
    it("reads level-name and writes into that world's datapacks folder", async () => {
        const t = fakeTransport("#c\nmotd=hi\nlevel-name=heap\\ world\n", ["my_pack.zip"]);
        const answer = await installDataPack(t, "my_pack.zip", ZIP);
        expect(answer).toEqual({ ok: true, value: { path: "heap world/datapacks/my_pack.zip", bytes: 22, replaced: true, world: "heap world" } });
        expect(t.dirs).toEqual(["heap world/datapacks"]);
        expect(t.writes).toEqual([{ path: "heap world/datapacks/my_pack.zip", kind: "world", expectedHash: null }]);
    });

    it("falls back to world, and refuses bad names, non-zips and an escaping level-name", async () => {
        expect((await installDataPack(fakeTransport(null), "a.zip", ZIP)).ok && true).toBe(true);
        expect(fakeTransport(null).writes).toEqual([]);
        const t = fakeTransport(null);
        await installDataPack(t, "a.zip", ZIP);
        expect(t.writes[0]!.path).toBe("world/datapacks/a.zip");
        expect((await installDataPack(fakeTransport(null), "../a.zip", ZIP)).ok).toBe(false);
        expect((await installDataPack(fakeTransport(null), "a.zip", new Uint8Array([1, 2, 3, 4]))).ok).toBe(false);
        expect((await installDataPack(fakeTransport("level-name=../etc"), "a.zip", ZIP)).ok).toBe(false);
    });

    it("parses level-name the way properties files are written", () => {
        expect(levelName("level-name = abc ")).toBe("abc");
        expect(levelName("# level-name=no\nlevel-name:yes")).toBe("yes");
        expect(levelName("motd=x")).toBeNull();
    });
});
