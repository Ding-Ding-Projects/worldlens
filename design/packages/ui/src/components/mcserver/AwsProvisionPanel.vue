<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertCircleOutline, mdiCloudUploadOutline, mdiDeleteOutline, mdiServerNetwork } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VDivider,
    VIcon,
    VSelect,
    VSwitch,
    VTextField,
} from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { awsInstanceTypes, awsPlan, awsProvision, awsRegions, awsTeardown } from "./mcserverBridge.js";
import {
    awsFormBlockReason,
    buildAwsSpec,
    clearTrackedAwsInstance,
    defaultAwsRules,
    formatMonthlyUsd,
    instanceTypeSummary,
    planHasUnknownCost,
    readTrackedAwsInstance,
    trackedInstanceFromResult,
    writeTrackedAwsInstance,
    type AwsFormState,
    type AwsInstanceTypeOption,
    type AwsProvisionPlan,
    type AwsProvisionStep,
    type AwsRegionOption,
    type AwsTeardownResult,
    type AwsTrackedInstance,
} from "./awsProvisionModel.js";

/**
 * Provisioning and tearing down a Minecraft server on an EC2 instance this app creates.
 *
 * Every number and every state here comes from the real `mcserver.aws` bridge namespace -
 * `regions`/`instanceTypes` for what the pickers offer, `plan` for the bill shown before
 * anything exists, `provision`/`teardown` for the two irreversible actions. Nothing here
 * ever prints a shell command for the user to run: the key pair and AMI fields ask for
 * values that already exist, and every failure names the exact condition rather than a
 * command to fix it with.
 */
const props = defineProps<{ serverId: string }>();

const { t } = useI18n();

const localStorageRef: Storage | null = typeof window !== "undefined" ? window.localStorage : null;

const regions = ref<readonly AwsRegionOption[]>([]);
const instanceTypeOptions = ref<readonly AwsInstanceTypeOption[]>([]);
const catalogueFailure = ref<string | null>(null);

const form = ref<AwsFormState>({
    region: null,
    instanceType: null,
    diskGiB: 10,
    staticAddress: false,
    keyPairName: "",
    amiId: "",
});

const blockReason = computed(() => awsFormBlockReason(form.value));
const blockMessage = computed<string | null>(() => {
    switch (blockReason.value) {
        case "region-missing":
            return t("mcserver.aws.blockRegion", "Choose a region first.");
        case "instance-type-missing":
            return t("mcserver.aws.blockInstanceType", "Choose an instance type first.");
        case "disk-invalid":
            return t("mcserver.aws.blockDisk", "Disk size must be between 1 and 16384 GiB.");
        case "key-pair-missing":
            return t("mcserver.aws.blockKeyPair", "Enter the name of an existing EC2 key pair.");
        case "ami-missing":
            return t("mcserver.aws.blockAmi", "Enter the AMI id to launch.");
        default:
            return null;
    }
});

const tracked = ref<AwsTrackedInstance | null>(null);
const plan = ref<AwsProvisionPlan | null>(null);
const planFailure = ref<string | null>(null);
const planLoading = ref(false);

const provisionSteps = ref<readonly AwsProvisionStep[]>([]);
const provisionRunning = ref(false);
const provisionFailure = ref<string | null>(null);
const rollbackNote = computed(() => {
    if (provisionFailure.value === null) return null;
    // provisionAwsServer folds the rollback report into the failure message itself.
    return provisionFailure.value;
});

const teardownRunning = ref(false);
const teardownFailure = ref<string | null>(null);
const teardownResult = ref<AwsTeardownResult | null>(null);

async function loadCatalogue(): Promise<void> {
    const [regionsResult, typesResult] = await Promise.all([awsRegions(), awsInstanceTypes()]);
    if (regionsResult.ok) regions.value = regionsResult.value ?? [];
    if (typesResult.ok) instanceTypeOptions.value = typesResult.value ?? [];
    if (!regionsResult.ok || !typesResult.ok) {
        catalogueFailure.value =
            (!regionsResult.ok ? regionsResult.failure?.message : null) ??
            (!typesResult.ok ? typesResult.failure?.message : null) ??
            t("mcserver.aws.catalogueFailed", "Could not read the region and instance type list.");
    } else {
        catalogueFailure.value = null;
    }
}

