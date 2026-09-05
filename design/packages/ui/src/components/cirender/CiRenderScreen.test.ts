/**
 * @vitest-environment jsdom
 *
 * The CI-render surface, mounted.
 *
 * Five properties are only true of the rendered component and would be asserted against a
 * stand-in for nothing: that a build with no bridge says what is needed rather than showing
 * a button that fails on press; that a **public** repository cannot be rendered to until
 * the box has been ticked; that an unaccepted Mojang licence blocks the button and offers
 * the settings row rather than a tick box of its own; that the credential in play is on
 * screen before the button; and that the page states the trade-offs beside the pitch,
 * because advertising the upside alone is how somebody wastes an afternoon.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VSelect } from "vuetify/components";
import CiRenderScreen from "./CiRenderScreen.vue";
import CloudRenderConfigWizard from "./CloudRenderConfigWizard.vue";
import ciRenderScreenSource from "./CiRenderScreen.vue?raw";
import type {
    Answer,
    CiAttachableRun,
    CiBootstrapResult,
    CiPreflight,
    CiRenderBridge,
    CiRepositoryNameAvailability,
    CiScheduleStatus,
    CiScheduleWriteResult,
    CiSyncEvent,
    CiSyncRequest,
    CiSyncResult,
    CiSyncState,
    RouteReport,
} from "./ciRenderBridge.js";
import type { GhCliAccountReadout, GhCliBridge } from "../github/ghCliBridge.js";
import type {
    MinecraftFolder,
    MinecraftWorldSummary,
    WorldCatalogBridge,
} from "../world/worldCatalog.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own
    // size. The same stubs the backup and downloads suites install, for the same reason:
    // without them a component that renders perfectly well in the app throws inside a
    // watcher and looks broken here.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        addEventListener: () => {},
        removeEventListener: () => {},
    } as unknown as typeof globalThis.visualViewport;
});

function routeReport(overrides: Partial<RouteReport> = {}): RouteReport {
    return {
        route: "gh",
        describe: "Using the selected GitHub CLI account (octocat).",
        gh: {
            availability: "ready",
            version: null,
            account: "octocat",
            host: "github.com",
            message: "",
            usable: true,
            reason: null,
        },
        ready: true,
        canUpload: true,
        ...overrides,
    };
}

function preflight(overrides: Partial<CiPreflight> = {}): CiPreflight {
    return {
        syncId: "s",
        repository: {
            owner: "o",
            repo: "r",
            fullName: "o/r",
            private: true,
            canWrite: true,
            htmlUrl: "https://github.test/o/r",
            warning: { level: "note", message: "This repository is private." },
        },
        repositoryFailure: null,
        routeReport: routeReport(),
        eulaAccepted: true,
        plan: {
            mapId: "world",
            mapName: "World",
            dimension: "minecraft:overworld",
            inputs: {},
            configuration: {
                route: "project-archive",
                complete: true,
                file: "worldlens.project.json",
            },
            notCarried: [],
        },
        planFailure: null,
        world: { label: "overworld", files: 10, bytes: 1000 },
        worldFailure: null,
        worldChanged: true,
        uploadNeeded: true,
        estimatedArchiveBytes: 1000,
        state: null,
        run: null,
        ...overrides,
    };
}

function fakeBridge(
    report: CiPreflight,
    started: CiSyncResult[] = [],
    overrides: Partial<CiRenderBridge> = {},
): CiRenderBridge {
    return {
        ciRenderPreflight: () =>
            Promise.resolve({ ok: true, value: report } as Answer<CiPreflight>),
        startCiRender: (request) => {
            started.push({
                ok: false,
                syncId: "recorded",
                failure: {
                    code: "recorded",
                    message: JSON.stringify(request),
                    detail: null,
                    status: null,
                    needsSignIn: false,
                    needsEula: false,
                    route: null,
                    run: null,
                    failingJob: null,
                    logExcerpt: null,
                },
            });
            return Promise.resolve(started[started.length - 1] as CiSyncResult);
        },
        checkCiRender: () =>
            Promise.resolve({
                ok: true,
                syncId: "s",
                outcome: "running",
                run: null,
                state: null as never,
            }),
        listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
        cancelCiRender: () => Promise.resolve(true),
        activeCiRenders: () => Promise.resolve([]),
        onCiRenderEvent: (_listener: (event: CiSyncEvent) => void) => () => {},
        listCiOwners: () =>
            Promise.resolve({
                ok: true,
                login: "o",
                owners: [{ login: "o", kind: "user" }],
            }),
        listExistingRepositories: () => Promise.resolve({ ok: true, value: [] }),
        canCancel: true,
        canList: true,
        canCheck: true,
        canSeeActive: true,
        ...overrides,
    };
}

/**
 * A bridge that actually forwards events, so a test can drive the mounted rows the way the
 * main process really would - `started`, then `phase`, then `progress` and `run`.
 */
function eventBridge(report: CiPreflight): {
    bridge: CiRenderBridge;
    emit: (event: CiSyncEvent) => void;
} {
    let listener: ((event: CiSyncEvent) => void) | null = null;
    return {
        emit: (event) => listener?.(event),
        bridge: {
            ciRenderPreflight: () =>
                Promise.resolve({ ok: true, value: report } as Answer<CiPreflight>),
            startCiRender: () =>
                Promise.resolve({
                    ok: false,
                    syncId: "nowhere",
                    failure: {
                        code: "test",
                        message: "not stubbed",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                }),
            checkCiRender: () =>
                Promise.resolve({
                    ok: true,
                    syncId: "s",
                    outcome: "running",
                    run: null,
                    state: null as never,
                }),
            listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
            cancelCiRender: () => Promise.resolve(true),
            activeCiRenders: () => Promise.resolve([]),
            onCiRenderEvent: (candidate) => {
                listener = candidate;
                return () => {
                    listener = null;
                };
            },
            canCancel: true,
            canList: true,
            canCheck: true,
            canSeeActive: true,
        },
    };
}

function mountScreen(bridge: CiRenderBridge | null, extraProps: Record<string, unknown> = {}) {
    return mount(CiRenderScreen, {
        props: { bridge, canOpenSettings: true, ...extraProps },
        global: {
            plugins: [
                createVuetify(),
                createI18n({
                    legacy: false,
                    locale: "en",
                    missingWarn: false,
                    fallbackWarn: false,
                }),
            ],
        },
    });
}

/** A `MinecraftFolder`, filled with sane defaults so a test only has to name what it cares about. */
function catalogFolder(overrides: Partial<MinecraftFolder> = {}): MinecraftFolder {
    return {
        id: "f1",
        label: "Minecraft",
        labelled: false,
        chosenPath: "/mc",
        savesPath: "/mc/saves",
        resolution: "installation",
        builtIn: true,
        origin: "home",
        state: "ok",
        stateDetail: null,
        mountedAt: null,
        ...overrides,
    };
}

/** A `MinecraftWorldSummary`, filled with sane defaults for the same reason. */
function catalogWorld(overrides: Partial<MinecraftWorldSummary> = {}): MinecraftWorldSummary {
    return {
        folderId: "f1",
        path: "/mc/saves/My World",
        directoryName: "My World",
        name: "My World",
        lastPlayed: null,
        versionName: null,
        snapshot: null,
        gameMode: null,
        hardcore: null,
        cheats: null,
        seed: null,
        regionFiles: {},
        sizeBytes: null,
        sizeComplete: true,
        detailsError: null,
        ...overrides,
    };
}

function fakeCatalogBridge(
    folders: readonly MinecraftFolder[],
    worldsByFolder: Readonly<Record<string, readonly MinecraftWorldSummary[]>>,
): WorldCatalogBridge {
    return {
        listMinecraftFolders: () => Promise.resolve(folders),
        mountMinecraftFolder: () => Promise.resolve({ ok: false, message: "not stubbed" }),
        unmountMinecraftFolder: () => Promise.resolve(true),
        labelMinecraftFolder: () => Promise.resolve(true),
        scanMinecraftFolder: (id) =>
            Promise.resolve({
                ok: true,
                scan: {
                    folderId: id,
                    savesPath: "",
                    worlds: worldsByFolder[id] ?? [],
                    truncated: false,
                },
            }),
    };
}

/** A secret-free gh account readout, filled with sane defaults. */
function ghAccount(overrides: Partial<GhCliAccountReadout> = {}): GhCliAccountReadout {
    return {
        id: "acct",
        login: "octocat",
        host: "github.com",
        scopes: [],
        scopesReported: true,
        tokenSource: "keyring",
        gitProtocol: "https",
        healthy: true,
        stateDetail: null,
        missingAppScopes: [],
        active: false,
        ...overrides,
    };
}

async function selectOwner(wrapper: ReturnType<typeof mountScreen>, login: string): Promise<void> {
    await flushPromises();
    const select = wrapper
        .findAllComponents(VSelect)
        .find((component) => component.props("label") === "Choose an owner");
    expect(select, "the real GitHub CLI owner picker").toBeDefined();
    select?.vm.$emit("update:modelValue", login);
    await flushPromises();
}

/**
 * A scripted `GitHubBridge` behind the account picker: `list` answers with whichever account
 * is currently active, `setActive` really changes it (so a follow-up list reflects the
 * switch), and every call is recorded so a test can prove a switch actually reached the
 * bridge rather than only updating on-screen state.
 */
function fakeAccountsBridge(
    accounts: readonly GhCliAccountReadout[],
    activeId: string | null,
): { bridge: GhCliBridge; calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        bridge: {
            ghCliListAccounts: () => {
                calls.push("list");
                return Promise.resolve({
                    availability: accounts.length === 0 ? "no-accounts" : "ready",
                    version: "gh version 2.97.0",
                    accounts: accounts.map((account) => ({
                        ...account,
                        active: account.id === activeId,
                    })),
                    source: "json",
                    capabilities: { structuredStatus: true },
                    message: "ready",
                });
            },
        },
    };
}

async function check(wrapper: ReturnType<typeof mountScreen>): Promise<void> {
    // The Check button is disabled until a world folder, an owner and a repository name
    // are all filled in - the guided card's own doing. Every test below predates that gate
    // and only cares what happens once a check actually runs, so ordinary values go in for
    // the three fields first.
    await wrapper.find('[data-test="world-field"] input').setValue("/world");
    await selectOwner(wrapper, "o");
    await wrapper.find('[data-test="repo-field"] input').setValue("r");
    await flushPromises();
    const buttons = wrapper.findAll("button");
    const trigger = buttons.find((button) => button.text().includes("Check"));
    await trigger?.trigger("click");
    await flushPromises();
}

describe("a build that cannot do this says so", () => {
    it("shows the unsupported note instead of a button that would fail", () => {
        const wrapper = mountScreen(null);
        expect(wrapper.text()).toContain("desktop application");
        expect(wrapper.find('[data-test="start"]').exists()).toBe(false);
    });
});

describe("the pitch and its price are both on the page", () => {
    it("says the point is that your computer does not do the work", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.text()).toContain("cannot render a big world");
        expect(wrapper.text()).toContain("GitHub's runners");
    });

    it("states the trade-offs beside it rather than only the upside", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        const text = wrapper.text();
        expect(text).toContain("takes time and bandwidth");
        expect(text).toContain("finite for private repositories");
        expect(text).toContain("unlimited standard-runner minutes");
    });
});

