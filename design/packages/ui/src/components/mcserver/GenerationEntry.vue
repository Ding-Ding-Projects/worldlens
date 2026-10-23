<script setup lang="ts">
import { VBtn } from "vuetify/components";
import { generationDialogOpen } from "./generationWorkflow.js";
import { workflowText as text } from "./workflowText.js";
</script>
<template>
    <VBtn
        color="primary"
        variant="flat"
        class="generation-entry"
        @click="generationDialogOpen = true"
        >{{ text("Generate and start project", "產生世界並建立專案") }}</VBtn
    >
</template>
<style scoped>
.generation-entry {
    white-space: pre-line;
    height: auto;
    min-height: 40px;
    padding-block: 10px;
    max-width: 100%;
}
</style>
