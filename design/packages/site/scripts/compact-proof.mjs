#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const PROOF_SCHEMA_VERSION = 3;
const COMPACT_BREAKPOINT = 900;
const TARGET_SIZE = 44;
const MODES = new Set(["english", "cantonese", "bilingual"]);
const DEFAULT_MATRIX = [
    { label: "phone-320x700-en", width: 320, height: 700, scale: 1, mode: "english" },
    { label: "phone-360x640-en", width: 360, height: 640, scale: 1, mode: "english" },
    { label: "phone-390x844-bi", width: 390, height: 844, scale: 1, mode: "bilingual" },
    { label: "phone-414x896-en", width: 414, height: 896, scale: 1, mode: "english" },
    { label: "phone-430x932-bi", width: 430, height: 932, scale: 1, mode: "bilingual" },
    { label: "phone-390x844-bi-2x", width: 390, height: 844, scale: 2, mode: "bilingual" },
    { label: "tablet-768x1024-en", width: 768, height: 1024, scale: 1, mode: "english" },
    { label: "compact-edge-899x900-bi", width: 899, height: 900, scale: 1, mode: "bilingual" },
    { label: "desktop-edge-900x900-en", width: 900, height: 900, scale: 1, mode: "english" },
    { label: "desktop-1024x768-bi", width: 1024, height: 768, scale: 1, mode: "bilingual" },
    { label: "desktop-1440x900-en", width: 1440, height: 900, scale: 1, mode: "english" },
];

function usage() {
    return [
        "usage:",
        "  compact-proof.mjs matrix <output.json>",
        "  compact-proof.mjs <width> <height> <scale> <english|cantonese|bilingual> <output.json>",
        "",
        "environment:",
        "  PAGES_PROOF_CDP_PORT       Chromium remote-debugging port (default: 49229)",
        "  PAGES_PROOF_TARGET_URL     Exact page URL when more than one CDP page exists",
        "  PAGES_PROOF_SCREENSHOT_DIR Optional directory for one PNG per viewport",
    ].join("\n");
}

function parsePositiveNumber(value, name, integer = false) {
    const parsed = integer ? Number.parseInt(value ?? "", 10) : Number.parseFloat(value ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error(`${name} must be positive.\n${usage()}`);
    return parsed;
}

function parseArguments(argv) {
    if (argv[0] === "matrix") {
        if (argv.length !== 2 || argv[1] === undefined) throw new Error(usage());
        return { output: argv[1], matrix: DEFAULT_MATRIX, invocation: "matrix" };
    }
    if (argv.length !== 5) throw new Error(usage());
    const [widthText, heightText, scaleText, mode, output] = argv;
    if (!MODES.has(mode)) throw new Error(usage());
    const width = parsePositiveNumber(widthText, "width", true);
    const height = parsePositiveNumber(heightText, "height", true);
    const scale = parsePositiveNumber(scaleText, "scale");
    return {
        output,
        invocation: "single",
        matrix: [{ label: `${width}x${height}-${mode}-${scale}x`, width, height, scale, mode }],
    };
}

const request = parseArguments(process.argv.slice(2));
const cdpPort = parsePositiveNumber(process.env.PAGES_PROOF_CDP_PORT ?? "49229", "CDP port", true);
const exactTargetUrl = process.env.PAGES_PROOF_TARGET_URL;
const screenshotDirectory = process.env.PAGES_PROOF_SCREENSHOT_DIR;

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(async (response) => {
    if (!response.ok) throw new Error(`CDP target discovery returned HTTP ${response.status}.`);
    return response.json();
});
const pages = targets.filter(
    (candidate) =>
        candidate.type === "page" &&
        typeof candidate.url === "string" &&
        /^https?:\/\//.test(candidate.url) &&
        typeof candidate.webSocketDebuggerUrl === "string",
);
const target = exactTargetUrl
    ? pages.find((candidate) => candidate.url === exactTargetUrl)
    : pages.length === 1
      ? pages[0]
      : undefined;
if (target === undefined) {
    const detail = pages.map((candidate) => candidate.url).join(", ") || "none";
    throw new Error(
        exactTargetUrl
            ? `No CDP page exactly matches PAGES_PROOF_TARGET_URL=${exactTargetUrl}. Pages: ${detail}`
            : `Expected exactly one HTTP(S) CDP page; found ${pages.length}: ${detail}. Set PAGES_PROOF_TARGET_URL.`,
    );
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    const timer = setTimeout(
        () => reject(new Error("Timed out connecting to the CDP page.")),
        10_000,
    );
    socket.addEventListener(
        "open",
        () => {
            clearTimeout(timer);
            resolve();
        },
        { once: true },
    );
    socket.addEventListener(
        "error",
        (event) => {
            clearTimeout(timer);
            reject(event.error ?? new Error("The CDP WebSocket failed."));
        },
        { once: true },
    );
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error === undefined) waiter.resolve(message.result);
    else waiter.reject(new Error(JSON.stringify(message.error)));
});