onMounted(() => {
    void loadCatalogue();
    tracked.value = readTrackedAwsInstance(props.serverId, localStorageRef);
    if (tracked.value !== null) {
        form.value = { ...form.value, region: tracked.value.region, staticAddress: tracked.value.staticAddress };
    }
});

const regionItems = computed(() => regions.value.map((r) => ({ title: `${r.name} (${r.id})`, value: r.id })));
const instanceTypeItems = computed(() =>
    instanceTypeOptions.value.map((option) => ({ title: `${option.id} - ${instanceTypeSummary(option)}`, value: option.id })),
);

async function requestPlan(): Promise<void> {
    planFailure.value = null;
    plan.value = null;
    const spec = buildAwsSpec(props.serverId, form.value, defaultAwsRules());
    if (spec === null) return;
    planLoading.value = true;
    try {
        const result = await awsPlan(spec);
        if (result.ok) {
            plan.value = result.value ?? null;
        } else {
            planFailure.value = result.failure?.message ?? t("mcserver.aws.planFailed", "Could not compute the plan.");
        }
    } finally {
        planLoading.value = false;
    }
}

async function provision(): Promise<void> {
    const spec = buildAwsSpec(props.serverId, form.value, defaultAwsRules());
    if (spec === null) return;
    provisionRunning.value = true;
    provisionFailure.value = null;
    provisionSteps.value = [];
    try {
        const result = await awsProvision(spec);
        if (result.ok && result.value) {
            provisionSteps.value = result.value.steps;
            const record = trackedInstanceFromResult(props.serverId, spec.region, spec.staticAddress, result.value);
            tracked.value = record;
            writeTrackedAwsInstance(record, localStorageRef);
        } else {
            provisionFailure.value = result.failure?.message ?? t("mcserver.aws.provisionFailed", "Could not provision the instance.");
        }
    } finally {
        provisionRunning.value = false;
    }
}

async function confirmTeardown(): Promise<void> {
    if (tracked.value === null) return;
    teardownRunning.value = true;
    teardownFailure.value = null;
    teardownResult.value = null;
    try {
        const result = await awsTeardown({
            serverId: tracked.value.serverId,
            region: tracked.value.region,
            instanceId: tracked.value.instanceId,
            elasticIpAllocationId: tracked.value.elasticIpAllocationId,
            securityGroupId: tracked.value.securityGroupId,
        });
        if (result.ok && result.value) {
            teardownResult.value = result.value;
            if (result.value.complete) {
                clearTrackedAwsInstance(props.serverId, localStorageRef);
                tracked.value = null;
            }
        } else {
            teardownFailure.value = result.failure?.message ?? t("mcserver.aws.teardownFailed", "Could not tear down the instance.");
        }
    } finally {
        teardownRunning.value = false;
    }
}

function stepStatusColor(status: AwsProvisionStep["status"]): string {
    if (status === "created") return "success";
    if (status === "found-existing") return "info";
    return "error";
}

const teardownAffected = computed(() =>
    tracked.value === null
        ? []
        : [
              t("mcserver.aws.teardownAffectedInstance", { id: tracked.value.instanceId }, "EC2 instance {id}"),
              t("mcserver.aws.teardownAffectedSg", { id: tracked.value.securityGroupId }, "Security group {id}"),
              ...(tracked.value.elasticIpAllocationId
                  ? [t("mcserver.aws.teardownAffectedEip", { id: tracked.value.elasticIpAllocationId }, "Elastic IP {id}")]
                  : []),
          ],
);
</script>

