/**
 * The two claims the project editor makes about itself, worked out from real values.
 *
 * Both are sentences the approved prototype puts on the screen, and both are the sort of
 * sentence that is worse than nothing when it is wrong:
 *
 *  - **"it opens on BlueMap's own generated defaults, so every setting is there from the first
 *    second."** That is a claim about a number, and a hard-coded number goes stale the first
 *    time upstream adds a setting. {@link editorSettingCount} counts the descriptors the editor
 *    actually opens, so the sentence follows the schema rather than somebody's memory of it;
 *  - **"nothing is written until you save."** A save plan that names the wrong file, or implies
 *    a save touches the world folder, would be this application lying about the one operation
 *    people are most careful with. {@link savePlanFacts} names the single file a save writes and
 *    what that file will contain, and nothing else.
 *
 * Plain functions over plain values, for the same reason `projectModel.ts` is: the claims worth
 * making on screen are the ones a test can prove, and a claim buried in a computed property in
 * a `.vue` file is provable only by mounting the whole editor.
 *
 * ## What the save plan deliberately does not say
 *
 * It does not say which *settings* changed. The editor is handed the project being edited and
 * a `dirty` flag, never the copy that is on disk, so there is no baseline here to diff against
 * and a per-field list would have to be invented. Naming the file, its contents and the things a
 * save leaves alone is everything this component can honestly know, and it is also the half
 * people actually get wrong: the fear is that saving a project reaches into the world folder or
 * the tiles, and it does neither.
 */

import { PROJECT_FILE_NAME, descriptorFor, type ProjectFile } from "@worldlens/config";
import { SINGLETONS } from "./projectModel.js";
import type { AnyDescriptor } from "../config/configModel.js";

/**
 * Every kind of config file this editor puts on screen for a project.
 *
 * `storage-file` rather than both storage shapes: a storage is one file with two Java classes
 * behind it, and a project shows one or the other, never both at once, so counting both would
 * inflate the number by a shape nobody is looking at.
 */
const OPENED_DESCRIPTORS = ["map", "storage-file", ...SINGLETONS] as const;

/**
 * How many BlueMap settings the editor opens for a project, counted from the schema.
 *
 * Deliberately not memoised behind a module-level constant that a test could not vary: the
 * descriptors are frozen data and this is a handful of array lengths, so the honest cheap thing
 * is to count them when asked.
 */
export function editorSettingCount(): number {
    return OPENED_DESCRIPTORS.reduce(
        (total, id) => total + (descriptorFor(id) as AnyDescriptor).fields.length,
        0,
    );
}

/** The one file on disk a project is, at the root of the world folder it belongs to. */
export function projectFilePath(world: string, separator = "/"): string {
    const trimmed = world.replace(/[\\/]+$/, "");
    return trimmed === "" ? PROJECT_FILE_NAME : `${trimmed}${separator}${PROJECT_FILE_NAME}`;
}

export interface SavePlanFacts {
    /** The full path of the single file a save writes. */
    readonly file: string;
    /** How many maps that file will hold. */
    readonly maps: number;
    readonly storages: number;
    /** How many of the four whole-file configs this project carries one of its own. */
    readonly singletons: number;
    /** False when the file on disk already matches what is on screen, so a save writes nothing. */
    readonly changed: boolean;
}

export function savePlanFacts(
    project: ProjectFile,
    world: string,
    separator = "/",
    changed = false,
): SavePlanFacts {
    return {
        file: projectFilePath(world, separator),
        maps: project.maps.length,
        storages: project.storages.length,
        singletons: SINGLETONS.filter((kind) => project[kind] !== null).length,
        changed,
    };
}
