import { describe, expect, it } from "vitest";
import { bindMountArgs, checkHostFolderMount, describeMount } from "./mounts.js";

const mount = (over: Partial<Parameters<typeof checkHostFolderMount>[0]> = {}) => ({
    hostPath: "/srv/data",
    containerPath: "/data",
    writable: true,
    ...over,
});

describe("handing a host folder to a container", () => {
    it("allows an ordinary folder", () => {
        expect(checkHostFolderMount(mount(), "posix")).toEqual({ ok: true });
    });

    it("refuses a host system directory, per that host's own platform", () => {
        expect(checkHostFolderMount(mount({ hostPath: "/etc" }), "posix").ok).toBe(false);
        expect(checkHostFolderMount(mount({ hostPath: "C:\\Windows" }), "windows").ok).toBe(false);
    });

    it("refuses the whole host filesystem, which is how a form produces -v /:/host", () => {
        // Nobody types this on purpose. They fill in a box, and a box that accepts it is the
        // problem rather than the person.
        expect(checkHostFolderMount(mount({ hostPath: "/" }), "posix").ok).toBe(false);
        expect(checkHostFolderMount(mount({ hostPath: "C:\\" }), "windows").ok).toBe(false);
    });

    it("refuses mounting over the image's own directories", () => {
        // This does not fail loudly. The container starts and then behaves inexplicably,
        // because its own files at that path have been replaced.
        for (const containerPath of ["/", "/usr", "/etc", "/bin", "/var"])
            expect(
                checkHostFolderMount(mount({ containerPath }), "posix").ok,
                `${containerPath} should be refused`,
            ).toBe(false);
    });

    it("allows the places an application's data actually goes", () => {
        for (const containerPath of ["/data", "/app/data", "/srv/thing", "/data/worlds"])
            expect(
                checkHostFolderMount(mount({ containerPath }), "posix").ok,
                `${containerPath} should be allowed`,
            ).toBe(true);
    });

    it("refuses a relative container path", () => {
        expect(checkHostFolderMount(mount({ containerPath: "data" }), "posix").ok).toBe(false);
    });

    it("refuses a container path containing .., which the daemon resolves", () => {
        // A destination that looks confined need not be, because `..` is resolved on the far
        // side of this check.
        expect(checkHostFolderMount(mount({ containerPath: "/data/../etc" }), "posix").ok).toBe(
            false,
        );
    });

    it("refuses a Windows-shaped container path, because containers are Linux", () => {
        expect(checkHostFolderMount(mount({ containerPath: "C:\\data" }), "windows").ok).toBe(false);
    });

    it("refuses a NUL byte on either side", () => {
        expect(checkHostFolderMount(mount({ hostPath: "/srv/data\0" }), "posix").ok).toBe(false);
        expect(checkHostFolderMount(mount({ containerPath: "/data\0" }), "posix").ok).toBe(false);
    });

    it("ignores a trailing slash rather than letting it slip a refusal", () => {
        expect(checkHostFolderMount(mount({ containerPath: "/usr/" }), "posix").ok).toBe(false);
    });

    it("says why, in words that name the actual problem", () => {
        const refused = checkHostFolderMount(mount({ containerPath: "/usr" }), "posix");

        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.reason).toContain("image's own files");
    });
});

describe("the arguments a checked mount produces", () => {
    it("marks a read-only mount read-only", () => {
        expect(bindMountArgs([{ hostPath: "/srv/w", containerPath: "/data", writable: false }])).toEqual(
            ["-v", "/srv/w:/data:ro"],
        );
    });

    it("leaves a writable mount writable", () => {
        expect(bindMountArgs([{ hostPath: "/srv/w", containerPath: "/data", writable: true }])).toEqual(
            ["-v", "/srv/w:/data"],
        );
    });
});

describe("what somebody is asked to confirm", () => {
    it("names both sides and the access, not just the folder", () => {
        // "Use this folder" is not a confirmation. The whole risk is agreeing to something
        // other than what was meant.
        const described = describeMount({
            hostPath: "/srv/data",
            containerPath: "/data",
            writable: false,
        });

        expect(described).toContain("/srv/data");
        expect(described).toContain("/data");
        expect(described).toContain("read-only");
    });
});
