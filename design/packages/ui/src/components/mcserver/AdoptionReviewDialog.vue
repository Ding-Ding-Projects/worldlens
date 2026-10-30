<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VSwitch,
    VTextField,
    VIcon,
    VSpacer,
} from "vuetify/components";
import { mdiClose, mdiCubeOutline } from "@mdi/js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useServerStore } from "./useServers.js";
import { adoptRelease } from "./mcserverBridge.js";
import type { ServerRecord } from "./serverModel.js";

/**
 * What this app may and may not do to a container or process it did not create, said plainly
 * before the adoption is confirmed - never discovered later from a button that quietly does
 * nothing. Every consent switch below defaults off; nothing is granted just by opening this.
 */
const props = defineProps<{
    modelValue: boolean;
    record: ServerRecord | null;
    /** The discovery candidate's evidence, when this dialog is reviewing a fresh discovery. */
    evidence?: readonly string[];
    confidence?: "high" | "medium" | "low" | null;
    mounts?: readonly { readonly source: string; readonly target: string }[];
    ports?: readonly { readonly container: number; readonly host: number | null }[];
    blockers?: readonly string[];
    containerId?: string | null;
    hostId?: string | null;
}>();
const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    confirmed: [record: ServerRecord];
}>();

const { t } = useI18n();
const store = useServerStore();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const probing = ref(false);
const failure = ref<string | null>(null);
const submitting = ref(false);
let reviewGeneration = 0;

const consent = reactive({
    configWrite: false,
    lifecycle: false,
    pluginInstall: false,
    consoleWrite: false,
});
const rconPort = ref("");
const rconPassword = ref("");
const rconMapping = computed(() => {
    const port = (props.ports ?? []).find((entry) => entry.container === 25_575);
    return port === undefined ? null : `${port.host ?? "not published"} -> ${port.container}`;
});

watch(
    () => [props.modelValue, props.record?.id, props.containerId, props.hostId] as const,
    async ([isOpen, id]) => {
        const generation = ++reviewGeneration;
        Object.assign(consent, {
            configWrite: false,
            lifecycle: false,
            pluginInstall: false,
            consoleWrite: false,
        });
        failure.value = null;
        rconPassword.value = "";
        rconPort.value = "";
        probing.value = false;
        if (isOpen && typeof id === "string") {
            rconPort.value = String(
                props.ports?.find((port) => port.container === 25_575)?.host ?? "",
            );
            probing.value = true;
            try {
                await store.probe(id);
            } catch {
                if (generation === reviewGeneration) {
                    failure.value = t(
                        "mcserver.adopt.unreachable",
                        "This server could not be reached, so nothing here can be confirmed yet.",
                    );
                }
            } finally {
                if (generation === reviewGeneration) probing.value = false;
            }
        }
    },
    { immediate: true },
);
onBeforeUnmount(() => {
    reviewGeneration++;
});

const capabilities = computed(() => (props.record ? store.capabilitiesFor(props.record.id) : null));
const hasBlockers = computed(() => (props.blockers?.length ?? 0) > 0);
const hasSavedAdoption = computed(
    () =>
        props.record?.origin === "adopted" &&
        store.servers.value.some(
            (server) => server.id === props.record?.id && server.origin === "adopted",
        ),
);

/**
 * A real container can carry many mounts and published ports, and the discovery evidence
 * list grows with every heuristic that matched -- so this dialog gets the same local
 * filter every other list in this app does, covering evidence, mounts and ports together.
 * Plain text is the default; the anchored regex builder in {@link ConfigSearchField} is an
 * explicit opt-in. Filtering only ever hides rows: it never changes what "Adopt" does.
 */
const reviewQuery = ref("");
const reviewRegex = ref(false);
const reviewFlags = ref("i");
const reviewMatcher = computed(() =>
    createSettingMatcher(reviewQuery.value, reviewRegex.value, reviewFlags.value),
);

const filteredEvidence = computed(() =>
    (props.evidence ?? []).filter((item) => reviewMatcher.value.test(item)),
);
const filteredMounts = computed(() =>
    (props.mounts ?? []).filter((m) => reviewMatcher.value.test(`${m.source} ${m.target}`)),
);
const filteredPorts = computed(() =>
    (props.ports ?? []).filter((p) => reviewMatcher.value.test(`${p.container} ${p.host ?? ""}`)),
);

const reviewSample = computed(() =>
    [
        ...(props.evidence ?? []),
        ...(props.mounts ?? []).map((m) => `${m.source} -> ${m.target}`),
        ...(props.ports ?? []).map((p) => `${p.container} -> ${p.host ?? ""}`),
    ].join(String.fromCharCode(10)),
);

