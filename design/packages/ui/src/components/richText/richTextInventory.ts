/**
 * The hand-written inventory behind the rich text rule: every field where a person formats
 * text uses `RichTextField` (the bundled TinyMCE), and every other multi-line box is a named,
 * justified plain text or code box.
 *
 * `richTextInventory.test.ts` reads the whole package against this list in both directions. A
 * rule that only scanned for the wrong thing would stay green while a new formatting field
 * went unnoticed, so the list is kept by hand and the test fails when the source and the list
 * disagree: a listed field that lost its editor, a new editor that is not listed, and a new
 * multi-line box that nobody has classified.
 *
 * Paths are relative to `src/`, with forward slashes.
 */

export interface RichTextFieldEntry {
    /** A stable name for the field. */
    readonly id: string;
    /** The file that mounts the editor. */
    readonly file: string;
    /** The `data-test` the field carries, so a test can find it. */
    readonly dataTest: string;
    /** What the field holds and where the formatted text ends up. */
    readonly holds: string;
}

/** Every field where a person formats text. Each one mounts `RichTextField`. */
export const RICH_TEXT_FIELDS: readonly RichTextFieldEntry[] = [
    {
        id: "marker-note",
        file: "components/markers/MarkerStudio.vue",
        dataTest: "marker-detail",
        holds: "The note on a marker the person draws. It is shown as HTML in the marker popup, so it keeps bold, lists, links and tables.",
    },
];

export type PlainTextBoxKind = "plain" | "code" | "data";

export interface PlainTextBoxEntry {
    /** The file that holds the boxes. */
    readonly file: string;
    /** How many multi-line text boxes the file opens, counted by the guard. */
    readonly count: number;
    readonly kind: PlainTextBoxKind;
    /** Why the box stays a plain box instead of the rich text editor. */
    readonly reason: string;
}

/**
 * Every multi-line text box that is not a rich text field, with the reason it is not one.
 * Plain text stays plain and code stays code; neither takes formatting.
 */
export const PLAIN_TEXT_BOXES: readonly PlainTextBoxEntry[] = [
    { file: "components/appearance/creative/CreativeStudio.vue", count: 1, kind: "plain", reason: "The words of one text layer in a drawing. The layer is styled as a whole through the typography controls; the text itself carries no inline formatting." },
    { file: "components/base64/Base64Screen.vue", count: 1, kind: "data", reason: "Text or Base64 being converted. Bytes in, bytes out." },
    { file: "components/config/ConfigControl.vue", count: 1, kind: "plain", reason: "A multi-line configuration value, written to a config file as plain text." },
    { file: "components/config/ConfigFileForm.vue", count: 1, kind: "code", reason: "The raw text of a configuration file that does not parse." },
    { file: "components/config/ConfigMarkerSetsField.vue", count: 1, kind: "code", reason: "Marker sets as written in the configuration file." },
    { file: "components/config/ConfigRegexBuilder.vue", count: 2, kind: "code", reason: "A regular expression and its sample text." },
    { file: "components/converter/ConverterScreen.vue", count: 2, kind: "data", reason: "File paths, one per line." },
    { file: "components/datapack/DataPackCreator.vue", count: 2, kind: "code", reason: "The pack description written to pack.mcmeta as a plain string, and a data pack file as JSON." },
    { file: "components/datapack/FunctionEditor.vue", count: 1, kind: "code", reason: "A function file's commands." },
    { file: "components/gallery/ScreenshotGalleryScreen.vue", count: 1, kind: "plain", reason: "Notes stored with a screenshot's metadata as plain text." },
    { file: "components/locks/SupportTickets.vue", count: 1, kind: "plain", reason: "A support ticket's description, submitted as plain text." },
    { file: "components/markers/MarkerStudio.vue", count: 1, kind: "data", reason: "The geometry points of a marker, as JSON." },
    { file: "components/markers/RegexBuilder.vue", count: 2, kind: "code", reason: "A regular expression and its sample text." },
    { file: "components/mcserver/BotWorkflowPanel.vue", count: 1, kind: "plain", reason: "A read-only log of observed lifecycle messages." },
    { file: "components/mcserver/ServerConfigEditor.vue", count: 1, kind: "code", reason: "The raw text of a server configuration file. The message of the day is a one-line server.properties value that uses the game's own section-sign codes, not HTML." },
    { file: "components/menu/MenuRegexBuilder.vue", count: 2, kind: "code", reason: "A regular expression and its sample text." },
    { file: "components/nbteditor/NbtDialogs.vue", count: 1, kind: "code", reason: "A tag in SNBT, the game's text form." },
    { file: "components/ollama/OllamaScreen.vue", count: 2, kind: "plain", reason: "A model's system prompt and the chat message being sent, both plain text for the model." },
    { file: "components/repair/IssueReportPanel.vue", count: 3, kind: "plain", reason: "A reviewed issue report: its title, its sections and a read-only preview of the exact submitted body." },
    { file: "components/vdisk/VirtualDisksScreen.vue", count: 1, kind: "data", reason: "A metadata value stored as UTF-8." },
];