function send(method, params = {}) {
    sequence += 1;
    const id = sequence;
    const reply = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP ${method} timed out.`));
        }, 30_000);
        pending.set(id, { resolve, reject, timer });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return reply;
}

async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
    });
    if (result.exceptionDetails !== undefined) {
        const description = result.exceptionDetails.exception?.description;
        throw new Error(
            description ?? result.exceptionDetails.text ?? "Runtime evaluation failed.",
        );
    }
    return result.result.value;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Runs in the canonical archive page. Keep this function self-contained: CDP serializes its
 * source, so outer-scope helpers are deliberately unavailable here.
 */
async function runBrowserProof(config) {
    const failures = [];
    const routes = [];
    const builders = [];
    const tolerance = 0.75;
    const wait = (milliseconds = 40) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const compactExpected = config.width < config.compactBreakpoint;
    const addFailure = (code, context, detail = null) => {
        failures.push({ code, context, detail });
    };
    const rectObject = (rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    });
    const text = (element) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
    const label = (element) =>
        element?.getAttribute?.("aria-label") ||
        element?.getAttribute?.("title") ||
        text(element).slice(0, 120) ||
        element?.id ||
        element?.tagName ||
        "unknown";
    const hiddenByTree = (element) => {
        for (let node = element; node instanceof HTMLElement; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (
                node.hidden ||
                node.inert ||
                node.getAttribute("aria-hidden") === "true" ||
                style.display === "none" ||
                style.visibility === "hidden" ||
                style.contentVisibility === "hidden"
            )
                return true;
        }
        return false;
    };
    const rendered = (element) => {
        if (!(element instanceof HTMLElement) || hiddenByTree(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const intersectsViewport = (element) => {
        if (!rendered(element)) return false;
        const rect = element.getBoundingClientRect();
        return (
            rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
        );
    };
    const findButton = (name, root = document) => {
        const buttons = [...root.querySelectorAll("button")].filter((button) => rendered(button));
        return (
            buttons.find(
                (button) => button.getAttribute("aria-label") === name || text(button) === name,
            ) ??
            buttons.find((button) => text(button).includes(name)) ??
            null
        );
    };
    const findHeading = (name) =>
        [...document.querySelectorAll("#wl-main h1")].find(
            (heading) => rendered(heading) && text(heading).startsWith(name),
        ) ?? null;
    const setNativeValue = (element, value) => {
        const prototype =
            element instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const routeTo = async (hash, heading) => {
        if (location.hash !== hash) location.hash = hash;
        for (let attempt = 0; attempt < 40; attempt += 1) {
            await wait(25);
            const found = findHeading(heading);
            if (location.hash === hash && found) {
                const main = document.getElementById("wl-main");
                if (main) main.scrollTop = 0;
                await wait(35);
                return found;
            }
        }
        return null;
    };
    const nearestFieldTarget = (control) => {
        if (!(
            control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement ||
            control instanceof HTMLSelectElement
        ))
            return control;
        const candidates = [];
        if (["checkbox", "radio"].includes(control.type)) {
            const explicit = control.id
                ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
                : null;
            if (explicit instanceof HTMLElement) candidates.push(explicit);
            const wrapping = control.closest("label");
            if (wrapping instanceof HTMLElement) candidates.push(wrapping);
        }
        for (
            let node = control.parentElement, depth = 0;
            node && depth < 3;
            node = node.parentElement, depth += 1
        ) {
            if (node.children.length <= 8) candidates.push(node);
        }
        return (
            candidates.find((candidate) => {
                const rect = candidate.getBoundingClientRect();
                return (
                    rect.width >= config.targetSize - tolerance &&
                    rect.height >= config.targetSize - tolerance
                );
            }) ?? control
        );
    };
    const intentionalHorizontalOwner = (element) => {
        for (
            let node = element.parentElement;
            node instanceof HTMLElement;
            node = node.parentElement
        ) {
            const style = getComputedStyle(node);
            if (
                !["auto", "scroll"].includes(style.overflowX) ||
                node.scrollWidth <= node.clientWidth + tolerance
            )
                continue;
            if (
                node.matches("[data-proof-horizontal-scroller='true'], [role='tablist']") ||
                node.getAttribute("aria-label")?.toLowerCase().includes("tab")
            )
                return label(node);
            return null;
        }
        return null;
    };
    const layoutAudit = (context, scope = document.body) => {
        const all = [...scope.querySelectorAll("*")].filter(
            (element) => element instanceof HTMLElement && rendered(element),
        );
        const overflow = [];
        for (const element of all) {
            if (element.matches(".wl-skip-link:not(:focus)")) continue;
            const rect = element.getBoundingClientRect();
            if (rect.left >= -tolerance && rect.right <= innerWidth + tolerance) continue;
            const owner = intentionalHorizontalOwner(element);
            overflow.push({
                label: label(element),
                tag: element.tagName,
                rect: rectObject(rect),
                classification: owner ? "intentional-horizontal-scroller" : "accidental",
                scrollOwner: owner,
            });
        }
        const controlSelector = [
            "button",
            "a[href]",
            "input:not([type='hidden'])",
            "select",
            "textarea",
            "[role='button']",
            "[role='tab']",
            "[role='switch']",
            "[role='checkbox']",
            "[role='radio']",
            "[role='menuitem']",
            "[role='option']",
        ].join(",");
        const controls = [...scope.querySelectorAll(controlSelector)].filter((element) =>
            rendered(element),
        );
        const undersized = [];
        const clipped = [];
        for (const control of controls) {
            const target = nearestFieldTarget(control);
            const targetRect = target.getBoundingClientRect();
            if (
                targetRect.width < config.targetSize - tolerance ||
                targetRect.height < config.targetSize - tolerance
            ) {
                undersized.push({
                    label: label(control),
                    tag: control.tagName,
                    inputType: control instanceof HTMLInputElement ? control.type : null,
                    measured: target === control ? "control" : "field-proxy",
                    rect: rectObject(targetRect),
                });
            }
            const rect = control.getBoundingClientRect();
            const ownClip =
                control.scrollWidth > control.clientWidth + 1 ||
                control.scrollHeight > control.clientHeight + 1;
            const horizontalEscape = rect.left < -tolerance || rect.right > innerWidth + tolerance;
            if (ownClip || (horizontalEscape && intentionalHorizontalOwner(control) === null)) {
                clipped.push({
                    label: label(control),
                    ownClip,
                    horizontalEscape,
                    rect: rectObject(rect),
                });
            }
        }
        const sample = (items) => items.slice(0, 12);
        const result = {
            context,
            documentOverflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
            overflowCount: overflow.length,
            accidentalOverflowCount: overflow.filter((item) => item.classification === "accidental")
                .length,
            intentionalOverflowCount: overflow.filter(
                (item) => item.classification === "intentional-horizontal-scroller",
            ).length,
            overflow: sample(overflow),
            controlCount: controls.length,
            undersizedCount: undersized.length,
            undersized: sample(undersized),
            clippedCount: clipped.length,
            clipped: sample(clipped),
        };
        if (result.documentOverflowX > tolerance || result.bodyOverflowX > tolerance)
            addFailure("horizontal-document-overflow", context, {
                document: result.documentOverflowX,
                body: result.bodyOverflowX,
            });
        if (result.accidentalOverflowCount > 0)
            addFailure("accidental-offscreen-elements", context, {
                count: result.accidentalOverflowCount,
            });
        if (undersized.length > 0)
            addFailure("undersized-touch-targets", context, { count: undersized.length });
        if (clipped.length > 0) addFailure("clipped-controls", context, { count: clipped.length });
        return result;
    };
    const overlayAudit = (overlay, context) => {
        if (!(overlay instanceof HTMLElement) || !rendered(overlay)) {
            addFailure("overlay-missing", context);
            return null;
        }
        const rect = overlay.getBoundingClientRect();
        const bounded =
            rect.left >= -tolerance &&
            rect.top >= -tolerance &&
            rect.right <= innerWidth + tolerance &&
            rect.bottom <= innerHeight + tolerance;
        const scrollBodies = [...overlay.querySelectorAll("*")]
            .filter((element) => {
                if (!(element instanceof HTMLElement) || !rendered(element)) return false;
                const overflowY = getComputedStyle(element).overflowY;
                return ["auto", "scroll"].includes(overflowY);
            })
            .map((element) => ({
                label: label(element),
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                positive: element.scrollHeight > element.clientHeight + 1,
            }));
        const result = {
            rect: rectObject(rect),
            bounded,
            scrollBodies,
            hasPositiveScrollBody: scrollBodies.some((body) => body.positive),
        };
        if (!bounded) addFailure("overlay-out-of-bounds", context, result.rect);
        if (!result.hasPositiveScrollBody)
            addFailure("overlay-positive-scroll-body-missing", context, scrollBodies);
        return result;
    };
    const adjacent = (field, trigger) => {
        if (!(field instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return false;
        const row = trigger.parentElement;
        if (!(row instanceof HTMLElement) || !row.contains(field)) return false;
        const directFieldOwner = [...row.children].find(
            (child) => child === field || child.contains(field),
        );
        const directTriggerOwner = [...row.children].find(
            (child) => child === trigger || child.contains(trigger),
        );
        if (!directFieldOwner || !directTriggerOwner || directFieldOwner === directTriggerOwner)
            return false;
        const fieldIndex = [...row.children].indexOf(directFieldOwner);
        const triggerIndex = [...row.children].indexOf(directTriggerOwner);
        return Math.abs(fieldIndex - triggerIndex) === 1;
    };

    const expectedLanguage =
        config.mode === "cantonese" ? "yue" : config.mode === "bilingual" ? "bilingual" : "en";
    const storage = {
        language: JSON.parse(localStorage.getItem("wl-site:language") ?? "null"),
        settings: JSON.parse(localStorage.getItem("wl-site:settings") ?? "null"),
    };
    if (storage.language !== expectedLanguage)
        addFailure("language-storage", "startup", {
            expected: expectedLanguage,
            actual: storage.language,
        });
    if (storage.settings?.targetSize !== config.targetSize)
        addFailure("target-size-storage", "startup", {
            expected: config.targetSize,
            actual: storage.settings?.targetSize,
        });

    const viewport = { width: innerWidth, height: innerHeight, scale: devicePixelRatio };
    if (
        viewport.width !== config.width ||
        viewport.height !== config.height ||
        Math.abs(viewport.scale - config.scale) > 0.001
    )
        addFailure("viewport-mismatch", "startup", { expected: config, actual: viewport });
    const currentMenuButton = () =>
        document.querySelector(
            "[data-action='open-navigation'], button[aria-label='Open navigation']",
        );
    const currentSideNavigation = () =>
        document.querySelector(
            "[data-navigation-drawer], aside[aria-label='Documentation navigation']",
        );
    const menuButton = currentMenuButton();
    const bottomNavigation = document.querySelector("nav[aria-label='Primary']");
    const sideNavigation = currentSideNavigation();
    const compactActual =
        menuButton instanceof HTMLElement &&
        intersectsViewport(menuButton) &&
        bottomNavigation instanceof HTMLElement &&
        rendered(bottomNavigation);
    if (compactActual !== compactExpected)
        addFailure("compact-breakpoint", "startup", {
            expected: compactExpected,
            actual: compactActual,
            breakpoint: 900,
        });
    if (
        !compactExpected &&
        (!(sideNavigation instanceof HTMLElement) || !intersectsViewport(sideNavigation))
    )
        addFailure("desktop-navigation-missing", "startup");

    const header = document.querySelector("body header");
    const headerItems =
        header instanceof HTMLElement
            ? [...header.children].filter((item) => item instanceof HTMLElement && rendered(item))
            : [];
    const headerCollisions = [];
    for (let leftIndex = 0; leftIndex < headerItems.length; leftIndex += 1) {
        const left = headerItems[leftIndex].getBoundingClientRect();
        if (left.left < -tolerance || left.right > innerWidth + tolerance)
            headerCollisions.push({
                type: "offscreen",
                label: label(headerItems[leftIndex]),
                rect: rectObject(left),
            });
        for (let rightIndex = leftIndex + 1; rightIndex < headerItems.length; rightIndex += 1) {
            const right = headerItems[rightIndex].getBoundingClientRect();
            const overlaps =
                left.left < right.right - tolerance &&
                left.right > right.left + tolerance &&
                left.top < right.bottom - tolerance &&
                left.bottom > right.top + tolerance;
            if (overlaps)
                headerCollisions.push({
                    type: "overlap",
                    left: label(headerItems[leftIndex]),
                    right: label(headerItems[rightIndex]),
                    leftRect: rectObject(left),
                    rightRect: rectObject(right),
                });
        }
    }
    if (headerCollisions.length > 0) addFailure("header-collision", "header", headerCollisions);

    let drawer = { applicable: compactExpected };
    if (compactExpected) {
        const drawerButton = currentMenuButton();
        const drawerNavigation = currentSideNavigation();
        if (
            !(drawerButton instanceof HTMLButtonElement) ||
            !(drawerNavigation instanceof HTMLElement)
        ) {
            addFailure("drawer-controls-missing", "drawer");
        } else {
            const initialFocus = document.activeElement;
            drawerButton.focus();
            drawerButton.click();
            await wait(360);
            const liveOpenButton = currentMenuButton() ?? drawerButton;
            const liveOpenNavigation = currentSideNavigation() ?? drawerNavigation;
            const openRect = liveOpenNavigation.getBoundingClientRect();
            const open = intersectsViewport(liveOpenNavigation);
            const expanded = liveOpenButton?.getAttribute("aria-expanded") ?? null;
            const controls = liveOpenButton?.getAttribute("aria-controls") ?? null;
            drawer = {
                applicable: true,
                open,
                openRect: rectObject(openRect),
                expanded,
                controls,
                controlledElementExists: controls
                    ? document.getElementById(controls) === liveOpenNavigation
                    : false,
                accessibleName: liveOpenNavigation.getAttribute("aria-label"),
            };
            if (!open) addFailure("drawer-did-not-open", "drawer", drawer);
            if (expanded !== "true")
                addFailure("drawer-expanded-state", "drawer", {
                    expected: "true",
                    actual: expanded,
                });
            if (!drawer.controlledElementExists)
                addFailure("drawer-aria-controls", "drawer", controls);
            if (liveOpenButton instanceof HTMLButtonElement) liveOpenButton.click();
            await wait(360);
            const liveClosedButton = currentMenuButton() ?? drawerButton;
            const liveClosedNavigation = currentSideNavigation() ?? drawerNavigation;
            drawer.closed = !intersectsViewport(liveClosedNavigation);
            drawer.closedExpanded = liveClosedButton?.getAttribute("aria-expanded") ?? null;
            drawer.closedSemantically =
                liveClosedNavigation.hidden ||
                liveClosedNavigation.inert ||
                liveClosedNavigation.getAttribute("aria-hidden") === "true";
            drawer.focusReturned = document.activeElement === liveClosedButton;
            drawer.initialFocusWasRestored = initialFocus === document.activeElement;
            if (!drawer.closed) addFailure("drawer-did-not-close", "drawer");
            if (drawer.closedExpanded !== "false")
                addFailure("drawer-expanded-state", "drawer-closed", {
                    expected: "false",
                    actual: drawer.closedExpanded,
                });
            if (!drawer.closedSemantically) addFailure("drawer-closed-still-accessible", "drawer");
            if (!drawer.focusReturned) addFailure("drawer-focus-return", "drawer");
        }
    }

    let homeHeading = await routeTo("#/", "Your Minecraft world");
    let hero = null;
    if (!homeHeading) {
        addFailure("route-unreachable", "home", "#/");
    } else {
        const heroSurface = homeHeading.closest("section");
        const download = heroSurface?.querySelector("a[href*='/releases/download/']");
        const docsCta = [...(heroSurface?.querySelectorAll("button") ?? [])].find((button) =>
            text(button).includes("Read the documentation"),
        );
        hero = {
            downloadPresent: download instanceof HTMLAnchorElement,
            downloadHref: download instanceof HTMLAnchorElement ? download.href : null,
            docsPresent: docsCta instanceof HTMLButtonElement,
            bounds: [download, docsCta]
                .filter((item) => item instanceof HTMLElement)
                .map((item) => ({
                    label: label(item),
                    rect: rectObject(item.getBoundingClientRect()),
                })),
        };
        if (
            !(download instanceof HTMLAnchorElement) ||
            !/\/releases\/download\/[^/]+\/[^/]+/.test(download.href)
        )
            addFailure("hero-download-cta", "home", hero.downloadHref);
        if (!(docsCta instanceof HTMLButtonElement)) addFailure("hero-documentation-cta", "home");
        else {
            docsCta.click();
            for (let attempt = 0; attempt < 20 && location.hash !== "#/docs"; attempt += 1)
                await wait(25);
            hero.docsWired = location.hash === "#/docs" && findHeading("Documentation") !== null;
            if (!hero.docsWired)
                addFailure("hero-documentation-cta-unwired", "home", location.hash);
            const returnedHomeHeading = await routeTo("#/", "Your Minecraft world");
            if (returnedHomeHeading) homeHeading = returnedHomeHeading;
        }
        const yue = homeHeading.parentElement?.querySelector("p");
        const yueVisible =
            yue instanceof HTMLElement && rendered(yue) && /[\u3400-\u9fff]/u.test(text(yue));
        const language = {
            requested: expectedLanguage,
            rootLang: document.documentElement.lang,
            englishVisible: rendered(homeHeading),
            cantoneseVisible: yueVisible,
        };
        hero.language = language;
        if (expectedLanguage === "en" && yueVisible)
            addFailure("english-mode-cantonese-copy", "home", language);
        if (
            expectedLanguage === "bilingual" &&
            (!language.englishVisible || !language.cantoneseVisible)
        )
            addFailure("bilingual-copy-missing", "home", language);
        if (expectedLanguage === "yue" && document.documentElement.lang !== "zh-HK")
            addFailure("cantonese-root-language", "home", language);
    }

    const routeSpecs = [
        { name: "home", hash: "#/", heading: "Your Minecraft world" },
        {
            name: "documentation",
            hash: "#/docs",
            heading: "Documentation",
            field: "Filter articles",
            trigger: "Regex builder for articles",
            scope: "docs",
        },
        {
            name: "screenshots",
            hash: "#/screenshots",
            heading: "Screenshots",
            field: "Filter screenshots",
            trigger: "Regex builder for screenshots",
            scope: "shots",
            grid: "figure",
        },
        {
            name: "settings",
            hash: "#/settings",
            heading: "Settings",
            field: "Search settings",
            trigger: "Regex builder for settings",
            scope: "settings",
            grid: "settings",
        },
        {
            name: "appearance",
            hash: "#/settings/appearance",
            heading: "Appearance",
            field: "Search per-element editors",
            trigger: "Regex builder for elements",
            scope: "appearance",
        },
        { name: "automation", hash: "#/settings/automation", heading: "Automation" },
        { name: "data", hash: "#/settings/data", heading: "Data" },
        {
            name: "search",
            hash: "#/search",
            heading: "Search",
            field: "Search documentation",
            trigger: "Regex builder",
            scope: "search",
        },
        {
            name: "changelog",
            hash: "#/changelog",
            heading: "Changelog",
            field: "Search the changelog",
            trigger: "Regex builder for the changelog",
            scope: "changelog",
        },
        {
            name: "notifications",
            hash: "#/notifications",
            heading: "Notifications",
            field: "Search notifications",
            trigger: "Regex builder for notifications",
            scope: "notif",
        },
    ];
    const builderSpecs = [];
    for (const spec of routeSpecs) {
        const heading = await routeTo(spec.hash, spec.heading);
        const route = { name: spec.name, hash: spec.hash, reachable: heading !== null };
        if (!heading) {
            addFailure("route-unreachable", spec.name, spec.hash);
            routes.push(route);
            continue;
        }
        const routeRoot = heading.parentElement;
        route.layout = layoutAudit(`route:${spec.name}`);
        if (spec.grid && routeRoot instanceof HTMLElement) {
            let cells = [];
            if (spec.grid === "figure")
                cells = [...routeRoot.querySelectorAll("figure")].filter(rendered);
            else if (spec.grid === "settings") {
                const field = routeRoot.querySelector("input[aria-label='Search settings']");
                const possible = [...routeRoot.querySelectorAll("button")].filter(
                    (button) =>
                        rendered(button) &&
                        button !== findButton(spec.trigger, routeRoot) &&
                        button.getBoundingClientRect().height > 80,
                );
                cells = possible;
                route.settingsSearchPresent = field instanceof HTMLInputElement;
            }
            const routeRect = routeRoot.getBoundingClientRect();
            route.grid = {
                cellCount: cells.length,
                routeRect: rectObject(routeRect),
                cells: cells.map((cell) => rectObject(cell.getBoundingClientRect())),
                outOfBounds: cells
                    .filter((cell) => {
                        const rect = cell.getBoundingClientRect();
                        return (
                            rect.left < routeRect.left - tolerance ||
                            rect.right > routeRect.right + tolerance
                        );
                    })
                    .map((cell) => ({
                        label: label(cell),
                        rect: rectObject(cell.getBoundingClientRect()),
                    })),
            };
            if (route.grid.cellCount === 0) addFailure("grid-empty", spec.name);
            if (route.grid.outOfBounds.length > 0)
                addFailure("grid-horizontal-overflow", spec.name, route.grid.outOfBounds);
        }
        if (spec.field) {
            const field = document.querySelector(`input[aria-label="${spec.field}"]`);
            const trigger = findButton(spec.trigger);
            route.search = {
                fieldPresent: field instanceof HTMLInputElement,
                triggerPresent: trigger instanceof HTMLButtonElement,
                adjacent: adjacent(field, trigger),
            };
            if (!route.search.fieldPresent)
                addFailure("search-field-missing", spec.name, spec.field);
            if (!route.search.triggerPresent)
                addFailure("adjacent-regex-builder-missing", spec.name, spec.trigger);
            if (route.search.fieldPresent && route.search.triggerPresent && !route.search.adjacent)
                addFailure("regex-builder-not-adjacent", spec.name);
            builderSpecs.push({ ...spec, fieldElement: field, triggerElement: trigger });
        }
        routes.push(route);
    }

    const automationHeading = await routeTo("#/settings/automation", "Automation");
    const addRule = automationHeading
        ? [...automationHeading.parentElement.querySelectorAll("button")].find((button) =>
              /add.*rule/i.test(text(button)),
          )
        : null;
    if (!(addRule instanceof HTMLButtonElement))
        addFailure(
            "schedule-editor-missing",
            "automation",
            "No Add rule control is present on the Automation settings route.",
        );

    const navigationBuilderSetup = async () => {
        await routeTo("#/docs", "Documentation");
        const navigationButton = currentMenuButton();
        let navigationSurface = currentSideNavigation();
        if (
            compactExpected &&
            navigationButton instanceof HTMLButtonElement &&
            !intersectsViewport(navigationSurface)
        ) {
            navigationButton.click();
            await wait(360);
            navigationSurface = currentSideNavigation();
        }
        const field = document.querySelector("input[aria-label='Filter navigation']");
        const trigger = findButton("Regex builder for navigation", navigationSurface ?? document);
        if (!(field instanceof HTMLInputElement))
            addFailure("search-field-missing", "navigation", "Filter navigation");
        if (!(trigger instanceof HTMLButtonElement))
            addFailure(
                "adjacent-regex-builder-missing",
                "navigation",
                "Regex builder for navigation",
            );
        if (
            field instanceof HTMLInputElement &&
            trigger instanceof HTMLButtonElement &&
            !adjacent(field, trigger)
        )
            addFailure("regex-builder-not-adjacent", "navigation");
        return {
            name: "navigation",
            scope: "sidebar",
            fieldElement: field,
            triggerElement: trigger,
        };
    };
    builderSpecs.unshift(await navigationBuilderSetup());

    let moreSheet = { applicable: compactExpected };
    if (compactExpected && bottomNavigation instanceof HTMLElement) {
        const navigationBeforeMore = currentSideNavigation();
        const navigationButtonBeforeMore = currentMenuButton();
        if (
            navigationBeforeMore instanceof HTMLElement &&
            intersectsViewport(navigationBeforeMore) &&
            navigationButtonBeforeMore instanceof HTMLButtonElement
        ) {
            navigationButtonBeforeMore.click();
            await wait(360);
        }
        const currentMoreButton = () =>
            [...document.querySelectorAll("nav[aria-label='Primary'] button")].find((button) =>
                /\bMore\b/i.test(text(button)),
            ) ?? null;
        const openMore = async () => {
            const trigger = currentMoreButton();
            if (!(trigger instanceof HTMLButtonElement)) return { trigger: null, sheet: null };
            let command = findButton("Command palette");
            let candidate = command?.parentElement?.parentElement ?? null;
            if (!(candidate instanceof HTMLElement) || !rendered(candidate)) {
                trigger.click();
                await wait(300);
                command = findButton("Command palette");
                candidate = command?.parentElement?.parentElement ?? null;
            }
            return {
                trigger,
                sheet: candidate instanceof HTMLElement && rendered(candidate) ? candidate : null,
            };
        };
        const initialMoreButton = currentMoreButton();
        if (!(initialMoreButton instanceof HTMLButtonElement)) {
            addFailure("more-trigger-missing", "more-sheet");
        } else {
            const expectedActions = [
                { name: "Screenshots", destination: "#/screenshots", pattern: /Screenshots/i },
                { name: "Changelog", destination: "#/changelog", pattern: /Changelog/i },
                {
                    name: "Notifications",
                    destination: "#/notifications",
                    pattern: /Notifications/i,
                },
                { name: "Settings", destination: "#/settings", pattern: /Settings/i },
                { name: "Command palette", destination: "palette", pattern: /Command palette/i },
                {
                    name: "Language",
                    destination: "language",
                    pattern: /Language/i,
                    action: "language",
                },
                {
                    name: "Theme",
                    destination: "theme",
                    pattern: /Theme|Colour scheme/i,
                    action: "theme",
                },
            ];
            initialMoreButton.focus();
            const openedMore = await openMore();
            let sheet = openedMore.sheet;
            moreSheet = {
                applicable: true,
                opened: sheet instanceof HTMLElement && rendered(sheet),
                role: sheet?.getAttribute?.("role") ?? null,
                ariaLabel: sheet?.getAttribute?.("aria-label") ?? null,
                ariaModal: sheet?.getAttribute?.("aria-modal") ?? null,
                actions: [],
            };
            if (!moreSheet.opened) addFailure("more-sheet-did-not-open", "more-sheet");
            if (moreSheet.role !== "dialog")
                addFailure("more-sheet-dialog-semantics", "more-sheet", moreSheet);
            if (!moreSheet.ariaLabel) addFailure("more-sheet-accessible-name", "more-sheet");
            if (sheet instanceof HTMLElement) {
                const rect = sheet.getBoundingClientRect();
                moreSheet.rect = rectObject(rect);
                moreSheet.bounded =
                    rect.left >= -tolerance &&
                    rect.right <= innerWidth + tolerance &&
                    rect.bottom <= innerHeight + tolerance;
                if (!moreSheet.bounded)
                    addFailure("more-sheet-out-of-bounds", "more-sheet", moreSheet.rect);
            }
            for (const { name, destination, pattern, action: actionHook } of expectedActions) {
                const current = await openMore();
                sheet = current.sheet;
                const item =
                    sheet instanceof HTMLElement
                        ? ((actionHook
                              ? sheet.querySelector(
                                    `[data-action='${actionHook}'], [data-action='cycle-${actionHook}'], [data-action='toggle-${actionHook}']`,
                                )
                              : null) ??
                          [...sheet.querySelectorAll("button")].find(
                              (button) => rendered(button) && pattern.test(text(button)),
                          ) ??
                          null)
                        : null;
                const action = {
                    name,
                    destination,
                    present: item instanceof HTMLButtonElement,
                    wired: false,
                };
                if (!(item instanceof HTMLButtonElement)) {
                    addFailure("more-sheet-action-missing", "more-sheet", name);
                    moreSheet.actions.push(action);
                    continue;
                }
                const beforeLanguage = localStorage.getItem("wl-site:language");
                const beforeTheme = document.documentElement.dataset.theme;
                item.click();
                await wait(70);
                if (destination.startsWith("#/")) action.wired = location.hash === destination;
                else if (destination === "palette")
                    action.wired = rendered(
                        document.querySelector("[role='dialog'][aria-label='Command palette']"),
                    );
                else if (destination === "language")
                    action.wired = localStorage.getItem("wl-site:language") !== beforeLanguage;
                else if (destination === "theme")
                    action.wired = document.documentElement.dataset.theme !== beforeTheme;
                if (!action.wired) addFailure("more-sheet-action-unwired", "more-sheet", name);
                if (destination === "palette") {
                    document.dispatchEvent(
                        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
                    );
                    await wait(50);
                }
                moreSheet.actions.push(action);
            }
            const closing = await openMore();
            if (
                closing.trigger instanceof HTMLButtonElement &&
                closing.sheet instanceof HTMLElement
            ) {
                closing.trigger.focus();
                closing.trigger.click();
                await wait(300);
            }
            const commandAfterClose = findButton("Command palette");
            const sheetAfterClose = commandAfterClose?.parentElement?.parentElement ?? null;
            moreSheet.closed = !(
                sheetAfterClose instanceof HTMLElement && rendered(sheetAfterClose)
            );
            moreSheet.focusReturned = document.activeElement === closing.trigger;
            if (!moreSheet.closed) addFailure("more-sheet-did-not-close", "more-sheet");
            if (!moreSheet.focusReturned) addFailure("more-sheet-focus-return", "more-sheet");
        }
    }

    await routeTo("#/", "Your Minecraft world");
    const paletteOpener =
        [...document.querySelectorAll("button[aria-label='Search']")].find(intersectsViewport) ??
        [...document.querySelectorAll("body header button")].find(intersectsViewport) ??
        document.body;
    if (paletteOpener instanceof HTMLElement) paletteOpener.focus();
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "F",
            code: "KeyF",
            ctrlKey: true,
            shiftKey: true,
            bubbles: true,
        }),
    );
    await wait(80);
    const palette = document.querySelector("[role='dialog'][aria-label='Command palette']");
    const paletteField = document.querySelector("input[aria-label='Command palette query']");
    const paletteTrigger =
        palette instanceof HTMLElement
            ? ([...palette.querySelectorAll("button")].find((button) =>
                  /regex builder/i.test(button.getAttribute("aria-label") ?? text(button)),
              ) ?? null)
            : null;
    const paletteProof = {
        opened: palette instanceof HTMLElement && rendered(palette),
        fieldPresent: paletteField instanceof HTMLInputElement,
        triggerPresent: paletteTrigger instanceof HTMLButtonElement,
        adjacent: adjacent(paletteField, paletteTrigger),
        focusEntered: palette instanceof HTMLElement && palette.contains(document.activeElement),
    };
    if (!paletteProof.opened) addFailure("command-palette-unreachable", "palette");
    if (!paletteProof.focusEntered) addFailure("command-palette-focus-entry", "palette");
    if (!paletteProof.triggerPresent)
        addFailure("adjacent-regex-builder-missing", "palette", "Command palette query");
    if (paletteProof.triggerPresent && !paletteProof.adjacent)
        addFailure("regex-builder-not-adjacent", "palette");
    builderSpecs.push({
        name: "palette",
        scope: "palette",
        fieldElement: paletteField,
        triggerElement: paletteTrigger,
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(60);
    paletteProof.closed = !(palette instanceof HTMLElement && rendered(palette));
    paletteProof.focusReturned = document.activeElement === paletteOpener;
    if (!paletteProof.closed) addFailure("command-palette-escape", "palette");
    if (!paletteProof.focusReturned) addFailure("command-palette-focus-return", "palette");

    for (const spec of builderSpecs) {
        let navigationSearchRoot = null;
        if (spec.name === "navigation") {
            await routeTo("#/docs", "Documentation");
            const liveNavigationButton = currentMenuButton();
            navigationSearchRoot = currentSideNavigation();
            if (
                compactExpected &&
                liveNavigationButton instanceof HTMLButtonElement &&
                !intersectsViewport(navigationSearchRoot)
            ) {
                liveNavigationButton.click();
                await wait(360);
                navigationSearchRoot = currentSideNavigation();
            }
        } else if (spec.name === "palette") {
            document.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "F",
                    code: "KeyF",
                    ctrlKey: true,
                    shiftKey: true,
                    bubbles: true,
                }),
            );
            await wait(60);
        } else {
            await routeTo(spec.hash, spec.heading);
        }
        const field =
            spec.name === "palette"
                ? document.querySelector("input[aria-label='Command palette query']")
                : document.querySelector(
                      `input[aria-label="${spec.field ?? "Filter navigation"}"]`,
                  );
        const searchRoot =
            spec.name === "navigation"
                ? (navigationSearchRoot ?? document)
                : spec.name === "palette"
                  ? (document.querySelector("[role='dialog'][aria-label='Command palette']") ??
                    document)
                  : document;
        const trigger =
            spec.name === "palette"
                ? ([...searchRoot.querySelectorAll("button")].find((button) =>
                      /regex builder/i.test(button.getAttribute("aria-label") ?? text(button)),
                  ) ?? null)
                : findButton(spec.trigger ?? "Regex builder for navigation", searchRoot);
        const proof = {
            name: spec.name,
            scope: spec.scope,
            fieldPresent: field instanceof HTMLInputElement,
            triggerPresent: trigger instanceof HTMLButtonElement,
            adjacent: adjacent(field, trigger),
        };
        if (!(field instanceof HTMLInputElement) || !(trigger instanceof HTMLButtonElement)) {
            proof.opened = false;
            builders.push(proof);
            if (spec.name === "palette") {
                document.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
                );
                await wait(40);
            }
            continue;
        }
        trigger.focus();
        trigger.click();
        await wait(220);
        const overlay = document.querySelector(
            "[role='dialog'][aria-label='Regular expression builder']",
        );
        proof.opened = overlay instanceof HTMLElement && rendered(overlay);
        if (!proof.opened) {
            addFailure("regex-builder-did-not-open", spec.name);
            builders.push(proof);
            continue;
        }
        proof.overlay = overlayAudit(overlay, `builder:${spec.name}`);
        const pattern = overlay.querySelector("input[aria-label='Regular expression pattern']");
        const sample = overlay.querySelector("textarea[aria-label='Test string']");
        const headings = text(overlay);
        proof.features = {
            pattern: pattern instanceof HTMLInputElement,
            sample: sample instanceof HTMLTextAreaElement,
            flags: /Flags/.test(headings),
            tokens: /Insert a piece/.test(headings),
            transforms: /Transform what you have already typed/.test(headings),
            fields: /Fields this builder searches/.test(headings),
            liveMatches: /Live result on this page/.test(headings),
            presets: /Presets for this field/.test(headings),
            copyOrExport: /Copy|Export/.test(headings),
        };
        for (const [feature, present] of Object.entries(proof.features)) {
            if (!present) addFailure("regex-builder-feature-missing", spec.name, feature);
        }
        if (pattern instanceof HTMLInputElement && sample instanceof HTMLTextAreaElement) {
            pattern.focus();
            setNativeValue(pattern, "render|world");
            setNativeValue(sample, "render world\nnothing");
            await wait(70);
            const refreshedPattern = document.querySelector(
                "input[aria-label='Regular expression pattern']",
            );
            const refreshedField =
                spec.name === "palette"
                    ? document.querySelector("input[aria-label='Command palette query']")
                    : document.querySelector(
                          `input[aria-label="${spec.field ?? "Filter navigation"}"]`,
                      );
            proof.patternValue = refreshedPattern?.value ?? null;
            proof.originValue = refreshedField?.value ?? null;
            proof.bidirectionalSync =
                proof.patternValue === "render|world" && proof.originValue === "render|world";
            if (!proof.bidirectionalSync)
                addFailure("regex-builder-query-sync", spec.name, {
                    pattern: proof.patternValue,
                    origin: proof.originValue,
                });
        }
        proof.layout = layoutAudit(`builder:${spec.name}`, overlay);
        const done = [...overlay.querySelectorAll("button")].find(
            (button) => text(button) === "Done",
        );
        if (!(done instanceof HTMLButtonElement)) {
            addFailure("regex-builder-done-missing", spec.name);
        } else {
            const currentPattern = overlay.querySelector(
                "input[aria-label='Regular expression pattern']",
            );
            if (currentPattern instanceof HTMLElement) currentPattern.focus();
            done.click();
            await wait(65);
            proof.closed = !rendered(overlay);
            proof.focusReturned = document.activeElement === trigger;
            if (!proof.closed) addFailure("regex-builder-did-not-close", spec.name);
            if (!proof.focusReturned) addFailure("regex-builder-focus-return", spec.name);
        }
        builders.push(proof);
        if (spec.name === "navigation" && compactExpected) {
            const liveNavigationButton = currentMenuButton();
            const liveNavigationSurface = currentSideNavigation();
            if (
                liveNavigationButton instanceof HTMLButtonElement &&
                intersectsViewport(liveNavigationSurface)
            ) {
                liveNavigationButton.click();
                await wait(360);
            }
        }
        if (spec.name === "palette") {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            await wait(40);
        }
    }

    await routeTo("#/", "Your Minecraft world");
    const finalLayout = layoutAudit("final:home");
    const expectedBuilderNames = [
        "navigation",
        "documentation",
        "screenshots",
        "settings",
        "appearance",
        "search",
        "changelog",
        "notifications",
        "palette",
    ];
    const actualBuilderNames = builders.map((builder) => builder.name);
    for (const name of expectedBuilderNames) {
        if (!actualBuilderNames.includes(name))
            addFailure("regex-builder-scope-unproven", "builders", name);
    }

    return {
        config,
        viewport,
        compact: {
            expected: compactExpected,
            actual: compactActual,
            breakpoint: config.compactBreakpoint,
        },
        storage,
        header: { itemCount: headerItems.length, collisions: headerCollisions },
        drawer,
        moreSheet,
        palette: paletteProof,
        hero,
        routes,
        builders,
        finalLayout,
        failures,
        passed: failures.length === 0,
    };
}

await send("Page.enable");
await send("Runtime.enable");

const frames = [];
try {
    if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
    for (const frame of request.matrix) {
        await send("Emulation.setDeviceMetricsOverride", {
            width: frame.width,
            height: frame.height,
            deviceScaleFactor: frame.scale,
            mobile: frame.width < COMPACT_BREAKPOINT,
            screenWidth: frame.width,
            screenHeight: frame.height,
        });
        const language =
            frame.mode === "cantonese" ? "yue" : frame.mode === "bilingual" ? "bilingual" : "en";
        await evaluate(`(() => {
            const prefix = "wl-site:";
            let current = {};
            try { current = JSON.parse(localStorage.getItem(prefix + "settings") || "{}"); } catch (_) {}
            localStorage.setItem(prefix + "language", JSON.stringify(${JSON.stringify(language)}));
            localStorage.setItem(prefix + "theme", JSON.stringify("light"));
            localStorage.setItem(prefix + "density", JSON.stringify("comfortable"));
            localStorage.setItem(prefix + "settings", JSON.stringify(Object.assign({}, current, {
                targetSize: ${TARGET_SIZE},
                startCollapsed: true,
                funnyEn: 4,
                funnyYue: 4,
                navPlacement: "left",
                baseSize: 16,
                lineHeight: 1.6
            })));
            location.hash = "#/";
            return Object.keys(localStorage).filter((key) => key.startsWith(prefix)).sort();
        })()`);
        await send("Page.reload", { ignoreCache: true });
        await sleep(550);
        const config = { ...frame, compactBreakpoint: COMPACT_BREAKPOINT, targetSize: TARGET_SIZE };
        let result;
        try {
            result = await evaluate(`(${runBrowserProof.toString()})(${JSON.stringify(config)})`);
        } catch (error) {
            result = {
                config,
                passed: false,
                failures: [
                    { code: "proof-driver-exception", context: frame.label, detail: String(error) },
                ],
            };
        }
        frames.push(result);
        if (screenshotDirectory) {
            const screenshot = await send("Page.captureScreenshot", {
                format: "png",
                fromSurface: true,
                captureBeyondViewport: false,
            });
            await writeFile(
                join(screenshotDirectory, `${frame.label}.png`),
                Buffer.from(screenshot.data, "base64"),
            );
        }
    }
} finally {
    socket.close();
}

const allFailures = frames.flatMap((frame) =>
    frame.failures.map((failure) => ({ viewport: frame.config.label, ...failure })),
);
const proof = {
    schemaVersion: PROOF_SCHEMA_VERSION,
    source: "worldlens-archive-canonical-runtime",
    generatedAt: new Date().toISOString(),
    target: { url: target.url, cdpPort },
    requested: {
        invocation: request.invocation,
        compactBreakpoint: COMPACT_BREAKPOINT,
        minimumTargetSize: TARGET_SIZE,
        matrix: request.matrix,
    },
    frames,
    verification: {
        frameCount: frames.length,
        passedFrames: frames.filter((frame) => frame.passed).length,
        failedFrames: frames.filter((frame) => !frame.passed).length,
        failureCount: allFailures.length,
        failures: allFailures,
        passed: allFailures.length === 0,
    },
};
await writeFile(request.output, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

const summary = {
    output: request.output,
    schemaVersion: PROOF_SCHEMA_VERSION,
    frameCount: proof.verification.frameCount,
    passedFrames: proof.verification.passedFrames,
    failedFrames: proof.verification.failedFrames,
    failureCount: proof.verification.failureCount,
    failureCodes: [...new Set(allFailures.map((failure) => failure.code))].sort(),
};
console.log(JSON.stringify(summary, null, 2));
if (!proof.verification.passed) process.exitCode = 1;
