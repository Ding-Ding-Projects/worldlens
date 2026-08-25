<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCompassOutline, mdiFileDocumentOutline } from "@mdi/js";
import { sanitizeHtml } from "@worldlens/viewer";
import type { BlueMapApp } from "@worldlens/viewer";
import { useBlueMap } from "./useBlueMap";
import ChangelogViewer from "../changelog/ChangelogViewer.vue";
import { ReleaseLedgerViewer } from "../releaseLedger/index.js";
import { onRevealRequested } from "../shell/revealRequests.js";
import { tutorialCompleted } from "../tutorial/tutorialController.js";
import { productDisplayName } from "../../stores/productName.js";

/**
 * "Browse the documentation" - this page's own reachability path into the docs browser,
 * mirroring the changelog fold immediately below it. The docs browser is a real shell tab
 * rather than a fold in this menu, so the button only asks to be taken there; `MainMenu.vue`
 * forwards the request up to the shell, which is the one place that can actually switch tabs.
 *
 * "Start the tour" / "Replay the tour" is the same shape: this page never opens the tour
 * itself, it only asks. `App.vue` is what actually holds `TutorialOverlay.vue` and answers
 * the request through `requestTutorialLaunch()` - see that file for why a doorbell rather
 * than a direct call, and `tutorial-controller.ts`'s `tutorialCompleted()` for why the label
 * changes rather than staying "Start" forever.
 */
const emit = defineEmits<{ "open-docs": []; "open-tutorial": [] }>();

/**
 * The Info page: upstream renders `info.content` from the locale file straight through
 * `v-html`. That content is markup (a logo, three control tables, `<kbd>` keys and an
 * external link), so it has to be rendered rather than printed.
 *
 * Four deviations from upstream, all deliberate:
 *  - the markup goes through the port's shared sanitizer before it reaches the DOM;
 *  - external links get `target="_blank" rel="noopener noreferrer"`, because in the desktop
 *    shell an in-place navigation would replace the whole application window;
 *  - the locale's logo is given real alt text and pointed at the circular 512px copy of the
 *    same mark (see {@link decorate});
 *  - this is the port's About surface, so it also states the version of the *application*,
 *    which is a different number from the one the locale footer prints (see below).
 */
const props = defineProps<{ bluemap?: BlueMapApp | null }>();

const app = useBlueMap(() => props.bluemap);
const { t } = useI18n();

const tourLabel = computed(() =>
    tutorialCompleted()
        ? t("tutorial.launch.replay", "Replay the tour")
        : t("tutorial.launch.start", "Take the tour"),
);

/**
 * The logo the locale markup carries, at the size and shape the page actually renders.
 *
 * Every `info.content` translation opens with `<img src="assets/logo.png">` styled to 40%
 * of the sheet width with `border-radius: 50%`. That source is a 200px square, so the page
 * upscales it and then throws its corners away; `logoCircle512.png` is the identical mark,
 * already circular, at a resolution the display can use. Both ship in every build. The
 * rewrite is deliberately exact - anything other than that one path is left alone, because
 * a translation pointing somewhere else is pointing there on purpose.
 */
const LOCALE_LOGO = "assets/logo.png";
const BUNDLED_LOGO = "assets/logoCircle512.png";

/**
 * Applies the port's edits to the sanitized fragment: link hardening, then the logo.
 *
 * The alt text matters as much as the source: upstream ships the image with no `alt` at
 * all, which a screen reader reports by reading the file name aloud. It is named rather
 * than marked decorative because it is the only thing on the page that identifies what the
 * application is.
 */
function decorate(fragment: DocumentFragment): void {
    for (const anchor of Array.from(fragment.querySelectorAll("a[href]"))) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
    }
    for (const image of Array.from(fragment.querySelectorAll("img"))) {
        if (image.getAttribute("src") === LOCALE_LOGO) image.setAttribute("src", BUNDLED_LOGO);
        if (!image.hasAttribute("alt")) {
            image.setAttribute(
                "alt",
                t("info.logoAlt", "Worldlens logo: a block world under a map lens"),
            );
        }
    }
}

const content = computed(() => {
    const version = app.value?.settings?.version ?? "?";
    const raw = t("info.content", { version });
    if (!raw || raw === "info.content") return "";

    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(raw);
    decorate(template.content);
    return template.innerHTML;
});