describe("the list of past and running renders, before any have happened", () => {
    it("explains what the list is for instead of just being blank", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.find('[data-test="row"]').exists()).toBe(false);

        const empty = wrapper.find('[data-test="no-runs"]');
        expect(empty.exists()).toBe(true);
        expect(empty.text()).toContain("GitHub's own computers");
        expect(empty.text()).toContain("Render on GitHub");
    });
});

describe("consent", () => {
    it("will not start against a public repository until the box is ticked", async () => {
        // The world is already uploaded, so the public acknowledgement is the only thing
        // left in the way - which is what this test is about. The upload consent has its
        // own test below.
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    uploadNeeded: false,
                    worldChanged: false,
                    repository: {
                        owner: "o",
                        repo: "r",
                        fullName: "o/r",
                        private: false,
                        canWrite: true,
                        htmlUrl: "",
                        warning: { level: "warning", message: "This repository is PUBLIC." },
                    },
                }),
            ),
        );
        await check(wrapper);

        expect(wrapper.find('[data-test="repository-warning"]').text()).toContain("PUBLIC");
        expect(wrapper.find('[data-test="ack-public"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("publicly");
        // Present but not pressable: a button that vanishes leaves nothing for the reason
        // beside it to be about.
        expect(wrapper.find('[data-test="start"]').attributes("disabled")).toBeDefined();
    });

    it("asks before a world leaves the machine, and neither box starts ticked", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);

        const upload = wrapper.find('[data-test="ack-upload"] input');
        expect((upload.element as HTMLInputElement).checked).toBe(false);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("uploaded to GitHub");
    });

    it("blocks on an unaccepted Mojang licence and offers the setting, never a tick box", async () => {
        const wrapper = mountScreen(fakeBridge(preflight({ eulaAccepted: false })));
        await check(wrapper);

        expect(wrapper.find('[data-test="eula"]').text()).toContain("will not accept it for you");
        expect(wrapper.find('[data-test="blocked"]').text()).toContain("Mojang");
        // The only control offered is the one that opens the existing consent row.
        expect(wrapper.find('[data-test="eula"] button').text()).toContain("consent");
    });
});

describe("which credential is in play is on screen before the button", () => {
    it("names the selected GitHub CLI account", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').text()).toContain("octocat");
    });

    it("names the explicitly selected GitHub CLI account", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the selected GitHub CLI account (ghuser).",
                        canUpload: false,
                    }),
                    uploadNeeded: false,
                    worldChanged: false,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').text()).toContain("gh command-line tool");
    });

    it("shows no secondary refusal when the selected account is ready", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await check(wrapper);
        expect(wrapper.find('[data-test="route-gh"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="route-aside"]').exists()).toBe(false);
    });

    it.each([
        ["not-installed" as const, null, "is not available", "Install it from cli.github.com"],
        ["signed-out" as const, null, "signed out", "GitHub Settings"],
        ["ready" as const, "ghuser", "signed in as ghuser", "github.com"],
    ])(
        "keeps the gh state %s distinct, because the remedies differ",
        async (availability, account, said, remedy) => {
            const wrapper = mountScreen(
                fakeBridge(
                    preflight({
                        routeReport: routeReport({
                            route: availability === "ready" ? "gh" : null,
                            gh: {
                                availability,
                                version: null,
                                account,
                                host: "github.com",
                                message: "",
                                usable: availability === "ready",
                                reason: null,
                            },
                        }),
                        uploadNeeded: false,
                        worldChanged: false,
                    }),
                ),
            );
            await check(wrapper);

            const text = wrapper.find('[data-test="route-gh"]').text();
            expect(text).toContain(said);
            expect(text).toContain(remedy);
        },
    );

    it("says why the selected account was refused, so a denial is actionable", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the gh command-line tool (ghuser).",
                        gh: {
                            availability: "ready",
                            version: null,
                            account: "ghuser",
                            host: "github.com",
                            message: "",
                            usable: false,
                            reason: "GitHub answered 403",
                        },
                    }),
                    uploadNeeded: false,
                    worldChanged: false,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="route-aside"]').text()).toContain("403");
    });

    it("lets a gh-only machine upload, and only blocks when neither route can publish", async () => {
        const canPublish = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: "gh",
                        describe: "Using the gh command-line tool (ghuser).",
                        canUpload: true,
                    }),
                }),
            ),
        );
        await check(canPublish);
        // The only thing left in the way is the consent, not the credential.
        expect(canPublish.find('[data-test="blocked"]').text()).toContain("uploaded to GitHub");

        const cannot = mountScreen(
            fakeBridge(preflight({ routeReport: routeReport({ route: "gh", canUpload: false }) })),
        );
        await check(cannot);
        const blocked = cannot.find('[data-test="blocked"]').text();
        expect(blocked).toContain("Settings");
        expect(blocked).toContain("selected GitHub CLI account");
    });

    it("blocks with the reason when the selected credential cannot drive it", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: null,
                        ready: false,
                        canUpload: false,
                        describe:
                            "The selected GitHub CLI account cannot start a render: gh is not on PATH.",
                    }),
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="blocked"]').text()).toContain(
            "selected GitHub CLI account",
        );
    });

    it("offers the gh account recovery action on the same card as an identity refusal", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    routeReport: routeReport({
                        route: null,
                        ready: false,
                        canUpload: false,
                        describe:
                            "octocat is not signed in to gh on github.com. Nothing was uploaded.",
                        gh: {
                            availability: "ready",
                            version: "gh version 2.96.0",
                            account: null,
                            host: null,
                            message: "The selected account needs attention.",
                            usable: false,
                            reason: "The selected account needs attention.",
                            recovery: "github-settings",
                        },
                    }),
                }),
            ),
        );
        await check(wrapper);

        const recovery = wrapper.find('[data-test="route-gh-recovery"]');
        expect(recovery.exists()).toBe(true);
        expect(recovery.text()).toContain("Open GitHub accounts");
        await recovery.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });
});

describe("what it says about an upload", () => {
    it("says plainly when nothing will be sent", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    uploadNeeded: false,
                    worldChanged: false,
                    state: { assetName: "world.zip" } as never,
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="upload-line"]').text()).toContain("has not changed");
        // No consent is asked for something that is not going to happen.
        expect(wrapper.find('[data-test="ack-upload"]').exists()).toBe(false);
    });

    it("says that the complete project config, including the render mask, travels", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    plan: {
                        mapId: "world",
                        mapName: "World",
                        dimension: "minecraft:overworld",
                        inputs: {},
                        configuration: {
                            route: "project-archive",
                            complete: true,
                            file: "worldlens.project.json",
                        },
                        notCarried: [],
                    },
                }),
            ),
        );
        await check(wrapper);
        expect(wrapper.find('[data-test="config-transport"]').text()).toContain(
            "worldlens.project.json",
        );
        expect(wrapper.find('[data-test="config-transport"]').text()).toContain(
            "complete render mask",
        );
    });
});

describe("hosting the finished map on GitHub Pages", () => {
    it("does not ask for it unless somebody says so", async () => {
        // Rendering a world is a private act until the person says otherwise. A default
        // that put somebody's world on the open web the first time they pressed the
        // button would be wrong even in a repository that is already public.
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(
            fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started),
        );
        await check(wrapper);

        const box = wrapper.find('[data-test="publish-pages"] input');
        expect((box.element as HTMLInputElement).checked).toBe(false);

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        expect(
            JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}"),
        ).toMatchObject({
            output: "artifact",
        });
    });

    it("asks the workflow to publish when it is ticked", async () => {
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(
            fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started),
        );
        await check(wrapper);

        await wrapper.find('[data-test="publish-pages"] input').setValue(true);
        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();

        expect(
            JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}"),
        ).toMatchObject({
            output: "artifact-and-pages",
        });
    });

    it("says where the map lands and what a map in parts means, before it is started", async () => {
        // Two things somebody would otherwise find out afterwards: the map goes under the
        // documentation site rather than over it, and a world too big to assemble on one
        // runner cannot be hosted this way at all.
        const wrapper = mountScreen(
            fakeBridge(preflight({ uploadNeeded: false, worldChanged: false })),
        );
        await check(wrapper);
        await wrapper.find('[data-test="publish-pages"] input').setValue(true);

        const text = wrapper.text();
        expect(text).toContain("/map/");
        expect(text).toContain("in parts");
    });
});

describe("a running row shows the real numbers the main process actually sends", () => {
    it("says nothing about the route until the first phase event, then names it", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        await flushPromises();
        expect(wrapper.find('[data-test="row-route"]').exists()).toBe(false);

        emit({
            type: "phase",
            syncId: "s",
            phase: "checking",
            route: "gh",
            at: "2026-08-04T10:00:01Z",
        });
        await flushPromises();
        expect(wrapper.find('[data-test="row-route"]').text()).toContain(
            "selected GitHub CLI account",
        );
    });

    it("shows the upload's own item count beside the bytes, not only the bytes", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({
            type: "phase",
            syncId: "s",
            phase: "uploading",
            route: "gh",
            at: "2026-08-04T10:00:01Z",
        });
        emit({
            type: "progress",
            syncId: "s",
            phase: "uploading",
            description: "Uploading part 2 of 3",
            bytesDone: 500,
            bytesTotal: 1000,
            assetsDone: 1,
            assetsTotal: 3,
            asset: "world.zip.001",
            at: "2026-08-04T10:00:02Z",
        });
        await flushPromises();

        const transfer = wrapper.find('[data-test="transfer"]');
        expect(transfer.find('[data-test="transfer-description"]').text()).toContain(
            "Uploading part 2 of 3",
        );
        expect(transfer.find('[data-test="transfer-current-item"]').text()).toContain(
            "world.zip.001",
        );
        expect(transfer.find('[data-test="transfer-bytes-done"]').text()).toContain("500");
        expect(transfer.find('[data-test="transfer-bytes-total"]').text()).toContain("1 kB");
        expect(transfer.find('[data-test="transfer-pieces"]').text()).toContain("1 of 3 pieces");
        expect(transfer.find('[data-test="transfer-milestone"]').text()).not.toContain("500");
    });

    it("labels an unknown transfer total instead of inventing a zero-size total", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({
            type: "phase",
            syncId: "s",
            phase: "uploading",
            route: "gh",
            at: "2026-08-04T10:00:01Z",
        });
        emit({
            type: "progress",
            syncId: "s",
            phase: "uploading",
            description: "Uploading",
            bytesDone: 500,
            bytesTotal: 0,
            assetsDone: 0,
            assetsTotal: 0,
            asset: null,
            at: "2026-08-04T10:00:02Z",
        });
        await flushPromises();

        expect(wrapper.find('[data-test="transfer-bytes-total"]').text()).toContain("Unknown");
        expect(wrapper.find('[data-test="transfer-bar"]').attributes("aria-busy")).toBe("true");
    });

    it("groups shards by the wave their own name says, and shows it per job too", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);

        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        emit({
            type: "run",
            syncId: "s",
            run: {
                runId: 7,
                runNumber: 1,
                htmlUrl: "https://github.test/runs/7",
                status: "in_progress",
                conclusion: null,
                createdAt: "2026-08-04T10:00:00Z",
                updatedAt: "2026-08-04T10:00:00Z",
                headSha: "abc",
                jobs: [
                    {
                        id: 1,
                        name: "Wave 1 shard 0",
                        status: "completed",
                        conclusion: "success",
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 1,
                    },
                    {
                        id: 2,
                        name: "Wave 1 shard 1",
                        status: "in_progress",
                        conclusion: null,
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 1,
                    },
                    {
                        id: 3,
                        name: "Wave 2 shard 0",
                        status: "queued",
                        conclusion: null,
                        htmlUrl: "",
                        startedAt: null,
                        completedAt: null,
                        wave: 2,
                    },
                ],
            },
            at: "2026-08-04T10:00:03Z",
        });
        await flushPromises();

        const summary = wrapper.find('[data-test="wave-summary"]').text();
        expect(summary).toContain("Wave 1: 1 of 2");
        expect(summary).toContain("Wave 2: 0 of 1");

        const jobWaves = wrapper.findAll('[data-test="job-wave"]').map((node) => node.text());
        expect(jobWaves).toEqual(["Wave 1", "Wave 1", "Wave 2"]);
    });
});

