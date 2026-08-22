<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VCard, VCardText, VCardTitle, VRadio, VRadioGroup } from "vuetify/components";
import {
    CI_HOSTING_ROUTE_IDS,
    CI_RENDER_ROUTE_IDS,
    defaultRenderRoute,
    describeHostingRoute,
    describeRenderRoute,
    hostingReasonCopyKey,
    renderReasonCopyKey,
    renderRouteFix,
    type CiHostingRouteId,
    type CiHostingRouteReason,
    type CiRenderRoute,
    type CiRenderRouteFix,
    type CiRenderRouteId,
    type CiRenderRouteReason,
    type CiRouteReadiness,
} from "./ciRenderRoute.js";

/**
 * Where a cloud render runs, and where its map is served from, asked as two guided choices.
 *
 * Every route is always on screen. One that cannot be used is disabled **with its reason
 * beside it** and, where this app can genuinely do something about it, with the button
 * that would fix it. Hiding a route somebody expected to find teaches them the build
 * cannot do it, when the truth is usually that nobody has signed in yet - two sentences
 * away from a working render rather than a missing feature.
 *
 * ## What this component does not do
 *
 * It chooses. It starts no render, provisions nothing, and installs nothing: a fix is
 * emitted upward so the surrounding page can open the AWS settings, the sign-in, or the
 * provisioning preflight that already exist, rather than this card growing a second copy
 * of any of them.
 */
const props = withDefaults(
    defineProps<{
        /** The render route currently chosen, so the picker can be driven from outside. */
        renderRoute?: CiRenderRoute | undefined;
        hostingRoute?: CiHostingRouteId | undefined;
        /**
         * Whether each render route can be used.
         *
         * A missing entry means **unmeasured**, which is deliberately not the same as
         * unavailable: the route is offered rather than refused, because refusing on the
         * strength of a probe nobody ran is a claim this app has not checked.
         */
        renderReadiness?:
            | Partial<Record<CiRenderRouteId, CiRouteReadiness<CiRenderRouteReason>>>
            | undefined;
        hostingReadiness?:
            | Partial<Record<CiHostingRouteId, CiRouteReadiness<CiHostingRouteReason>>>
            | undefined;
    }>(),
    {
        renderRoute: undefined,
        hostingRoute: undefined,
        renderReadiness: undefined,
        hostingReadiness: undefined,
    },
);

const emit = defineEmits<{
    "update:renderRoute": [route: CiRenderRoute];
    "update:hostingRoute": [route: CiHostingRouteId];
    fix: [fix: CiRenderRouteFix];
    recheck: [];
}>();

const { t } = useI18n();

const chosenRender = computed(() => props.renderRoute?.kind ?? "github-actions");
const chosenHosting = computed(() => props.hostingRoute ?? "github-pages");

interface RenderRow {
    readonly id: CiRenderRouteId;
    readonly label: string;
    readonly summary: string;
    readonly detail: string | null;
    readonly disabled: boolean;
    readonly reason: string | null;
    readonly fix: CiRenderRouteFix | null;
}

const renderRows = computed<readonly RenderRow[]>(() =>
    CI_RENDER_ROUTE_IDS.map((id) => {
        const route =
            props.renderRoute?.kind === id ? props.renderRoute : defaultRenderRoute(id);
        const description = describeRenderRoute(route);
        const readiness = props.renderReadiness?.[id];
        // `ready === false` is the only thing that disables a row. Undefined and null both
        // mean nobody measured, and an unmeasured route stays offered.
        const disabled = readiness?.ready === false;
        const reason = readiness?.reason ?? null;
        return {
            id,
            label: t(description.labelKey, description.labelFallback),
            summary: t(description.summaryKey, description.summaryFallback),
            detail: description.detail,
            disabled,
            reason: disabled && reason ? t(renderReasonCopyKey(reason), reason) : null,
            fix: disabled && reason ? renderRouteFix(reason) : null,
        };
    }),
);

interface HostingRow {
    readonly id: CiHostingRouteId;
    readonly label: string;
    readonly summary: string;
    readonly disabled: boolean;
    readonly reason: string | null;
}

