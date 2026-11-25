/**
 * The tour's words, resolved from a step id.
 *
 * `renderRun.ts`'s `phaseLabel`/`adviseOnFailure` are the model this follows: a plain
 * function taking the real `t`, with one literal, quoted-string `t()` call per case rather
 * than a call built from two variables. `appCopy.test.ts` and `catalogueCoverage.test.ts`
 * both find a key's real call site by reading source text for a quoted string argument, so a
 * call whose key and fallback both come out of a variable would be invisible to that scan -
 * and a catalogue entry with no call site the scanner can find is exactly the "translates
 * nothing" failure those tests exist to catch.
 *
 * `tutorialSteps.ts` stays plain data on purpose; this is the one place its step ids turn
 * into words, so the catalogue keys are declared exactly once each.
 */

import type { TutorialStepId, TutorialTourId } from "./tutorialSteps.js";

/** The translator the tour takes, so it works with or without a real vue-i18n instance. */
export type Translate = {
    (key: string, fallback: string): string;
    (key: string, named: Readonly<Record<string, unknown>>, fallback: string): string;
};

export function tutorialStepTitle(id: TutorialStepId, t: Translate): string {
    switch (id) {
        case "welcome":
            return t("tutorial.step.welcome.title", "Welcome to BlueMap");
        case "makeAMap":
            return t("tutorial.step.makeAMap.title", "Make a map");
        case "findWorld":
            return t("tutorial.step.findWorld.title", "Finding a world");
        case "rendering":
            return t("tutorial.step.rendering.title", "What rendering does");
        case "openMap":
            return t("tutorial.step.openMap.title", "Opening the finished map");
        case "publish":
            return t("tutorial.step.publish.title", "Sharing it, if you want to");
        case "wrapUp":
            return t("tutorial.step.wrapUp.title", "Come back any time");
        case "homeRail":
            return t("tutorial.step.homeRail.title", "Home");
        case "homeSearch":
            return t("tutorial.step.homeSearch.title", "Search everything");
        case "homeMachine":
            return t("tutorial.step.homeMachine.title", "On this machine");
        case "homeCatalogues":
            return t("tutorial.step.homeCatalogues.title", "The catalogues");
        case "mapRail":
            return t("tutorial.step.mapRail.title", "The Map button");
        case "mapPage":
            return t("tutorial.step.mapPage.title", "The map area");
        case "workRail":
            return t("tutorial.step.workRail.title", "Work");
        case "workStrip":
            return t("tutorial.step.workStrip.title", "Your open tabs");
        case "workNewTab":
            return t("tutorial.step.workNewTab.title", "Open another job");
        case "projectsTab":
            return t("tutorial.step.projectsTab.title", "Projects");
        case "projectsPage":
            return t("tutorial.step.projectsPage.title", "Your saved projects");
        case "projectsNew":
            return t("tutorial.step.projectsNew.title", "Start a new project");
        case "pagesTab":
            return t("tutorial.step.pagesTab.title", "Publish to GitHub Pages");
        case "toolsTab":
            return t("tutorial.step.toolsTab.title", "General tools");
        case "toolsList":
            return t("tutorial.step.toolsList.title", "Pick a tool");
        case "settingsRail":
            return t("tutorial.step.settingsRail.title", "Settings");
        case "settingsSearch":
            return t("tutorial.step.settingsSearch.title", "Search settings");
        default:
            return id;
    }
}

