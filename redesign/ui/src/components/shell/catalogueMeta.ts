/**
 * The small grey line on a catalogue row, resolved from something real or not shown at all.
 *
 * The prototype's rows read `default · 107 settings`, `1 running`, `revision 41`, `0.14.3 ready`
 * and `6 unread`. Every one of those is an illustration of what the row looks like with
 * something in it. Two of them contradict each other - the prototype's own parser counted 107
 * configuration keys and its label said 154 options, about the same editor - which is the
 * clearest possible demonstration that a number transcribed from a mockup is not a fact about
 * the build it lands in.
 *
 * So nothing here is a literal. A resolver reads either a **registry that is already the
 * product's source of truth** (the config descriptors, the mask shapes, the CLI flags, the speed
 * levels, the language modes, the bundled docs articles) or a **live
 * store the shell hands in** (running renders, profiles, unread notices, consent, the account).
 * A resolver that has nothing honest to say returns `undefined`, and the row simply has no meta -
 * which reads as an ordinary row rather than as a broken one.
 *
 * Resolvers are pure functions of `(sources, t)`. They never start network work merely because
 * Home rendered, and they never return a secret, a token, a private capability name or a
 * user-specific path.
 */

import { ALL_DESCRIPTORS, CLI_FLAGS, CONFIG_DESCRIPTORS, MASK_SHAPES } from "@worldlens/config";
import { DOCS_ARTICLES } from "../docs/docsContent.js";
import { SPEED_LEVELS } from "../config/speedLevels.js";
import { FUNNY_LEVELS, LANGUAGE_MODES } from "../setup/setupI18n.js";

/** The repository's own `t()` shape: key, optional named values, English fallback. */
export type Translate = (
    key: string,
    valuesOrFallback?: Record<string, string> | string,
    fallback?: string,
) => string;

/**
 * Everything live a resolver may read, supplied by the shell.
 *
 * Every field is optional and every resolver treats a missing one as "say nothing". That is what
 * lets `catalogueMeta.test.ts` call these with nothing at all and assert that not one of them
 * invents a value, and it is what lets Home render before a store has reconciled.
 */
export interface CatalogueMetaSources {
    /** Renders currently starting, running or offered - the same aggregation the strip reads. */
    readonly runningRenderCount?: number;
    /** Local renders plus remote servers, from the profile store. */
    readonly profileCount?: number;
    /** Projects known on this machine. */
    readonly projectCount?: number;
    /** Settings a project's descriptors declare, for the project-editor row. */
    readonly projectSettingCount?: number;
    /** World folders discovery has actually found. */
    readonly worldFolderCount?: number;
    /** Marker sets on the loaded map, including the live players set. */
    readonly markerSetCount?: number;
    /** Unread notices. */
    readonly unreadNoticeCount?: number;
    /** Steps the guide currently has. */
    readonly wizardStepCount?: number;
    /** Sections the settings drawer currently renders. */
    readonly settingsSectionCount?: number;
    /** Released versions the changelog viewer carries. */
    readonly changelogVersionCount?: number;
    /** Bundled action-artwork images. */
    readonly actionArtworkCount?: number;
    /** Themes the appearance system offers. */
    readonly themeSchemeCount?: number;
    /** The parallel-download range, as a low/high pair. */
    readonly downloadConcurrency?: { readonly min: number; readonly max: number };
    /** Mojang download consent, as a tri-state: nothing answered yet is `null`. */
    readonly mojangConsent?: boolean | null;
    /** Whether an account is signed in. Never the account name, and never a token. */
    readonly accountSignedIn?: boolean;
    /** Whether an update is staged and ready. Never the version string on its own. */
    readonly updateReadyVersion?: string | null;
    /** Whether the licence has been accepted. */
    readonly eulaAccepted?: boolean;
    /** The local preview server's state, when one is running. */
    readonly previewRunning?: boolean;
    /** Published-Pages state, when the verification model has one. */
    readonly pagesPublished?: boolean;
    /** Parity proofs the Pages verification model currently carries. */
    readonly pagesProofCount?: number;
    /** The provisioned Java runtime's own name, when one is provisioned. */
    readonly javaRuntimeLabel?: string | null;
    /** The current config-folder revision, when a history exists. */
    readonly historyRevision?: number | null;
    /** Backup part size in bytes, from the current backup configuration. */
    readonly backupPartBytes?: number | null;
    /** The palette's own registered chord, read from the shortcut it actually binds. */
    readonly paletteShortcut?: string;
}

