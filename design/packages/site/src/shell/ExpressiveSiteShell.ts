import type { I18n } from "../i18n/I18n.js";
import { icon } from "../platform/dom.js";
import worldlensLogoUrl from "../assets/worldlens-logo.png";
import type { SidebarNavigation } from "./SidebarNavigation.js";
import { applySidebarNavigation } from "./SidebarNavigation.js";
import type { TabModel } from "../tabs/TabModel.js";

export interface ExpressiveShellActions {
    readonly home: () => void;
    readonly search: () => void;
    readonly settings: () => void;
    readonly notifications: () => void;
    readonly palette: () => void;
}

export interface ExpressiveShellOptions {
    readonly root: HTMLElement;
    readonly i18n: I18n;
    readonly tabs: TabModel;
    readonly sidebar: SidebarNavigation;
    readonly tabBar: HTMLElement;
    readonly panels: HTMLElement;
    readonly footer: HTMLElement;
    readonly actions: ExpressiveShellActions;
}

/**
 * The Pages site's application shell — a rail-led canvas, not a page with a header on it.
 *
 * ## What this replaced, and why the silhouette changed
 *
 * The previous shell was a full-width sticky top app bar carrying the brand, a tagline and
 * four icon actions, with a navigation column and a centred content canvas underneath it and
 * a soft radial gradient washing the whole surface. That is the shape almost every
 * documentation site arrives at, and it spent the most valuable strip of the viewport - the
 * top four and a half rem, across the entire width - on a wordmark that never changes and a
 * sentence nobody reads twice.
 *
 * This shell has no top app bar at all. Every piece of chrome lives in one full-height rail
 * that runs from the very top of the viewport to the bottom: the brand at its head, the tab
 * strip filling it, the quick actions at its foot. The content canvas is then a single inset
 * pane beside it. The practical gain is that the chrome occupies one narrow column instead of
 * a band plus a column, so an article gets the full height of the window; the perceptual gain
 * is that the page reads as an application canvas rather than a marketing page, which is what
 * a documentation site for a desktop application should look like.
 *
 * ## Why the rail is the tab strip rather than a navigation copy of it
 *
 * The project's tab rules already require a strip that docks to any edge, defaults to left,
 * persists that choice, overflows rather than clipping, reorders, pins and groups. A separate
 * navigation list beside such a strip would be a second, weaker copy of it that immediately
 * starts disagreeing about what is open. So the strip *is* the navigation, and the rail is
 * the frame around it. `TabModel` keeps owning placement; this class only reflects it, which
 * is why docking to top or bottom still works and simply lays the same rail out horizontally.
 *
 * Its only state is state already owned by `TabModel` and `SidebarNavigation`, so rebuilding
 * the DOM does not invent a second preference store.
 */
export class ExpressiveSiteShell {
    readonly element: HTMLElement;
    readonly navigation: HTMLElement;
    readonly main: HTMLElement;
    readonly skipLink: HTMLAnchorElement;

    private readonly options: ExpressiveShellOptions;
    private readonly toggle: HTMLButtonElement;
    private readonly navigationScrim: HTMLButtonElement;

    constructor(options: ExpressiveShellOptions) {
        this.options = options;

        this.skipLink = document.createElement("a");
        this.skipLink.className = "md-skip-link";
        this.skipLink.href = "#mb-main-content";
        options.i18n.bindText(this.skipLink, "shell.skipToContent");

        this.element = document.createElement("div");
        this.element.className = "mb-app-shell";

        // The rail carries the site's identity as well as its navigation, so it is the
        // banner landmark. There is no separate header element to give that role to any
        // more, and a page with no banner at all would lose a landmark screen-reader users
        // navigate by.
        this.navigation = document.createElement("nav");
        this.navigation.className = "mb-shell-topbar";
        this.navigation.setAttribute("aria-label", "Site pages");

        this.toggle = this.createNavigationToggle();
        options.tabBar.id = "site-primary-navigation";
        this.navigation.append(
            this.createRailHead(),
            options.tabBar,
            this.createRailActions(),
        );

        this.main = document.createElement("main");
        this.main.className = "mb-main";
        this.main.id = "mb-main-content";
        this.main.tabIndex = -1;

        // The footer sits inside the canvas rather than beside it. With a full-height rail
        // the canvas is the only column that scrolls, and a footer outside it would either
        // sit beside a rail it has nothing to do with or force the whole frame to scroll.
        this.main.append(options.panels, options.footer);

        const frame = document.createElement("div");
        frame.className = "mb-shell-workspace";
        frame.append(this.navigation, this.main);

        this.navigationScrim = document.createElement("button");
        this.navigationScrim.className = "mb-navigation-scrim";
        this.navigationScrim.type = "button";
        this.navigationScrim.tabIndex = -1;
        this.navigationScrim.setAttribute("aria-label", "Close navigation");
        this.navigationScrim.addEventListener("click", () => options.sidebar.setCollapsed(true));

        this.element.append(frame, this.navigationScrim);
        options.root.append(this.skipLink, this.element);

        const sync = (): void => this.syncLayout(frame);
        options.tabs.subscribe(sync);
        options.sidebar.subscribe(sync);
        options.i18n.subscribe(sync);
        sync();
    }

