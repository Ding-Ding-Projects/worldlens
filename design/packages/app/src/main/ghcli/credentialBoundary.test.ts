import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = resolve(HERE, "..");
const UI = resolve(HERE, "../../../../ui/src");

function text(path: string): string {
    return readFileSync(path, "utf8");
}

function sourceWithoutComments(path: string): string {
    return text(path)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
}

const OPERATION_FILES = [
    "backup/ipc.ts",
    "backup/restore.ts",
    "backup/runner.ts",
    "cirender/actions.ts",
    "cirender/bootstrap.ts",
    "cirender/ipc.ts",
    "cirender/sync.ts",
    "cirender/transport.ts",
    "download/downloader.ts",
    "download/ipc.ts",
    "download/release.ts",
    "pages/hosting.ts",
    "pages/ipc.ts",
    "worldrepo/adopt.ts",
    "worldrepo/ipc.ts",
    "worldrepo/repo.ts",
    "worldsource/fetcher.ts",
    "worldsource/ipc.ts",
] as const;

const RENDERER_BOUNDARY_FILES = [
    resolve(MAIN, "../preload/index.ts"),
    resolve(UI, "bridge.d.ts"),
    resolve(UI, "components/github/ghCliBridge.ts"),
    resolve(UI, "components/github/ghCliAccountsStore.ts"),
    resolve(UI, "components/github/GhCliAccountsList.vue"),
    resolve(UI, "components/backup/backupBridge.ts"),
    resolve(UI, "components/cirender/ciRenderBridge.ts"),
] as const;

const LOCALIZED_ACCOUNT_FLOW_COPY = [
    {
        path: resolve(UI, "copy/surfaces/ghCliAccounts.ts"),
        keys: [
            "settings.github.picker.summary",
            "settings.github.picker.noneSelected",
            "settings.github.picker.selected",
            "settings.github.ghCli.logoutTitle",
            "settings.github.ghCli.logoutActionDetailed",
            "settings.github.ghCli.logoutConfirm",
            "settings.github.ghCli.logout",
        ],
    },
    {
        path: resolve(UI, "copy/surfaces/backup.ts"),
        keys: [
            "backup.account.reauthenticationRequired",
            "backup.account.active",
            "backup.account.signedOut",
            "backup.account.openSettings",
            "backup.account.search",
            "backup.account.pick",
            "backup.account.selected",
            "backup.account.empty",
            "backup.account.noMatch",
            "backup.account.help",
            "backup.owner.personal",
            "backup.owner.organization",
            "backup.owner.loading",
            "backup.owner.retry",
            "backup.owner.search",
            "backup.owner.pick",
            "backup.owner.selected",
            "backup.owner.empty",
            "backup.owner.noMatch",
            "backup.owner.help",
            "backup.repo.selected",
            "backup.repo.empty",
            "backup.repo.loadedHint",
        ],
    },
    {
        path: resolve(UI, "copy/surfaces/pages.ts"),
        keys: [
            "pages.account.reauthenticationRequired",
            "pages.account.search",
            "pages.account.pick",
            "pages.account.selected",
            "pages.account.empty",
            "pages.account.noMatch",
            "pages.account.help",
            "pages.owner.personal",
            "pages.owner.organization",
            "pages.owner.search",
            "pages.owner.selected",
            "pages.owner.empty",
            "pages.owner.noMatch",
            "pages.owner.help",
            "pages.repo.search",
            "pages.repo.pick",
            "pages.repo.selected",
            "pages.repo.empty",
            "pages.repo.noMatch",
            "pages.repo.help",
            "pages.repo.loading",
        ],
    },
    {
        path: resolve(UI, "copy/surfaces/worldrepo.ts"),
        keys: [
            "worldrepo.account.reauthenticationRequired",
            "worldrepo.account.search",
            "worldrepo.account.pick",
            "worldrepo.account.selected",
            "worldrepo.account.empty",
            "worldrepo.account.noMatch",
            "worldrepo.account.help",
            "worldrepo.owner.personal",
            "worldrepo.owner.organization",
            "worldrepo.owner.search",
            "worldrepo.owner.selected",
            "worldrepo.owner.empty",
            "worldrepo.owner.noMatch",
            "worldrepo.owner.help",
            "worldrepo.repo.search",
            "worldrepo.repo.pick",
            "worldrepo.repo.selected",
            "worldrepo.repo.empty",
            "worldrepo.repo.noMatch",
            "worldrepo.repo.help",
        ],
    },
] as const;

