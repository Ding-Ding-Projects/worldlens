import type { Article } from "../types.js";

export const renderControlsAndServerStartup: Article = {
    "id": "render-controls-and-server-startup",
    "title": "Rendering controls and server startup",
    "summary": "Adjust live scheduling, view saved terrain during rendering, close safely, choose WSL, find configuration fields and diagnose local server startup.",
    "category": "application",
    "status": "ported-unverified",
    "statusNote": "Native WSL, adaptive scheduling, close/reopen and server lifecycle evidence is recorded at ae1df096. The configuration presentation matrix, management-panel follow-up, final packaged delivery and installed update remain pending.",
    "sections": [
        {
            "id": "behaviour",
            "title": "Change speed without restarting a render",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "Open the active render panel and choose a speed. Local rendering applies operating-system process priority immediately; local container rendering changes its CPU quota. Worker count and Java thread priority remain launch-time settings. The result states what changed now and what requires a new render."
                    ]
                },
                {
                    "kind": "paragraph",
                    "content": [
                        "Dynamic mode is an optional per-render control. It samples CPU deltas, available memory, responsiveness and idle duration, with hysteresis and a cooldown. Measured pressure reduces scheduling; idle headroom restores normal scheduling. A manual choice disables dynamic mode. Completion and cancellation remove its timer. SSH and WSL live adjustment remain unavailable rather than pretending to adjust the launcher."
                    ]
                },
                {
                    "kind": "paragraph",
                    "content": [
                        "Dynamic scheduling is bounded to levels 1 through 3. The observed idle decision selected level 3, measured pressure selected level 1, and a manual level 2 choice disabled dynamic mode. These decisions adjust the live scheduling control; worker count still requires an explicit render restart."
                    ]
                }
            ]
        },
        {
            "id": "live-map",
            "title": "Watch the map while rendering",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "View live progress becomes available once map metadata and textures exist. It opens saved terrain without stopping the render. Visible tiles are refreshed while rendering, including previously missing tiles, without moving the camera. A newly opened panel retrieves the current preview state. Output verification still runs at completion."
                    ]
                }
            ]
        },
        {
            "id": "close-window",
            "title": "Close the window safely",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "Normal close keeps active rendering in the background. Reopen Worldlens through its tray icon or normal shortcut. If the tray cannot be created, the application minimizes instead. Stop explicitly before quitting early. Force termination, host shutdown and power interruption require the existing interrupted-render recovery; they do not promise uninterrupted work."
                    ]
                }
            ]
        },
        {
            "id": "wsl",
            "title": "Use an installed WSL distribution",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "Select WSL and an installed user distribution. Internal Docker distributions are excluded. Paths are translated through that distribution. If suitable Java is absent, verified Temurin is installed in the application's user-scoped Linux directory. The selected distribution remains attached to resume metadata. Cancellation checks the owned Linux process identity and waits for its actual exit; it never terminates the distribution. An unconfirmed stop retains the running state and permits retry."
                    ]
                }
            ]
        },
        {
            "id": "configuration",
            "title": "Find configuration controls",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "The configuration header identifies the real folder or unsaved defaults. Save-disabled explanations stay visible, and guidance follows the active tab. All eight tabs, advanced fields, search builders, serialization and raw-file recovery remain. Expand and collapse controls change group navigation without removing fields."
                    ]
                }
            ]
        },
        {
            "id": "failure-modes",
            "title": "Diagnose a local server that does not start",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "Start retains the local process across later Status, Console and Stop requests. Launch errors and early exits expose bounded diagnostics. Running-state refresh observes later exits; a successful process launch is distinct from a ready Minecraft server."
                    ]
                },
                {
                    "kind": "paragraph",
                    "content": [
                        "A missing Java executable inside a retired versioned Worldlens installation can be rediscovered from verified current bundled or provisioned Java. Custom Java paths retain their explicit selection. A missing server JAR requires a valid installed server file. An occupied port must be resolved by the owner; Worldlens does not silently select another port or stop another service. Existing EULA choices are preserved."
                    ]
                }
            ]
        },
        {
            "id": "security",
            "title": "Keep ownership and existing choices intact",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "Live controls address only the process or container owned by the current render. WSL setup is user-scoped and does not change system Java, PATH or the default distribution. Cancellation never terminates a distribution. Port conflicts, custom Java paths, existing EULA decisions and unrelated services remain under their owner’s control."
                    ]
                }
            ]
        },
        {
            "id": "verification",
            "title": "Verified scope",
            "blocks": [
                {
                    "kind": "paragraph",
                    "content": [
                        "At main ae1df096, integrated WSL checks passed 80 cases, adaptive checks passed 64, and server lifecycle checks passed 80. The exact Windows root build passed. A real Ubuntu render completed and promoted its map; a separate cancellation saved output and removed its owned Linux process. A real isolated Paper 26.3 fixture reached readiness, returned protocol 777 status and stopped with exit code 0. Actual dynamic idle/pressure decisions and manual override were observed. Normal close and reopen retained the same rendering process."
                    ]
                },
                {
                    "kind": "paragraph",
                    "content": [
                        "Configuration presentation matrix, a follow-up management-panel status correction, final packaged delivery and installed-update verification were still pending at this documentation checkpoint. This page does not claim those checks passed."
                    ]
                },
                {
                    "kind": "paragraph",
                    "content": [
                        "The Paper 26.3 fixture reported readiness after 18.425 seconds and returned real protocol 777 status before its graceful stop. Close and reopen observations retained the same process identifier. These are bounded observations of the tested source, not verification of a final release or installed update."
                    ]
                }
            ]
        }
    ],
    "suggested": [
        {
            "articleId": "live-render-speed",
            "reason": "Understand live scheduling and the explicit restart for worker settings."
        },
        {
            "articleId": "render-console",
            "reason": "Read progress and diagnostics alongside the live map."
        },
        {
            "articleId": "config-rich-controls",
            "reason": "Find the complete configuration controls and validation."
        },
        {
            "articleId": "embedded-server",
            "reason": "Distinguish the map-serving process from a local game server."
        }
    ],
    "sources": [
        {
            "label": "Reviewed workflow wiki source",
            "href": "https://github.com/Ding-Ding-Projects/worldlens/wiki/Render-controls-and-server-startup"
        },
        {
            "label": "docs/wsl-rendering.md",
            "href": "https://github.com/Ding-Ding-Projects/worldlens/blob/main/docs/wsl-rendering.md"
        }
    ]
};
