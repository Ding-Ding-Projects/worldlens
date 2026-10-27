# Screenshots

Commit `157a721927644846b2a7196b12da515664cc2a36`, run `linux-container-cdp-2026-10-27`, capture mode `remote`.

Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering.

## firstrun-1-welcome

![Worldlens first-run welcome step with language and tone controls.](firstrun-1-welcome.png)

First-run setup, the welcome step, with the three language modes and a separate funny level for each language. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the first-run dialog rather than showing the whole window.

## firstrun-1-welcome-window

![Worldlens first-run welcome dialog shown in the complete application window.](firstrun-1-welcome-window.png)

First-run setup as it appears over the whole application window on a fresh profile. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## firstrun-2-eula

![Worldlens first-run licence step with document provenance and search.](firstrun-2-eula.png)

First-run setup, the Minecraft licence step, with the document provenance and its anchored search. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the first-run dialog rather than showing the whole window.

## firstrun-2-consent

![Worldlens first-run download-consent step before either answer is chosen.](firstrun-2-consent.png)

First-run setup, the Minecraft files step, which asks once whether the application may download from Mojang and says what each answer means. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the first-run dialog rather than showing the whole window.

## firstrun-3-storage

![Worldlens first-run storage step with the rendered-map destination field.](firstrun-3-storage.png)

First-run setup, the map storage step, which asks where rendered maps should be written. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the first-run dialog rather than showing the whole window.

## run-location

![Worldlens run-location surface naming the exact local runtime path.](run-location.png)

The render-location choice: local, Docker on this computer, and another machine over SSH, with Docker's real daemon state and the route that will actually be used. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the render-location card rather than showing the whole window.

## chrome-titlebar

![Worldlens custom title bar with product mark, title, and window controls.](chrome-titlebar.png)

The application's own Material title bar, the whole width of the window, with no operating system caption bar above it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the title bar rather than showing the whole window.

## chrome-titlebar-window-buttons

![Worldlens custom title-bar window controls at their normal size.](chrome-titlebar-window-buttons.png)

The minimize, maximize and close buttons the application draws for itself, because the window is frameless. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the window buttons rather than showing the whole window.

## rendered-map

![Worldlens viewing a locally rendered map at a deterministic camera position.](rendered-map.png)

The Map destination with a world rendered by upstream BlueMap's Java engine and served to the application over loopback: the map itself filling the window, the application rail down the left, and the viewer's control bar with its live coordinates above it. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## chrome-control-bar

![Worldlens map control bar with the loaded-map navigation controls.](chrome-control-bar.png)

The viewer control bar: the menu button, the map, marker and player lists, the view and day-night switches, the live position inputs and the compass. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. This image is cropped to the control bar rather than showing the whole window.

## chrome-app-rail

![Worldlens application rail with Home, Map, Work, search, notices, and settings.](chrome-app-rail.png)

The application rail: the three destinations - Home, Map and Work - each with its visible label, the Work badge counting open jobs, and a footer holding search, notifications and settings. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the application rail rather than showing the whole window.

## dimsum-surprise

![Worldlens startup dim sum surprise with the dish name and image.](dimsum-surprise.png)

The dim sum startup surprise: a non-blocking, auto-dismissing corner snackbar naming one dish in both languages. Forced to win its draw by a screenshot-harness-only localStorage override that also supplies the dish, so the capture never has to reach the public dish catalog; production code never writes this key and draws the real one-in-ten chance every other launch. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## shell-1280x800

![Worldlens Home shell at the standard 1280 by 800 CSS viewport.](shell-1280x800.png)

The application shell at 1280x800. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-1920x1080

![Worldlens Home shell at a 1920 by 1080 CSS viewport.](shell-1920x1080.png)

The application shell at 1920x1080. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-1024x768

![Worldlens Home shell reflowed at a 1024 by 768 CSS viewport.](shell-1024x768.png)

The application shell at 1024x768. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-800x600-narrow

![Worldlens Home shell at the narrowest supported 800 by 600 viewport.](shell-800x600-narrow.png)

The application shell at 800x600-narrow. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-scale-1x

![Worldlens shell at 100 percent display scale.](shell-scale-1x.png)

The application shell at 100% display scale. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-scale-1_25x

![Worldlens shell at 125 percent display scale.](shell-scale-1_25x.png)

The application shell at 125% display scale. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-scale-1_5x

![Worldlens shell at 150 percent display scale.](shell-scale-1_5x.png)

The application shell at 150% display scale. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## shell-scale-2x

![Worldlens shell at 200 percent display scale.](shell-scale-2x.png)

The application shell at 200% display scale. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## issue-105-popup-edge

![Worldlens map popup retained inside the lower-right viewport edge.](issue-105-popup-edge.png)

The block-coordinate popup opened from a real map click near the lower-right viewport edge, with every coordinate row retained inside the map. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above. Measured popup 132×62 pixels inside CSS2D bounds 800×600 pixels.

## menu-root

![Worldlens main menu root over a real locally served map.](menu-root.png)

The main menu, listing maps, markers, settings and info, then the camera and screenshot actions. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## menu-maps

![Worldlens Maps menu over a real locally served map.](menu-maps.png)

The maps menu, listing the maps the active profile serves. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## menu-settings

![Worldlens viewer settings menu over a real locally served map.](menu-settings.png)

The viewer settings menu inside the side sheet, with its own search bar at the top. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## menu-info

![Worldlens information menu over a real locally served map.](menu-info.png)

The info page, with the application version at the foot of it. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## menu-markers

![Worldlens Marker menu over a real locally served map.](menu-markers.png)

The marker menu, showing the marker sets of the map that is loaded. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## marker-studio

