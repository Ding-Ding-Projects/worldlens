import { describe, expect, it } from "vitest";
import { classifyDroppedWorld, isWorldArchive, looksLikeMinecraftWorld } from "./worldDropModel.js";

describe("world drop classification", () => {
    it.each(["world.zip", "backup.tar.gz", "WORLD.ZIP"])("recognises %s as an archive", (name) => {
        expect(isWorldArchive(name)).toBe(true);
        expect(classifyDroppedWorld(name)).toBe("archive");
    });

    it("recognises a world folder by its level and world data markers", () => {
        expect(looksLikeMinecraftWorld(["level.dat", "region/r.0.0.mca"])).toBe(true);
        expect(looksLikeMinecraftWorld(["Survival/level.dat", "Survival/playerdata/abc.dat"])).toBe(true);
        expect(classifyDroppedWorld("Survival", ["level.dat", "session.lock"])).toBe("folder");
    });

    it("does not mistake an arbitrary folder or archive-looking document for a world", () => {
        expect(looksLikeMinecraftWorld(["readme.txt", "region-not-a-world/file.bin"])).toBe(false);
        expect(classifyDroppedWorld("notes.txt", ["level.dat"])).toBe("unknown");
    });
});