/* -------------------------------------------------------------------------- */
/* The application's own version                                              */
/* -------------------------------------------------------------------------- */

/**
 * `getVersion()` over the preload's `app:version` channel, when there is a preload.
 *
 * Two different versions meet on this page and they are not interchangeable. The locale
 * footer prints `settings.version`, which is the version of BlueMap that generated the map
 * data being viewed; this one is the version of the desktop application doing the viewing,
 * and it is the number somebody quotes in a bug report.
 *
 * Feature-detected one method at a time, like every other bridge call in this package: a
 * browser tab has no preload, and there the block renders nothing at all rather than an
 * empty `Version:` label, which would read as "this build has no version" rather than
 * "nobody here can be asked".
 */
interface VersionBridge {
    getVersion?: () => Promise<string>;
    getBuildProvenance?: () => Promise<{ version: string; builtAt: string | null }>;
    getDeployment?: () => Promise<{
        hosted: boolean;
        mounts?: readonly { id: string; label: string; writable: boolean }[];
        capabilities?: readonly string[];
        passwordSet?: boolean;
    }>;
}

function versionReader(): (() => Promise<string>) | null {
    const bridge = (globalThis as { worldlens?: VersionBridge }).worldlens;
    const read = bridge?.getVersion;
    if (typeof read !== "function" || bridge === undefined) return null;
    return () => read.call(bridge);
}

/**
 * Electron's `ipcRenderer.invoke` re-wraps a handler's rejection as
 * `Error invoking remote method 'app:version': Error: <message>`. The channel name and the
 * doubled `Error:` are plumbing rather than the sentence anybody wrote, so they are
 * stripped before the line renders, exactly as `settings/javaSetting.ts` strips them.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

const appVersion = ref<string | null>(null);
const versionFailure = ref<string | null>(null);

/**
 * When this build was made, already formatted for display, or `null`.
 *
 * Three distinct states meet here and they must not be collapsed into two. The build can
 * have a recorded time; the build can honestly have none (a source export with no git
 * history is a legitimate build, not a broken one); or this shell can be too old to have
 * the channel at all. Only the first prints an instant. The other two say so, and neither
 * is ever quietly filled in from `Date.now()` - that would render the moment somebody
 * opened this page as though it were a fact about the build, which is the one failure this
 * whole line exists to prevent.
 */
const builtAt = ref<string | null>(null);
const builtAtKnown = ref(false);

/**
 * How this copy is running, once the shell has said.
 *
 * `null` while nobody has answered and on a shell too old to be asked, which is deliberately
 * not the same as "not hosted": a desktop answers `hosted: false` outright, so the absence of
 * an answer means nobody was asked rather than that the answer was no.
 */
const deployment = ref<{
    hosted: boolean;
    mounts?: readonly { id: string; label: string; writable: boolean }[];
    capabilities?: readonly string[];
    passwordSet?: boolean;
} | null>(null);

/** The mounted folders, written the way a person would say them. */
const mountedFolders = computed(() =>
    (deployment.value?.mounts ?? [])
        .map((mount) => `${mount.label} (${mount.writable ? "read/write" : "read-only"})`)
        .join(", "),
);

/**
 * The instant, in the reader's own timezone, to the second, with the zone named.
 *
 * Seconds and the zone are both load-bearing rather than decorative. Two builds of the same
 * version can be a minute apart, so a display truncated to minutes cannot distinguish them;
 * and a wall-clock time with no zone is not something a person in another country can act
 * on. `timeZoneName: "short"` is what puts the label on it.
 */
function formatInstant(iso: string): string | null {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    try {
        // Individual component options rather than `dateStyle`/`timeStyle`. Those two read
        // more neatly and are wrong: Intl refuses to combine either of them with
        // `timeZoneName` and throws `TypeError: Invalid option`. Written that way, the catch
        // below swallowed the throw on every single call and quietly rendered a raw ISO
        // string instead of local time, which looks like a deliberate format rather than a
        // permanently failing branch. Caught only by asserting on the rendered output.
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
        }).format(parsed);
    } catch {
        // A runtime without full ICU still owes the reader the instant rather than nothing.
        return parsed.toISOString();
    }
}

