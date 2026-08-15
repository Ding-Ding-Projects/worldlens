/**
 * Shipped English name → the label a four-to-six-year-old reads.
 *
 * Keyed by `nameFallback` from `catalogues.ts`, `labelFallback` from `jobRegistry.ts` and the
 * section titles behind `SETTINGS_SECTIONS`, so this file names nothing the application does not
 * already have. `kidLabel()` falls back to the shipped name: a surface with no entry here still
 * renders, still routes and still says what it is.
 *
 * Every entry goes through `t()` at the call site (`kid.label.<slug>`), so a translated build
 * replaces these rather than losing them.
 */

export const KID_FEATURE_LABELS: Readonly<Record<string, string>> = {
    /* Make a map (28) */
    "The project editor": "Build room",
    "The guide": "Five questions",
    "Project world discovery": "Find my worlds",
    "Dimension detection": "Which part of the world?",
    "Legacy 1.12.2 worlds": "Really old worlds",
    "Bedrock worlds": "Bedrock worlds",
    "Projects on this machine": "Maps on this computer",
    "Render mask drawing": "Draw the bit to make",
    "Live render speed": "Speed dial",
    "The path field": "Where things live",
    "Scheduled render": "Do it later",
    "Docker or this machine": "This computer or a box",
    "Remote rendering over SSH": "Another computer",
    "Rendering in GitHub Actions": "Robot helpers",
    "Disposable cloud CI": "Rented helpers",
    "CI repository setup": "The helpers' toolbox",
    "Large worlds": "Huge worlds",
    "Renders in progress": "What is being drawn",
    "The render console": "What the engine says",
    "Resumable renders": "Carry on later",
    "Live speed control": "Change speed now",
    "Container offers": "Use the box we have",
    "Interrupted renders": "Ones that stopped",
    "Render throughput": "How fast is it going",
    "Automatic repair": "Fix it for me",
    "Java runtime provisioning": "Get the engine's Java",
    "Dependency provisioning": "Get the other bits",
    "Mojang download consent": "Say yes to Mojang",

    /* Your maps (6) */
    "Maps and servers": "All my maps",
    "The viewer and its controls": "Fly around",
    "Markers and marker sets": "Pins and flags",
    "Remote BlueMap servers": "Someone else's map",
    "Viewer settings": "How pretty it looks",
    "Server-hosted Material UI": "Map in a browser",

    /* Share a map (6) */
    "Publish to GitHub Pages": "Put it on the web",
    "Watch it live": "Watch it now",
    "Private worlds": "Keep it secret",
    "Remote hosting": "Anywhere else",
    "Pages feature parity": "Same app on the web",
    "Release workflow security": "Safe publishing rules",

    /* Keep a copy (7) */
    "Backups": "Make a safe copy",
    "World git repository": "Copy that grows",
    "Repository adoption": "Another computer joins",
    "World sources": "Get a world",
    "SSH world sources": "Get it from a computer",
    "Docker world source": "Get it from a box",
    "Local version history": "Go back in time",

    /* Set up & help (37) */
    "Settings": "All the switches",
    "Options editor": "Engine switches",
    "GitHub CLI accounts": "Who we sign in as",
    "Tabbed navigation": "My tabs",
    "Where the panels sit": "Where things sit",
    "Appearance editors": "Change the colours",
    "The regex builder": "Clever searching",
    "Command palette": "Find anything",
    "Notification centre": "My messages",
    "Super confirmation": "Two keys first",
    "Action-specific artwork": "Picture for big buttons",
    "Display and ease of use": "Bigger and easier",
    "Theme": "Day or night colours",
    "Downloads at once": "How many at once",
    "What this application is called": "What we call this app",
    "Language and tone": "How it talks",
    "Shared restricted mode": "Grown-up lock",
    "Personal vocabulary": "Our own words",
    "Spoken narrator": "Read it out loud",
    "Scheduled language and appearance": "Change it by the clock",
    "Memory Console": "Shared memory desk",
    "Status Hub": "Are we in sync?",
    "Control-plane runtime": "Shared engine room",
    "Sync attestation": "Proof it synced",
    "Secret intake": "Secret keeper",
    "Tooling integrations": "Other tools",
    "Shared localization contract": "Shared word rules",
    "Automatic updates": "New versions",
    "Startup recovery": "If it wakes up poorly",
    "Migration": "Moving old stuff over",
    "Memory console settings": "Memory desk switches",
    "Docs": "Read about it",
    "Changelog viewer": "What changed",
    "Glossary": "Word list",
    "Licence and consent": "The rules",
    "The interactive tour": "Show me around",
    "The design system": "How it is drawn",
};

