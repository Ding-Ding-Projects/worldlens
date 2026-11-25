/**
 * The rich text editor's own sentences: the line shown while it loads and the line shown when
 * it cannot load. Fixed copy, English and Cantonese, with no funny levels: one says a control
 * is not ready and the other says what to do about a failure, and a playful version of either
 * would only make the state harder to read.
 *
 * The editor's own buttons and menus are TinyMCE's and are translated by its language pack;
 * the field labels belong to the screens that use the field.
 */

export const RICHTEXT_FIXED = {
    "richText.loading": {
        en: "Loading the text editor...",
        yue: "載入緊文字編輯器...",
    },
    "richText.failed": {
        en: "The text editor could not load, so the note is shown as raw formatted text. It can still be edited and saved.",
        yue: "文字編輯器載入唔到,所以備註會以原始格式文字顯示。你仍然可以編輯同儲存。",
    },
} as const;
