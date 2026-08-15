<script setup lang="ts">
/**
 * Every implemented row, in one file - matching this workspace's own established convention
 * (`packages/ui/src/App.vue` is 2500+ lines for the same reason: this codebase favours fewer,
 * long, heavily-commented files over many small near-duplicates when the pieces genuinely
 * belong together). Every `data-md3-row` id below MUST have a matching entry in `lib/rows.ts`'s
 * `ROW_MANIFEST` - `lib/rows.test.ts` enforces that in both directions.
 *
 * ## The measurement convention every row follows
 *
 * Each row measures its component's own OUTER/CONTAINER element by default (matching the
 * `data-measure` attribute this file places on it), which is what makes Height/Width/Corner
 * radius/Elevation-adjacent fields meaningful everywhere. Three rows (Switch, Checkbox, Radio)
 * override the Worldlens-side selector instead: Vuetify renders those as a large invisible hit-
 * target wrapper around a much smaller visible glyph/track, and measuring the outer wrapper
 * would report the hit-target's size as though it were the visible control - so those three
 * target the specific inner element that IS the visible shape, via `worldlens-selector`. See
 * each row's own comment for the exact reasoning.
 *
 * A handful of rows have fields that are honestly not very meaningful for that shape (a line
 * divider has no "font size"; a circular indicator has no "corner radius" in the usual sense).
 * Rather than hide those columns per row - which would make the table's shape inconsistent
 * from row to row - each such row's citation text says which fields to trust.
 */
import { mdiHeartOutline } from "@mdi/js";
import RowShell from "./RowShell.vue";

const heartIcon = mdiHeartOutline;
</script>

