/**
 * How each catalogue is drawn on Home and on its own page: the icon glyph and the colour role of
 * its icon tile.
 *
 * This is presentation, not information architecture, so it lives beside the two surfaces that
 * draw it rather than in `catalogues.ts`. The approved prototype gives every catalogue a tile on
 * a container role (secondary for most, tertiary for Share, a neutral surface for Set up & help,
 * and the filled primary tile on the Make a map hero) and a Material Symbols glyph; the glyphs
 * below are the closest `@mdi/js` equivalents, because that is the icon set the shell ships.
 *
 * It also carries one small hand-off: a hero chip names a group inside Make a map, and the
 * catalogue page that opens should land on that group. The shell's navigation only knows a
 * catalogue id, so the chip leaves the group here and the page takes it once on mount.
 */

import {
    mdiCloudUploadOutline,
    mdiDnsOutline,
    mdiExportVariant,
    mdiLayersOutline,
    mdiMapMarkerPlusOutline,
    mdiTune,
} from "@mdi/js";
import type { CatalogueId } from "../shell/featureTargets.js";

/** The colour role pair a catalogue's icon tile is painted with. */
export type CatalogueTileTone = "primary" | "secondary" | "tertiary" | "neutral";

export interface CatalogueTone {
    readonly icon: string;
    readonly tile: CatalogueTileTone;
}

export const CATALOGUE_TONES: Readonly<Record<CatalogueId, CatalogueTone>> = {
    make: { icon: mdiMapMarkerPlusOutline, tile: "primary" },
    maps: { icon: mdiLayersOutline, tile: "secondary" },
    share: { icon: mdiExportVariant, tile: "tertiary" },
    copy: { icon: mdiCloudUploadOutline, tile: "secondary" },
    host: { icon: mdiDnsOutline, tile: "secondary" },
    setup: { icon: mdiTune, tile: "neutral" },
};

export function catalogueTone(id: CatalogueId): CatalogueTone {
    return CATALOGUE_TONES[id];
}

/* -------------------------------------------------------------------------- */
/* Landing on a group                                                         */
/* -------------------------------------------------------------------------- */

let pending: { readonly catalogueId: CatalogueId; readonly groupKey: string } | null = null;

/** Called by a chip just before it opens its catalogue. */
export function requestCatalogueGroup(catalogueId: CatalogueId, groupKey: string): void {
    pending = { catalogueId, groupKey };
}

/**
 * The group a chip asked this catalogue page to land on, or null. Read once: a later visit to
 * the same catalogue from its card opens at the top, as it should.
 */
export function takeCatalogueGroup(catalogueId: CatalogueId): string | null {
    const current = pending;
    pending = null;
    return current !== null && current.catalogueId === catalogueId ? current.groupKey : null;
}