![Worldlens marker studio opened from a loaded map's marker controls.](marker-studio.png)

The marker studio, opened from the marker menu's own "Make your own markers" button: the panel that lets somebody add markers of their own, kept in a set separate from anything a server or a marker file supplies. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## menu-search

![Worldlens menu search filtering real menu commands.](menu-search.png)

The settings menu's own search bar, filtering the menu down to the settings that match what was typed. Real Electron app, remote mode, browsing https://ding-ding-projects.github.io/worldlens-bayville-ui-public-20260819-01/map/. The tiles belong to that server and were rendered by whoever runs it. This capture comes from a job that is started by hand, not from a push. It proves the viewer port, the reverse proxy and the token-gated embedded server, and nothing about rendering. In this image, the map area shows tiles fetched from the remote server named above.

## project-canvas

![Worldlens project canvas showing the world, dimension, identity, options, storage and render nodes wired in build order.](project-canvas.png)

The project canvas: one world feeding a dimension, identity, and the options and storage that fork off it, ending at the render node.. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## project-canvas-search

![Worldlens project canvas with a node search active, marking the matching node while the rest of the graph stays visible.](project-canvas-search.png)

Searching the canvas marks the matching node rather than hiding the others, so the project keeps its shape while a person looks for one box.. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## backups

![Worldlens backup screen with source, destination, and recovery actions.](backups.png)

Backing a world or a rendered map up to GitHub release assets: what to pack, where it goes, and the notice saying nobody is signed in to GitHub on this computer yet. The screen states why this uses release assets rather than Git LFS, and the pointer format it writes. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## config-screen

![Worldlens options editor showing defaults before a configuration folder is opened.](config-screen.png)

The options editor as it opens. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-core

![Worldlens options editor Core tab with application-wide rendering settings.](config-tab-core.png)

The options editor, the "Core" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-maps

![Worldlens options editor Maps tab with the selected map settings.](config-tab-maps.png)

The options editor, the "Maps" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-storages

![Worldlens options editor Storages tab with local and database choices.](config-tab-storages.png)

The options editor, the "Storages" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-web-app

![Worldlens options editor Web app tab with visitor-facing map settings.](config-tab-web-app.png)

The options editor, the "Web app" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-web-server

![Worldlens options editor Web server tab with bind and port settings.](config-tab-web-server.png)

The options editor, the "Web server" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-server-plugin

![Worldlens options editor Server plugin tab with live-server settings.](config-tab-server-plugin.png)

The options editor, the "Server plugin" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-run

![Worldlens options editor Run tab with the exact execution choices.](config-tab-run.png)

The options editor, the "Run" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-tab-history

![Worldlens options editor History tab with revisions and restore actions.](config-tab-history.png)

The options editor, the "History" tab, with the settings that tab owns. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-search

![Worldlens options editor search showing results from multiple tabs.](config-search.png)

The options editor's search, which reaches every setting on all of the tabs at once and says which tab each result lives on. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible. The editor is showing BlueMap's own generated defaults, because the throwaway profile this run uses has no config folder on disk, and it says so in the notice across the top. Every setting, tab and control in the image is real, live and savable; what is absent is a folder read off this machine.

## config-regex-builder

![Worldlens full regex builder anchored to the options editor search.](config-regex-builder.png)

The regex builder anchored to the options editor's search bar. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the regex builder rather than showing the whole window.

## config-history

![Worldlens configuration history with revision search and restore controls.](config-history.png)

The config folder's version-history tab, including its honest empty state when this throwaway profile has no folder attached. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the version-history panel rather than showing the whole window.

## projects-screen

![Worldlens Projects screen with discovered worlds and configured projects.](projects-screen.png)

The Projects screen, showing the real empty state and the path into a new render project. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Projects screen rather than showing the whole window.

## ci-render-screen

![Worldlens GitHub Actions rendering screen before a run is started.](ci-render-screen.png)

The CI-render screen, with its honest repository fields and the preflight route that refuses before uploading anything. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the CI-render screen rather than showing the whole window.

## renders-screen-empty

![Worldlens Renders screen in its truthful empty state.](renders-screen-empty.png)

The Renders job in its real fresh-profile empty state, with its search, bulk controls and direct route back to Make a map. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Renders job rather than showing the whole window.

## local-preview-screen

![Worldlens local preview screen before a preview server is started.](local-preview-screen.png)

Watch it live, the local preview job, with its real no-render-yet state and the network disclosure before any server starts. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the local preview job rather than showing the whole window.

## offline-docs-index

![Worldlens offline documentation browser article index.](offline-docs-index.png)

The complete offline documentation index bundled into the installed application, grouped by category with its local search. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the offline documentation browser rather than showing the whole window.

## authenticator-screen

![Worldlens built-in authenticator with local entries and live code controls.](authenticator-screen.png)

The built-in authenticator, on its own tab in the Work destination, with its honest empty state on a throwaway profile that has never registered a TOTP account. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the authenticator screen rather than showing the whole window.

## authenticator-registration

![Worldlens authenticator registration surface before a secret is created.](authenticator-registration.png)

Authenticator registration before any secret is entered: the link and manual routes, the local-only fields, and the blocked registration action. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Authenticator registration card rather than showing the whole window.

## lock-list-screen

![Worldlens toy-lock list with search, state, and bulk management controls.](lock-list-screen.png)

The lock list, enumerating every toy lock on this computer, with its honest empty state on a throwaway profile that has never locked an element. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the lock list rather than showing the whole window.

## support-tickets-screen

![Worldlens local Support Tickets recovery desk with its no-network disclosure.](support-tickets-screen.png)

The recovery desk, dressed as a support desk: a ticket form and the plain, unstyled line stating that nothing is ever sent anywhere. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Support Tickets screen rather than showing the whole window.

## support-tickets-local-response

![Worldlens Support Tickets local response naming the application-data folder.](support-tickets-local-response.png)

A locally created Support Ticket after submission: its local ticket number, fictional priority, triaged status, canned response and the exact application-data recovery route. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Support Tickets screen rather than showing the whole window.

## structures-screen

![Worldlens Structures page with its saved structures collection.](structures-screen.png)

The Structures screen, listing every structure file a world scan found and, once rendered, the render for each one - with its honest empty state on a throwaway profile with no world scanned yet. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Structures screen rather than showing the whole window.

## drop-render-zone

![Worldlens structure drop zone with browse and render actions.](drop-render-zone.png)

The drop-render zone at the top of the Structures screen: drag a structure or schematic file straight onto it, or use the ordinary button beside it that does exactly the same thing. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the drop-render zone rather than showing the whole window.

## chunker-screen

![Worldlens local file converter with its categorized adapter catalogue.](chunker-screen.png)

The world conversion screen, on its own tab in the Work destination: the source and destination fields and the four execution routes a conversion can be run through. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the conversion screen rather than showing the whole window.

## converter-target-step

![Worldlens local converter target step with categorized format choices.](converter-target-step.png)

Convert, target edition: the real edition, version, output-folder and execution-route controls. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Convert job rather than showing the whole window.

## converter-trim-step

![Worldlens local converter trim step with bounded range controls.](converter-trim-step.png)

Convert, trim and dimensions: the boundary and dimension-mapping controls before any conversion runs. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Convert job rather than showing the whole window.

## converter-block-mapping-step

![Worldlens local converter block-mapping step with explicit substitutions.](converter-block-mapping-step.png)

Convert, block mapping: the searchable override list and the explicit source-to-replacement editor. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Convert job rather than showing the whole window.

## converter-regex-builder

![Worldlens full regex builder anchored to the converter catalogue search.](converter-regex-builder.png)

The full regex builder anchored to Convert's block-mapping search, with a real pattern and live sample matches. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the converter regex builder rather than showing the whole window.

## converter-world-settings-step

![Worldlens converter world-settings step with validated output controls.](converter-world-settings-step.png)

Convert, world settings: the name, seed, spawn coordinates and game-rule controls. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Convert job rather than showing the whole window.

## converter-review-step

![Worldlens converter review step with loss disclosures and destination summary.](converter-review-step.png)

Convert, review: the exact lossy consequences and the disabled start action before a valid source and destination are supplied. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Convert job rather than showing the whole window.

## ollama-screen

![Worldlens Ollama manager showing the locally detected runtime state.](ollama-screen.png)

The Ollama suite manager, on its own tab in the Work destination, on a capture profile with no Ollama runtime installed: the honest missing-runtime warning and the guidance that goes with it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Ollama screen rather than showing the whole window.

## ollama-runtime-recovery

![Worldlens Ollama recovery surface for a missing or stopped local runtime.](ollama-runtime-recovery.png)

Ollama's missing-or-stopped runtime recovery surface, naming the detected state and the exact in-app recheck route. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Ollama runtime recovery alert rather than showing the whole window.

## ollama-model-store

![Worldlens Ollama Model Store with its verified local or cached catalogue state.](ollama-model-store.png)

The Ollama Model Store with its model-and-tag search, installed and hardware-fit filters, refresh state and honest no-runtime controls. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Ollama Model Store rather than showing the whole window.

## ollama-model-store-regex-builder

![Worldlens full regex builder anchored to the Ollama Model Store search.](ollama-model-store-regex-builder.png)

The full regex builder anchored to the Ollama Model Store's exhaustive model-and-tag search. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Model Store regex builder rather than showing the whole window.

## ollama-pull-cart

![Worldlens Ollama batch-pull cart with storage and network disclosures.](ollama-pull-cart.png)

The Ollama pull cart in its honest empty state, stating plainly that it is a local download queue with no price, checkout, account or payment. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Ollama pull cart rather than showing the whole window.

## ollama-chat-disabled

![Worldlens Ollama chat with controls disabled and the exact missing condition named.](ollama-chat-disabled.png)

Ollama chat with its session search, prompt and model controls visible but honestly disabled until a local runtime is ready. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Ollama chat surface rather than showing the whole window.

## palette

![Worldlens command palette with destination, command, and setting results.](palette.png)

The command palette, opened with Ctrl+Shift+F: every command, setting and destination the application has, in one searchable list. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## palette-search

![Worldlens command palette filtered by its own search field.](palette-search.png)

The command palette filtered by a search, with a setting row that carries its own live control - changing it here changes the real setting, the same way changing it on its own page would. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the command palette rather than showing the whole window.

## tab-strip

![Worldlens browser-style tab strip with pinned, grouped, and ordinary tabs.](tab-strip.png)

The browser-style tab strip inside the Work destination: the jobs that have actually been opened rather than every destination the application has, their seeded groups, the new-tab menu, the overflow control that appears only once something stops fitting, and the tab finder's own magnifier. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the tab strip rather than showing the whole window.

## tab-context-menu

![Worldlens tab context menu with its filter field and keyboard shortcuts.](tab-context-menu.png)

Right-clicking a tab: its own management commands, with the keyboard-reachable filter every context menu in this application carries and the working shortcut printed beside each item that has one. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the tab's context menu rather than showing the whole window.

## tab-finder

![Worldlens tab finder listing open tabs, groups, locations, and pinned state.](tab-finder.png)

The tab finder: search this strip, search every open tab in every window, search groups by name, and both text bulk closes, each with its own anchored regex builder. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the tab finder rather than showing the whole window.

## tab-bulk-close-preview

![Worldlens bulk-close preview naming the exact tabs a text query would close.](tab-bulk-close-preview.png)

Close tabs containing text, previewing exactly which tabs the pattern matches and what closing them would do, before anything closes. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the bulk-close panel rather than showing the whole window.

## lock-wizard

![Worldlens toy-lock wizard anchored to the exact selected element.](lock-wizard.png)

The anchored per-element lock wizard for the application title bar: password or authenticator choice, one credential for this element, unlock duration, toy-lock disclosure and recovery route. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the per-element lock wizard rather than showing the whole window.

## appearance-context-menu

![Worldlens element context menu with the Edit appearance action.](appearance-context-menu.png)

A tab's own context menu: its management commands, then "Edit tab appearance..." with its working Ctrl+Shift+F10 shortcut printed beside it, and the menu's own searchable filter at the top. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the tab's context menu rather than showing the whole window.

## appearance-typography

![Worldlens typography editor with family, size, style, spacing, and preview controls.](appearance-typography.png)

The appearance editor's Text tab: every installed and bundled font with its own live preview, size, weight, style and the rest of the Word-depth typography controls, editing this tab's own label live. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the appearance editor rather than showing the whole window.

## appearance-surface

![Worldlens anchored appearance editor targeting the selected surface.](appearance-surface.png)

The appearance editor's Surface tab: background and border colour, border style, radius, spacing, shadow and opacity for this tab, each with a reset of its own. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the appearance editor rather than showing the whole window.

## infinite-colour-picker

![Worldlens continuous colour picker with translated numeric colour spaces.](infinite-colour-picker.png)

The infinite colour picker: a continuous field rather than a swatch grid, translated across named colours, hex, RGB, HSL, HSV, HWB, CIELAB/LCH, OKLab/OKLCH and CMYK, with a contrast readout. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the infinite colour picker rather than showing the whole window.

## appearance-presets

![Worldlens appearance editor showing shipped and user-saved presets.](appearance-presets.png)

The appearance editor's Presets tab: shipped themes, user presets, import and export, and the reset route for the exact element being edited. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the appearance editor rather than showing the whole window.

## wizard-1-world

![Worldlens map wizard asking for a world folder on its first step.](wizard-1-world.png)

The make-a-map wizard on its first step, asking for the world folder, with its five steps listed across the top. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-ssh-world-source

![Worldlens map wizard configured for an SSH world source.](wizard-ssh-world-source.png)

The SSH world-source checklist inside the first wizard step: saved key-only machines, explicit host-key review, remote-world inspection, and a local fetch destination. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the SSH world-source checklist rather than showing the whole window.

## wizard-docker-world-source-390x844-200pct

![Worldlens local Docker world-source wizard at 390 by 844 and 200 percent scale.](wizard-docker-world-source-390x844-200pct.png)

The local Docker world-source checklist at a 390 by 844 CSS-pixel viewport and 200% device scale: Docker's real state, actual containers and volumes, a browsed local destination, live-copy risk acknowledgement, and honest progress. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one. Captured through Chromium's own DevTools surface so the image uses the same exact CSS viewport and device scale as the metrics. The metrics record zero horizontal overflow, outer or internal control clipping, or undersized interactive targets.

## wizard-1-world-read

![Worldlens map wizard after validating a local world and its dimensions.](wizard-1-world-read.png)

The wizard's first step after the world folder has been read: it names the dimensions it found and how many region files each of them holds. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-2-name-and-dimension

![Worldlens map wizard naming the map and selecting a dimension.](wizard-2-name-and-dimension.png)

The make-a-map wizard on its "Name and dimension" step. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-3-options

![Worldlens map wizard options step with searchable rendering controls.](wizard-3-options.png)

The make-a-map wizard on its "Options" step. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-4-where-it-goes

![Worldlens map wizard storage step with destination and storage settings.](wizard-4-where-it-goes.png)

The make-a-map wizard on its "Where it goes" step. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-5-review

![Worldlens map wizard review step listing every decision before rendering.](wizard-5-review.png)

The make-a-map wizard on its "Review" step. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## wizard-release-downloads

![Worldlens release-download panel before it lists any remote assets.](wizard-release-downloads.png)

The release downloads panel, which offers to fetch a world from a GitHub release for somebody with no Minecraft save on this machine. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the release downloads panel rather than showing the whole window.

## kid-home

![Worldlens Kid Mode Home screen with its simplified catalogue choices.](kid-home.png)

Kid Mode's Home, and the default view of a fresh install: kidMode.ts's own KEY_ENABLED flag defaults to true, so this - not the adult shell - is the very first screen this application ever shows anybody. The GO hero card, the five catalogues drawn as picture-first 'lands', what the app is doing right now, and the maps and servers this computer already knows about. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state. Kid Mode always paints from its own fixed 'kid' Vuetify theme (KID_SCHEME in kidTheme.ts) rather than the light/dark/contrast scheme chosen in Adult Mode's own Settings - App.vue's own watcher snaps the live theme name straight back to 'kid' the instant Kid Mode is active, so there is no separate light/dark/contrast variant of any Kid Mode surface to capture.

## kid-rail

![Worldlens Kid Mode navigation rail with Home, Explore, and Work routes.](kid-rail.png)

Kid Mode's own rail, cropped from the Home capture above: Home, Explore, My jobs and Stickers as big picture-first destinations with the level badge and XP bar in the status header above them, then Find, Messages and the grown-up gate as small footer actions - the same three-destination-plus-footer shape the adult rail has, per KidRail.vue's own doc comment. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Kid Mode rail rather than showing the whole window.

## kid-catalogue

![Worldlens Kid Mode feature catalogue with large guided choices.](kid-catalogue.png)

One of Kid Mode's five catalogues, opened as a 'land' from Kid Home: every feature it holds as its own picture-first row with the real shipped blurb underneath, grouped under headings, with the same search field and anchored regex builder every other catalogue page in this application carries (ConfigSearchField, reused rather than hand-rolled, per KidCataloguePage.vue's own doc comment). Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-job-strip

