export { default as VocabularyUploadRow } from "./VocabularyUploadRow.vue";

export { applyVocabulary, applyVocabularyTemplate } from "./applyVocabulary.js";

export {
    VOCABULARY_MAX_BYTES,
    VOCABULARY_MAX_DEPTH,
    VOCABULARY_MAX_ENTRIES,
    VOCABULARY_MAX_KEY_LENGTH,
    VOCABULARY_MAX_VALUE_LENGTH,
    VOCABULARY_SCHEMA_VERSION,
    validateVocabularyPayload,
} from "./vocabularySchema.js";
export type {
    VocabularyPayload,
    VocabularyRejectionReason,
    VocabularyValidationFailure,
    VocabularyValidationResult,
    VocabularyValidationSuccess,
} from "./vocabularySchema.js";

export {
    VOCABULARY_STORAGE_KEY,
    clearVocabulary,
    loadVocabularyFile,
    reloadVocabularyStore,
    setVocabularyPersistence,
    vocabularyStore,
} from "./vocabularyStore.js";
export type { VocabularyLoadResult, VocabularyStatus } from "./vocabularyStore.js";
