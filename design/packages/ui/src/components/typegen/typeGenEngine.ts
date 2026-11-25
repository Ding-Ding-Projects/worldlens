/**
 * The generation engine: quicktype-core, run locally, with no network access.
 *
 * This module is imported only by the worker (and by tests and the no-Worker fallback), so
 * the screen itself stays small and quicktype lands in its own chunk. Nothing here touches
 * the network: JSON Schema references to other documents are not fetched, they fail with the
 * library's own message.
 */
import {
    InputData,
    JSONSchemaInput,
    defaultTargetLanguages,
    jsonInputForTargetLanguage,
    type LanguageName,
    quicktype,
    type OptionDefinition,
    type TargetLanguage,
} from "quicktype-core";
import { GraphQLInput } from "quicktype-graphql-input";
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql";
import {
    MAX_INPUT_CHARS,
    type FailureKind,
    type GenerateFailure,
    type GenerateRequest,
    type GenerateSuccess,
    type InferredType,
    type LanguageInfo,
    type LanguageOption,
    type OptionValue,
    type WorkerReply,
    type WorkerRequest,
} from "./typeGenTypes.js";

class EngineFailure extends Error {
    constructor(
        readonly failure: FailureKind,
        message: string,
    ) {
        super(message);
    }
}

function describeOption(definition: OptionDefinition): LanguageOption {
    const rawValues = (definition as { values?: Record<string, unknown> }).values;
    const enumValues = rawValues ? Object.keys(rawValues) : [];
    const kind: LanguageOption["kind"] =
        definition.optionType === "boolean" ? "boolean" : enumValues.length > 0 ? "enum" : "string";
    const fallback = definition.defaultValue;
    return {
        name: definition.name,
        description: definition.description,
        kind,
        primary: definition.kind === "primary",
        defaultValue: typeof fallback === "string" || typeof fallback === "boolean" ? fallback : undefined,
        values: enumValues,
        typeLabel: definition.typeLabel ?? "",
    };
}

/** Every language quicktype offers, with its own option definitions. */
export function describeLanguages(): readonly LanguageInfo[] {
    return defaultTargetLanguages.map((language: TargetLanguage) => ({
        name: language.names[0] ?? language.displayName,
        displayName: language.displayName,
        extension: language.extension,
        options: language.optionDefinitions.map(describeOption),
    }));
}

function parseJson(text: string, label: string): unknown {
    try {
        return JSON.parse(text);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new EngineFailure("parse", `${label}: ${reason}`);
    }
}

