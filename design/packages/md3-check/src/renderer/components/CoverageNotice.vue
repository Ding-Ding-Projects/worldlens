<script setup lang="ts">
/**
 * The other half of the completeness manifest - see `lib/rows.ts`'s own header for why this
 * exists at all: a list that only ever describes what got built cannot fail when something is
 * quietly missing. This renders the manifest's `"planned"` half directly in the UI, so a reader
 * never has to open source to learn what this instrument does NOT yet check.
 */
import { implementedRows, plannedRows } from "../lib/rows.js";

const implemented = implementedRows();
const planned = plannedRows();
</script>

<template>
    <details class="md3check-coverage">
        <summary>
            Coverage: {{ implemented.length }} component{{ implemented.length === 1 ? "" : "s" }} checked below,
            {{ planned.length }} not yet built (click to see which, and why)
        </summary>
        <ul>
            <li v-for="row in planned" :key="row.id">
                <strong>{{ row.vuetifyComponent }}</strong> ({{ row.id }}): {{ row.plannedReason }}
            </li>
        </ul>
    </details>
</template>
