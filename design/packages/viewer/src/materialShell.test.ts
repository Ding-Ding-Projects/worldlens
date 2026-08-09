/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
    MaterialShell,
    SERVED_COMPACT_LAYOUT_MAX_WIDTH,
    SERVED_PHONE_VIEWPORTS,
} from "./materialShell";

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

    it("offers a pinpoint action from the anchored context menu", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        shell.openContextMenu({ hit: { point: { x: 10, y: 64, z: -20 } } } as never, 120, 180);
        const menu = shell.root.querySelector(".bm-m3-menu") as HTMLDivElement;
        expect(menu.hidden).toBe(false);
        (menu.querySelector('[data-action="pin"]') as HTMLButtonElement).click();
        expect(localStorage.getItem("bluemap-pinpoints")).toContain("Pinpoint 1");
        expect(shell.root.querySelector(".bm-m3-pin")?.textContent).toContain("10, 64, -20");
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

        mapMenuButton.click();
        (mapMenu.querySelector('[data-map-action="appearance"]') as HTMLButtonElement).click();
        expect(mapMenu.hidden).toBe(true);
        expect(settings.hidden).toBe(false);

        mapMenuButton.focus();
        expect(document.activeElement).toBe(mapMenuButton);
        mapMenuButton.click();
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(mapMenu.hidden).toBe(true);
        expect(document.activeElement).toBe(mapMenuButton);
    });

    it("leaves other map controls alone when Escape arrives with the map menu closed", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const mapMenu = shell.root.querySelector<HTMLElement>(".bm-m3-map-menu")!;
        const settings = shell.root.querySelector<HTMLElement>(".bm-m3-settings")!;
        const settingsButton = shell.root.querySelector<HTMLButtonElement>(
            '[aria-label="Open settings"]',
        )!;

        settingsButton.click();
        expect(settings.hidden).toBe(false);
        expect(mapMenu.hidden).toBe(true);

        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        expect(settings.hidden).toBe(false);
        expect(mapMenu.hidden).toBe(true);
    });

    it("keeps the compact CSS bounded and wraps the coordinate fields without shrinking controls", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        const css = document.getElementById("bm-m3-style")?.textContent ?? "";

        expect(css).toContain(`@media(max-width:${SERVED_COMPACT_LAYOUT_MAX_WIDTH}px)`);
        expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
        expect(css).toContain(".bm-m3-map-menu{left:8px;right:8px;top:auto;bottom:8px");
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