<template>
    <div class="wl-aws-panel">
        <VAlert v-if="catalogueFailure" type="warning" variant="tonal" density="compact" class="mb-3">
            {{ catalogueFailure }}
        </VAlert>

        <VCard v-if="tracked === null" variant="outlined" class="mb-4">
            <VCardTitle class="text-subtitle-1">
                {{ t("mcserver.aws.setupTitle", "Provision on AWS") }}
            </VCardTitle>
            <VCardText>
                <div class="text-body-2 text-medium-emphasis mb-4">
                    {{
                        t(
                            "mcserver.aws.setupLede",
                            "Creates a new EC2 instance and runs this server's Docker container on it, using the same console, configuration editor, and plugin manager as every other server here.",
                        )
                    }}
                </div>

                <div class="wl-aws-panel__grid">
                    <VSelect
                        v-model="form.region"
                        :items="regionItems"
                        :label="t('mcserver.aws.region', 'Region')"
                        density="compact"
                        hide-details
                    />
                    <VSelect
                        v-model="form.instanceType"
                        :items="instanceTypeItems"
                        :label="t('mcserver.aws.instanceType', 'Instance type')"
                        density="compact"
                        hide-details
                    />
                    <VTextField
                        v-model.number="form.diskGiB"
                        type="number"
                        min="1"
                        max="16384"
                        :label="t('mcserver.aws.disk', 'Root disk (GiB)')"
                        density="compact"
                        hide-details
                    />
                    <VTextField
                        v-model="form.keyPairName"
                        :label="t('mcserver.aws.keyPair', 'Existing EC2 key pair name')"
                        :hint="t('mcserver.aws.keyPairHint', 'This app never generates or holds a private key. Create the pair in the AWS console first.')"
                        persistent-hint
                        density="compact"
                    />
                    <VTextField
                        v-model="form.amiId"
                        :label="t('mcserver.aws.ami', 'AMI id')"
                        :hint="t('mcserver.aws.amiHint', 'The machine image to launch, e.g. ami-0abcdef1234567890.')"
                        persistent-hint
                        density="compact"
                    />
                    <VSwitch
                        v-model="form.staticAddress"
                        :label="t('mcserver.aws.staticAddress', 'Static address (Elastic IP)')"
                        :hint="t('mcserver.aws.staticAddressHint', 'Keeps the same address across a stop and start.')"
                        persistent-hint
                        density="compact"
                        hide-details="auto"
                    />
                </div>

                <VAlert v-if="blockMessage" type="info" variant="tonal" density="compact" class="mt-4">
                    {{ blockMessage }}
                </VAlert>

                <div class="wl-aws-panel__actions">
                    <VBtn
                        variant="tonal"
                        :prepend-icon="mdiServerNetwork"
                        :loading="planLoading"
                        :disabled="blockReason !== null"
                        :title="blockMessage ?? undefined"
                        @click="requestPlan"
                    >
                        {{ t("mcserver.aws.getPlan", "See the plan") }}
                    </VBtn>
                </div>

                <VAlert v-if="planFailure" type="error" variant="tonal" density="compact" class="mt-3">
                    {{ planFailure }}
                </VAlert>

                <VCard v-if="plan" variant="tonal" class="mt-4 wl-aws-panel__plan">
                    <VCardText>
                        <div class="text-caption text-medium-emphasis mb-2">
                            {{
                                t(
                                    "mcserver.aws.planNote",
                                    "List-price on-demand estimate for common regions, not a live pricing lookup. Actual usage, data transfer, and non-listed instance types can change the real bill.",
                                )
                            }}
                        </div>
                        <ul class="wl-aws-panel__resources">
                            <li v-for="resource in plan.resources" :key="resource.kind + resource.summary">
                                <span>{{ resource.summary }}</span>
                                <VChip size="small" :color="resource.estimatedMonthlyUsd === null ? 'warning' : undefined" variant="tonal">
                                    {{ resource.estimatedMonthlyUsd === null ? t("mcserver.aws.costUnknown", "cost unknown") : formatMonthlyUsd(resource.estimatedMonthlyUsd) }}
                                </VChip>
                            </li>
                        </ul>
                        <VDivider class="my-2" />
                        <div class="wl-aws-panel__total">
                            <span class="font-weight-medium">{{ t("mcserver.aws.total", "Estimated total") }}</span>
                            <span>
                                {{ formatMonthlyUsd(plan.estimatedMonthlyUsd) }}
                                <span v-if="planHasUnknownCost(plan)" class="text-warning">
                                    {{ t("mcserver.aws.totalIncomplete", "+ unknown") }}
                                </span>
                            </span>
                        </div>

                        <VBtn
                            class="mt-4"
                            color="primary"
                            variant="flat"
                            :prepend-icon="mdiCloudUploadOutline"
                            :loading="provisionRunning"
                            @click="provision"
                        >
                            {{ t("mcserver.aws.provision", "Provision") }}
                        </VBtn>
                    </VCardText>
                </VCard>

                <VAlert v-if="provisionFailure" type="error" variant="tonal" density="compact" class="mt-3">
                    <div class="d-flex align-center ga-2 mb-1">
                        <VIcon :icon="mdiAlertCircleOutline" size="small" />
                        <span class="font-weight-medium">{{ t("mcserver.aws.provisionFailedTitle", "Provisioning failed") }}</span>
                    </div>
                    {{ rollbackNote }}
                </VAlert>

                <ul v-if="provisionSteps.length > 0" class="wl-aws-panel__steps mt-3">
                    <li v-for="s in provisionSteps" :key="s.kind">
                        <VChip size="small" :color="stepStatusColor(s.status)" variant="tonal">{{ s.status }}</VChip>
                        <span>{{ s.message }}</span>
                        <span v-if="s.resourceId" class="text-caption text-medium-emphasis">{{ s.resourceId }}</span>
                    </li>
                </ul>
            </VCardText>
        </VCard>

        <VCard v-else variant="outlined">
            <VCardTitle class="text-subtitle-1 d-flex align-center justify-space-between">
                {{ t("mcserver.aws.runningTitle", "Running on AWS") }}
                <VChip size="small" color="success" variant="tonal">{{ tracked.region }}</VChip>
            </VCardTitle>
            <VCardText>
                <dl class="wl-aws-panel__facts">
                    <dt>{{ t("mcserver.aws.instanceId", "Instance") }}</dt>
                    <dd>{{ tracked.instanceId }}</dd>
                    <dt>{{ t("mcserver.aws.publicIp", "Public address") }}</dt>
                    <dd>{{ tracked.publicIp || t("mcserver.aws.publicIpPending", "not assigned yet") }}</dd>
                    <dt>{{ t("mcserver.aws.securityGroup", "Security group") }}</dt>
                    <dd>{{ tracked.securityGroupId }}</dd>
                    <dt v-if="tracked.elasticIpAllocationId">{{ t("mcserver.aws.elasticIp", "Elastic IP") }}</dt>
                    <dd v-if="tracked.elasticIpAllocationId">{{ tracked.elasticIpAllocationId }}</dd>
                </dl>

                <VAlert v-if="teardownFailure" type="error" variant="tonal" density="compact" class="mt-3">
                    {{ teardownFailure }}
                </VAlert>

                <VAlert
                    v-if="teardownResult && !teardownResult.complete"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-3"
                >
                    {{ t("mcserver.aws.teardownIncomplete", "Some resources could not be removed and need manual cleanup - see the steps below.") }}
                </VAlert>

                <ul v-if="teardownResult" class="wl-aws-panel__steps mt-3">
                    <li v-for="s in teardownResult.steps" :key="s.kind">
                        <VChip size="small" :color="s.status === 'removed' || s.status === 'already-gone' ? 'success' : 'error'" variant="tonal">
                            {{ s.status }}
                        </VChip>
                        <span>{{ s.message }}</span>
                    </li>
                </ul>

                <ConfigSuperConfirm
                    class="mt-4"
                    :title="t('mcserver.aws.teardownTitle', 'Tear down this AWS server')"
                    :action="
                        t(
                            'mcserver.aws.teardownAction',
                            'Permanently terminates the EC2 instance and removes the security group and Elastic IP this app created for it. This cannot be undone.',
                        )
                    "
                    :affected="teardownAffected"
                    :confirm-label="t('mcserver.aws.teardownConfirm', 'Tear it down')"
                    :disabled="teardownRunning"
                    @confirm="confirmTeardown"
                >
                    <template #activator="{ props: activatorProps }">
                        <VBtn v-bind="activatorProps" color="error" variant="tonal" :prepend-icon="mdiDeleteOutline" :loading="teardownRunning">
                            {{ t("mcserver.aws.teardown", "Tear down") }}
                        </VBtn>
                    </template>
                </ConfigSuperConfirm>
            </VCardText>
        </VCard>
    </div>
</template>

<style scoped>
.wl-aws-panel__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    align-items: start;
}
.wl-aws-panel__actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}
.wl-aws-panel__resources {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-aws-panel__resources li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.wl-aws-panel__total {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.wl-aws-panel__steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wl-aws-panel__steps li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-aws-panel__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0;
}
.wl-aws-panel__facts dt {
    color: rgb(var(--v-theme-on-surface-variant));
    font-size: 0.85rem;
}
.wl-aws-panel__facts dd {
    margin: 0;
    font-family: monospace;
}
</style>
