/**
 * The five catalogues, and every one of the eighty-four features underneath them.
 *
 * `catalogues.test.ts` asserts that count against `ALL_CATALOGUE_FEATURES.length`, so the test is
 * the authority and these prose mentions are a restatement of it. They said eighty-five for a
 * while after a row was removed, which is the failure mode of writing a number in three places.
 *
 * This is the approved information architecture as typed data. Home renders five cards from it,
 * each catalogue page renders its own grouped list from it, Home's search indexes it, and the
 * command palette offers the same rows - four surfaces, one list, so a feature cannot exist on
 * one of them and be missing from another.
 *
 * ### What is in here and what is deliberately not
 *
 * **In:** the stable key, the icon, the group heading, the copy keys with their English
 * fallbacks, and the target. All of it static, all of it safe to evaluate at module load.
 *
 * **Not in:** anything live. The prototype's rows read `default · 107 settings`, `1 running`,
 * `0.14.3 ready` and `6 unread`, and every one of those is an illustration of what the row looks
 * like with something in it rather than a fact about this build. A row that wants a meta names a
 * resolver in `catalogueMeta.ts`, which reads the real store and returns nothing when there is
 * nothing honest to say. The two counts the prototype disagreed with itself about - `107 config
 * keys` in its parser output and `154 options` on its own label - are not encoded here at all;
 * the options row's meta comes from the live schema descriptors.
 *
 * **Also not in:** any resolved string. Copy is a key plus an English fallback, resolved through
 * `t()` at render time, because the language mode and both funny-level sliders move the whole
 * application's copy without anything being told to re-render. A manifest that called `t()` once
 * at import would freeze at whatever the locale happened to be when the bundle first evaluated.
 *
 * ### Keys are not targets
 *
 * Eight rows open `renders`, six open `projects`, and eleven open the settings drawer at
 * different sections. Keying by destination would collapse eighty-four rows to about a dozen, so
 * every row carries its own globally unique `key` and the destination is a separate field.
 * `catalogues.test.ts` asserts uniqueness, because a duplicate key silently drops a row from a
 * `v-for` rather than failing loudly.
 *
 * ### Capability gates, not decorative cards
 *
 * Seven of the Set up & help rows describe cross-application surfaces whose only implementation
 * is a private contract that is not in this public checkout. They keep their catalogue
 * definition - the accounting is part of the approved design - and resolve through a capability
 * gate, so they are absent rather than drawn as a card with invented status values. A status
 * card with demo values is still a fake integration.
 */

import {
    mdiAccountCircleOutline,
    mdiBellOutline,
    mdiBookOpenPageVariantOutline,
    mdiCalendarClock,
    mdiCheckDecagramOutline,
    mdiCloudOutline,
    mdiCloudUploadOutline,
    mdiCogOutline,
    mdiCompassOutline,
    mdiConsoleLine,
    mdiCubeOutline,
    mdiDocker,
    mdiDockLeft,
    mdiDownloadOutline,
    mdiEarth,
    mdiEye,
    mdiEyeOutline,
    mdiFileCogOutline,
    mdiFileDocumentOutline,
    mdiFileTreeOutline,
    mdiFolderMultipleOutline,
    mdiFolderSearchOutline,
    mdiFormatListBulleted,
    mdiGithub,
    mdiHistory,
    mdiHumanGreeting,
    mdiImageOutline,
    mdiKeyOutline,
    mdiLanConnect,
    mdiLanguageJava,
    mdiLifebuoy,
    mdiLockOutline,
    mdiMagnify,
    mdiMapMarkerMultipleOutline,
    mdiMapOutline,
    mdiMapPlus,
    mdiMapSearchOutline,
    mdiMemory,
    mdiMonitorDashboard,
    mdiPackageVariantClosed,
    mdiPaletteOutline,
    mdiProgressClock,
    mdiPulse,
    mdiRegex,
    mdiRenameBox,
    mdiRestart,
    mdiScaleBalance,
    mdiServerNetwork,
    mdiShieldLockOutline,
    mdiSourceRepository,
    mdiSpeedometer,
    mdiSwapHorizontal,
    mdiTabUnselected,
    mdiThemeLightDark,
    mdiTimerOutline,
    mdiTranslate,
    mdiTuneVariant,
    mdiUpdate,
    mdiVectorSquare,
    mdiVolumeHigh,
    mdiWeb,
    mdiWrenchOutline,
} from "@mdi/js";
import type { CatalogueDefinition, CatalogueFeatureDefinition } from "./featureTargets.js";

/* -------------------------------------------------------------------------- */
/* Group headings                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The headings a catalogue page renders its rows under.
 *
 * Declared once and referenced by every row that belongs to them, rather than repeated as a
 * string on each row: two rows spelling the same heading differently would render two headings
 * that look identical and sort apart, which is exactly the kind of defect a reader blames on the
 * layout rather than on the data.
 */
const GROUPS = {
    findingAWorld: {
        key: "catalogue.group.findingAWorld",
        fallback: "Finding a world",
    },
    settingUpARender: {
        key: "catalogue.group.settingUpARender",
        fallback: "Setting up a render",
    },
    whereItRuns: { key: "catalogue.group.whereItRuns", fallback: "Where it runs" },
    whileItRuns: { key: "catalogue.group.whileItRuns", fallback: "While it runs" },
    whatItNeeds: { key: "catalogue.group.whatItNeeds", fallback: "What it needs" },
    theList: { key: "catalogue.group.theList", fallback: "The list" },
    theViewer: { key: "catalogue.group.theViewer", fallback: "The viewer" },
    publishing: { key: "catalogue.group.publishing", fallback: "Publishing" },
    withoutPublishing: {
        key: "catalogue.group.withoutPublishing",
        fallback: "Without publishing",
    },
    sendingACopyOut: {
        key: "catalogue.group.sendingACopyOut",
        fallback: "Sending a copy out",
    },
    bringingACopyIn: {
        key: "catalogue.group.bringingACopyIn",
        fallback: "Bringing a copy in",
    },
    historyKeptHere: { key: "catalogue.group.historyKeptHere", fallback: "History kept here" },
    configuration: { key: "catalogue.group.configuration", fallback: "Configuration" },
    howTheInterfaceBehaves: {
        key: "catalogue.group.howTheInterfaceBehaves",
        fallback: "How the interface behaves",
    },
    language: { key: "catalogue.group.language", fallback: "Language" },
    sharedAcrossTheseApps: {
        key: "catalogue.group.sharedAcrossTheseApps",
        fallback: "Shared across these apps",
    },
    keepingTheAppHealthy: {
        key: "catalogue.group.keepingTheAppHealthy",
        fallback: "Keeping the app healthy",
    },
    readingAboutIt: { key: "catalogue.group.readingAboutIt", fallback: "Reading about it" },
    theServerList: { key: "catalogue.group.theServerList", fallback: "The server list" },
    whileTheServerRuns: {
        key: "catalogue.group.whileTheServerRuns",
        fallback: "While the server runs",
    },
} as const satisfies Record<string, { key: string; fallback: string }>;

