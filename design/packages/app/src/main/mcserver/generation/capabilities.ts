import type { Control } from "@worldlens/config";
import { serverPropertiesFields } from "../config/schemas/serverProperties.js";
import { parseJson, setJsonValue } from "../config/parseJson.js";
import type { DescribedFile, ConfigChange } from "../config/describe.js";
import { containsProtectedGenerationInput, isProtectedGenerationKey } from "./protectedFields.js";

export interface CapabilitySource {
    readonly edition: "java" | "bedrock";
    readonly version: string;
    readonly flavour: string;
    readonly reference: string;
    readonly sha256: string;
}
export interface SelectedGenerationTarget {
    readonly edition: "java" | "bedrock";
    readonly version: string;
    readonly flavour: string;
}
export interface DiscoveredGameRule {
    readonly name: string;
    readonly value?: boolean | number;
    readonly control: Control;
}
export interface DatapackSchemaInput {
    readonly id: string;
    /** Relative path below the new world's datapacks directory. */
    readonly file: string;
    readonly sourceText: string;
    readonly fields: readonly {
        readonly key: string;
        readonly path: readonly string[];
        readonly control: Control;
    }[];
}
export interface SelectedGenerationInventory {
    readonly source: CapabilitySource;
    /** Observed generated keys for this exact distribution, not a guessed version range. */
    readonly serverPropertyKeys: readonly string[];
    readonly serverPropertyValues?: Readonly<Record<string, unknown>>;
    readonly gameRules: readonly DiscoveredGameRule[] | null;
    readonly generationTypes: readonly string[] | null;
    readonly dimensions: readonly string[] | null;
    readonly datapacks: readonly DatapackSchemaInput[];
    readonly configurationFiles?: readonly DescribedFile[];
}
export type GenerationConsumer =
    | { readonly kind: "server-property"; readonly key: string }
    | { readonly kind: "gamerule"; readonly name: string }
    | {
          readonly kind: "datapack-json";
          readonly packId: string;
          readonly file: string;
          readonly path: readonly string[];
      }
    | {
          readonly kind: "configuration-file";
          readonly file: string;
          readonly hash: string;
          readonly path: readonly string[];
      }
    | { readonly kind: "inventory-only" };
export interface GenerationCapability {
    readonly key: string;
    readonly label: string;
    readonly category: string;
    readonly control: Control | null;
    readonly value?: unknown;
    readonly source: CapabilitySource | null;
    readonly consumer: GenerationConsumer;
    readonly available: boolean;
    readonly reason: string | null;
}
const exactSource = (target: SelectedGenerationTarget, source: CapabilitySource) =>
    target.edition === source.edition &&
    target.version === source.version &&
    target.flavour === source.flavour &&
    !!source.reference &&
    /^[0-9a-f]{64}$/i.test(source.sha256);
const coordinatorProperties = new Set(["level-name", "level-seed", "server-port"]);
const ruleName = /^[a-zA-Z][a-zA-Z0-9_:.-]{0,127}$/;
export function safeDatapackPath(file: string): boolean {
    return (
        file.length < 512 &&
        !file.includes("\\") &&
        !file.startsWith("/") &&
        !file
            .split("/")
            .some(
                (segment) =>
                    !segment ||
                    segment === "." ||
                    segment === ".." ||
                    !/^[-a-zA-Z0-9_.]+$/.test(segment),
            ) &&
        (file.endsWith(".json") || file.endsWith("/pack.mcmeta"))
    );
}
export function safeGenerationConfigPath(file: string): boolean {
    return (
        file.length < 512 &&
        !file.startsWith("/") &&
        !file.includes("\\") &&
        !file.includes(":") &&
        !file.split("/").some((segment) => !segment || segment === "." || segment === "..") &&
        (/\.(properties|ya?ml|toml|json)$/i.test(file) || file === "eula.txt")
    );
}

