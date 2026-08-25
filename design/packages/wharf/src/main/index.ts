import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Fleet, type Destination, type DeploymentRequest } from "./fleet.js";
import { stagingPathRefusal } from "@worldlens/dockhand";

/**
 * Wharf's main process.
 *
 * Small on purpose. Everything that decides anything lives in `fleet.ts`, which knows nothing
 * about Electron and is therefore testable without one; this file is the window, the menu-less
 * chrome, and the handful of channels between them.
 */

const directory = fileURLToPath(new URL(".", import.meta.url));

function fleet(): Fleet {
    return new Fleet({
        recordFile: join(app.getPath("userData"), "deployments.json"),
        // The user's own known_hosts, not one Wharf invents. A private store would mean a host
        // they have already verified in a terminal is unknown here, and being asked to trust a
        // key twice teaches people to click through the question.
        knownHostsFile: join(app.getPath("home"), ".ssh", "known_hosts"),
    });
}

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 720,
        minHeight: 520,
        show: false,
        backgroundColor: "#0B0E11",
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(directory, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    window.once("ready-to-show", () => window.show());
    void window.loadFile(join(directory, "../renderer/index.html"));
    return window;
}

function registerHandlers(): void {
    ipcMain.handle("wharf:probe", async (_event, destination: Destination) =>
        await fleet().probe(destination),
    );

    ipcMain.handle("wharf:plan", async (_event, destination: Destination, request: DeploymentRequest) =>
        await fleet().plan(destination, request),
    );

    ipcMain.handle(
        "wharf:deploy",
        async (_event, destination: Destination, request: DeploymentRequest) =>
            await fleet().deploy(destination, request),
    );

    ipcMain.handle("wharf:verifyPort", async (_event, destination: Destination, port: number) =>
        await fleet().verifyPort(destination, port),
    );

    /**
     * Browse for the folder a deployment will use.
     *
     * A native picker rather than a text field, and this is the entire reason it is a
     * separate channel. The renderer never sends a path it made up; it sends one a person
     * chose in their own file manager, which is what makes "did you mean this folder?" a
     * question with an answer.
     *
     * The refusal is applied here as well as in the plan. A picker that let somebody select
     * `C:\Windows` and only objected two screens later has already wasted the part of their
     * attention that was actually on the folder.
     */
    ipcMain.handle("wharf:chooseFolder", async () => {
        const chosen = await dialog.showOpenDialog({
            properties: ["openDirectory"],
            title: "Choose the folder this deployment should use",
        });
        const path = chosen.filePaths[0];
        if (chosen.canceled || path === undefined) return { ok: false, reason: null };
        const kind = process.platform === "win32" ? "windows" : "posix";
        const refusal = stagingPathRefusal(kind, path);
        if (refusal !== null) return { ok: false, reason: refusal };
        return { ok: true, path };
    });
}

void app.whenReady().then(() => {
    registerHandlers();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
