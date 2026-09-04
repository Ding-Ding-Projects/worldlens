/**
 * The one definition of the object the renderer talks to.
 *
 * ## What this is
 *
 * `window.worldlens` used to be an 800-line object literal living in the preload, wired
 * directly to `ipcRenderer`. That made it structurally impossible to run the renderer
 * anywhere but inside Electron, because the renderer's only route to the application was
 * welded to the one API a browser does not have.
 *
 * The literal is unchanged here. What changed is that every Electron call in it now goes
 * through a {@link BridgeTransport} the caller supplies, so the same object can be built
 * over Electron IPC in the preload and over HTTP in a browser tab. There is deliberately
 * only one of these functions: a method added for the desktop is therefore present in a
 * hosted deployment by construction rather than by anybody remembering, which is not a
 * hypothetical worry - the contract type was already being hand-maintained in two separate
 * files, and they had drifted.
 *
 * ## Why the return type is a type parameter
 *
 * The contract (`WorldlensBridge`) names roughly 92 data types that are defined across 20
 * feature modules inside the application package, and the application package depends on
 * this one. Importing them back the other way would be a build cycle, and relocating all 92
 * out of their feature modules in the same change that moves the literal would mean a move
 * whose failures cannot be told apart from its rewrites.
 *
 * So the contract stays where its types are, and the caller applies it:
 *
 * ```ts
 * createWorldlensBridge<WorldlensBridge>(electronTransport)
 * ```
 *
 * That is a genuine, named trade-off rather than a free win. Inside this file the object is
 * structurally typed and the cast at the end is not checked against the contract, so a
 * channel name misspelt here would not be caught by the compiler. What catches it instead is
 * `factory.test.ts`, which builds the bridge over a recording transport and asserts that
 * every member the contract declares exists, is callable, and reaches the channel it claims
 * to - a check the type system was never making anyway, since a typo inside a string literal
 * is invisible to it. Callers remain fully type-checked against the contract, because the
 * type parameter is applied at the boundary.
 */
import type { BridgeTransport } from "./transport.js";
import { toBridgeCoordinates, toBridgeDiscoveryResult } from "./worldSourceBridge.js";
import type { WorldSourceDiscoverAnswer, WorldSourceReferenceAnswer } from "./worldSourceBridge.js";

/**
 * Channel names the main process registers. Written out here rather than imported,
 * because importing them would mean depending on the package that depends on this one.
 * `channels.test.ts` asserts each still matches the module that registers it, so a rename
 * on either side fails a test rather than silently producing a channel nobody answers.
 */
/**
 * What a push-channel subscriber looks like from in here.
 *
 * Deliberately loose, and only loose *inside* this file. The factory forwards payloads it
 * has no way to name - their real types live in the feature modules on the far side of a
 * dependency this package must not have - so pretending to know them would be a fiction
 * the compiler would then enforce. Every caller sees the precise per-channel signature,
 * because the contract type is applied at the boundary by the type parameter.
 */
type BridgeListener = (...payload: readonly unknown[]) => void;

/**
 * The parts of three project answers these wrappers genuinely read.
 *
 * Everything else the bridge forwards is opaque here, but these three are not forwarded -
 * they are reshaped, which means this file really does depend on their fields and saying
 * `unknown` would only move the failure from the compiler to runtime. Deliberately
 * narrower than the owning module's full types: a wrapper that reads four fields should
 * break when one of those four changes, and not when an unrelated fifth does.
 */
interface ProjectPresenceRow {
    readonly present: boolean;
    readonly worldFolder: string;
    readonly path: string;
    readonly id: string;
    readonly name: string;
    readonly mapCount: number;
    readonly updatedAt: string | null;
    readonly fromWizard: boolean;
    readonly problem: string | null;
}

type ProjectReadAnswer =
    | { readonly ok: true; readonly project: unknown; readonly path: string }
    | { readonly ok: false; readonly failure: unknown };

type ProjectSaveAnswer =
    | {
          readonly ok: true;
          readonly path: string;
          readonly historyOk: boolean;
          readonly historyMessage: string | null;
          readonly revision: string | null;
      }
    | { readonly ok: false; readonly reason: string };

const SCHOOL_MODE_CHANGED_CHANNEL = "schoolMode:changed";
const RELEASE_LEDGER_CHANNEL = "release-ledger:read";

