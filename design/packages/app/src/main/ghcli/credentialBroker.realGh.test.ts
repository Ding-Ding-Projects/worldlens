/** Optional read-only proof against the host's real gh credential store. */

import { describe, expect, it } from "vitest";
import { nodeProcessRunner } from "../cirender/gh.js";
import { GhCredentialBroker } from "./credentialBroker.js";

const LIVE = process.env["MBM_TEST_GH_BROKER_LIVE"] === "1";

describe("the real gh CLI account broker", () => {
    if (!LIVE) {
        it("records that the live proof was not requested", () => {
            expect(LIVE).toBe(false);
        });
        return;
    }

    it("routes the active account through gh without exposing authorization", async () => {
        const broker = new GhCredentialBroker({ runner: nodeProcessRunner() });
        const status = await broker.listAccounts();
        const selected = status.accounts.find(
            (account) => account.active && account.healthy && account.host === "github.com",
        );
        expect(selected).toBeDefined();
        if (selected === undefined) return;

        const lease = await broker.account(selected.id, "write");
        expect(lease).not.toBeNull();
        if (lease === null) return;
        expect(lease.accountId).toBe(selected.id);
        expect(lease.login).toBe(selected.login);

        const identity = await lease.run([
            "api",
            "--hostname",
            lease.host,
            "--jq",
            ".login",
            "user",
        ]);
        expect(identity).toMatchObject({ started: true, code: 0, stderr: "" });
        expect(identity.stdout.trim()).toBe(lease.login);
        expect(JSON.stringify({ lease, identity }, (_key, value) =>
            typeof value === "function" ? "[function]" : value,
        )).not.toMatch(/authorization|bearer|access[_-]?token/i);
    }, 30_000);
});
