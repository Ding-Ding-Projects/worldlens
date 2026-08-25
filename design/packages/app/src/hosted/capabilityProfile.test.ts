/**
 * The fail-closed guard for the hosted surface.
 *
 * The point of these tests is not that the current classification is correct - a person has
 * to decide that, and the reasons are written beside each entry so they can be argued with.
 * The point is that a channel cannot become reachable over a network *without* somebody
 * deciding, which is a different and more important property. Software grows channels; it
 * does not grow hosting decisions on its own.
 */
import { describe, expect, it } from "vitest";
import { BRIDGE_CHANNELS } from "@worldlens/bridge";
import { channelPolicy, classifiedPrefixes, unclassifiedChannels } from "./capabilityProfile.js";

describe("the hosted capability profile", () => {
    it("has classified every channel the bridge can reach", () => {
        // The one that matters. A new channel in the factory arrives here as a name in this
        // failure, rather than as a quietly open route.
        expect(unclassifiedChannels()).toEqual([]);
    });

    it("refuses a channel nobody has classified, rather than allowing it", () => {
        const policy = channelPolicy("something:nobodyDecidedAbout");

        expect(policy.kind).toBe("refused");
        // The reason has to say why it was refused, because "no" with no explanation is
        // indistinguishable from a bug to whoever meets it.
        if (policy.kind === "refused") expect(policy.reason).toMatch(/no hosting policy/i);
    });

    it("refuses a channel with no prefix at all rather than crashing on it", () => {
        // `indexOf(":")` returns -1 for these, and an unguarded `slice` would silently
        // produce an empty prefix that could match an empty-keyed entry.
        expect(channelPolicy("bare").kind).toBe("refused");
        expect(channelPolicy("").kind).toBe("refused");
    });

    it("gives every refusal a reason, and every opt-in a capability and a reason", () => {
        for (const channel of BRIDGE_CHANNELS) {
            const policy = channelPolicy(channel);
            if (policy.kind === "refused") {
                expect(policy.reason.length, `${channel} refuses without saying why`).toBeGreaterThan(
                    20,
                );
            }
            if (policy.kind === "opt-in") {
                expect(
                    policy.reason.length,
                    `${channel} is opt-in without saying why`,
                ).toBeGreaterThan(20);
                expect(["docker-socket", "ssh", "github"]).toContain(policy.capability);
            }
        }
    });

    it("keeps the dangerous prefixes off by default", () => {
        // Named individually rather than derived, so that moving one of them to `available`
        // has to happen here too, in a diff a reviewer will see.
        for (const channel of [
            "dockerhosting:create",
            "runtime:docker",
            "remote:render",
            "hosting:start",
            "mcserver:start",
            "addons:import",
            "ghCli:startLogin",
        ]) {
            expect(channelPolicy(channel).kind, `${channel} must not be open by default`).toBe(
                "opt-in",
            );
        }
    });

    it("refuses the things a container genuinely does not have", () => {
        for (const channel of [
            "window:minimize",
            "update:check",
            "dialog:pickFolder",
            "config:pickDirectory",
            "files:reveal",
            "sysdeps:install",
            "clipboard:writeText",
        ]) {
            expect(channelPolicy(channel).kind, `${channel} cannot work in a container`).toBe(
                "refused",
            );
        }
    });

    it("still answers the ordinary reading and rendering channels", () => {
        // The other half of the contract: fail-closed is only useful if the thing still
        // works. A profile that refused everything would pass every test above.
        for (const channel of [
            "app:version",
            "render:start",
            "world:inspect",
            "config:readFolder",
            "history:status",
            "project:read",
            "gallery:list",
        ]) {
            expect(channelPolicy(channel).kind, `${channel} should work in a container`).toBe(
                "available",
            );
        }
    });

    it("finds a real inventory rather than an empty one", () => {
        // The tripwire. If `BRIDGE_CHANNELS` were ever empty, every loop above would pass
        // while checking nothing at all.
        expect(BRIDGE_CHANNELS.length).toBeGreaterThan(300);
        expect(classifiedPrefixes().length).toBeGreaterThan(30);
    });
});
