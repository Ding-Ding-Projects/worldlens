<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VChip, VDialog, VList, VListItem } from "vuetify/components";
import { useServerStore } from "./useServers.js";
import type { ServerRecord } from "./serverModel.js";

/**
 * What this app may and may not do to a container or process it did not create, said plainly
 * before the adoption is confirmed - never discovered later from a button that quietly does
 * nothing.
 */
const props = defineProps<{ modelValue: boolean; record: ServerRecord | null }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirmed: [] }>();

const { t } = useI18n();
const store = useServerStore();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const probing = ref(false);

watch(
    () => [props.modelValue, props.record?.id] as const,
    async ([isOpen, id]) => {
        if (isOpen && typeof id === "string") {
            probing.value = true;
            await store.probe(id);
            probing.value = false;
        }
    },
);

const capabilities = computed(() => (props.record ? store.capabilitiesFor(props.record.id) : null));

async function confirm(): Promise<void> {
    if (!props.record) return;
    const result = await store.save(props.record);
    if (result.ok) {
        emit("confirmed");
        open.value = false;
    }
}
</script>

<template>
    <VDialog v-model="open" max-width="480">
        <VCard v-if="record">
            <VCardTitle>{{ t("mcserver.adopt.title", "Review before adopting") }}</VCardTitle>
            <VCardText>
                <p>
                    {{
                        t(
                            "mcserver.adopt.blurb",
                            { name: record.name },
                            "{name} was not created by this app. This app will only be able to do what it is granted below.",
                        )
                    }}
                </p>
                <VAlert v-if="probing" type="info" variant="tonal">
                    {{ t("mcserver.adopt.probing", "Checking what this app may do...") }}
                </VAlert>
                <VList v-else-if="capabilities">
                    <VListItem>
                        {{ t("mcserver.adopt.canLifecycle", "Start and stop") }}
                        <template #append>
                            <VChip :color="capabilities.canLifecycle ? 'success' : 'error'" size="small">
                                {{ capabilities.canLifecycle ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canWrite", "Write its files") }}
                        <template #append>
                            <VChip :color="capabilities.canWriteFiles ? 'success' : 'error'" size="small">
                                {{ capabilities.canWriteFiles ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canDestroy", "Delete it") }}
                        <template #append>
                            <VChip :color="capabilities.canDestroy ? 'success' : 'error'" size="small">
                                {{ capabilities.canDestroy ? t("common.yes", "Yes") : t("common.no", "No") }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.console", "Console") }}
                        <template #append>
                            <VChip size="small">{{ capabilities.console }}</VChip>
                        </template>
                    </VListItem>
                </VList>
                <VAlert v-else type="warning" variant="tonal">
                    {{ t("mcserver.adopt.unreachable", "This server could not be reached, so nothing here can be confirmed yet.") }}
                </VAlert>
            </VCardText>
            <VCardActions>
                <VBtn variant="text" @click="open = false">{{ t("common.cancel", "Cancel") }}</VBtn>
                <VBtn color="primary" variant="tonal" :disabled="probing || !capabilities" @click="confirm">
                    {{ t("mcserver.adopt.confirm", "Adopt") }}
                </VBtn>
            </VCardActions>
        </VCard>
    </VDialog>
</template>