type GroupName = keyof typeof GROUPS;

/**
 * Builds one row, so eighty-four literals do not each repeat the group-key plumbing.
 *
 * Deliberately not a class or a fluent builder: the manifest reads best as data, and this is the
 * smallest thing that removes the repetition without hiding what a row actually contains.
 */
function feature(
    group: GroupName,
    definition: Omit<CatalogueFeatureDefinition, "groupKey" | "groupFallback">,
): CatalogueFeatureDefinition {
    return {
        ...definition,
        groupKey: GROUPS[group].key,
        groupFallback: GROUPS[group].fallback,
    };
}

/* -------------------------------------------------------------------------- */
/* 1. Make a map (28)                                                         */
/* -------------------------------------------------------------------------- */

const MAKE_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("findingAWorld", {
        key: "make.finding-a-world.the-project-editor",
        icon: mdiFolderMultipleOutline,
        nameKey: "catalogue.make.projectEditor.name",
        nameFallback: "The project editor",
        blurbKey: "catalogue.make.projectEditor.blurb",
        blurbFallback:
            "Where a map is made and everything about it is set, opening on BlueMap's own generated defaults so every setting is editable from the first second.",
        target: { kind: "job", jobId: "projects", reveal: "chooser" },
        metaResolver: "project.settingCount",
    }),
    feature("findingAWorld", {
        key: "make.finding-a-world.the-guide",
        icon: mdiHumanGreeting,
        nameKey: "catalogue.make.guide.name",
        nameFallback: "The guide",
        blurbKey: "catalogue.make.guide.blurb",
        blurbFallback:
            "The five-question version of the same thing for a first map, writing a project that is then edited in the project editor like any other.",
        target: { kind: "job", jobId: "world", reveal: "step-1" },
        metaResolver: "wizard.stepCount",
    }),
    feature("findingAWorld", {
        key: "make.finding-a-world.project-world-discovery",
        icon: mdiFolderSearchOutline,
        nameKey: "catalogue.make.worldDiscovery.name",
        nameFallback: "Project world discovery",
        blurbKey: "catalogue.make.worldDiscovery.blurb",
        blurbFallback:
            "Finds worlds automatically in the default Minecraft folder and in any launcher root you mount, including every instance inside one.",
        target: { kind: "job", jobId: "projects", reveal: "world-discovery" },
        metaResolver: "world.folderCount",
    }),
    feature("findingAWorld", {
        key: "make.finding-a-world.dimension-detection",
        icon: mdiEarth,
        nameKey: "catalogue.make.dimensionDetection.name",
        nameFallback: "Dimension detection",
        blurbKey: "catalogue.make.dimensionDetection.blurb",
        blurbFallback:
            "The dimensions offered come from the world itself and its region counts, rather than from a list of vanilla defaults.",
        target: { kind: "job", jobId: "world", reveal: "world-selection" },
    }),
    feature("findingAWorld", {
        key: "make.finding-a-world.legacy-1-12-2-worlds",
        icon: mdiHistory,
        nameKey: "catalogue.make.legacyWorlds.name",
        nameFallback: "Legacy 1.12.2 worlds",
        blurbKey: "catalogue.make.legacyWorlds.blurb",
        blurbFallback:
            "Worlds as old as 1.12.2 are read through their own chunk decoder and their legacy resource jar.",
        target: { kind: "job", jobId: "world", reveal: "world-selection" },
    }),
    feature("findingAWorld", {
        key: "make.finding-a-world.bedrock-worlds",
        icon: mdiCubeOutline,
        nameKey: "catalogue.make.bedrockWorlds.name",
        nameFallback: "Bedrock worlds",
        blurbKey: "catalogue.make.bedrockWorlds.blurb",
        blurbFallback:
            "Bedrock saves are read as well as Java ones, through the LevelDB container rather than region files.",
        target: { kind: "job", jobId: "world", reveal: "world-selection" },
    }),

    feature("settingUpARender", {
        key: "make.setting-up-a-render.projects-on-this-machine",
        icon: mdiFolderMultipleOutline,
        nameKey: "catalogue.make.projectsHere.name",
        nameFallback: "Projects on this machine",
        blurbKey: "catalogue.make.projectsHere.blurb",
        blurbFallback:
            "A project is one file at the root of a world, holding every map, storage and setting that world renders with.",
        target: { kind: "job", jobId: "projects", reveal: "chooser.projects" },
        metaResolver: "project.count",
    }),
    feature("settingUpARender", {
        key: "make.setting-up-a-render.render-mask-drawing",
        icon: mdiVectorSquare,
        nameKey: "catalogue.make.renderMask.name",
        nameFallback: "Render mask drawing",
        blurbKey: "catalogue.make.renderMask.blurb",
        blurbFallback:
            "Draws every BlueMap mask shape over measured region bounds and the real overworld spawn, with identical local, CLI and Actions semantics.",
        target: { kind: "job", jobId: "projects", reveal: "map.render-mask" },
        metaResolver: "mask.shapeCount",
    }),
    feature("settingUpARender", {
        key: "make.setting-up-a-render.live-render-speed",
        icon: mdiSpeedometer,
        nameKey: "catalogue.make.renderSpeed.name",
        nameFallback: "Live render speed",
        blurbKey: "catalogue.make.renderSpeed.blurb",
        blurbFallback:
            "One dial for how hard the engine leans on this machine, over several raw settings at once, changeable while a render is running.",
        target: { kind: "job", jobId: "world", reveal: "render-speed" },
        metaResolver: "speed.levelCount",
    }),
    feature("settingUpARender", {
        key: "make.setting-up-a-render.the-path-field",
        icon: mdiFolderSearchOutline,
        nameKey: "catalogue.make.pathField.name",
        nameFallback: "The path field",
        blurbKey: "catalogue.make.pathField.blurb",
        blurbFallback:
            "Every folder field checks what you gave it as you type, says what it found, and never silently accepts a path that is not there.",
        // "path-field" named nothing routable: the options editor's screens are the `ScreenId`
        // union plus "history", and a reveal outside it silently resolves to Core anyway. Core
        // is where the folder fields this row describes actually live, so the row now asks for
        // the screen it means instead of relying on the fallback that hid the mistake.
        target: { kind: "overlay", overlay: "config", reveal: "core" },
    }),
    feature("settingUpARender", {
        key: "make.setting-up-a-render.scheduled-render",
        icon: mdiCalendarClock,
        nameKey: "catalogue.make.scheduledRender.name",
        nameFallback: "Scheduled render",
        blurbKey: "catalogue.make.scheduledRender.blurb",
        blurbFallback: "Runs a project again on a timetable, by date, time, weekday and timezone.",
        target: { kind: "job", jobId: "projects", reveal: "render-schedule" },
    }),

    feature("whereItRuns", {
        key: "make.where-it-runs.docker-or-this-machine",
        icon: mdiDocker,
        nameKey: "catalogue.make.dockerOrLocal.name",
        nameFallback: "Docker or this machine",
        blurbKey: "catalogue.make.dockerOrLocal.blurb",
        blurbFallback:
            "One render plan that resolves to a container or to the local runtime, with the same semantics either way.",
        target: { kind: "job", jobId: "renders", reveal: "runtime.local-container" },
    }),
    feature("whereItRuns", {
        key: "make.where-it-runs.remote-rendering-over-ssh",
        icon: mdiLanConnect,
        nameKey: "catalogue.make.remoteSsh.name",
        nameFallback: "Remote rendering over SSH",
        blurbKey: "catalogue.make.remoteSsh.blurb",
        blurbFallback:
            "Runs the render on another machine, with host-key handling and a preflight that fails before anything is copied.",
        target: { kind: "job", jobId: "renders", reveal: "runtime.ssh" },
    }),
    feature("whereItRuns", {
        key: "make.where-it-runs.rendering-in-github-actions",
        icon: mdiGithub,
        nameKey: "catalogue.make.githubActions.name",
        nameFallback: "Rendering in GitHub Actions",
        blurbKey: "catalogue.make.githubActions.blurb",
        blurbFallback:
            "Hands the whole render to hosted runners, sharded and resumable, then downloads and registers the result here.",
        target: { kind: "job", jobId: "cirender", reveal: "actions" },
    }),
    feature("whereItRuns", {
        key: "make.where-it-runs.disposable-cloud-ci",
        icon: mdiCloudOutline,
        nameKey: "catalogue.make.cloudCi.name",
        nameFallback: "Disposable cloud CI",
        blurbKey: "catalogue.make.cloudCi.blurb",
        blurbFallback:
            "Builds, tests, packages, publishes and deploys on explicit standard hosted Linux and Windows runners.",
        target: { kind: "job", jobId: "cirender", reveal: "runner-selection" },
    }),
    feature("whereItRuns", {
        key: "make.where-it-runs.ci-repository-setup",
        icon: mdiSourceRepository,
        nameKey: "catalogue.make.ciRepositorySetup.name",
        nameFallback: "CI repository setup",
        blurbKey: "catalogue.make.ciRepositorySetup.blurb",
        blurbFallback:
            "Creates and configures the repository a cloud render needs, with the secrets it needs and nothing more.",
        target: { kind: "job", jobId: "cirender", reveal: "repository-setup" },
    }),
    feature("whereItRuns", {
        key: "make.where-it-runs.large-worlds",
        icon: mdiMapSearchOutline,
        nameKey: "catalogue.make.largeWorlds.name",
        nameFallback: "Large worlds",
        blurbKey: "catalogue.make.largeWorlds.blurb",
        blurbFallback:
            "Sharding, region bounds and vertical slices, so a world too big for one run finishes across several.",
        target: { kind: "job", jobId: "renders", reveal: "large-world-strategy" },
    }),

    feature("whileItRuns", {
        key: "make.while-it-runs.renders-in-progress",
        icon: mdiProgressClock,
        nameKey: "catalogue.make.rendersInProgress.name",
        nameFallback: "Renders in progress",
        blurbKey: "catalogue.make.rendersInProgress.blurb",
        blurbFallback:
            "Every render this application started, on any of its routes, in one list, with the console for each.",
        target: { kind: "job", jobId: "renders", reveal: "active-renders" },
        metaResolver: "render.runningCount",
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.the-render-console",
        icon: mdiConsoleLine,
        nameKey: "catalogue.make.renderConsole.name",
        nameFallback: "The render console",
        blurbKey: "catalogue.make.renderConsole.blurb",
        blurbFallback:
            "Annotated engine output rather than a raw log: what each line means and what it implies for the run.",
        target: { kind: "job", jobId: "renders", reveal: "console" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.resumable-renders",
        icon: mdiRestart,
        nameKey: "catalogue.make.resumableRenders.name",
        nameFallback: "Resumable renders",
        blurbKey: "catalogue.make.resumableRenders.blurb",
        blurbFallback:
            "An interrupted render keeps the tiles it already wrote and picks up where it stopped, wherever it was running.",
        target: { kind: "job", jobId: "renders", reveal: "interrupted" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.live-speed-control",
        icon: mdiSpeedometer,
        nameKey: "catalogue.make.liveSpeedControl.name",
        nameFallback: "Live speed control",
        blurbKey: "catalogue.make.liveSpeedControl.blurb",
        blurbFallback:
            "The speed dial is changeable mid-render: the engine picks the new thread count and cache size up without the run restarting.",
        target: { kind: "job", jobId: "renders", reveal: "live-speed" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.container-offers",
        icon: mdiDocker,
        nameKey: "catalogue.make.containerOffers.name",
        nameFallback: "Container offers",
        blurbKey: "catalogue.make.containerOffers.blurb",
        blurbFallback:
            "An image already on this machine is offered rather than a fresh pull, with its digest named before anything runs.",
        target: { kind: "job", jobId: "renders", reveal: "container-offers" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.interrupted-renders",
        icon: mdiTimerOutline,
        nameKey: "catalogue.make.interruptedRenders.name",
        nameFallback: "Interrupted renders",
        blurbKey: "catalogue.make.interruptedRenders.blurb",
        blurbFallback:
            "A render the app did not finish is listed on next launch with what it had already written, and can be resumed or discarded.",
        target: { kind: "job", jobId: "renders", reveal: "interrupted" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.render-throughput",
        icon: mdiPulse,
        nameKey: "catalogue.make.renderThroughput.name",
        nameFallback: "Render throughput",
        blurbKey: "catalogue.make.renderThroughput.blurb",
        blurbFallback:
            "Live tiles per minute and a per-stage breakdown, so a render that has slowed down says so rather than just taking longer.",
        target: { kind: "job", jobId: "renders", reveal: "progress-detail" },
    }),
    feature("whileItRuns", {
        key: "make.while-it-runs.automatic-repair",
        icon: mdiWrenchOutline,
        nameKey: "catalogue.make.automaticRepair.name",
        nameFallback: "Automatic repair",
        blurbKey: "catalogue.make.automaticRepair.blurb",
        blurbFallback:
            "Diagnoses a failed render and proposes an edit, behind guardrails, showing its evidence before it changes anything.",
        target: { kind: "job", jobId: "renders", reveal: "repair-evidence" },
    }),

    feature("whatItNeeds", {
        key: "make.what-it-needs.java-runtime-provisioning",
        icon: mdiLanguageJava,
        nameKey: "catalogue.make.javaRuntime.name",
        nameFallback: "Java runtime provisioning",
        blurbKey: "catalogue.make.javaRuntime.blurb",
        blurbFallback:
            "Provisions a suitable Java for the engine if this machine has none, without installing anything system-wide.",
        target: { kind: "overlay", overlay: "settings", reveal: "java-runtime" },
        metaResolver: "java.runtime",
    }),
    feature("whatItNeeds", {
        key: "make.what-it-needs.dependency-provisioning",
        icon: mdiPackageVariantClosed,
        nameKey: "catalogue.make.dependencies.name",
        nameFallback: "Dependency provisioning",
        blurbKey: "catalogue.make.dependencies.blurb",
        blurbFallback:
            "Fetches and verifies the engine jar and every other dependency a render needs, with digests checked before use.",
        target: { kind: "overlay", overlay: "settings", reveal: "system-dependencies" },
    }),
    feature("whatItNeeds", {
        key: "make.what-it-needs.mojang-download-consent",
        icon: mdiScaleBalance,
        nameKey: "catalogue.make.downloadConsent.name",
        nameFallback: "Mojang download consent",
        blurbKey: "catalogue.make.downloadConsent.blurb",
        blurbFallback:
            "One remembered answer about whether the app may download Minecraft's own client files, which the engine needs for textures and models.",
        target: { kind: "overlay", overlay: "settings", reveal: "mojang-download-consent" },
        metaResolver: "consent.mojang",
    }),
];

/* -------------------------------------------------------------------------- */
/* 2. Your maps (6)                                                           */
/* -------------------------------------------------------------------------- */

const MAPS_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("theList", {
        key: "maps.the-list.maps-and-servers",
        icon: mdiServerNetwork,
        nameKey: "catalogue.maps.mapsAndServers.name",
        nameFallback: "Maps and servers",
        blurbKey: "catalogue.maps.mapsAndServers.blurb",
        blurbFallback:
            "Every local render and every remote BlueMap server this application knows about, with fields for adding another.",
        target: { kind: "job", jobId: "servers", reveal: "server-list" },
        metaResolver: "profile.count",
    }),
    feature("theViewer", {
        key: "maps.the-viewer.the-viewer-and-its-controls",
        icon: mdiMapOutline,
        nameKey: "catalogue.maps.viewerControls.name",
        nameFallback: "The viewer and its controls",
        blurbKey: "catalogue.maps.viewerControls.blurb",
        blurbFallback:
            "The scene, the day and night switch, perspective, flat and free-flight modes, reset camera, live x and z inputs, and a compass.",
        target: { kind: "rail", destination: "map" },
    }),
    feature("theViewer", {
        key: "maps.the-viewer.markers-and-marker-sets",
        icon: mdiMapMarkerMultipleOutline,
        nameKey: "catalogue.maps.markers.name",
        nameFallback: "Markers and marker sets",
        blurbKey: "catalogue.maps.markers.blurb",
        blurbFallback:
            "The marker sets of the map that is loaded, and the live players set, in the map's own menu.",
        target: { kind: "rail", destination: "map", reveal: "markers" },
        metaResolver: "marker.setCount",
    }),
    feature("theList", {
        key: "maps.the-list.remote-bluemap-servers",
        icon: mdiLockOutline,
        nameKey: "catalogue.maps.remoteServers.name",
        nameFallback: "Remote BlueMap servers",
        blurbKey: "catalogue.maps.remoteServers.blurb",
        blurbFallback:
            "Browses a map somebody else's server already rendered, through a token-gated embedded proxy that never exposes the token to the page.",
        target: { kind: "job", jobId: "servers", reveal: "add-remote-server" },
    }),
    feature("theViewer", {
        key: "maps.the-viewer.viewer-settings",
        icon: mdiTuneVariant,
        nameKey: "catalogue.maps.viewerSettings.name",
        nameFallback: "Viewer settings",
        blurbKey: "catalogue.maps.viewerSettings.blurb",
        blurbFallback:
            "Resolution, render distance and free-flight sensitivity, remembered per visitor rather than per install.",
        target: { kind: "rail", destination: "map", reveal: "settings" },
    }),
    feature("theViewer", {
        key: "maps.the-viewer.server-hosted-material-ui",
        icon: mdiMonitorDashboard,
        nameKey: "catalogue.maps.servedShell.name",
        nameFallback: "Server-hosted Material UI",
        blurbKey: "catalogue.maps.servedShell.blurb",
        blurbFallback:
            "The same Material interface served to an ordinary browser by the standalone server, not only inside the desktop app.",
        target: { kind: "job", jobId: "preview", reveal: "served-material-shell" },
    }),
];

/* -------------------------------------------------------------------------- */
/* 3. Share a map (6)                                                         */
/* -------------------------------------------------------------------------- */

const SHARE_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("publishing", {
        key: "share.publishing.publish-to-github-pages",
        icon: mdiWeb,
        nameKey: "catalogue.share.pages.name",
        nameFallback: "Publish to GitHub Pages",
        blurbKey: "catalogue.share.pages.blurb",
        blurbFallback:
            "Preflights the real render, publishes guarded static files, verifies the public address, and offers a two-key stop-hosting gate.",
        target: { kind: "job", jobId: "pages", reveal: "publish" },
        metaResolver: "pages.publishState",
    }),
    feature("withoutPublishing", {
        key: "share.without-publishing.watch-it-live",
        icon: mdiEye,
        nameKey: "catalogue.share.watchLive.name",
        nameFallback: "Watch it live",
        blurbKey: "catalogue.share.watchLive.blurb",
        blurbFallback:
            "Serves the render straight off this computer's own disk so it can be watched in a browser while it is still being rendered.",
        target: { kind: "job", jobId: "preview", reveal: "live-preview" },
        metaResolver: "preview.state",
    }),
    feature("withoutPublishing", {
        key: "share.without-publishing.private-worlds",
        icon: mdiLockOutline,
        nameKey: "catalogue.share.privateWorlds.name",
        nameFallback: "Private worlds",
        blurbKey: "catalogue.share.privateWorlds.blurb",
        blurbFallback:
            "Sealed before they leave the machine, rendered on public runners, published only privately.",
        target: { kind: "job", jobId: "pages", reveal: "private-worlds" },
    }),
    feature("publishing", {
        key: "share.publishing.remote-hosting",
        icon: mdiCloudUploadOutline,
        nameKey: "catalogue.share.remoteHosting.name",
        nameFallback: "Remote hosting",
        blurbKey: "catalogue.share.remoteHosting.blurb",
        blurbFallback:
            "Publishes a finished render to a saved SSH target in Docker, verifies the live address, and keeps republish and stop controls together.",
        target: { kind: "job", jobId: "remoteHosting" },
    }),
    feature("publishing", {
        key: "share.publishing.docker-hosting-manager",
        icon: mdiDocker,
        nameKey: "catalogue.share.dockerHosting.name",
        nameFallback: "Docker hosting manager",
        blurbKey: "catalogue.share.dockerHosting.blurb",
        blurbFallback:
            "Inspect and operate only this app's BlueMap server containers, with live progress, cancellation, and safe stop or remove confirmation.",
        target: { kind: "job", jobId: "dockerHosting" },
    }),
    feature("publishing", {
        key: "share.publishing.pages-feature-parity",
        icon: mdiCheckDecagramOutline,
        nameKey: "catalogue.share.parity.name",
        nameFallback: "Pages feature parity",
        blurbKey: "catalogue.share.parity.blurb",
        blurbFallback:
            "The published site is the same Material application as the desktop one, and every applicable shared requirement names its evidence.",
        target: { kind: "job", jobId: "pages", reveal: "parity-evidence" },
        metaResolver: "pages.proofCount",
    }),
    feature("publishing", {
        key: "share.publishing.release-workflow-security",
        icon: mdiShieldLockOutline,
        nameKey: "catalogue.share.workflowSecurity.name",
        nameFallback: "Release workflow security",
        blurbKey: "catalogue.share.workflowSecurity.blurb",
        blurbFallback:
            "What a publish workflow is allowed to touch, which secrets it sees, and why the release feed is unsigned but hash-checked.",
        target: { kind: "job", jobId: "pages", reveal: "workflow-security" },
    }),
];

/* -------------------------------------------------------------------------- */
/* 4. Keep a copy (7)                                                         */
/* -------------------------------------------------------------------------- */

const COPY_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("sendingACopyOut", {
        key: "copy.sending-a-copy-out.backups",
        icon: mdiCloudUploadOutline,
        nameKey: "catalogue.copy.backups.name",
        nameFallback: "Backups",
        blurbKey: "catalogue.copy.backups.blurb",
        blurbFallback:
            "Packs a world or a rendered map, splits it into parts and publishes it as release assets, with digests a restore can check byte for byte.",
        target: { kind: "job", jobId: "backups", reveal: "create-backup" },
        metaResolver: "backup.partSize",
    }),
    feature("sendingACopyOut", {
        key: "copy.sending-a-copy-out.world-git-repository",
        icon: mdiSourceRepository,
        nameKey: "catalogue.copy.worldRepo.name",
        nameFallback: "World git repository",
        blurbKey: "catalogue.copy.worldRepo.blurb",
        blurbFallback:
            "A world kept in a git repository so it updates region by region instead of being re-zipped whole.",
        target: { kind: "job", jobId: "worldrepo", reveal: "repository" },
    }),
    feature("sendingACopyOut", {
        key: "copy.sending-a-copy-out.repository-adoption",
        icon: mdiSwapHorizontal,
        nameKey: "catalogue.copy.adoption.name",
        nameFallback: "Repository adoption",
        blurbKey: "catalogue.copy.adoption.blurb",
        blurbFallback:
            "A second computer that has never touched the world recognises it, its project and its maps without re-answering anything.",
        target: { kind: "job", jobId: "worldrepo", reveal: "adoption" },
    }),
    feature("bringingACopyIn", {
        key: "copy.bringing-a-copy-in.world-sources",
        icon: mdiDownloadOutline,
        nameKey: "catalogue.copy.worldSources.name",
        nameFallback: "World sources",
        blurbKey: "catalogue.copy.worldSources.blurb",
        blurbFallback:
            "Fetches a world from any release, including one split into parts in another repository, verifying each part's digest.",
        target: { kind: "job", jobId: "backups", reveal: "world-sources" },
    }),
    feature("bringingACopyIn", {
        key: "copy.bringing-a-copy-in.ssh-world-sources",
        icon: mdiLanConnect,
        nameKey: "catalogue.copy.sshSources.name",
        nameFallback: "SSH world sources",
        blurbKey: "catalogue.copy.sshSources.blurb",
        blurbFallback:
            "Reads a world off another machine over SSH, with host-key handling and a preflight, rather than copying it by hand first.",
        target: { kind: "job", jobId: "backups", reveal: "source.ssh" },
    }),
    feature("bringingACopyIn", {
        key: "copy.bringing-a-copy-in.docker-world-source",
        icon: mdiDocker,
        nameKey: "catalogue.copy.dockerSource.name",
        nameFallback: "Docker world source",
        blurbKey: "catalogue.copy.dockerSource.blurb",
        blurbFallback:
            "Reads a world out of a running container's volume, so a server world does not have to be stopped and exported.",
        target: { kind: "job", jobId: "backups", reveal: "source.container" },
    }),
    feature("historyKeptHere", {
        key: "copy.history-kept-here.local-version-history",
        icon: mdiHistory,
        nameKey: "catalogue.copy.versionHistory.name",
        nameFallback: "Local version history",
        blurbKey: "catalogue.copy.versionHistory.blurb",
        blurbFallback:
            "An append-only git history per config folder and per project, kept beside the app's data, never inside your folder.",
        target: { kind: "overlay", overlay: "config", reveal: "history" },
        metaResolver: "history.revision",
    }),
];

/* -------------------------------------------------------------------------- */
/* 5. Set up & help (38)                                                      */
/* -------------------------------------------------------------------------- */

const SETUP_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("configuration", {
        key: "setup.configuration.settings",
        icon: mdiCogOutline,
        nameKey: "catalogue.setup.settings.name",
        nameFallback: "Settings",
        blurbKey: "catalogue.setup.settings.blurb",
        blurbFallback:
            "Download consent, Java runtime, where rendered maps go, world folder, account, render memory and more.",
        target: { kind: "overlay", overlay: "settings" },
        metaResolver: "settings.sectionCount",
    }),
    feature("configuration", {
        key: "setup.configuration.options-editor",
        icon: mdiFileCogOutline,
        nameKey: "catalogue.setup.optionsEditor.name",
        nameFallback: "Options editor",
        blurbKey: "catalogue.setup.optionsEditor.blurb",
        blurbFallback:
            "Every BlueMap configuration file on its own screen, with one search across all of them and a save plan that states what it will write.",
        target: { kind: "overlay", overlay: "config" },
        metaResolver: "config.tabsAndFields",
    }),
    feature("configuration", {
        key: "setup.configuration.github-cli-accounts",
        icon: mdiAccountCircleOutline,
        nameKey: "catalogue.setup.account.name",
        nameFallback: "GitHub CLI accounts",
        blurbKey: "catalogue.setup.account.blurb",
        blurbFallback:
            "Which account the app acts as for Actions, Pages, backups and repositories, held in the OS keychain rather than a config file.",
        target: { kind: "job", jobId: "cirender", reveal: "account" },
        metaResolver: "account.state",
    }),

    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.tabbed-navigation",
        icon: mdiTabUnselected,
        nameKey: "catalogue.setup.tabs.name",
        nameFallback: "Tabbed navigation",
        blurbKey: "catalogue.setup.tabs.blurb",
        blurbFallback:
            "Browser-style tabs docked left, right, top or bottom, with overflow, reordering, pinning, grouping and four discovery searches including bulk close.",
        target: { kind: "work-action", action: "tab-finder", reveal: "tabs" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.where-the-panels-sit",
        icon: mdiDockLeft,
        nameKey: "catalogue.setup.panelGeometry.name",
        nameFallback: "Where the panels sit",
        blurbKey: "catalogue.setup.panelGeometry.blurb",
        blurbFallback:
            "Every settings, tab, anchored, dialog and menu panel is viewport-bounded, persistent, resettable and keyboard movable or resizable.",
        target: { kind: "overlay", overlay: "settings", reveal: "surface-placement" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.appearance-editors",
        icon: mdiPaletteOutline,
        nameKey: "catalogue.setup.appearance.name",
        nameFallback: "Appearance editors",
        blurbKey: "catalogue.setup.appearance.blurb",
        blurbFallback:
            "Per-element Edit appearance, with a continuous colour picker and Word-depth typography whose overrides always win over the theme underneath.",
        target: { kind: "overlay", overlay: "settings", reveal: "display" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.the-regex-builder",
        icon: mdiRegex,
        nameKey: "catalogue.setup.regexBuilder.name",
        nameFallback: "The regex builder",
        blurbKey: "catalogue.setup.regexBuilder.blurb",
        blurbFallback:
            "On every search bar, anchored beside the field it belongs to, with the supported flags, a guided token palette and live matches.",
        target: { kind: "docs", articleId: "regex-builder" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.command-palette",
        icon: mdiMagnify,
        nameKey: "catalogue.setup.palette.name",
        nameFallback: "Command palette",
        blurbKey: "catalogue.setup.palette.blurb",
        blurbFallback: "One shortcut over every command, page and setting the application has.",
        target: { kind: "overlay", overlay: "palette" },
        metaResolver: "palette.shortcut",
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.notification-centre",
        icon: mdiBellOutline,
        nameKey: "catalogue.setup.notificationCentre.name",
        nameFallback: "Notification centre",
        blurbKey: "catalogue.setup.notificationCentre.blurb",
        blurbFallback:
            "Nothing that only informs is a dialog; messages never block, and dismissed ones stay reviewable in a history.",
        target: { kind: "overlay", overlay: "notifications" },
        metaResolver: "notice.unreadCount",
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.super-confirmation",
        icon: mdiKeyOutline,
        nameKey: "catalogue.setup.superConfirmation.name",
        nameFallback: "Super confirmation",
        blurbKey: "catalogue.setup.superConfirmation.blurb",
        blurbFallback:
            "Two key switches and a full-travel slider before anything destructive, with an emergency exit throughout and the exact consequence named first.",
        target: { kind: "docs", articleId: "super-confirmation" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.action-specific-artwork",
        icon: mdiImageOutline,
        nameKey: "catalogue.setup.actionArtwork.name",
        nameFallback: "Action-specific artwork",
        blurbKey: "catalogue.setup.actionArtwork.blurb",
        blurbFallback:
            "Cloud setup, local speed, restart, repository publication and destructive config review each get their own bundled image and semantic alt text.",
        target: { kind: "docs", articleId: "action-artwork" },
        metaResolver: "artwork.imageCount",
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.display-and-ease-of-use",
        icon: mdiEyeOutline,
        nameKey: "catalogue.setup.displayEase.name",
        nameFallback: "Display and ease of use",
        blurbKey: "catalogue.setup.displayEase.blurb",
        blurbFallback:
            "The interface-size dial, which works through page zoom rather than a root font size, plus reduced motion and the contrast theme.",
        target: { kind: "overlay", overlay: "settings", reveal: "display" },
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.theme",
        icon: mdiThemeLightDark,
        nameKey: "catalogue.setup.theme.name",
        nameFallback: "Theme",
        blurbKey: "catalogue.setup.theme.blurb",
        blurbFallback:
            "Dark, light and contrast, the contrast theme deliberately not tonal because deriving it from a seed would defeat the one thing it exists for.",
        target: { kind: "overlay", overlay: "settings", reveal: "display" },
        metaResolver: "theme.schemeCount",
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.downloads-at-once",
        icon: mdiDownloadOutline,
        nameKey: "catalogue.setup.downloadConcurrency.name",
        nameFallback: "Downloads at once",
        blurbKey: "catalogue.setup.downloadConcurrency.blurb",
        blurbFallback:
            "How many parts of a world, backup or dependency are fetched in parallel, which is faster on a fat connection and worse on a thin one.",
        target: { kind: "overlay", overlay: "settings", reveal: "download-concurrency" },
        metaResolver: "download.concurrencyRange",
    }),
    feature("howTheInterfaceBehaves", {
        key: "setup.how-the-interface-behaves.what-this-application-is-called",
        icon: mdiRenameBox,
        nameKey: "catalogue.setup.productName.name",
        nameFallback: "What this application is called",
        blurbKey: "catalogue.setup.productName.blurb",
        blurbFallback:
            "The name in the title bar and in every sentence the app writes about itself, which renames nothing on disk when you change it.",
        target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
    }),

    feature("language", {
        key: "setup.language.language-and-tone",
        icon: mdiTranslate,
        nameKey: "catalogue.setup.languageTone.name",
        nameFallback: "Language and tone",
        blurbKey: "catalogue.setup.languageTone.blurb",
        blurbFallback:
            "English, Hong Kong Cantonese and bilingual, each with its own independent funny-level slider from fully professional to maximum playfulness.",
        target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
        metaResolver: "language.modesAndLevels",
        hideInRestrictedMode: true,
    }),
    feature("language", {
        key: "setup.language.modename",
        icon: mdiLockOutline,
        nameKey: "catalogue.setup.restrictedMode.name",
        nameFallback: "Shared restricted mode",
        blurbKey: "catalogue.setup.restrictedMode.blurb",
        blurbFallback:
            "A shared, renamable mode that forces English presentation and removes the capabilities it covers rather than merely disabling them.",
        target: {
            kind: "conditional",
            capability: "restricted-mode",
            target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
        },
        metaResolver: "restrictedMode.name",
    }),
    feature("language", {
        key: "setup.language.personal-vocabulary",
        icon: mdiBookOpenPageVariantOutline,
        nameKey: "catalogue.setup.personalVocabulary.name",
        nameFallback: "Personal vocabulary",
        blurbKey: "catalogue.setup.personalVocabulary.blurb",
        blurbFallback:
            "Load a validated local JSON file to replace app-owned interface terms without uploading or sharing the file.",
        target: {
            kind: "conditional",
            capability: "personal-vocabulary",
            target: { kind: "overlay", overlay: "settings", reveal: "vocabulary" },
        },
        hideInRestrictedMode: true,
    }),
    feature("language", {
        key: "setup.language.spoken-narrator",
        icon: mdiVolumeHigh,
        nameKey: "catalogue.setup.narrator.name",
        nameFallback: "Spoken narrator",
        blurbKey: "catalogue.setup.narrator.blurb",
        blurbFallback:
            "Speaks app events one utterance at a time, superseded lines replaced rather than stacked, yielding to a screen reader and to quiet hours.",
        target: {
            kind: "conditional",
            capability: "narrator",
            target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
        },
        metaResolver: "narrator.state",
        hideInRestrictedMode: true,
    }),
    feature("language", {
        key: "setup.language.scheduled-language-and-appearance",
        icon: mdiCalendarClock,
        nameKey: "catalogue.setup.schedule.name",
        nameFallback: "Scheduled language and appearance",
        blurbKey: "catalogue.setup.schedule.blurb",
        blurbFallback:
            "Applies versioned rules by date, time, weekday and timezone, optionally gated by a bounded API or a boolean entity, with tokens kept in session memory.",
        target: {
            kind: "conditional",
            capability: "scheduled-settings",
            target: { kind: "overlay", overlay: "settings", reveal: "language-and-tone" },
        },
        hideInRestrictedMode: true,
    }),

    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.memory-console",
        icon: mdiMemory,
        nameKey: "catalogue.setup.memoryConsole.name",
        nameFallback: "Memory Console",
        blurbKey: "catalogue.setup.memoryConsole.blurb",
        blurbFallback:
            "The shared console, shown only where this checkout carries its real implementation rather than a demonstration of one.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "console" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.status-hub",
        icon: mdiMonitorDashboard,
        nameKey: "catalogue.setup.statusHub.name",
        nameFallback: "Status Hub",
        blurbKey: "catalogue.setup.statusHub.blurb",
        blurbFallback:
            "Real synchronization evidence from the shared service where one is present, never a simulated health value.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "status" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.control-plane-runtime",
        icon: mdiPulse,
        nameKey: "catalogue.setup.controlPlane.name",
        nameFallback: "Control-plane runtime",
        blurbKey: "catalogue.setup.controlPlane.blurb",
        blurbFallback:
            "The real runtime controls where the checkout carries them, with their existing security and lifecycle contract preserved.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "runtime" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.sync-attestation",
        icon: mdiCheckDecagramOutline,
        nameKey: "catalogue.setup.syncAttestation.name",
        nameFallback: "Sync attestation",
        blurbKey: "catalogue.setup.syncAttestation.blurb",
        blurbFallback:
            "Displays and verifies the existing attestation contract only, with no invented schema, signature, repository or sample identity.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "attestation" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.secret-intake",
        icon: mdiKeyOutline,
        nameKey: "catalogue.setup.secretIntake.name",
        nameFallback: "Secret intake",
        blurbKey: "catalogue.setup.secretIntake.blurb",
        blurbFallback:
            "The guarded intake and keychain boundary already implemented here, where no secret enters renderer state, logs, screenshots, exports or source.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "secret-intake" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.lowlevel-mcp",
        icon: mdiLanConnect,
        nameKey: "catalogue.setup.integrations.name",
        nameFallback: "Tooling integrations",
        blurbKey: "catalogue.setup.integrations.blurb",
        blurbFallback:
            "Only the sanitized integration surface this checkout already exposes, with no host-routing detail and no fabricated connectivity.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "job", jobId: "memory", reveal: "integrations" },
        },
    }),
    feature("sharedAcrossTheseApps", {
        key: "setup.shared-across-these-apps.shared-localization-contract",
        icon: mdiTranslate,
        nameKey: "catalogue.setup.localizationContract.name",
        nameFallback: "Shared localization contract",
        blurbKey: "catalogue.setup.localizationContract.blurb",
        blurbFallback:
            "The published localization contract, including why upstream viewer keys are never copied into this application's own catalogue.",
        target: {
            kind: "conditional",
            capability: "shared-localization-contract",
            target: { kind: "docs", articleId: "localization-contract" },
        },
        hideInRestrictedMode: true,
    }),

    feature("keepingTheAppHealthy", {
        key: "setup.keeping-the-app-healthy.automatic-updates",
        icon: mdiUpdate,
        nameKey: "catalogue.setup.updates.name",
        nameFallback: "Automatic updates",
        blurbKey: "catalogue.setup.updates.blurb",
        blurbFallback:
            "Reads the unsigned update feed, checks its package hashes, and offers a restart in a banner that never blocks or interrupts a render.",
        target: { kind: "overlay", overlay: "settings", reveal: "updates" },
        metaResolver: "update.state",
    }),
    feature("keepingTheAppHealthy", {
        key: "setup.keeping-the-app-healthy.startup-recovery",
        icon: mdiLifebuoy,
        nameKey: "catalogue.setup.startupRecovery.name",
        nameFallback: "Startup recovery",
        blurbKey: "catalogue.setup.startupRecovery.blurb",
        blurbFallback:
            "Keeps a usable shell open through recoverable startup failures; a hard boundary opens an isolated window with copyable diagnostics.",
        target: { kind: "overlay", overlay: "settings", reveal: "diagnostics" },
    }),
    feature("keepingTheAppHealthy", {
        key: "setup.keeping-the-app-healthy.worldlens-migration",
        icon: mdiSwapHorizontal,
        nameKey: "catalogue.setup.migration.name",
        nameFallback: "Migration",
        blurbKey: "catalogue.setup.migration.blurb",
        blurbFallback:
            "Moves profiles and preferences without deleting the old copy, reading legacy names and writing current identifiers.",
        target: { kind: "overlay", overlay: "settings" },
    }),
    feature("keepingTheAppHealthy", {
        key: "setup.keeping-the-app-healthy.memory-console",
        icon: mdiMemory,
        nameKey: "catalogue.setup.memoryConsoleSetting.name",
        nameFallback: "Memory console settings",
        blurbKey: "catalogue.setup.memoryConsoleSetting.blurb",
        blurbFallback:
            "The console's own settings row, present only where the console itself is, and absent rather than shown as an empty panel.",
        target: {
            kind: "conditional",
            capability: "memory-console",
            target: { kind: "overlay", overlay: "settings", reveal: "render-memory" },
        },
    }),

    feature("readingAboutIt", {
        key: "setup.reading-about-it.docs",
        icon: mdiFileDocumentOutline,
        nameKey: "catalogue.setup.docs.name",
        nameFallback: "Docs",
        blurbKey: "catalogue.setup.docs.blurb",
        blurbFallback:
            "Full-text, in-app documentation bundled with no network needed to read it, every article stating behaviour, configuration, failure modes, security and verification.",
        target: { kind: "job", jobId: "docs", reveal: "home" },
        metaResolver: "docs.articleCount",
    }),
    feature("readingAboutIt", {
        key: "setup.reading-about-it.changelog-viewer",
        icon: mdiFormatListBulleted,
        nameKey: "catalogue.setup.changelog.name",
        nameFallback: "Changelog viewer",
        blurbKey: "catalogue.setup.changelog.blurb",
        blurbFallback:
            "Every released version, with an anchored calendar date filter taking typed dates, month jumps, presets and ranges, plus search and export.",
        target: { kind: "job", jobId: "docs", reveal: "changelog" },
        metaResolver: "changelog.versionCount",
    }),
    feature("readingAboutIt", {
        key: "setup.reading-about-it.glossary",
        icon: mdiBookOpenPageVariantOutline,
        nameKey: "catalogue.setup.glossary.name",
        nameFallback: "Glossary",
        blurbKey: "catalogue.setup.glossary.blurb",
        blurbFallback:
            "Every project-specific term defined once, with a tell-me-more link from wherever the term appears.",
        target: { kind: "job", jobId: "docs", reveal: "glossary" },
    }),
    feature("readingAboutIt", {
        key: "setup.reading-about-it.eula-and-consent",
        icon: mdiScaleBalance,
        nameKey: "catalogue.setup.eula.name",
        nameFallback: "Licence and consent",
        blurbKey: "catalogue.setup.eula.blurb",
        blurbFallback:
            "The licence at first run, a tabbed viewer with search and export afterwards, and one remembered answer about downloads.",
        target: { kind: "overlay", overlay: "eula" },
        metaResolver: "eula.state",
    }),
    feature("readingAboutIt", {
        key: "setup.reading-about-it.the-interactive-tour",
        icon: mdiCompassOutline,
        nameKey: "catalogue.setup.tour.name",
        nameFallback: "The interactive tour",
        blurbKey: "catalogue.setup.tour.blurb",
        blurbFallback:
            "Walks through finding a world, rendering it and opening the result on your own machine, offered once and never twice.",
        target: { kind: "overlay", overlay: "tour" },
    }),
    feature("readingAboutIt", {
        key: "setup.reading-about-it.the-design-system",
        icon: mdiFileTreeOutline,
        nameKey: "catalogue.setup.designSystem.name",
        nameFallback: "The design system",
        blurbKey: "catalogue.setup.designSystem.blurb",
        blurbFallback:
            "Every visual decision resolves to a token declared once: the full role set, the shape scale, the type ramps, elevation, state layers and motion.",
        target: { kind: "job", jobId: "docs", reveal: "design-system" },
    }),
];