/**
 * Whether the changelog fold is open, which is what decides whether the viewer is built.
 * Driven by the element's own `toggle` event rather than by a click handler, so keyboard
 * activation and the browser's find-in-page auto-expansion both keep it in step.
 */
const changelogOpen = ref(false);

/**
 * The fold element, so something other than a click can open it.
 *
 * `changelogOpen` is a mirror of the element's state rather than the source of it - the
 * `toggle` handler reads it back off the element - so setting the ref alone would build the
 * viewer inside a fold that still looks shut. The element's `open` property is the real
 * switch, and setting it fires `toggle`, which updates the mirror on the way through.
 */
const changelogFold = ref<HTMLDetailsElement | null>(null);

/*
 * The command palette can ask for the changelog by name. It reaches here because this is where
 * the changelog lives: the palette opens the viewer's menu at this page, and this expands the
 * fold once the page has drawn. Scrolled into view as well, because the fold is at the bottom
 * of a page whose top is a logo and three tables of controls - opening it out of sight would be
 * a teleport that lands somebody on the wrong end of the screen.
 */
onRevealRequested("changelog", () => {
    const fold = changelogFold.value;
    if (fold === null) return;
    fold.open = true;
    changelogOpen.value = true;
    fold.scrollIntoView({ block: "nearest" });
});

onMounted(() => {
    const read = versionReader();
    if (read === null) return;
    void read()
        .then((value) => {
            // A shell that answers with a blank string has told us nothing, and printing
            // "Worldlens" with a gap after it would be worse than staying quiet.
            const trimmed = value.trim();
            if (trimmed.length > 0) appVersion.value = trimmed;
        })
        .catch((error: unknown) => {
            // A build that has the channel and fails on it has a real fault, and hiding it
            // would leave the page looking like a browser tab. Say what happened instead.
            versionFailure.value = describe(error);
        });

    // Feature-detected separately from getVersion, one method at a time like every other
    // bridge call here, so an older shell that has one and not the other still renders the
    // half it can answer instead of neither.
    const bridge = (globalThis as { worldlens?: VersionBridge }).worldlens;
    if (bridge === undefined) return;

    // Each of these is asked for independently, and this used to be one early return that
    // covered both. A shell with the version but not the build time would then never have been
    // asked about its deployment either, so a hosted copy would have quietly described itself
    // as a desktop one - the exact confusion the whole block exists to prevent.
    const readProvenance = bridge.getBuildProvenance;
    if (typeof readProvenance === "function")
        void readProvenance
        .call(bridge)
        .then((provenance) => {
            builtAtKnown.value = true;
            builtAt.value =
                typeof provenance.builtAt === "string" ? formatInstant(provenance.builtAt) : null;
        })
        .catch(() => {
            // Deliberately silent, and deliberately not a failure line of its own. The
            // version above already carries any real fault with this shell; a second red
            // sentence about the same broken channel is noise, and the unavailable state
            // below already tells the truth, which is that no build time is being shown.
            builtAtKnown.value = true;
        });

    const readDeployment = bridge.getDeployment;
    if (typeof readDeployment !== "function") return;
    void readDeployment
        .call(bridge)
        .then((answer) => {
            deployment.value = answer;
        })
        .catch(() => {
            // Left null. A hosted copy that cannot describe itself must not therefore look
            // like a desktop one, and saying nothing is the only honest option left.
        });
});
</script>