describe("a recovered map whose optional Pages publication failed", () => {
    it("shows the warning, the failing step, and a working retry action", async () => {
        const events = eventBridge(preflight());
        const requests: CiSyncRequest[] = [];
        const state: CiSyncState = {
            version: 2,
            syncId: "s",
            owner: "o",
            repo: "r",
            accountId: null,
            worldFolder: "/w",
            mapId: "bayville-world-v10-1",
            mapName: "Bayville World v10.1",
            dimension: "minecraft:overworld",
            fingerprint: "fingerprint",
            releaseTag: "world-v1",
            assetName: "world.zip",
            archiveBytes: 42,
            archiveSha256: "a".repeat(64),
            runId: 7,
            runNumber: 7,
            runUrl: "https://github.test/runs/7",
            dispatchedAt: "2026-08-19T01:00:00Z",
            stage: "rendered",
            renderId: "ci-s",
            artifactSha256: "b".repeat(64),
            recoveryAttemptedRunId: 7,
            postRenderWarning: {
                code: "pages-not-published",
                runId: 7,
                failingJob: "pages",
                failingStep: "publish",
            },
            failureCode: null,
            failureMessage: null,
            updatedAt: "2026-08-19T01:35:46Z",
        };
        const bridge: CiRenderBridge = {
            ...events.bridge,
            listCiRenders: () => Promise.resolve({ ok: true, value: [state] }),
            startCiRender: (request) => {
                requests.push(request);
                return Promise.resolve({
                    ok: true,
                    syncId: "s",
                    outcome: "running",
                    run: null,
                    state,
                });
            },
        };
        const wrapper = mountScreen(bridge);
        events.emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "bayville-world-v10-1",
            worldFolder: "/w",
            at: "2026-08-19T01:00:00Z",
        });
        events.emit({
            type: "run",
            syncId: "s",
            run: {
                runId: 7,
                runNumber: 7,
                htmlUrl: "https://github.test/runs/7",
                status: "completed",
                conclusion: "failure",
                createdAt: "2026-08-19T01:00:00Z",
                updatedAt: "2026-08-19T01:35:45Z",
                headSha: "abc",
                jobs: [],
            },
            at: "2026-08-19T01:35:45Z",
        });
        events.emit({
            type: "finished",
            syncId: "s",
            summary: {
                syncId: "s",
                repository: "o/r",
                releaseTag: "world-v1",
                assetName: "world.zip",
                runId: 7,
                runUrl: "https://github.test/runs/7",
                renderId: "ci-s",
                dataRoot: "/local/ci-s",
                mapId: "bayville_world_v10_1",
                mapName: "Bayville World v10.1",
                route: "gh",
                uploaded: false,
                artifactBytes: 42,
                artifactSha256: "b".repeat(64),
                verified: true,
                postRenderWarning: state.postRenderWarning ?? null,
            },
            durationMs: 1000,
            at: "2026-08-19T01:35:46Z",
        });
        events.emit({
            type: "failed",
            syncId: "another",
            failure: {
                code: "run-failure",
                message: "A different run failed.",
                detail: null,
                status: null,
                needsSignIn: false,
                needsEula: false,
                route: "gh",
                run: null,
                failingJob: "Merge group 0",
                failingStep: "Build the documentation site to publish alongside the map",
                logExcerpt: null,
            },
            at: "2026-08-19T01:35:46Z",
        });
        await flushPromises();

        expect(wrapper.find('[data-test="post-render-warning"]').text()).toContain(
            "map is ready locally",
        );
        expect(wrapper.find('[data-test="retry-post-render"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="failing-step"]').text()).toContain(
            "Build the documentation site",
        );

        await wrapper.find('[data-test="retry-post-render"]').trigger("click");
        await flushPromises();
        expect(requests).toHaveLength(1);
        expect(requests[0]?.output).toBe("artifact-and-pages");
        expect(requests[0]?.forceUpload).toBe(false);
    });
});

