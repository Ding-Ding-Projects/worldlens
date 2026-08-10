import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(
    /\r\n?/gu,
    "\n",
);
const enhancerSource = readFileSync(new URL("../src/archive-entry.ts", import.meta.url), "utf8").replace(
    /\r\n?/gu,
    "\n",
);
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8").replace(
    /\r\n?/gu,
    "\n",
);

const moduleBootMarker =
    /<script\b(?=[^>]*type="module")(?=[^>]*src="\/src\/archive-entry\.ts")[^>]*>\s*<\/script>/u;
const bottomNavRenderMarker =
    /<nav\b(?=[^>]*aria-label="Primary")[^>]*>\s*<sc-for\b(?=[^>]*list="\{\{ bottomNav \}\}")(?=[^>]*as="b")[^>]*>[\s\S]*?<button\b(?=[^>]*data-action="\{\{ b\.actionId \}\}")(?=[^>]*data-active="\{\{ b\.activeAttr \}\}")(?=[^>]*onClick="\{\{ b\.onClick \}\}")[^>]*>/u;
const moreRenderMarker =
    /<div\b(?=[^>]*id="wl-more-sheet")(?=[^>]*aria-labelledby="wl-more-title")[^>]*>[\s\S]*?<sc-for\b(?=[^>]*list="\{\{ moreItems \}\}")(?=[^>]*as="m")[^>]*>[\s\S]*?<button\b(?=[^>]*onClick="\{\{ m\.onClick \}\}")[^>]*>/u;
const sharedBuilderOverlayMarker =
    /<div\b(?=[^>]*class="wl-overlay-scrim")(?=[^>]*style="\{\{ builderScrimStyle \}\}")(?=[^>]*onClick="\{\{ closeBuilder \}\}")[^>]*><\/div>\s*<section\b(?=[^>]*style="\{\{ builderPanelStyle \}\}")(?=[^>]*role="dialog")(?=[^>]*aria-label="Regular expression builder")[^>]*>/u;
const horizontalTabSearchMarker =
    /<div\b(?=[^>]*style="\{\{ horizontalTabsStyle \}\}")(?=[^>]*aria-label="Open pages")[^>]*>[\s\S]*?<input\b(?=[^>]*value="\{\{ tabstripQuery \}\}")(?=[^>]*onChange="\{\{ ontabstripQuery \}\}")(?=[^>]*aria-label="Filter current tab strip")(?=[^>]*aria-describedby="wl-tabstrip-error")[^>]*>[\s\S]*?<button\b(?=[^>]*onClick="\{\{ toggletabstripBuilder \}\}")(?=[^>]*aria-label="Regex builder for current tab strip")[^>]*>[\s\S]*?<sc-for\b(?=[^>]*list="\{\{ horizontalTabItems \}\}")(?=[^>]*as="tab")[^>]*>/u;
const contentGridMarker =
    /<div style="\{\{ contentGridStyle \}\}">\s*<main\b(?=[^>]*id="wl-main")[^>]*>[\s\S]*?<\/main>\s*<aside\b(?=[^>]*style="\{\{ indexStyle \}\}")(?=[^>]*aria-label="On this page")[^>]*>[\s\S]*?<\/aside>\s*<\/div>/u;
const moreStateLabelMarker =
    /<sc-for\b(?=[^>]*list="\{\{ moreItems \}\}")(?=[^>]*as="m")[^>]*>[\s\S]*?<button\b(?=[^>]*aria-labelledby="\{\{ m\.labelId \}\}")[^>]*>[\s\S]*?<span\b(?=[^>]*id="\{\{ m\.labelId \}\}")(?=[^>]*class="wl-sr-only")[^>]*>[\s\S]*?\{\{ m\.ariaEn \}\}[\s\S]*?\{\{ m\.ariaYue \}\}/u;
const tabPanelMarker = /<div\b(?=[^>]*id="wl-tabpanel")(?=[^>]*role="tabpanel")[^>]*>/u;
const tabPanelSelectorMarker = /querySelector<HTMLElement>\("#wl-tabpanel"\)/u;
const tabListSelectorMarker = /\[data-wl-tablist="true"\]/u;
const tabActivationSelectorMarker = /button\[data-action="activate-tab"\]/u;
const tabCloseSelectorMarker = /button\[data-action="close-tab"\]/u;
const tabSelectedStateMarker = /row\.dataset\["active"\] === "true"/u;
const archiveControlInvocation = "node scripts/assert-archive-controls.mjs && ";
const packageScriptNames = ["dev", "build", "build:strict"];

function withoutComments(value) {
    return value
        .replace(/<!--[\s\S]*?-->/gu, "")
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^[\t ]*\/\/.*$/gmu, "");
}