/* -------------------------------------------------------------------------- */
/* The five catalogues                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Home's five cards, in the order they are drawn.
 *
 * `make` is first and is the hero: it is the one thing a newcomer is here for, and it is the
 * only card that carries a filled primary action. The other four are equal in weight to each
 * other, which is what stops Home becoming a ranked list of things somebody has to read.
 */

/* -------------------------------------------------------------------------- */
/* 5.5 Host a server (2)                                                      */
/* -------------------------------------------------------------------------- */

const HOST_FEATURES: readonly CatalogueFeatureDefinition[] = [
    feature("theServerList", {
        key: "host.the-server-list.your-servers",
        icon: mdiServerNetwork,
        nameKey: "catalogue.host.serverList.name",
        nameFallback: "Your Minecraft servers",
        blurbKey: "catalogue.host.serverList.blurb",
        blurbFallback:
            "Every server this app knows about, wherever it runs: this computer, a container here, or a container on a remote host - and a wizard for creating a new one.",
        target: { kind: "job", jobId: "mcservers" },
    }),
    feature("whileTheServerRuns", {
        key: "host.while-the-server-runs.console-and-players",
        icon: mdiConsoleLine,
        nameKey: "catalogue.host.console.name",
        nameFallback: "Console, config, plugins and players",
        blurbKey: "catalogue.host.console.blurb",
        blurbFallback:
            "Open a server to follow its log, edit server.properties with real typed controls, browse its plugins folder, and manage its whitelist, operators and bans.",
        target: { kind: "job", jobId: "mcservers", reveal: "console" },
    }),
];

