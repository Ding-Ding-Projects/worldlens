/**
 * electron-builder packaging configuration for the Worldlens desktop app.
 *
 * Why electron-builder and not Electron Forge: Forge's packager step drives its
 * pruning through the package manager and needs pnpm's hoisted node-linker to
 * resolve a workspace app. This monorepo uses pnpm's default isolated linker, and
 * changing that would affect every package, not just this one. electron-builder
 * packages a pre-built directory instead, which is all this app needs.
 *
 * Why Squirrel.Windows and not NSIS: the shared project rules prefer
 * Squirrel.Windows for Electron apps on Windows, because it also emits the
 * RELEASES / .nupkg pair that Electron's own autoUpdater consumes.
 *
 * What actually gets packaged: build.mjs bundles the main process (ESM) and the
 * preload (CJS) with esbuild, inlining every runtime dependency except `electron`
 * itself. So the shipped app is the `dist` tree plus this package.json — no
 * node_modules tree is copied into the asar, which is what the negated node_modules
 * pattern below asserts.
 */

// Worldlens releases are permanently unsigned. Clear every electron-builder signing input
// before configuration is evaluated so a developer shell or runner secret cannot silently
// turn one build into a differently trusted artifact.
for (const key of [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
]) {
    delete process.env[key];
}
// Deleting this variable restores electron-builder's default, which allows automatic
// certificate discovery. Set the opt-out explicitly so a runner certificate cannot be
// discovered after the other inputs above have been cleared.
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

/**
 * Apply the tracked icon and Windows version resources without asking electron-builder's
 * combined sign-and-edit path to touch the executable. `rcedit` edits PE resources only;
 * the package job separately proves both the application and setup executables remain
 * Authenticode `NotSigned` after this hook and Squirrel packaging finish.
 *
 * @param {import("electron-builder").AfterPackContext} context
 */