![Worldlens Kid Mode Work strip with open jobs and guided actions.](kid-job-strip.png)

Kid Mode's Work view: WorkPane re-hosted rather than reimplemented, per KidJobStrip.vue's own doc comment - the exact same tab strip, seeded groups, pinning, drag reorder and overflow as Adult Mode's own Work destination, wearing Kid Mode's own labels (applied through WorkPane's existing renamePage) and a 64px-minimum chip floor rather than the adult shell's 44px one. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-stickers

![Worldlens Kid Mode sticker book before any sticker is earned.](kid-stickers.png)

The sticker book on a fresh capture profile: every sticker this build knows about, each naming the real feature it is earned from and doubling as a second route into that feature's catalogue rather than a dead trophy shelf, none of them won yet - a fresh profile has completed nothing, and the book says so plainly (KidStickerBook.vue's own doc comment: 'a sticker that has not been won says so plainly; nothing is hidden or teased'). Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-gate-no-credential

![Worldlens grown-up gate when no local unlock credential is configured.](kid-gate-no-credential.png)

The grown-up gate in its no-credential-configured state, which is the state every fresh install actually starts in: nobody has ever set the shared restricted-mode code on this computer, so KidGrownUpGate.vue lets one press go straight through to Adult Mode rather than demanding a code that was never set - the mechanism its own doc comment says exists precisely so 'Kid Mode must never become a one-way door'. The honesty line at the bottom names this as a user-experience lock, not a security lock, and names the real reset route rather than gesturing at it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-funny-1

