import { app, Menu, Tray } from "electron";
import type { BrowserWindow } from "electron";
import { readAppSettingsState } from "./settings/store.js";

type CopyMode = "en" | "yue" | "bilingual";
export function backgroundRenderCopy(mode: CopyMode) {
    const text = (en: string, yue: string) =>
        mode === "yue" ? yue : mode === "bilingual" ? `${en} / ${yue}` : en;
    return {
        status: text("Worldlens is rendering in the background", "Worldlens 正喺背景繪圖"),
        open: text("Open Worldlens", "打開 Worldlens"),
        quit: text("Quit (available when rendering finishes)", "結束（繪圖完成後可用）"),
    };
}

/** Keep the owner process and its progress streams alive after a normal window close. */
export function protectBackgroundRender(
    window: BrowserWindow,
    options: { hasWork(): boolean; icon: string | null; dataDir: string },
): () => void {
    let tray: Tray | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let mode: CopyMode = "bilingual";
    const show = () => {
        if (window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
    };
    const update = async () => {
        const settings = await readAppSettingsState(options.dataDir);
        if (disposed || tray === null) return;
        const selected = settings.values.languageMode;
        mode =
            selected === "en" || selected === "yue" || selected === "bilingual"
                ? selected
                : "bilingual";
        const copy = backgroundRenderCopy(mode);
        tray.setToolTip(options.hasWork() ? copy.status : "Worldlens");
        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: copy.open, click: show },
                { type: "separator" },
                { label: copy.quit, enabled: !options.hasWork(), click: () => app.quit() },
            ]),
        );
    };
    const keepAlive = (event: { preventDefault(): void }) => {
        if (!options.hasWork()) return;
        event.preventDefault();
        try {
            if (tray === null) {
                if (options.icon === null) throw new Error("No tray icon is available");
                tray = new Tray(options.icon);
                tray.on("click", show);
                tray.on("double-click", show);
                void update().catch(() => {});
                timer = setInterval(() => {
                    void update().catch(() => {});
                }, 2000);
            }
            window.hide();
        } catch {
            // Retain a taskbar entry if the tray is unavailable; never strand a hidden job.
            window.minimize();
        }
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        app.removeListener("before-quit", keepAlive);
        window.removeListener("close", keepAlive);
        tray?.destroy();
        tray = null;
    };
    window.on("close", keepAlive);
    window.once("closed", dispose);
    app.on("before-quit", keepAlive);
    return dispose;
}