const reviewHasRows = computed(
    () =>
        (props.evidence?.length ?? 0) + (props.mounts?.length ?? 0) + (props.ports?.length ?? 0) >
        0,
);
const reviewShownCount = computed(
    () => filteredEvidence.value.length + filteredMounts.value.length + filteredPorts.value.length,
);
const reviewTotalCount = computed(
    () => (props.evidence?.length ?? 0) + (props.mounts?.length ?? 0) + (props.ports?.length ?? 0),
);
const reviewSummary = computed(() =>
    t(
        "mcserver.adopt.filterSummary",
        { shown: reviewShownCount.value, total: reviewTotalCount.value },
        "Showing {shown} of {total}",
    ),
);

async function confirm(): Promise<void> {
    if (
        submitting.value ||
        probing.value ||
        !props.modelValue ||
        !props.record ||
        hasBlockers.value
    )
        return;
    const generation = reviewGeneration;
    const selectedRecord = props.record;
    failure.value = null;
    if (!props.containerId) {
        failure.value = t("mcserver.adopt.noContainer", "No container was selected for adoption.");
        return;
    }
    const request = {
        id: selectedRecord.id,
        containerId: props.containerId,
        consent: { ...consent },
        ...(props.hostId === undefined ? {} : { hostId: props.hostId }),
        ...(rconPort.value.trim() === "" && rconPassword.value === ""
            ? {}
            : { rcon: { port: Number(rconPort.value), password: rconPassword.value } }),
    };
    if ((rconPort.value.trim() === "") !== (rconPassword.value === "")) {
        failure.value = t(
            "mcserver.adopt.rconBoth",
            "Enter both the RCON port and password, or leave both empty.",
        );
        return;
    }
    if (rconPassword.value !== "" && !consent.consoleWrite) {
        failure.value = t(
            "mcserver.adopt.rconConsent",
            "Enable console commands before saving an RCON password.",
        );
        return;
    }
    submitting.value = true;
    try {
        const result = await store.adoptConfirm(request);
        if (generation !== reviewGeneration || !props.modelValue) return;
        if (result.ok) {
            rconPassword.value = "";
            emit("confirmed", result.value ?? selectedRecord);
            open.value = false;
        } else {
            failure.value =
                result.failure?.message ??
                t("mcserver.adopt.saveFailed", "Could not save this server.");
        }
    } catch {
        if (generation === reviewGeneration && props.modelValue) {
            failure.value = t("mcserver.adopt.saveFailed", "Could not save this server.");
        }
    } finally {
        submitting.value = false;
    }
}

const releasing = ref(false);
async function confirmRelease(): Promise<void> {
    if (
        submitting.value ||
        releasing.value ||
        !props.modelValue ||
        !hasSavedAdoption.value ||
        !props.record
    )
        return;
    const generation = reviewGeneration;
    const id = props.record.id;
    submitting.value = true;
    releasing.value = true;
    failure.value = null;
    try {
        const result = await adoptRelease(id, { restoreSnapshot: false });
        if (generation !== reviewGeneration || !props.modelValue) return;
        if (!result.ok)
            failure.value =
                result.failure?.message ??
                t("mcserver.adopt.releaseFailed", "Could not release this adoption.");
    } catch {
        if (generation === reviewGeneration && props.modelValue) {
            failure.value = t("mcserver.adopt.releaseFailed", "Could not release this adoption.");
        }
    } finally {
        releasing.value = false;
        submitting.value = false;
    }
}
</script>