![Worldlens Kid Mode Home using fully serious level-one copy.](kid-home-funny-1.png)

Kid Home with the English funny-level slider seeded to 1 (fully serious) and reloaded so it takes effect (worldlens.language.funny.en, the persisted key setupI18n.ts reads): the hero heading and blurb read at their plainest voiced level - compare against the funny-level-5 capture immediately below, the identical screen at the opposite extreme. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-funny-5

![Worldlens Kid Mode Home using maximum level-five playful copy.](kid-home-funny-5.png)

Kid Home with the English funny-level slider seeded to 5 (maximum playfulness) and reloaded so it takes effect: the same hero heading and blurb as the funny-level-1 capture above, at the opposite end of the same slider - the voice changes, the facts (what the GO button does, what each land opens) never do. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-yue

![Worldlens Kid Mode Home in playful Hong Kong-style Cantonese.](kid-home-yue.png)

Kid Home with the language mode seeded to Cantonese (worldlens.language.mode = "yue") and reloaded so it takes effect. This is the first capture in this whole harness's history to exercise the language mode on any surface, and it found a real, honest gap rather than a clean result: the rail, the hero card, the status header and both panel headings genuinely render Cantonese (kidCopy.ts's own KID_VOICED strings, driven by the same setLanguageMode this file's language-mode seed writes to) - but the five catalogue land labels below the hero stay in English ('Make a map', 'Your maps', 'Show people', 'Keep it safe', 'Buttons & help') at every language mode. Confirmed by reading the source rather than guessed at: KID_CATALOGUE_LABELS in kidLabels.ts is a plain hardcoded object with no t() call at all, and the shipped catalogue titles underneath them (catalogue.make.title etc. in catalogues.ts) have no Cantonese entry anywhere in this application's copy catalogue (packages/ui/src/copy/surfaces) to translate to - confirmed by searching the whole design/ tree for those exact key strings and finding only their own English-fallback definition. This is not a kid-mode-only gap either: the adult Home Catalogues page reads the identical CATALOGUES array through the identical resolveCatalogues(), so it renders the same English-only land titles in Cantonese mode too. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-catalogue-yue

