import { describe, expect, it } from "vitest";
import {
    describeDeployment,
    parseCapabilities,
    parseMounts,
    readConfiguration,
} from "./main.js";

describe("reading the mount declaration", () => {
    it("reads id, path, writability and label", () => {
        const { roots, problems } = parseMounts("worlds:/data/worlds:ro:Worlds,out:/data/out:Renders");

        expect(problems).toEqual([]);
        expect(roots).toEqual([
            { id: "worlds", path: "/data/worlds", writable: false, label: "Worlds" },
            { id: "out", path: "/data/out", writable: true, label: "Renders" },
        ]);
    });

    it("defaults to writable, matching Docker's own default for a bind mount", () => {
        // The declaration sits beside `-v` in the same command; disagreeing about the default
        // would mean an operator who wrote `:ro` on one and not the other got two answers.
        expect(parseMounts("out:/data/out").roots[0]?.writable).toBe(true);
    });

    it("falls back to the id as a label rather than showing an empty name", () => {
        expect(parseMounts("out:/data/out").roots[0]?.label).toBe("out");
    });

    it("reports a malformed entry instead of skipping it", () => {
        // Skipping is the tempting behaviour and the wrong one: the deployment would come up
        // missing a folder the operator believes they mounted.
        expect(parseMounts("worlds").problems).not.toEqual([]);
        expect(parseMounts(":/data/worlds").problems).not.toEqual([]);
    });

    it("ignores empty entries, so a trailing comma is not an error", () => {
        expect(parseMounts("out:/data/out,").problems).toEqual([]);
    });

    it("passes the declaration through the same validation the server uses", () => {
        expect(parseMounts("out:/data/a,out:/data/b").problems).not.toEqual([]);
    });
});

describe("reading the capability grants", () => {
    it("accepts the ones that exist", () => {
        expect(parseCapabilities("docker-socket, ssh")).toEqual({
            granted: ["docker-socket", "ssh"],
            problems: [],
        });
    });

    it("refuses one that does not, rather than quietly ignoring it", () => {
        // Ignoring a typo would leave an operator believing they granted something, and only
        // finding out when the feature is refused for a reason that never mentions the typo.
        const { granted, problems } = parseCapabilities("docker-sockets");

        expect(granted).toEqual([]);
        expect(problems[0]).toContain("docker-socket");
    });
});

describe("reading the whole configuration", () => {
    it("hashes a plain password so it is never held or printed", () => {
        const { configuration } = readConfiguration({
            WORLDLENS_PASSWORD: "hunter2",
            WORLDLENS_HOST: "127.0.0.1",
        });

        expect(configuration?.passwordHash).toMatch(/^[a-f0-9]{64}$/);
        expect(configuration?.passwordHash).not.toContain("hunter2");
    });

    it("prefers a supplied hash, so a compose file need never hold the password", () => {
        const digest = "a".repeat(64);

        expect(
            readConfiguration({
                WORLDLENS_PASSWORD_SHA256: digest,
                WORLDLENS_PASSWORD: "ignored",
            }).configuration?.passwordHash,
        ).toBe(digest);
    });

    it("refuses a hash that is not one, rather than treating it as a password", () => {
        expect(readConfiguration({ WORLDLENS_PASSWORD_SHA256: "nope" }).problems).not.toEqual([]);
    });

    it("refuses a port that is not a port", () => {
        expect(readConfiguration({ WORLDLENS_PORT: "eighty" }).problems).not.toEqual([]);
        expect(readConfiguration({ WORLDLENS_PORT: "70000" }).problems).not.toEqual([]);
    });

    it("returns no configuration at all when anything is wrong", () => {
        // Half a configuration is worse than none: it would start, listening somewhere the
        // operator did not mean, with folders they did not intend.
        expect(readConfiguration({ WORLDLENS_PORT: "eighty" }).configuration).toBeNull();
    });

    it("binds every interface by default, which is what a container is for", () => {
        expect(readConfiguration({ WORLDLENS_PASSWORD: "x" }).configuration?.host).toBe("0.0.0.0");
    });
});

describe("what the container prints on startup", () => {
    it("says plainly when there is no password", () => {
        const { configuration } = readConfiguration({ WORLDLENS_INSECURE_NO_PASSWORD: "1" });

        expect(describeDeployment(configuration as never)).toContain("full access");
    });

    it("never prints the password or its hash", () => {
        const { configuration } = readConfiguration({ WORLDLENS_PASSWORD: "hunter2" });
        const printed = describeDeployment(configuration as never);

        expect(printed).not.toContain("hunter2");
        expect(printed).not.toContain(configuration?.passwordHash ?? "");
        expect(printed).toContain("Password: set");
    });

    it("names the build it is running, so a stale container is not indistinguishable from a current one", () => {
        // Issue #169. The operator looking at a running container cannot pull the image and
        // read its labels, so the banner has to say it. Under test the build constants are
        // null -- a test run has no provenance, and that is the same value a build which could
        // not establish a commit produces -- so this exercises the unavailable state, which is
        // the one that must not silently print a blank line.
        const { configuration } = readConfiguration({ WORLDLENS_PASSWORD: "x" });

        expect(describeDeployment(configuration as never)).toContain("commit unknown");
    });

    it("says when nothing is mounted, because that deployment can do nothing", () => {
        const { configuration } = readConfiguration({ WORLDLENS_PASSWORD: "x" });

        expect(describeDeployment(configuration as never)).toContain("none mounted");
    });

    it("shows each folder with its real read or write access", () => {
        const { configuration } = readConfiguration({
            WORLDLENS_PASSWORD: "x",
            WORLDLENS_MOUNTS: "worlds:/data/worlds:ro:Worlds,out:/data/out:Renders",
        });
        const printed = describeDeployment(configuration as never);

        expect(printed).toContain("Worlds (worlds) -> /data/worlds read-only");
        expect(printed).toContain("Renders (out) -> /data/out read/write");
    });

    it("says when no extras are granted, so refusals later are not a surprise", () => {
        const { configuration } = readConfiguration({ WORLDLENS_PASSWORD: "x" });

        expect(describeDeployment(configuration as never)).toContain("none granted");
    });
});
