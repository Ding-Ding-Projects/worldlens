/**
 * The messages between the type generator screen and the worker that runs quicktype.
 *
 * The screen never imports quicktype-core. Everything it knows about languages and their
 * options arrives in a `describe` reply, so the language list and every option control come
 * from the library's own definitions rather than a hand-written copy that would drift.
 */

/** Input larger than this is refused before it reaches the engine. */
export const MAX_INPUT_CHARS = 2_000_000;

export type SourceKind = "json" | "schema" | "typescript" | "graphql";

/** Every source kind, in the order the picker lists them. */
export const SOURCE_KINDS: readonly SourceKind[] = ["json", "schema", "typescript", "graphql"];

export type OptionValue = string | boolean;

/** One renderer option of a target language, taken from quicktype's own definitions. */
export interface LanguageOption {
    readonly name: string;
    readonly description: string;
    readonly kind: "boolean" | "enum" | "string";
    readonly primary: boolean;
    readonly defaultValue: OptionValue | undefined;
    /** Legal values of an enum option, in the library's order. */
    readonly values: readonly string[];
    /** The library's own hint for a free-text option. */
    readonly typeLabel: string;
}

export interface LanguageInfo {
    /** The name quicktype addresses the language by. */
    readonly name: string;
    readonly displayName: string;
    readonly extension: string;
    readonly options: readonly LanguageOption[];
}

/** The inference switches quicktype exposes, plus the two generation switches beside them. */
export interface InferenceSettings {
    readonly inferEnums: boolean;
    readonly inferMaps: boolean;
    readonly inferDateTimes: boolean;
    readonly inferUuids: boolean;
    readonly inferIntegerStrings: boolean;
    readonly inferBooleanStrings: boolean;
    readonly combineClasses: boolean;
    readonly ignoreJsonRefs: boolean;
    readonly allPropertiesOptional: boolean;
    readonly alphabetizeProperties: boolean;
}

export const INFERENCE_KEYS: readonly (keyof InferenceSettings)[] = [
    "inferEnums",
    "inferMaps",
    "inferDateTimes",
    "inferUuids",
    "inferIntegerStrings",
    "inferBooleanStrings",
    "combineClasses",
    "ignoreJsonRefs",
    "allPropertiesOptional",
    "alphabetizeProperties",
];

export const DEFAULT_INFERENCE: InferenceSettings = {
    inferEnums: true,
    inferMaps: true,
    inferDateTimes: true,
    inferUuids: true,
    inferIntegerStrings: true,
    inferBooleanStrings: true,
    combineClasses: true,
    ignoreJsonRefs: false,
    allPropertiesOptional: false,
    alphabetizeProperties: false,
};

export interface GenerateRequest {
    readonly type: "generate";
    readonly id: number;
    readonly kind: SourceKind;
    readonly topLevelName: string;
    /** JSON text, schema text, or the GraphQL schema (introspection JSON or SDL). */
    readonly text: string;
    /** The GraphQL query, for the graphql kind. */
    readonly query?: string;
    readonly language: string;
    readonly rendererOptions: Readonly<Record<string, OptionValue>>;
    readonly inference: InferenceSettings;
}

export interface DescribeRequest {
    readonly type: "describe";
    readonly id: number;
}

export type WorkerRequest = GenerateRequest | DescribeRequest;

/** One generated type in the inspector, built from the engine's own JSON Schema output. */
export interface InferredType {
    readonly name: string;
    readonly kind: "object" | "enum" | "union" | "other";
    readonly properties: readonly { readonly name: string; readonly type: string; readonly required: boolean }[];
    readonly values: readonly string[];
}

export type FailureKind = "parse" | "unsupported" | "tooLarge" | "engine";

export interface GenerateSuccess {
    readonly type: "generated";
    readonly id: number;
    readonly ok: true;
    readonly code: string;
    readonly inferred: readonly InferredType[];
    readonly elapsedMs: number;
}

export interface GenerateFailure {
    readonly type: "generated";
    readonly id: number;
    readonly ok: false;
    readonly failure: FailureKind;
    readonly message: string;
}

export interface DescribeReply {
    readonly type: "described";
    readonly id: number;
    readonly languages: readonly LanguageInfo[];
}

export type WorkerReply = GenerateSuccess | GenerateFailure | DescribeReply;