![Worldlens Kid Mode catalogue in playful Hong Kong-style Cantonese.](kid-catalogue-yue.png)

The first Kid catalogue in Cantonese, reached by the same position-based land click the five-catalogue captures above use rather than an English-text selector - the language mode is still seeded to "yue" from the Kid Home capture immediately above this one, since neither this step nor the click that opened this page reloaded the page in between. Only the rail, the level badge and the search field's own placeholder are actually Cantonese in this picture: the catalogue's own heading, its group headings ('Finding a world', 'Setting up a render', ...) and every feature row's name and blurb render in English regardless of language mode, because CataloguePage.vue and KidCataloguePage.vue both source that copy from catalogues.ts's own nameKey/blurbKey/groupKey strings and no Cantonese message answers any of them - the same real gap the Kid Home Cantonese capture above found on this screen's own land labels, extended to the catalogue's entire body. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-bilingual

![Worldlens Kid Mode Home in compact English and Cantonese bilingual mode.](kid-home-bilingual.png)

Kid Home with the language mode seeded to bilingual and reloaded so it takes effect: the rail, hero, status header and both panel headings genuinely pair English with Cantonese underneath it, exactly as designed. The same five catalogue land labels that stayed English-only in the Cantonese-only capture above stay English-only here too, with no Cantonese line underneath them at all rather than a shortened or missing pairing - the same untranslated-key gap, just visibly obvious in bilingual mode specifically because every other label on this screen does carry a second line and these five plainly do not. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-catalogue-bilingual

![Worldlens Kid Mode catalogue in compact English and Cantonese bilingual mode.](kid-catalogue-bilingual.png)

The first Kid catalogue in bilingual mode, reached the same position-based way as every other catalogue capture in this section. Its heading, group headings and every feature row stay English-only here too, with no Cantonese line beneath any of them - the same untranslated catalogue-copy gap the Cantonese capture immediately above this one already found on this same page. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-360

![Worldlens Kid Mode Home at a 360 by 800 CSS viewport and 200 percent scale.](kid-home-360.png)

Kid Home at 360 by 800 CSS pixels, the narrowest width COMPACT_PHONE_VIEWPORTS names - the same matrix the redesigned adult shell and Kid Home's own 390px capture above already prove themselves against, extended down to the width where the adult shell's own compact captures start. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state. Captured through Chromium's DevTools surface at the exact CSS viewport, the same technique the 390px Kid Home capture above and the redesigned adult shell's own compact captures use.

## kid-home-414

![Worldlens Kid Mode Home at a 414 by 896 CSS viewport and 200 percent scale.](kid-home-414.png)

Kid Home at 414 by 896 CSS pixels, the widest of the three phone widths COMPACT_PHONE_VIEWPORTS names, alongside the 360px capture above and the 390px capture further up this section. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state. Captured through Chromium's DevTools surface at the exact CSS viewport, the same technique used throughout this section.

## kid-home-scale-1x

![Worldlens Kid Mode Home at 100 percent display scale.](kid-home-scale-1x.png)

Kid Home at 100% display scale, the same SCALES matrix 'captures the shell at every supported display scale' already proves for the adult shell. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-scale-1_25x

![Worldlens Kid Mode Home at 125 percent display scale.](kid-home-scale-1_25x.png)

Kid Home at 125% display scale, the same SCALES matrix 'captures the shell at every supported display scale' already proves for the adult shell. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-scale-1_5x

![Worldlens Kid Mode Home at 150 percent display scale.](kid-home-scale-1_5x.png)

Kid Home at 150% display scale, the same SCALES matrix 'captures the shell at every supported display scale' already proves for the adult shell. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-home-scale-2x

![Worldlens Kid Mode Home at 200 percent display scale.](kid-home-scale-2x.png)

Kid Home at 200% display scale, the same SCALES matrix 'captures the shell at every supported display scale' already proves for the adult shell. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-stickers-won

![Worldlens Kid Mode sticker book with a clearly labelled seeded earned sticker.](kid-stickers-won.png)

