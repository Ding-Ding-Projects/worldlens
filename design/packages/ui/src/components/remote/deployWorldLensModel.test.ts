import { describe, expect, it } from "vitest";
import {
    defaultForm,
    deployRequest,
    folderIds,
    formProblems,
    instanceId,
    isHostedImage,
    sha256Hex,
} from "./deployWorldLensModel.js";

const IMAGE = `ghcr.io/ding-ding-projects/worldlens-hosted@sha256:${"b".repeat(64)}`;

describe("deploy WorldLens as a container", () => {
    it("recognises only digest-pinned hosted images", () => {
        expect(isHostedImage(IMAGE)).toBe(true);
        expect(isHostedImage("ghcr.io/ding-ding-projects/worldlens-hosted:latest")).toBe(false);
        expect(isHostedImage(`ghcr.io/x/worldlens-cli@sha256:${"b".repeat(64)}`)).toBe(false);
    });

    it("makes stable ids for the container and each folder", () => {
        expect(instanceId("My Server!")).toBe("worldlens-my-server");
        expect(instanceId("WorldLens")).toBe("worldlens");
        expect(
            folderIds([
                { path: "/home/me/worlds", label: "", readOnly: true },
                { path: "D:\\worlds", label: "", readOnly: true },
                { path: "/state", label: "", readOnly: true },
            ]),
        ).toEqual(["worlds", "worlds-2", "state-2"]);
    });

    it("needs an image, a password and a chosen folder path", () => {
        const problems = formProblems({
            ...defaultForm(),
            folders: [{ path: "", label: "a:b", readOnly: true }],
        });
        expect(problems.join(" ")).toMatch(/hosted image/);
        expect(problems.join(" ")).toMatch(/password/);
        expect(problems.join(" ")).toMatch(/no folder chosen/);
        expect(problems.join(" ")).toMatch(/comma or colon/);
        expect(
            formProblems({ ...defaultForm(), image: IMAGE, passwordHash: "a".repeat(64) }),
        ).toEqual([]);
    });

    it("builds one request with mounts, a state volume and only the password hash", async () => {
        const hash = await sha256Hex("hunter2");
        expect(hash).toBe("f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7");
        const request = deployRequest({
            ...defaultForm(),
            image: IMAGE,
            reachable: true,
            passwordHash: hash,
            folders: [{ path: "/home/me/worlds", label: "My worlds", readOnly: true }],
        });
        expect(request.portMappings).toEqual([{ port: 8110, bindMode: "public" }]);
        expect(request.binds).toEqual([
            { source: "/home/me/worlds", target: "/data/worlds", readOnly: true },
        ]);
        expect(request.volumes).toEqual(["worldlens-state:/data/state"]);
        const env = Object.fromEntries((request.env ?? []).map((e) => [e.key, e.value]));
        expect(env["WORLDLENS_MOUNTS"]).toBe("worlds:/data/worlds:ro:My worlds");
        expect(env["WORLDLENS_PASSWORD_SHA256"]).toBe(hash);
        expect(JSON.stringify(request)).not.toContain("hunter2");
    });
});
