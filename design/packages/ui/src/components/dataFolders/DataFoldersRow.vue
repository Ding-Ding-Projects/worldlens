<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert } from "vuetify/components";
import { raiseNotice } from "../../stores/notices.js";
import { currentPlatform } from "../setup/mapStorage.js";
import DataFolderRow from "./DataFolderRow.vue";
import ProfileHistoryPanel from "./ProfileHistoryPanel.vue";
import { createDataFoldersStore, type DataFoldersStore } from "./dataFoldersStore.js";

/**
 * The Data folders settings section: the profile folder, the save folder and the profile
 * history. Reads and changes everything through the main process; in a build with no bridge
 * (a browser tab) it says so instead of showing controls that do nothing.
 */
const props = defineProps<{
    /** Injected only by tests. Production creates the store over the preload bridge. */
    store?: DataFoldersStore;
}>();
const emit = defineEmits<{ "open-github": [] }>();

const { t } = useI18n();

const store =
    props.store ??
    createDataFoldersStore({
        onHistoryFailure: (message) =>
            raiseNotice("warning", t("dataFolders.notice.historyFailed", "The profile history could not be saved."), message),
    });

const profileToken = currentPlatform() === "windows" ? "%APPDATA%\\Worldlens" : null;

onMounted(() => void store.start());
onBeforeUnmount(() => store.stop());
</script>

<template>
    <div class="mb-data-folders">
        <v-alert v-if="!store.available" type="info" variant="tonal" density="compact" data-test="unavailable">
            {{
                t(
                    "dataFolders.unavailable",
                    "Folders can only be changed in the desktop app. In a browser the app's data lives where the server keeps it.",
                )
            }}
        </v-alert>
        <v-alert v-else-if="store.failure.value" type="error" variant="tonal" density="compact" data-test="failure">
            {{ store.failure.value }}
        </v-alert>
        <v-alert
            v-if="store.status.value?.pointerProblem"
            type="warning"
            variant="tonal"
            density="compact"
            data-test="pointer-problem"
        >
            {{ store.status.value.pointerProblem }}
            {{ t("dataFolders.pointerProblem", "The default folder is in use. Nothing was deleted.") }}
        </v-alert>

        <DataFolderRow :store="store" kind="profile" :default-token="profileToken" />
        <DataFolderRow :store="store" kind="save" />
        <ProfileHistoryPanel :store="store" @open-github="emit('open-github')" />
    </div>
</template>

<style scoped>
.mb-data-folders {
    display: grid;
    gap: 24px;
}
</style>