The sticker book with two of its eight stickers won and 70 XP: 'Won!' at full opacity on 'Map maker' and 'World finder', 'Not yet' and dimmed on the other six - the difference the always-empty 'Sticker book' capture above cannot show. This state was SEEDED directly into bluemap-kid-progress, the exact localStorage key useKidProgress.ts persists to and reads back on mount (JSON-parsed by that module's own defensive read(), the identical seed-then-reload mechanism every other planted value in this file uses), NOT earned through a real completion event: reaching 'first-map' for real needs the vendored Java render pipeline with an accepted Mojang download consent, and reaching 'world-finder' for real needs driving the make-a-world wizard's own guide end to end, both of which this harness avoids for the same reasons the 'Celebration' skip below gives in full. No celebration toast accompanies this picture, and none ever could from this route: KidCelebration.vue's celebrate() is called only from KidShell.vue's own award(), at the moment a real completion event fires, never derived from the ledger a component merely reads on mount - so seeding the ledger populates the book without, and could never also, stage a celebration. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## map-empty-state

![Worldlens Map destination before a rendered map is available.](map-empty-state.png)

The Map destination with no profile selected: the honest no-map message and the direct route into Make a map. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Map destination's empty state rather than showing the whole window.

## work-destination

![Worldlens Work destination with its real job tabs and active page.](work-destination.png)

The complete Work destination: its browser-style job strip and the active real job surface beneath it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Work destination rather than showing the whole window.

## theme-light

![Worldlens application shell using its light colour theme.](theme-light.png)

The application shell in the light theme. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## theme-dark

![Worldlens application shell using its dark colour theme.](theme-dark.png)

The application shell in the dark theme. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## theme-contrast

![Worldlens application shell using its high-contrast appearance.](theme-contrast.png)

The application shell in the contrast theme. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## settings-drawer

![Worldlens settings drawer with its browser-style section tabs.](settings-drawer.png)

The application settings, opened from the rail footer over whichever destination was showing. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded, so the application is showing the wizard for making one.

## settings-section-mojang-download-consent

![Worldlens settings section showing the recorded Mojang download-consent choice.](settings-section-mojang-download-consent.png)

The "Mojang download consent" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-java-runtime

![Worldlens settings section showing the Java runtime in effect.](settings-section-java-runtime.png)

The "Java runtime" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-map-storage-directory

![Worldlens settings section for the rendered-map storage directory.](settings-section-map-storage-directory.png)

The "Where rendered maps go" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-world-folder

![Worldlens settings section for the active Minecraft world folder.](settings-section-world-folder.png)

The "World folder" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-github-account

![Worldlens GitHub account settings section in its signed-out state.](settings-section-github-account.png)

The "GitHub account" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-language-and-tone

![Worldlens language and tone settings with both independent funny-level controls.](settings-section-language-and-tone.png)

The "Language and tone" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-display

![Worldlens display settings for theme, density, motion, and scale.](settings-section-display.png)

The "Display and ease of use" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-kid-mode

![Worldlens Kid Mode settings with shared mode and unlock status.](settings-section-kid-mode.png)

The "Kid Mode and Adult Mode" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-surface-placement

![Worldlens surface-placement settings for tabs, panels, and overlays.](settings-section-surface-placement.png)

The "Where the panels sit" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-render-memory

![Worldlens render-memory settings with the real bounded controls.](settings-section-render-memory.png)

The "Render memory" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-download-concurrency

![Worldlens download-concurrency settings with the current bounded value.](settings-section-download-concurrency.png)

The "Download concurrency" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-notification-duration

![Worldlens notification-duration settings with their current value.](settings-section-notification-duration.png)

The "Notification duration" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-system-dependencies

![Worldlens system dependency settings naming bundled and detected runtimes.](settings-section-system-dependencies.png)

The "System dependencies" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-bluemap-engine

![Worldlens BlueMap engine settings with the active local engine source.](settings-section-bluemap-engine.png)

The "BlueMap engine" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-updates

![Worldlens automatic-update settings with current and feed status.](settings-section-updates.png)

The "Updates" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-vocabulary

![Worldlens personal-vocabulary settings section before a file is selected.](settings-section-vocabulary.png)

The "Personal vocabulary" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-app-logo

![Worldlens app-logo settings with presets, local upload, preview, and reset.](settings-section-app-logo.png)

The "App logo" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-history

![Worldlens local-history settings with retention and export controls.](settings-section-history.png)

The "Version history" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-section-diagnostics

![Worldlens diagnostics settings with privacy-safe evidence controls.](settings-section-diagnostics.png)

The "Diagnostics" settings section, on its own browser-style tab inside the settings panel. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-search

![Worldlens settings drawer filtered by labels, descriptions, and current values.](settings-search.png)

The settings search, filtering the panel to the settings whose name, explanation or current value matches what was typed, and saying which tab each result lives on. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-regex-builder

![Worldlens full regex builder anchored to the settings search field.](settings-regex-builder.png)

The regex builder anchored to the settings search, showing the pattern, the supported flags, the guided token palette and the live matches against the text on screen. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the regex builder rather than showing the whole window.

## settings-regex-builder-invalid

![Worldlens settings regex builder showing an invalid pattern without losing input.](settings-regex-builder-invalid.png)

The settings regex builder's real invalid-pattern state: the exact syntax problem and the honest zero-match result stay inside the anchored surface. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the regex builder rather than showing the whole window.

## settings-vocabulary

![Worldlens personal-vocabulary JSON settings row before a file is selected.](settings-vocabulary.png)

The personal-vocabulary settings row, present in its own settings section whether or not a file has ever been uploaded: its honest no-file state on a throwaway capture profile. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## settings-notification-duration

![Worldlens notification-duration setting with its live bounded control.](settings-notification-duration.png)

The notification duration row in settings: how long an informational or success message stays in the corner before it dismisses itself, with the level this capture profile shipped on. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## pages-publishing-screen

![Worldlens GitHub Pages publishing screen with repository and owner choices.](pages-publishing-screen.png)

The Pages publishing screen: the searchable render list, the repository fields, and the check that reports what publishing would push before anything is pushed. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the Pages publishing screen rather than showing the whole window.

## offline-docs-search

![Worldlens offline documentation browser with a real search result set.](offline-docs-search.png)

The offline documentation browser filtered by real article titles and body text, with no network request. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the offline documentation browser rather than showing the whole window.

## offline-docs-article

![Worldlens offline documentation browser rendering a complete feature article.](offline-docs-article.png)

One bundled documentation article rendered as formatted, sanitized prose inside the application rather than raw Markdown. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the offline documentation browser rather than showing the whole window.

## browser-extension-screen

![Worldlens browser-extension downloads page in its honest empty state.](browser-extension-screen.png)

The browser-extension downloads screen, with its honest empty state on a throwaway profile where the extension has never handed a download over. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the browser extension downloads screen rather than showing the whole window.

## eula-viewer

![Worldlens licence viewer with provenance, search, and an anchored regex builder.](eula-viewer.png)

The EULA viewer embedded in Settings, with the bundled or cached licence copy, its provenance and its searchable section tabs. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the EULA viewer rather than showing the whole window.

## notifications-rail-bell

![Worldlens notification centre opened from the application rail notice control.](notifications-rail-bell.png)

The live Notification bell in the application rail, carrying its unread badge before it opens the history anchored beside it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the rail notification bell rather than showing the whole window.

## notifications-history

![Worldlens notification history with search, filters, selection, and bulk actions.](notifications-history.png)

The notification centre, so a message that has already faded away is still readable, searchable and filterable by level. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the notification centre rather than showing the whole window.

## kid-mode-settings-row

![Worldlens Kid Mode settings row with the shared mode state.](kid-mode-settings-row.png)

The Kid Mode settings row, reached the moment this run first leaves Kid Mode through its own grown-up gate: the Kid Mode/Adult Mode choice, showing Adult Mode selected because this capture is looking at the row from inside Adult Mode; the child's name; the celebration and sound switches; and the label-style choice. The accessible name of every control keeps the real feature name at all three label styles, per this row's own doc comment. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the settings panel rather than showing the whole window.

## kid-home-390

![Worldlens Kid Mode Home at a 390 by 844 CSS viewport and 200 percent scale.](kid-home-390.png)

Kid Home at 390 by 844 CSS pixels - the same phone width the redesigned adult shell proves itself at (COMPACT_PHONE_VIEWPORTS): the rail, hero, five lands and both panels holding their layout rather than being narrowed to a scroll of unreadable pieces, at Kid Mode's own 64px-minimum touch targets. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state. Captured through Chromium's DevTools surface at the exact CSS viewport, the same technique 'captures the redesigned Home shell at compact phone viewports' uses for the adult shell.

## kid-catalogue-maps

![Worldlens Kid Mode Your maps catalogue page.](kid-catalogue-maps.png)

Kid Mode's "Your maps" land (the shipped feature name is "Your maps"; position 1 of 5 on Home) - one of the five catalogues, alongside the first one the existing 'Kid catalogue page' capture already proves above: every feature it holds as its own picture-first row with the real shipped blurb underneath, the same search field and anchored regex builder every catalogue page in this application carries. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-catalogue-share

![Worldlens Kid Mode Show people catalogue page.](kid-catalogue-share.png)

Kid Mode's "Show people" land (the shipped feature name is "Share a map"; position 2 of 5 on Home) - one of the five catalogues, alongside the first one the existing 'Kid catalogue page' capture already proves above: every feature it holds as its own picture-first row with the real shipped blurb underneath, the same search field and anchored regex builder every catalogue page in this application carries. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-catalogue-copy

![Worldlens Kid Mode Keep it safe catalogue page.](kid-catalogue-copy.png)

Kid Mode's "Keep it safe" land (the shipped feature name is "Keep a copy"; position 3 of 5 on Home) - one of the five catalogues, alongside the first one the existing 'Kid catalogue page' capture already proves above: every feature it holds as its own picture-first row with the real shipped blurb underneath, the same search field and anchored regex builder every catalogue page in this application carries. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-catalogue-setup

![Worldlens Kid Mode Buttons and help catalogue page.](kid-catalogue-setup.png)

Kid Mode's "Buttons & help" land (the shipped feature name is "Set up & help"; position 4 of 5 on Home) - one of the five catalogues, alongside the first one the existing 'Kid catalogue page' capture already proves above: every feature it holds as its own picture-first row with the real shipped blurb underneath, the same search field and anchored regex builder every catalogue page in this application carries. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-explore

![Worldlens Kid Mode Explore destination with a real map or honest empty state.](kid-explore.png)

Kid Mode's Explore view: the one screen in this whole shell where the real map canvas shows through its own chrome instead of being covered by it (`.wl-kid__map`'s own doc comment in KidShell.vue names this as the deliberate exception to every other kid-mode view painting an opaque surface over the entire window) - the free-flight controls, zoom buttons, control bar and main menu the #map slot forwards, over the viewer's own empty state, since this run served no rendered map to load. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, no map is loaded; the map area is the app's empty state.