<template>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized above; the source is a bundled locale file -->
    <div v-if="content" class="mb-info-page" v-html="content" />
    <p v-else class="mb-info-page__empty">
        {{ t("info.title", "Info") }}
    </p>

    <!--
      Not a live region: the answer arrives one IPC round trip after mount, well before a
      screen reader working down the page reaches the end of the control tables, and
      announcing it would interrupt that reading for a line the reader is about to reach.
    -->
    <p v-if="appVersion !== null" class="mb-info-page__version">
        {{
            t(
                "info.appVersion",
                { name: productDisplayName, version: appVersion },
                "{name} {version}",
            )
        }}
    </p>
    <p v-else-if="versionFailure !== null" class="mb-info-page__version">
        {{
            t(
                "info.appVersionFailed",
                { reason: versionFailure },
                "This build could not report its version: {reason}",
            )
        }}
    </p>

    <!--
      Rendered only once the shell has actually answered. Before that there is no honest
      thing to print: absence of an answer is not the same as an answer of "unknown", and
      showing the unavailable line during the round trip would flash a false negative at
      every reader on every visit.
    -->
    <p v-if="builtAtKnown" class="mb-info-page__version">
        {{
            builtAt !== null
                ? t("info.builtAt", { timestamp: builtAt }, "Built {timestamp}")
                : t("info.builtAtUnknown", {}, "Build time not recorded")
        }}
    </p>

    <!--
      Shown only for a hosted copy. A desktop answers `hosted: false` and this whole block
      stays away, because "this is installed on your computer" is not news to somebody sitting
      at their own computer.
    -->
    <section v-if="deployment?.hosted === true" class="mb-info-page__deployment">
        <p>{{ t("info.hosted", {}, "Served from a container") }}</p>
        <p v-if="deployment.passwordSet === false" class="mb-info-page__deployment-open">
            {{
                t(
                    "info.hostedOpen",
                    {},
                    "No password: anyone who can reach this address has full access.",
                )
            }}
        </p>
        <p>
            {{
                mountedFolders === ""
                    ? t("info.hostedNoFolders", {}, "No folders are mounted.")
                    : t("info.hostedFolders", { folders: mountedFolders }, "Folders: {folders}")
            }}
        </p>
    </section>

    <!--
        Every released version, with the commit that made each change. Folded rather than
        expanded: this page is what somebody opens to read the controls, and 35 versions
        of history unrolled above them would bury it.

        The viewer is built when the fold is opened rather than mounted and hidden. A
        closed `<details>` still holds its children in the document, so mounting it here
        would put every entry's text - 88 commit messages - into this page's accessible
        name and into anything that reads its content, while showing none of it. Built on
        demand, the page says what it says and the history arrives when it is asked for.
    -->
    <v-divider class="mb-info-page__rule" />

    <v-btn
        class="mb-info-page__docs-button"
        variant="tonal"
        :prepend-icon="mdiFileDocumentOutline"
        @click="emit('open-docs')"
    >
        {{ t("docsViewer.openFromInfo", "Browse the documentation") }}
    </v-btn>

    <!--
        The interactive tour's own reachability path from Help/About. Same shape as the docs
        button above: this page only asks the shell to open it, because the overlay is mounted
        at the shell and not here.
    -->
    <v-btn
        class="mb-info-page__tour-button"
        variant="tonal"
        :prepend-icon="mdiCompassOutline"
        @click="emit('open-tutorial')"
    >
        {{ tourLabel }}
    </v-btn>

    <details
        ref="changelogFold"
        class="mb-info-page__changelog"
        @toggle="changelogOpen = ($event.target as HTMLDetailsElement).open"
    >
        <summary>{{ t("info.changelog", "Changelog, every released version") }}</summary>
        <ChangelogViewer v-if="changelogOpen" />
    </details>

    <details class="mb-info-page__release-ledger">
        <summary>{{ t("info.releaseLedger", "Phase release evidence") }}</summary>
        <ReleaseLedgerViewer />
    </details>
</template>

<style>
/*
 * This page renders markup that came out of a locale file, so almost none of it can be given
 * a class - the rules below reach `h2`, `table`, `kbd`, `hr` and `a` by element, which is the
 * only handle there is on content a translator wrote. That makes the type scale the whole
 * job here: the fragment arrives with three heading levels, three tables and a footer, and
 * left alone it renders at whatever the browser and Vuetify between them decide.
 *
 * The heading rule carries a `.v-application` prefix it does not otherwise need.
 * `prototypeSurface.scss` styles `.mb-shell-layer h2` - one class and one type, exactly the
 * weight `.mb-info-page h2` has - and it is imported after every component's style block, so
 * the two tie and that sheet wins. The first version of this rule was outranked into a 20px
 * body heading that kept only the letter-spacing and the upper-casing it had been given,
 * which is a worse result than never having written it.
 */
.mb-info-page {
    /* The drawer's 12px row inset, so the logo and the tables line up with the rows on
       every other page of the menu rather than sitting four pixels further in. */
    padding: 8px 12px 16px;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
}

