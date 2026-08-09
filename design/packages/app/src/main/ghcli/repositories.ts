/** Structured repository and owner operations executed entirely by GitHub CLI. */

import type { ProcessResult } from "../cirender/gh.js";
import type { GhCliAccountLease } from "./credentialBroker.js";

export interface GhOwnerChoice {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export interface GhRepositoryChoice {
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

export type GhRepositoryViewResult =
    | { readonly status: "found"; readonly repository: GhRepositoryChoice }
    | { readonly status: "missing"; readonly owner: string; readonly repo: string }
    | { readonly status: "failed"; readonly owner: string; readonly repo: string; readonly message: string };

export type GhRepositoryCreateResult =
    | { readonly ok: true; readonly repository: GhRepositoryChoice }
    | {
          readonly ok: false;
          readonly code: "invalid-request" | "owner-not-confirmed" | "name-taken" | "cli-failed" | "verification-failed";
          readonly message: string;
          readonly needsSignIn?: boolean | undefined;
      };

function text(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function object(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function parseJson(result: ProcessResult, what: string): unknown {
    if (!result.started || result.code !== 0) throw new Error(cliFailure(result, what));
    try {
        return JSON.parse(result.stdout);
    } catch {
        throw new Error(`GitHub CLI returned malformed JSON while ${what}. Nothing was inferred.`);
    }
}

function httpStatus(result: ProcessResult): number | null {
    const match = /(?:\(HTTP |HTTP )(\d{3})(?:\)|:)/.exec(result.stderr);
    return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
}

function cliFailure(result: ProcessResult, what: string): string {
    if (!result.started) return `GitHub CLI could not start while ${what}.`;
    const status = httpStatus(result);
    const statusText = status === null ? "" : ` GitHub answered HTTP ${String(status)}.`;
    return `GitHub CLI could not finish ${what}.${statusText} No repository state was guessed.`;
}

function flattenPages(value: unknown): readonly unknown[] | null {
    if (!Array.isArray(value)) return null;
    if (value.every((entry) => Array.isArray(entry))) return value.flatMap((entry) => entry as unknown[]);
    return value;
}

function writableOrganizations(value: unknown): readonly string[] | null {
    if (!Array.isArray(value)) return null;
    const organizations: string[] = [];
    for (const page of value) {
        const nodes = object(object(object(page)?.["data"])?.["viewer"]);
        const organizationConnection = object(nodes?.["organizations"]);
        const pageNodes = organizationConnection?.["nodes"];
        if (!Array.isArray(pageNodes)) return null;
        for (const entry of pageNodes) {
            const record = object(entry);
            const login = text(record?.["login"]);
            if (login !== null && record?.["viewerCanCreateRepositories"] === true) {
                organizations.push(login);
            }
        }
    }
    return organizations;
}

function sameLogin(left: string, right: string): boolean {
    return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function parseRepository(value: unknown): GhRepositoryChoice | null {
    const record = object(value);
    if (record === null) return null;
    const name = text(record["name"]);
    const fullName = text(record["nameWithOwner"] ?? record["full_name"]);
    const ownerRecord = object(record["owner"]);
    const owner = text(ownerRecord?.["login"]) ?? fullName?.split("/")[0] ?? null;
    const htmlUrl = text(record["url"] ?? record["html_url"]);
    if (name === null || fullName === null || owner === null || htmlUrl === null) return null;

    const viewerPermission = text(record["viewerPermission"]);
    const permissions = object(record["permissions"]);
    const canWrite =
        permissions?.["push"] === true ||
        viewerPermission === "WRITE" ||
        viewerPermission === "MAINTAIN" ||
        viewerPermission === "ADMIN";
    return {
        owner,
        name,
        fullName,
        private: record["isPrivate"] === true || record["private"] === true,
        canWrite,
        htmlUrl,
    };
}

/** The selected login plus organizations where that viewer may actually create repositories. */
export async function listGhOwners(
    lease: GhCliAccountLease,
    signal?: AbortSignal,
): Promise<readonly GhOwnerChoice[]> {
    const user = parseJson(
        await lease.run(
            ["api", "--hostname", lease.host, "user"],
            signal === undefined ? {} : { signal },
        ),
        "reading the selected account",
    );
    const login = text(object(user)?.["login"]);
    if (login === null || !sameLogin(login, lease.login)) {
        throw new Error(
            `GitHub CLI did not confirm that the selected account is ${lease.login}. Refresh the account list and try again.`,
        );
    }

    const organizations = writableOrganizations(
        parseJson(
            await lease.run(
                [
                    "api",
                    "--hostname",
                    lease.host,
                    "graphql",
                    "--paginate",
                    "--slurp",
                    "-f",
                    "query=query($endCursor:String){viewer{organizations(first:100,after:$endCursor){nodes{login viewerCanCreateRepositories}pageInfo{hasNextPage endCursor}}}}",
                ],
                signal === undefined ? {} : { signal },
            ),
            "reading writable organizations",
        ),
    );
    if (organizations === null) {
        throw new Error("GitHub CLI returned malformed writable-organization data. Nothing was inferred.");
    }

    return [
        { login: lease.login, kind: "user" },
        ...[...new Set(organizations)]
            .sort((left, right) => left.localeCompare(right))
            .map((organization) => ({ login: organization, kind: "organization" as const })),
    ];
}

/** A bounded, real list of repositories visible with write permission to this gh account. */
export async function listGhRepositories(
    lease: GhCliAccountLease,
    signal?: AbortSignal,
): Promise<readonly GhRepositoryChoice[]> {
    const pages = flattenPages(
        parseJson(
            await lease.run(
                [
                    "api",
                    "--hostname",
                    lease.host,
                    "--paginate",
                    "--slurp",
                    "user/repos?affiliation=owner,organization_member,collaborator&sort=updated&per_page=100",
                ],
                signal === undefined ? {} : { signal },
            ),
            "listing repositories",
        ),
    );
    if (pages === null) {
        throw new Error("GitHub CLI returned malformed repository data. Nothing was inferred.");
    }
    return pages
        .slice(0, 300)
        .map((entry) => parseRepository(entry))
        .filter((entry): entry is GhRepositoryChoice => entry !== null && entry.canWrite);
}

/** `gh repo view` distinguishes a real repository, a real not-found, and an unknown failure. */
export async function viewGhRepository(
    lease: GhCliAccountLease,
    owner: string,
    repo: string,
    signal?: AbortSignal,
): Promise<GhRepositoryViewResult> {
    const targetOwner = owner.trim();
    const targetRepo = repo.trim();
    if (targetOwner === "" || targetRepo === "") {
        return {
            status: "failed",
            owner: targetOwner,
            repo: targetRepo,
            message: "A repository owner and name are required.",
        };
    }
    const result = await lease.run(
        [
            "repo",
            "view",
            `${lease.host}/${targetOwner}/${targetRepo}`,
            "--json",
            "name,nameWithOwner,isPrivate,url,viewerPermission,owner",
        ],
        signal === undefined ? {} : { signal },
    );
    if (!result.started || result.code !== 0) {
        const missing =
            httpStatus(result) === 404 ||
            /Could not resolve to a Repository with (?:the|that) name/i.test(result.stderr);
        return missing
            ? { status: "missing", owner: targetOwner, repo: targetRepo }
            : {
                  status: "failed",
                  owner: targetOwner,
                  repo: targetRepo,
                  message: cliFailure(result, `reading ${targetOwner}/${targetRepo}`),
              };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        return {
            status: "failed",
            owner: targetOwner,
            repo: targetRepo,
            message: "GitHub CLI returned malformed repository JSON. Nothing was inferred.",
        };
    }
    const repository = parseRepository(parsed);
    return repository === null
        ? {
              status: "failed",
              owner: targetOwner,
              repo: targetRepo,
              message: "GitHub CLI returned incomplete repository data. Nothing was inferred.",
          }
        : { status: "found", repository };
}

/** Creates a repository with a starter README, then proves the result with `gh repo view`. */
export async function createGhRepository(
    lease: GhCliAccountLease,
    request: {
        readonly ownerLogin: string;
        readonly ownerKind: "user" | "organization";
        readonly name: string;
        readonly private: boolean;
    },
    signal?: AbortSignal,
): Promise<GhRepositoryCreateResult> {
    const ownerLogin = request.ownerLogin.trim();
    const name = request.name.trim();
    if (ownerLogin === "" || name === "") {
        return {
            ok: false,
            code: "invalid-request",
            message: "A repository owner and name are required.",
        };
    }

    let owners: readonly GhOwnerChoice[];
    try {
        owners = await listGhOwners(lease, signal);
    } catch (error) {
        return {
            ok: false,
            code: "cli-failed",
            message: error instanceof Error ? error.message : "GitHub CLI could not confirm repository owners.",
        };
    }
    if (
        !owners.some(
            (owner) => owner.kind === request.ownerKind && sameLogin(owner.login, ownerLogin),
        )
    ) {
        return {
            ok: false,
            code: "owner-not-confirmed",
            message:
                "GitHub CLI did not confirm that the selected account can create a repository for that owner. Refresh the real owner list and choose one of its entries.",
        };
    }

    const result = await lease.run(
        [
            "repo",
            "create",
            `${lease.host}/${ownerLogin}/${name}`,
            request.private ? "--private" : "--public",
            "--add-readme",
        ],
        signal === undefined ? {} : { signal },
    );
    if (!result.started || result.code !== 0) {
        const status = httpStatus(result);
        const taken =
            status === 422 ||
            /already exists|Name already exists on this account/i.test(result.stderr);
        const needsSignIn =
            status === 401 ||
            status === 403 ||
            /authentication|authorization|not authorized|insufficient scope|missing scope|SSO/i.test(result.stderr);
        return {
            ok: false,
            code: taken ? "name-taken" : "cli-failed",
            message: taken
                ? `A repository named ${ownerLogin}/${name} already exists.`
                : cliFailure(result, `creating ${ownerLogin}/${name}`),
            ...(needsSignIn ? { needsSignIn: true } : {}),
        };
    }

    const verified = await viewGhRepository(lease, ownerLogin, name, signal);
    if (verified.status !== "found") {
        return {
            ok: false,
            code: "verification-failed",
            message:
                "GitHub CLI reported that creation finished, but the new repository could not be verified. Refresh the repository list before trying again.",
        };
    }
    return { ok: true, repository: verified.repository };
}