function protectedControl(control: Control): boolean {
    if (control.kind === "key-value") return control.secretKeys.length > 0;
    if (control.kind === "list") return protectedControl(control.item);
    if (control.kind === "record-table")
        return control.columns.some(
            (column) => isProtectedGenerationKey(column.key) || protectedControl(column.control),
        );
    return false;
}
/** This sanitized projection is the only generation inventory allowed across the main boundary. */
export function sanitizeGenerationInventory(
    inventory: SelectedGenerationInventory,
): SelectedGenerationInventory {
    return {
        ...inventory,
        serverPropertyKeys: inventory.serverPropertyKeys.filter(
            (key) => !isProtectedGenerationKey(key),
        ),
        ...(inventory.serverPropertyValues
            ? {
                  serverPropertyValues: Object.fromEntries(
                      Object.entries(inventory.serverPropertyValues).filter(
                          ([key, value]) =>
                              !isProtectedGenerationKey(key) &&
                              !containsProtectedGenerationInput(value),
                      ),
                  ),
              }
            : {}),
        gameRules:
            inventory.gameRules?.filter(
                (rule) => !isProtectedGenerationKey(rule.name) && !protectedControl(rule.control),
            ) ?? null,
        datapacks: inventory.datapacks
            .filter((pack) => !containsProtectedGenerationInput(pack.sourceText))
            .map((pack) => ({
                ...pack,
                fields: pack.fields.filter(
                    (field) =>
                        !isProtectedGenerationKey(field.key) &&
                        !field.path.some(isProtectedGenerationKey) &&
                        !protectedControl(field.control),
                ),
            })),
        ...(inventory.configurationFiles
            ? {
                  configurationFiles: inventory.configurationFiles.map((file) => ({
                      ...file,
                      fields: file.fields.filter(
                          (field) =>
                              field.protected !== true &&
                              !isProtectedGenerationKey(field.key) &&
                              !field.path.some(isProtectedGenerationKey) &&
                              !containsProtectedGenerationInput(field.value) &&
                              !protectedControl(field.control),
                      ),
                  })),
              }
            : {}),
    };
}

