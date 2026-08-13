/**
 * The personal-vocabulary upload row: the one control that lets somebody supply their
 * own private replacement words, and the four states it can be in - no file yet,
 * loaded, rejected, and cleared back to the first of those.
 *
 * Every level says the same three facts regardless of how playfully it says them: the
 * app renders its own shipped wording until a file is supplied, nothing here reaches a
 * network, and a rejected file changes nothing that was already on screen. Those are the
 * ones a person acts on, so they are pinned in `VOCABULARY_FACTS` rather than left to
 * survive a rewrite by luck.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const VOCABULARY_VOICED = {
    "vocabulary.upload.description": {
        en: [
            "Upload your own local JSON file to replace specific words with your own, everywhere this app shows text. Nothing is sent anywhere, and nothing changes until you supply a file.",
            "Upload your own local JSON file to replace specific words with your own, everywhere this app shows text. Nothing is sent anywhere, and nothing changes until you supply a file.",
            "Upload your own local JSON file to swap specific words for your own, everywhere this app shows text. Nothing is sent anywhere, and nothing changes until you supply a file.",
            "Upload your own local JSON file to swap specific words for your own, everywhere this app shows text. Nothing is sent anywhere, it never was, and nothing changes until you supply a file.",
            "Upload your own local JSON file and swap specific words for your own, everywhere this app opens its mouth. Nothing is sent anywhere, not one byte, and nothing changes until you supply a file.",
        ],
        yue: [
            "上載你自己部機度嘅 JSON 檔案，將指定嘅字換成你自己揀嘅字，喺呢個程式顯示文字嘅任何地方都會生效。乜嘢都唔會傳去邊度，而且未上載檔案之前乜都唔會變。",
            "上載你自己部機度嘅 JSON 檔案，將指定嘅字換成你自己揀嘅字，喺呢個程式顯示文字嘅任何地方都會生效。乜嘢都唔會傳去邊度，而且未上載檔案之前乜都唔會變。",
            "上載返你自己部機度嘅 JSON 檔案，將指定嘅字換成你自己揀嘅字，成個程式顯示文字嘅地方都會生效。乜嘢都唔會傳去邊度，而且未上載檔案之前乜都唔會變。",
            "上載返你自己部機度嘅 JSON 檔案，將指定嘅字換成你自己揀嘅字，成個程式顯示文字嘅地方都會生效。乜嘢都唔會傳去邊度，而且未上載檔案之前乜都唔會變。",
            "上載返你自己部機度嘅 JSON 檔案，成個程式一開口就用你自己揀嘅字。乜嘢都唔會傳去邊度，而且未上載檔案之前，未上載檔案之前乜都唔會變，佢照樣講返本來嗰句。",
        ],
    },
    "vocabulary.upload.noFile": {
        en: [
            "No vocabulary file supplied. Everything is shown in its original wording.",
            "No vocabulary file supplied. Everything is shown in its original wording.",
            "No vocabulary file supplied yet, so everything is shown in its original wording.",
            "No vocabulary file supplied yet, so everything on screen is still in its original wording.",
            "No vocabulary file has turned up yet, so everything on screen is still speaking in its original wording, unedited.",
        ],
        yue: [
            "未上載過詞彙檔案，全部文字都用返原本嘅字眼。",
            "未上載過詞彙檔案，全部文字都用返原本嘅字眼。",
            "重未上載過詞彙檔案，所以全部文字都用返原本嘅字眼。",
            "重未上載過詞彙檔案，所以畫面上嘅嘢全部都用返原本嘅字眼。",
            "未上載過詞彙檔案，個檔案重未現身，所以畫面上嘅嘢全部都照講返原本嘅字眼。",
        ],
    },
    "vocabulary.upload.loaded": {
        en: [
            "Loaded: {count} words replaced. Cleared, this reverts to the original wording.",
            "Loaded: {count} words replaced. Cleared, this reverts to the original wording.",
            "Loaded: {count} words are being replaced right now. Clearing this reverts to the original wording.",
            "Loaded and in effect: {count} words are being replaced right now. Clearing this reverts everything to the original wording.",
            "Loaded and doing its job: {count} words are being swapped in right now. Clearing this puts every one of them back to the original wording.",
        ],
        yue: [
            "已載入：換咗 {count} 個字。清除之後就會返去原本嘅字眼。",
            "已載入：換咗 {count} 個字。清除之後就會返去原本嘅字眼。",
            "已載入：而家有 {count} 個字被替換緊。清除之後就會返去原本嘅字眼。",
            "已載入並生效緊：而家有 {count} 個字被替換緊。清除之後全部都會返去原本嘅字眼。",
            "已載入，而且做緊嘢：而家有 {count} 個字被換緊字。清除之後，每一個都會返去原本嘅字眼。",
        ],
    },
    "vocabulary.upload.invalid": {
        en: [
            "That file was not applied: {reason} Nothing already on screen was changed.",
            "That file was not applied: {reason} Nothing already on screen was changed.",
            "That file was not applied: {reason} Nothing already on screen changed as a result.",
            "That file was not applied. {reason} Nothing already on screen changed - a rejected file never applies partially.",
            "That file was not applied, turned away at the door: {reason} Nothing already on screen so much as flickered, and a rejected file never applies partially.",
        ],
        yue: [
            "呢個檔案冇被採用：{reason} 畫面上原有嘅嘢冇變過。",
            "呢個檔案冇被採用：{reason} 畫面上原有嘅嘢冇變過。",
            "呢個檔案冇被採用：{reason} 畫面上原有嘅嘢完全冇變過。",
            "呢個檔案冇被採用。{reason} 畫面上原有嘅嘢冇變過，俾拒絕嘅檔案唔會部分生效。",
            "呢個檔案冇被採用，喺門口就俾人截返轉頭：{reason} 畫面上原有嘅嘢郁都冇郁過，俾拒絕嘅檔案唔會部分生效。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const VOCABULARY_FIXED = {
    "vocabulary.upload.chooseFile": {
        en: "Choose a vocabulary file...",
        yue: "揀一個詞彙檔案…",
    },
    "vocabulary.upload.replaceFile": {
        en: "Replace the vocabulary file...",
        yue: "換一個詞彙檔案…",
    },
    "vocabulary.upload.clear": { en: "Clear", yue: "清除" },
    "vocabulary.upload.fileInputLabel": {
        en: "Personal vocabulary JSON file",
        yue: "個人詞彙 JSON 檔案",
    },
    "vocabulary.upload.cacheUnreadable": {
        en: "The saved vocabulary could not be read back, so original wording is in effect. Upload it again to restore it.",
        yue: "已儲存嘅詞彙讀唔返，而家用緊原本嘅字眼。重新上載一次可以攞返嚟。",
    },

    /* One plain-language reason per rejection code from vocabularySchema.ts. */
    "vocabulary.reason.too-large": {
        en: "the file is larger than this app allows",
        yue: "個檔案大過呢個程式容許嘅上限",
    },
    "vocabulary.reason.malformed-json": {
        en: "the file is not valid JSON",
        yue: "個檔案唔係有效嘅 JSON",
    },
    "vocabulary.reason.not-an-object": {
        en: "the file's top level must be a single JSON object",
        yue: "個檔案最頂層必須係一個 JSON object",
    },
    "vocabulary.reason.unexpected-field": {
        en: "the file has a field this format does not recognise",
        yue: "個檔案有一個呢個格式唔識嘅欄位",
    },
    "vocabulary.reason.missing-schema-version": {
        en: "the file does not say which schema version it uses",
        yue: "個檔案冇講明用緊邊個 schema 版本",
    },
    "vocabulary.reason.unknown-schema-version": {
        en: "the file's schema version is not one this build supports",
        yue: "個檔案嘅 schema 版本唔係呢個版本支援嘅",
    },
    "vocabulary.reason.missing-entries": {
        en: "the file has no entries field",
        yue: "個檔案冇 entries 呢個欄位",
    },
    "vocabulary.reason.entries-not-an-object": {
        en: "the entries field must be a single JSON object of words to replacements",
        yue: "entries 呢個欄位必須係一個字對應替換字嘅 JSON object",
    },
    "vocabulary.reason.too-many-entries": {
        en: "the file has more entries than this app allows",
        yue: "個檔案嘅項目多過呢個程式容許嘅上限",
    },
    "vocabulary.reason.too-deeply-nested": {
        en: "the entries field nests deeper than a flat word-to-word list should",
        yue: "entries 嵌套得太深，唔似一個平面嘅字對字清單",
    },
    "vocabulary.reason.unsafe-key": {
        en: "one entry uses a word this app will not accept as a key",
        yue: "有一個項目用咗一個呢個程式唔接受做 key 嘅字",
    },
    "vocabulary.reason.key-too-long": {
        en: "one entry's word is longer than this app allows",
        yue: "有一個項目嘅字長過呢個程式容許嘅上限",
    },
    "vocabulary.reason.empty-key": {
        en: "one entry has an empty word",
        yue: "有一個項目嘅字係空嘅",
    },
    "vocabulary.reason.duplicate-key": {
        en: "the same word appears more than once",
        yue: "同一個字出現咗多過一次",
    },
    "vocabulary.reason.value-not-a-string": {
        en: "one entry's replacement is not plain text",
        yue: "有一個項目嘅替換字唔係純文字",
    },
    "vocabulary.reason.value-too-long": {
        en: "one entry's replacement is longer than this app allows",
        yue: "有一個項目嘅替換字長過呢個程式容許嘅上限",
    },
    "vocabulary.reason.read-failed": {
        en: "the file could not be read from disk",
        yue: "個檔案由磁碟讀唔到",
    },
} as const satisfies Record<string, FixedString>;

export const VOCABULARY_FACTS = {
    "vocabulary.upload.description": {
        en: ["local JSON file", "Nothing is sent anywhere", "nothing changes until you supply a file"],
        yue: ["JSON 檔案", "乜嘢都唔會傳去邊度", "未上載檔案之前乜都唔會變"],
    },
    "vocabulary.upload.noFile": {
        en: ["No vocabulary file", "original wording"],
        yue: ["未上載過詞彙檔案", "原本嘅字眼"],
    },
    "vocabulary.upload.loaded": {
        en: ["Loaded", "{count}", "original wording"],
        yue: ["已載入", "{count}", "原本嘅字眼"],
    },
    "vocabulary.upload.invalid": {
        en: ["not applied", "{reason}", "Nothing already on screen"],
        yue: ["冇被採用", "{reason}", "畫面上原有嘅嘢"],
    },
} as const satisfies Record<
    keyof typeof VOCABULARY_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
