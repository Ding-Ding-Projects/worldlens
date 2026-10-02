/**
 * The isolated window that actually reads the downloader's access token.
 *
 * `ipc.ts` never accepts a token as an IPC argument - see its own doc comment for why: a
 * released shell and a released main process can be different versions of each other, and a
 * bridge that accepts a secret value is a bridge that can carry one to whatever the renderer
 * becomes. Instead `worlddownloader:openTokenIntake` opens *this* window: a separate, minimal,
 * JavaScript-free surface built the same shape `startup/recoveryWindow.ts` already uses for its
 * own window - a `data:` URL, no preload, no context bridge, `javascript: false`. The only way
 * information leaves this window is a navigation to a `worldlens-token-intake://` URL, read
 * directly off `will-navigate` before Electron ever loads it. The token exists in this
 * function's own memory and nowhere else: never as a value handed across
 * `ipcMain.handle`/`ipcRenderer.invoke` to the application's ordinary renderer, and never
 * through a preload or a context-bridge method that JavaScript in that renderer could call.
 *
 * This is the pattern the shared "Secrets and sensitive input" rule describes: a temporary,
 * single-purpose, least-privileged surface the user fills in directly, rather than a value
 * carried through the application's ordinary renderer and its ordinary IPC surface.
 */

import { BrowserWindow } from "electron";

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

const INTAKE_TITLE = "Worldlens: add an access token";

function intakeHtml(message: string | null): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action worldlens-token-intake:">
<title>${escapeHtml(INTAKE_TITLE)}</title><style>
:root{color-scheme:light dark;font:15px/1.5 "Segoe UI Variable",Segoe UI,sans-serif;background:#f7f9ff;color:#18202a}
*{box-sizing:border-box}body{margin:0;min-width:320px;padding:24px}
h1{font-size:1.1rem;margin:0 0 12px}
p{margin:0 0 16px;color:#3f4d5c}
label{display:block;font-weight:600;margin-bottom:6px}
input[type=password]{width:100%;font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #9aa7b4;margin-bottom:16px}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-bottom:8px}
button{font:inherit;min-height:40px;padding:0 18px;border-radius:999px;border:none;cursor:pointer}
button.primary{background:#005db7;color:#fff}
button.secondary{background:#d6e8ff;color:#00427d}
.notice{padding:10px 12px;border-radius:10px;background:#fff7df;border:1px solid #806000;color:#352a00;margin-bottom:16px}
@media(prefers-color-scheme:dark){:root{background:#0d1117;color:#e7edf5}input[type=password]{background:#0d1722;color:#e7edf5;border-color:#405267}button.secondary{background:#183b60;color:#c9e4ff}.notice{background:#342f1a;border-color:#d6ba5a;color:#fff1ba}}
</style></head><body>
<h1>${escapeHtml(INTAKE_TITLE)}</h1>
<p>The token is stored on this computer only, and this application's own window never sees it. Closing this window without saving changes nothing.</p>
${message === null ? "" : `<p class="notice" role="alert">${escapeHtml(message)}</p>`}
<form action="worldlens-token-intake://submit" method="GET">
<label for="token">Access token</label>
<input id="token" name="token" type="password" autofocus autocomplete="off">
<div class="actions"><button type="submit" class="primary">Save</button></div>
</form>
<form action="worldlens-token-intake://cancel" method="GET"><div class="actions"><button type="submit" class="secondary">Cancel</button></div></form>
</body></html>`;
}

export type TokenIntakeResult =
    | { readonly submitted: true; readonly token: string }
    | { readonly submitted: false };

export interface TokenIntakeOptions {
    readonly parent?: BrowserWindow | null;
    readonly message?: string | null;
}

/**
 * Opens the intake window and resolves once the user submits a token, cancels, or closes it.
 *
 * An empty submitted value resolves the same as a cancel: a click on "Save" with a blank field
 * is not a request to store an empty secret, it is a click that did not mean to change anything.
 */
export async function openTokenIntakeWindow(
    options: TokenIntakeOptions = {},
): Promise<TokenIntakeResult> {
    return new Promise((resolvePromise) => {
        let settled = false;
        const window = new BrowserWindow({
            title: INTAKE_TITLE,
            width: 460,
            height: 340,
            resizable: false,
            minimizable: false,
            maximizable: false,
            modal: options.parent != null,
            ...(options.parent != null ? { parent: options.parent } : {}),
            show: false,
            autoHideMenuBar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                javascript: false,
            },
        });

        const settle = (result: TokenIntakeResult): void => {
            if (settled) return;
            settled = true;
            resolvePromise(result);
            if (!window.isDestroyed()) window.close();
        };

        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event, url) => {
            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                return;
            }
            if (parsed.protocol !== "worldlens-token-intake:") return;
            event.preventDefault();
            if (parsed.hostname === "submit") {
                const token = parsed.searchParams.get("token") ?? "";
                settle(token === "" ? { submitted: false } : { submitted: true, token });
            } else {
                settle({ submitted: false });
            }
        });
        window.on("closed", () => settle({ submitted: false }));
        window.once("ready-to-show", () => window.show());
        void window.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(intakeHtml(options.message ?? null))}`,
        );
    });
}