export const CATALOGUES: readonly CatalogueDefinition[] = [
    {
        id: "make",
        icon: mdiMapPlus,
        titleKey: "catalogue.make.title",
        titleFallback: "Make a map",
        blurbKey: "catalogue.make.blurb",
        blurbFallback:
            "Turn a Minecraft world into a browsable 3D map, and everything that decides how that render is set up, where it runs, what it needs from this machine, and what it is doing right now.",
        features: MAKE_FEATURES,
    },
    {
        id: "maps",
        icon: mdiMapOutline,
        titleKey: "catalogue.maps.title",
        titleFallback: "Your maps",
        blurbKey: "catalogue.maps.blurb",
        blurbFallback:
            "Maps rendered on this computer and BlueMap servers somebody else runs, in one list. Opening either is the same action, and the viewer never needs to know which it is looking at.",
        features: MAPS_FEATURES,
    },
    {
        id: "share",
        icon: mdiWeb,
        titleKey: "catalogue.share.title",
        titleFallback: "Share a map",
        blurbKey: "catalogue.share.blurb",
        blurbFallback:
            "A finished render is a folder of static files. These are the places it can go, including one that never leaves this machine and one that never becomes public at all.",
        features: SHARE_FEATURES,
    },
    {
        id: "copy",
        icon: mdiCloudUploadOutline,
        titleKey: "catalogue.copy.title",
        titleFallback: "Keep a copy",
        blurbKey: "catalogue.copy.blurb",
        blurbFallback:
            "The ways a world or a render is put somewhere that is not this one machine, and the append-only history the app keeps beside itself, never inside your world folder.",
        features: COPY_FEATURES,
    },
    {
        id: "host",
        icon: mdiServerNetwork,
        titleKey: "catalogue.host.title",
        titleFallback: "Host a server",
        blurbKey: "catalogue.host.blurb",
        blurbFallback:
            "Run a real Minecraft server this app can see: create one, adopt one that already exists, watch its console, edit its settings, and manage who can play.",
        features: HOST_FEATURES,
    },
    {
        id: "setup",
        icon: mdiCogOutline,
        titleKey: "catalogue.setup.title",
        titleFallback: "Set up & help",
        blurbKey: "catalogue.setup.blurb",
        blurbFallback:
            "Everything that is not making, viewing, sharing or copying a map: this application's own preferences, every BlueMap configuration option, the interface's own behaviours, and every documentation article, offline.",
        features: SETUP_FEATURES,
    },
];

/** Every feature across every catalogue, flattened once for search and for the palette. */
export const ALL_CATALOGUE_FEATURES: readonly CatalogueFeatureDefinition[] = CATALOGUES.flatMap(
    (catalogue) => catalogue.features,
);

/** The catalogue with this id, or null. */
export function findCatalogue(id: string): CatalogueDefinition | null {
    return CATALOGUES.find((catalogue) => catalogue.id === id) ?? null;
}

/** The feature with this key, or null. */
export function findFeature(key: string): CatalogueFeatureDefinition | null {
    return ALL_CATALOGUE_FEATURES.find((entry) => entry.key === key) ?? null;
}

/** Which catalogue a feature belongs to, or null for a key nothing declares. */
export function catalogueForFeature(key: string): CatalogueDefinition | null {
    return (
        CATALOGUES.find((catalogue) => catalogue.features.some((entry) => entry.key === key)) ??
        null
    );
}