describe("gh-only credential boundary completeness", () => {
    it.each(OPERATION_FILES)("keeps %s on secret-free account leases", (relativePath) => {
        const source = sourceWithoutComments(resolve(MAIN, relativePath));
        expect(source).not.toMatch(/GhCredentialProvider|broker\.credential|\.credential\s*\(/);
        expect(source).not.toMatch(/\bcredential\s*:/);
        expect(source).not.toMatch(/\btoken\s*:/);
        expect(source).not.toMatch(/gh\s+auth\s+token|secretProcess|github\/session/);
    });

    it.each(RENDERER_BOUNDARY_FILES)("exposes no token-bearing renderer API in %s", (path) => {
        const source = sourceWithoutComments(path);
        expect(source).not.toMatch(/GitHubTokenForm|submitToken|saveToken|storeToken/);
        expect(source).not.toMatch(/github:(?:session|token|credential)/i);
        expect(source).not.toMatch(/\b(?:get|set|read|write|delete)Token\b/);
    });

    it("keeps repository, owner and account flows off browser-launch routes", () => {
        const paths = [
            resolve(MAIN, "ghcli/accounts.ts"),
            resolve(MAIN, "ghcli/ipc.ts"),
            resolve(MAIN, "ghcli/login.ts"),
            resolve(MAIN, "ghcli/repositories.ts"),
            resolve(MAIN, "cirender/ipc.ts"),
            resolve(MAIN, "cirender/setup.ts"),
            resolve(UI, "components/github/GhCliAccountsList.vue"),
            resolve(UI, "components/backup/BackupScreen.vue"),
            resolve(UI, "components/cirender/CiRenderScreen.vue"),
            resolve(UI, "components/pages/PagesScreen.vue"),
            resolve(UI, "components/worldrepo/WorldRepoScreen.vue"),
        ];
        const source = paths.map(sourceWithoutComments).join("\n");
        expect(source).not.toMatch(/shell\.openExternal|openExternalHttps|openRepositorySetup/);
        expect(source).not.toMatch(/--web|https:\/\/github\.com\/new/);
    });

    it.each([
        "components/backup/BackupScreen.vue",
        "components/cirender/CiRenderScreen.vue",
        "components/pages/PagesScreen.vue",
        "components/worldrepo/WorldRepoScreen.vue",
    ])("discloses the external gh account-switch race on %s", (relativePath) => {
        expect(sourceWithoutComments(resolve(UI, relativePath))).toContain(
            "Another gh process can still change that machine-wide account between commands",
        );
    });

    it.each(LOCALIZED_ACCOUNT_FLOW_COPY)(
        "catalogues every new account-flow string in English and Cantonese: $path",
        ({ path, keys }) => {
            const source = sourceWithoutComments(path);
            for (const key of keys) {
                expect(source, key).toContain(`"${key}":`);
            }
            // Each source object is constrained by `FixedString`, so these two fields make
            // the hand-written key inventory a bilingual completeness proof.
            expect(source).toContain("en:");
            expect(source).toContain("yue:");
        },
    );

    it.each([
        resolve(MAIN, "github/session.ts"),
        resolve(MAIN, "github/token.ts"),
        resolve(MAIN, "github/storage.ts"),
        resolve(MAIN, "github/ipc.ts"),
        resolve(MAIN, "github/external.ts"),
        resolve(MAIN, "download/token.ts"),
        resolve(MAIN, "ghcli/routing.ts"),
        resolve(UI, "components/github/GitHubTokenForm.vue"),
        resolve(UI, "components/github/GitHubDeviceFlowPanel.vue"),
        resolve(UI, "components/github/githubBridge.ts"),
    ])("retires the legacy credential path %s", (path) => {
        expect(existsSync(path)).toBe(false);
    });

    it("does not reintroduce the old broker accessor in main wiring", () => {
        const source = sourceWithoutComments(resolve(MAIN, "index.ts"));
        expect(source).not.toMatch(/broker\.credential|credential\(\)\?\.token/);
        expect(source).not.toMatch(/GhCredentialProvider|gh\s+auth\s+token/);
    });

    it("removes ambient credential overrides from every shared child-process and gh API route", () => {
        const source = sourceWithoutComments(resolve(MAIN, "cirender/gh.ts"));
        expect(source).toMatch(/\.\.\.GH_CLI_AUTH_ENVIRONMENT/);
        expect(source).toMatch(/function ghProcessOptions/);
        expect(source).toMatch(/environmentWithout\(options\?\.omitEnvironmentVariables\)/);
        expect(source).toMatch(/GIT_CREDENTIAL_DIAGNOSTIC_ENVIRONMENT/);
        expect(source).toMatch(/startsWith\("GIT_TRACE"\)/);
        expect(source).toMatch(/GIT_TERMINAL_PROMPT.*=.*"0"/);

        for (const relativePath of ["pages/hosting.ts", "worldrepo/repo.ts", "worldrepo/adopt.ts"]) {
            const operation = sourceWithoutComments(resolve(MAIN, relativePath));
            expect(operation).not.toMatch(/process\.env|GH_TOKEN|GITHUB_TOKEN/);
        }
    });

    it("never returns raw credential-helper diagnostics from Pages or World Repository", () => {
        const pages = sourceWithoutComments(resolve(MAIN, "pages/hosting.ts"));
        const worldrepo = sourceWithoutComments(resolve(MAIN, "worldrepo/repo.ts"));
        expect(pages).not.toContain("pushResult.stderr.trim()");
        expect(worldrepo).not.toMatch(/(?:fetch|targetPush|pushed)\.stderr\.trim\(\)/);
        expect(pages).toContain("credentialGitFailureDetail(pushResult)");
        expect(worldrepo).toContain("credentialGitFailureDetail(pushed)");
        expect(worldrepo).toContain("credentialGitFailureDetail(result)");
    });
});