describe("the world folder: a picker of what this machine already knows about", () => {
    it("shows worlds already found, and fills the field when one is chosen", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const wrapper = mountScreen(fakeBridge(preflight()), { catalogBridge });
        await flushPromises();

        expect(wrapper.text()).toContain("My World");

        const option = wrapper.find('[role="option"]');
        expect(option.exists()).toBe(true);
        await option.trigger("click");
        await flushPromises();

        expect(
            (wrapper.find('[data-test="world-field"] input').element as HTMLInputElement).value,
        ).toBe("/mc/saves/My World");
    });

    it("says plainly when nothing was found, and how to add a folder", async () => {
        const catalogBridge = fakeCatalogBridge([], {});
        const wrapper = mountScreen(fakeBridge(preflight()), { catalogBridge });
        await flushPromises();

        expect(wrapper.text()).toContain("No Minecraft folder was found");
        expect(wrapper.text()).toContain("Mount another Minecraft folder");
    });

    it("hides the browse button when the shared browse affordance is not on this build", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.find('[data-test="world-browse"]').attributes("disabled")).toBeDefined();
    });

    it("gives the disabled Browse button a reason that is on screen, not only in a hover title", () => {
        // A `title` attribute is a mouse-hover tooltip and nothing else: it never reaches a
        // keyboard-only user, and a disabled button is skipped by Tab entirely, so an
        // aria-label attached to the button can go unheard too. The one route both a
        // keyboard user and a screen reader in normal reading order actually encounter is
        // plain text sitting on the page - which this asserts exists and says why.
        const wrapper = mountScreen(fakeBridge(preflight()));
        const browse = wrapper.find('[data-test="world-browse"]');
        expect(browse.attributes("disabled")).toBeDefined();

        const reason = wrapper.find('[data-test="world-browse-unavailable"]');
        expect(reason.exists()).toBe(true);
        expect(reason.text().length).toBeGreaterThan(0);
        // The visible text and the button's own accessible name say the same thing, so a
        // screen reader landing on either route hears an actual reason rather than a bare
        // "Browse, dimmed".
        expect(browse.attributes("aria-label")).toContain(reason.text());
    });

    it("fills the field from the shared browse affordance when this build carries it", async () => {
        vi.stubGlobal("worldlens", {
            dialog: { pickFolder: () => Promise.resolve("/browsed/world") },
        });
        try {
            const wrapper = mountScreen(fakeBridge(preflight()));
            expect(
                wrapper.find('[data-test="world-browse"]').attributes("disabled"),
            ).toBeUndefined();
            await wrapper.find('[data-test="world-browse"]').trigger("click");
            await flushPromises();
            expect(
                (wrapper.find('[data-test="world-field"] input').element as HTMLInputElement).value,
            ).toBe("/browsed/world");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("the repository owner: chosen from the signed-in account, or typed", () => {
    it("offers the sign-in action when nobody is signed in, rather than a dead end", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({
                    ok: false,
                    signedIn: false,
                    message: "Nobody is signed in to GitHub.",
                }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        expect(wrapper.find('[data-test="owner-signed-out"]').text()).toContain(
            "Nobody is signed in",
        );
        const signInButton = wrapper.find('[data-test="owner-signed-out"] button');
        expect(signInButton.exists()).toBe(true);
        await signInButton.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("offers a retry when somebody is signed in but the list itself could not be read", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({ ok: false, signedIn: true, message: "GitHub answered 500." }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        expect(wrapper.find('[data-test="owner-load-failed"]').text()).toContain("500");
        expect(wrapper.find('[data-test="owner-signed-out"]').exists()).toBe(false);
    });

    it("offers account recovery when the owner read is refused by the selected credential", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({
                    ok: false,
                    signedIn: true,
                    needsSignIn: true,
                    message: "release-bot on ghe.example needs reauthentication.",
                }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        const recover = wrapper.find('[data-test="owner-reauthenticate"]');
        expect(recover.exists()).toBe(true);
        await recover.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("announces the signed-out and load-failed owner states to assistive technology", async () => {
        // Both states relied on VAlert's own hardcoded default of role="alert" *regardless
        // of severity* - correct by accident for a real failure, but exactly wrong for the
        // signed-out state, which is routine information with a remedy, not an emergency
        // that should interrupt whatever a screen reader was already saying. Every sibling
        // that shows the same kind of "nothing is wrong, here's what to do" info alert -
        // the GitHub CLI account row, `JavaRuntimeRow.vue`, `StorageSettingRow.vue`,
        // `ConsentSettingsRow.vue` - downgrades it to the polite `role="status"` instead,
        // and this screen's owner-signed-out alert is the same kind of message.
        const signedOut = mountScreen({
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({
                    ok: false,
                    signedIn: false,
                    message: "Nobody is signed in to GitHub.",
                }),
        });
        await flushPromises();
        const signedOutAlert = signedOut.find('[data-test="owner-signed-out"]');
        expect(signedOutAlert.attributes("role")).toBe("status");
        expect(signedOutAlert.attributes("aria-live")).toBe("polite");

        // The load-failed state is a genuine failure - the list itself could not be read -
        // so it keeps the assertive `role="alert"` every sibling failure alert uses
        // (`dropFailure`, `sourceFailure`, the repositories-failure alert on this same
        // screen), stated explicitly here rather than left to a library default that could
        // change under it.
        const loadFailed = mountScreen({
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({ ok: false, signedIn: true, message: "GitHub answered 500." }),
        });
        await flushPromises();
        const loadFailedAlert = loadFailed.find('[data-test="owner-load-failed"]');
        expect(loadFailedAlert.attributes("role")).toBe("alert");
    });

    it("lists the signed-in login and every organisation to choose from", async () => {
        const bridgeWithOwners: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listCiOwners: () =>
                Promise.resolve({
                    ok: true,
                    login: "octocat",
                    owners: [
                        { login: "octocat", kind: "user" },
                        { login: "octo-org", kind: "organization" },
                    ],
                }),
        };
        const wrapper = mountScreen(bridgeWithOwners);
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Choose an owner");
        // Each row now says in words what it is, rather than bracketing the kind onto the
        // end of the login - see the comment on ownerItems in CiRenderScreen.vue.
        expect(select?.props("items")).toEqual([
            {
                title: "octocat",
                subtitle: "Your own account",
                props: { subtitle: "Your own account" },
                value: "octocat",
                searchText: "octocat user",
            },
            {
                title: "octo-org",
                subtitle: "Organization",
                props: { subtitle: "Organization" },
                value: "octo-org",
                searchText: "octo-org organization",
            },
        ]);
    });
});

describe("render as: which stored GitHub account this render authenticates as", () => {
    it("shows no picker when this build cannot list accounts at all", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge: null });
        await flushPromises();
        expect(wrapper.find('[data-test="cirender-account-picker"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="account-signed-out"]').exists()).toBe(false);
    });

    it("offers the sign-in action when the registry exists but nobody is stored in it", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge([], null);
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        expect(wrapper.find('[data-test="account-signed-out"]').text()).toContain(
            "Nobody is signed in",
        );
        expect(wrapper.find('[data-test="cirender-account-picker"]').exists()).toBe(false);
        const signInButton = wrapper.find('[data-test="account-signed-out"] button');
        expect(signInButton.exists()).toBe(true);
        await signInButton.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("still shows exactly one signed-in account, disabled, naming why", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" })],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        // Trivially satisfied rather than hidden: the picker still names which account it
        // is fixed to, even though there is nothing to switch to.
        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        expect(select?.props("items")).toEqual([
            {
                title: "octocat",
                subtitle: "github.com - active",
                value: "a1",
                searchText: "octocat github.com",
                props: { disabled: false, subtitle: "github.com - active" },
            },
        ]);
        expect(select?.props("disabled")).toBe(true);
        expect(
            wrapper.find('[data-test="cirender-account-picker-disabled-reason"]').text(),
        ).toContain("Only one GitHub account is signed in");
        expect(wrapper.find('[data-test="gh-auto-switch-warning"]').exists()).toBe(false);
    });

    it("disables an unhealthy account and puts the reauthentication reason in its accessible item name", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [
                ghAccount({ id: "a1", login: "healthy", active: true }),
                ghAccount({
                    id: "a2",
                    login: "needs-help",
                    healthy: false,
                    stateDetail: "authentication failed",
                }),
            ],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        const unavailable = (select?.props("items") as readonly Record<string, unknown>[]).find(
            (item) => item["value"] === "a2",
        );
        expect(unavailable).toMatchObject({
            title: "needs-help",
            subtitle: "github.com - reauthentication required",
            props: { disabled: true },
        });
        expect(String(unavailable?.["searchText"])).toContain("reauthentication required");
        expect(wrapper.find('[data-test="account-reauthentication"]').text()).toContain(
            "needs reauthentication",
        );
        const recover = wrapper.find('[data-test="account-reauthenticate"]');
        expect(recover.exists()).toBe(true);
        await recover.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("lists every stored account, naming the active one, and defaults the display to it", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        expect(select?.props("items")).toEqual([
            {
                title: "monalisa",
                subtitle: "github.com",
                value: "a2",
                searchText: "monalisa github.com",
                props: { disabled: false, subtitle: "github.com" },
            },
            {
                title: "octocat",
                subtitle: "github.com - active",
                value: "a1",
                searchText: "octocat github.com",
                props: { disabled: false, subtitle: "github.com - active" },
            },
        ]);
        expect(select?.props("modelValue")).toBe("a1");
        expect(select?.props("disabled")).toBe(false);
    });

    it("re-resolves the owner list for the chosen account rather than the active one, and never switches the active account", async () => {
        const { bridge: accountsBridge, calls: accountCalls } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const ownerCalls: (string | undefined)[] = [];
        const wrapper = mountScreen(
            {
                ...fakeBridge(preflight()),
                listCiOwners: (accountId) => {
                    ownerCalls.push(accountId);
                    const login = accountId === "a2" ? "monalisa" : "octocat";
                    return Promise.resolve({ ok: true, login, owners: [{ login, kind: "user" }] });
                },
            },
            { accountsBridge },
        );
        await flushPromises();
        // The displayed active account is also the exact id sent to the broker.
        expect(ownerCalls).toEqual(["a1"]);

        // Selecting from the picker is what a keyboard-driven choice reaches too: Vuetify's
        // VSelect emits this same `update:modelValue` event whether an option is activated
        // by Enter on a focused row or by a click, so this is not a mouse-only path.
        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        expect(ownerCalls.at(-1)).toBe("a2");
        // Never the application-wide active-account switch. A call log holding only "list"
        // proves Settings, downloads, backups and everything else kept reading whichever
        // account was already active - this picker only ever read the list, never wrote it.
        expect(accountCalls).toEqual(["list"]);
    });

    it("clears the owner field and a stale preflight report when a different account is chosen", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const wrapper = mountScreen(fakeBridge(preflight()), { accountsBridge });
        await check(wrapper);
        expect(wrapper.find('[data-test="route"]').exists()).toBe(true);
        expect(wrapper.get('[data-test="cirender-owner-picker-selected"]').text()).toContain(
            "Selected owner: o",
        );

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        expect(wrapper.get('[data-test="cirender-owner-picker-selected"]').text()).toContain(
            "No value selected",
        );
        // Nothing re-checks automatically: "Check before anything is sent" stays the one
        // deliberate action that reads a report, so the stale one is dropped rather than
        // silently re-fetched.
        expect(wrapper.find('[data-test="route"]').exists()).toBe(false);
    });

    it("carries the chosen account id into the preflight check and the real dispatch", async () => {
        const { bridge: accountsBridge } = fakeAccountsBridge(
            [ghAccount({ id: "a1", login: "octocat" }), ghAccount({ id: "a2", login: "monalisa" })],
            "a1",
        );
        const preflightRequests: CiSyncRequest[] = [];
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(
            {
                ...fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started),
                ciRenderPreflight: (request) => {
                    preflightRequests.push(request);
                    return Promise.resolve({
                        ok: true,
                        value: preflight({ uploadNeeded: false, worldChanged: false }),
                    });
                },
            },
            { accountsBridge },
        );
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        await select?.vm.$emit("update:modelValue", "a2");
        await flushPromises();

        await check(wrapper);
        expect(preflightRequests.at(-1)).toMatchObject({ accountId: "a2" });

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        expect(
            JSON.parse(started[0]?.ok === false ? started[0].failure.message : "{}"),
        ).toMatchObject({
            accountId: "a2",
        });
    });

    it("leaves the account id off a request entirely while the picker is untouched", async () => {
        // The exact wire shape a single-account build, or anybody who never opens the
        // picker, has always sent - proven here rather than only asserted from behaviour,
        // because a stray `accountId: undefined` key would still pass a looser check.
        const started: CiSyncResult[] = [];
        const wrapper = mountScreen(
            fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), started),
        );
        await check(wrapper);
        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();
        const request = JSON.parse(
            started[0]?.ok === false ? started[0].failure.message : "{}",
        ) as Record<string, unknown>;
        expect("accountId" in request).toBe(false);
    });

    it("routes the displayed default to github.com when the same login is active on two hosts", async () => {
        const accountsBridge: GhCliBridge = {
            ghCliListAccounts: () =>
                Promise.resolve({
                    availability: "ready",
                    version: "gh version 2.97.0",
                    accounts: [
                        ghAccount({
                            id: "enterprise.example:alice",
                            login: "alice",
                            host: "enterprise.example",
                            active: true,
                        }),
                        ghAccount({
                            id: "github.com:alice",
                            login: "alice",
                            host: "github.com",
                            active: true,
                        }),
                    ],
                    source: "json",
                    capabilities: { structuredStatus: true },
                    message: "ready",
                }),
        };
        const ownerCalls: (string | undefined)[] = [];
        const preflightRequests: CiSyncRequest[] = [];
        const wrapper = mountScreen(
            {
                ...fakeBridge(preflight()),
                listCiOwners: (accountId) => {
                    ownerCalls.push(accountId);
                    return Promise.resolve({
                        ok: true,
                        login: "alice",
                        owners: [{ login: "alice", kind: "user" }],
                    });
                },
                ciRenderPreflight: (request) => {
                    preflightRequests.push(request);
                    return Promise.resolve({ ok: true, value: preflight() });
                },
            },
            { accountsBridge },
        );
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "Render as");
        expect(select?.props("modelValue")).toBe("github.com:alice");
        expect(select?.props("items")).toEqual(
            expect.arrayContaining([
                // One login on two hosts: the host is what tells the rows apart, and it now
                // lives on the second line rather than inside the title.
                expect.objectContaining({
                    title: "alice",
                    subtitle: "enterprise.example - active",
                }),
                expect.objectContaining({ title: "alice", subtitle: "github.com - active" }),
            ]),
        );
        expect(ownerCalls).toEqual(["github.com:alice"]);

        await check(wrapper);
        expect(preflightRequests.at(-1)).toMatchObject({ accountId: "github.com:alice" });
    });
});

