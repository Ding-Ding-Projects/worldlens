/**
 * XP, levels and stickers — each one bound to a real completed action, never to time spent.
 *
 * A sticker is awarded by the same events the notification centre already raises, so nothing here
 * can congratulate a child for something the application did not actually do. The award ledger is
 * append-only and local; it is never uploaded, exported or attached to a release, and it carries no
 * world path, account name or other identifying value — only the feature name and a timestamp.
 */
import { computed, ref, watch, type Ref } from "vue";
import {
    mdiBrush,
    mdiCloudUploadOutline,
    mdiFolderSearchOutline,
    mdiHistory,
    mdiMapMarkerMultipleOutline,
    mdiSpeedometer,
    mdiWeb,
    mdiWrenchOutline,
} from "@mdi/js";

const KEY_LEDGER = "bluemap-kid-progress";
const XP_PER_LEVEL = 500;

/**
 * The feature each sticker is earned from, by its shipped English name.
 *
 * `icon` carries the real `@mdi/js` path data, not the literal text of an import name: a string
 * like `"mdiBrush"` is what the export is *called*, never a glyph `<v-icon>` can render, so a
 * sticker built from one rendered nothing until this fix (kid-mode drop-in audit, defect 10).
 *
 * ### Which stickers a real completion event can actually reach, today
 *
 * `award()` on its own was reachable from nowhere outside `kid/` for a whole prior audit pass -
 * a real, wired ledger and celebration with no caller. `App.vue` now calls it from four genuine
 * completions (see its own `awardKidSticker()` and each of its callers): **first-map** on any
 * render becoming a viewable map, **speed-racer** specifically on a local (world/project) render
 * finishing, **world-finder** on the guide handing back a project for a world it found, and
 * **sharer** on opening an already-published GitHub Pages site.
 *
 * The remaining four - **pin-dropper**, **safe-keeper**, **fixer**, **time-traveller** - stay in
 * this list because they name real, shipped features, not because anything can earn them yet.
 * `MarkerMenu.vue` has no "a pin was placed" emit, `BackupScreen.vue` has no "a backup finished"
 * emit, nothing surfaces "automatic repair applied a fix" outside the render-repair flow itself,
 * and `HistoryPanel.vue` restores a revision and raises a notice without ever telling its parent
 * it happened. Each needs one small emit added to a file this kid-mode wiring pass does not own,
 * not a fabricated signal here - awarding one of these off some other event would be the
 * wrong-event mistake `award()`'s own doc comment warns against, which is worse than leaving it
 * unearned. Until that emit exists, these four sit in the sticker book exactly as any other
 * not-yet-earned sticker does: visibly present, honestly never won.
 */
export const STICKER_DEFINITIONS = [
    { id: "first-map", feature: "Renders in progress", kid: "Map maker", icon: mdiBrush, xp: 50 },
    { id: "world-finder", feature: "Project world discovery", kid: "World finder", icon: mdiFolderSearchOutline, xp: 20 },
    { id: "speed-racer", feature: "Live render speed", kid: "Speed racer", icon: mdiSpeedometer, xp: 20 },
    // Not yet wired to a real event - see this array's own doc comment above.
    { id: "pin-dropper", feature: "Markers and marker sets", kid: "Pin dropper", icon: mdiMapMarkerMultipleOutline, xp: 20 },
    // Not yet wired to a real event - see this array's own doc comment above.
    { id: "safe-keeper", feature: "Backups", kid: "Safe keeper", icon: mdiCloudUploadOutline, xp: 40 },
    { id: "sharer", feature: "Publish to GitHub Pages", kid: "Sharer", icon: mdiWeb, xp: 40 },
    // Not yet wired to a real event - see this array's own doc comment above.
    { id: "fixer", feature: "Automatic repair", kid: "Fixer", icon: mdiWrenchOutline, xp: 30 },
    // Not yet wired to a real event - see this array's own doc comment above.
    { id: "time-traveller", feature: "Local version history", kid: "Time traveller", icon: mdiHistory, xp: 30 },
] as const;

export type StickerId = (typeof STICKER_DEFINITIONS)[number]["id"];

interface Ledger {
    xp: number;
    won: { id: StickerId; at: string }[];
}

function read(): Ledger {
    try {
        const raw = globalThis.localStorage?.getItem(KEY_LEDGER);
        if (raw === null || raw === undefined) return { xp: 0, won: [] };
        const parsed = JSON.parse(raw) as Partial<Ledger>;
        const won = Array.isArray(parsed.won) ? parsed.won : [];
        return { xp: typeof parsed.xp === "number" ? parsed.xp : 0, won: won as Ledger["won"] };
    } catch {
        /* A ledger that does not parse is refused whole rather than partly applied. */
        return { xp: 0, won: [] };
    }
}

export function useKidProgress() {
    const ledger: Ref<Ledger> = ref(read());
    watch(ledger, (next) => globalThis.localStorage?.setItem(KEY_LEDGER, JSON.stringify(next)), { deep: true });

    const level = computed(() => Math.floor(ledger.value.xp / XP_PER_LEVEL) + 1);
    const intoLevel = computed(() => ledger.value.xp % XP_PER_LEVEL);
    const toNextLevel = computed(() => XP_PER_LEVEL - intoLevel.value);

    const stickers = computed(() =>
        STICKER_DEFINITIONS.map((definition) => ({
            ...definition,
            won: ledger.value.won.some((entry) => entry.id === definition.id),
        })),
    );

    /** Call from the completion event of a real action. Returns what to celebrate, or null. */
    function award(id: StickerId): { levelledUp: boolean; sticker: string } | null {
        const definition = STICKER_DEFINITIONS.find((entry) => entry.id === id);
        if (definition === undefined) return null;
        if (ledger.value.won.some((entry) => entry.id === id)) return null;
        const before = level.value;
        ledger.value = {
            xp: ledger.value.xp + definition.xp,
            won: [...ledger.value.won, { id, at: new Date().toISOString() }],
        };
        return { levelledUp: level.value > before, sticker: definition.kid };
    }

    return { level, intoLevel, toNextLevel, xp: computed(() => ledger.value.xp), stickers, award };
}
