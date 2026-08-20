/**
 * A plain Electron main process that boots the real `@worldlens/ui` renderer with nothing of its
 * own painted over it.
 *
 * "Plain" is the load-bearing word in the brief this package answers. Every serious bug found
 * in Kid Mode this session - the sticker ledger nothing ever called, the first tap into Work doing
 * nothing, a settings row missing its kid label - passed the whole unit suite, because a component
 * test injects its own dependency and proves the screen, never the seam between screens. Catching
 * that class of defect needs the real renderer, mounted the way the shipped app mounts it, driven
 * the way a child actually would - not a second, simplified app that happens to render similar
 * pixels. So this file is deliberately a *trimmed* copy of `packages/app/src/main/index.ts`'s own
 * shape (embedded loopback server, `StaticHandler` over the built UI bundle, a frameless window with
 * the app's own drawn title bar) rather than a reinvention of it, keeping only what Kid Mode's own
 * surfaces can ever reach:
 *
 *   - the embedded HTTP server that serves `packages/ui/dist` exactly the way the shipped app does,
 *     because the renderer's Content-Security-Policy (`script-src 'self'`, no `unsafe-eval`) refuses
 *     to boot from a `file://` load the same way it always has;
 *   - the four window-control IPC channels, so the title bar the real app draws has real buttons
 *     rather than a bare bar with nothing in it (`resolveWindowBridge()` in
 *     `components/shell/windowControls.ts` is all-or-nothing: five methods or none, never a partial
 *     set that renders a broken button);
 *   - a real, minimal `schoolMode` bridge (see `schoolModeStore.ts`), because "force the grown-up
 *     gate into each `credentialConfigured` state" is a named requirement of this harness and the
 *     scout report is explicit that a no-bridge host can only ever reach the unlocked branch;
 *   - a CSP header wide enough for the fonts the real UI bundle actually ships (`hardenSession`
 *     below) and a real, honest `syncProfiles` no-op - both found by launching this harness against
 *     the real renderer and reading what broke, not predicted in advance. See each one's own doc
 *     comment for the exact failure it fixes.
 *
 * Everything else the shipped app wires up - rendering, downloads, GitHub accounts, config editing,
 * the whole `packages/app/src/main/` surface read while building this file - is left off on purpose.
 * Kid Mode is documented, by the people who built it, as presentation-only: it reshapes catalogues
 * and job screens the adult shell already owns. That claim held for everything actually driven
 * through `kid/`'s own screens - a no-bridge host reaches all five kid destinations without error -
 * but it was not quite true of `window.worldlens` itself: `stores/profiles.ts` calls
 * `window.worldlens?.syncProfiles(...)` unconditionally at module load, before Kid Mode or Adult
 * Mode is even decided, and once this file makes `worldlens` a real object that unguarded call needed
 * a real answer (see `preload/index.ts`'s own doc comment). With that one method in place, wiring the
 * render pipeline, the GitHub CLI broker or the config editor here would still be answering a
 * question nobody asked, adding a hundred lines this harness would then have to keep in step with
 * the real app forever - so those stay out, on purpose.
 */
import { app, BrowserWindow, ipcMain, session } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpServer } from "@worldlens/server/dist/http/HttpServer.js";
import { StaticHandler } from "@worldlens/server/dist/http/StaticHandler.js";
import { KidCheckSchoolModeStore } from "./schoolModeStore.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * A dedicated profile, never the shipped app's own.
 *
 * `--user-data-dir` is honoured explicitly (Electron does not apply a bare command-line switch to
 * `app.getPath("userData")` on its own; the shipped app reads the same switch the same way in
 * `packages/app/src/main/index.ts`) so the capture harness can hand each Playwright run a fresh
 * temporary profile, exactly as `packages/app/test/screenshots.spec.ts` already does for its own
 * Electron launches. Without an explicit override, every manual `pnpm run start` still gets its own
 * named folder rather than silently reusing - or corrupting - a real Worldlens installation's
 * `localStorage` and IPC-backed state on the same machine.
 */
const explicitUserData = app.commandLine.getSwitchValue("user-data-dir").trim();
app.setName("Worldlens Kid Check");
app.setPath(
    "userData",
    explicitUserData.length > 0
        ? explicitUserData
        : path.join(app.getPath("appData"), "Worldlens Kid Check"),
);