<template>
    <VDialog v-model="open" class="wl-adoptreview-dialog" max-width="900" scrollable persistent>
        <VCard v-if="record" class="wl-mcserver-adopt">
            <VCardTitle class="wl-mcserver-adopt__title">
                <VIcon :icon="mdiCubeOutline" size="22" />
                <span>{{ t("mcserver.adopt.title", "Review before adopting") }}</span>
                <VSpacer />
                <span v-if="containerId" class="wl-mcserver-adopt__container">{{
                    t("mcserver.adopt.containerLabel", { id: containerId }, "container {id}")
                }}</span>
                <VBtn
                    :icon="mdiClose"
                    variant="text"
                    size="small"
                    :disabled="submitting"
                    :aria-label="t('common.cancel', 'Cancel')"
                    @click="open = false"
                />
            </VCardTitle>
            <VDivider />
            <VCardText class="wl-mcserver-adopt__body">
                <div class="wl-mcserver-adopt__lede">
                    {{
                        t(
                            "mcserver.adopt.blurb",
                            { name: record.name },
                            "{name} was not created by this app. This app will only be able to do what it is granted below.",
                        )
                    }}
                </div>

                <VAlert v-if="failure" type="warning" variant="tonal" class="my-2">{{
                    failure
                }}</VAlert>

                <template v-if="confidence">
                    <VChip
                        size="small"
                        :color="
                            confidence === 'high'
                                ? 'success'
                                : confidence === 'medium'
                                  ? 'warning'
                                  : 'error'
                        "
                        variant="tonal"
                        class="wl-mcserver-adopt__confidence"
                    >
                        {{
                            t(
                                "mcserver.adopt.confidence",
                                { level: confidence },
                                "Match confidence: {level}",
                            )
                        }}
                    </VChip>
                </template>

                <ConfigSearchField
                    v-if="reviewHasRows"
                    v-model="reviewQuery"
                    v-model:regex="reviewRegex"
                    v-model:flags="reviewFlags"
                    :label="t('mcserver.adopt.filterLabel', 'Filter evidence, mounts and ports')"
                    :placeholder="t('mcserver.adopt.filterHint', 'Path, port or evidence text')"
                    :sample="reviewSample"
                    :summary="reviewSummary"
                    class="mb-2"
                />

                <template v-if="evidence && evidence.length > 0">
                    <div class="wl-mcserver-adopt__label">
                        {{
                            t(
                                "mcserver.adopt.evidenceTitle",
                                "Why this looks like a Minecraft server",
                            )
                        }}
                    </div>
                    <div
                        v-if="filteredEvidence.length === 0"
                        class="wl-mcserver-adopt__noMatch"
                        role="status"
                    >
                        {{
                            t(
                                "mcserver.adopt.evidenceNoMatch",
                                "No evidence line matches the filter.",
                            )
                        }}
                    </div>
                    <VCard rounded="lg" v-else variant="outlined" class="wl-mcserver-adopt__box">
                        <ul class="wl-mcserver-adopt__evidence">
                            <li v-for="(item, index) in filteredEvidence" :key="index">
                                {{ item }}
                            </li>
                        </ul>
                    </VCard>
                </template>

                <div
                    v-if="(mounts && mounts.length > 0) || (ports && ports.length > 0)"
                    class="wl-mcserver-adopt__pair"
                >
                    <VCard
                        rounded="lg"
                        v-if="mounts && mounts.length > 0"
                        variant="outlined"
                        class="wl-mcserver-adopt__box"
                    >
                        <div class="wl-mcserver-adopt__box-title">
                            {{ t("mcserver.adopt.mountsTitle", "Mounted paths") }}
                        </div>
                        <div
                            v-if="filteredMounts.length === 0"
                            class="wl-mcserver-adopt__noMatch"
                            role="status"
                        >
                            {{
                                t(
                                    "mcserver.adopt.mountsNoMatch",
                                    "No mounted path matches the filter.",
                                )
                            }}
                        </div>
                        <ul v-else class="wl-mcserver-adopt__evidence">
                            <li v-for="(m, index) in filteredMounts" :key="index">
                                {{ m.source }} &rarr; {{ m.target }}
                            </li>
                        </ul>
                    </VCard>
                    <VCard
                        rounded="lg"
                        v-if="ports && ports.length > 0"
                        variant="outlined"
                        class="wl-mcserver-adopt__box"
                    >
                        <div class="wl-mcserver-adopt__box-title">
                            {{ t("mcserver.adopt.portsTitle", "Published ports") }}
                        </div>
                        <div
                            v-if="filteredPorts.length === 0"
                            class="wl-mcserver-adopt__noMatch"
                            role="status"
                        >
                            {{
                                t(
                                    "mcserver.adopt.portsNoMatch",
                                    "No published port matches the filter.",
                                )
                            }}
                        </div>
                        <ul v-else class="wl-mcserver-adopt__evidence">
                            <li v-for="(p, index) in filteredPorts" :key="index">
                                {{ p.container }} &rarr;
                                {{ p.host ?? t("mcserver.adopt.notPublished", "not published") }}
                            </li>
                        </ul>
                    </VCard>
                </div>

                <VAlert v-if="hasBlockers" type="error" variant="tonal" class="my-2">
                    <div v-for="(b, index) in blockers" :key="index">{{ b }}</div>
                </VAlert>

                <div class="wl-mcserver-adopt__label">
                    {{ t("mcserver.adopt.consentTitle", "What this app may do") }}
                </div>
                <VCard rounded="lg" variant="outlined" class="wl-mcserver-adopt__consent">
                    <VSwitch
                        v-model="consent.configWrite"
                        color="primary"
                        :disabled="submitting"
                        :label="t('mcserver.adopt.consentConfig', 'Write its configuration files')"
                        hide-details
                    />
                    <VSwitch
                        v-model="consent.lifecycle"
                        color="primary"
                        :disabled="submitting"
                        :label="t('mcserver.adopt.consentLifecycle', 'Start and stop it')"
                        hide-details
                    />
                    <VSwitch
                        v-model="consent.pluginInstall"
                        color="primary"
                        :disabled="submitting"
                        :label="t('mcserver.adopt.consentPlugins', 'Install and remove plugins')"
                        hide-details
                    />
                    <VSwitch
                        v-model="consent.consoleWrite"
                        color="primary"
                        :disabled="submitting"
                        :label="t('mcserver.adopt.consentConsole', 'Send console commands')"
                        hide-details
                    />
                </VCard>

                <div class="wl-mcserver-adopt__label">
                    {{ t("mcserver.adopt.rconTitle", "Remote RCON configuration") }}
                </div>
                <div class="wl-mcserver-adopt__lede">
                    {{
                        t(
                            "mcserver.adopt.rconDisclosure",
                            "Optional. The password is written only to this computer's credential vault and is never returned to the interface or logs.",
                        )
                    }}
                </div>
                <div v-if="rconMapping" class="text-body-2 mb-2">
                    Published RCON host port -> container port: {{ rconMapping }}
                </div>
                <div class="wl-mcserver-adopt__rcon-fields">
                    <VTextField
                        v-model="rconPort"
                        variant="outlined"
                        :disabled="submitting"
                        type="number"
                        min="1"
                        max="65535"
                        :label="t('mcserver.adopt.rconPort', 'RCON port')"
                    />
                    <VTextField
                        v-model="rconPassword"
                        variant="outlined"
                        :disabled="submitting"
                        type="password"
                        autocomplete="new-password"
                        :label="t('mcserver.adopt.rconPassword', 'RCON password')"
                    />
                </div>

                <VAlert v-if="probing" type="info" variant="tonal" class="mt-3">
                    {{ t("mcserver.adopt.probing", "Checking what this app may do...") }}
                </VAlert>
                <div v-if="!probing && capabilities" class="wl-mcserver-adopt__label">
                    {{ t("mcserver.adopt.confirmedTitle", "What the transport confirms") }}
                </div>
                <VList v-if="!probing && capabilities" class="wl-mcserver-adopt__caps">
                    <VListItem>
                        {{ t("mcserver.adopt.canLifecycle", "Start and stop") }}
                        <template #append>
                            <VChip
                                :color="capabilities.canLifecycle ? 'secondary-container' : 'error'"
                                variant="flat"
                                size="small"
                            >
                                {{
                                    capabilities.canLifecycle
                                        ? t("common.yes", "Yes")
                                        : t("common.no", "No")
                                }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canWrite", "Write its files") }}
                        <template #append>
                            <VChip
                                :color="
                                    capabilities.canWriteFiles ? 'secondary-container' : 'error'
                                "
                                variant="flat"
                                size="small"
                            >
                                {{
                                    capabilities.canWriteFiles
                                        ? t("common.yes", "Yes")
                                        : t("common.no", "No")
                                }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.canDestroy", "Delete it") }}
                        <template #append>
                            <VChip
                                :color="capabilities.canDestroy ? 'secondary-container' : 'error'"
                                variant="flat"
                                size="small"
                            >
                                {{
                                    capabilities.canDestroy
                                        ? t("common.yes", "Yes")
                                        : t("common.no", "No")
                                }}
                            </VChip>
                        </template>
                    </VListItem>
                    <VListItem>
                        {{ t("mcserver.adopt.console", "Console") }}
                        <template #append>
                            <VChip
                                size="small"
                                variant="outlined"
                                class="wl-mcserver-adopt__mono"
                                >{{ capabilities.console }}</VChip
                            >
                        </template>
                    </VListItem>
                </VList>
                <VAlert v-else-if="!probing" type="warning" variant="tonal">
                    {{
                        t(
                            "mcserver.adopt.unreachable",
                            "This server could not be reached, so nothing here can be confirmed yet.",
                        )
                    }}
                </VAlert>
            </VCardText>
            <VDivider />
            <VCardActions class="wl-mcserver-adopt__actions">
                <VSpacer />
                <VBtn variant="text" color="primary" :disabled="submitting" @click="open = false">{{
                    t("common.cancel", "Cancel")
                }}</VBtn>
                <VBtn
                    color="primary"
                    variant="flat"
                    :loading="submitting"
                    :disabled="submitting || probing || !containerId || hasBlockers"
                    @click="confirm"
                >
                    {{ t("mcserver.adopt.confirm", "Adopt") }}
                </VBtn>
            </VCardActions>

            <VCardText v-if="hasSavedAdoption" class="wl-mcserver-adopt__release">
                <ConfigSuperConfirm
                    :key="record.id"
                    :disabled="submitting || probing"
                    :title="t('mcserver.adopt.releaseTitle', 'Release this adoption')"
                    :action="
                        t(
                            'mcserver.adopt.releaseAction',
                            { name: record.name },
                            'Forgets the adoption of {name} in this app only. It destroys nothing: the container, its process, and its files are left exactly as they are.',
                        )
                    "
                    :affected="[record.name]"
                    :confirm-label="t('mcserver.adopt.releaseConfirm', 'Release')"
                    @confirm="confirmRelease"
                />
            </VCardText>
        </VCard>
    </VDialog>
</template>

<style scoped>
/* `Worldlens.dc.html`'s adoption review: labelled sections of mono evidence, consent rows. */
.wl-adoptreview-dialog :deep(.v-overlay__content) {
    margin-top: calc(24px + var(--mb-titlebar-height, 40px));
    max-height: calc(100% - 48px - var(--mb-titlebar-height, 40px));
}
.wl-mcserver-adopt :deep(.v-btn) {
    text-transform: none;
    letter-spacing: 0;
}
.wl-mcserver-adopt .wl-mcserver-adopt__title {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px 18px 28px;
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: 400;
}
.wl-mcserver-adopt__container {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-adopt .wl-mcserver-adopt__body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 28px;
}
/* A scrolling column must not squeeze its cards: each keeps its own height and the body scrolls. */
.wl-mcserver-adopt__body > * {
    flex-shrink: 0;
}
.wl-mcserver-adopt__confidence {
    align-self: flex-start;
}
.wl-mcserver-adopt__lede {
    max-inline-size: 68ch;
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: 21px;
}
.wl-mcserver-adopt__label {
    margin-top: 8px;
    font-size: var(--md-sys-typescale-label-medium-size);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-on-surface-variant));
}
.wl-mcserver-adopt .wl-mcserver-adopt__box {
    padding: 14px 16px;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface-container));
}
.wl-mcserver-adopt__box-title {
    margin-bottom: 6px;
    font-size: var(--md-sys-typescale-body-medium-size);
    font-weight: 500;
}
.wl-mcserver-adopt__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}
@media (max-width: 720px) {
    .wl-mcserver-adopt__pair {
        grid-template-columns: minmax(0, 1fr);
    }
}
.wl-mcserver-adopt__noMatch {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: var(--md-sys-typescale-body-medium-size);
    margin: 4px 0 0 0;
}
.wl-mcserver-adopt__evidence {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 20px;
    overflow-wrap: anywhere;
}
.wl-mcserver-adopt .wl-mcserver-adopt__consent {
    padding: 0;
    border-radius: var(--md-sys-shape-corner-large);
    background: rgb(var(--v-theme-surface-container));
}
.wl-mcserver-adopt__consent > :deep(.v-input) {
    padding: 4px 16px;
    border-bottom: 1px solid rgb(var(--v-theme-surface-container-high));
}
.wl-mcserver-adopt__consent > :deep(.v-input:last-child) {
    border-bottom: 0;
}
.wl-mcserver-adopt__rcon-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.wl-mcserver-adopt .wl-mcserver-adopt__caps {
    padding: 0;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    border-radius: var(--md-sys-shape-corner-large);
    overflow: hidden;
}
.wl-mcserver-adopt__mono {
    font-family: "Roboto Mono", ui-monospace, monospace;
}
.wl-mcserver-adopt .wl-mcserver-adopt__actions {
    padding: 16px 28px;
    gap: 8px;
}
.wl-mcserver-adopt .wl-mcserver-adopt__actions :deep(.v-btn) {
    min-block-size: 44px;
    padding-inline: 22px;
    border-radius: var(--md-sys-shape-corner-full);
}
.wl-mcserver-adopt .wl-mcserver-adopt__release {
    padding: 0 28px 20px;
}
</style>