<template>
    <div class="md3check-gallery">
        <!-- ============================== BUTTONS ============================== -->
        <RowShell
            id="button-filled"
            title="Button — Filled"
            m3-name="Filled button"
            :citations="[
                'Height: 40dp; shape: Full (fully rounded). M3 Common buttons spec.',
                'Label: Label Large (14sp / 20sp line-height / 500 weight / +0.1px tracking).',
                'Container = primary, label = on-primary. Horizontal padding 24dp.',
            ]"
        >
            <template #reference>
                <div class="md3ref-btn md3ref-btn--filled" data-measure>Filled</div>
            </template>
            <template #worldlens>
                <v-btn data-measure color="primary" variant="flat">Filled</v-btn>
            </template>
        </RowShell>

        <RowShell
            id="button-outlined"
            title="Button — Outlined"
            m3-name="Outlined button"
            :citations="[
                'Height: 40dp; shape: Full. Same Label Large text style as every button variant.',
                'Transparent container, 1dp outline border, label = primary. Horizontal padding 24dp.',
            ]"
        >
            <template #reference>
                <div class="md3ref-btn md3ref-btn--outlined" data-measure>Outlined</div>
            </template>
            <template #worldlens>
                <v-btn data-measure color="primary" variant="outlined">Outlined</v-btn>
            </template>
        </RowShell>

        <RowShell
            id="button-text"
            title="Button — Text"
            m3-name="Text button"
            :citations="[
                'Height: 40dp; shape: Full. Same Label Large text style as every button variant.',
                'No container, no border, label = primary. Horizontal padding 12dp (tighter than the other variants, which have a container to pad).',
            ]"
        >
            <template #reference>
                <div class="md3ref-btn md3ref-btn--text" data-measure>Text</div>
            </template>
            <template #worldlens>
                <v-btn data-measure color="primary" variant="text">Text</v-btn>
            </template>
        </RowShell>

        <!-- ================================ CHIP ================================ -->
        <RowShell
            id="chip-assist"
            title="Chip — Assist (flat)"
            m3-name="Assist chip"
            :citations="[
                'Height: 32dp; shape: Small (8dp) - every chip TYPE shares this one shape token.',
                'Flat variant: container sits on the surrounding surface with a 1dp outline; label = on-surface-variant.',
                'Label text: Label Large, same ramp buttons use.',
                'No color prop is set on the Worldlens side, deliberately: this shows Vuetify\'s own unstyled default rather than a value chosen to match.',
            ]"
        >
            <template #reference>
                <div class="md3ref-chip" data-measure>Assist chip</div>
            </template>
            <template #worldlens>
                <v-chip data-measure>Assist chip</v-chip>
            </template>
        </RowShell>

        <!-- ================================ CARD ================================ -->
        <RowShell
            id="card-elevated"
            title="Card — Elevated"
            m3-name="Elevated card"
            :citations="[
                'Shape: Medium (12dp); container = surface; elevation level 1 (two-part key + ambient shadow).',
                'This row measures the CARD\'s own outer element for shape/elevation/colour. Its Font/Line-height fields reflect ' +
                    'whatever cascades to that outer element (not the inner v-card-text slot\'s own type style specifically) - treat ' +
                    'Corner radius, Height/Width and colour/contrast as this row\'s meaningful fields.',
            ]"
        >
            <template #reference>
                <div class="md3ref-card" data-measure>Card content</div>
            </template>
            <template #worldlens>
                <v-card data-measure variant="elevated">
                    <v-card-text>Card content</v-card-text>
                </v-card>
            </template>
        </RowShell>

        <!-- ============================== TEXT FIELD ============================= -->
        <RowShell
            id="text-field-outlined"
            title="Text field — Outlined"
            m3-name="Outlined text field"
            :citations="[
                'Height: 56dp; shape: Extra small (4dp), applied to ALL FOUR corners of the outline.',
                'Input text: Body Large (16sp / 24sp / 400 / +0.5px). Horizontal padding 16dp.',
                'Worldlens pins VTextField to rounded: md (12px, via vuetify.ts\'s COMPONENT_DEFAULTS) - a real, ' +
                    'deliberate 8px divergence from this 4px baseline, not a bug this row is trying to catch.',
            ]"
        >
            <template #reference>
                <div class="md3ref-textfield" data-measure>Label text</div>
            </template>
            <template #worldlens>
                <v-text-field data-measure variant="outlined" label="Label text" model-value="" hide-details density="default" />
            </template>
        </RowShell>

        <!-- ================================ SWITCH =============================== -->
        <RowShell
            id="switch"
            title="Switch — Selected"
            m3-name="Switch"
            :citations="[
                'Track: 52dp x 32dp, shape Full. Selected track container = primary.',
                'Worldlens side measures .v-switch__track specifically, not the whole <v-switch>: Vuetify wraps the visible ' +
                    'track in a much larger invisible hit-target/label wrapper, and measuring that outer wrapper would report ' +
                    'the hit area\'s size as though it were the track\'s.',
            ]"
            worldlens-selector=".v-switch__track"
        >
            <template #reference>
                <div class="md3ref-switch-track" data-measure>
                    <div class="md3ref-switch-thumb"></div>
                </div>
            </template>
            <template #worldlens>
                <v-switch color="primary" :model-value="true" hide-details density="default" />
            </template>
        </RowShell>

        <!-- =============================== CHECKBOX =============================== -->
        <RowShell
            id="checkbox"
            title="Checkbox — Selected"
            m3-name="Checkbox"
            :citations="[
                'Container box: 18dp x 18dp, shape Extra small (2dp corner). Selected container = primary.',
                'Vuetify renders its checkbox as an SVG icon GLYPH (a checked-box path), not a CSS-shaped box with its own ' +
                    'border-radius - so this row\'s Corner-radius comparison is not meaningful on the Worldlens side (it will ' +
                    'read 0, or whatever the icon wrapper itself declares); Height/Width and colour are the fields worth reading.',
                'Worldlens side measures .v-selection-control__input .v-icon specifically, the glyph itself, not the much ' +
                    'larger invisible hit-target wrapper Vuetify renders around it.',
            ]"
            worldlens-selector=".v-selection-control__input .v-icon"
        >
            <template #reference>
                <div class="md3ref-checkbox" data-measure></div>
            </template>
            <template #worldlens>
                <v-checkbox color="primary" :model-value="true" hide-details density="default" />
            </template>
        </RowShell>

        <!-- ================================ RADIO ================================= -->
        <RowShell
            id="radio"
            title="Radio button — Selected"
            m3-name="Radio button"
            :citations="[
                'Outer circle: 20dp diameter, shape Full (a true circle). Selected ring = primary.',
                'Same icon-glyph caveat as Checkbox above: Vuetify draws this as an SVG glyph, not a CSS circle, so treat ' +
                    'this row\'s size fields as the meaningful ones.',
            ]"
            worldlens-selector=".v-selection-control__input .v-icon"
        >
            <template #reference>
                <div class="md3ref-radio" data-measure>
                    <div class="md3ref-radio-dot"></div>
                </div>
            </template>
            <template #worldlens>
                <v-radio color="primary" :model-value="true" hide-details density="default" />
            </template>
        </RowShell>

        <!-- ============================== LIST ITEM ================================ -->
        <RowShell
            id="list-item"
            title="List item — One-line"
            m3-name="One-line list item"
            :citations="[
                'Height: 56dp minimum; 16dp horizontal padding; label: Body Large (16sp / 24sp / 400).',
                'Corner radius 0 deliberately: the baseline spec applies NO shape token to an ordinary list row (rounding is a ' +
                    'card-style-list pattern, not the default). Worldlens pins VListItem to rounded: lg (16px) - a second real, ' +
                    'deliberate divergence this row exists to surface honestly, not to flag as broken.',
            ]"
        >
            <template #reference>
                <div class="md3ref-list-item" data-measure>List item</div>
            </template>
            <template #worldlens>
                <v-list density="default" style="width: 100%">
                    <v-list-item data-measure title="List item" />
                </v-list>
            </template>
        </RowShell>

        <!-- ============================ PROGRESS LINEAR ============================= -->
        <RowShell
            id="progress-linear"
            title="Progress — Linear"
            m3-name="Linear progress indicator"
            :citations="[
                'Track height: 4dp, shape Full (rounded ends). Inactive track = secondary-container, active indicator = primary.',
                'Shown static at a fixed value (not indeterminate/animating), for a deterministic capture. No height prop is ' +
                    'set on the Worldlens side, deliberately, so this row shows Vuetify\'s real default rather than a value ' +
                    'chosen to match the reference.',
            ]"
        >
            <template #reference>
                <div class="md3ref-progress-linear-track" data-measure style="width: 160px">
                    <div class="md3ref-progress-linear-active"></div>
                </div>
            </template>
            <template #worldlens>
                <v-progress-linear data-measure :model-value="60" color="primary" style="width: 160px" />
            </template>
        </RowShell>

        <!-- ========================== PROGRESS CIRCULAR ============================= -->
        <RowShell
            id="progress-circular"
            title="Progress — Circular"
            m3-name="Circular progress indicator"
            :citations="[
                '48dp diameter with a 4dp stroke is a commonly published default size (the spec permits multiple sizes).',
                'Corner radius is not a meaningful field for a circular shape; diameter (Height/Width) and colour are what ' +
                    'this row\'s numbers actually convey. No size prop is set on the Worldlens side, so this shows Vuetify\'s ' +
                    'real default rather than a value chosen to match.',
            ]"
        >
            <template #reference>
                <svg class="md3ref-progress-circular" data-measure viewBox="0 0 48 48" role="img" aria-label="75% circular progress, reference">
                    <circle cx="24" cy="24" r="20" fill="none" stroke-width="4" style="stroke: rgb(var(--v-theme-secondary-container))" />
                    <circle
                        cx="24"
                        cy="24"
                        r="20"
                        fill="none"
                        stroke-width="4"
                        stroke-linecap="round"
                        stroke-dasharray="94.2 125.6"
                        transform="rotate(-90 24 24)"
                        style="stroke: rgb(var(--v-theme-primary))"
                    />
                </svg>
            </template>
            <template #worldlens>
                <v-progress-circular data-measure :model-value="75" color="primary" />
            </template>
        </RowShell>

        <!-- =============================== DIVIDER =================================== -->
        <RowShell
            id="divider"
            title="Divider"
            m3-name="Divider"
            :citations="[
                '1dp thickness, full width, colour = outline-variant.',
                'Vuetify renders <v-divider> as an <hr> styled through border-color, not background-color, so this ' +
                    'instrument\'s generic background/contrast measurement (which reads background-color) cannot see its real ' +
                    'line colour on the Worldlens side and reports the surrounding pane\'s background instead. Height and ' +
                    'presence are the fields worth reading here; Background/Contrast are a known, stated limitation, not a result.',
            ]"
        >
            <template #reference>
                <div class="md3ref-divider" data-measure style="width: 160px"></div>
            </template>
            <template #worldlens>
                <v-divider data-measure style="width: 160px" />
            </template>
        </RowShell>

        <!-- ================================= ICON ===================================== -->
        <RowShell
            id="icon"
            title="Icon"
            m3-name="Iconography"
            :citations="[
                '24dp standard size. Material 3 does not mandate one colour role for every icon; on-surface-variant is used ' +
                    'here as a common default for a standalone icon with no surrounding component to inherit colour from.',
                'Both panes render the IDENTICAL glyph (the same @mdi/js path constant): Material 3 specifies icon size and ' +
                    'colour tokens, not specific glyph shapes, so using one shared glyph isolates this row to the axes M3 ' +
                    'actually governs rather than comparing two arbitrarily different pictures.',
            ]"
        >
            <template #reference>
                <span class="md3ref-icon" data-measure aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path :d="heartIcon" /></svg>
                </span>
            </template>
            <template #worldlens>
                <v-icon data-measure :icon="heartIcon" />
            </template>
        </RowShell>

        <!-- ================================= ALERT ===================================== -->
        <RowShell
            id="alert"
            title="Alert"
            m3-name="(no direct M3 component)"
            :no-spec-equivalent="'Material 3 does not define an \'Alert\' component. This row\'s reference pane borrows the ' +
                'Card row\'s Medium (12dp) shape as a judgement call, not a numbered spec citation, and uses the spec\'s own ' +
                'explicitly-defined error-container / on-error-container role pair for colour - a real citation, applied to the ' +
                'clearest available analogue (an error/warning banner).'"
        >
            <template #reference>
                <div class="md3ref-alert" data-measure>Something needs your attention.</div>
            </template>
            <template #worldlens>
                <v-alert data-measure type="error" variant="flat">Something needs your attention.</v-alert>
            </template>
        </RowShell>
    </div>
</template>