type Resolver = (sources: CatalogueMetaSources, t: Translate) => string | undefined;

/** Formats a count, or says nothing when the source did not supply one. */
function count(
    value: number | undefined,
    key: string,
    fallback: string,
    t: Translate,
): string | undefined {
    return value === undefined ? undefined : t(key, { count: String(value) }, fallback);
}

const RESOLVERS: Record<string, Resolver> = {
    /* ---- registries that are already the product's source of truth ---- */

    "config.tabsAndFields": (_sources, t) =>
        t(
            "catalogue.meta.configTabsAndFields",
            {
                tabs: String(CONFIG_DESCRIPTORS.length),
                fields: String(
                    ALL_DESCRIPTORS.reduce((total, descriptor) => total + descriptor.fields.length, 0) +
                        CLI_FLAGS.length,
                ),
            },
            "{tabs} tabs · {fields} settings",
        ),
    "project.settingCount": (sources, t) =>
        count(
            sources.projectSettingCount,
            "catalogue.meta.projectSettings",
            "{count} settings",
            t,
        ),
    "mask.shapeCount": (_sources, t) =>
        t("catalogue.meta.maskShapes", { count: String(MASK_SHAPES.length) }, "{count} shapes"),
    "speed.levelCount": (_sources, t) =>
        t("catalogue.meta.speedLevels", { count: String(SPEED_LEVELS.length) }, "{count} levels"),
    "language.modesAndLevels": (_sources, t) =>
        t(
            "catalogue.meta.languageModesAndLevels",
            { modes: String(LANGUAGE_MODES.length), levels: String(FUNNY_LEVELS.length) },
            "{modes} modes · {levels} levels",
        ),
    "docs.articleCount": (_sources, t) =>
        t(
            "catalogue.meta.docsArticles",
            { count: String(DOCS_ARTICLES.length) },
            "{count} articles",
        ),

    /* ---- live stores the shell hands in ---- */

    "render.runningCount": (sources, t) =>
        sources.runningRenderCount === undefined || sources.runningRenderCount === 0
            ? undefined
            : t(
                  "catalogue.meta.rendersRunning",
                  { count: String(sources.runningRenderCount) },
                  "{count} running",
              ),
    "profile.count": (sources, t) =>
        count(sources.profileCount, "catalogue.meta.profiles", "{count} entries", t),
    "project.count": (sources, t) =>
        count(sources.projectCount, "catalogue.meta.projects", "{count} projects", t),
    "world.folderCount": (sources, t) =>
        count(sources.worldFolderCount, "catalogue.meta.worldFolders", "{count} folders", t),
    "marker.setCount": (sources, t) =>
        count(sources.markerSetCount, "catalogue.meta.markerSets", "{count} sets", t),
    "notice.unreadCount": (sources, t) =>
        sources.unreadNoticeCount === undefined || sources.unreadNoticeCount === 0
            ? undefined
            : t(
                  "catalogue.meta.unreadNotices",
                  { count: String(sources.unreadNoticeCount) },
                  "{count} unread",
              ),
    "wizard.stepCount": (sources, t) =>
        count(sources.wizardStepCount, "catalogue.meta.wizardSteps", "{count} steps", t),
    "settings.sectionCount": (sources, t) =>
        count(sources.settingsSectionCount, "catalogue.meta.settingsSections", "{count} sections", t),
    "changelog.versionCount": (sources, t) =>
        count(
            sources.changelogVersionCount,
            "catalogue.meta.changelogVersions",
            "{count} versions",
            t,
        ),
    "artwork.imageCount": (sources, t) =>
        count(sources.actionArtworkCount, "catalogue.meta.artworkImages", "{count} images", t),
    "theme.schemeCount": (sources, t) =>
        count(sources.themeSchemeCount, "catalogue.meta.themeSchemes", "{count} schemes", t),
    "pages.proofCount": (sources, t) =>
        count(sources.pagesProofCount, "catalogue.meta.pagesProofs", "{count} proofs", t),

    "download.concurrencyRange": (sources, t) =>
        sources.downloadConcurrency === undefined
            ? undefined
            : t(
                  "catalogue.meta.downloadRange",
                  {
                      min: String(sources.downloadConcurrency.min),
                      max: String(sources.downloadConcurrency.max),
                  },
                  "{min}–{max} at once",
              ),
    "consent.mojang": (sources, t) => {
        if (sources.mojangConsent === undefined || sources.mojangConsent === null) return undefined;
        return sources.mojangConsent
            ? t("catalogue.meta.consentAccepted", "Accepted")
            : t("catalogue.meta.consentDeclined", "Declined");
    },
    "account.state": (sources, t) => {
        if (sources.accountSignedIn === undefined) return undefined;
        return sources.accountSignedIn
            ? t("catalogue.meta.accountSignedIn", "Signed in")
            : t("catalogue.meta.accountSignedOut", "Signed out");
    },
    "update.state": (sources, t) =>
        sources.updateReadyVersion === undefined || sources.updateReadyVersion === null
            ? undefined
            : t(
                  "catalogue.meta.updateReady",
                  { version: sources.updateReadyVersion },
                  "{version} ready",
              ),
    "eula.state": (sources, t) =>
        sources.eulaAccepted === undefined
            ? undefined
            : sources.eulaAccepted
              ? t("catalogue.meta.eulaAccepted", "Accepted")
              : t("catalogue.meta.eulaPending", "Not accepted yet"),
    "preview.state": (sources, t) =>
        sources.previewRunning === undefined
            ? undefined
            : sources.previewRunning
              ? t("catalogue.meta.previewRunning", "Serving now")
              : undefined,
    "pages.publishState": (sources, t) =>
        sources.pagesPublished === undefined
            ? undefined
            : sources.pagesPublished
              ? t("catalogue.meta.pagesPublished", "Published")
              : undefined,
    "java.runtime": (sources) =>
        sources.javaRuntimeLabel === undefined || sources.javaRuntimeLabel === null
            ? undefined
            : sources.javaRuntimeLabel,
    "history.revision": (sources, t) =>
        sources.historyRevision === undefined || sources.historyRevision === null
            ? undefined
            : t(
                  "catalogue.meta.historyRevision",
                  { revision: String(sources.historyRevision) },
                  "revision {revision}",
              ),
    "backup.partSize": (sources, t) =>
        sources.backupPartBytes === undefined || sources.backupPartBytes === null
            ? undefined
            : t(
                  "catalogue.meta.backupPartSize",
                  { size: formatMebibytes(sources.backupPartBytes) },
                  "{size} parts",
              ),
    "palette.shortcut": (sources) => sources.paletteShortcut,

    /* ---- capability-gated rows ---- */

    /*
     * Deliberately silent. The restricted mode's chosen name is the *only* name its surfaces may
     * use, and this checkout has no reader for the shared record that holds it. Rendering the
     * shipped placeholder here would ship the exact literal the contract forbids, so the row
     * carries no meta until a real reader exists - and the row itself is capability-gated out of
     * the interface in the meantime.
     */
    "restrictedMode.name": () => undefined,
    /* Same reasoning: no narrator settings row exists yet, so there is no state to report. */
    "narrator.state": () => undefined,
};

/** Whole mebibytes, for a part size a person is meant to recognise rather than audit. */
function formatMebibytes(bytes: number): string {
    return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

/**
 * The meta line for one resolver name, or `undefined`.
 *
 * An unknown name answers `undefined` rather than throwing: a manifest row naming a resolver
 * nobody wrote should render as a row without meta, not take Home down with it. The
 * completeness test is what catches the typo, at build time, where it belongs.
 */
export function resolveMeta(
    resolverName: string | undefined,
    sources: CatalogueMetaSources,
    t: Translate,
): string | undefined {
    if (resolverName === undefined) return undefined;
    const resolver = RESOLVERS[resolverName];
    return resolver === undefined ? undefined : resolver(sources, t);
}

/** Every resolver name this module answers for, so a test can assert the manifest matches. */
export function knownMetaResolvers(): readonly string[] {
    return Object.keys(RESOLVERS);
}
