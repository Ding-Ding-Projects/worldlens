/**
 * The two channels the BlueMap-source settings section asks on.
 *
 * They are deliberately two rather than one. `read` touches nothing but the local filesystem
 * and is what opening the settings screen calls, so the screen never waits on a network to draw
 * a fact it already has. `check` is what the Check now button calls, and it is the only one that
 * can be slow, rate limited, or refused.
 *
 * Neither rejects. A handler that throws reaches the renderer as an opaque `Error: Error
 * invoking remote method`, which is precisely the shape this section exists to avoid: it would
 * be indistinguishable from the app having no answer, when the honest answer is a sentence
 * saying why.
 */

import type { IpcMain } from "electron";

import { checkSourceReport, localSourceReport, type BlueMapSourceReport, type JarProvenanceOptions } from "./source.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const BLUEMAP_SOURCE_CHANNELS = ["bluemapSource:read", "bluemapSource:check"] as const;

export interface BlueMapSourceIpc {
    dispose(): void;
}

export type BlueMapSourceIpcOptions = JarProvenanceOptions;

function failed(reason: string): BlueMapSourceReport {
    return {
        jars: null,
        jarsReason: reason,
        upstream: null,
        upstreamReason: reason,
        checkedAt: new Date().toISOString(),
    };
}

export function registerBlueMapSourceHandlers(
    ipcMain: IpcMain,
    options: BlueMapSourceIpcOptions = {},
): BlueMapSourceIpc {
    ipcMain.handle("bluemapSource:read", (): BlueMapSourceReport => {
        try {
            return localSourceReport(options);
        } catch (error) {
            return failed(
                "The origin of the BlueMap jars could not be read: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    });

    ipcMain.handle("bluemapSource:check", async (): Promise<BlueMapSourceReport> => {
        try {
            return await checkSourceReport(options);
        } catch (error) {
            return failed(
                "The upstream check could not be run: " +
                    (error instanceof Error ? error.message : String(error)),
            );
        }
    });

    return {
        dispose: () => {
            for (const channel of BLUEMAP_SOURCE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