/** Complete static property inventory plus every entry actually discovered at the selected target. */
export function describeGenerationCapabilities(
    target: SelectedGenerationTarget,
    inventory: SelectedGenerationInventory | null,
): readonly GenerationCapability[] {
    if (inventory) inventory = sanitizeGenerationInventory(inventory);
    const verified =
        inventory !== null && exactSource(target, inventory.source) && target.edition === "java";
    const source = inventory?.source ?? null;
    const reason = "Exact selected edition/version/flavour source inventory is unavailable.";
    const out: GenerationCapability[] = serverPropertiesFields
        .filter(
            (field) =>
                !field.secret &&
                !isProtectedGenerationKey(field.key) &&
                !protectedControl(field.control),
        )
        .map((field) => {
            const available =
                verified &&
                inventory!.serverPropertyKeys.includes(field.key) &&
                !coordinatorProperties.has(field.key);
            return {
                key: `property:${field.key}`,
                label: field.label,
                category: "Server properties",
                control: field.control,
                ...(inventory?.serverPropertyValues &&
                Object.hasOwn(inventory.serverPropertyValues, field.key)
                    ? { value: inventory.serverPropertyValues[field.key] }
                    : {}),
                source,
                consumer: { kind: "server-property", key: field.key },
                available,
                reason: coordinatorProperties.has(field.key)
                    ? "Use the dedicated generation input for this coordinator-owned property."
                    : available
                      ? null
                      : reason,
            };
        });
    // Runtime extensions can add fields absent from the bundled descriptive schema.
    for (const key of inventory?.serverPropertyKeys ?? [])
        if (!serverPropertiesFields.some((field) => field.key === key))
            out.push({
                key: `property:${key}`,
                label: key,
                category: "Discovered server properties",
                control: { kind: "text" },
                source,
                consumer: { kind: "server-property", key },
                available: verified,
                reason: verified ? null : reason,
            });
    for (const rule of inventory?.gameRules ?? [])
        out.push({
            key: `gamerule:${rule.name}`,
            label: rule.name,
            category: "Game rules",
            control: rule.control,
            value: rule.value,
            source,
            consumer: { kind: "gamerule", name: rule.name },
            available: verified && ruleName.test(rule.name),
            reason: verified && ruleName.test(rule.name) ? null : reason,
        });
    const types = inventory?.generationTypes;
    out.push({
        key: "generation:types",
        label: "Generation type",
        category: "Terrain",
        control: types
            ? {
                  kind: "select",
                  options: types.map((value) => ({ value, label: value })),
                  allowCustom: false,
              }
            : null,
        source,
        consumer: { kind: "server-property", key: "level-type" },
        available:
            verified && !!types?.length && inventory!.serverPropertyKeys.includes("level-type"),
        reason:
            verified && types?.length
                ? null
                : "Generation type registry was not supplied for this target.",
    });
    for (const dimension of inventory?.dimensions ?? [])
        out.push({
            key: `dimension:${dimension}`,
            label: dimension,
            category: "Dimensions",
            control: null,
            source,
            consumer: { kind: "inventory-only" },
            available: false,
            reason: "Discovered dimension. Edit its supplied datapack schema to change generation; dimension selection alone does not execute generation.",
        });
    for (const pack of inventory?.datapacks ?? [])
        for (const field of pack.fields) {
            const available =
                verified && safeDatapackPath(pack.file) && parseJson(pack.sourceText).ok;
            out.push({
                key: `datapack:${pack.id}:${field.key}`,
                label: field.key,
                category: `Datapack ${pack.id}`,
                control: field.control,
                source,
                consumer: {
                    kind: "datapack-json",
                    packId: pack.id,
                    file: pack.file,
                    path: field.path,
                },
                available,
                reason: available
                    ? null
                    : "Datapack source, strict JSON or safe path validation failed.",
            });
        }
    for (const file of inventory?.configurationFiles ?? [])
        for (const field of file.fields) {
            const available =
                verified &&
                safeGenerationConfigPath(file.path) &&
                !["server.properties", "eula.txt"].includes(file.path) &&
                !file.unreadable &&
                field.state !== "read-only" &&
                /^[0-9a-f]{64}$/i.test(file.hash);
            out.push({
                key: `config:${file.path}:${field.path.map(encodeURIComponent).join("/")}`,
                label: field.label,
                category: `Configuration ${file.path}`,
                control: field.control,
                value: field.value,
                source,
                consumer: {
                    kind: "configuration-file",
                    file: file.path,
                    hash: file.hash,
                    path: field.path,
                },
                available,
                reason: available
                    ? null
                    : (field.readOnlyReason ?? "This configuration file cannot be safely changed."),
            });
        }
    for (const [key, label, present] of [
        [
            "game-rules",
            "Game rules",
            inventory?.gameRules !== null && inventory?.gameRules !== undefined,
        ],
        [
            "dimensions",
            "Dimensions",
            inventory?.dimensions !== null && inventory?.dimensions !== undefined,
        ],
        ["generation-types", "Generation types", !!inventory?.generationTypes],
        ["datapack-schemas", "Installed datapack schemas", !!inventory?.datapacks.length],
    ] as const)
        if (!present)
            out.push({
                key: `unavailable:${key}`,
                label,
                category: "Unavailable inventories",
                control: null,
                source,
                consumer: { kind: "inventory-only" },
                available: false,
                reason: `No exact selected-target ${label.toLowerCase()} inventory was supplied.`,
            });
    return out;
}
export interface GenerationConfigChanges {
    readonly file: string;
    readonly hash: string;
    readonly changes: readonly ConfigChange[];
}
export interface CompiledGenerationPlan {
    readonly serverProperties: Readonly<Record<string, string>>;
    readonly commands: readonly string[];
    readonly datapackFiles: readonly { readonly path: string; readonly content: string }[];
    readonly configurationChanges: readonly GenerationConfigChanges[];
}
/** Values retain their types until this boundary emits the selected server's native inputs. */
export function compileGenerationPlan(
    target: SelectedGenerationTarget,
    inventory: SelectedGenerationInventory,
    values: Readonly<Record<string, unknown>>,
): CompiledGenerationPlan {
    if (containsProtectedGenerationInput(values))
        throw new Error("Protected fields cannot be submitted through generation settings.");
    inventory = sanitizeGenerationInventory(inventory);
    const capabilities = describeGenerationCapabilities(target, inventory);
    const properties: Record<string, string> = {};
    const commands: string[] = [];
    const files = new Map<string, string>();
    const configurationChanges = new Map<
        string,
        { file: string; hash: string; changes: ConfigChange[] }
    >();
    const selectedPacks = new Set(
        Object.keys(values)
            .map((key) => capabilities.find((entry) => entry.key === key)?.consumer)
            .filter(
                (consumer): consumer is Extract<GenerationConsumer, { kind: "datapack-json" }> =>
                    consumer?.kind === "datapack-json",
            )
            .map((consumer) => consumer.packId),
    );
    for (const pack of inventory.datapacks)
        if (selectedPacks.has(pack.id)) {
            if (!safeDatapackPath(pack.file) || !parseJson(pack.sourceText).ok)
                throw new Error("Invalid datapack file.");
            if (files.has(pack.file) && files.get(pack.file) !== pack.sourceText)
                throw new Error("Conflicting datapack file sources.");
            files.set(pack.file, pack.sourceText);
        }
    for (const [key, value] of Object.entries(values)) {
        const descriptor = capabilities.find((entry) => entry.key === key);
        if (!descriptor?.available) throw new Error(`Unavailable generation capability: ${key}.`);
        const control = descriptor.control;
        if (
            (control?.kind === "switch" && typeof value !== "boolean") ||
            ((control?.kind === "number" || control?.kind === "slider") &&
                (typeof value !== "number" || !Number.isFinite(value)))
        )
            throw new Error(`Invalid typed generation value: ${key}.`);
        if (
            (control?.kind === "text" || control?.kind === "path" || control?.kind === "color") &&
            typeof value !== "string"
        )
            throw new Error(`Expected a string generation value: ${key}.`);
        if (
            (control?.kind === "number" || control?.kind === "slider") &&
            typeof value === "number"
        ) {
            if (
                (control.integer && !Number.isSafeInteger(value)) ||
                (control.min !== undefined && value < control.min) ||
                (control.max !== undefined && value > control.max)
            )
                throw new Error(`Generation number is outside its source constraints: ${key}.`);
        }
        if (
            control?.kind === "select" &&
            !control.allowCustom &&
            !control.options.some((option) => option.value === value)
        )
            throw new Error(`Unknown selected value: ${key}.`);
        const consumer = descriptor.consumer;
        if (consumer.kind === "server-property") {
            if (
                !["string", "number", "boolean"].includes(typeof value) ||
                /[\r\n]/.test(String(value))
            )
                throw new Error(`Invalid scalar server property: ${key}.`);
            if (consumer.key === "generator-settings") {
                if (
                    typeof value !== "string" ||
                    !parseJson(value).ok ||
                    Array.isArray(JSON.parse(value))
                )
                    throw new Error("Generator settings must be a strict JSON object.");
            }
            properties[consumer.key] = String(value);
        } else if (consumer.kind === "gamerule") {
            if (
                typeof value !== "boolean" &&
                (typeof value !== "number" || !Number.isSafeInteger(value))
            )
                throw new Error("Game rules require a boolean or safe integer.");
            commands.push(`gamerule ${consumer.name} ${value}`);
        } else if (consumer.kind === "configuration-file") {
            const previous = configurationChanges.get(consumer.file) ?? {
                file: consumer.file,
                hash: consumer.hash,
                changes: [],
            };
            if (previous.hash !== consumer.hash)
                throw new Error("Conflicting configuration revisions.");
            previous.changes.push({ path: consumer.path, value });
            configurationChanges.set(consumer.file, previous);
        } else if (consumer.kind === "datapack-json") {
            const pack = inventory.datapacks.find(
                (entry) => entry.id === consumer.packId && entry.file === consumer.file,
            );
            if (!pack) throw new Error("Datapack source was removed.");
            const parsed = parseJson(files.get(pack.file) ?? pack.sourceText);
            if (!parsed.ok) throw new Error(parsed.failure.message);
            const edited = setJsonValue(parsed.value, consumer.path, value, parsed.value.hash);
            if (!edited.ok) throw new Error(edited.failure.message);
            files.set(pack.file, edited.value.sourceText);
        }
    }
    return {
        serverProperties: properties,
        commands,
        datapackFiles: [...files].map(([path, content]) => ({ path, content })),
        configurationChanges: [...configurationChanges.values()],
    };
}