.v-application .mb-info-page__rule.v-divider {
    margin: 16px 0;
    border-color: rgb(var(--v-theme-outline-variant));
    opacity: 1;
}

/*
 * The two buttons are `variant="tonal"`, which is M3's own answer for a secondary action, and
 * `prototypeSurface.scss` already gives every `.v-btn` in the shell layer the pill shape and
 * the un-upper-cased label. Only the gutter is set here: they sit outside `.mb-info-page`, so
 * they would otherwise start at the sheet's 8px edge while everything above them starts at
 * the row inset.
 */
.mb-info-page__docs-button,
.mb-info-page__tour-button {
    margin-inline-start: 12px;
    margin-block-end: 12px;
}

/*
 * The changelog fold's summary is a real control - it is what opens 35 versions of history -
 * so it takes a row title's ramp and a row's own inset rather than reading as a bold line of
 * body copy.
 */
.mb-info-page__changelog > summary {
    cursor: pointer;
    padding: 8px 12px;
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    border-radius: var(--md-sys-shape-corner-md);
}

.mb-info-page__changelog > summary:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-info-page__release-ledger > summary {
    cursor: pointer;
    padding: 8px 12px;
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
    border-radius: var(--md-sys-shape-corner-md);
}

.mb-info-page__release-ledger > summary:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-info-page img {
    display: block;
    width: 40%;
    margin: 2em auto;
    border-radius: 50%;
}

/*
 * The locale content's own headings, given the same uppercase section label in the primary
 * role that `mb-section-label` gives every other heading in the design. The three tables of
 * controls this page is actually here for are what those headings introduce, and this is what
 * makes them read as sections of one page rather than as bold lines inside it.
 */
.v-application .mb-info-page h2 {
    margin-block: 16px 6px;
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}

.mb-info-page p {
    margin-block: 0;
}

.mb-info-page table {
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
}

/*
 * Hairlines in the one role the whole application separates surfaces with, rather than an
 * eighth of the text colour. `outline-variant` is what `prototypeSurface.scss` gives every
 * divider and every card edge; an ad-hoc `rgba(on-surface, 0.12)` happens to look similar in
 * the dark theme, is heavier than it should be in the light one, and is exactly the second
 * authority on a colour that `colorRoles.ts` exists to be the only one of.
 */
.mb-info-page th,
.mb-info-page td {
    padding: 6px 8px;
    border: solid 1px rgb(var(--v-theme-outline-variant));
    font-weight: inherit;
    text-align: start;
    vertical-align: top;
}

/*
 * A key cap. `surface-container-highest` is the tint M3 puts on the topmost thing in a
 * stack, which is what a key drawn on top of a table cell is, and it holds up in the contrast
 * theme where a translucent wash of the text colour would have collapsed into the background.
 */
.mb-info-page kbd {
    display: inline-block;
    padding: 1px 5px;
    border-radius: var(--md-sys-shape-corner-xs);
    border: solid 1px rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container-highest));
    color: rgb(var(--v-theme-on-surface));
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-label-medium-size);
}

.mb-info-page hr {
    border: none;
    border-block-start: solid 1px rgb(var(--v-theme-outline-variant));
    margin-block: 16px;
}

.mb-info-page a {
    color: rgb(var(--v-theme-primary));
}

.mb-info-page .info-footer {
    text-align: center;
}

.mb-info-page__empty {
    margin: 0;
    padding: 12px 12px 16px;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    color: rgb(var(--v-theme-on-surface-variant));
}

/*
 * A sibling of the rendered content rather than a child of it, so the empty state keeps
 * its own padding instead of nesting inside the page's. The inline padding matches both.
 *
 * This is the line the prototype's own drawer footer draws - "Worldlens 0.14.2 - BlueMap 5.11
 * engine" - and it takes the footnote treatment that line has there: the supporting ramp in
 * the variant colour, quiet enough to be furniture and legible enough to be quoted into a bug
 * report, which is the only reason anybody ever reads it.
 */
.mb-info-page__version {
    margin: 0;
    padding: 0 12px 16px;
    text-align: center;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
    overflow-wrap: anywhere;
    color: rgb(var(--v-theme-on-surface-variant));
}
</style>