## kid-find-palette

![Worldlens Kid Mode Find palette with accessible feature results.](kid-find-palette.png)

The command palette, opened from Kid Mode's own rail 'Find anything' footer button rather than the Ctrl+Shift+F shortcut the adult shell's own 'Command palette' capture uses: KidShell.vue's openPalette() routes through the real 'Set up & help' catalogue feature setup.how-the-interface-behaves.command-palette and activates it exactly as any other feature target would, rather than a fabricated row invented for this button - so this is the same global palette every other capture in this file already proves, reached the way a child actually presses it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. In this image, an opaque surface fills the window, so none of the map behind it is visible.

## kid-messages

![Worldlens Kid Mode Messages surface with notice history and actions.](kid-messages.png)

The notification centre, opened from Kid Mode's own rail 'Messages' footer button through the same 'Set up & help' catalogue route Find above uses (setup.how-the-interface-behaves.notification-centre). NotificationPanel.vue anchors this overlay to the adult rail's own bell button by CSS selector, and that button does not exist while Kid Mode's own tree is mounted in its place - this capture is the honest, driven proof of whatever Vuetify's v-menu genuinely does when its declared activator selector resolves to nothing, not an assumption about it. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the notifications panel rather than showing the whole window.

## kid-catalogue-regex-builder

![Worldlens full regex builder anchored to Kid Mode catalogue search.](kid-catalogue-regex-builder.png)

The anchored regex builder, opened from a Kid catalogue's own search field - ConfigSearchField, the identical component and the identical 'Open the regex builder' control the adult settings search already proves above, reused rather than hand-rolled per KidCataloguePage.vue's own doc comment: the pattern, the supported flags, the guided token palette and the live matches against this catalogue's own rows. Real Electron app with no map loaded: WORLDLENS_CAPTURE_MAP was not set, so this run had no rendered map to serve. The map area is the app's empty state, not a rendering failure. Nothing was fetched from any network. This image is cropped to the regex builder rather than showing the whole window.

## Not captured

Nothing was substituted for these. They are listed so the gap is visible.

