/**
 * TinyMCE ships its skins, icons, models, plugins and themes as plain scripts that register
 * themselves on the global `tinymce`, with no type declarations. They are imported only for
 * that side effect by `components/richText/tinymceLoader.ts`.
 */
declare module "tinymce/icons/*";
declare module "tinymce/models/*";
declare module "tinymce/themes/*";
declare module "tinymce/skins/*";
declare module "tinymce/plugins/*";
declare module "tinymce-i18n/*";