const requiredControls = [
    ["module boot tag", moduleBootMarker],
    ["desktop home", /<button\b(?=[^>]*class="wl-brand")(?=[^>]*onClick="\{\{ goHome \}\}")(?=[^>]*aria-label="worldlens — home")[^>]*>/u],
    ["desktop search", /<div style="\{\{ searchBarStyle \}\}">\s*<button\b(?=[^>]*onClick="\{\{ goSearch \}\}")[^>]*>/u],
    ["desktop language", /<button\b(?=[^>]*class="wl-header-utility")(?=[^>]*onClick="\{\{ cycleLanguage \}\}")(?=[^>]*aria-label="\{\{ languageControlLabel \}\}")[^>]*>/u],
    ["desktop language state label", 'languageControlLabel:"Language and tone. Current: "'],
    ["desktop colour scheme", /<button\b(?=[^>]*class="wl-header-utility")(?=[^>]*onClick="\{\{ toggleTheme \}\}")(?=[^>]*aria-label="\{\{ themeTitle \}\}")[^>]*>/u],
    ["desktop colour-scheme state label", 'themeTitle: s.theme === "light" ? "Switch to dark" : "Switch to light"'],
    ["desktop notifications", /<button\b(?=[^>]*class="wl-header-utility")(?=[^>]*onClick="\{\{ goNotifications \}\}")(?=[^>]*aria-label="\{\{ notificationTitle \}\}")[^>]*>/u],
    ["desktop notification state label", 'notificationTitle:s.unread ? "Notification history, " + s.unread + " unread" : "Notification history, all read"'],
    ["desktop settings", /<button\b(?=[^>]*class="wl-header-utility")(?=[^>]*onClick="\{\{ goSettings \}\}")(?=[^>]*aria-label="Settings")[^>]*>/u],
    ["mobile home definition", /\{\s*id:PAGES\.home,\s*en:"Home",\s*yue:"\u4e3b\u9801",\s*icon:P\.home\s*\}/u],
    ["mobile documentation definition", /\{\s*id:PAGES\.docs,\s*en:"Docs",\s*yue:"\u6587\u4ef6",\s*icon:P\.docs\s*\}/u],
    ["mobile search definition", /\{\s*id:PAGES\.search,\s*en:"Search",\s*yue:"\u641c\u5c0b",\s*icon:P\.search\s*\}/u],
    ["mobile More definition", /\{\s*id:"more",\s*en:"More",\s*yue:"\u66f4\u591a",\s*icon:P\.more\s*\}/u],
    ["mobile language definition", /\{\s*en:"Language and tone",\s*yue:"\u8a9e\u8a00\u540c\u8a9e\u6c23",\s*icon:P\.globe,\s*action:"language"\s*\}/u],
    ["mobile colour scheme definition", /\{\s*en:"Colour scheme",\s*yue:"\u984f\u8272\u4e3b\u984c",\s*icon:s\.theme === "light" \? P\.dark : P\.light,\s*action:"theme"\s*\}/u],
    ["mobile screenshots definition", /\{\s*en:"Screenshots",\s*yue:"\u622a\u5716",\s*icon:P\.shots,\s*page:PAGES\.screenshots\s*\}/u],
    ["mobile changelog definition", /\{\s*en:"Changelog",\s*yue:"\u66f4\u65b0\u7d00\u9304",\s*icon:P\.changelog,\s*page:PAGES\.changelog\s*\}/u],
    ["mobile notifications definition", /\{\s*en:"Notifications",\s*yue:"\u901a\u77e5",\s*icon:P\.bell,\s*page:PAGES\.notifications\s*\}/u],
    ["mobile settings definition", /\{\s*en:"Settings",\s*yue:"\u8a2d\u5b9a",\s*icon:P\.tune,\s*page:PAGES\.settings\s*\}/u],
    ["mobile command palette definition", /\{\s*en:"Command palette",\s*yue:"\u6307\u4ee4\u9762\u677f",\s*icon:P\.palette,\s*page:"palette"\s*\}/u],
    ["bottom navigation render loop", bottomNavRenderMarker],
    ["mobile More render loop", moreRenderMarker],
    ["mobile More dialog semantics", /<div\b(?=[^>]*id="wl-more-sheet")(?=[^>]*class="wl-more-sheet")(?=[^>]*role="dialog")(?=[^>]*aria-modal="true")(?=[^>]*aria-labelledby="wl-more-title")[^>]*>/u],
    ["mobile More dialog label", /<div\b(?=[^>]*id="wl-more-title")[^>]*>/u],
    ["mobile More stateful accessible label", moreStateLabelMarker],
    ["mobile More language state", 'ariaEn = "Language and tone. Current: " + languageNamesEn[s.language] + ". Switch to " + languageNamesEn[nextLanguage] + "."'],
    ["mobile More colour-scheme state", 'ariaEn = "Colour scheme. Current: " + (s.theme === "light" ? "Light" : "Dark") + ". Switch to " + (s.theme === "light" ? "dark" : "light") + "."'],
    ["mobile More notification state", 'ariaEn = s.unread ? "Notifications, " + s.unread + " unread" : "Notifications, all read"'],
    ["palette field catalogue", /palette:\[\["label","Command and destination names"\],\["group","Command groups"\],\["kw","Search aliases"\]\]/u],
    ["palette field registration", /field\("palette", paletteItems\.length\);/u],
    ["tab-strip field catalogue", /tabstrip:\[\["title","Open tab titles"\]\]/u],
    ["tab-strip query state", /queries:\{\s*sidebar:"",\s*tabstrip:""/u],
    ["horizontal tab-strip search", horizontalTabSearchMarker],
    ["horizontal tab-strip filter", /const horizontalTabItems = tabItems\.filter\(\(t\) => this\.matchesK\("tabstrip", \{ title:t\.title \}\)\);/u],
    ["tab-strip builder corpus", /tabstrip: tabDefs\.map\(\(t\) => \(\{ title:t\.title \}\)\),/u],
    ["tab-strip builder hits", /tabstrip: horizontalTabItems\.map\(\(t\) => t\.title\),/u],
    ["tab-strip field registration", /field\("tabstrip", horizontalTabItems\.length\);/u],
    ["shared builder state", /const bk = s\.builderFor;\s*const bOpen = !!bk;/u],
    ["shared builder overlay", sharedBuilderOverlayMarker],
    ["dynamic tab-close label", /closeLabel:"Close tab " \+ t\.title/u],
    ["dynamic tab-close render binding", /aria-label="\{\{ tab\.closeLabel \}\}"/u],
    ["tab selected-state record", /closeLabel:"Close tab " \+ t\.title, activeAttr:t\.key === activeKey \? "true" : "false"/u],
    ["tab panel relationship", tabPanelMarker],
    ["tab list action scope", /data-wl-tablist="true"/u],
    ["tab activation action binding", /data-action="activate-tab"/u],
    ["tab close action binding", /data-action="close-tab"/u],
    ["supported tab close condition", /<sc-if value="\{\{ tab\.closable \}\}">/u],
    ["focus-preserving tab activation", /onClick:\(\) => this\.go\(t\.page, t\.articleId, t\.group, false\)/u],
    ["composition-safe global shortcuts", /this\._onKey = \(e\) => \{\s*if \(e\.isComposing \|\| e\.keyCode === 229\) return;/u],
    ["wide content and index grid", contentGridMarker],
    ["wide content grid model", /contentGridStyle:"flex:1;min-width:0;min-height:0;display:grid;grid-template-columns:"[\s\S]*?"minmax\(0,1fr\) 280px"/u],
    ["article paragraph narrow wrapping", /articleBlocks\.push\(\{ isParagraph:true, text:b\.v, style:"[^"]*overflow-wrap:anywhere;word-break:break-word;" \}\);/u],
    ["article code narrow wrapping", /articleBlocks\.push\(\{ isCode:true, text:b\.v, style:"[^"]*white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;[^"]*" \}\);/u],
    ["article list narrow wrapping", /isUnordered:b\.t === "ul"[\s\S]*?style:"[^"]*overflow-wrap:anywhere;word-break:break-word;"\s*\}\);/u],
    ["article block supported conditions", /<sc-if value="\{\{ b\.isHeading \}\}">[\s\S]*?<sc-if value="\{\{ b\.isParagraph \}\}">[\s\S]*?<sc-if value="\{\{ b\.isCode \}\}">[\s\S]*?<sc-if value="\{\{ b\.isUnordered \}\}">[\s\S]*?<sc-if value="\{\{ b\.isOrdered \}\}">/u],
    ["article boundary disabled model", /prevDisabled:!prevArt,\s*nextDisabled:!nextArt,\s*prevDisabledAttr:String\(!prevArt\),\s*nextDisabledAttr:String\(!nextArt\),/u],
    ["palette empty-state contrast", /paletteEmptyStyle: paletteItems\.length \? "display:none;" : "padding:18px 14px;font-size:13px;line-height:1\.6;color:var\(--osv\);"/u],
    ["contrast-safe compact helper text", /font-size:11px;font-weight:700;letter-spacing:\.6px;text-transform:uppercase;color:var\(--osv\);margin-bottom:4px;"[^>]*>Previous/u],
    ["installer download", /<a\b(?=[^>]*class="wl-hero-action")(?=[^>]*href="https:\/\/github\.com\/Ding-Ding-Projects\/worldlens\/releases\/download\/v0\.1\.943\/Worldlens-0\.1\.943-Setup\.exe")[^>]*>/u],
    ["documentation action", /<button\b(?=[^>]*class="wl-hero-action")(?=[^>]*onClick="\{\{ goDocs \}\}")[^>]*>/u],
    ["mobile header sizing", ".wl-header-utility{display:none!important;}"],
    ["mobile hero sizing", ".wl-hero-actions{display:grid!important;"],
    ["mobile safe areas", "--safe-t:env(safe-area-inset-top,0px)"],
    ["mobile screenshot sizing", "minmax(min(100%,300px),1fr)"],
    ["minimum touch sizing", "min-block-size:max(44px,var(--minhit))"],
    ["compact builder viewport bounds", "top:max(8px,var(--safe-t))"],
    ["closed mobile drawer state", /<aside\b(?=[^>]*aria-label="Documentation navigation")(?=[^>]*data-mobile-drawer="\{\{ drawerOpenAttr \}\}")[^>]*>/u],
];

const regexBuilderControls = [
    "togglesidebarBuilder",
    "toggletabstripBuilder",
    "toggledocsBuilder",
    "toggleshotsBuilder",
    "togglesettingsBuilder",
    "toggleappearanceBuilder",
    "togglesearchBuilder",
    "togglechangelogBuilder",
    "togglenotifBuilder",
    "togglepaletteBuilder",
];

const enhancerMarkers = [
    ["virtual runtime import", /^import "virtual:worldlens-archive-runtime";$/mu],
    ["tab panel selector", tabPanelSelectorMarker],
    ["tab list selector", tabListSelectorMarker],
    ["tab activation selector", tabActivationSelectorMarker],
    ["tab close selector", tabCloseSelectorMarker],
    ["tab selected state", tabSelectedStateMarker],
    ["drawer inert state", /drawer\.inert\s*=\s*compact\s*&&\s*!open;/u],
    ["localized More trigger", /button\[data-action="more"\]/u],
    ["background inert synchronization", /syncBackgroundInert\(modal\);/u],
    ["topmost modal selection", /getComputedStyle\(left\)\.zIndex/u],
    ["rendered palette history guard", /const palette = document\.querySelector<HTMLElement>\('\[role="dialog"\]\[aria-label="Command palette"\]'\);\s*const paletteAlreadyOpen = Boolean\(palette && rendered\(palette\)\);/u],
    ["nested Escape isolation", /event\.stopImmediatePropagation\(\);/u],
    ["body-level modal isolation", /parent === document\.body/u],
    ["layer-specific focus return", /lastBuilderTrigger/u],
];

function hasMarker(value, marker) {
    return typeof marker === "string" ? value.includes(marker) : marker.test(value);
}

function validate(indexValue, enhancerValue, packageValue = packageSource) {
    const executableIndex = withoutComments(indexValue);
    const executableEnhancer = withoutComments(enhancerValue);
    const missing = requiredControls.filter(([, marker]) => !hasMarker(executableIndex, marker));

    let packageManifest;
    try {
        packageManifest = JSON.parse(packageValue);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        missing.push(["package manifest", `invalid JSON: ${message}`]);
    }

    for (const scriptName of packageScriptNames) {
        const script = packageManifest?.scripts?.[scriptName];
        if (typeof script !== "string" || !script.startsWith(archiveControlInvocation)) {
            missing.push([
                `package script: ${scriptName}`,
                `expected the script to start with ${JSON.stringify(archiveControlInvocation)}`,
            ]);
        }
    }

    for (const control of regexBuilderControls) {
        const pattern = new RegExp(
            `<button\\b(?=[^>]*onClick="\\{\\{ ${control} \\}\\}")(?=[^>]*aria-label="[^"]*[Rr]egex builder[^"]*")[^>]*>`,
            "u",
        );
        if (!pattern.test(executableIndex)) missing.push([`regex builder: ${control}`, pattern]);
    }

    if (executableIndex.includes('href="#"')) {
        missing.push(["real link destinations", 'href="#" remains']);
    }

    for (const [label, marker] of enhancerMarkers) {
        if (!hasMarker(executableEnhancer, marker)) missing.push([`overlay enhancer: ${label}`, marker]);
    }

    const desktopUtilityCount = executableIndex.match(/<button\b[^>]*class="wl-header-utility"[^>]*>/gu)?.length ?? 0;
    if (desktopUtilityCount !== 4) {
        missing.push([
            "desktop utility control count",
            `expected four desktop utility controls with mobile alternatives; found ${desktopUtilityCount}`,
        ]);
    }

    const exactIndexCounts = [
        [
            "module boot tag count",
            /<script\b(?=[^>]*type="module")(?=[^>]*src="\/src\/archive-entry\.ts")[^>]*>\s*<\/script>/gu,
            1,
        ],
        [
            "bottom navigation render loop count",
            /<sc-for\b(?=[^>]*list="\{\{ bottomNav \}\}")(?=[^>]*as="b")[^>]*>/gu,
            1,
        ],
        [
            "mobile More render loop count",
            /<sc-for\b(?=[^>]*list="\{\{ moreItems \}\}")(?=[^>]*as="m")[^>]*>/gu,
            1,
        ],
        ["mobile More dialog label count", /id="wl-more-title"/gu, 1],
        [
            "shared builder overlay count",
            /<section\b(?=[^>]*style="\{\{ builderPanelStyle \}\}")(?=[^>]*role="dialog")(?=[^>]*aria-label="Regular expression builder")[^>]*>/gu,
            1,
        ],
        [
            "tab panel relationship count",
            /<div\b(?=[^>]*id="wl-tabpanel")(?=[^>]*role="tabpanel")[^>]*>/gu,
            1,
        ],
        ["dynamic tab-close render binding count", /aria-label="\{\{ tab\.closeLabel \}\}"/gu, 2],
        ["supported tab close condition count", /<sc-if value="\{\{ tab\.closable \}\}">/gu, 2],
        ["tab list action scope count", /data-wl-tablist="true"/gu, 2],
        ["tab selected-state binding count", /data-active="\{\{ tab\.activeAttr \}\}"/gu, 2],
        ["tab activation action binding count", /data-action="activate-tab"/gu, 2],
        ["tab close action binding count", /data-action="close-tab"/gu, 2],
        ["horizontal tab-strip result loop count", /<sc-for\b(?=[^>]*list="\{\{ horizontalTabItems \}\}")(?=[^>]*as="tab")[^>]*>/gu, 1],
        ["horizontal tab-strip query binding count", /<input\b(?=[^>]*value="\{\{ tabstripQuery \}\}")(?=[^>]*onChange="\{\{ ontabstripQuery \}\}")[^>]*>/gu, 1],
        ["horizontal tab-strip builder binding count", /<button\b(?=[^>]*onClick="\{\{ toggletabstripBuilder \}\}")[^>]*>/gu, 1],
        ["wide content grid wrapper count", /<div style="\{\{ contentGridStyle \}\}">/gu, 1],
        ["mobile More stateful label association count", /aria-labelledby="\{\{ m\.labelId \}\}"/gu, 1],
        ["article block supported condition count", /<sc-if value="\{\{ b\.is(?:Heading|Paragraph|Code|Unordered|Ordered) \}\}">/gu, 5],
        ["article boundary disabled binding count", /\sdisabled="\{\{ (?:prev|next)Disabled \}\}"/gu, 2],
        ["article boundary aria-disabled binding count", /aria-disabled="\{\{ (?:prev|next)DisabledAttr \}\}"/gu, 2],
        ["article boundary contrast count", /\b(?:prev|next)Style:"[^"]*color:var\(--osv\);cursor:/gu, 2],
    ];
    for (const [label, marker, expectedCount] of exactIndexCounts) {
        const actualCount = executableIndex.match(marker)?.length ?? 0;
        if (actualCount !== expectedCount) {
            missing.push([label, `expected ${expectedCount}; found ${actualCount}`]);
        }
    }

    const exactEnhancerCounts = [
        ["virtual runtime import count", /^import "virtual:worldlens-archive-runtime";$/gmu, 1],
        ["tab panel selector count", /querySelector<HTMLElement>\("#wl-tabpanel"\)/gu, 1],
        ["tab list selector count", /\[data-wl-tablist="true"\]/gu, 1],
        ["tab activation selector count", /button\[data-action="activate-tab"\]/gu, 1],
        ["tab close selector count", /button\[data-action="close-tab"\]/gu, 1],
        ["tab selected state count", /row\.dataset\["active"\] === "true"/gu, 1],
    ];
    for (const [label, marker, expectedCount] of exactEnhancerCounts) {
        const actualCount = executableEnhancer.match(marker)?.length ?? 0;
        if (actualCount !== expectedCount) {
            missing.push([label, `expected ${expectedCount}; found ${actualCount}`]);
        }
    }
    return missing;
}

function describe(marker) {
    return marker instanceof RegExp ? marker.source : marker;
}

function assertComplete(indexValue, enhancerValue, packageValue = packageSource) {
    const missing = validate(indexValue, enhancerValue, packageValue);
    if (!missing.length) return;
    throw new Error(
        `Archive control inventory is incomplete:\n${missing
            .map(([label, marker]) => `  - ${label}: ${describe(marker)}`)
            .join("\n")}`,
    );
}

let mutationGuardCount = 0;

function assertMutationCaught(
    label,
    mutatedIndex,
    mutatedEnhancer,
    expectedMissingLabel,
    mutatedPackage = packageSource,
) {
    if (
        mutatedIndex === source &&
        mutatedEnhancer === enhancerSource &&
        mutatedPackage === packageSource
    ) {
        throw new Error(`Archive control mutation fixture did not change any input: ${label}`);
    }
    const missingLabels = validate(mutatedIndex, mutatedEnhancer, mutatedPackage).map(
        ([missingLabel]) => missingLabel,
    );
    if (!missingLabels.includes(expectedMissingLabel)) {
        throw new Error(`Archive control mutation guard failed to catch ${label}`);
    }
    mutationGuardCount += 1;
}

assertComplete(source, enhancerSource, packageSource);
assertMutationCaught(
    "removed desktop Home control",
    source.replace(/<button class="wl-brand"[\s\S]*?<\/button>/u, ""),
    enhancerSource,
    "desktop home",
);
assertMutationCaught(
    "removed palette regex control",
    source.replace(/<button\b[^>]*onClick="\{\{ togglepaletteBuilder \}\}"[\s\S]*?<\/button>/u, ""),
    enhancerSource,
    "regex builder: togglepaletteBuilder",
);
assertMutationCaught(
    "commented-out drawer inert assignment",
    source,
    enhancerSource.replace("drawer.inert = compact && !open;", "// drawer.inert = compact && !open;"),
    "overlay enhancer: drawer inert state",
);
assertMutationCaught(
    "removed nested Escape isolation",
    source,
    enhancerSource.replace("event.stopImmediatePropagation();", ""),
    "overlay enhancer: nested Escape isolation",
);
assertMutationCaught(
    "removed module boot tag",
    source.replace('<script type="module" src="/src/archive-entry.ts"></script>', ""),
    enhancerSource,
    "module boot tag",
);
assertMutationCaught(
    "removed virtual runtime import",
    source,
    enhancerSource.replace('import "virtual:worldlens-archive-runtime";', ""),
    "overlay enhancer: virtual runtime import",
);
for (const scriptName of packageScriptNames) {
    assertMutationCaught(
        `removed archive assertion from package script ${scriptName}`,
        source,
        enhancerSource,
        `package script: ${scriptName}`,
        packageSource.replace(
            `"${scriptName}": "${archiveControlInvocation}`,
            `"${scriptName}": "`,
        ),
    );
}
assertMutationCaught(
    "removed palette field registration",
    source.replace('field("palette", paletteItems.length);', ""),
    enhancerSource,
    "palette field registration",
);
assertMutationCaught(
    "detached shared builder overlay",
    source.replace('style="{{ builderPanelStyle }}" role="dialog"', 'role="dialog"'),
    enhancerSource,
    "shared builder overlay",
);
assertMutationCaught(
    "detached bottom navigation render loop",
    source.replace('list="{{ bottomNav }}"', 'list="{{ removedBottomNav }}"'),
    enhancerSource,
    "bottom navigation render loop",
);
assertMutationCaught(
    "detached mobile More render loop",
    source.replace('list="{{ moreItems }}"', 'list="{{ removedMoreItems }}"'),
    enhancerSource,
    "mobile More render loop",
);
assertMutationCaught(
    "removed mobile More label association",
    source.replace('aria-labelledby="wl-more-title"', 'aria-label="More actions"'),
    enhancerSource,
    "mobile More dialog semantics",
);
assertMutationCaught(
    "duplicated mobile More dialog label",
    source.replace("<body", '<div id="wl-more-title"></div><body'),
    enhancerSource,
    "mobile More dialog label count",
);
assertMutationCaught(
    "removed one dynamic tab-close label binding",
    source.replace('aria-label="{{ tab.closeLabel }}"', 'aria-label="Close tab"'),
    enhancerSource,
    "dynamic tab-close render binding count",
);
assertMutationCaught(
    "removed tab panel relationship",
    source.replace('id="wl-tabpanel"', 'id="removed-tabpanel"'),
    enhancerSource,
    "tab panel relationship",
);
assertMutationCaught(
    "removed tab panel selector",
    source,
    enhancerSource.replace(
        'querySelector<HTMLElement>("#wl-tabpanel")',
        'querySelector<HTMLElement>("#removed-tabpanel")',
    ),
    "overlay enhancer: tab panel selector",
);
assertMutationCaught(
    "removed one tab list action scope",
    source.replace('data-wl-tablist="true"', 'data-wl-tablist="false"'),
    enhancerSource,
    "tab list action scope count",
);
assertMutationCaught(
    "removed one tab selected-state binding",
    source.replace('data-active="{{ tab.activeAttr }}"', 'data-active="false"'),
    enhancerSource,
    "tab selected-state binding count",
);
assertMutationCaught(
    "removed tab selected-state enhancer",
    source,
    enhancerSource.replace('row.dataset["active"] === "true"', "false"),
    "overlay enhancer: tab selected state",
);
assertMutationCaught(
    "removed tab selected-state record",
    source.replace(
        'closeLabel:"Close tab " + t.title, activeAttr:t.key === activeKey ? "true" : "false"',
        'closeLabel:"Close tab " + t.title',
    ),
    enhancerSource,
    "tab selected-state record",
);
assertMutationCaught(
    "removed one tab activation action binding",
    source.replace('data-action="activate-tab"', 'data-action="removed-activate-tab"'),
    enhancerSource,
    "tab activation action binding count",
);
assertMutationCaught(
    "removed one tab close action binding",
    source.replace('data-action="close-tab"', 'data-action="removed-close-tab"'),
    enhancerSource,
    "tab close action binding count",
);
assertMutationCaught(
    "removed tab list selector",
    source,
    enhancerSource.replace('[data-wl-tablist="true"]', '[data-wl-tablist="false"]'),
    "overlay enhancer: tab list selector",
);
assertMutationCaught(
    "removed tab activation selector",
    source,
    enhancerSource.replace(
        'button[data-action="activate-tab"]',
        'button[data-action="removed-activate-tab"]',
    ),
    "overlay enhancer: tab activation selector",
);
assertMutationCaught(
    "removed tab close selector",
    source,
    enhancerSource.replace(
        'button[data-action="close-tab"]',
        'button[data-action="removed-close-tab"]',
    ),
    "overlay enhancer: tab close selector",
);

assertMutationCaught(
    "made the desktop language name static",
    source.replace('aria-label="{{ languageControlLabel }}"', 'aria-label="Language and tone"'),
    enhancerSource,
    "desktop language",
);
assertMutationCaught(
    "removed the desktop language state copy",
    source.replace('languageControlLabel:"Language and tone. Current: "', 'languageControlLabel:"Language and tone: "'),
    enhancerSource,
    "desktop language state label",
);
assertMutationCaught(
    "made the desktop colour-scheme name static",
    source.replace('aria-label="{{ themeTitle }}"', 'aria-label="Colour scheme"'),
    enhancerSource,
    "desktop colour scheme",
);
assertMutationCaught(
    "removed the desktop colour-scheme state copy",
    source.replace('themeTitle: s.theme === "light" ? "Switch to dark" : "Switch to light"', 'themeTitle:"Colour scheme"'),
    enhancerSource,
    "desktop colour-scheme state label",
);
assertMutationCaught(
    "made the desktop notification name static",
    source.replace('aria-label="{{ notificationTitle }}"', 'aria-label="Notification history"'),
    enhancerSource,
    "desktop notifications",
);
assertMutationCaught(
    "removed the desktop unread state copy",
    source.replace('notificationTitle:s.unread ? "Notification history, " + s.unread + " unread" : "Notification history, all read"', 'notificationTitle:"Notification history"'),
    enhancerSource,
    "desktop notification state label",
);
assertMutationCaught(
    "detached the mobile More stateful name",
    source.replace('aria-labelledby="{{ m.labelId }}"', ""),
    enhancerSource,
    "mobile More stateful accessible label",
);
assertMutationCaught(
    "removed the mobile More language state",
    source.replace('ariaEn = "Language and tone. Current: " + languageNamesEn[s.language] + ". Switch to " + languageNamesEn[nextLanguage] + "."', 'ariaEn = "Language and tone"'),
    enhancerSource,
    "mobile More language state",
);
assertMutationCaught(
    "removed the mobile More colour-scheme state",
    source.replace('ariaEn = "Colour scheme. Current: " + (s.theme === "light" ? "Light" : "Dark") + ". Switch to " + (s.theme === "light" ? "dark" : "light") + "."', 'ariaEn = "Colour scheme"'),
    enhancerSource,
    "mobile More colour-scheme state",
);
assertMutationCaught(
    "removed the mobile More unread state",
    source.replace('ariaEn = s.unread ? "Notifications, " + s.unread + " unread" : "Notifications, all read"', 'ariaEn = "Notifications"'),
    enhancerSource,
    "mobile More notification state",
);
assertMutationCaught(
    "removed the tab-strip field catalogue",
    source.replace('  tabstrip:[["title","Open tab titles"]],\n', ""),
    enhancerSource,
    "tab-strip field catalogue",
);
assertMutationCaught(
    "removed the tab-strip query state",
    source.replace('queries:{ sidebar:"", tabstrip:"", docs:""', 'queries:{ sidebar:"", docs:""'),
    enhancerSource,
    "tab-strip query state",
);
assertMutationCaught(
    "detached the horizontal tab-strip results",
    source.replace('list="{{ horizontalTabItems }}"', 'list="{{ tabItems }}"'),
    enhancerSource,
    "horizontal tab-strip search",
);
assertMutationCaught(
    "bypassed the horizontal tab-strip predicate",
    source.replace('const horizontalTabItems = tabItems.filter((t) => this.matchesK("tabstrip", { title:t.title }));', 'const horizontalTabItems = tabItems;'),
    enhancerSource,
    "horizontal tab-strip filter",
);
assertMutationCaught(
    "removed the tab-strip builder corpus",
    source.replace('      tabstrip: tabDefs.map((t) => ({ title:t.title })),\n', ""),
    enhancerSource,
    "tab-strip builder corpus",
);
assertMutationCaught(
    "removed the tab-strip builder hits",
    source.replace('      tabstrip: horizontalTabItems.map((t) => t.title),\n', ""),
    enhancerSource,
    "tab-strip builder hits",
);
assertMutationCaught(
    "removed the tab-strip field registration",
    source.replace('    field("tabstrip", horizontalTabItems.length);\n', ""),
    enhancerSource,
    "tab-strip field registration",
);
assertMutationCaught(
    "removed the tab-strip regex builder control",
    source.replace(/<button\b[^>]*onClick="\{\{ toggletabstripBuilder \}\}"[\s\S]*?<\/button>/u, ""),
    enhancerSource,
    "regex builder: toggletabstripBuilder",
);
assertMutationCaught(
    "restored the unsupported tab-close condition",
    source.replace('<sc-if value="{{ tab.closable }}">', '<sc-if condition="{{ tab.closable }}">'),
    enhancerSource,
    "supported tab close condition count",
);
assertMutationCaught(
    "let tab activation steal roving focus",
    source.replace('onClick:() => this.go(t.page, t.articleId, t.group, false)', 'onClick:() => this.go(t.page, t.articleId, t.group)'),
    enhancerSource,
    "focus-preserving tab activation",
);
assertMutationCaught(
    "removed the global IME shortcut guard",
    source.replace('      if (e.isComposing || e.keyCode === 229) return;\n', ""),
    enhancerSource,
    "composition-safe global shortcuts",
);
assertMutationCaught(
    "detached the wide content grid wrapper",
    source.replace('<div style="{{ contentGridStyle }}">', '<div>'),
    enhancerSource,
    "wide content and index grid",
);
assertMutationCaught(
    "removed the wide content grid model",
    source.replace('contentGridStyle:"flex:1;min-width:0;min-height:0;display:grid;grid-template-columns:"', 'contentGridStyle:"display:block;"'),
    enhancerSource,
    "wide content grid model",
);
assertMutationCaught(
    "removed paragraph narrow wrapping",
    source.replace('text-wrap:pretty;overflow-wrap:anywhere;word-break:break-word;" });', 'text-wrap:pretty;" });'),
    enhancerSource,
    "article paragraph narrow wrapping",
);
assertMutationCaught(
    "removed code narrow wrapping",
    source.replace('white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;padding:', 'white-space:pre;overflow-x:auto;padding:'),
    enhancerSource,
    "article code narrow wrapping",
);
assertMutationCaught(
    "removed list narrow wrapping",
    source.replace('padding-left:24px;text-wrap:pretty;overflow-wrap:anywhere;word-break:break-word;', 'padding-left:24px;text-wrap:pretty;'),
    enhancerSource,
    "article list narrow wrapping",
);
assertMutationCaught(
    "restored unsupported article-block conditions",
    source.replace('<sc-if value="{{ b.isHeading }}">', '<sc-if condition="{{ b.isHeading }}">'),
    enhancerSource,
    "article block supported conditions",
);
assertMutationCaught(
    "removed article boundary disabled semantics",
    source.replace(' disabled="{{ prevDisabled }}" aria-disabled="{{ prevDisabledAttr }}"', ""),
    enhancerSource,
    "article boundary disabled binding count",
);
assertMutationCaught(
    "restored low-contrast article boundaries",
    source.replace('prevStyle:"flex:1;min-width:200px;text-align:left;padding:14px 18px;border-radius:16px;border:1px solid var(--outv);background:transparent;color:var(--osv);cursor:', 'prevStyle:"flex:1;min-width:200px;text-align:left;padding:14px 18px;border-radius:16px;border:1px solid var(--outv);background:transparent;color:var(--out);cursor:'),
    enhancerSource,
    "article boundary contrast count",
);
assertMutationCaught(
    "restored low-contrast palette empty state",
    source.replace('paletteEmptyStyle: paletteItems.length ? "display:none;" : "padding:18px 14px;font-size:13px;line-height:1.6;color:var(--osv);"', 'paletteEmptyStyle: paletteItems.length ? "display:none;" : "padding:18px 14px;font-size:13px;line-height:1.6;color:var(--out);"'),
    enhancerSource,
    "palette empty-state contrast",
);
assertMutationCaught(
    "restored low-contrast compact helper text",
    source.replace('text-transform:uppercase;color:var(--osv);margin-bottom:4px;">Previous', 'text-transform:uppercase;color:var(--out);margin-bottom:4px;">Previous'),
    enhancerSource,
    "contrast-safe compact helper text",
);
assertMutationCaught(
    "treated an inert palette as newly closed",
    source,
    enhancerSource.replace("const paletteAlreadyOpen = Boolean(palette && rendered(palette));", "const paletteAlreadyOpen = Boolean(palette && visible(palette));"),
    "overlay enhancer: rendered palette history guard",
);

const expectedMutationGuardCount = 59;
if (mutationGuardCount !== expectedMutationGuardCount) {
    throw new Error(
        `Archive control mutation inventory is incomplete: expected ${expectedMutationGuardCount}; found ${mutationGuardCount}`,
    );
}

console.log(
    `Archive controls complete for desktop, tablet and mobile: ${requiredControls.length} platform bindings, ${regexBuilderControls.length} adjacent regex builders, ${enhancerMarkers.length} enhancer bindings and ${packageScriptNames.length} package scripts; ${mutationGuardCount} mutation guards failed closed (${packageRoot})`,
);
