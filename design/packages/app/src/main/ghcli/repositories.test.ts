import { describe, expect, it } from "vitest";
import type { ProcessResult } from "../cirender/gh.js";
import type { GhCliAccountLease } from "./credentialBroker.js";
import { fakeGhAccountLease } from "./testLease.js";
import {
    createGhRepository,
    listGhOwners,
    listGhRepositories,
    viewGhRepository,
} from "./repositories.js";

function result(stdout = "", code = 0, stderr = ""): ProcessResult {
    return { started: true, code, stdout, stderr };
}

function lease(
    run: GhCliAccountLease["run"],
    overrides: Partial<Pick<GhCliAccountLease, "login" | "host">> = {},
): GhCliAccountLease {
    return fakeGhAccountLease({
        accountId: "github.com:octocat",
        host: overrides.host ?? "github.com",
        login: overrides.login ?? "octocat",
        run,
    });
}

describe("gh repository routing", () => {
    it("enumerates only the personal owner and organizations where the viewer can create repositories", async () => {
        const calls: readonly string[][] = [];
        const mutableCalls = calls as string[][];
        const account = lease((args) => {
            mutableCalls.push([...args]);
            if (args.at(-1) === "user") return Promise.resolve(result('{"login":"octocat"}'));
            return Promise.resolve(
                result(
                    JSON.stringify([
                        {
                            data: {
                                viewer: {
                                    organizations: {
                                        nodes: [
                                            { login: "acme", viewerCanCreateRepositories: true },
                                            { login: "read-only", viewerCanCreateRepositories: false },
                                        ],
                                    },
                                },
                            },
                        },
                    ]),
                ),
            );
        });

        await expect(listGhOwners(account)).resolves.toEqual([
            { login: "octocat", kind: "user" },
            { login: "acme", kind: "organization" },
        ]);
        expect(mutableCalls.every((args) => args.includes("--hostname"))).toBe(true);
    });

    it("enumerates only repositories the selected gh account can write", async () => {
        const account = lease(() =>
            Promise.resolve(
                result(
                    JSON.stringify([
                        [
                            {
                                owner: { login: "octocat" },
                                name: "maps",
                                full_name: "octocat/maps",
                                private: true,
                                permissions: { push: true },
                                html_url: "https://github.com/octocat/maps",
                            },
                            {
                                owner: { login: "someone" },
                                name: "read-only",
                                full_name: "someone/read-only",
                                private: false,
                                permissions: { push: false },
                                html_url: "https://github.com/someone/read-only",
                            },
                        ],
                    ]),
                ),
            ),
        );
        await expect(listGhRepositories(account)).resolves.toEqual([
            {
                owner: "octocat",
                name: "maps",
                fullName: "octocat/maps",
                private: true,
                canWrite: true,
                htmlUrl: "https://github.com/octocat/maps",
            },
        ]);
    });

    it("distinguishes an existing repository from an explicit not-found", async () => {
        const existing = lease(() =>
            Promise.resolve(
                result(
                    JSON.stringify({
                        owner: { login: "octocat" },
                        name: "maps",
                        nameWithOwner: "octocat/maps",
                        isPrivate: true,
                        viewerPermission: "ADMIN",
                        url: "https://github.com/octocat/maps",
                    }),
                ),
            ),
        );
        await expect(viewGhRepository(existing, "octocat", "maps")).resolves.toMatchObject({
            status: "found",
            repository: { fullName: "octocat/maps", canWrite: true },
        });

        const missing = lease(() =>
            Promise.resolve(
                result(
                    "",
                    1,
                    "GraphQL: Could not resolve to a Repository with the name 'octocat/gone'. (repository)",
                ),
            ),
        );
        await expect(viewGhRepository(missing, "octocat", "gone")).resolves.toEqual({
            status: "missing",
            owner: "octocat",
            repo: "gone",
        });

        const missingWithAlternateCliWording = lease(() =>
            Promise.resolve(
                result(
                    "",
                    1,
                    "GraphQL: Could not resolve to a Repository with that name. (repository)",
                ),
            ),
        );
        await expect(
            viewGhRepository(missingWithAlternateCliWording, "octocat", "also-gone"),
        ).resolves.toMatchObject({ status: "missing", repo: "also-gone" });
    });

    it("does not turn a CLI failure into a nonexistent repository", async () => {
        const account = lease(() => Promise.resolve(result("", 1, "gh: forbidden (HTTP 403)")));
        await expect(viewGhRepository(account, "acme", "maps")).resolves.toMatchObject({
            status: "failed",
            message: expect.stringContaining("HTTP 403"),
        });
    });

    it("creates under a real organization with gh, then verifies the exact repository", async () => {
        const calls: string[][] = [];
        const account = lease((args) => {
            calls.push([...args]);
            if (args.at(-1) === "user") return Promise.resolve(result('{"login":"octocat"}'));
            if (args.includes("graphql")) {
                return Promise.resolve(
                    result(
                        JSON.stringify([
                            {
                                data: {
                                    viewer: {
                                        organizations: {
                                            nodes: [
                                                { login: "acme", viewerCanCreateRepositories: true },
                                            ],
                                        },
                                    },
                                },
                            },
                        ]),
                    ),
                );
            }
            if (args[0] === "repo" && args[1] === "create") return Promise.resolve(result());
            return Promise.resolve(
                result(
                    JSON.stringify({
                        owner: { login: "acme" },
                        name: "maps",
                        nameWithOwner: "acme/maps",
                        isPrivate: true,
                        viewerPermission: "ADMIN",
                        url: "https://github.com/acme/maps",
                    }),
                ),
            );
        });

        await expect(
            createGhRepository(account, {
                ownerLogin: "acme",
                ownerKind: "organization",
                name: "maps",
                private: true,
            }),
        ).resolves.toMatchObject({ ok: true, repository: { fullName: "acme/maps" } });
        expect(calls).toContainEqual([
            "repo",
            "create",
            "github.com/acme/maps",
            "--private",
            "--add-readme",
        ]);
        expect(calls.some((args) => args.includes("--web"))).toBe(false);
    });

    it("reports a create CLI failure without opening or returning any external URL", async () => {
        const account = lease((args) => {
            if (args.at(-1) === "user") return Promise.resolve(result('{"login":"octocat"}'));
            if (args.includes("graphql")) {
                return Promise.resolve(result('[{"data":{"viewer":{"organizations":{"nodes":[]}}}}]'));
            }
            return Promise.resolve(result("", 1, "gh: forbidden (HTTP 403)"));
        });
        const created = await createGhRepository(account, {
            ownerLogin: "octocat",
            ownerKind: "user",
            name: "maps",
            private: false,
        });
        expect(created).toMatchObject({ ok: false, code: "cli-failed", needsSignIn: true });
        expect(JSON.stringify(created)).not.toContain("https://");
    });
});
