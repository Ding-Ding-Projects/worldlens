/**
 * Pointing a domain at a host, with no network anywhere in sight.
 *
 * The assertion worth reading twice: **writing the record reports `pending`, never
 * `live`**. The API call really did succeed, which is what makes claiming success so
 * tempting - and the person then opens the address thirty seconds later, gets an error,
 * and concludes the app is broken rather than that DNS is slow. Only an address that
 * actually answers turns this `live`.
 *
 * The second: **an existing record pointing somewhere else is a conflict, not something to
 * overwrite**. That record may be serving somebody's live website, and the only sign of a
 * silent overwrite is their site going down.
 */

import { describe, expect, it } from "vitest";
import { CloudflareClient } from "./api.js";
import type { CloudflareFetch } from "./api.js";
import { applyDomain, confirmDomainLive, recordShapeFor } from "./dns.js";

/** A Cloudflare that answers from a script, and records what it was asked. */
function fakeCloudflare(script: (method: string, path: string) => unknown): {
    readonly client: CloudflareClient;
    readonly calls: { method: string; path: string; body: unknown }[];
} {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const fetch: CloudflareFetch = async (url, init) => {
        const path = url.replace("https://api.cloudflare.com/client/v4", "");
        calls.push({
            method: init.method,
            path,
            body: init.body === undefined ? undefined : JSON.parse(init.body),
        });
        return {
            status: 200,
            ok: true,
            async text() {
                return JSON.stringify({ success: true, result: script(init.method, path) });
            },
        };
    };
    const client = new CloudflareClient({
        withToken: async (operation) => operation("a-token"),
        fetch,
    });
    return { client, calls };
}

describe("record shapes", () => {
    it("proxies a tunnel and does not proxy Pages", () => {
        // A cfargotunnel.com target only resolves through Cloudflare's edge, so an
        // unproxied record for it points at something the internet cannot reach at all.
        expect(recordShapeFor({ route: "local", content: "x.cfargotunnel.com" })).toEqual({
            type: "CNAME",
            proxied: true,
        });
        // Pages issues its own certificate; proxying in front of it before that exists
        // produces a redirect loop that is genuinely hard to diagnose.
        expect(recordShapeFor({ route: "github-pages", content: "owner.github.io" })).toEqual({
            type: "CNAME",
            proxied: false,
        });
        expect(recordShapeFor({ route: "aws-cloudfront", content: "d1.cloudfront.net" })).toEqual({
            type: "CNAME",
            proxied: false,
        });
    });
});

describe("applying a domain", () => {
    it("reports pending after writing the record, never live", async () => {
        const { client, calls } = fakeCloudflare((method) =>
            method === "GET" ? [] : { id: "rec1", type: "CNAME", name: "map.example.com", content: "owner.github.io", proxied: false },
        );

        const status = await applyDomain({
            client,
            zoneId: "zone1",
            hostname: "map.example.com",
            target: { route: "github-pages", content: "owner.github.io" },
        });

        // The call succeeded. The site is still not necessarily reachable, and saying so
        // is the difference between "wait a minute" and "this app is broken".
        expect(status.state).toBe("pending");
        expect(status.detail).toMatch(/live/i);
        expect(calls.some((call) => call.method === "POST")).toBe(true);
    });

    it("refuses to overwrite a record pointing somewhere else", async () => {
        const { client, calls } = fakeCloudflare((method) =>
            method === "GET"
                ? [
                      {
                          id: "rec1",
                          type: "CNAME",
                          name: "map.example.com",
                          content: "somebody-elses-site.example",
                          proxied: false,
                      },
                  ]
                : {},
        );

        const status = await applyDomain({
            client,
            zoneId: "zone1",
            hostname: "map.example.com",
            target: { route: "github-pages", content: "owner.github.io" },
        });

        expect(status.state).toBe("conflict");
        expect(status.target).toBe("somebody-elses-site.example");
        // Nothing was written. That record may be serving a live site right now.
        expect(calls.every((call) => call.method === "GET")).toBe(true);
    });

    it("replaces a conflicting record only when explicitly told to", async () => {
        const { client, calls } = fakeCloudflare((method) =>
            method === "GET"
                ? [
                      {
                          id: "rec1",
                          type: "CNAME",
                          name: "map.example.com",
                          content: "old-target.example",
                          proxied: false,
                      },
                  ]
                : {
                      id: "rec1",
                      type: "CNAME",
                      name: "map.example.com",
                      content: "owner.github.io",
                      proxied: false,
                  },
        );

        const status = await applyDomain({
            client,
            zoneId: "zone1",
            hostname: "map.example.com",
            target: { route: "github-pages", content: "owner.github.io" },
            replaceConflicting: true,
        });

        expect(status.state).toBe("pending");
        expect(calls.some((call) => call.method === "PUT")).toBe(true);
    });

    it("updates the record it already owns rather than making a second one", async () => {
        const { client, calls } = fakeCloudflare((method) =>
            method === "GET"
                ? [
                      {
                          id: "rec1",
                          type: "CNAME",
                          name: "map.example.com",
                          content: "owner.github.io",
                          proxied: false,
                      },
                  ]
                : {
                      id: "rec1",
                      type: "CNAME",
                      name: "map.example.com",
                      content: "owner.github.io",
                      proxied: false,
                  },
        );

        await applyDomain({
            client,
            zoneId: "zone1",
            hostname: "map.example.com",
            target: { route: "github-pages", content: "owner.github.io" },
        });

        expect(calls.some((call) => call.method === "POST")).toBe(false);
        expect(calls.some((call) => call.method === "PUT")).toBe(true);
    });
});

describe("confirming a domain is live", () => {
    it("says live only when the address actually answers", async () => {
        const status = await confirmDomainLive({
            hostname: "map.example.com",
            fetch: async () => ({ ok: true, status: 200 }),
        });
        expect(status.state).toBe("live");
    });

    it("stays pending when nothing answers, rather than reporting a failure", async () => {
        // A fetch failure here is overwhelmingly "not propagated yet" rather than "broken
        // forever", and calling it failed sends somebody off to fix a working setup.
        const status = await confirmDomainLive({
            hostname: "map.example.com",
            fetch: async () => {
                throw new Error("ENOTFOUND");
            },
        });
        expect(status.state).toBe("pending");
        expect(status.detail).toMatch(/few minutes/i);
    });

    it("stays pending on a server error rather than claiming success", async () => {
        const status = await confirmDomainLive({
            hostname: "map.example.com",
            fetch: async () => ({ ok: false, status: 503 }),
        });
        expect(status.state).toBe("pending");
        expect(status.detail).toContain("503");
    });
});