describe("an existing repository, offered because this flow never creates one", () => {
    it("offers account recovery when the repository list is refused by the selected credential", async () => {
        const bridge: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listExistingRepositories: () =>
                Promise.resolve({
                    ok: false,
                    needsSignIn: true,
                    message: "release-bot on ghe.example cannot read repositories.",
                }),
        };
        const wrapper = mountScreen(bridge);
        await flushPromises();

        const recover = wrapper.find('[data-test="repositories-reauthenticate"]');
        expect(recover.exists()).toBe(true);
        await recover.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("fills owner and name when one is picked from the account's own repositories", async () => {
        const bridgeWithRepositories: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listExistingRepositories: () =>
                Promise.resolve({
                    ok: true,
                    value: [
                        {
                            owner: "octocat",
                            name: "maps",
                            fullName: "octocat/maps",
                            private: true,
                            canWrite: true,
                            htmlUrl: "https://github.test/octocat/maps",
                        },
                    ],
                }),
        };
        const wrapper = mountScreen(bridgeWithRepositories);
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "One of your repositories");
        expect(select?.props("items")).toEqual([
            {
                title: "maps",
                subtitle: "octocat - private",
                value: "octocat/maps",
                searchText: "octocat/maps octocat maps private",
                props: { subtitle: "octocat - private" },
            },
        ]);

        await select?.vm.$emit("update:modelValue", "octocat/maps");
        await flushPromises();

        expect(wrapper.get('[data-test="cirender-owner-picker-selected"]').text()).toContain(
            "Selected owner: octocat",
        );
        expect(
            (wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value,
        ).toBe("maps");
    });

    /**
     * Selecting from this exact list is what used to break: the app's own picker offered
     * `octocat/maps`, and choosing it fed the same `owner`/`repo` refs the create-path
     * availability check watches, producing a "this name already exists" warning about the
     * repository somebody had just chosen on purpose. `checkCiRepoName` is stubbed to
     * answer "taken" here specifically so a regression - the watch firing again - would be
     * caught rather than passing by accident because nothing was wired to answer it.
     */
    it("selecting an existing repository produces no collision warning and never asks GitHub about it", async () => {
        vi.useFakeTimers();
        try {
            let checkCalls = 0;
            const bridge: CiRenderBridge = {
                ...fakeBridge(preflight()),
                listExistingRepositories: () =>
                    Promise.resolve({
                        ok: true,
                        value: [
                            {
                                owner: "octocat",
                                name: "maps",
                                fullName: "octocat/maps",
                                private: true,
                                canWrite: true,
                                htmlUrl: "https://github.test/octocat/maps",
                            },
                        ],
                    }),
                checkCiRepoName: () => {
                    checkCalls += 1;
                    return Promise.resolve({
                        status: "taken",
                        owner: "octocat",
                        repo: "maps",
                        private: true,
                        htmlUrl: "https://github.test/octocat/maps",
                    });
                },
            };
            const wrapper = mountScreen(bridge);
            await flushPromises();

            const select = wrapper
                .findAllComponents(VSelect)
                .find((component) => component.props("label") === "One of your repositories");
            await select?.vm.$emit("update:modelValue", "octocat/maps");
            await flushPromises();
            await vi.advanceTimersByTimeAsync(600);
            await flushPromises();

            const availability = wrapper.find('[data-test="repo-availability"]');
            expect(availability.exists()).toBe(true);
            expect(availability.text()).not.toContain("already exists");
            expect(availability.text()).toContain("octocat/maps");
            expect(checkCalls).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("resumes the create-path check, and can warn again, once the picked pair is typed over", async () => {
        vi.useFakeTimers();
        try {
            const bridge: CiRenderBridge = {
                ...fakeBridge(preflight()),
                listExistingRepositories: () =>
                    Promise.resolve({
                        ok: true,
                        value: [
                            {
                                owner: "octocat",
                                name: "maps",
                                fullName: "octocat/maps",
                                private: true,
                                canWrite: true,
                                htmlUrl: "https://github.test/octocat/maps",
                            },
                        ],
                    }),
                checkCiRepoName: () =>
                    Promise.resolve({
                        status: "taken",
                        owner: "octocat",
                        repo: "renamed",
                        private: false,
                        htmlUrl: null,
                    }),
            };
            const wrapper = mountScreen(bridge);
            await flushPromises();

            const select = wrapper
                .findAllComponents(VSelect)
                .find((component) => component.props("label") === "One of your repositories");
            await select?.vm.$emit("update:modelValue", "octocat/maps");
            await flushPromises();

            // Typing over the picked name is what turns this back into an ordinary
            // create-path proposal - the stale "picked" state must not survive it.
            await wrapper.find('[data-test="repo-field"] input').setValue("renamed");
            await flushPromises();
            await vi.advanceTimersByTimeAsync(600);
            await flushPromises();

            expect(wrapper.find('[data-test="repo-availability"]').text()).toContain(
                "already exists",
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("leaves the forward path unblocked: Check runs and the render button is not disabled", async () => {
        const bridge: CiRenderBridge = {
            ...fakeBridge(preflight()),
            listExistingRepositories: () =>
                Promise.resolve({
                    ok: true,
                    value: [
                        {
                            owner: "octocat",
                            name: "maps",
                            fullName: "octocat/maps",
                            private: true,
                            canWrite: true,
                            htmlUrl: "https://github.test/octocat/maps",
                        },
                    ],
                }),
        };
        const wrapper = mountScreen(bridge);
        await flushPromises();

        const select = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.props("label") === "One of your repositories");
        await select?.vm.$emit("update:modelValue", "octocat/maps");
        await flushPromises();
        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await flushPromises();

        expect(wrapper.find('[data-test="check-blocked"]').exists()).toBe(false);

        const buttons = wrapper.findAll("button");
        await buttons.find((button) => button.text().includes("Check"))?.trigger("click");
        await flushPromises();

        // The default `preflight()` fixture reports a ready route and an already-uploaded,
        // unchanged world, so nothing besides the two consent boxes stands between here and
        // a startable render - proving the picker's own selection never left a dead end.
        await wrapper.find('[data-test="ack-upload"] input').setValue(true);
        await flushPromises();
        expect(wrapper.find('[data-test="start"]').attributes("disabled")).toBeUndefined();
    });
});

describe("a repository that is not ready says why, without reading as a hard block", () => {
    it("an existing, writable repository with no route yet is 'not set up' without offering a browser route", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: {
                        owner: "o",
                        repo: "r",
                        fullName: "o/r",
                        private: false,
                        canWrite: true,
                        htmlUrl: "https://github.test/o/r",
                        warning: null,
                    },
                    routeReport: routeReport({
                        ready: false,
                        describe:
                            "The selected GitHub CLI account cannot start a render on this repository.",
                    }),
                }),
            ),
        );
        await check(wrapper);

        const panel = wrapper.find('[data-test="needs-setup"]');
        expect(panel.exists()).toBe(true);
        expect(panel.text()).toContain("o/r");
        expect(panel.text()).not.toContain("cannot start a render");
        expect(wrapper.find('[data-test="setup-repository"]').exists()).toBe(false);
        expect(panel.text()).toContain("No browser page was opened");
        expect(wrapper.emitted("open")).toBeUndefined();
    });

    it("a repository that may not exist yet offers to create it, framed as the ordinary next step", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: null,
                    repositoryFailure: "GitHub answered 404.",
                    routeReport: routeReport({
                        ready: false,
                        describe:
                            "The selected GitHub CLI account cannot start a render on this repository.",
                    }),
                }),
            ),
        );
        await check(wrapper);

        const panel = wrapper.find('[data-test="needs-setup"]');
        expect(panel.exists()).toBe(true);
        expect(panel.text()).toContain("not visible to the selected GitHub CLI account");
        expect(panel.text()).toContain("confirmed missing name can be created here");
        expect(panel.text()).toContain("o/r");
    });

    it("creates a missing repository through the CLI bridge and never emits an external URL", async () => {
        let createRequest: unknown = null;
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: null,
                    repositoryFailure: "GitHub answered 404.",
                    routeReport: routeReport({ ready: false }),
                }),
                [],
                {
                    createCiRepository: (request) => {
                        createRequest = request;
                        return Promise.resolve({
                            ok: true,
                            repository: {
                                owner: "o",
                                name: "r",
                                fullName: "o/r",
                                private: true,
                                canWrite: true,
                                htmlUrl: "https://github.test/o/r",
                            },
                        });
                    },
                    bootstrapCiRepository: () =>
                        Promise.resolve({
                            ok: false,
                            failure: {
                                code: "missing-scope",
                                message: "Reauthenticate this GitHub CLI account.",
                                missingScopes: ["workflow"],
                            },
                        }),
                    onCiBootstrapEvent: () => () => undefined,
                },
            ),
        );
        await check(wrapper);

        await wrapper.find('[data-test="bootstrap-repository"]').trigger("click");
        await flushPromises();

        expect(createRequest).toEqual({
            ownerLogin: "o",
            ownerKind: "user",
            name: "r",
            private: true,
        });
        expect(wrapper.emitted("open")).toBeUndefined();
        expect(wrapper.find('[data-test="setup-repository"]').exists()).toBe(false);
    });

    it("offers direct account recovery when repository creation needs reauthentication", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: null,
                    repositoryFailure: "GitHub answered 404.",
                    routeReport: routeReport({ ready: false }),
                }),
                [],
                {
                    createCiRepository: () =>
                        Promise.resolve({
                            ok: false,
                            code: "cli-failed",
                            message: "The selected GitHub CLI account needs reauthentication.",
                            needsSignIn: true,
                        }),
                    bootstrapCiRepository: () =>
                        Promise.resolve({
                            ok: false,
                            failure: {
                                code: "missing-scope",
                                message: "not reached",
                                missingScopes: ["workflow"],
                            },
                        }),
                    onCiBootstrapEvent: () => () => undefined,
                },
            ),
        );
        await check(wrapper);
        await wrapper.find('[data-test="bootstrap-repository"]').trigger("click");
        await flushPromises();

        const recovery = wrapper.get('[data-test="bootstrap-failure"] button');
        expect(recovery.text()).toContain("Open GitHub accounts");
        await recovery.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("a genuine block - this credential cannot write to an existing repository - gets no reassuring setup panel", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: {
                        owner: "o",
                        repo: "r",
                        fullName: "o/r",
                        private: true,
                        canWrite: false,
                        htmlUrl: "https://github.test/o/r",
                        warning: null,
                    },
                    routeReport: routeReport({ ready: false }),
                }),
            ),
        );
        await check(wrapper);

        expect(wrapper.find('[data-test="needs-setup"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="route"]').exists()).toBe(true);
    });

    it("names the render button's exact unmet condition rather than only greying it out", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    repository: null,
                    repositoryFailure: "GitHub answered 404.",
                    routeReport: routeReport({
                        ready: false,
                        describe:
                            "The selected GitHub CLI account cannot start a render on this repository.",
                    }),
                }),
            ),
        );
        await check(wrapper);

        expect(wrapper.find('[data-test="start"]').attributes("disabled")).toBeDefined();
        expect(wrapper.find('[data-test="blocked"]').text()).toContain(
            "selected GitHub CLI account cannot start a render",
        );
    });
});

