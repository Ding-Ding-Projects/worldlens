<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VChip, VTextField } from "vuetify/components";
import { useServerStore } from "./useServers.js";

const emit = defineEmits<{ close: []; saved: [hostId: string] }>();
const { t } = useI18n();
const store = useServerStore();

const hostId = ref("");
const label = ref("");
const host = ref("");
const port = ref("22");
const user = ref("");
const identityFile = ref("");
const workDir = ref("~/WorldLens");
const identityPicker = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const message = ref<string | null>(null);
const scan = ref<Awaited<ReturnType<typeof store.hostProfiles.scan>>["value"] | null>(null);

const changedKey = computed(() => {
    if (scan.value === null || scan.value.recorded.length === 0) return false;
    return scan.value.offers.length > 0 && !scan.value.offers.some((offer) =>
        scan.value?.recorded.some((known) => known.fingerprint === offer.fingerprint),
    );
});

function target(): Record<string, unknown> {
    return {
        id: hostId.value.trim(),
        label: label.value.trim() || undefined,
        host: host.value.trim(),
        port: Number(port.value),
        user: user.value.trim(),
        identityFile: identityFile.value.trim() || null,
        workDir: workDir.value.trim(),
    };
}

function chooseIdentityFile(): void {
    identityPicker.value?.click();
}

function readIdentityPath(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] as (File & { path?: string }) | undefined;
    if (file === undefined) return;
    // Electron exposes the selected path to the native file picker. Only the path is kept;
    // the file is never read or copied into renderer or app data.
    identityFile.value = file.path ?? file.name;
}

async function saveAndScan(): Promise<void> {
    busy.value = true;
    message.value = null;
    const saved = await store.hostProfiles.save({ hostId: hostId.value.trim(), target: target() });
    if (!saved.ok) {
        message.value = saved.failure?.message ?? t("mcserver.hostProfile.saveFailed", "The host profile could not be saved.");
        busy.value = false;
        return;
    }
    const inspected = await store.hostProfiles.scan(hostId.value.trim());
    if (!inspected.ok) {
        message.value = inspected.failure?.message ?? t("mcserver.hostProfile.scanFailed", "The host key could not be checked.");
        busy.value = false;
        return;
    }
    scan.value = inspected.value ?? null;
    message.value = inspected.value?.detail ?? null;
    busy.value = false;
}

async function trust(fingerprint: string): Promise<void> {
    busy.value = true;
    const result = await store.hostProfiles.trust(hostId.value.trim(), fingerprint);
    message.value = result.ok
        ? t("mcserver.hostProfile.trusted", "That fingerprint was recorded in this app's known-hosts file.")
        : result.failure?.message ?? t("mcserver.hostProfile.trustFailed", "The fingerprint was not recorded.");
    if (result.ok) emit("saved", hostId.value.trim());
    busy.value = false;
}
</script>

<template>
    <VCard class="wl-mcserver-host-profile" variant="elevated" role="dialog" :aria-label="t('mcserver.hostProfile.title', 'Add SSH host profile')">
        <VCardTitle>{{ t("mcserver.hostProfile.title", "Add SSH host profile") }}</VCardTitle>
        <VCardText class="wl-mcserver-host-profile__fields">
            <VAlert type="info" variant="tonal">
                {{ t("mcserver.hostProfile.disclosure", "Only connection metadata and the path to your identity file are saved. Key bytes, passphrases, and passwords never enter this app.") }}
            </VAlert>
            <VTextField v-model="hostId" :label="t('mcserver.hostProfile.id', 'Profile id')" autocomplete="off" />
            <VTextField v-model="label" :label="t('mcserver.hostProfile.label', 'Display name')" autocomplete="off" />
            <VTextField v-model="host" :label="t('mcserver.hostProfile.host', 'Host name or address')" autocomplete="off" />
            <VTextField v-model="port" type="number" min="1" max="65535" :label="t('mcserver.hostProfile.port', 'SSH port')" />
            <VTextField v-model="user" :label="t('mcserver.hostProfile.user', 'SSH user')" autocomplete="username" />
            <div class="wl-mcserver-host-profile__identity">
                <VTextField v-model="identityFile" :label="t('mcserver.hostProfile.identity', 'Identity file path, optional')" autocomplete="off" />
                <VBtn variant="tonal" :aria-label="t('mcserver.hostProfile.browseIdentity', 'Browse for identity file')" @click="chooseIdentityFile">
                    {{ t("common.browse", "Browse") }}
                </VBtn>
                <input ref="identityPicker" class="wl-mcserver-host-profile__native-picker" type="file" @change="readIdentityPath" />
            </div>
            <VTextField v-model="workDir" :label="t('mcserver.hostProfile.workDir', 'Remote working folder')" autocomplete="off" />
            <VAlert v-if="message" type="warning" variant="tonal">{{ message }}</VAlert>
            <VAlert v-if="changedKey" type="error" variant="tonal">
                {{ t("mcserver.hostProfile.changedKey", "The offered fingerprint differs from the one already recorded. This host-key change is refused; no trust button is offered.") }}
            </VAlert>
            <div v-if="scan && !changedKey" class="wl-mcserver-host-profile__offers" aria-live="polite">
                <div class="text-subtitle-2">{{ t("mcserver.hostProfile.fingerprints", "Offered fingerprints") }}</div>
                <div v-for="offer in scan.offers" :key="offer.fingerprint" class="wl-mcserver-host-profile__offer">
                    <VChip size="small" variant="outlined">{{ offer.type }}</VChip>
                    <code>{{ offer.fingerprint }}</code>
                    <VBtn size="small" variant="tonal" :loading="busy" @click="trust(offer.fingerprint)">
                        {{ t("mcserver.hostProfile.trust", "Trust this fingerprint") }}
                    </VBtn>
                </div>
            </div>
        </VCardText>
        <VCardActions>
            <VBtn variant="text" @click="emit('close')">{{ t("common.cancel", "Cancel") }}</VBtn>
            <VBtn color="primary" variant="tonal" :loading="busy" :disabled="!store.hasHostProfiles" @click="saveAndScan">
                {{ t("mcserver.hostProfile.check", "Save and check host key") }}
            </VBtn>
        </VCardActions>
    </VCard>
</template>

<style scoped>
.wl-mcserver-host-profile { max-width: 720px; width: min(100%, 720px); }
.wl-mcserver-host-profile__fields { display: grid; gap: 12px; }
.wl-mcserver-host-profile__offers { display: grid; gap: 8px; }
.wl-mcserver-host-profile__offer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wl-mcserver-host-profile__identity { display: flex; align-items: flex-start; gap: 8px; }
.wl-mcserver-host-profile__identity .v-input { flex: 1; }
.wl-mcserver-host-profile__native-picker { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