- **Home screen**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Home catalogues**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Home catalogue page**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogues (360 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogue page (360 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogues (390 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogue page (390 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogues (414 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Compact Home catalogue page (414 CSS px)**: the screen it photographed was replaced by HomeDashboard in 8f417d73 (2026-08-22); nothing renders the old component. See issue #171.
- **Settings menu**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-settings-menu.txt, beside the images)
- **Marker menu**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-marker-menu.txt, beside the images)
- **Marker studio**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-marker-studio.txt, beside the images)
- **Menu search bar**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-menu-search-bar.txt, beside the images)
- **Reset settings super confirmation**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-reset-settings-super-confirmation.txt, beside the images)
- **Marker search and sort controls**: the map this run captured carries no markers, so the marker menu has no marker section and its search and sort controls are not on screen to photograph
- **Profile manager**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-profile-manager.txt, beside the images)
- **Settings drawer**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-settings-drawer.txt, beside the images)
- **Settings sections**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-settings-sections.txt, beside the images)
- **GitHub account, signed in**: signing in needs a real GitHub account and a real device-flow round trip to github.com, and the offline guard refuses every request that is not loopback; the signed-out state of the account section is real and is the one captured
- **Update banner while downloading**: the banner is driven by a real installed-build update feed and appears only after that external state occurs. The always-reachable Updates settings tab is captured with the exact status this build reports; no update IPC or feed response is mocked
- **Update banner ready to restart**: the banner is driven by a real installed-build update feed and appears only after that external state occurs. The always-reachable Updates settings tab is captured with the exact status this build reports; no update IPC or feed response is mocked
- **Update banner failure recovery**: the banner is driven by a real installed-build update feed and appears only after that external state occurs. The always-reachable Updates settings tab is captured with the exact status this build reports; no update IPC or feed response is mocked
- **Options editor delete gate**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-options-editor-delete-gate.txt, beside the images)
- **Options editor save plan**: the Save control is disabled in this state, and its tooltip says why; the dialog that lists the files a save would write therefore has no door to open through, and nothing was substituted for it
- **Renders screen**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-renders-screen.txt, beside the images)
- **World repository screen**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-world-repository-screen.txt, beside the images)
- **Memory console**: the hand-written job registry marks this job unavailable unless the memory-console capability is present. This build does not expose that capability, so Work filters the tab out and no generic empty substitute is rendered
- **In-app capture gallery and search**: the desktop capture gallery is tracked by open issue #76 and has no mounted application surface in this build. The documentation-site gallery is a separate built surface with its own capture route; this harness does not substitute that page for an app job
- **Authenticator registration chooser**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-authenticator-registration-chooser.txt, beside the images)
- **Authenticator QR pairing and live code**: that state exists only after a real TOTP secret is supplied; the capture harness never creates, stores, prints or photographs a secret or QR payload. The secret-free registration chooser is captured instead, and nothing is substituted for pairing
- **Converter block-mapping step**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-converter-block-mapping-step.txt, beside the images)
- **Converter world-settings step**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-converter-world-settings-step.txt, beside the images)
- **Ollama ready runtime and exhaustive live catalogue**: it requires a real local Ollama daemon plus the official catalogue refresh; this capture profile has no daemon and nothing was fabricated
- **Ollama active pull queue**: it requires a real model transfer and enough storage; the harness does not download a model merely to manufacture progress
- **Ollama streaming chat**: it requires a real installed model and local runtime; the disabled real chat surface is captured and no fake response is substituted
- **Ollama harness preflight and rollback**: it requires an explicitly registered executable profile and a real launch/health failure; the capture harness does not register or run an arbitrary program
- **Browser extension Start download dialog**: this state must begin at a real installed browser extension and operate a real transfer through the desktop bridge. This build exposes no extension bridge in the capture profile, so the empty/no-host page is captured and no DOM injection, mocked IPC or simulated progress is substituted
- **Browser extension Downloading dialog**: this state must begin at a real installed browser extension and operate a real transfer through the desktop bridge. This build exposes no extension bridge in the capture profile, so the empty/no-host page is captured and no DOM injection, mocked IPC or simulated progress is substituted
- **Browser extension Download complete notice**: this state must begin at a real installed browser extension and operate a real transfer through the desktop bridge. This build exposes no extension bridge in the capture profile, so the empty/no-host page is captured and no DOM injection, mocked IPC or simulated progress is substituted
- **Remote hosting panel**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-remote-hosting-panel.txt, beside the images)
- **Render console**: the console exists only while a render is genuinely in flight, and this run has none: starting one needs a Java runtime, an accepted Mojang download consent (declined here, deliberately) and minutes of work. Nothing was substituted
- **Changelog viewer**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-changelog-viewer.txt, beside the images)
- **Release asset list and download progress**: listing a release's assets and downloading one both need real traffic to github.com, which the offline guard refuses; the panel is captured in the state it is in before anything has been asked for
- **Render progress panel**: it only exists while a render is actually running, which needs a Java runtime, an accepted Mojang download consent and minutes of work; this run declined that consent
- **Interrupted renders**: it only appears when a previous render was interrupted and left a session behind, and the throwaway profile this run used has never started one
- **Grown-up gate, credential configured**: reaching this state needs a real shared restricted-mode credential, and that record is deliberately not scoped to this run's throwaway --user-data-dir: SchoolModeStore (design/packages/app/src/main/schoolMode/record.ts) writes it to <app.getPath('appData')>/Ding-Ding Shared/school-mode.v1.json, a location shared on purpose across every Kid-Mode-capable app on the host. Setting one here to capture this state would write that file to this machine's real, persistent application-data directory rather than to the disposable profile the rest of this harness confines itself to - the same trade this file's own 'captures the reset-settings super confirmation' test already declines for a strictly weaker case (a slider armed and then backed out of with Emergency exit, because completing it 'really does reset every setting ... and a capture is not worth doing that', even though that slider's own blast radius is the throwaway profile alone). See this test's own comment immediately above for the full reasoning, including why this is a genuine architecture fact rather than a fixed harness limitation
- **Grown-up gate, wrong-code refusal**: a sub-state of the credentialed branch the 'Grown-up gate, credential configured' skip above already declines to reach on this host, for the identical reason given there in full: the shared restricted-mode credential a wrong code would be checked against is not scoped to this run's throwaway --user-data-dir, so there is no credentialed branch on this host for a wrong code to be typed into in the first place. Reachable safely in CI, where the ephemeral runner's own $HOME makes both this and the credentialed branch above genuinely safe to seed
- **Kid Mode theme variants (light/dark/contrast)**: Kid Mode always paints from its own fixed 'kid' Vuetify theme (KID_SCHEME in kidTheme.ts) rather than the light/dark/contrast scheme chosen in Adult Mode's own Settings - App.vue's own watcher snaps the live theme name straight back to 'kid' the instant Kid Mode is active, so there is no separate light/dark/contrast variant of any Kid Mode surface to capture. Not a harness limitation: there is genuinely nothing else to capture here, and the note on the 'Kid Home' capture above says the same thing at the point a reader is most likely to be asking why no kid-theme-* pair sits beside theme-light.png/theme-dark.png
- **Celebration**: KidCelebration.vue only ever fires from a real completion event forwarded through App.vue's awardKidSticker() - a rendered map opened, a page published to GitHub Pages, a local render finished, or the guide finding a world (App.vue's own doc comment on that function: 'every caller below this point is a real action finishing, never a fabricated signal'). Every one of those needs either the vendored Java render pipeline with an accepted Mojang download consent and minutes of work (the same reason 'Render progress panel' above is unreachable) or a signed-in GitHub account (the same reason 'GitHub account, signed in' above is unreachable). Calling useKidProgress().award() directly from this harness, bypassing awardKidSticker's real trigger, would be exactly the staging this file's own header rules out for every surface: 'no value is planted to make a screen look populated, and no screen stands in for a different one'
- **Kid Messages (notification centre)**: the harness could not open it in this run: the surface did not finish within 20000ms, and captured nothing in that time (the whole failure is in diagnostic-kid-messages-notification-centre.txt, beside the images)