describe("preparing a repository automatically, rather than sending somebody to GitHub by hand", () => {
    function existingUnpreparedPreflight(): CiPreflight {
        return preflight({
            repository: {
                owner: "o",
                repo: "r",
                fullName: "o/r",
                private: false,
                canWrite: true,
                htmlUrl: "https://github.test/o/r",
                warning: null,
            },
            routeReport: routeReport({
                ready: false,
                describe:
                    "The selected GitHub CLI account cannot start a render on this repository.",
            }),
        });
    }

    it("a build with no bootstrap capability reports the CLI limitation without a browser fallback", async () => {
        const wrapper = mountScreen(fakeBridge(existingUnpreparedPreflight()));
        await check(wrapper);

        expect(wrapper.find('[data-test="bootstrap-repository"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="setup-repository"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="setup-unavailable"]').text()).toContain(
            "No browser page was opened",
        );
        expect(wrapper.emitted("open")).toBeUndefined();
    });

    it("runs the real operation, shows progress, and lands the repository ready to render", async () => {
        let listener: ((event: unknown) => void) | null = null;
        const readyPreflight = preflight({
            repository: existingUnpreparedPreflight().repository,
            routeReport: routeReport({ ready: true }),
        });
        let calls = 0;
        const bridge = fakeBridge(existingUnpreparedPreflight(), [], {
            ciRenderPreflight: () => {
                calls += 1;
                // The check button's own bridge answer, and the one a successful
                // bootstrap re-triggers - the second call reports the repository as
                // ready, exactly as it would be once the workflow actually landed.
                return Promise.resolve({
                    ok: true,
                    value: calls === 1 ? existingUnpreparedPreflight() : readyPreflight,
                });
            },
            bootstrapCiRepository: (owner, repo, _accountId, publishToPages) => {
                expect(owner).toBe("o");
                expect(repo).toBe("r");
                expect(publishToPages).toBe(true);
                listener?.({ type: "phase", phase: "writing-files", at: "now" });
                return Promise.resolve({
                    ok: true,
                    report: {
                        owner: "o",
                        repo: "r",
                        route: "gh",
                        credentialDescribe: "Using the selected GitHub CLI account (octocat).",
                        files: [
                            {
                                path: ".github/workflows/render-world.yml",
                                action: "created",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/render-shard-wave.yml",
                                action: "created",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/scheduled-render.yml",
                                action: "created",
                                reason: null,
                            },
                        ],
                        markerWritten: true,
                        actionsEnabled: true,
                        actionsMessage: "GitHub Actions is enabled for this repository.",
                        ready: true,
                        notes: [],
                    },
                });
            },
            onCiBootstrapEvent: (fn) => {
                listener = fn as (event: unknown) => void;
                return () => {
                    listener = null;
                };
            },
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="publish-pages"] input').setValue(true);
        await wrapper.find('[data-test="bootstrap-repository"]').trigger("click");
        await flushPromises();

        const result = wrapper.find('[data-test="bootstrap-result"]');
        expect(result.exists()).toBe(true);
        expect(result.text()).toContain("render-world.yml");
        expect(result.text()).toContain("GitHub Actions is enabled");
        // The next real decision - starting a render - is reachable: the repository was
        // re-checked and now reports ready, rather than leaving the person to press
        // "Check" again themselves.
        expect(wrapper.find('[data-test="route"]').exists()).toBe(true);
    });

    it("names a missing scope and offers to sign in again, rather than a generic failure", async () => {
        const bridge = fakeBridge(existingUnpreparedPreflight(), [], {
            bootstrapCiRepository: () =>
                Promise.resolve({
                    ok: false,
                    failure: {
                        code: "missing-scope",
                        message: 'The GitHub sign-in is missing the "workflow" permission.',
                        missingScopes: ["workflow"],
                    },
                }),
            onCiBootstrapEvent: () => () => {},
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="bootstrap-repository"]').trigger("click");
        await flushPromises();

        const failure = wrapper.find('[data-test="bootstrap-failure"]');
        expect(failure.text()).toContain("workflow");

        const buttons = failure.findAll("button");
        await buttons[0]?.trigger("click");
        expect(wrapper.emitted("signIn")).toBeTruthy();
    });

    it("Actions disabled is reported as such, never as a green tick", async () => {
        const bridge = fakeBridge(existingUnpreparedPreflight(), [], {
            bootstrapCiRepository: () =>
                Promise.resolve({
                    ok: true,
                    report: {
                        owner: "o",
                        repo: "r",
                        route: "gh",
                        credentialDescribe: "Using the selected GitHub CLI account (octocat).",
                        files: [
                            {
                                path: ".github/workflows/render-world.yml",
                                action: "created",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/render-shard-wave.yml",
                                action: "created",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/scheduled-render.yml",
                                action: "created",
                                reason: null,
                            },
                        ],
                        markerWritten: true,
                        actionsEnabled: false,
                        actionsMessage:
                            "GitHub Actions is turned off for o/r. Turn it on there before a render can run.",
                        ready: false,
                        notes: [],
                    },
                }),
            onCiBootstrapEvent: () => () => {},
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="bootstrap-repository"]').trigger("click");
        await flushPromises();

        const result = wrapper.find('[data-test="bootstrap-result"]');
        expect(result.text()).toContain("turned off");
    });

    it("runs the managed bootstrap immediately before dispatching a render", async () => {
        const started: CiSyncResult[] = [];
        const order: string[] = [];
        const ready = preflight({ uploadNeeded: false, worldChanged: false });
        const bridge = fakeBridge(ready, started, {
            bootstrapCiRepository: () => {
                order.push("bootstrap");
                return Promise.resolve({
                    ok: true,
                    report: {
                        owner: "o",
                        repo: "r",
                        route: "gh",
                        credentialDescribe: "Using the selected GitHub CLI account (octocat).",
                        files: [
                            {
                                path: ".github/workflows/render-world.yml",
                                action: "unchanged",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/render-shard-wave.yml",
                                action: "unchanged",
                                reason: null,
                            },
                            {
                                path: ".github/workflows/scheduled-render.yml",
                                action: "unchanged",
                                reason: null,
                            },
                        ],
                        markerWritten: false,
                        actionsEnabled: true,
                        actionsMessage: "GitHub Actions is enabled for this repository.",
                        ready: true,
                        notes: [],
                    },
                });
            },
            onCiBootstrapEvent: () => () => {},
            startCiRender: () => {
                order.push("dispatch");
                const result: CiSyncResult = {
                    ok: false,
                    syncId: "recorded",
                    failure: {
                        code: "recorded",
                        message: "recorded",
                        detail: null,
                        status: null,
                        needsSignIn: false,
                        needsEula: false,
                        route: null,
                        run: null,
                        failingJob: null,
                        logExcerpt: null,
                    },
                };
                started.push(result);
                return Promise.resolve(result);
            },
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();

        expect(order).toEqual(["bootstrap", "dispatch"]);
        expect(started).toHaveLength(1);
    });

    it("forwards the checked Pages choice into bootstrap and shows GitHub's exact homepage URL as a link", async () => {
        const started: CiSyncResult[] = [];
        let requestedPages: boolean | undefined;
        const url = "https://octocat.github.io/a-map/";
        const bridge = fakeBridge(
            preflight({ uploadNeeded: false, worldChanged: false }),
            started,
            {
                bootstrapCiRepository: (_owner, _repo, _accountId, publishToPages) => {
                    requestedPages = publishToPages;
                    return Promise.resolve({
                        ok: true,
                        report: {
                            owner: "o",
                            repo: "r",
                            route: "gh",
                            credentialDescribe: "Using the selected GitHub CLI account (octocat).",
                            files: [],
                            markerWritten: false,
                            actionsEnabled: true,
                            actionsMessage: "GitHub Actions is enabled for this repository.",
                            pages: {
                                url,
                                buildType: "workflow",
                                created: true,
                                homepageUpdated: true,
                            },
                            ready: true,
                            notes: [],
                        },
                    });
                },
                onCiBootstrapEvent: () => () => {},
            },
        );
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="publish-pages"] input').setValue(true);
        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();

        expect(requestedPages).toBe(true);
        expect(started).toHaveLength(1);
        const ready = wrapper.get('[data-test="pages-homepage-ready"]');
        expect(ready.text()).toContain("configured for workflow publishing");
        expect(ready.text()).toContain("first successful Pages render");
        const link = ready.get("a");
        expect(link.attributes("href")).toBe(url);
        await link.trigger("click");
        expect(wrapper.emitted("open")).toContainEqual([url]);
    });

    it("refuses start re-entry while the pre-dispatch bootstrap is still running", async () => {
        let finishBootstrap!: (result: CiBootstrapResult) => void;
        const pendingBootstrap = new Promise<CiBootstrapResult>((resolve) => {
            finishBootstrap = resolve;
        });
        let bootstrapCalls = 0;
        let dispatchCalls = 0;
        const bridge = fakeBridge(preflight({ uploadNeeded: false, worldChanged: false }), [], {
            bootstrapCiRepository: () => {
                bootstrapCalls += 1;
                return pendingBootstrap;
            },
            onCiBootstrapEvent: () => () => {},
            startCiRender: () => {
                dispatchCalls += 1;
                return Promise.reject(new Error("dispatch should not start in this test"));
            },
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        const button = wrapper.find('[data-test="start"]').element as HTMLButtonElement;
        button.click();
        button.click();
        await flushPromises();

        expect(bootstrapCalls).toBe(1);
        expect(dispatchCalls).toBe(0);
        expect(wrapper.find('[data-test="start"]').attributes("disabled")).toBeDefined();

        finishBootstrap({
            ok: false,
            failure: {
                code: "concurrent-update",
                message: "The branch moved; nothing was changed.",
                missingScopes: null,
            },
        });
        await flushPromises();
    });

    it("shows a typed managed-file conflict and never dispatches past it", async () => {
        const started: CiSyncResult[] = [];
        const bridge = fakeBridge(
            preflight({ uploadNeeded: false, worldChanged: false }),
            started,
            {
                bootstrapCiRepository: () =>
                    Promise.resolve({
                        ok: false,
                        failure: {
                            code: "managed-file-modified",
                            message:
                                ".github/workflows/render-world.yml differs from the SHA-256 recorded when installed.",
                            missingScopes: null,
                        },
                    }),
                onCiBootstrapEvent: () => () => {},
            },
        );
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="start"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="bootstrap-conflict"]').text()).toContain(
            "no repository files were changed",
        );
        expect(wrapper.find('[data-test="bootstrap-failure"]').text()).toContain("SHA-256");
        expect(started).toHaveLength(0);
    });
});

describe("the repository name: suggested once a world is chosen, checked live", () => {
    it("fills the empty repository field with the suggestion", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: (sourceName) =>
                Promise.resolve(sourceName.toLowerCase().replace(/\s+/g, "-")),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        await wrapper.find('[role="option"]').trigger("click");
        await flushPromises();

        expect(
            (wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value,
        ).toBe("my-world");
    });

    it("never overwrites a repository name somebody already typed", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [catalogWorld({ path: "/mc/saves/My World", name: "My World" })],
        });
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: () => Promise.resolve("suggested-name"),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        await wrapper.find('[data-test="repo-field"] input').setValue("already-typed");
        await wrapper.find('[role="option"]').trigger("click");
        await flushPromises();

        expect(
            (wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value,
        ).toBe("already-typed");
    });

    it("applies the suggestion for the world chosen last, not whichever round trip resolves first", async () => {
        const catalogBridge = fakeCatalogBridge([catalogFolder()], {
            f1: [
                catalogWorld({
                    path: "/mc/saves/World A",
                    directoryName: "World A",
                    name: "World A",
                }),
                catalogWorld({
                    path: "/mc/saves/World B",
                    directoryName: "World B",
                    name: "World B",
                }),
            ],
        });

        // World A's suggestion resolves fast (5ms); World B's resolves slow (50ms). A user
        // who chooses A then quickly chooses B - before A's round trip has returned - must
        // end up with B's suggested name, because B is what is actually selected, not A's
        // just because A's round trip happened to land first.
        const bridgeWithSuggest: CiRenderBridge = {
            ...fakeBridge(preflight()),
            suggestCiRepoName: (sourceName) =>
                new Promise<string>((resolve) => {
                    const slug = sourceName.toLowerCase().replace(/\s+/g, "-");
                    setTimeout(() => resolve(slug), sourceName === "World A" ? 5 : 50);
                }),
        };
        const wrapper = mountScreen(bridgeWithSuggest, { catalogBridge });
        await flushPromises();

        const options = wrapper.findAll('[role="option"]');
        expect(options.length).toBeGreaterThanOrEqual(2);

        await options[0]!.trigger("click"); // World A, chosen first
        await options[1]!.trigger("click"); // World B, chosen last

        await new Promise((resolve) => setTimeout(resolve, 80));
        await flushPromises();

        expect(
            (wrapper.find('[data-test="repo-field"] input').element as HTMLInputElement).value,
        ).toBe("world-b");
    });

    it.each([
        [
            "available" as const,
            { status: "available", owner: "o", repo: "r" } as CiRepositoryNameAvailability,
            "free on GitHub",
        ],
        [
            "taken" as const,
            {
                status: "taken",
                owner: "o",
                repo: "r",
                private: false,
                htmlUrl: null,
            } as CiRepositoryNameAvailability,
            "already exists",
        ],
        [
            "unknown" as const,
            {
                status: "unknown",
                owner: "o",
                repo: "r",
                message: "offline",
            } as CiRepositoryNameAvailability,
            "Could not check",
        ],
    ])(
        "says the %s verdict in plain words, after a pause rather than on every keystroke",
        async (_label, answer, expected) => {
            vi.useFakeTimers();
            try {
                const bridgeWithCheck: CiRenderBridge = {
                    ...fakeBridge(preflight()),
                    checkCiRepoName: () => Promise.resolve(answer),
                };
                const wrapper = mountScreen(bridgeWithCheck);

                await selectOwner(wrapper, "o");
                await wrapper.find('[data-test="repo-field"] input').setValue("r");
                // Nothing yet: the check is debounced rather than fired on every keystroke.
                expect(wrapper.find('[data-test="repo-availability"]').exists()).toBe(false);

                await vi.advanceTimersByTimeAsync(600);
                await flushPromises();

                expect(wrapper.find('[data-test="repo-availability"]').text()).toContain(expected);
            } finally {
                vi.useRealTimers();
            }
        },
    );

    it("marks both the checking and the settled availability text as a polite live region", async () => {
        // The paragraph used to carry no ARIA role at all, so "checking...", then "taken" or
        // "free", silently replaced each other on screen with nothing telling a screen
        // reader that had moved on to another field that either had happened. Real timers
        // and a manually-resolved promise, rather than fake timers, because
        // `advanceTimersByTimeAsync` also drains the already-resolved bridge promise in the
        // same tick and there would be no window left in which "checking" is actually on
        // screen to assert against.
        let resolveCheck: (value: CiRepositoryNameAvailability) => void = () => {};
        const bridgeWithCheck: CiRenderBridge = {
            ...fakeBridge(preflight()),
            checkCiRepoName: () =>
                new Promise<CiRepositoryNameAvailability>((resolve) => {
                    resolveCheck = resolve;
                }),
        };
        const wrapper = mountScreen(bridgeWithCheck);

        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");

        // Past the 600ms debounce, so the check has actually started, but the bridge's own
        // promise is still deliberately unresolved.
        await new Promise((resolve) => setTimeout(resolve, 650));
        await flushPromises();

        const checking = wrapper.find('[data-test="repo-availability"]');
        expect(checking.exists()).toBe(true);
        expect(checking.attributes("role")).toBe("status");
        expect(checking.attributes("aria-live")).toBe("polite");

        resolveCheck({ status: "available", owner: "o", repo: "r" });
        await flushPromises();

        const settled = wrapper.find('[data-test="repo-availability"]');
        expect(settled.attributes("role")).toBe("status");
        expect(settled.attributes("aria-live")).toBe("polite");
    });

    it("names the exact GitHub naming rule a typed name breaks", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await wrapper.find('[data-test="repo-field"] input').setValue("bad name");
        await flushPromises();
        expect(wrapper.find('[data-test="repo-field"]').text()).toContain("letters, digits");
    });
});

describe("the Check button names exactly which field is missing or invalid", () => {
    it("blocks on a missing world, then owner, then repository name, one at a time", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("world folder");

        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("repository owner");

        await selectOwner(wrapper, "o");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("repository name");

        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').exists()).toBe(false);
    });

    it("stays blocked on an invalid repository name, even once every field has something in it", async () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("bad name");
        await flushPromises();
        expect(wrapper.find('[data-test="check-blocked"]').text()).toContain("letters, digits");
    });
});