async function brandWindowsExecutable(context) {
    if (context.electronPlatformName !== "win32") return;

    const executableName = `${context.packager.appInfo.productFilename}.exe`;
    // Node and rcedit accept forward slashes on Windows, so these stay ordinary strings
    // and the CommonJS configuration needs no lint-forbidden `require()` helper.
    const executablePath = `${context.appOutDir}/${executableName}`;
    const iconPath = `${__dirname}/build/icon.ico`;
    const version = context.packager.appInfo.version;
    const { rcedit } = await import("rcedit");

    await rcedit(executablePath, {
        icon: iconPath,
        "file-version": version,
        "product-version": version,
        "version-string": {
            CompanyName: "Worldlens contributors",
            FileDescription: "Worldlens",
            InternalName: "Worldlens",
            OriginalFilename: executableName,
            ProductName: "Worldlens",
        },
    });
}

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "dev.worldlens.desktop",
    productName: "Worldlens",
    // `dist/` holds the esbuild output; `release/` is already gitignored.
    directories: {
        output: "release",
    },
    files: [
        "dist/**/*",
        "package.json",
        // The bundle is self-contained; nothing from node_modules is needed at runtime.
        "!node_modules/**/*",
        // Source maps are build artefacts, not shipping artefacts.
        "!**/*.map",
        // The generated manifest and TypeScript engine assets are also copied into
        // extraResources below so packaged and development lookups can share one
        // capability/version description.
    ],
    // The renderer is a separate workspace package, so it is not under this app's
    // directory and `files` cannot reach it. Without this the packaged app starts,
    // fails to find the UI bundle, and shows nothing at all: `resolveUiRoot` throws
    // inside `createWindow`, which is invoked as `void createWindow()`, so the
    // rejection is swallowed and the window is never created. It looks exactly like
    // the app not launching.
    //
    // `../../../tools/oracle/out/jars` is the same directory `tools/build-jars.mjs`
    // stages into on a workstation (jars.ts's DEFAULT_STAGING / stagingJarDirectory),
    // and the CI package job populates it with the CLI jar before this config runs.
    // `bundledJarDirectory()` in jars.ts reads it back from `resourcesPath/jars` in a
    // packaged build, so this is the one place that makes local rendering possible in
    // a shipped installer at all. Without a staged jar this copies nothing - it is not
    // required to exist, unlike `../ui/dist` above, because a developer running
    // `pnpm run make` without first running `tools/build-jars.mjs` should still get an
    // installer, just one whose local render fails the same honest way a checkout's
    // does until the jar is built.
    extraResources: [
        {
            from: "../ui/dist",
            to: "ui",
            filter: ["**/*"],
        },
        {
            from: "../../../tools/oracle/out/jars",
            to: "jars",
            filter: ["**/*"],
        },
        {
            from: "dist/render-engines/manifest.json",
            to: "render-engines/manifest.json",
            filter: ["**/*"],
        },
        {
            // The no-JVM adapter is the same standalone driver used by the oracle. Keep
            // its engine ESM, shared ESM and driver together so the packaged app can launch
            // it without reaching back into a checkout or a developer's node_modules.
            from: "dist/render-engines/typescript",
            to: "render-engines/typescript",
            filter: ["**/*"],
        },
        {
            from: "dist/render-engines/shared",
            to: "render-engines/shared",
            filter: ["**/*"],
        },
        // The complete managed workflow set a CI-render bootstrap commits to a repository -
        // see cirender/workflowTemplates.ts's `loadCiWorkflowTemplates`, which reads them
        // back from `resourcesPath/workflows/` in a packaged build. Without this entry a
        // shipped installer has no `.github/workflows` to walk up to (the packaged app's
        // own directory tree is not a checkout of this repository), so bootstrapping a
        // repository would fail on every real install with "the workflow files this
        // application ships... could not be found" even though it works perfectly in a
        // development checkout, where the fallback walk finds this repository's own
        // `.github/workflows` instead. Copied straight from the source of truth, the same
        // way the UI bundle above is staged rather than duplicated by hand.
        {
            from: "../../../.github/workflows",
            to: "workflows",
            filter: ["render-world.yml", "render-shard-wave.yml", "scheduled-render.yml"],
        },
        // Recovery mode is deliberately independent of the ordinary renderer bundle and
        // preload. These two local assets let the minimal no-script recovery window retain
        // the product identity even when either of those normal startup layers is the thing
        // that failed.
        {
            from: "build/icon.ico",
            to: "brand/worldlens.ico",
        },
        {
            from: "../ui/public/assets/logoCircle512.png",
            to: "brand/worldlens-logo.png",
        },
    ],
    asar: true,
    afterPack: brandWindowsExecutable,
    // Permanent product policy: Worldlens artifacts are intentionally unsigned. Integrity is
    // supplied by HTTPS, the immutable Squirrel feed metadata, and package hashes.
    forceCodeSigning: false,
    // No native modules reach the packaged app — everything is bundled by esbuild.
    npmRebuild: false,
    buildDependenciesFromSource: false,
    win: {
        // Multi-size .ico (256px + 64px) derived from the tracked project logo.
        icon: "build/icon.ico",
        signExecutable: false,
        // Branding is applied by the resource-only afterPack hook above. Keeping the combined
        // electron-builder sign/edit route disabled prevents it from ever invoking a signer.
        signAndEditExecutable: false,
        target: [
            {
                target: "squirrel",
                arch: ["x64"],
            },
        ],
    },
    squirrelWindows: {
        // NuGet package id: no spaces allowed, so it cannot be derived from productName.
        name: "Worldlens",
        // Emitted next to RELEASES and the .nupkg in `release/`.
        artifactName: "Worldlens-${version}-Setup.${ext}",
        // Squirrel refuses to build without this. It must be a URL, not a path:
        // Squirrel fetches it at install time to draw the Add/Remove Programs entry
        // and the shortcut. Pinned to main so a released installer keeps resolving.
        iconUrl:
            "https://raw.githubusercontent.com/Ding-Ding-Projects/worldlens/main/design/packages/app/build/icon.ico",
    },
    // Releases are published by the CI workflow via `gh release create`, never by
    // electron-builder itself.
    publish: null,
};