const hostingRows = computed<readonly HostingRow[]>(() =>
    CI_HOSTING_ROUTE_IDS.map((id) => {
        const description = describeHostingRoute(id);
        const readiness = props.hostingReadiness?.[id];
        const disabled = readiness?.ready === false;
        const reason = readiness?.reason ?? null;
        return {
            id,
            label: t(description.labelKey, description.labelFallback),
            summary: t(description.summaryKey, description.summaryFallback),
            disabled,
            reason: disabled && reason ? t(hostingReasonCopyKey(reason), reason) : null,
        };
    }),
);

const FIX_LABELS: Readonly<Record<CiRenderRouteFix, { labelKey: string; fallback: string }>> = {
    "sign-in-github": { labelKey: "ciRenderRoute.fix.signInGithub", fallback: "Sign in to GitHub" },
    "install-aws-cli": { labelKey: "ciRenderRoute.fix.installAwsCli", fallback: "Get the AWS CLI" },
    "sign-in-aws": { labelKey: "ciRenderRoute.fix.signInAws", fallback: "Sign in to AWS" },
    "choose-aws-profile": {
        labelKey: "ciRenderRoute.fix.chooseAwsProfile",
        fallback: "Choose a profile",
    },
    "choose-aws-region": {
        labelKey: "ciRenderRoute.fix.chooseAwsRegion",
        fallback: "Choose a region",
    },
    "provision-aws": { labelKey: "ciRenderRoute.fix.provisionAws", fallback: "Set up AWS" },
};

function fixLabel(fix: CiRenderRouteFix): string {
    const entry = FIX_LABELS[fix];
    return t(entry.labelKey, entry.fallback);
}

function chooseRender(id: CiRenderRouteId): void {
    if (props.renderRoute?.kind === id) {
        return;
    }
    emit("update:renderRoute", defaultRenderRoute(id));
}
</script>

<template>
    <VCard class="ci-render-route-picker">
        <VCardTitle>{{ t("ciRenderRoute.title", "Where should this render run?") }}</VCardTitle>
        <VCardText>
            <VRadioGroup
                :model-value="chosenRender"
                @update:model-value="(value) => chooseRender(value as CiRenderRouteId)"
            >
                <div v-for="row in renderRows" :key="row.id" class="route-row">
                    <VRadio :value="row.id" :disabled="row.disabled" :label="row.label" />
                    <p class="route-summary">{{ row.summary }}</p>
                    <p v-if="row.detail" class="route-detail">{{ row.detail }}</p>
                    <p v-if="row.reason" class="route-reason" role="note">{{ row.reason }}</p>
                    <VBtn
                        v-if="row.fix"
                        class="route-fix"
                        variant="text"
                        density="comfortable"
                        @click="emit('fix', row.fix)"
                    >
                        {{ fixLabel(row.fix) }}
                    </VBtn>
                </div>
            </VRadioGroup>

            <VBtn variant="text" density="comfortable" @click="emit('recheck')">
                {{ t("ciRenderRoute.recheck", "Check again") }}
            </VBtn>
        </VCardText>

        <VCardTitle>
            {{ t("ciHostingRoute.title", "Where should the map be served from?") }}
        </VCardTitle>
        <VCardText>
            <VRadioGroup
                :model-value="chosenHosting"
                @update:model-value="
                    (value) => emit('update:hostingRoute', value as CiHostingRouteId)
                "
            >
                <div v-for="row in hostingRows" :key="row.id" class="route-row">
                    <VRadio :value="row.id" :disabled="row.disabled" :label="row.label" />
                    <p class="route-summary">{{ row.summary }}</p>
                    <p v-if="row.reason" class="route-reason" role="note">{{ row.reason }}</p>
                </div>
            </VRadioGroup>
        </VCardText>
    </VCard>
</template>

<style scoped>
.route-row {
    padding-block-end: var(--md-sys-spacing-3, 12px);
}

.route-summary,
.route-detail,
.route-reason {
    /* Aligned under the radio's label rather than its control, so the sentence reads as
       belonging to the choice above it instead of floating beside the whole group. */
    margin-inline-start: 2.5rem;
    margin-block: 0;
}

.route-summary {
    color: rgb(var(--v-theme-on-surface-variant));
}

.route-detail {
    color: rgb(var(--v-theme-on-surface-variant));
    font-variant-numeric: tabular-nums;
}

.route-reason {
    /* Colour is never the only signal: the reason is a sentence, and it is announced as a
       note, so it reaches somebody who cannot see the colour at all. */
    color: rgb(var(--v-theme-error));
}

.route-fix {
    margin-inline-start: 2.25rem;
}
</style>
