/**
 * Structure files a world already has, and the renders somebody has made from them.
 *
 * ## Where these come from
 *
 * A Minecraft structure block saves its capture as an `.nbt` file under
 * `<world>/generated/<namespace>/structures/` (1.13 and later) or, for an older world,
 * directly under `<world>/structures/`. Nothing in this module reads that file off disk -
 * that is the main process's job, using the reader in `@worldlens/nbt` - so this module only
 * knows the shape a scan reports and the shape a render leaves behind. Keeping the model free
 * of disk access is what lets every rule here be tested without a real world on hand.
 *
 * ## One render per structure, not a stack of them
 *
 * A structure file changes rarely once a build is done, so "render this structure" is a
 * request people make once and revisit, not a thing they redo for every camera angle. The
 * "Rendered structures" list is therefore its own record, kept separate from the discovered
 * files: a render can outlive the structure file it came from disappearing off disk (a world
 * moved, a structure block deleted), and the list still remembers what was made.
 */

/** One structure file a scan of the world found. */
export interface StructureFile {
    readonly id: string;
    /** Display name, derived from the filename - see {@link deriveStructureName}. */
    readonly name: string;
    /** The namespace directory the file was found under, `"minecraft"` when there is none. */
    readonly namespace: string;
    /** Absolute path to the `.nbt` file, exactly as the scan reported it. */
    readonly path: string;
    readonly sizeBytes: number;
}

/** A completed render of one structure. */
export interface RenderedStructure {
    readonly id: string;
    /** The {@link StructureFile.id} this was rendered from. */
    readonly structureId: string;
    /** Kept alongside the render so its row still reads if the source file is later gone. */
    readonly name: string;
    /** Where the rendered model's data lives, for whatever opens it. */
    readonly dataRoot: string;
    /** ISO 8601. */
    readonly renderedAt: string;
}

/**
 * A display name from a structure filename.
 *
 * `.nbt` is stripped because the extension is an implementation detail nobody browsing a
 * list needs to see, and underscores become spaces because a structure block's own name
 * field is typically snake_case (`nether_bridge_gate`) and reads far better as
 * "nether bridge gate".
 */
export function deriveStructureName(filename: string): string {
    const withoutExtension = filename.endsWith(".nbt") ? filename.slice(0, -4) : filename;
    return withoutExtension.replace(/_/g, " ").trim();
}

/**
 * A stable id for a structure file.
 *
 * Built from the namespace and the raw filename rather than the display name, so two
 * structures that happen to render to the same display name (`"gate"` and `"Gate"`, say)
 * still get distinct ids, and so the id never moves under a structure whose display name
 * this module changes in a later version.
 */
export function deriveStructureId(namespace: string, filename: string): string {
    return `${namespace}:${filename.endsWith(".nbt") ? filename.slice(0, -4) : filename}`;
}

/** The text a structure file's row is searched against. */
export function structureSearchText(file: StructureFile): string {
    return [file.name, file.namespace, file.path].join(" ");
}

/** The text a rendered structure's row is searched against. */
export function renderedStructureSearchText(rendered: RenderedStructure): string {
    return [rendered.name, rendered.dataRoot].join(" ");
}

export interface StructureNamespaceGroup {
    readonly namespace: string;
    readonly files: readonly StructureFile[];
}

/**
 * Structure files grouped by namespace, namespaces alphabetised and each group's files
 * alphabetised by display name.
 *
 * Grouping by namespace rather than flattening the list matters once a world has more than
 * a couple of data packs contributing structures: `minecraft:village_plains` and
 * `mymodpack:boss_arena` are not really the same kind of thing, and a flat alphabetised list
 * would interleave them with nothing to tell them apart.
 */
export function groupByNamespace(files: readonly StructureFile[]): readonly StructureNamespaceGroup[] {
    const byNamespace = new Map<string, StructureFile[]>();
    for (const file of files) {
        const bucket = byNamespace.get(file.namespace);
        if (bucket) bucket.push(file);
        else byNamespace.set(file.namespace, [file]);
    }
    return [...byNamespace.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([namespace, group]) => ({
            namespace,
            files: group.slice().sort((a, b) => a.name.localeCompare(b.name)),
        }));
}
