<script setup lang="ts">
/**
 * The one disclosure a reader is guaranteed to see before looking at a single row - see this
 * package's own README.md and the scout report this instrument was built from ("Scout Report:
 * Where Does Canonical MD3 Truth Come From?") for the full reasoning behind every claim here.
 * Nothing in this component is decorative copy; every sentence is a direct answer to a specific
 * question a reader would otherwise have to reconstruct from source comments.
 */
</script>

<template>
    <section class="md3check-honesty-banner" role="note" aria-label="What this instrument can and cannot prove">
        <h1>What this instrument can and cannot prove</h1>
        <p>
            <strong>This repository has no independently-sourced copy of the Material Design 3
            specification.</strong> No package in this workspace's dependency tree (<code>@material/web</code>,
            <code>@material/material-color-utilities</code>, or otherwise) ships one, and nothing here reads a
            machine-readable spec artifact of any kind. The LEFT-hand "M3 reference" pane in every row below is
            hand-transcribed by a human/assistant from the publicly published baseline component specification
            (m3.material.io) into <code>src/renderer/styles/m3Reference.scss</code>, with a citation on every rule.
            <strong>Treat it as a best-effort transcription, not a certified copy.</strong>
        </p>
        <p>
            The RIGHT-hand "Worldlens" pane is the real, unmodified product: the exact
            <code>createVuetify()</code> configuration, shape defaults, and theme colour schemes
            <code>@worldlens/ui/src/vuetify.ts</code> ships, deep-imported rather than re-implemented - see
            <code>src/renderer/lib/worldlensVuetify.ts</code>.
        </p>
        <p>
            Both panes render using this application's <strong>own real colour role values</strong>
            (<code>--v-theme-*</code>), not two independent colour systems. Material 3 does not mandate specific
            hex values, only which named role a component part should use - so this instrument isolates the axes
            most likely to genuinely diverge (shape, elevation, type scale, spacing, and whether the correct role
            was applied to the correct part) rather than showing two colour systems that could never have matched.
        </p>
        <p>
            The reference pane cites the <strong>original/baseline M3 specification</strong>, not the 2025
            "Expressive" update. <code>md3.scss</code>'s own comments repeatedly invoke "MD3 Expressive" while
            shipping the pre-Expressive 7-step shape scale - a real, unresolved tension this instrument does not
            paper over. A row that looks "different" below might be a genuine divergence, or might be an
            intentional Expressive choice this reference simply does not represent. Judge every difference against
            its row's own citations, not against this banner alone.
        </p>
        <p>
            <strong>A number marked &Delta; is a reported difference, never a verdict.</strong> This instrument
            never marks anything as a "failure" - some divergences shown here are deliberate, documented Worldlens
            choices (its text fields are 12px-cornered by design, not the baseline's 4px; see that row's own
            citation). The measurement is real; what it means is for the reader to decide.
        </p>
    </section>
</template>