describe("what is already running, elsewhere", () => {
    it("asks what is already in flight before anybody presses anything, and puts it on screen", async () => {
        const activeCiRenders = vi.fn(() => Promise.resolve(["elsewhere"]));
        const wrapper = mountScreen(fakeBridge(preflight(), [], { activeCiRenders }));
        await flushPromises();
        expect(activeCiRenders).toHaveBeenCalled();
        const rows = wrapper.findAll('[data-test="row"]');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.text()).toContain("elsewhere");
    });
});

describe("scheduled re-rendering, on a row that knows its own repository", () => {
    async function rowWithRepository() {
        const { bridge: base, emit } = eventBridge(preflight());
        const bridge: CiRenderBridge = {
            ...base,
            ciRenderScheduleRead: vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    value: {
                        enabled: true,
                        cadence: "daily",
                        lastCheckAt: "2026-08-05T00:00:00Z",
                        lastCheckResult: "unchanged",
                        lastCheckReason: "GitHub reports the same asset digest as last time.",
                        lastRenderAt: null,
                        nextCheckAt: "2026-08-06T00:00:00.000Z",
                        checksPerMonth: 30,
                        costDescription: "Checks about 30 times a month.",
                    },
                } as Answer<CiScheduleStatus>),
            ),
            ciRenderScheduleWrite: vi.fn(() =>
                Promise.resolve({ ok: true, value: { ok: true } } as Answer<CiScheduleWriteResult>),
            ),
        };
        const wrapper = mountScreen(bridge);
        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        await flushPromises();
        return { wrapper, bridge };
    }

    it("does not offer the section at all without both bridge methods", async () => {
        const { bridge, emit } = eventBridge(preflight());
        const wrapper = mountScreen(bridge);
        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        await flushPromises();
        expect(wrapper.find('[data-test="schedule"]').exists()).toBe(false);
    });

    it("reads the status only once the section is opened, not eagerly on mount", async () => {
        const { wrapper, bridge } = await rowWithRepository();
        expect(bridge.ciRenderScheduleRead).not.toHaveBeenCalled();

        await wrapper.find('[data-test="schedule-toggle"]').trigger("click");
        await flushPromises();
        expect(bridge.ciRenderScheduleRead).toHaveBeenCalledWith("o", "r", undefined);
        expect(wrapper.find('[data-test="schedule-enable"]').exists()).toBe(true);
        expect(wrapper.text()).toContain("2026-08-05T00:00:00Z");
        expect(wrapper.text()).toContain("2026-08-06T00:00:00.000Z");
    });

    it("closes again on a second click, the same accordion toggle every other row has", async () => {
        const { wrapper } = await rowWithRepository();
        const toggle = wrapper.find('[data-test="schedule-toggle"]');
        await toggle.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="schedule-enable"]').exists()).toBe(true);

        await toggle.trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="schedule-enable"]').exists()).toBe(false);
    });

    it("shows the last check's reason and result text, never fabricated", async () => {
        const { wrapper } = await rowWithRepository();
        await wrapper.find('[data-test="schedule-toggle"]').trigger("click");
        await flushPromises();
        expect(wrapper.find('[data-test="schedule-reason"]').text()).toContain(
            "GitHub reports the same asset digest as last time.",
        );
        expect(wrapper.find('[data-test="schedule-lastCheck"]').text()).toContain("not changed");
    });

    it("offers a bounded custom interval and writes its canonical whole-hour value", async () => {
        const { wrapper, bridge } = await rowWithRepository();
        await wrapper.find('[data-test="schedule-toggle"]').trigger("click");
        await flushPromises();

        const cadence = wrapper
            .findAllComponents(VSelect)
            .find((component) => component.attributes("data-test") === "schedule-cadence");
        expect(cadence).toBeDefined();
        cadence?.vm.$emit("update:modelValue", "custom");
        await flushPromises();

        const custom = wrapper.find('[data-test="schedule-custom-hours"] input');
        expect(custom.exists()).toBe(true);
        await custom.setValue("37");
        await custom.trigger("change");
        await flushPromises();

        expect(bridge.ciRenderScheduleWrite).toHaveBeenCalledWith("s", true, "hours:37", undefined);
    });

    it("surfaces a write refusal - a world that was never uploaded - without pretending it saved", async () => {
        const { bridge: base, emit } = eventBridge(preflight());
        const bridge: CiRenderBridge = {
            ...base,
            ciRenderScheduleRead: () =>
                Promise.resolve({
                    ok: true,
                    value: {
                        enabled: false,
                        cadence: null,
                        lastCheckAt: null,
                        lastCheckResult: null,
                        lastCheckReason: null,
                        lastRenderAt: null,
                        nextCheckAt: null,
                        checksPerMonth: null,
                        costDescription: null,
                    },
                }),
            ciRenderScheduleWrite: () =>
                Promise.resolve({
                    ok: true,
                    value: {
                        ok: false,
                        failure: {
                            code: "not-uploaded-yet",
                            message: "This world has never been synced to GitHub.",
                        },
                    },
                }),
        };
        const wrapper = mountScreen(bridge);
        emit({
            type: "started",
            syncId: "s",
            repository: "o/r",
            mapId: "world",
            worldFolder: "/w",
            at: "2026-08-04T10:00:00Z",
        });
        await flushPromises();

        await wrapper.find('[data-test="schedule-toggle"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="schedule-enable"] input').setValue(true);
        await flushPromises();

        expect(wrapper.find('[data-test="schedule-failure"]').text()).toContain(
            "This world has never been synced to GitHub.",
        );
    });
});

describe("a render row's title, which turns its <v-card-title> into a flex row", () => {
    /**
     * `owner/repo` is typed by whoever set this render up - GitHub alone allows a
     * 39-character owner plus a 100-character repo name, before bilingual mode doubles it
     * again. The row title is a `VCardTitle` turned into a flex row (`d-flex`) so the state
     * chip and spinner sit beside it; Vuetify's own `.v-card-title` rule still contributes
     * `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` underneath that, and
     * `text-overflow` has no effect once the box is a flex formatting context, so the title
     * and the chip were clipped at the card edge with no ellipsis and nothing to say that
     * anything was missing.
     *
     * The assertion reads the shipped rule out of the component source. This workspace's
     * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a
     * mounted component and a real cascade is not observable from a test here at all;
     * `PagesScreen.test.ts` and the components fixed alongside it check their own CSS fixes
     * the same way.
     */
    it("clears the inherited overflow, text-overflow and white-space so the title can wrap", () => {
        const rule = /\.ci-row__title\s*\{[^}]*\}/s.exec(ciRenderScreenSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("text-overflow: clip");
        expect(rule).toContain("white-space: normal");
    });

    it("wraps, so the state chip drops to its own line instead of past the edge", () => {
        // Turning off the clip above is what makes an unwrapped overflow visible rather
        // than hidden; the wrap is what keeps it from happening.
        const rule = /\.ci-row__title\s*\{[^}]*\}/s.exec(ciRenderScreenSource)?.[0] ?? "";
        expect(rule).toContain("flex-wrap: wrap");
    });

    it("lets the unbroken owner/repo string itself break, and wires both classes up", () => {
        // `white-space: normal` alone cannot wrap `owner/repo` - the string has no spaces
        // to break on - so the name span needs `overflow-wrap: anywhere` and a `min-width`
        // that lets a flex item shrink below its content size.
        const nameRule = /\.ci-row__name\s*\{[^}]*\}/s.exec(ciRenderScreenSource)?.[0] ?? "";
        expect(nameRule).toContain("min-width: 0");
        expect(nameRule).toContain("overflow-wrap: anywhere");

        // The template actually wires the classes onto the title and the span, not just the
        // stylesheet declaring them in isolation.
        expect(ciRenderScreenSource).toMatch(
            /VCardTitle class="d-flex align-center ga-2 ci-row__title"/,
        );
        expect(ciRenderScreenSource).toMatch(
            /<span class="ci-row__name">\{\{ row\.repository \|\| row\.syncId \}\}<\/span>/,
        );
    });
});

/* -------------------------------------------------------------------------- */
/* A world with no project file gets a button, not a paragraph                */
/* -------------------------------------------------------------------------- */