export function tutorialStepBody(id: TutorialStepId, t: Translate): string {
    switch (id) {
        case "welcome":
            return t(
                "tutorial.step.welcome.body",
                "BlueMap turns a Minecraft world into a map you can pan, zoom and explore, and the Map button on the navigation rail is what opens it.",
            );
        case "makeAMap":
            return t(
                "tutorial.step.makeAMap.body",
                "This tab is where you turn a Minecraft world into a map: point BlueMap at one, answer a few short questions, and it renders.",
            );
        case "findWorld":
            return t(
                "tutorial.step.findWorld.body",
                "BlueMap looks in this computer's default Minecraft folder automatically, with nothing to configure, and lists what it finds below. Nothing there? Browse for a folder, type a path, or drag one in.",
            );
        case "rendering":
            return t(
                "tutorial.step.rendering.body",
                "Rendering reads the world and draws it into map tiles on disk. There is no fixed time for it: a small world can take minutes, a huge one can take hours. Once it starts, you will see a percentage and, after a while, an estimate of what is left.",
            );
        case "openMap":
            return t(
                "tutorial.step.openMap.body",
                "When a render finishes, its tiles are written straight into your maps folder, and an Open the map button appears. The Map button on the navigation rail opens what BlueMap made, any time you want it.",
            );
        case "publish":
            return t(
                "tutorial.step.publish.body",
                "By default a finished map only opens on this computer. This tab can publish it to GitHub Pages instead: a real, free address anyone can open, still nothing but files.",
            );
        case "wrapUp":
            return t(
                "tutorial.step.wrapUp.body",
                "That is the whole loop: find a world, render it, open it, and publish it if you want to. Replay this tour any time from Info, from here in Docs, or from the command palette (Ctrl+Shift+F).",
            );
        case "homeRail":
            return t(
                "tutorial.step.homeRail.body",
                "Home is where you start. It shows what is happening on this computer and lists everything this application does.",
            );
        case "homeSearch":
            return t(
                "tutorial.step.homeSearch.body",
                "Type here to find any feature, setting or article. The button beside the box opens the pattern builder for more precise searches.",
            );
        case "homeMachine":
            return t(
                "tutorial.step.homeMachine.body",
                "This section shows what is moving right now, such as renders in progress, so you can jump straight back to them.",
            );
        case "homeCatalogues":
            return t(
                "tutorial.step.homeCatalogues.body",
                "Everything the application does is grouped by the job it belongs to. Open a catalogue to see every item in it, one line each.",
            );
        case "mapRail":
            return t(
                "tutorial.step.mapRail.body",
                "This opens the map BlueMap made. It stays on the navigation rail so you can get back to it from anywhere.",
            );
        case "mapPage":
            return t(
                "tutorial.step.mapPage.body",
                "The map shows here. With no map open it says so and offers Make a map; once one is open, this area is the viewer with its own menu.",
            );
        case "workRail":
            return t(
                "tutorial.step.workRail.body",
                "Work holds the jobs you have open, each in its own tab: making a map, projects, publishing and the tools.",
            );
        case "workStrip":
            return t(
                "tutorial.step.workStrip.body",
                "Each job is a tab. Tabs can be reordered, pinned and grouped, and they are kept when you restart.",
            );
        case "workNewTab":
            return t(
                "tutorial.step.workNewTab.body",
                "The plus button opens a menu of every job this application can show, so any tool is one click away.",
            );
        case "projectsTab":
            return t(
                "tutorial.step.projectsTab.body",
                "Projects holds your saved render projects, so you can render the same world again with the same settings.",
            );
        case "projectsPage":
            return t(
                "tutorial.step.projectsPage.body",
                "This page lists every saved render project and opens an editor for the one you pick.",
            );
        case "projectsNew":
            return t(
                "tutorial.step.projectsNew.body",
                "New project creates a project you can configure beyond the five questions the guide asks.",
            );
        case "pagesTab":
            return t(
                "tutorial.step.pagesTab.body",
                "This tab publishes a finished map to GitHub Pages, a free address anyone can open.",
            );
        case "toolsTab":
            return t(
                "tutorial.step.toolsTab.body",
                "General tools gathers the smaller tools, including the documentation, in one tab.",
            );
        case "toolsList":
            return t(
                "tutorial.step.toolsList.body",
                "Choose a tool from this list and it opens beside it. In a narrow window the list becomes a dropdown instead.",
            );
        case "settingsRail":
            return t(
                "tutorial.step.settingsRail.body",
                "Settings opens from the foot of the navigation rail. Pressing it again closes it.",
            );
        case "settingsSearch":
            return t(
                "tutorial.step.settingsSearch.body",
                "Type here to find a setting by its name or description. The button beside the box opens the pattern builder.",
            );
        default:
            return "";
    }
}

/** "Step {n} of {m}." - the progress line read out alongside each step's own title. */
export function tutorialProgressText(n: number, m: number, t: Translate): string {
    return t("tutorial.progress", { n, m }, "Step {n} of {m}.");
}

/** The tour's own name, used in the card heading, the palette rows and the tour lists. */
export function tutorialTourName(id: TutorialTourId, t: Translate): string {
    switch (id) {
        case "overall":
            return t("tutorial.tour.overall", "Getting started");
        case "home":
            return t("tutorial.tour.home", "Home");
        case "map":
            return t("tutorial.tour.map", "Map");
        case "work":
            return t("tutorial.tour.work", "Work");
        case "world":
            return t("tutorial.tour.world", "Make a map");
        case "projects":
            return t("tutorial.tour.projects", "Projects");
        case "pages":
            return t("tutorial.tour.pages", "Publish");
        case "toolkit":
            return t("tutorial.tour.toolkit", "General tools");
        case "settings":
            return t("tutorial.tour.settings", "Settings");
        default:
            return id;
    }
}

/** "Tour: {tour}" - the line that names the tour under the step counter. */
export function tutorialTourHeading(tour: string, t: Translate): string {
    return t("tutorial.tour.heading", { tour }, "Tour: {tour}");
}

/** "Take a tour: {tour}" - the palette row and tour-list button for one destination tour. */
export function tutorialLaunchTourLabel(tour: string, t: Translate): string {
    return t("tutorial.launch.tour", { tour }, "Take a tour: {tour}");
}

/** The card's message when a step's control is not on screen, before and after a reveal attempt. */
export function tutorialMissingText(tried: boolean, t: Translate): string {
    return tried
        ? t("tutorial.missing.still", "Still not showing. Try a larger window, or skip this step.")
        : t(
              "tutorial.missing.message",
              "This step points at a control that is not showing right now. It may be on another page, or hidden by the window size.",
          );
}

/** The button that asks the shell to show a step's page. */
export function tutorialRevealLabel(t: Translate): string {
    return t("tutorial.controls.reveal", "Show it");
}