/** Built UI bundle (`packages/ui/dist`), resolved the same way `packages/app` resolves it. */
function resolveUiRoot(): string {
    const candidate = path.resolve(dirname, "../../../ui/dist");
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    throw new Error(
        `The built UI bundle was not found at ${candidate}. Kid Check serves the same ` +
            "packages/ui/dist the shipped app does; build it first with " +
            "`pnpm --filter @worldlens/ui run build`.",
    );
}

let embeddedServerUrl: Promise<string> | null = null;

/**
 * Loopback only, an ephemeral port, and no bearer-token hardening.
 *
 * The shipped app's own embedded server (`packages/app/src/main/index.ts`) additionally signs every
 * request with a random `Authorization: Bearer` token, because it is a real installed product whose
 * local server must stay private to the renderer it spawned for the life of an install that can run
 * for months. Kid Check is neither: it is a throwaway harness process that exists for the length of
 * one capture run or one manual `pnpm run start`, its server is bound to `127.0.0.1` on a port the
 * operating system picks fresh every launch, and nothing about its lifetime makes that extra layer
 * load-bearing here. Binding to loopback and using port 0 - so no fixed port ever needs reserving,
 * and two runs on one machine never collide - is kept; the bearer token is the one piece of the real
 * app's hardening this harness does not reproduce, and this comment says so rather than leaving the
 * omission to look like an oversight.
 */
async function startEmbeddedServer(): Promise<string> {
    embeddedServerUrl ??= (async () => {
        const server = new HttpServer({ host: "127.0.0.1", port: 0 });
        server.addHandler(new StaticHandler(resolveUiRoot()));
        const address = await server.listen();
        app.on("will-quit", () => void server.close());
        return `http://127.0.0.1:${String(address.port)}`;
    })();
    return embeddedServerUrl;
}

let sessionHardened = false;

/**
 * Replaces `StaticHandler`'s own baseline CSP with the shipped app's own, wide enough for fonts.
 *
 * `StaticHandler.ts` (`@worldlens/server`) answers every request with a fixed, conservative CSP that
 * does not include `data:` in `font-src`. That is fine for the shipped app's font files, which are
 * served as ordinary same-origin assets - but this harness hit it for real: Vite's production build
 * of `packages/ui` inlines its smaller `@fontsource/roboto` subsets as `data:font/woff2;base64,...`
 * URIs directly in the generated CSS rather than as separate files, and `StaticHandler`'s bare
 * `font-src 'self'` silently refused every one of them, logging a CSP violation per font and leaving
 * every kid surface rendering in whatever fallback font the platform substituted.
 * `packages/app/src/main/index.ts`'s own `hardenSession()` carries the identical replacement policy
 * below, but simply assigning `headers["Content-Security-Policy"] = [...]` over a spread of
 * `details.responseHeaders` - the shape both files started with - does not actually replace anything:
 * `StaticHandler` sends the header name lower-case, `details.responseHeaders` preserves that casing
 * as its object key, and a plain-string JS object key is case-sensitive, so the assignment adds a
 * *second*, differently-cased `Content-Security-Policy` entry rather than overwriting the first.
 * Chromium then receives two same-named headers and enforces their **intersection** - which is CSP's
 * documented behaviour for repeated headers - so the old, narrower `font-src 'self'` kept winning even
 * with this override installed. Caught only by actually launching this harness and reading the
 * "Refused to load the font" console errors; every existing casing of the header name is deleted
 * before the replacement is set, below, so exactly one `Content-Security-Policy` header ever reaches
 * the renderer.
 */
function hardenSession(baseUrl: string): void {
    if (sessionHardened) return;
    sessionHardened = true;
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        if (details.url.startsWith(baseUrl) && details.resourceType === "mainFrame") {
            // Case-insensitive delete: see this function's own doc comment for why leaving the
            // original `content-security-policy` key in place would leave two headers in force.
            for (const key of Object.keys(headers)) {
                if (key.toLowerCase() === "content-security-policy") delete headers[key];
            }
            headers["Content-Security-Policy"] = [
                "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; " +
                    "font-src 'self' data:; " +
                    "connect-src 'self'; " +
                    "worker-src 'self' blob:; " +
                    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            ];
        }
        callback({ responseHeaders: headers });
    });
}

