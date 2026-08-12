/**
 * Deciding whether a dropped file is something the renderer can use, before anything is
 * touched.
 *
 * ## Why this exists at all
 *
 * A drop target with no rules behind it is a trap: somebody drags in a `.zip` of their whole
 * world folder, or a screenshot they meant for a different window, and the only feedback is
 * silence or a stack trace three steps later. Every rule here runs before a single byte of the
 * file is read, so the person gets an answer they can act on - "that ends in `.png`, not a
 * structure or schematic" - rather than a spinner that never finishes.
 *
 * ## What counts as a structure
 *
 * Minecraft structures and schematics come out of a handful of tools, and each one has kept
 * its own file extension: vanilla structure blocks write `.nbt`, and the WorldEdit family of
 * schematic formats write `.schem` (the modern Sponge format) or `.schematic` (the older MCEdit
 * one). `.litematic` files from Litematica are accepted too, because recognising them costs
 * nothing more than one more string in a set. Nothing here inspects the file's actual bytes -
 * that is the renderer's job, once a file has cleared this first, cheap gate.
 */

/** The extensions this drop zone will hand to a render, without the leading dot. */
export const SUPPORTED_DROP_EXTENSIONS = ["nbt", "schem", "schematic", "litematic"] as const;

export type SupportedDropExtension = (typeof SUPPORTED_DROP_EXTENSIONS)[number];

/**
 * Above this, a dropped file is refused outright rather than handed to a render pipeline that
 * would take minutes to fail on it. A real structure - even a large multi-chunk build - fits
 * comfortably under a gigabyte; anything bigger dropped here is far more likely to be the wrong
 * file entirely (a world save, a resource pack) than a legitimate structure.
 */
export const MAX_DROP_FILE_BYTES = 1024 * 1024 * 1024;

/** A file the drop zone is willing to send to a render. */
export interface AcceptedDrop {
    readonly ok: true;
    /** `.nbt` structures and `.litematic` files render the same way; schematics are their own kind. */
    readonly kind: "structure" | "schematic";
    readonly name: string;
}

/** A file the drop zone refused, and why - always specific enough to act on. */
export interface RejectedDrop {
    readonly ok: false;
    readonly name: string;
    readonly reason: string;
}

export type DropClassification = AcceptedDrop | RejectedDrop;

function extensionOf(name: string): string | null {
    const dot = name.lastIndexOf(".");
    // A name with no dot, or one that is only a dot (a hidden file with no suffix), has no
    // extension to check - both are refused as "unknown extension" below rather than crashing
    // on a negative slice.
    if (dot <= 0 || dot === name.length - 1) return null;
    return name.slice(dot + 1).toLowerCase();
}

function kindForExtension(extension: SupportedDropExtension): "structure" | "schematic" {
    return extension === "schem" || extension === "schematic" ? "schematic" : "structure";
}

/**
 * Classifies one dropped file by its name and size, without reading its contents.
 *
 * Every rejection names the file's own extension (or says it has none) and lists what is
 * accepted, so the message is useful on its own without the person having to guess what the
 * drop zone wanted.
 */
export function classifyDroppedFile(name: string, sizeBytes: number): DropClassification {
    const acceptedList = SUPPORTED_DROP_EXTENSIONS.map((ext) => `.${ext}`).join(", ");

    if (sizeBytes <= 0) {
        return {
            ok: false,
            name,
            reason: `"${name}" is empty (0 bytes). Drop a real structure or schematic file.`,
        };
    }

    if (sizeBytes > MAX_DROP_FILE_BYTES) {
        const maxMebibytes = Math.round(MAX_DROP_FILE_BYTES / (1024 * 1024));
        return {
            ok: false,
            name,
            reason: `"${name}" is larger than ${maxMebibytes} MiB, which is too big to be a structure or schematic. If this really is one, it needs to be split first.`,
        };
    }

    const extension = extensionOf(name);
    if (extension === null || !(SUPPORTED_DROP_EXTENSIONS as readonly string[]).includes(extension)) {
        const seen = extension === null ? "no file extension" : `a ".${extension}" extension`;
        return {
            ok: false,
            name,
            reason: `"${name}" has ${seen}. This drop zone only accepts ${acceptedList}.`,
        };
    }

    return { ok: true, kind: kindForExtension(extension as SupportedDropExtension), name };
}

/** What a batch of dropped files came out as: how many landed and every reason one did not. */
export interface DropSummary {
    readonly accepted: readonly AcceptedDrop[];
    readonly rejected: readonly RejectedDrop[];
}

/**
 * Classifies every file in a drop at once, so a surface can show "3 accepted, 1 rejected: ..."
 * before it commits to starting anything. Order is preserved within each group so the preview
 * lines up with the order the person dropped the files in.
 */
export function dropSummary(files: readonly { name: string; size: number }[]): DropSummary {
    const accepted: AcceptedDrop[] = [];
    const rejected: RejectedDrop[] = [];
    for (const file of files) {
        const result = classifyDroppedFile(file.name, file.size);
        if (result.ok) {
            accepted.push(result);
        } else {
            rejected.push(result);
        }
    }
    return { accepted, rejected };
}
