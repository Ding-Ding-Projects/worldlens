import { describe, expect, it } from "vitest";

import { normaliseRoot, resolveForWrite, resolveInScope } from "./scope.js";

const ROOT = "/srv/minecraft";

function relative(path: string, root = ROOT): string {
    const answer = resolveInScope(path, { root });
    if (!answer.ok) throw new Error(`expected ${path} to resolve, got ${answer.failure.code}`);
    return answer.value.relative;
}

function refusal(path: string, root = ROOT): string {
    const answer = resolveInScope(path, { root });
    if (answer.ok) throw new Error(`expected ${path} to be refused, got ${answer.value.absolute}`);
    return answer.failure.code;
}

describe("normaliseRoot", () => {
    it("strips trailing separators and accepts Windows separators", () => {
        expect(normaliseRoot("/srv/minecraft/")).toBe("/srv/minecraft");
        expect(normaliseRoot("/srv/minecraft///")).toBe("/srv/minecraft");
        expect(normaliseRoot("C:\\servers\\paper")).toBe("C:/servers/paper");
    });

    it("keeps the filesystem root usable rather than collapsing it to nothing", () => {
        expect(normaliseRoot("/")).toBe("/");
    });
});

describe("resolveInScope", () => {
    it("resolves an ordinary relative path", () => {
        expect(relative("server.properties")).toBe("server.properties");
        expect(relative("plugins/EssentialsX/config.yml")).toBe("plugins/EssentialsX/config.yml");
    });

    it("accepts an absolute path that is genuinely inside the root", () => {
        expect(relative("/srv/minecraft/world/level.dat")).toBe("world/level.dat");
    });

    it("collapses harmless . and .. that stay inside", () => {
        expect(relative("plugins/./config.yml")).toBe("plugins/config.yml");
        expect(relative("plugins/EssentialsX/../config.yml")).toBe("plugins/config.yml");
    });

    it("treats a backslash as a separator rather than as part of a name", () => {
        expect(relative("plugins\\config.yml")).toBe("plugins/config.yml");
    });

    it("normalises the root the caller passed in", () => {
        expect(relative("server.properties", "/srv/minecraft/")).toBe("server.properties");
    });
});

describe("resolveInScope refuses an escape", () => {
    it("refuses a plain climb", () => {
        expect(refusal("../etc/passwd")).toBe("out-of-scope");
        expect(refusal("..")).toBe("out-of-scope");
    });

    it("refuses a climb hidden mid-path", () => {
        expect(refusal("plugins/../../etc/passwd")).toBe("out-of-scope");
        expect(refusal("a/b/c/../../../../etc/passwd")).toBe("out-of-scope");
    });

    it("refuses a climb written with backslashes", () => {
        expect(refusal("..\\..\\etc\\passwd")).toBe("out-of-scope");
    });

    it("refuses an absolute path outside the root", () => {
        expect(refusal("/etc/passwd")).toBe("out-of-scope");
        expect(refusal("/var/run/docker.sock")).toBe("out-of-scope");
    });

    it("refuses a sibling directory whose name merely starts with the root", () => {
        // The string prefix matches; the segment boundary does not. This is the case a
        // `startsWith` implementation gets wrong, and it hands writes to another server.
        expect(refusal("/srv/minecraft-other/server.properties")).toBe("out-of-scope");
        expect(refusal("/srv/minecraftevil")).toBe("out-of-scope");
    });

    it("refuses another drive or a UNC share", () => {
        expect(refusal("C:/Windows/System32/drivers/etc/hosts")).toBe("out-of-scope");
        expect(refusal("//attacker/share/payload")).toBe("out-of-scope");
    });

    it("refuses a NUL or a newline before it can truncate or forge a line", () => {
        expect(refusal("world/level.dat\u0000.txt")).toBe("invalid-request");
        expect(refusal("plugins/a\nb.yml")).toBe("invalid-request");
        expect(refusal("plugins/a\rb.yml")).toBe("invalid-request");
    });

    it("refuses an empty path rather than resolving it to the root", () => {
        expect(refusal("")).toBe("invalid-request");
    });

    it("stays refused however many segments the climb uses", () => {
        expect(refusal(`${"../".repeat(64)}etc/passwd`)).toBe("out-of-scope");
    });
});

describe("resolveInScope with a Windows root", () => {
    // The local transport's server folder really is drive-rooted on Windows. An earlier
    // version rebuilt every absolute path as "/" + segments, which turned
    // C:/servers/paper into /C:/servers/paper - a path no Windows API will open. Every
    // out-of-scope test still passed, because a refusal never has to rebuild a usable
    // path. Only the tests that actually read and wrote files caught it.
    const WIN = "C:/servers/paper";

    it("keeps the drive letter on the rebuilt absolute path", () => {
        const answer = resolveInScope("server.properties", { root: WIN });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.absolute).toBe("C:/servers/paper/server.properties");
        expect(answer.value.relative).toBe("server.properties");
    });

    it("accepts an absolute path on the same drive", () => {
        const answer = resolveInScope("C:/servers/paper/plugins/a.yml", { root: WIN });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.relative).toBe("plugins/a.yml");
    });

    it("accepts the same drive written in the other case", () => {
        // Windows treats c: and C: as one drive; string equality does not.
        expect(resolveInScope("c:/servers/paper/eula.txt", { root: WIN }).ok).toBe(true);
    });

    it("refuses a different drive", () => {
        const answer = resolveInScope("D:/elsewhere/file.txt", { root: WIN });
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("out-of-scope");
    });

    it("refuses a climb out of a drive-rooted folder", () => {
        expect(resolveInScope("../../Windows/System32", { root: WIN }).ok).toBe(false);
    });

    it("refuses a sibling whose name starts with the root", () => {
        expect(resolveInScope("C:/servers/paper-old/server.properties", { root: WIN }).ok).toBe(false);
    });

    it("accepts a backslash root, as Windows hands it to us", () => {
        const answer = resolveInScope("server.properties", { root: "C:\\servers\\paper" });
        expect(answer.ok).toBe(true);
        if (!answer.ok) return;
        expect(answer.value.absolute).toBe("C:/servers/paper/server.properties");
    });
});

describe("resolveForWrite", () => {
    const scoped = { root: ROOT, writeScope: ["plugins", "config"] } as const;

    it("allows a write inside a permitted directory", () => {
        const answer = resolveForWrite("plugins/EssentialsX/config.yml", scoped);
        expect(answer.ok).toBe(true);
    });

    it("allows a write to the permitted directory itself", () => {
        expect(resolveForWrite("plugins", scoped).ok).toBe(true);
    });

    it("refuses a write outside the permitted directories", () => {
        const answer = resolveForWrite("server.properties", scoped);
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("out-of-scope");
        // The refusal must say what IS writable, or the user cannot act on it.
        expect(answer.failure.detail).toContain("plugins");
    });

    it("refuses a directory whose name merely starts with a permitted one", () => {
        expect(resolveForWrite("pluginsx/evil.yml", scoped).ok).toBe(false);
    });

    it("treats an empty scope as the whole server folder", () => {
        expect(resolveForWrite("server.properties", { root: ROOT }).ok).toBe(true);
        expect(resolveForWrite("server.properties", { root: ROOT, writeScope: [] }).ok).toBe(true);
    });

    it("still refuses an escape even when the scope would otherwise permit it", () => {
        const answer = resolveForWrite("plugins/../../etc/passwd", scoped);
        expect(answer.ok).toBe(false);
        if (answer.ok) return;
        expect(answer.failure.code).toBe("out-of-scope");
    });
});