export function createWorldlensBridge<TBridge>(transport: BridgeTransport): TBridge {
    /**
     * The lock data folder, or null on a shell too old to answer.
     *
     * `sendSync` throws when no handler is registered, so the whole probe is guarded: a renderer
     * loaded beside an older main process gets a bridge that still works and simply cannot name
     * the folder, which the surfaces already know how to say.
     */
    function readLockDataFolder(): string | null {
        try {
            const folder: unknown = transport.sendSync("locks:dataFolder");
            return typeof folder === "string" && folder.length > 0 ? folder : null;
        } catch {
            return null;
        }
    }

    const bridge = {
        syncProfiles: (profiles: unknown) => transport.invoke("profiles:sync", profiles),
        writeClipboardText: (text: unknown) => transport.invoke("clipboard:writeText", text),
        getVersion: () => transport.invoke("app:version"),
        getBuildProvenance: () => transport.invoke("app:buildProvenance"),
        /**
         * How this copy is running: on a desktop, or served from a container.
         *
         * Asked rather than inferred. A hosted deployment is reachable by whoever can reach
         * its port, and the folders it can touch are whichever the operator declared - both
         * facts a person looking at the interface has no other way to learn, and neither of
         * which the renderer can work out for itself.
         */
        getDeployment: () => transport.invoke("app:deployment"),
        releaseLedgerRead: () => transport.invoke(RELEASE_LEDGER_CHANNEL),
        schoolMode: {
            read: () => transport.invoke("schoolMode:read"),
            enable: (request: unknown) => transport.invoke("schoolMode:enable", request),
            rename: (name: unknown) => transport.invoke("schoolMode:rename", name),
            verify: (credential: unknown) => transport.invoke("schoolMode:verify", credential),
            disable: (credential: unknown) => transport.invoke("schoolMode:disable", credential),
            reset: () => transport.invoke("schoolMode:reset"),
            onChanged: (listener: BridgeListener) => {
                const handler = (_event: unknown, result: unknown): void => listener(result);
                transport.on(SCHOOL_MODE_CHANGED_CHANNEL, handler);
                return () => transport.off(SCHOOL_MODE_CHANGED_CHANNEL, handler);
            },
        },
        locks: {
            load: () => transport.invoke("locks:load"),
            save: (locks: unknown) => transport.invoke("locks:save", locks),
            // Read once, at bridge construction, from the synchronous channel that exists for
            // exactly this: the object below is built in one pass and cannot await.
            dataFolder: readLockDataFolder(),
            vault: {
                put: (lockId: unknown, secretBase32: unknown) =>
                    transport.invoke("locks:vault:put", lockId, secretBase32),
                get: (lockId: unknown) => transport.invoke("locks:vault:get", lockId),
                remove: (lockId: unknown) => transport.invoke("locks:vault:remove", lockId),
            },
        },
        mcserver: {
            list: () => transport.invoke("mcserver:list"),
            get: (id: unknown) => transport.invoke("mcserver:get", id),
            save: (record: unknown) => transport.invoke("mcserver:save", record),
            forget: (id: unknown) => transport.invoke("mcserver:forget", id),
            suggestFolder: (name: unknown) => transport.invoke("mcserver:suggestFolder", name),
            probe: (id: unknown) => transport.invoke("mcserver:probe", id),
            status: (id: unknown) => transport.invoke("mcserver:status", id),
            start: (id: unknown) => transport.invoke("mcserver:start", id),
            stop: (id: unknown, options: unknown) => transport.invoke("mcserver:stop", id, options),
            config: {
                describe: (id: unknown, path: unknown) =>
                    transport.invoke("mcserver:config:describe", id, path),
                apply: (id: unknown, path: unknown, body: unknown) =>
                    transport.invoke("mcserver:config:apply", id, path, body),
            },
            files: {
                list: (id: unknown, dir: unknown) =>
                    transport.invoke("mcserver:file:list", id, dir),
                read: (id: unknown, path: unknown) =>
                    transport.invoke("mcserver:file:read", id, path),
                write: (id: unknown, path: unknown, body: unknown) =>
                    transport.invoke("mcserver:file:write", id, path, body),
            },
            logTail: (id: unknown, lines: unknown) =>
                transport.invoke("mcserver:log:tail", id, lines),
            adopt: {
                discover: () => transport.invoke("mcserver:adopt:discover"),
                confirm: (request: unknown) => transport.invoke("mcserver:adopt", request),
                release: (id: unknown, options: unknown) =>
                    transport.invoke("mcserver:adopt:release", id, options),
            },
            worlds: {
                list: (id: unknown) => transport.invoke("mcserver:worlds:list", id),
            },
            hostProfiles: {
                list: () => transport.invoke("mcserver:hostProfiles:list"),
                get: (hostId: unknown) => transport.invoke("mcserver:hostProfiles:get", hostId),
                save: (request: unknown) => transport.invoke("mcserver:hostProfiles:save", request),
                forget: (hostId: unknown) =>
                    transport.invoke("mcserver:hostProfiles:forget", hostId),
                scan: (hostId: unknown) => transport.invoke("mcserver:hostProfiles:scan", hostId),
                trust: (hostId: unknown, fingerprint: unknown) =>
                    transport.invoke("mcserver:hostProfiles:trust", hostId, fingerprint),
            },
            backup: {
                create: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:create", id, request),
                cancel: (id: unknown) => transport.invoke("mcserver:backup:cancel", id),
                list: (owner: unknown, repo: unknown) =>
                    transport.invoke("mcserver:backup:list", owner, repo),
                issueRestoreChallenge: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:restore:challenge", id, request),
                restoreStep: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:restore:step", id, request),
                authorizeRestore: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:restore:authorize", id, request),
                issueRestoreReceipt: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:restore:issue", id, request),
                restore: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:backup:restore", id, request),
                onProgress: (listener: BridgeListener) => {
                    const forward = (_event: unknown, serverId: string, progress: unknown): void =>
                        listener(serverId, progress);
                    transport.on("mcserver:backup:progress", forward);
                    return () => {
                        transport.off("mcserver:backup:progress", forward);
                    };
                },
            },
            webConsole: {
                status: () => transport.invoke("mcserver:webconsole:status"),
                start: (options: unknown) => transport.invoke("mcserver:webconsole:start", options),
                stop: () => transport.invoke("mcserver:webconsole:stop"),
                setPassword: (password: unknown) =>
                    transport.invoke("mcserver:webconsole:setPassword", password),
                bind: () => transport.invoke("mcserver:webconsole:bind"),
            },
            // The RCON password itself never crosses this bridge in either direction: the
            // main process holds it, uses it, and only ever hands back an Answer<T> saying
            // whether a call worked.
            // Its handler in main/mcserver/ipc.ts has existed since before
            // mcserver:rcon:configure entered BRIDGE_CHANNELS, and until now the factory
            // still had no method for it -- so the channel was permitted, the handler was
            // registered, and nothing could reach it. Wired at one end and consumed at
            // neither, which is the shape this repository keeps being bitten by.
            rconConfigure: (id: unknown, request: unknown) =>
                transport.invoke("mcserver:rcon:configure", id, request),
            rconTest: (id: unknown) => transport.invoke("mcserver:rcon:test", id),
            consoleOpen: (id: unknown, tail: unknown) =>
                transport.invoke("mcserver:console:open", id, tail),
            consoleSend: (id: unknown, sessionId: unknown, command: unknown) =>
                transport.invoke("mcserver:console:send", id, sessionId, command),
            consoleClose: (id: unknown, sessionId: unknown) =>
                transport.invoke("mcserver:console:close", id, sessionId),
            onConsoleLine: (listener: BridgeListener) => {
                const forward = (_event: unknown, sessionId: string, event: unknown): void =>
                    listener(sessionId, event);
                transport.on("mcserver:console:line", forward);
                return () => {
                    transport.off("mcserver:console:line", forward);
                };
            },
            players: {
                list: (id: unknown) => transport.invoke("mcserver:players:list", id),
                action: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:players:action", id, request),
            },
            plugins: {
                search: (request: unknown) => transport.invoke("mcserver:plugins:search", request),
                versions: (request: unknown) =>
                    transport.invoke("mcserver:plugins:versions", request),
                install: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:plugins:install", id, request),
                list: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:plugins:list", id, request),
                toggle: (id: unknown, request: unknown) =>
                    transport.invoke("mcserver:plugins:toggle", id, request),
                remove: (id: unknown, path: unknown) =>
                    transport.invoke("mcserver:plugins:remove", id, path),
                updates: (request: unknown) =>
                    transport.invoke("mcserver:plugins:updates", request),
            },
            catalogue: {
                list: () => transport.invoke("mcserver:catalogue:list"),
                refresh: () => transport.invoke("mcserver:catalogue:refresh"),
                verifyWiki: (version: unknown) =>
                    transport.invoke("mcserver:catalogue:wikiVerify", version),
            },
            java: {
                resolve: (version: unknown) => transport.invoke("mcserver:java:resolve", version),
                provision: (id: unknown) => transport.invoke("mcserver:java:provision", id),
                onProgress: (listener: BridgeListener) => {
                    const forward = (_event: unknown, id: string, event: unknown): void =>
                        listener(id, event);
                    transport.on("mcserver:java:progress", forward);
                    return () => {
                        transport.off("mcserver:java:progress", forward);
                    };
                },
            },
            create: (request: unknown) => transport.invoke("mcserver:create", request),
            aws: {
                plan: (request: unknown) => transport.invoke("mcserver:aws:plan", request),
                provision: (request: unknown) =>
                    transport.invoke("mcserver:aws:provision", request),
                teardown: (request: unknown) => transport.invoke("mcserver:aws:teardown", request),
                regions: () => transport.invoke("mcserver:aws:regions"),
                instanceTypes: () => transport.invoke("mcserver:aws:instanceTypes"),
            },
            awsAccounts: {
                list: () => transport.invoke("mcserver:aws:accounts"),
                setAlias: (request: unknown) =>
                    transport.invoke("mcserver:aws:accountAlias", request),
                credits: (request: unknown) => transport.invoke("mcserver:aws:credits", request),
            },
        },
        vocabulary: {
            read: () => transport.invoke("vocabulary:read"),
            load: (raw: unknown) => transport.invoke("vocabulary:load", raw),
            clear: () => transport.invoke("vocabulary:clear"),
        },
        startup: {
            read: () => transport.invoke("startup:read"),
            copy: () => transport.invoke("startup:copy"),
            export: (format: unknown) => transport.invoke("startup:export", format),
            retry: () => transport.invoke("startup:retry"),
        },
        addons: {
            list: () => transport.invoke("addons:list"),
            importPackage: () => transport.invoke("addons:import"),
            setEnabled: (id: unknown, enabled: unknown) =>
                transport.invoke("addons:setEnabled", id, enabled),
            grant: (id: unknown, capabilities: unknown) =>
                transport.invoke("addons:grant", id, capabilities),
            revoke: (id: unknown, capability: unknown) =>
                transport.invoke("addons:revoke", id, capability),
            remove: (id: unknown) => transport.invoke("addons:remove", id),
            setSafeMode: (enabled: unknown) => transport.invoke("addons:safeMode", enabled),
            safeModeState: () => transport.invoke("addons:safeModeState"),
            diagnostics: () => transport.invoke("addons:diagnostics"),
        },

        minimizeWindow: () => transport.invoke("window:minimize"),
        toggleMaximizeWindow: () => transport.invoke("window:toggleMaximize"),
        closeWindow: () => transport.invoke("window:close"),
        isWindowMaximized: () => transport.invoke("window:isMaximized"),

        onWindowMaximizedChanged: (listener: BridgeListener) => {
            const forward = (_event: unknown, maximized: boolean): void => listener(maximized);
            transport.on("window:maximizedChanged", forward);
            return () => {
                transport.off("window:maximizedChanged", forward);
            };
        },

        setUiZoom: (factor: unknown) => {
            // Guarded rather than trusted: the renderer only ever passes one of five known
            // factors, but this is the process boundary, and a NaN handed to
            // `setZoomFactor` throws where a clamp reads as "the nearest size we do".
            const requested = Number(factor);
            const clamped = Number.isFinite(requested) ? Math.min(2, Math.max(1, requested)) : 1;
            transport.setZoomFactor(clamped);
        },

        readConsent: () => transport.invoke("consent:read"),
        readEulaDocument: (request: unknown) => transport.invoke("eula:document", request),
        acceptDownload: () => transport.invoke("consent:accept"),
        revokeDownloadConsent: () => transport.invoke("consent:revoke"),

        needsFirstRun: () => transport.invoke("firstRun:needed"),
        completeFirstRun: () => transport.invoke("firstRun:complete"),

        inspectWorldFolder: (folder: unknown) => transport.invoke("world:inspect", folder),

        listMinecraftFolders: () => transport.invoke("world:folders"),
        mountMinecraftFolder: (folder: unknown) => transport.invoke("world:mount", folder),
        unmountMinecraftFolder: (id: unknown) => transport.invoke("world:unmount", id),
        labelMinecraftFolder: (id: unknown, label: unknown) =>
            transport.invoke("world:label", id, label),
        scanMinecraftFolder: (id: unknown) => transport.invoke("world:scan", id),

        pathForDroppedFile: (file: File) => {
            // Guarded rather than trusted: `webUtils` throws for anything that is not a real
            // `File` from the file system, and a drag out of a browser tab or a text selection
            // produces exactly that. Null says "this drop named no folder", which the step can
            // explain, where a thrown error inside a drop handler would silently do nothing.
            try {
                const path = transport.getPathForFile(file);
                return typeof path === "string" && path !== "" ? path : null;
            } catch {
                return null;
            }
        },

        startRender: (request: unknown) => transport.invoke("render:start", request),
        cancelRender: (renderId: unknown) => transport.invoke("render:cancel", renderId),
        adjustRenderSpeed: (renderId: unknown, level: unknown) =>
            transport.invoke("render:adjustSpeed", renderId, level),
        activeRenders: () => transport.invoke("render:active"),
        listRenders: () => transport.invoke("render:list"),
        interruptedRenders: () => transport.invoke("render:interrupted"),
        resumeRender: (renderId: unknown, maps: unknown) =>
            transport.invoke("render:resume", renderId, maps),
        dismissResume: (renderId: unknown) => transport.invoke("render:dismissResume", renderId),
        renderEngine: (renderId: unknown) => transport.invoke("render:engine", renderId),
        mapStorageDirectory: () => transport.invoke("render:storageDirectory"),
        setMapStorageDirectory: (value: unknown) =>
            transport.invoke("render:setStorageDirectory", value),

        javaRuntime: () => transport.invoke("java:runtime"),
        javaDownloadConsent: () => transport.invoke("java:downloadConsent"),
        acceptJavaDownloadConsent: () => transport.invoke("java:acceptDownloadConsent"),
        provisionJavaRuntime: () => transport.invoke("java:provision"),
        onJavaProvisionEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("java:provisionEvent", forward);
            return () => {
                transport.off("java:provisionEvent", forward);
            };
        },

        sysdepsPreview: () => transport.invoke("sysdeps:preview"),
        installSysdeps: (ids: unknown) => transport.invoke("sysdeps:install", ids),
        cancelSysdepInstall: () => transport.invoke("sysdeps:cancel"),
        onSysdepInstallEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("sysdeps:installEvent", forward);
            return () => {
                transport.off("sysdeps:installEvent", forward);
            };
        },

        onRenderEvent: (listener: BridgeListener) => {
            // The renderer never sees the raw unknown: handing it across the
            // context bridge would expose `sender`, and with it a way to send on any
            // channel the main process listens to.
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("render:event", forward);
            return () => {
                transport.off("render:event", forward);
            };
        },

        // Routed through `worldsource:*` rather than `download:*`: the former is this one's
        // superset, so a manifest-shaped download keeps working exactly as it did and a
        // checksum-list download from any public repository becomes reachable from the same
        // four methods rather than needing the panel to call a second set of channels.
        // `listDownloads` stays on `download:list`, because both paths write the same
        // `DownloadRecord` shape into the same on-disk workspace layout, so it already reads
        // back a checksum-list download with no change of its own.
        discoverRelease: async (request: unknown) => {
            const answer = (await transport.invoke(
                "worldsource:discover",
                request,
            )) as WorldSourceDiscoverAnswer;
            return toBridgeDiscoveryResult(answer);
        },
        startDownload: (request: unknown) => transport.invoke("worldsource:fetch", request),
        cancelDownload: (downloadId: unknown) => transport.invoke("worldsource:cancel", downloadId),
        activeDownloads: () => transport.invoke("worldsource:active"),
        listDownloads: () => transport.invoke("download:list"),

        onDownloadEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("download:event", forward);
            return () => {
                transport.off("download:event", forward);
            };
        },

        ghCliListAccounts: () => transport.invoke("ghCli:listAccounts"),
        ghCliSwitchAccount: (host: unknown, login: unknown) =>
            transport.invoke("ghCli:switchAccount", { host, login }),
        ghCliLogoutAccount: (host: unknown, login: unknown) =>
            transport.invoke("ghCli:logoutAccount", { host, login }),
        ghCliStartLogin: (expectedLogin: unknown) =>
            transport.invoke(
                "ghCli:startLogin",
                expectedLogin === undefined ? {} : { expectedLogin },
            ),
        ghCliCancelLogin: () => transport.invoke("ghCli:cancelLogin"),
        ghCliLegacyCredentialStatus: () => transport.invoke("ghCli:legacyCredentialStatus"),
        ghCliRemoveLegacyCredentials: () => transport.invoke("ghCli:removeLegacyCredentials"),
        onGhCliLoginState: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("ghCli:loginState", forward);
            return () => {
                transport.off("ghCli:loginState", forward);
            };
        },

        config: {
            readFolder: (folder: unknown) => transport.invoke("config:readFolder", folder),
            writeFiles: (folder: unknown, files: unknown) =>
                transport.invoke("config:writeFiles", folder, files),
            deleteFiles: (folder: unknown, paths: unknown) =>
                transport.invoke("config:deleteFiles", folder, paths),
            pickDirectory: (options: unknown) => transport.invoke("config:pickDirectory", options),
            pickFile: (options: unknown) => transport.invoke("config:pickFile", options),
            testSqlConnection: (request: unknown) =>
                transport.invoke("config:testSqlConnection", request),
            suggestConfigFolder: () => transport.invoke("config:suggestFolder"),

            // The separator of whatever is *answering*, which the transport knows and this
            // file does not. In the preload that is the platform Electron injected into a
            // sandboxed renderer that has no `node:path` to ask instead; in a hosted
            // deployment it is the container's, which is the whole reason it cannot simply be
            // read from the machine the reader is sitting at. Used to build display paths,
            // never to resolve one: every real path is joined on the answering side.
            pathSeparator: transport.pathSeparator,
        },

        dialog: {
            pickFolder: (options: unknown) => transport.invoke("dialog:pickFolder", options),
            pickFile: (options: unknown) => transport.invoke("dialog:pickFile", options),
        },

        /**
         * What a deployment with no desktop offers instead of `dialog`.
         *
         * Present in every build rather than only the hosted one, because the factory is
         * deliberately single: a method that exists in one host and not the other is exactly
         * the drift this package was written to remove. On a desktop nothing registers these,
         * so they answer "no handler is registered", and `mountBrowserHost.ts` feature-detects
         * rather than assuming.
         */
        mounts: {
            list: () => transport.invoke("mounts:list"),
            browse: (rootId: unknown, path: unknown) =>
                transport.invoke("mounts:browse", { rootId, path }),
        },

        worldRepo: {
            owners: (accountId: unknown) => transport.invoke("worldrepo:owners", { accountId }),
            preflight: (target: unknown) => transport.invoke("worldrepo:preflight", target),
            sync: (request: unknown) => transport.invoke("worldrepo:sync", request),
            remove: (target: unknown) => transport.invoke("worldrepo:remove", target),
            cancel: (key: unknown) => transport.invoke("worldrepo:cancel", key),
            active: () => transport.invoke("worldrepo:active"),
            records: () => transport.invoke("worldrepo:records"),
            resume: (target: unknown) => transport.invoke("worldrepo:resume", target),
            remoteTip: (request: unknown) => transport.invoke("worldrepo:remoteTip", request),
            adoptionProbe: (request: unknown) =>
                transport.invoke("worldrepo:adoptionProbe", request),
            adoptionPlan: (request: unknown) => transport.invoke("worldrepo:adoptionPlan", request),
            onWorldRepoEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("worldrepo:event", forward);
                return () => {
                    transport.off("worldrepo:event", forward);
                };
            },
        },

        sshWorldSource: {
            validate: (target: unknown) => transport.invoke("worldsource:ssh:validate", target),
            detect: (target: unknown) => transport.invoke("worldsource:ssh:detect", target),
            trustHostKey: (target: unknown, fingerprint: unknown) =>
                transport.invoke("worldsource:ssh:trustHostKey", target, fingerprint),
            checkPath: (path: unknown, kind: unknown) =>
                transport.invoke("worldsource:ssh:checkPath", path, kind),
            survey: (target: unknown, path: unknown, kind: unknown) =>
                transport.invoke("worldsource:ssh:survey", target, path, kind),
            diff: (previous: unknown, current: unknown) =>
                transport.invoke("worldsource:ssh:diff", previous, current),
            fetch: (request: unknown) => transport.invoke("worldsource:ssh:fetch", request),
            cancel: (id: unknown) => transport.invoke("worldsource:ssh:cancel", id),
            active: () => transport.invoke("worldsource:ssh:active"),
            onSshWorldSourceEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("worldsource:ssh:event", forward);
                return () => {
                    transport.off("worldsource:ssh:event", forward);
                };
            },
        },

        dockerWorld: {
            list: () => transport.invoke("dockerworld:list"),
            inspectContainer: (id: unknown) => transport.invoke("dockerworld:inspectContainer", id),
            inspectVolume: (name: unknown) => transport.invoke("dockerworld:inspectVolume", name),
            fetch: (request: unknown) => transport.invoke("dockerworld:fetch", request),
            cancel: (fetchId: unknown) => transport.invoke("dockerworld:cancel", fetchId),
            active: () => transport.invoke("dockerworld:active"),
            fingerprint: (source: unknown) => transport.invoke("dockerworld:fingerprint", source),
            fingerprintsEqual: (a: unknown, b: unknown) =>
                transport.invoke("dockerworld:fingerprintsEqual", a, b),
            onDockerWorldEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("dockerworld:event", forward);
                return () => {
                    transport.off("dockerworld:event", forward);
                };
            },
        },

        dockerHosting: {
            create: (request: unknown) => transport.invoke("dockerhosting:create", request),
            inspect: () => transport.invoke("dockerhosting:inspect"),
            authorize: (request: unknown) => transport.invoke("dockerhosting:authorize", request),
            removeToken: (containerId: unknown) =>
                transport.invoke("dockerhosting:removeToken", containerId),
            mutate: (request: unknown) => transport.invoke("dockerhosting:mutate", request),
            logs: (containerId: unknown, tail = 200) =>
                transport.invoke("dockerhosting:logs", { id: containerId, tail }),
            cancel: (operationId: unknown) => transport.invoke("dockerhosting:cancel", operationId),
            onEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("dockerhosting:event", forward);
                return () => transport.off("dockerhosting:event", forward);
            },
        },

        dockerRuntime: () => transport.invoke("runtime:docker"),
        startDockerRuntime: () => transport.invoke("runtime:docker:start"),
        runtimeModes: () => transport.invoke("runtime:modes"),
        containerOffers: () => transport.invoke("runtime:containers"),
        reattachContainer: (renderId: unknown) => transport.invoke("runtime:reattach", renderId),
        cancelContainer: (renderId: unknown) =>
            transport.invoke("runtime:cancelContainer", renderId),
        dismissContainer: (renderId: unknown) =>
            transport.invoke("runtime:dismissContainer", renderId),

        parseWorldSource: async (text: unknown) => {
            const reference = (await transport.invoke(
                "worldsource:parse",
                text,
            )) as WorldSourceReferenceAnswer | null;
            return toBridgeCoordinates(reference);
        },

        validateRemoteTarget: (target: unknown) => transport.invoke("remote:validate", target),
        describeRemoteTarget: (target: unknown) => transport.invoke("remote:describe", target),
        remotePreflight: (target: unknown) => transport.invoke("remote:preflight", target),
        trustRemoteHostKey: (request: unknown) => transport.invoke("remote:trustHostKey", request),
        startRemoteRender: (request: unknown) => transport.invoke("remote:render", request),
        cancelRemoteRender: (renderId: unknown) => transport.invoke("remote:cancel", renderId),
        activeRemoteRenders: () => transport.invoke("remote:active"),
        startRemoteHosting: (request: unknown) => transport.invoke("hosting:start", request),
        remoteHostingRecords: () => transport.invoke("hosting:records"),
        remoteHostingRecord: (hostingId: unknown) => transport.invoke("hosting:record", hostingId),
        refreshRemoteHosting: (hostingId: unknown) =>
            transport.invoke("hosting:refresh", hostingId),
        stopRemoteHosting: (hostingId: unknown) => transport.invoke("hosting:stop", hostingId),
        dashboardSnapshot: (): Promise<unknown> => transport.invoke("dashboard:snapshot"),
        dashboardRefresh: (options?: unknown): Promise<unknown> =>
            transport.invoke("dashboard:refresh", options ?? {}),
        dashboardCancel: (): Promise<{ readonly cancelled: boolean }> =>
            transport.invoke("dashboard:cancel") as Promise<{ readonly cancelled: boolean }>,
        onRemoteHostingEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("hosting:event", forward);
            return () => {
                transport.off("hosting:event", forward);
            };
        },
        dockerHostingInspect: (): Promise<unknown> => transport.invoke("dockerhosting:inspect"),
        dockerHostingCreate: (request: unknown): Promise<unknown> =>
            transport.invoke("dockerhosting:create", request),
        dockerHostingMutate: (request: unknown): Promise<unknown> =>
            transport.invoke("dockerhosting:mutate", request),
        dockerHostingCancel: (operationId: unknown): Promise<boolean> =>
            transport.invoke("dockerhosting:cancel", operationId) as Promise<boolean>,
        dockerHostingAuthorize: (request: unknown): Promise<unknown> =>
            transport.invoke("dockerhosting:authorize", request),
        dockerHostingRemoveToken: (instanceId: unknown): Promise<unknown> =>
            transport.invoke("dockerhosting:removeToken", instanceId),
        onDockerHostingEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("dockerhosting:event", forward);
            return () => transport.off("dockerhosting:event", forward);
        },
        browseRemoteDirectory: (target: unknown, path: unknown) =>
            transport.invoke("remote:browse", target, path),

        ciRenderPreflight: (request: unknown) => transport.invoke("cirender:preflight", request),
        startCiRender: (request: unknown) => transport.invoke("cirender:start", request),
        resumeCiRender: (syncId: unknown) => transport.invoke("cirender:resume", syncId),
        checkCiRender: (syncId: unknown) => transport.invoke("cirender:check", syncId),
        listCiRenders: () => transport.invoke("cirender:list"),
        cancelCiRender: (syncId: unknown) => transport.invoke("cirender:cancel", syncId),
        forgetCiRender: (syncId: unknown) => transport.invoke("cirender:forget", syncId),
        activeCiRenders: () => transport.invoke("cirender:active"),
        onCiRenderEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("cirender:event", forward);
            return () => {
                transport.off("cirender:event", forward);
            };
        },
        createCiCloudConfig: (request: unknown) =>
            transport.invoke("cirender:createCloudConfig", request),
        cancelCiCloudConfig: (operationId: unknown) =>
            transport.invoke("cirender:cancelCloudConfig", operationId),

        ciRenderOwners: (accountId: unknown) =>
            transport.invoke(
                "cirender:owners",
                accountId === undefined ? undefined : { accountId },
            ),
        ciRenderRepositories: (accountId: unknown) =>
            transport.invoke(
                "cirender:repositories",
                accountId === undefined ? undefined : { accountId },
            ),
        suggestCiRepoName: (sourceName: unknown) =>
            transport.invoke("cirender:suggestRepoName", sourceName),
        checkCiRepoName: (request: unknown) => transport.invoke("cirender:checkRepoName", request),
        createCiRepository: (request: unknown) =>
            transport.invoke("cirender:createRepository", request),
        ciRenderScheduleRead: (owner: unknown, repo: unknown, accountId: unknown) =>
            transport.invoke("cirender:scheduleRead", { owner, repo, accountId }),
        ciRenderScheduleWrite: (
            syncId: unknown,
            enabled: unknown,
            cadence: unknown,
            accountId: unknown,
        ) => transport.invoke("cirender:scheduleWrite", { syncId, enabled, cadence, accountId }),

        bootstrapCiRepository: (
            owner: unknown,
            repo: unknown,
            accountId: unknown,
            publishToPages: unknown,
        ) => transport.invoke("cirender:bootstrap", { owner, repo, accountId, publishToPages }),
        onCiBootstrapEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("cirender:bootstrapEvent", forward);
            return () => {
                transport.off("cirender:bootstrapEvent", forward);
            };
        },

        pagesRenders: () => transport.invoke("pages:renders"),
        pagesOwners: (accountId: unknown) => transport.invoke("pages:owners", { accountId }),
        pagesPreflight: (request: unknown) => transport.invoke("pages:preflight", request),
        publishPages: (request: unknown) => transport.invoke("pages:publish", request),
        stopPagesHosting: (request: unknown) => transport.invoke("pages:stop", request),
        cancelPagesPublish: (renderId: unknown) => transport.invoke("pages:cancel", renderId),
        activePagesPublishes: () => transport.invoke("pages:active"),
        publishedPages: () => transport.invoke("pages:published"),
        resumePages: (request: unknown) => transport.invoke("pages:resume", request),
        refreshPagesStatus: (request: unknown) => transport.invoke("pages:status", request),
        onPagesEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("pages:event", forward);
            return () => {
                transport.off("pages:event", forward);
            };
        },

        exportStaticMap: (request: unknown) => transport.invoke("map-export:start", request),
        cancelStaticMapExport: (exportId: unknown) =>
            transport.invoke("map-export:cancel", exportId),
        activeStaticMapExports: () => transport.invoke("map-export:active"),
        issueStaticMapOverwriteToken: () => transport.invoke("map-export:overwrite-token"),
        resumeStaticMapExport: (exportId: unknown) =>
            transport.invoke("map-export:resume", exportId),
        staticMapExportLedger: () => transport.invoke("map-export:ledger"),
        onStaticMapExportEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("map-export:event", forward);
            return () => {
                transport.off("map-export:event", forward);
            };
        },

        previewAvailability: (renderId: unknown) =>
            transport.invoke("preview:availability", renderId),
        startPreview: (request: unknown) => transport.invoke("preview:start", request),
        stopPreview: () => transport.invoke("preview:stop"),
        previewStatus: () => transport.invoke("preview:status"),
        openPreviewInBrowser: () => transport.invoke("preview:openInBrowser"),
        previewNetworkDefault: () => transport.invoke("preview:networkDefault"),
        setPreviewNetworkDefault: (allowNetwork: boolean) =>
            transport.invoke("preview:setNetworkDefault", allowNetwork),
        onPreviewEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("preview:event", forward);
            return () => {
                transport.off("preview:event", forward);
            };
        },

        updateState: () => transport.invoke("update:state"),
        acknowledgeUpdateInstallOutcome: () => transport.invoke("update:acknowledgeInstallOutcome"),
        checkForUpdates: () => transport.invoke("update:check"),
        restartToInstallUpdate: (unsavedWork: boolean) =>
            transport.invoke("update:restart", { unsavedWork }),
        onUpdateEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, state: unknown): void => listener(state);
            transport.on("update:event", forward);
            return () => {
                transport.off("update:event", forward);
            };
        },

        renderRuntimeModes: () => transport.invoke("render:runtimeModes"),

        revealPath: (path: unknown) => transport.invoke("files:reveal", path),
        revealRoots: () => transport.invoke("files:revealRoots"),
        mapStorageDefault: () => transport.invoke("files:mapStorageDefault"),
        renderMemory: () => transport.invoke("files:renderMemory"),
        setRenderMemory: (setting: unknown) => transport.invoke("files:setRenderMemory", setting),
        downloadConcurrency: () => transport.invoke("files:downloadConcurrency"),
        setDownloadConcurrency: (workers: unknown) =>
            transport.invoke("files:setDownloadConcurrency", workers),

        structures: {
            // Both halves of the namespace on one object, because the renderer probes for the
            // namespace once and a build that exposed only half of it would report itself as
            // able to do both. Discovery and rendering arrived from separate lanes and keep
            // separate channels behind this.
            discover: (worldFolder: unknown) =>
                transport.invoke("structures:discover", worldFolder),
            render: (filePath: unknown) => transport.invoke("structures:render", filePath),
        },

        project: {
            read: (worldFolder: unknown) => transport.invoke("project:read", worldFolder),
            discover: (worldFolder: unknown) => transport.invoke("project:discover", worldFolder),
            discoverMany: (worldFolders: unknown) =>
                transport.invoke("project:discoverMany", worldFolders),
            save: (worldFolder: unknown, project: unknown, replaceUnreadable: unknown) =>
                transport.invoke("project:save", worldFolder, project, replaceUnreadable === true),
            history: (worldFolder: unknown, limit: unknown) =>
                transport.invoke("project:history", worldFolder, limit),
            restore: (worldFolder: unknown, id: unknown) =>
                transport.invoke("project:restore", worldFolder, id),
            discardOlderRevisions: (worldFolder: unknown, keep: unknown) =>
                transport.invoke("project:discardOlder", worldFolder, keep),
            notifyAutosaveChange: (worldFolder: unknown, project: unknown) =>
                transport.invoke("project:autosaveNotify", worldFolder, project),
            flushAutosave: (worldFolder: unknown, reason: unknown) =>
                transport.invoke("project:autosaveFlush", worldFolder, reason),
            onAutosaveEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("project:autosaveEvent", forward);
                return () => {
                    transport.off("project:autosaveEvent", forward);
                };
            },

            listProjects: async () => {
                const folders = (await transport.invoke("world:folders")) as { id: string }[];
                const worlds: { path: string; name: string | null }[] = [];
                const problems: { world: string; message: string }[] = [];
                for (const folder of folders) {
                    try {
                        // `world:scan` answers with a result union rather than the scan itself:
                        // one unplugged drive must not take the worlds on every other drive off
                        // the screen with it, so a folder that cannot be read reports its own
                        // message and the rest still list.
                        const result = (await transport.invoke("world:scan", folder.id)) as
                            | {
                                  ok: true;
                                  scan: { worlds: { path: string; name: string | null }[] };
                              }
                            | { ok: false; folderId: string; message: string };
                        if (!result.ok) {
                            problems.push({ world: folder.id, message: result.message });
                            continue;
                        }
                        for (const world of result.scan.worlds) {
                            worlds.push({ path: world.path, name: world.name });
                        }
                    } catch (error) {
                        problems.push({
                            world: folder.id,
                            message: error instanceof Error ? error.message : String(error),
                        });
                    }
                }
                const presence = (await transport.invoke(
                    "project:discoverMany",
                    worlds.map((world) => world.path),
                )) as ProjectPresenceRow[];
                const named = new Map(worlds.map((world) => [world.path, world.name]));
                return {
                    // A project that will not parse is still listed, with its problem: a row
                    // that vanishes reads as settings that were lost.
                    projects: presence
                        .filter((row) => row.present)
                        .map((row) => ({
                            world: row.worldFolder,
                            file: row.path,
                            id: row.id,
                            name: row.name,
                            maps: row.mapCount,
                            createdAt: null,
                            updatedAt: row.updatedAt,
                            fromWizard: row.fromWizard,
                            worldName: named.get(row.worldFolder) ?? null,
                            problem: row.problem,
                        })),
                    scanned: worlds.length,
                    problems,
                };
            },
            readProject: async (world: unknown) => {
                const outcome = (await transport.invoke(
                    "project:read",
                    world,
                )) as ProjectReadAnswer;
                return outcome.ok
                    ? { ok: true as const, project: outcome.project, file: outcome.path }
                    : { ok: false as const, failure: outcome.failure };
            },
            writeProject: async (world: unknown, project: unknown) => {
                const saved = (await transport.invoke(
                    "project:save",
                    world,
                    project,
                    false,
                )) as ProjectSaveAnswer;
                // `historyOk`/`historyMessage`/`revision` travel through rather than being
                // dropped here: a save that wrote the file but could not keep a record of it is
                // still a save the interface must be able to tell apart from one that kept both
                // promises, and this convenience wrapper is the only place that decision could
                // otherwise get lost between `project:save`'s real answer and the caller.
                return saved.ok
                    ? {
                          ok: true as const,
                          file: saved.path,
                          historyOk: saved.historyOk,
                          historyMessage: saved.historyMessage,
                          revision: saved.revision,
                      }
                    : { ok: false as const, message: saved.reason };
            },
        },

        history: {
            status: () => transport.invoke("history:status"),
            list: (folder: unknown, limit: unknown) =>
                transport.invoke("history:list", folder, limit),
            snapshot: (folder: unknown) => transport.invoke("history:snapshot", folder),
            revisionFiles: (folder: unknown, id: unknown) =>
                transport.invoke("history:revisionFiles", folder, id),
            diff: (folder: unknown, id: unknown) => transport.invoke("history:diff", folder, id),
            restore: (folder: unknown, id: unknown) =>
                transport.invoke("history:restore", folder, id),
            label: (folder: unknown, id: unknown, label: unknown) =>
                transport.invoke("history:label", folder, id, label),
            discardOlderRevisions: (folder: unknown, keep: unknown) =>
                transport.invoke("history:discardOlder", folder, keep),
            compare: (folder: unknown, from: unknown, to: unknown) =>
                transport.invoke("history:compare", folder, from, to),
            restoreFiles: (folder: unknown, id: unknown, paths: unknown) =>
                transport.invoke("history:restoreFiles", folder, id, paths),
            restoreSettings: (folder: unknown, id: unknown, files: unknown, keys: unknown) =>
                transport.invoke("history:restoreSettings", folder, id, files, keys),
        },

        profilesHistory: {
            read: () => transport.invoke("profilesHistory:read"),
            save: (state: unknown) => transport.invoke("profilesHistory:save", state),
            list: (limit: unknown) => transport.invoke("profilesHistory:list", limit),
            restore: (id: unknown) => transport.invoke("profilesHistory:restore", id),
            discardOlderRevisions: (keep: unknown) =>
                transport.invoke("profilesHistory:discardOlder", keep),
        },

        appSettingsHistory: {
            read: () => transport.invoke("settingsHistory:read"),
            save: (state: unknown) => transport.invoke("settingsHistory:save", state),
            list: (limit: unknown) => transport.invoke("settingsHistory:list", limit),
            restore: (id: unknown) => transport.invoke("settingsHistory:restore", id),
            discardOlderRevisions: (keep: unknown) =>
                transport.invoke("settingsHistory:discardOlder", keep),
        },

        gallery: {
            list: () => transport.invoke("gallery:list"),
            readAsset: (id: unknown) => transport.invoke("gallery:readAsset", id),
            add: (draft: unknown) => transport.invoke("gallery:add", draft),
            importRecords: (drafts: unknown) => transport.invoke("gallery:import", drafts),
            update: (id: unknown, changes: unknown) =>
                transport.invoke("gallery:update", id, changes),
            delete: (ids: unknown) => transport.invoke("gallery:delete", ids),
            export: (format: unknown) => transport.invoke("gallery:export", format),
        },

        bluemapSource: {
            read: () => transport.invoke("bluemapSource:read"),
            check: () => transport.invoke("bluemapSource:check"),
        },

        chunkerActions: {
            prepare: (request: unknown) => transport.invoke("chunkerActions:prepare", request),
            start: (request: unknown) => transport.invoke("chunkerActions:start", request),
            list: () => transport.invoke("chunkerActions:list"),
            recoverable: () => transport.invoke("chunkerActions:recoverable"),
            adopt: (request: unknown) => transport.invoke("chunkerActions:adopt", request),
            check: (id: unknown) => transport.invoke("chunkerActions:check", id),
            collect: (id: unknown) => transport.invoke("chunkerActions:collect", id),
            cancel: (id: unknown) => transport.invoke("chunkerActions:cancel", id),
        },
        bedrock: {
            detect: (folder: unknown, sizeBytes: unknown) =>
                transport.invoke("bedrock:detect", folder, sizeBytes ?? null),
            chunkerStatus: () => transport.invoke("bedrock:chunker"),
            capabilities: () => transport.invoke("bedrock:capabilities"),
            inspectOptions: (world: unknown) => transport.invoke("bedrock:inspectOptions", world),
            configurationSchema: () => transport.invoke("bedrock:configurationSchema"),
            containerImages: () => transport.invoke("bedrock:containerImages"),
            containerStart: (request: unknown) => transport.invoke("bedrock:containerStart", request),
            containerState: (id: unknown) => transport.invoke("bedrock:containerState", id),
            containerCancel: (id: unknown) => transport.invoke("bedrock:containerCancel", id),
            fetchChunker: () => transport.invoke("bedrock:fetchChunker"),
            convert: (request: unknown) => transport.invoke("bedrock:convert", request),
            cancel: (conversionId: unknown) => transport.invoke("bedrock:cancel", conversionId),
            record: (world: unknown) => transport.invoke("bedrock:record", world),
            onBedrockEvent: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("bedrock:event", forward);
                return () => {
                    transport.off("bedrock:event", forward);
                };
            },
        },

        repair: {
            agentAvailability: () => transport.invoke("repair:agent"),
            failures: () => transport.invoke("repair:failures"),
            diagnose: (id: unknown) => transport.invoke("repair:diagnose", id),
            run: (id: unknown) => transport.invoke("repair:run", id),
            issueReport: {
                availability: () => transport.invoke("repair:reportAvailability"),
                draft: (id: unknown, selection: unknown) =>
                    transport.invoke("repair:reportDraft", id, selection),
                export: (content: unknown, format: unknown) =>
                    transport.invoke("repair:reportExport", { content, format }),
                submit: (title: unknown, markdown: unknown) =>
                    transport.invoke("repair:reportSubmit", { title, markdown }),
            },
        },

        converter: {
            catalog: () => transport.invoke("converter:catalog"),
            inspect: (path: unknown) => transport.invoke("converter:inspect", path),
            pdf: (request: unknown) => transport.invoke("converter:pdf", request),
            enqueue: (items: unknown) => transport.invoke("converter:enqueue", items),
            queue: () => transport.invoke("converter:queue"),
            pause: () => transport.invoke("converter:pause"),
            resume: () => transport.invoke("converter:resume"),
            cancel: (id: unknown) => transport.invoke("converter:cancel", id),
            retry: (id: unknown) => transport.invoke("converter:retry", id),
            openInEditor: (path: unknown) => transport.invoke("converter:openInEditor", path),
        },

        ollama: {
            health: () => transport.invoke("ollama:health"),
            tags: () => transport.invoke("ollama:tags"),
            running: () => transport.invoke("ollama:running"),
            show: (name: unknown) => transport.invoke("ollama:show", name),
            catalog: () => transport.invoke("ollama:catalog"),
            catalogRefresh: () => transport.invoke("ollama:catalogRefresh"),
            hardware: () => transport.invoke("ollama:hardware"),
            runtime: () => transport.invoke("ollama:runtime"),
            runtimeEnsure: () => transport.invoke("ollama:runtimeEnsure"),
            runtimeCancel: () => transport.invoke("ollama:runtimeCancel"),
            runtimeStop: () => transport.invoke("ollama:runtimeStop"),
            runtimeRestart: () => transport.invoke("ollama:runtimeRestart"),
            runtimeProbe: () => transport.invoke("ollama:runtimeProbe"),
            delete: (name: unknown) => transport.invoke("ollama:delete", name),
            copy: (source: unknown, destination: unknown) =>
                transport.invoke("ollama:copy", source, destination),
            pull: (name: unknown, operationId: unknown) =>
                transport.invoke("ollama:pull", name, operationId),
            generate: (request: unknown, operationId: unknown) =>
                transport.invoke("ollama:generate", request, operationId),
            chat: (request: unknown, operationId: unknown) =>
                transport.invoke("ollama:chat", request, operationId),
            cancel: (operationId: unknown) => transport.invoke("ollama:cancel", operationId),
            onStreamProgress: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("ollama:streamProgress", forward);
                return () => transport.off("ollama:streamProgress", forward);
            },
            onRuntimeProgress: (listener: BridgeListener) => {
                const forward = (_event: unknown, payload: unknown): void => listener(payload);
                transport.on("ollama:runtimeProgress", forward);
                return () => transport.off("ollama:runtimeProgress", forward);
            },
        },

        runtimeSettings: {
            refreshExternal: (request: unknown) =>
                transport.invoke("runtimeSettings:refreshExternal", request),
            status: () => transport.invoke("runtimeSettings:status"),
            sources: () => transport.invoke("runtimeSettings:sources"),
            saveHomeAssistant: (input: unknown) =>
                transport.invoke("runtimeSettings:saveHomeAssistant", input),
            removeSource: (id: unknown) => transport.invoke("runtimeSettings:removeSource", id),
            statusHubRegister: () => transport.invoke("runtimeSettings:statusHubRegister"),
            statusHubSubmitEvidence: (evidence: unknown) =>
                transport.invoke("runtimeSettings:statusHubSubmitEvidence", evidence),
            statusHubPollReplies: (cursor: unknown) =>
                transport.invoke("runtimeSettings:statusHubPollReplies", cursor),
            statusHubConfirmReply: (replyId: unknown) =>
                transport.invoke("runtimeSettings:statusHubConfirmReply", replyId),
            statusHubCredentialPresence: () =>
                transport.invoke("runtimeSettings:statusHubCredentialPresence"),
            statusHubSaveCredential: (value: unknown) =>
                transport.invoke("runtimeSettings:statusHubSaveCredential", value),
            historyPresence: () => transport.invoke("runtimeSettings:historyPresence"),
            historySetCredential: (password: unknown) =>
                transport.invoke("runtimeSettings:historySetCredential", password),
            historyVerify: (password: unknown) =>
                transport.invoke("runtimeSettings:historyVerify", password),
            historyList: (input: unknown) => transport.invoke("runtimeSettings:historyList", input),
            historyAppend: (input: unknown) =>
                transport.invoke("runtimeSettings:historyAppend", input),
            historyExport: (format: unknown) =>
                transport.invoke("runtimeSettings:historyExport", format),
            historyDiff: (id: unknown) => transport.invoke("runtimeSettings:historyDiff", id),
            historyRestore: (id: unknown) => transport.invoke("runtimeSettings:historyRestore", id),
        },

        listBackupOwners: (accountId: unknown) => transport.invoke("backup:owners", { accountId }),
        listBackupRepositories: (accountId: unknown) =>
            transport.invoke("backup:repositories", { accountId }),
        createBackupRepository: (request: unknown) =>
            transport.invoke("backup:createRepository", request),
        inspectBackupRepository: (request: unknown) =>
            transport.invoke("backup:inspectRepository", request),
        inspectBackupSource: (request: unknown) =>
            transport.invoke("backup:inspectSource", request),
        listBackups: (request: unknown) => transport.invoke("backup:list", request),
        startBackup: (request: unknown) => transport.invoke("backup:start", request),
        cancelBackup: (backupId: unknown) => transport.invoke("backup:cancel", backupId),
        pauseBackup: (backupId: unknown) => transport.invoke("backup:pause", backupId),
        resumeBackup: (backupId: unknown) => transport.invoke("backup:resume", backupId),
        pausedBackups: () => transport.invoke("backup:pausedBackups"),
        activeBackups: () => transport.invoke("backup:active"),
        onBackupEvent: (listener: BridgeListener) => {
            const forward = (_event: unknown, payload: unknown): void => listener(payload);
            transport.on("backup:event", forward);
            return () => {
                transport.off("backup:event", forward);
            };
        },
    };

    // The one unchecked step, and the reason factory.test.ts exists. See the note above.
    return bridge as TBridge;
}
