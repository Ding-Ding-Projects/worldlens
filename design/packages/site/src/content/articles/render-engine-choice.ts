import type { Article } from "../types.js";
import { REPO_URL, ROADMAP_URL, issue, repoFile } from "../links.js";

export const renderEngineChoice: Article = {
    id: "render-engine-choice",
    title: "Choosing a render engine",
    summary:
        "Every project can name the original BlueMap engine or the JVM-free Worldlens engine, while Automatic chooses a deterministic path and exposes version, provenance and capability differences before rendering.",
    category: "engine",
    status: "ported-unverified",
    statusNote:
        "The settings and project-editor surfaces now persist the versioned choice and explain the two engines. Runtime routing and packaged dual-engine proof remain the issue's open acceptance work.",
    sections: [
        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "A project may choose BlueMap's original Java engine, the Worldlens app engine, or Automatic. Automatic keeps the original engine when a suitable JVM is available and chooses the app engine when it is not. The setting never silently changes an existing explicit project choice.",
                },
                {
                    kind: "table",
                    caption: "Engine comparison",
                    columns: ["Engine", "Version/provenance", "Capability boundary"],
                    rows: [
                        [
                            { strong: "BlueMap original engine" },
                            "BlueMap 5.22, upstream source and packaged Java runtime",
                            "Original BlueMap compatibility; requires a suitable JVM",
                        ],
                        [
                            { strong: "Worldlens app engine" },
                            "Worldlens format v1, TypeScript engine shipped with the app",
                            "JVM-free and offline; upstream-only integrations may differ",
                        ],
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Settings → Render engine choice controls the global default for new projects.",
                        "The project editor's How it renders tab carries its own override. Use Automatic to inherit the global default and resolve the no-JVM case at render time.",
                        "Export and import use the versioned worldlens.render-engine-choice JSON record. The application history mirror records changes without placing secrets in the export.",
                    ],
                },
                {
                    kind: "code",
                    language: "json",
                    caption: "The neutral record shape",
                    code: '{\n  "schema": "worldlens.render-engine-choice",\n  "version": 1,\n  "globalDefault": "automatic"\n}',
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "No suitable JVM: Automatic selects the Worldlens app engine and states that nothing was downloaded.",
                        "Unsupported setting: the panel lists the exact conditional or unsupported capability before a render starts; it does not pretend the two engines are identical.",
                        "Invalid import: the file is rejected as a whole, with no partial selection applied.",
                        "Unavailable runtime evidence: a project editor says Automatic will resolve at render time instead of inventing a Java version.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The choice record is local application data. Imports are bounded to the documented schema and accept only the two engine identifiers plus Automatic. The UI does not download a JVM, execute an engine, or accept arbitrary commands; those privileged operations remain in the desktop runtime boundary and must report their own provenance.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "callout",
                    tone: "not-implemented",
                    title: "Runtime proof still open",
                    content:
                        "Issue #78 still requires routing local, Docker, CLI and restart-with-speed requests through the selected capability, plus one genuine packaged render with each engine and a documented comparison. The current UI is honest about that boundary.",
                },
                {
                    kind: "list",
                    items: [
                        [{ link: "Issue #78", href: issue(78), external: true }, " tracks the remaining runtime and packaged-artifact proof."],
                        [{ link: "Roadmap engine decision", href: ROADMAP_URL, external: true }, " records the standing Java decision and the later switch boundary."],
                    ],
                },
            ],
        },
    ],
    suggested: [
        { articleId: "java-render-path", reason: "Read the original Java path and its provenance record." },
        { articleId: "project-editor", reason: "See where project-level render settings are edited and saved." },
        { articleId: "config-history", reason: "Learn how settings changes are mirrored into local history." },
    ],
    sources: [
        { label: "Issue #78", href: issue(78) },
        { label: "UI engine-choice store", href: repoFile("design/packages/ui/src/components/settings/engineChoice.ts") },
        { label: "Project editor", href: repoFile("design/packages/ui/src/components/project/ProjectEditor.vue") },
        { label: "Roadmap", href: ROADMAP_URL },
        { label: "Worldlens repository", href: REPO_URL },
    ],
};