function looksLikeJson(text: string): boolean {
    return /^\s*[{[]/.test(text);
}

/** A GraphQL schema arrives as introspection JSON, or as SDL which is turned into it. */
function graphqlIntrospection(text: string): unknown {
    if (looksLikeJson(text)) return parseJson(text, "GraphQL schema");
    try {
        const result = graphqlSync({ schema: buildSchema(text), source: getIntrospectionQuery() });
        if (result.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
        return result;
    } catch (error) {
        throw new EngineFailure("parse", `GraphQL schema: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function buildInput(request: GenerateRequest): Promise<InputData> {
    const input = new InputData();
    const name = request.topLevelName.trim() || "Root";
    switch (request.kind) {
        case "json": {
            parseJson(request.text, "JSON");
            const source = jsonInputForTargetLanguage(request.language as LanguageName);
            await source.addSource({ name, samples: [request.text] });
            input.addInput(source);
            return input;
        }
        case "schema": {
            parseJson(request.text, "JSON Schema");
            const source = new JSONSchemaInput(undefined);
            await source.addSource({ name, schema: request.text });
            input.addInput(source);
            return input;
        }
        case "graphql": {
            const schema = graphqlIntrospection(request.text);
            const query = request.query ?? "";
            if (query.trim() === "") throw new EngineFailure("parse", "GraphQL query: write a query to generate types for.");
            const source = new GraphQLInput();
            await source.addSource({ name, schema, query });
            input.addInput(source);
            return input;
        }
        default:
            throw new EngineFailure(
                "unsupported",
                "TypeScript input needs the TypeScript compiler reading files from disk, which a browser or renderer cannot do. Use JSON Schema or JSON instead.",
            );
    }
}

function renderOptions(request: GenerateRequest): Record<string, OptionValue> {
    const language = describeLanguages().find((entry) => entry.name === request.language);
    const known = new Set(language?.options.map((option) => option.name) ?? []);
    const chosen: Record<string, OptionValue> = {};
    for (const [key, value] of Object.entries(request.rendererOptions)) {
        if (known.has(key)) chosen[key] = typeof value === "boolean" ? value : String(value);
    }
    return chosen;
}

/** Describes one JSON Schema fragment as a short type expression. */
export function describeSchemaType(node: unknown): string {
    if (node === null || typeof node !== "object") return "unknown";
    const schema = node as Record<string, unknown>;
    if (typeof schema.$ref === "string") return schema.$ref.split("/").pop() ?? schema.$ref;
    for (const key of ["anyOf", "oneOf"] as const) {
        const parts = schema[key];
        if (Array.isArray(parts)) return parts.map(describeSchemaType).join(" | ");
    }
    if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
    const type = schema.type;
    if (Array.isArray(type)) return type.join(" | ");
    if (type === "array") return `${describeSchemaType(schema.items)}[]`;
    if (type === "object") {
        const extra = schema.additionalProperties;
        if (extra !== undefined && extra !== false && extra !== true && !schema.properties) return `map<string, ${describeSchemaType(extra)}>`;
        return "object";
    }
    if (typeof type === "string") return typeof schema.format === "string" ? `${type} (${schema.format})` : type;
    return "unknown";
}

/** Reads the engine's own JSON Schema output into the inspector's list of types. */
export function inferredTypesFromSchema(schemaText: string): readonly InferredType[] {
    let root: unknown;
    try {
        root = JSON.parse(schemaText);
    } catch {
        return [];
    }
    if (root === null || typeof root !== "object") return [];
    const definitions = (root as { definitions?: Record<string, unknown> }).definitions ?? {};
    const result: InferredType[] = [];
    for (const [name, raw] of Object.entries(definitions)) {
        if (raw === null || typeof raw !== "object") continue;
        const schema = raw as Record<string, unknown>;
        if (Array.isArray(schema.enum)) {
            result.push({ name, kind: "enum", properties: [], values: schema.enum.map((value) => String(value)) });
        } else if (schema.type === "object" || typeof schema.properties === "object") {
            const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
            const properties = Object.entries((schema.properties ?? {}) as Record<string, unknown>).map(
                ([property, value]) => ({ name: property, type: describeSchemaType(value), required: required.has(property) }),
            );
            result.push({ name, kind: "object", properties, values: [] });
        } else if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
            result.push({ name, kind: "union", properties: [], values: [describeSchemaType(schema)] });
        } else {
            result.push({ name, kind: "other", properties: [], values: [describeSchemaType(schema)] });
        }
    }
    return result;
}

async function runQuicktype(request: GenerateRequest, language: string, rendererOptions: Record<string, OptionValue>) {
    const inputData = await buildInput(request);
    return quicktype({
        inputData,
        lang: language as LanguageName,
        rendererOptions,
        inferEnums: request.inference.inferEnums,
        inferMaps: request.inference.inferMaps,
        inferDateTimes: request.inference.inferDateTimes,
        inferUuids: request.inference.inferUuids,
        inferIntegerStrings: request.inference.inferIntegerStrings,
        inferBooleanStrings: request.inference.inferBooleanStrings,
        combineClasses: request.inference.combineClasses,
        ignoreJsonRefs: request.inference.ignoreJsonRefs,
        allPropertiesOptional: request.inference.allPropertiesOptional,
        alphabetizeProperties: request.inference.alphabetizeProperties,
        leadingComments: [],
    });
}

/** Runs one generation. Never throws: a failure comes back as a reply with its reason. */
export async function generate(request: GenerateRequest): Promise<GenerateSuccess | GenerateFailure> {
    const started = Date.now();
    try {
        if (request.text.length + (request.query?.length ?? 0) > MAX_INPUT_CHARS) {
            throw new EngineFailure(
                "tooLarge",
                `The input is larger than ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. Trim it or generate from a smaller sample.`,
            );
        }
        if (request.kind === "typescript") await buildInput(request);
        const language = describeLanguages().find((entry) => entry.name === request.language);
        if (!language) throw new EngineFailure("unsupported", `Unknown target language: ${request.language}`);
        const result = await runQuicktype(request, request.language, renderOptions(request));
        let inferred: readonly InferredType[] = [];
        try {
            const schemaResult = await runQuicktype(request, "schema", {});
            inferred = inferredTypesFromSchema(schemaResult.lines.join("\n"));
        } catch {
            // The code above is the product; the inspector is a convenience and may be empty.
        }
        return { type: "generated", id: request.id, ok: true, code: result.lines.join("\n"), inferred, elapsedMs: Date.now() - started };
    } catch (error) {
        if (error instanceof EngineFailure) {
            return { type: "generated", id: request.id, ok: false, failure: error.failure, message: error.message };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { type: "generated", id: request.id, ok: false, failure: "engine", message };
    }
}

/** The worker's whole protocol, kept here so tests drive the same code the worker runs. */
export async function handleMessage(message: WorkerRequest): Promise<WorkerReply> {
    if (message.type === "describe") return { type: "described", id: message.id, languages: describeLanguages() };
    return generate(message);
}