/** Job label (`jobRegistry.ts` `labelFallback`) → kid label. All eighteen jobs. */
export const KID_JOB_LABELS: Readonly<Record<string, string>> = {
    "Make a map": "Five questions",
    "Projects": "Build room",
    "GitHub runners": "Robot helpers",
    "Structures": "Things already built",
    "Convert": "Change a world's shape",
    "Authenticator": "Code keeper",
    "Locks": "Locks list",
    "Support Tickets": "Ask for help",
    "Browser downloads": "Grabbed from the web",
    "Renders": "Being drawn",
    "Maps and servers": "All my maps",
    "Publish to Pages": "Put it on the web",
    "Watch it live": "Watch it now",
    "Backups": "Safe copies",
    "World repository": "Copy that grows",
    "Docs": "Read about it",
    "Ollama": "Talk to the robot",
    // `jobRegistry.ts`'s Memory job spells its `labelFallback` with a lowercase "console" -
    // `catalogues.ts`'s "Memory Console" catalogue-feature name capitalises it. The two disagree
    // about the same concept, and this table has to match the job registry's spelling exactly or
    // the lookup in `kidLabel()` (an exact string match) silently never fires for this job's tab.
    "Memory console": "Shared memory desk",
};

/** Settings section anchor → kid label. All eighteen sections. */
export const KID_SETTINGS_LABELS: Readonly<Record<string, string>> = {
    "mojang-download-consent": "Say yes to Mojang",
    "java-runtime": "The engine's Java",
    "map-storage-directory": "Where maps live",
    "world-folder": "Where worlds live",
    "github-account": "Who we sign in as",
    "language-and-tone": "How it talks",
    "display": "Bigger and easier",
    "surface-placement": "Where things sit",
    "render-memory": "How much thinking room",
    "download-concurrency": "How many at once",
    "notification-duration": "How long messages stay",
    "system-dependencies": "Get the other bits",
    "bluemap-engine": "Which engine",
    "updates": "New versions",
    "vocabulary": "Our own words",
    "app-logo": "Our picture",
    "history": "Go back in time",
    "diagnostics": "If it wakes up poorly",
};

/** The five catalogues, by id. */
export const KID_CATALOGUE_LABELS: Readonly<Record<string, string>> = {
    make: "Make a map",
    maps: "Your maps",
    share: "Show people",
    copy: "Keep it safe",
    setup: "Buttons & help",
};

export type KidLabelStyle = "kid-first" | "name-first" | "name-only";

/**
 * The pair a kid row shows. `primary` is what the child reads, `secondary` keeps the shipped name
 * on screen so a grown-up looking over a shoulder — and every screenshot, search result and
 * accessible name — can still find the feature by its real name.
 */
export function kidLabel(
    shippedName: string,
    table: Readonly<Record<string, string>> = KID_FEATURE_LABELS,
    style: KidLabelStyle = "kid-first",
): { primary: string; secondary: string | null } {
    const kid = table[shippedName];
    if (kid === undefined || style === "name-only") return { primary: shippedName, secondary: null };
    if (style === "name-first") return { primary: shippedName, secondary: kid };
    return { primary: kid, secondary: shippedName };
}

/** The accessible name never drops the shipped name, whatever the label style is. */
export function kidAccessibleName(shippedName: string, table?: Readonly<Record<string, string>>): string {
    const kid = (table ?? KID_FEATURE_LABELS)[shippedName];
    // A plain hyphen, not an em-dash: this project spells em-dashes as ordinary words everywhere
    // else its own copy is checked for one, and a string built here at runtime is no exception.
    return kid === undefined ? shippedName : `${kid} - ${shippedName}`;
}
