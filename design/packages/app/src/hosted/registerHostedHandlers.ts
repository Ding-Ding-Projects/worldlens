import type { IpcMain } from "electron";
import { registerEulaHandlers } from "../main/eula/ipc.js";
import { registerGalleryHandlers } from "../main/gallery/ipc.js";
import { registerHistoryHandlers } from "../main/history/ipc.js";
import { registerStructureHandlers } from "../main/structures/discoverIpc.js";
import { registerWorldHandlers } from "../main/world/index.js";
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
export interface HostedHandlerOptions {
    /**
     * Where this deployment keeps its own state.
     *
     * Not one of the operator's mounts. Settings, history and the gallery index are the
     * application's own records rather than the user's content, and putting them inside a
     * folder somebody mounted read-only would be a silent failure to persist anything.
     */
    readonly dataDirectory: string;
}

export function registerHostedHandlers(
    context: HostedContext,
    options: HostedHandlerOptions,
): void {
    const ipcMain = context.ipcMain as unknown as IpcMain;

    // Its own version, which the About surface asks for on every load.
    ipcMain.handle("app:version", () => process.env["WORLDLENS_VERSION"] ?? "0.0.0-hosted");

    registerEulaHandlers(ipcMain, { dataDirectory: () => options.dataDirectory });
    registerGalleryHandlers(ipcMain, options.dataDirectory);
    registerHistoryHandlers(ipcMain, { dataDir: options.dataDirectory });
    registerStructureHandlers(ipcMain);
    registerWorldHandlers(ipcMain, { userDataDirectory: options.dataDirectory });
}
