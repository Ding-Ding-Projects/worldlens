/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
    MaterialShell,
    SERVED_COMPACT_LAYOUT_MAX_WIDTH,
    SERVED_PHONE_VIEWPORTS,
} from "./materialShell";
import { ViewerPresentationPolicy } from "./presentationPolicy";

function setViewport(width: number, height = 800): void {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    window.dispatchEvent(new Event("resize"));
}

describe("MaterialShell", () => {
    beforeEach(() => {
        document.body.innerHTML = "<main id='map'></main>";
        document.head.querySelector("#bm-m3-style")?.remove();
        setViewport(1280);
        const values = new Map<string, string>();
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                clear: () => values.clear(),
            },
        });
    });

    it("renders an M3 control bar and persisted appearance controls", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        expect(shell.root.classList.contains("bm-m3-shell")).toBe(true);
        expect(shell.root.querySelector('[aria-label="Open settings"]')).toBeTruthy();
        expect(shell.root.dataset.theme).toBe("dark");
        const theme = shell.root.querySelector("select") as HTMLSelectElement;
        theme.value = "dark";
        theme.dispatchEvent(new Event("change"));
        expect(shell.root.dataset.theme).toBe("dark");
        expect(localStorage.getItem("bluemap-theme")).toBe("dark");
    });

    it("keeps a stored theme ahead of the dark served-map default", () => {
        localStorage.setItem("bluemap-theme", "light");
        const shell = new MaterialShell(document.querySelector("main")!);

        expect(shell.root.dataset.theme).toBe("light");
        expect((shell.root.querySelector("select") as HTMLSelectElement).value).toBe("light");
    });

    it("keeps the canonical contrast scheme reachable from the served appearance control", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const theme = shell.root.querySelector<HTMLSelectElement>("#bm-theme")!;
        theme.value = "contrast";
        theme.dispatchEvent(new Event("change"));

        expect(shell.root.dataset.theme).toBe("contrast");
        expect(localStorage.getItem("bluemap-theme")).toBe("contrast");
        const css = document.getElementById("bm-m3-style")?.textContent ?? "";
        expect(css).toContain('.bm-m3-shell[data-theme="contrast"]');
        expect(css).toContain("color:var(--bm-on-surface-variant);opacity:1");
    });

    it("hides language and tone controls while restricted without overwriting raw presentation values", () => {
        localStorage.setItem("bluemap-presentation-language-mode", "bilingual");
        localStorage.setItem("bluemap-funny-level-en", "5");
        localStorage.setItem("bluemap-funny-level-yue", "4");
        const policy = new ViewerPresentationPolicy({ languageAndToneRestricted: true });
        const shell = new MaterialShell(document.querySelector("main")!, policy);

        expect(shell.root.querySelector("#bm-language-mode")).toBeNull();
        expect(shell.root.querySelector("#bm-funny-en")).toBeNull();
        expect(shell.root.querySelector("#bm-funny-yue")).toBeNull();
        expect(shell.root.dataset.languageMode).toBe("en");
        expect(shell.root.dataset.funnyLevel).toBe("1");
        expect(shell.root.dataset.funnyLevelYue).toBe("1");
        expect(localStorage.getItem("bluemap-funny-level-en")).toBe("5");
        expect(localStorage.getItem("bluemap-funny-level-yue")).toBe("4");
        expect(localStorage.getItem("bluemap-presentation-language-mode")).toBe("bilingual");

        policy.setRestriction({ languageAndToneRestricted: false }, "en");
        shell.refreshPresentation();

        expect((shell.root.querySelector("#bm-language-mode") as HTMLSelectElement).value).toBe(
            "bilingual",
        );
        expect((shell.root.querySelector("#bm-funny-en") as HTMLInputElement).value).toBe("5");
        expect((shell.root.querySelector("#bm-funny-yue") as HTMLInputElement).value).toBe("4");
        expect(shell.root.dataset.languageMode).toBe("bilingual");
        expect(shell.root.dataset.funnyLevel).toBe("5");
    });

    it("renders English, Cantonese, and bilingual material-shell copy in visible and ARIA text", () => {
        localStorage.setItem("bluemap-presentation-language-mode", "yue");
        const shell = new MaterialShell(document.querySelector("main")!);
        const settingsButton = shell.root.querySelector<HTMLButtonElement>(
            '[data-action="settings"]',
        )!;

        expect(shell.root.querySelector(".bm-m3-subtitle")?.textContent).toBe(
            "Material 地圖伺服器",
        );
        expect(settingsButton.getAttribute("aria-label")).toBe("開啟設定");
        expect(shell.root.querySelector("#bm-m3-settings-title")?.textContent).toBe("地圖外觀");

        localStorage.setItem("bluemap-presentation-language-mode", "bilingual");
        shell.refreshPresentation();

        expect(shell.root.querySelector(".bm-m3-subtitle")?.textContent).toBe(
            "Material map server / Material 地圖伺服器",
        );
        expect(settingsButton.getAttribute("aria-label")).toBe("Open settings / 開啟設定");
        expect(shell.root.querySelector("#bm-m3-settings-title")?.textContent).toBe(
            "Map appearance / 地圖外觀",
        );
    });

    it("persists independent English and Cantonese funny levels and refreshes rendered copy", () => {
        localStorage.setItem("bluemap-presentation-language-mode", "bilingual");
        localStorage.setItem("bluemap-funny-level-en", "1");
        localStorage.setItem("bluemap-funny-level-yue", "1");
        const shell = new MaterialShell(document.querySelector("main")!);

        const english = shell.root.querySelector<HTMLInputElement>("#bm-funny-en")!;
        english.value = "5";
        english.dispatchEvent(new Event("input"));

        expect(localStorage.getItem("bluemap-funny-level-en")).toBe("5");
        expect(localStorage.getItem("bluemap-funny-level-yue")).toBe("1");
        expect(shell.root.dataset.funnyLevelEn).toBe("5");
        expect(shell.root.dataset.funnyLevelYue).toBe("1");
        expect(shell.root.querySelector(".bm-m3-subtitle")?.textContent).toBe(
            "Material map server, map magic on standby / Material 地圖伺服器",
        );

        const cantonese = shell.root.querySelector<HTMLInputElement>("#bm-funny-yue")!;
        cantonese.value = "5";
        cantonese.dispatchEvent(new Event("input"));

        expect(localStorage.getItem("bluemap-funny-level-en")).toBe("5");
        expect(localStorage.getItem("bluemap-funny-level-yue")).toBe("5");
        expect(shell.root.querySelector(".bm-m3-subtitle")?.textContent).toBe(
            "Material map server, map magic on standby / Material 地圖伺服器，地圖魔法候命",
        );
        expect(
            shell.root
                .querySelector<HTMLInputElement>("#bm-funny-en")
                ?.getAttribute("aria-valuetext"),
        ).toBe("Level 5 / 第 5 級");
    });

    it("runs a matching map-control result without creating a notification overlay", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const search = shell.root.querySelector<HTMLInputElement>(
            '[aria-label="Search map controls"]',
        )!;
        const results = shell.root.querySelector<HTMLElement>(
            '[data-search-results="map-controls"]',
        )!;

        search.value = "appearance";
        search.dispatchEvent(new Event("input"));
        expect(results.hidden).toBe(false);
        const appearance = [
            ...results.querySelectorAll<HTMLButtonElement>("[data-search-result]"),
        ].find((button) => button.textContent === "Open map appearance");
        expect(appearance).toBeTruthy();
        appearance!.click();

        expect(shell.root.querySelector<HTMLElement>(".bm-m3-settings")!.hidden).toBe(false);
        expect(shell.root.querySelector(".bm-m3-toast")).toBeNull();
    });

    it("records feedback at the bell history, announces alerts, and never opens a live map overlay", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const bell = shell.root.querySelector<HTMLButtonElement>(
            '[aria-controls="bm-m3-notification-history"]',
        )!;
        const history = shell.root.querySelector<HTMLElement>(".bm-m3-notification-history")!;
        const announcer = shell.root.querySelector<HTMLElement>(".bm-m3-notification-announcer")!;

        shell.openContextMenu({} as never, 120, 180);

        expect(shell.root.querySelector(".bm-m3-toast")).toBeNull();
        expect(history.hidden).toBe(true);
        expect(bell.getAttribute("aria-expanded")).toBe("false");
        expect(bell.getAttribute("aria-label")).toBe("Notification history. 1 recorded, 1 unread.");
        expect(announcer.getAttribute("role")).toBe("alert");
        expect(announcer.textContent).toContain("No terrain at that point");

        bell.click();

        expect(bell.getAttribute("aria-expanded")).toBe("true");
        expect(bell.getAttribute("aria-label")).toBe("Notification history. 1 recorded, 0 unread.");
        expect(history.hidden).toBe(false);
        expect(history.getAttribute("role")).toBe("region");
        expect(history.getAttribute("aria-label")).toBe("Notification history");
        expect(history.textContent).toContain("No terrain at that point");
        expect(history.querySelector('[data-level="alert"]')).toBeTruthy();

        history.querySelector<HTMLButtonElement>('[data-notification-action="close"]')!.click();
        expect(history.hidden).toBe(true);
        expect(document.activeElement).toBe(bell);

        localStorage.setItem("bluemap-presentation-language-mode", "yue");
        shell.refreshPresentation();
        expect(bell.getAttribute("aria-label")).toBe("通知紀錄。已記錄 1 個，未讀 0 個。");
        bell.click();
        expect(history.textContent).toContain("嗰個位置未有地形");
    });

    it("routes direct BlueMap alerts into the bell history without opening a map overlay", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const bell = shell.root.querySelector<HTMLButtonElement>(
            '[aria-controls="bm-m3-notification-history"]',
        )!;
        const history = shell.root.querySelector<HTMLElement>(".bm-m3-notification-history")!;

        shell.root.dispatchEvent(
            new CustomEvent("bluemapAlert", {
                detail: { level: "warning", message: "Map feed needs attention" },
            }),
        );

        expect(shell.root.querySelector(".bm-m3-toast")).toBeNull();
        expect(history.hidden).toBe(true);
        expect(bell.getAttribute("aria-label")).toBe("Notification history. 1 recorded, 1 unread.");

        bell.click();
        expect(history.textContent).toContain("Map feed needs attention");
        expect(history.querySelector('[data-level="alert"]')).toBeTruthy();
    });

    it("uses the optional viewer presentation adapter and releases its subscription on disposal", () => {
        let listener: (() => void) | undefined;
        let settingsCopy = "Host settings";
        const policy = new ViewerPresentationPolicy(undefined, {
            copy: (request) => (request.key === "openSettings" ? settingsCopy : undefined),
            subscribe: (next) => {
                listener = next;
                return () => {
                    listener = undefined;
                };
            },
        });
        const shell = new MaterialShell(document.querySelector("main")!, policy);
        const settingsButton = shell.root.querySelector<HTMLButtonElement>(
            '[data-action="settings"]',
        )!;

        expect(settingsButton.getAttribute("aria-label")).toBe("Host settings");
        settingsCopy = "Updated host settings";
        listener?.();
        expect(settingsButton.getAttribute("aria-label")).toBe("Updated host settings");

        shell.dispose();
        expect(listener).toBeUndefined();
    });

    it("binds the anchored regex builder to its search and surfaces live capture feedback", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const search = shell.root.querySelector<HTMLInputElement>(
            '[aria-label="Search map controls"]',
        )!;
        const builderButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open the regex builder for map controls"]',
        )!;
        builderButton.click();
        const builder = shell.root.querySelector<HTMLElement>(
            '.bm-m3-regex-builder[data-search-scope="map-controls"]',
        )!;
        const pattern = builder.querySelector<HTMLTextAreaElement>("[data-regex-pattern]")!;

        expect(builder.hidden).toBe(false);
        pattern.value = "(Open) map menu";
        pattern.dispatchEvent(new Event("input", { bubbles: true }));
        expect(search.value).toBe("(Open) map menu");
        expect(
            shell.root.querySelector(
                '[aria-label="Search plain text instead of a regular expression"]',
            ),
        ).toBeTruthy();
        expect(builder.querySelector("[data-regex-feedback]")?.textContent).toContain("1: Open");
        expect(builder.querySelector<HTMLButtonElement>('[data-regex-token="0"]')).toBeTruthy();
        pattern.value = "(";
        pattern.dispatchEvent(new Event("input", { bubbles: true }));
        expect(builder.querySelector("[data-regex-feedback]")?.textContent).toContain(
            "Pattern error:",
        );

        builder.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(builder.hidden).toBe(true);
        expect(document.activeElement).toBe(search);
    });

    it("opens the command palette from Ctrl+Shift+F and runs a real command", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const commandButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open command palette"]',
        )!;
        commandButton.focus();
        document.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true,
                ctrlKey: true,
                shiftKey: true,
                key: "F",
            }),
        );
        const palette = shell.root.querySelector<HTMLElement>(".bm-m3-command-palette")!;
        const search = palette.querySelector<HTMLInputElement>('[aria-label="Search commands"]')!;

        expect(palette.hidden).toBe(false);
        expect(document.activeElement).toBe(search);
        expect(
            palette.querySelector('[aria-label="Open the regex builder for commands"]'),
        ).toBeTruthy();
        search.value = "appearance";
        search.dispatchEvent(new Event("input"));
        [...palette.querySelectorAll<HTMLButtonElement>("[data-search-result]")]
            .find((button) => button.textContent === "Open map appearance")!
            .click();

        expect(palette.hidden).toBe(true);
        expect(shell.root.querySelector<HTMLElement>(".bm-m3-settings")!.hidden).toBe(false);
    });

    it("opens the real palette from the compact map-menu action", () => {
        setViewport(SERVED_PHONE_VIEWPORTS[1]);
        const shell = new MaterialShell(document.querySelector("main")!);
        const mapMenuButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open map menu"]',
        )!;
        mapMenuButton.click();
        shell.root.querySelector<HTMLButtonElement>('[data-map-action="palette"]')!.click();

        const palette = shell.root.querySelector<HTMLElement>(".bm-m3-command-palette")!;
        expect(palette.hidden).toBe(false);
        expect(document.activeElement).toBe(
            palette.querySelector<HTMLInputElement>('[aria-label="Search commands"]'),
        );
    });

    it("offers a pinpoint action from the anchored context menu", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        shell.openContextMenu({ hit: { point: { x: 10, y: 64, z: -20 } } } as never, 120, 180);
        const menu = shell.root.querySelector(".bm-m3-menu") as HTMLDivElement;
        expect(menu.hidden).toBe(false);
        (menu.querySelector('[data-action="pin"]') as HTMLButtonElement).click();
        expect(localStorage.getItem("bluemap-pinpoints")).toContain("Pinpoint 1");
        expect(shell.root.querySelector(".bm-m3-pin")?.textContent).toContain("10, 64, -20");
    });

    it("makes terrain actions keyboard-operable and restores the invoking canvas after Escape", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const invoker = document.createElement("button");
        invoker.textContent = "Map canvas";
        document.body.appendChild(invoker);
        invoker.focus();
        shell.openContextMenu(
            { hit: { point: { x: 10, y: 64, z: -20 } } } as never,
            120,
            180,
            invoker,
        );
        const menu = shell.root.querySelector<HTMLElement>(".bm-m3-menu")!;

        expect(document.activeElement).toBe(menu.querySelector('[data-action="pin"]'));
        menu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
        expect(document.activeElement).toBe(menu.querySelector('[data-action="copy"]'));
        menu.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(menu.hidden).toBe(true);
        expect(document.activeElement).toBe(invoker);
    });

    it.each(SERVED_PHONE_VIEWPORTS)(
        "collapses the served rail and presents the map menu as a bottom sheet at %ipx",
        (width) => {
            setViewport(width);
            const shell = new MaterialShell(document.querySelector("main")!);
            const mapMenuButton = shell.root.querySelector<HTMLButtonElement>(
                '[aria-label="Open map menu"]',
            )!;
            const mapMenu = shell.root.querySelector<HTMLDivElement>(".bm-m3-map-menu")!;

            expect(shell.root.dataset.layout).toBe("compact");
            expect(mapMenu.dataset.presentation).toBe("bottom-sheet");
            expect(shell.root.querySelector('[aria-label="Map navigation"]')).toBeTruthy();
            expect(shell.root.querySelectorAll(".bm-m3-coordinate")).toHaveLength(2);
            expect(
                shell.root.querySelector('[aria-controls="bm-m3-notification-history"]'),
            ).toBeTruthy();
            expect(mapMenuButton.getAttribute("aria-expanded")).toBe("false");

            mapMenuButton.click();
            expect(mapMenu.hidden).toBe(false);
            expect(mapMenuButton.getAttribute("aria-expanded")).toBe("true");

            (mapMenu.querySelector('[data-map-action="search"]') as HTMLButtonElement).click();
            expect(mapMenu.hidden).toBe(true);
            expect(document.activeElement).toBe(shell.root.querySelector(".bm-m3-search"));
        },
    );

    it("switches the same served menu back to a wide side sheet after a resize", () => {
        setViewport(SERVED_PHONE_VIEWPORTS[0]);
        const shell = new MaterialShell(document.querySelector("main")!);
        const mapMenu = shell.root.querySelector<HTMLDivElement>(".bm-m3-map-menu")!;
        expect(mapMenu.dataset.presentation).toBe("bottom-sheet");

        setViewport(SERVED_COMPACT_LAYOUT_MAX_WIDTH + 1);
        expect(shell.root.dataset.layout).toBe("wide");
        expect(mapMenu.dataset.presentation).toBe("side-sheet");
    });

    it("routes compact menu actions to the real settings control and restores opener focus on Escape", () => {
        setViewport(SERVED_PHONE_VIEWPORTS[2]);
        const shell = new MaterialShell(document.querySelector("main")!);
        const mapMenuButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open map menu"]',
        )!;
        const mapMenu = shell.root.querySelector<HTMLElement>(".bm-m3-map-menu")!;
        const settings = shell.root.querySelector<HTMLElement>(".bm-m3-settings")!;
        const settingsButton = shell.root.querySelector<HTMLButtonElement>(
            '[data-action="settings"]',
        )!;

        mapMenuButton.click();
        (mapMenu.querySelector('[data-map-action="appearance"]') as HTMLButtonElement).click();
        expect(mapMenu.hidden).toBe(true);
        expect(settings.hidden).toBe(false);
        expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).toBe(settings.querySelector("#bm-theme"));

        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(mapMenu.hidden).toBe(true);
        expect(settings.hidden).toBe(true);
        expect(settingsButton.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(mapMenuButton);
    });

    it("makes the wide settings dialog dismissible with Escape and returns focus to its opener", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const mapMenu = shell.root.querySelector<HTMLElement>(".bm-m3-map-menu")!;
        const settings = shell.root.querySelector<HTMLElement>(".bm-m3-settings")!;
        const settingsButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open settings"]',
        )!;

        expect(settings.id).toBe("bm-m3-settings");
        expect(settings.getAttribute("role")).toBe("dialog");
        expect(settings.getAttribute("aria-modal")).toBe("false");
        expect(settingsButton.getAttribute("aria-controls")).toBe("bm-m3-settings");
        expect(settingsButton.getAttribute("aria-expanded")).toBe("false");
        settingsButton.click();
        expect(settings.hidden).toBe(false);
        expect(mapMenu.hidden).toBe(true);
        expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).toBe(settings.querySelector("#bm-theme"));

        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(settings.hidden).toBe(true);
        expect(mapMenu.hidden).toBe(true);
        expect(settingsButton.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(settingsButton);

        settingsButton.click();
        settings.querySelector<HTMLButtonElement>('[data-settings-action="close"]')!.click();
        expect(settings.hidden).toBe(true);
        expect(document.activeElement).toBe(settingsButton);
    });

    it("keeps the compact CSS bounded and wraps the coordinate fields without shrinking controls", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const css = document.getElementById("bm-m3-style")?.textContent ?? "";

        expect(css).toContain(`@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px)`);
        expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
        expect(css).toContain(".bm-m3-map-menu{left:8px;right:8px;top:auto;bottom:8px");
        expect(css).toContain(".bm-m3-search-wrap{grid-column:1/-1;width:100%;min-width:0}");
        expect(css).toContain("min-height:48px");
        expect(shell.root.querySelector(".bm-m3-control-bar")).toBeTruthy();
    });

    it("updates compact coordinate fields from the real loaded-terrain interaction", () => {
        setViewport(SERVED_PHONE_VIEWPORTS[1]);
        const shell = new MaterialShell(document.querySelector("main")!);
        shell.openContextMenu({ hit: { point: { x: 10.4, y: 64, z: -20.6 } } } as never, 120, 180);

        const x = shell.root.querySelector<HTMLOutputElement>('[data-coordinate="x"]')!;
        const z = shell.root.querySelector<HTMLOutputElement>('[data-coordinate="z"]')!;
        expect(x.textContent).toBe("x 10");
        expect(z.textContent).toBe("z -21");
        expect(x.getAttribute("aria-label")).toBe("Current X coordinate: 10");
        expect(z.getAttribute("aria-label")).toBe("Current Z coordinate: -21");
    });
});
