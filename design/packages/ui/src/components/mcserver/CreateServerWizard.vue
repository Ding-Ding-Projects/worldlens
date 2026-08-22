<script setup lang="ts">
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog, VSelect, VSlider, VTextField } from "vuetify/components";
import PathField from "../PathField.vue";
import { useServerStore } from "./useServers.js";
import {
    SERVER_FLAVOURS,
    flavourName,
    validateMemoryMb,
    validatePort,
    validateServerId,
    validateServerName,
    type ServerFlavour,
} from "./serverModel.js";

/**
 * Every setting a new server needs is a real typed control: the flavour is a select, memory
 * and the port are steppers with real bounds, the server folder is a path field with its own
 * native browse button. Nothing here is a text box standing in for a picker.
 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; created: [id: string] }>();

const { t } = useI18n();
const store = useServerStore();

const form = reactive({
    id: "",
    name: "",
    flavour: "paper" as ServerFlavour,
    minecraftVersion: "",
    serverDir: "",
    memoryMb: 2048,
    port: 25565,
});

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const idError = computed(() => validateServerId(form.id, store.servers.value.map((s) => s.id)));
const nameError = computed(() => validateServerName(form.name));
const memoryError = computed(() => validateMemoryMb(form.memoryMb));
const portError = computed(() => validatePort(form.port));
const folderError = computed(() =>
    form.serverDir.trim() === "" ? t("mcserver.wizard.folderRequired", "Choose a folder for this server.") : null,
);

const canCreate = computed(
    () =>
        idError.value === null &&
        nameError.value === null &&
        memoryError.value === null &&
        portError.value === null &&
        folderError.value === null,
);

async function create(): Promise<void> {
    if (!canCreate.value) return;
    const now = new Date().toISOString();
    const result = await store.save({
        id: form.id,
        name: form.name,
        flavour: form.flavour,
        minecraftVersion: form.minecraftVersion.trim() === "" ? null : form.minecraftVersion.trim(),
        ref: { kind: "local-process", serverDir: form.serverDir },
        origin: "created",
        createdAt: now,
        updatedAt: now,
        hasRconSecret: false,
        rconPort: form.port,
        writeScope: [],
    });
    if (result.ok) {
        emit("created", form.id);
        open.value = false;
    }
}
</script>

<template>
    <VDialog v-model="open" max-width="560">
        <VCard>
            <VCardTitle>{{ t("mcserver.wizard.title", "New Minecraft server") }}</VCardTitle>
            <VCardText class="wl-mcserver-wizard__body">
                <VTextField
                    v-model="form.id"
                    :label="t('mcserver.wizard.id', 'Server id')"
                    :error-messages="idError ? [idError] : []"
                    hint="lowercase, letters, digits, hyphens"
                    persistent-hint
                />
                <VTextField
                    v-model="form.name"
                    :label="t('mcserver.wizard.name', 'Display name')"
                    :error-messages="nameError ? [nameError] : []"
                />
                <VSelect
                    v-model="form.flavour"
                    :items="SERVER_FLAVOURS.map((f) => ({ title: flavourName(f), value: f }))"
                    :label="t('mcserver.wizard.flavour', 'Server flavour')"
                />
                <VTextField
                    v-model="form.minecraftVersion"
                    :label="t('mcserver.wizard.version', 'Minecraft version (optional)')"
                    placeholder="1.21.1"
                />
                <PathField
                    v-model="form.serverDir"
                    field="server folder"
                    :label="t('mcserver.wizard.folder', 'Server folder')"
                    semantic="folder"
                    :error="folderError"
                />
                <div>
                    <label class="text-caption">
                        {{ t("mcserver.wizard.memory", "Memory (MB)") }}: {{ form.memoryMb }}
                    </label>
                    <VSlider
                        v-model="form.memoryMb"
                        :min="512"
                        :max="16384"
                        :step="256"
                        thumb-label
                        :aria-label="t('mcserver.wizard.memory', 'Memory (MB)')"
                    />
                    <div v-if="memoryError" class="text-caption text-error">{{ memoryError }}</div>
                </div>
                <VTextField
                    v-model.number="form.port"
                    type="number"
                    :min="1"
                    :max="65535"
                    :label="t('mcserver.wizard.port', 'Server port')"
                    :error-messages="portError ? [portError] : []"
                />
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="open = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VBtn
                    color="primary"
                    variant="tonal"
                    :disabled="!canCreate || !store.canList"
                    :title="!store.canList ? t('mcserver.noHost', 'This build cannot reach a Minecraft server host.') : undefined"
                    @click="create"
                >
                    {{ t("mcserver.wizard.create", "Create") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<style scoped>
.wl-mcserver-wizard__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
</style>
