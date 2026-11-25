import type { TinyMCE } from "tinymce";

/**
 * The one place TinyMCE is imported, and the reason it never costs startup time.
 *
 * Everything here is a dynamic `import()`, so Vite writes the editor, its skins, its icons and
 * its plugins into chunks that are fetched only when a rich text field first appears. All of
 * them come from the `tinymce` package bundled into this build: there is no Tiny Cloud script,
 * no API key and no request to a Tiny host, so the editor works offline and sends nothing out.
 *
 * Skins and the editor's own stylesheet are the `.js` forms TinyMCE ships for bundlers. Each
 * one registers its CSS as a named resource on the global `tinymce`, which is why the global
 * has to exist before any of them runs and why they are imported after the core, not beside it.
 */

/** The exact version this build bundles, checked against `package.json` by a test. */
export const TINYMCE_PINNED_VERSION = "8.11.0";

/** TinyMCE's interface language for Cantonese. English is the editor's built-in language. */
export const TINYMCE_CANTONESE_LANGUAGE = "zh-HK";

export type TinymceSkin = "oxide" | "oxide-dark";

let pending: Promise<TinyMCE> | null = null;

async function importEditor(): Promise<TinyMCE> {
    const core = await import("tinymce");
    const tinymce = ((core as { default?: TinyMCE }).default ?? core) as TinyMCE;
    const scope = globalThis as { tinymce?: TinyMCE };
    scope.tinymce ??= tinymce;

    await Promise.all([
        import("tinymce/icons/default"),
        import("tinymce/models/dom"),
        import("tinymce/themes/silver"),
        import("tinymce/skins/ui/oxide/skin.js"),
        import("tinymce/skins/ui/oxide/content.js"),
        import("tinymce/skins/ui/oxide-dark/skin.js"),
        import("tinymce/skins/ui/oxide-dark/content.js"),
        import("tinymce/skins/content/default/content.js"),
        import("tinymce/skins/content/dark/content.js"),
        import("tinymce/plugins/lists"),
        import("tinymce/plugins/link"),
        import("tinymce/plugins/autolink"),
        import("tinymce/plugins/table"),
        import("tinymce/plugins/charmap"),
        import("tinymce/plugins/searchreplace"),
        import("tinymce/plugins/wordcount"),
        import("tinymce/plugins/fullscreen"),
        import("tinymce/plugins/help"),
        import("tinymce-i18n/langs8/zh-HK.js"),
    ]);
    return tinymce;
}

/** Loads the bundled editor once; a failed load can be retried by the next caller. */
export function loadTinymce(): Promise<TinyMCE> {
    pending ??= importEditor().catch((error: unknown) => {
        pending = null;
        throw error;
    });
    return pending;
}
