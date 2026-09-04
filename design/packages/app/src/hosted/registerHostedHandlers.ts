import type { IpcMain } from "electron";
import { registerEulaHandlers } from "../main/eula/ipc.js";
import { registerGalleryHandlers } from "../main/gallery/ipc.js";
import { registerHistoryHandlers } from "../main/history/ipc.js";
import { registerStructureHandlers } from "../main/structures/discoverIpc.js";
import { registerWorldHandlers } from "../main/world/index.js";
import { browseMount } from "./mountBrowse.js";
import type { HostedContext } from "./serve.js";

/**
 * Wires the desktop's own feature modules into a container.
 *
 * ## The cast, and why there is exactly one of it
 *
 * Electron's `IpcMain` extends `EventEmitter`, so satisfying it structurally would mean
 * implementing a dozen members no registrar ever touches. Every registrar uses `handle`,
 * `removeHandler` and occasionally `on`, all of which {@link HostedIpcMain} implements
 * honestly. So the object is cast once, here, rather than each module being changed to accept
 * a narrower type it would then have to keep in step with Electron's.
 *
 * What makes the cast safe is not the type system. It is that these modules import
 * `IpcMain` as a **type** and never touch Electron at run time - which is true of 68 of the
 * 79 files under `src/main` that mention it - plus `registerHostedHandlers.test.ts`, which
 * registers them for real against the shim and asserts the channels they claim actually
 * answer. A module that started importing Electron at run time would fail that test rather
 * than failing inside a container.
 *
 * ## Why this list is shorter than the profile's "available" list
 *
 * The capability profile says what a hosted deployment *may* answer. This says what it
 * currently *does*. The two are deliberately separate, and the gap is deliberately visible:
 * a channel that is permitted but unwired answers "no handler is registered", which is an
 * honest and diagnosable state, rather than the profile quietly narrowing itself to whatever
 * happened to be wired and thereby hiding the gap.
 *
 * The modules here are the ones whose dependencies are a data directory and nothing more.
 * The rest need orchestrators, resolvers and runtime probes that the desktop builds during
 * startup, and each is its own piece of wiring rather than a line in a list.
 */
/** What this deployment will tell anyone who opens it about itself. */
export interface HostedPosture {
    readonly mounts: readonly { readonly id: string; readonly label: string; readonly writable: boolean }[];
    readonly capabilities: readonly string[];
    readonly passwordSet: boolean;
}

export interface HostedHandlerOptions {
    /**
     * Where this deployment keeps its own state.
     *
     * Not one of the operator's mounts. Settings, history and the gallery index are the
     * application's own records rather than the user's content, and putting them inside a
     * folder somebody mounted read-only would be a silent failure to persist anything.
     */
    readonly dataDirectory: string;
    /**
     * What to say about this deployment.
     *
     * Shown on the About surface, because these are facts a person looking at a hosted copy
     * has no other way to learn: which folders it can reach, what the operator granted, and
     * whether anything is standing between the port and them. Somebody handed a URL by a
     * colleague can otherwise not tell a locked deployment from an open one.
     */
    readonly posture: HostedPosture;
}

export function registerHostedHandlers(
    context: HostedContext,
    options: HostedHandlerOptions,
): void {
    const ipcMain = context.ipcMain as unknown as IpcMain;

    // Its own version, which the About surface asks for on every load.
    ipcMain.handle("app:version", () => process.env["WORLDLENS_VERSION"] ?? "0.0.0-hosted");

    // Registered here for the first time. The channel is permitted in BRIDGE_CHANNELS and the
    // desktop has always answered it, so a hosted deployment returned "no handler is
    // registered" and the About surface had nothing to show -- which is issue #169's point
    // exactly: an image that cannot say which commit it came from is indistinguishable from a
    // current one.
    //
    // The constants come from the hosted bundle's own define block, which did not exist until
    // now either, so both halves had to land together: without the define they would have
    // reached dist/hosted/index.js as free identifiers and thrown on first read.
    ipcMain.handle("app:buildProvenance", () => ({
        version: process.env["WORLDLENS_VERSION"] ?? "0.0.0-hosted",
        // typeof, not a bare read: a module the runner treats as external is never
        // transformed, and then the identifier throws rather than being null.
        builtAt: typeof __WORLDLENS_BUILT_AT__ === "string" ? __WORLDLENS_BUILT_AT__ : null,
        sourceCommit:
            typeof __WORLDLENS_SOURCE_COMMIT__ === "string" ? __WORLDLENS_SOURCE_COMMIT__ : null,
    }));

    // Deliberately carries no path. Which folders exist is the operator's business to state;
    // where they are on their disk is not something a browser tab needs, and a path in an
    // interface ends up in a screenshot in an issue.
    ipcMain.handle("app:deployment", () => ({
        hosted: true,
        mounts: options.posture.mounts,
        capabilities: options.posture.capabilities,
        passwordSet: options.posture.passwordSet,
    }));

    // The folder picker for a deployment with no desktop. `capabilityProfile.ts` refuses
    // `dialog:*` and `config:pick*` with the words "choose from the folders the operator
    // mounted"; until these two, that sentence named a replacement that did not exist, which
    // reads as a feature somebody failed to find rather than as a refusal.
    //
    // Deliberately carries the paths that `app:deployment` deliberately withholds. That is
    // not a contradiction: the posture surface is a summary anybody who opens the tab sees,
    // and a path there ends up in a screenshot in an issue. These answer a person who is
    // actively navigating and has to be told where they are to choose correctly.
    ipcMain.handle("mounts:list", () =>
        context.mounts.list().map((root) => ({
            id: root.id,
            label: root.label,
            writable: root.writable,
        })),
    );

    ipcMain.handle("mounts:browse", async (_event, request: unknown) => {
        const { rootId, path } = (request ?? {}) as { rootId?: unknown; path?: unknown };
        if (typeof rootId !== "string")
            return { ok: false, reason: "No mounted folder was named." };
        return await browseMount(
            context.mounts,
            rootId,
            typeof path === "string" ? path : null,
        );
    });

    registerEulaHandlers(ipcMain, { dataDirectory: () => options.dataDirectory });
    registerGalleryHandlers(ipcMain, options.dataDirectory);
    registerHistoryHandlers(ipcMain, { dataDir: options.dataDirectory });
    registerStructureHandlers(ipcMain);
    registerWorldHandlers(ipcMain, { userDataDirectory: options.dataDirectory });
}