/**
 * The one real bridge this harness offers the renderer: the shared restricted-mode record.
 *
 * Held on `globalThis` under a name namespaced to this package, rather than only as a module-level
 * variable, so the Node-side drive script can reach the exact same instance through
 * `electronApp.evaluate()` - the identical instrumentation-on-`globalThis` pattern
 * `packages/app/test/networkGuard.ts` already uses for its own capture-time network guard. That is
 * what lets `test/drive.ts` seed "a grown-up already set a shared code, then turned the mode back
 * off" without a UI path to do it from inside Kid Mode itself (setting one up lives in Adult Mode's
 * Settings, which this harness does not drive - see `schoolModeStore.ts`'s own doc comment).
 */
const schoolMode = new KidCheckSchoolModeStore();
(globalThis as { __kidCheckSchoolMode?: KidCheckSchoolModeStore }).__kidCheckSchoolMode = schoolMode;

let ipcRegistered = false;

function registerIpc(): void {
    if (ipcRegistered) return;
    ipcRegistered = true;

    const publish = <T extends { readonly ok: boolean }>(result: T): T => {
        if (result.ok) {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send("schoolMode:changed", result);
            }
        }
        return result;
    };
    ipcMain.handle("schoolMode:read", () => schoolMode.read());
    ipcMain.handle("schoolMode:enable", async (_event, request: unknown) =>
        publish(await schoolMode.enable(request)),
    );
    ipcMain.handle("schoolMode:rename", (_event, name: unknown) => publish(schoolMode.rename(name)));
    ipcMain.handle("schoolMode:verify", (_event, credential: unknown) => schoolMode.verify(credential));
    ipcMain.handle("schoolMode:disable", async (_event, credential: unknown) =>
        publish(await schoolMode.disable(credential)),
    );
    ipcMain.handle("schoolMode:reset", () => publish(schoolMode.reset()));

    // The window is frameless (see `createWindow` below), so these four channels are the only way
    // it can change state at all - without them the title bar's own drawn buttons would sit there
    // doing nothing, which is exactly the "decorative UI" defect this project's own rules forbid
    // everywhere else. Channel names match the shipped app's `window:*` contract byte for byte,
    // because `AppTitleBar.vue` calls them by name through the shared `windowControls.ts` module.
    const focused = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
        BrowserWindow.fromWebContents(event.sender);

    ipcMain.handle("window:minimize", (event) => {
        focused(event)?.minimize();
    });
    ipcMain.handle("window:toggleMaximize", (event) => {
        const target = focused(event);
        if (target === null) return false;
        if (target.isMaximized()) target.unmaximize();
        else target.maximize();
        return target.isMaximized();
    });
    ipcMain.handle("window:close", (event) => {
        focused(event)?.close();
    });
    ipcMain.handle("window:isMaximized", (event) => focused(event)?.isMaximized() ?? false);
}

async function createWindow(): Promise<void> {
    registerIpc();
    const baseUrl = await startEmbeddedServer();
    hardenSession(baseUrl);

    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        // No floor, deliberately: the real app's own window carries a documented 800px minimum
        // (see `packages/app/test/screenshots.spec.ts`'s own note on it), which exists to keep its
        // adult shell usable and would clamp exactly the phone-sized capture the brief asks this
        // harness to be able to take. Kid Mode's own layout floor (`--wl-kid-target-min: 64px` in
        // `kid/kidTheme.ts`) is a CSS contract on the content, not a constraint this window needs
        // to enforce a second time.
        minWidth: 0,
        minHeight: 0,
        frame: false,
        backgroundColor: "#072A4B",
        webPreferences: {
            preload: path.join(dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    window.on("maximize", () => window.webContents.send("window:maximizedChanged", true));
    window.on("unmaximize", () => window.webContents.send("window:maximizedChanged", false));

    await window.loadURL(baseUrl);
}

void app.whenReady().then(() => {
    void createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
});

app.on("window-all-closed", () => {
    // Windows and Linux quit when the last window closes; this harness ships Windows-only per the
    // project's own scope, so there is no macOS "stay running with no window" branch to preserve.
    app.quit();
});