describe("a world nobody has set up yet", () => {
    /** A preflight refusing for the one reason this screen can actually fix. */
    function noProject(): CiPreflight {
        return preflight({
            plan: null,
            planFailure:
                "There is no worldlens.project.json or material-bluemap.project.json at the root of /world, " +
                "so this world has no maps set up yet.",
            planFailureCode: "no-project",
        });
    }

    it("offers to write the defaults rather than only naming the missing file", async () => {
        const wrapper = mountScreen(
            fakeBridge(noProject(), [], {
                createCiCloudConfig: async () => ({
                    ok: true,
                    // The written file, one level down. The screen reads its path to say what
                    // it wrote, so a double without it sends that path read into the catch.
                    saved: { saved: { path: "C:/worlds/overworld.worldlens.json" } },
                    preflight: null,
                    preflightFailure: null,
                }),
            }),
        );
        await check(wrapper);

        expect(wrapper.find('[data-test="default-project"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="default-project-create"]').exists()).toBe(true);
    });

    it("stays out of the way when the refusal is a different one entirely", async () => {
        const wrapper = mountScreen(
            fakeBridge(
                preflight({
                    plan: null,
                    planFailure: "That project has no map called nether.",
                    planFailureCode: "no-such-map",
                }),
            ),
        );
        await check(wrapper);

        // A button offering to write default maps would be the wrong remedy for a project
        // that already exists and simply does not hold the map that was asked for.
        expect(wrapper.find('[data-test="default-project"]').exists()).toBe(false);
    });

    it("sends canonical cloud values with the preserved preflight request", async () => {
        const requests: unknown[] = [];
        const bridge = fakeBridge(noProject(), [], {
            createCiCloudConfig: async (request) => {
                requests.push(request);
                return {
                    ok: true,
                    saved: { saved: { path: "C:/worlds/overworld.worldlens.json" } },
                    preflight: null,
                    preflightFailure: null,
                };
            },
        });
        const wrapper = mountScreen(bridge);
        await check(wrapper);

        await wrapper.find('[data-test="default-project-create"]').trigger("click");
        await flushPromises();

        const wizard = wrapper.findComponent(CloudRenderConfigWizard);
        expect(wizard.exists()).toBe(true);
        for (let index = 0; index < 3; index += 1) {
            const next = wizard.findAll("button").find((button) => button.text().includes("Next"));
            expect(next?.exists()).toBe(true);
            await next!.trigger("click");
            await flushPromises();
        }
        const save = wizard.findAll("button").find((button) => button.text().includes("Write and return"));
        expect(save?.exists()).toBe(true);
        await save!.trigger("click");
        await flushPromises();

        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            request: { worldFolder: "/world", owner: "o", repo: "r" },
            config: {
                projectName: "world",
                mapId: "overworld",
                dimension: "minecraft:overworld",
                enabledMapIds: ["overworld", "nether", "end"],
                dataFolder: "data",
                webroot: "web",
                threads: null,
                force: false,
                fixEdges: false,
                metrics: false,
            },
        });
        expect((requests[0] as { operationId: unknown }).operationId).toEqual(expect.any(String));
        expect(wrapper.find('[data-test="default-project-written"]').text()).toContain("local history");
    });

    it("reports a refused cloud-config result instead of claiming the world is now set up", async () => {
        const wrapper = mountScreen(
            fakeBridge(noProject(), [], {
                createCiCloudConfig: async () => ({
                    ok: false,
                    failure: { code: "write-failed", message: "The world folder is read-only." },
                }),
            }),
        );
        await check(wrapper);

        await wrapper.find('[data-test="default-project-create"]').trigger("click");
        await flushPromises();

        const wizard = wrapper.findComponent(CloudRenderConfigWizard);
        for (let index = 0; index < 3; index += 1) {
            const next = wizard.findAll("button").find((button) => button.text().includes("Next"));
            await next!.trigger("click");
            await flushPromises();
        }
        const save = wizard.findAll("button").find((button) => button.text().includes("Write and return"));
        await save!.trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="default-project-failure"]').text()).toContain("read-only");
        expect(wrapper.find('[data-test="default-project-written"]').exists()).toBe(false);
    });

    it("cancels an in-flight cloud-config operation with the same operation id", async () => {
        let operationId: string | null = null;
         let resolveCreate: ((result: { ok: false; failure: { code: string; message: string } }) => void) | undefined;
        const cancelled: string[] = [];
        const wrapper = mountScreen(
            fakeBridge(noProject(), [], {
                createCiCloudConfig: async (request) => {
                    operationId = request.operationId;
                     return await new Promise<{ ok: false; failure: { code: string; message: string } }>((resolve) => {
                        resolveCreate = resolve;
                    });
                },
                cancelCiCloudConfig: async (id) => {
                    cancelled.push(id);
                    return true;
                },
            }),
        );
        await check(wrapper);
        await wrapper.find('[data-test="default-project-create"]').trigger("click");
        await flushPromises();
        const wizard = wrapper.findComponent(CloudRenderConfigWizard);
        for (let index = 0; index < 3; index += 1) {
            const next = wizard.findAll("button").find((button) => button.text().includes("Next"));
            await next!.trigger("click");
            await flushPromises();
        }
        const save = wizard.findAll("button").find((button) => button.text().includes("Write and return"));
        await save!.trigger("click");
        await flushPromises();
        expect(operationId).toEqual(expect.any(String));

        const cancel = wizard.findAll("button").find((button) => button.text() === "Cancel");
        await cancel!.trigger("click");
        expect(cancelled).toEqual([operationId]);
        resolveCreate?.({ ok: false, failure: { code: "cancelled", message: "cancelled" } });
        await flushPromises();
    });

    it("says why the button is dead on a build with no project layer at all", async () => {
        const wrapper = mountScreen(fakeBridge(noProject()));
        await check(wrapper);

        expect(
            wrapper.find('[data-test="default-project-create"]').attributes("disabled"),
        ).toBeDefined();
        expect(wrapper.find('[data-test="default-project-unavailable"]').text()).toContain(
            "desktop bridge",
        );
    });
});

describe("fetching a render made elsewhere", () => {
    function attachableRun(overrides: Partial<CiAttachableRun> = {}): CiAttachableRun {
        return {
            id: 42,
            runNumber: 3,
            htmlUrl: "https://github.test/runs/42",
            conclusion: "success",
            createdAt: "2026-08-04T10:00:00Z",
            headSha: "abc123",
            displayTitle: "Render world (minecraft:overworld)",
            mapId: "world",
            ...overrides,
        };
    }

    it("offers no such section on a build missing either bridge method", () => {
        const wrapper = mountScreen(fakeBridge(preflight()));
        expect(wrapper.find('[data-test="attach-card"]').exists()).toBe(false);
    });

    it("lists a repository's completed runs and lets one be fetched", async () => {
        const listCalls: { owner: string; repo: string }[] = [];
        const attachCalls: unknown[] = [];
        const wrapper = mountScreen(
            fakeBridge(preflight(), [], {
                listAttachableCiRuns: (request) => {
                    listCalls.push({ owner: request.owner, repo: request.repo });
                    return Promise.resolve({ ok: true, value: [attachableRun()] });
                },
                attachCiRun: (request) => {
                    attachCalls.push(request);
                    return Promise.resolve({
                        ok: true,
                        syncId: "s",
                        outcome: "rendered",
                        summary: {
                            syncId: "s",
                            repository: "o/r",
                            releaseTag: null,
                            assetName: null,
                            runId: 42,
                            runUrl: "https://github.test/runs/42",
                            renderId: "ci-s",
                            dataRoot: "/data",
                            mapId: "world",
                            mapName: "World",
                            route: "gh",
                            uploaded: false,
                            artifactBytes: 10,
                            artifactSha256: "a".repeat(64),
                            verified: true,
                        },
                        durationMs: 10,
                    });
                },
            }),
        );

        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();

        expect(wrapper.find('[data-test="attach-card"]').exists()).toBe(true);

        const listButton = wrapper.find('[data-test="attach-list"]');
        await listButton.trigger("click");
        await flushPromises();

        expect(listCalls).toEqual([{ owner: "o", repo: "r" }]);
        expect(wrapper.find('[data-test="attach-run"]').text()).toContain("world");

        await wrapper.find('[data-test="attach-run-select"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="attach-run-fetch"]').trigger("click");
        await flushPromises();

        expect(attachCalls).toEqual([
            expect.objectContaining({ owner: "o", repo: "r", runId: 42, worldFolder: "/world" }),
        ]);
    });

    /*
     * `attach` reads the run's own title before this project's map - a render made
     * elsewhere is a render of its own world, and forcing it under whichever map this
     * project happens to have is exactly the bug that shipped. The card has to show
     * which map it is actually about to register under before the person clicks fetch,
     * and let them override it when the run's own title is missing or wrong.
     */
    it("shows the map id it will register, prefilled from the run's own title", async () => {
        const attachCalls: unknown[] = [];
        const wrapper = mountScreen(
            fakeBridge(preflight(), [], {
                listAttachableCiRuns: () =>
                    Promise.resolve({
                        ok: true,
                        value: [attachableRun({ id: 77, mapId: "fixture_10gb" })],
                    }),
                attachCiRun: (request) => {
                    attachCalls.push(request);
                    return Promise.resolve({
                        ok: false,
                        syncId: "nowhere",
                        failure: {
                            code: "invalid-run",
                            message: "not used",
                            detail: null,
                            status: null,
                            needsSignIn: false,
                            needsEula: false,
                            route: null,
                            run: null,
                            failingJob: null,
                            logExcerpt: null,
                        },
                    });
                },
            }),
        );

        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();
        await wrapper.find('[data-test="attach-list"]').trigger("click");
        await flushPromises();
        await wrapper.find('[data-test="attach-run-select"]').trigger("click");
        await flushPromises();

        // Selecting the run prefills the card with exactly the map id it parsed - never
        // this project's own map, which the local project here calls "world".
        const mapIdField = wrapper.find('[data-test="attach-map-id-field"] input');
        expect((mapIdField.element as HTMLInputElement).value).toBe("fixture_10gb");

        // A person can override the guess before fetching.
        await mapIdField.setValue("fixture_10gb_corrected");
        await wrapper.find('[data-test="attach-run-fetch"]').trigger("click");
        await flushPromises();

        expect(attachCalls).toEqual([
            expect.objectContaining({
                owner: "o",
                repo: "r",
                runId: 77,
                mapId: "fixture_10gb_corrected",
            }),
        ]);
    });

    it("shows an honest empty state when the repository has no completed runs", async () => {
        const wrapper = mountScreen(
            fakeBridge(preflight(), [], {
                listAttachableCiRuns: () => Promise.resolve({ ok: true, value: [] }),
                attachCiRun: () =>
                    Promise.resolve({
                        ok: false,
                        syncId: "nowhere",
                        failure: {
                            code: "invalid-run",
                            message: "not used",
                            detail: null,
                            status: null,
                            needsSignIn: false,
                            needsEula: false,
                            route: null,
                            run: null,
                            failingJob: null,
                            logExcerpt: null,
                        },
                    }),
            }),
        );
        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();

        await wrapper.find('[data-test="attach-list"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="attach-run"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="attach-empty"]').exists()).toBe(true);
    });

    it("reports a refusal from the selected credential rather than an empty list", async () => {
        const wrapper = mountScreen(
            fakeBridge(preflight(), [], {
                listAttachableCiRuns: () =>
                    Promise.resolve({
                        ok: false,
                        message: "The selected GitHub CLI account cannot use the render workflow.",
                    }),
                attachCiRun: () =>
                    Promise.resolve({
                        ok: false,
                        syncId: "nowhere",
                        failure: {
                            code: "invalid-run",
                            message: "not used",
                            detail: null,
                            status: null,
                            needsSignIn: false,
                            needsEula: false,
                            route: null,
                            run: null,
                            failingJob: null,
                            logExcerpt: null,
                        },
                    }),
            }),
        );
        await wrapper.find('[data-test="world-field"] input').setValue("/world");
        await selectOwner(wrapper, "o");
        await wrapper.find('[data-test="repo-field"] input').setValue("r");
        await flushPromises();

        await wrapper.find('[data-test="attach-list"]').trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="attach-failure"]').text()).toContain(
            "cannot use the render workflow",
        );
    });
});