    /**
     * The head of the rail: the brand, and the control that collapses the rail to icons.
     *
     * The brand is a button rather than a heading because it does something - it returns to
     * Home - and a heading that silently acts like a link is the sort of decorative-looking
     * control this project treats as a defect rather than as styling.
     */
    private createRailHead(): HTMLElement {
        const head = document.createElement("div");
        head.className = "mb-rail__head";
        head.append(this.createBrand(), this.toggle);
        return head;
    }

    private createBrand(): HTMLButtonElement {
        const brand = document.createElement("button");
        brand.className = "mb-brand";
        brand.type = "button";
        this.options.i18n.bindAttr(brand, "aria-label", "site.brandAria");
        brand.addEventListener("click", this.options.actions.home);

        const mark = document.createElement("img");
        mark.className = "mb-brand-mark";
        mark.src = worldlensLogoUrl;
        mark.alt = "";
        mark.setAttribute("aria-hidden", "true");

        const word = document.createElement("span");
        word.className = "mb-brand-word";
        word.textContent = "worldlens";

        brand.append(mark, word);
        return brand;
    }

    /**
     * The foot of the rail: search, notifications, settings and the command palette.
     *
     * These were the top app bar's quick actions. They keep their labels and their order; the
     * only change is that they now sit at the bottom of a column, which is where a navigation
     * rail's utility actions belong in the Material anatomy and also where a thumb reaches
     * them on a narrow viewport.
     */
    private createRailActions(): HTMLElement {
        const actions = document.createElement("div");
        actions.className = "mb-rail__actions";
        actions.setAttribute("aria-label", "Quick actions");
        actions.append(
            this.quickAction("search", "Search every page", this.options.actions.search),
            this.quickAction(
                "notifications",
                "Notification history",
                this.options.actions.notifications,
            ),
            this.quickAction("tune", "Settings", this.options.actions.settings),
            this.quickAction(
                "search",
                "Command palette (Ctrl+Shift+F)",
                this.options.actions.palette,
                "mb-rail__palette-action",
            ),
        );
        return actions;
    }

    private quickAction(
        iconName: Parameters<typeof icon>[0],
        label: string,
        run: () => void,
        extraClass = "",
    ): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = `md-icon-button mb-rail__action ${extraClass}`.trim();
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.appendChild(icon(iconName));
        button.addEventListener("click", run);
        return button;
    }

    private createNavigationToggle(): HTMLButtonElement {
        const toggle = document.createElement("button");
        toggle.className = "md-icon-button mb-sidebar-toggle";
        toggle.type = "button";
        toggle.setAttribute("aria-controls", "site-primary-navigation");
        toggle.addEventListener("click", () => this.options.sidebar.toggle());
        return toggle;
    }

    private syncLayout(frame: HTMLElement): void {
        const placement = this.options.tabs.placement;
        const applied = applySidebarNavigation(
            {
                workspace: frame,
                topbar: this.navigation,
                navigation: this.options.tabBar,
                toggle: this.toggle,
            },
            placement,
            this.options.sidebar.collapsed,
            {
                collapse: this.options.i18n.t("shell.collapseNavigation"),
                expand: this.options.i18n.t("shell.expandNavigation"),
            },
        );
        this.toggle.replaceChildren(
            icon(applied.chevron === "right" ? "chevronRight" : "chevronLeft"),
        );
        this.element.dataset["navigationOpen"] = applied.collapsed ? "false" : "true";
        this.element.dataset["tabPlacement"] = placement;
        this.navigationScrim.hidden = applied.collapsed || !this.compactViewport();
    }

    private compactViewport(): boolean {
        return typeof window !== "undefined" && window.matchMedia("(width <= 720px)").matches;
    }
}
