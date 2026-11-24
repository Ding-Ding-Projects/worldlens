/**
 * Which IPC sender is the application's own interface.
 *
 * The interface is served by the embedded loopback server (`http://127.0.0.1:<port>/`), not from
 * `file:`. Handlers that used to accept only `file:` senders therefore refused the real renderer
 * in every build, and "Generate and start" answered "Generation is restricted to the application
 * workspace." for every request.
 *
 * The check is exact rather than looser: the request must come from the one web contents the
 * main window was created with, from its main frame (not an embedded frame), while that frame is
 * showing the embedded server's origin. A recovery window, a sign-in window, an iframe or a page
 * navigated elsewhere are all refused.
 */

import type { IpcMainInvokeEvent } from "electron";

interface TrustedRenderer {
    readonly webContentsId: number;
    readonly origin: string;
}

let trustedRenderer: TrustedRenderer | null = null;

/** The URL's origin, or null when it is not a URL at all. */
function originOf(url: string): string | null {
    try {
        const origin = new URL(url).origin;
        return origin === "null" ? null : origin;
    } catch {
        return null;
    }
}

/**
 * Records the main window's web contents and the embedded server's base URL.
 *
 * Called once the main window exists. Until then no sender is trusted.
 */
export function trustAppRenderer(webContents: { readonly id: number }, baseUrl: string): void {
    const origin = originOf(baseUrl);
    trustedRenderer = origin === null ? null : { webContentsId: webContents.id, origin };
}

/** Forgets the trusted renderer; used by tests and when the main window closes. */
export function forgetAppRenderer(): void {
    trustedRenderer = null;
}

/** True only for the main frame of the application's own window at the embedded origin. */
export function isAppRendererSender(event: IpcMainInvokeEvent): boolean {
    const trusted = trustedRenderer;
    if (trusted === null) return false;
    const sender = event.sender as IpcMainInvokeEvent["sender"] | undefined;
    if (sender === undefined || sender === null || sender.isDestroyed()) return false;
    if (sender.id !== trusted.webContentsId) return false;
    if (event.senderFrame && event.senderFrame !== sender.mainFrame) return false;
    return originOf(sender.getURL()) === trusted.origin;
}
