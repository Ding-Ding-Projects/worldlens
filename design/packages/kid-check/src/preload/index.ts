/**
 * The one bridge this harness exposes as `window.worldlens`.
 *
 * Two contracts, both real and both complete rather than partial:
 *
 *   - `schoolMode`: `read`/`enable`/`rename`/`disable`/`reset`, matching
 *     `isHostBridge()` in `design/packages/ui/src/components/setup/schoolMode.ts` exactly. That
 *     function checks that every one of the five is a real function before it will trust this as the
 *     *shared* record rather than fall back to the browser/test local-only adapter - three real
 *     methods and two missing ones would not degrade gracefully, it would simply fail the shape
 *     check and silently exercise a different code path than the one this harness exists to drive.
 *   - the five window-control methods `resolveWindowBridge()` in
 *     `design/packages/ui/src/components/shell/windowControls.ts` requires, flat on `worldlens`
 *     itself rather than nested (that module's own comment: "returns available: false ... a title
 *     bar with a working minimise and a close button that throws is worse than a title bar with no
 *     buttons"). Same all-or-nothing rule, same reason to implement every one of them rather than a
 *     convenient three.
 *
 * One more method is attached for a reason that only surfaced by actually running this harness
 * against the real renderer: `syncProfiles`. `design/packages/ui/src/stores/profiles.ts` calls
 * `window.worldlens?.syncProfiles(...)` at module load - unconditionally, on every boot, regardless
 * of Kid Mode or Adult Mode - to keep the embedded server's remote proxy in step with the profile
 * list. The `?.` there only guards `worldlens` itself; once this file makes `worldlens` a real
 * object, `syncProfiles` is called on it directly with no further guard, and a `window.worldlens`
 * that has every other method but this one throws `syncProfiles is not a function` before the very
 * first frame renders - confirmed by actually launching this harness and reading the page error.
 * A grep of the rest of `packages/ui/src` for the same unguarded `window.worldlens?.method(`
 * shape turned up no other call sites, which is what makes this the one bridge method Kid Mode
 * reaches purely by existing, rather than by a screen this harness's own capture set ever opens.
 *
 * What it does here: nothing, honestly. This harness never renders or hosts a remote map, so there
 * is no remote proxy for a synced profile list to update - resolving immediately without touching
 * anything is the accurate answer for a harness with no such subsystem, not a shortcut standing in
 * for one. Nothing else is attached: `typeof window.worldlens === "object"` therefore reads as true
 * elsewhere in the real app's own code (`App.vue`'s `canScanStructures`, for one), but nothing under
 * `kid/` reaches further than the two contracts above and this one no-op - see `main/index.ts`'s own
 * doc comment for why the render pipeline, GitHub accounts and the rest of the shipped preload's
 * enormous surface stay out of this harness on purpose.
 */
import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

interface SchoolModeSnapshot {
    readonly version: 1;
    readonly enabled: boolean;
    readonly name: string | null;
    readonly credentialConfigured: boolean;
}

type SchoolModeResult =
    | { readonly ok: true; readonly state: SchoolModeSnapshot }
    | {
          readonly ok: false;
          readonly code: string;
          readonly message: string;
          readonly state: SchoolModeSnapshot | null;
      };

interface SchoolModeBridge {
    read(): Promise<SchoolModeResult>;
    enable(request: unknown): Promise<SchoolModeResult>;
    rename(name: unknown): Promise<SchoolModeResult>;
    disable(credential: unknown): Promise<SchoolModeResult>;
    reset(): Promise<SchoolModeResult>;
}

const schoolMode: SchoolModeBridge = {
    read: () => ipcRenderer.invoke("schoolMode:read") as Promise<SchoolModeResult>,
    enable: (request) => ipcRenderer.invoke("schoolMode:enable", request) as Promise<SchoolModeResult>,
    rename: (name) => ipcRenderer.invoke("schoolMode:rename", name) as Promise<SchoolModeResult>,
    disable: (credential) => ipcRenderer.invoke("schoolMode:disable", credential) as Promise<SchoolModeResult>,
    reset: () => ipcRenderer.invoke("schoolMode:reset") as Promise<SchoolModeResult>,
};

contextBridge.exposeInMainWorld("worldlens", {
    minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleMaximizeWindow: (): Promise<boolean> =>
        ipcRenderer.invoke("window:toggleMaximize") as Promise<boolean>,
    closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close") as Promise<void>,
    isWindowMaximized: (): Promise<boolean> =>
        ipcRenderer.invoke("window:isMaximized") as Promise<boolean>,
    onWindowMaximizedChanged: (listener: (maximized: boolean) => void): (() => void) => {
        const forward = (_event: IpcRendererEvent, maximized: boolean): void => listener(maximized);
        ipcRenderer.on("window:maximizedChanged", forward);
        return () => ipcRenderer.off("window:maximizedChanged", forward);
    },
    // See this file's own doc comment: a real, honest no-op, called unconditionally by
    // `stores/profiles.ts` at boot, for a remote-proxy subsystem this harness does not have.
    syncProfiles: (
        _profiles: { id: string; name: string; baseUrl: string }[],
    ): Promise<void> => Promise.resolve(),
    schoolMode,
});
