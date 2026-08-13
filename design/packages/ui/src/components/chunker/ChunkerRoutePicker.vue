<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCloudUploadOutline,
    mdiCubeOutline,
    mdiLaptop,
    mdiRefresh,
    mdiServerNetwork,
} from "@mdi/js";
import { VBtn, VCard, VCardText, VCardTitle, VIcon, VProgressLinear, VRadio, VRadioGroup } from "vuetify/components";
import {
    CHUNKER_ROUTE_IDS,
    checkRoute,
    defaultRouteFor,
    describeRoute,
    firstReadyRoute,
    reasonCopyKey,
    unprobedFacts,
    type ChunkerRoute,
    type ChunkerRouteFacts,
    type ChunkerRouteFix,
    type ChunkerRouteId,
} from "./chunkerRoute.js";
import {
    resolveChunkerRouteHost,
    routeHostMissingReason,
    type ChunkerRouteHost,
} from "./chunkerRouteHost.js";

/**
 * Where this conversion runs, asked as a guided choice rather than assumed.
 *
 * All four routes are always on screen. One that cannot run is disabled **with its reason
 * beside it** and, where the application can genuinely do something about it, with the
 * button that would fix it. That is the whole design: hiding a route somebody expected to
 * find teaches them the app cannot do it, when the truth is usually that Docker is not
 * running or nobody has signed in yet, and those are two sentences apart from a working
 * conversion rather than a missing feature.
 *
 * ## What this component does not do
 *
 * It chooses a route and nothing else. It starts no conversion, writes no file, and
 * installs nothing itself: a fix is emitted upward so the surrounding page can open the
 * settings row, the SSH machine editor or the GitHub sign-in that already exists, rather
 * than this card growing a second copy of any of them.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridges are probed, which is why this
         * has no default: `undefined` means probe, `null` means there is deliberately no
         * host and the "this build has no route" state is what should be shown.
         */
        host?: ChunkerRouteHost | null | undefined;
        /** The route currently chosen, so the picker can be driven from outside. */
        route?: ChunkerRoute | undefined;
        /** Probe on mount. Off in a test that wants to hand facts in directly. */
        autoProbe?: boolean | undefined;
        /** Facts to render without probing at all. Overrides whatever the host measured. */
        facts?: ChunkerRouteFacts | undefined;
    }>(),
    { autoProbe: true },
);

const emit = defineEmits<{
    "update:route": [value: ChunkerRoute];
    /** The in-app action that would clear a refusal. The page owns where each one leads. */
    fix: [value: ChunkerRouteFix];
}>();

const { t } = useI18n();

const host = props.host === undefined ? resolveChunkerRouteHost() : props.host;

/**
 * What has actually been measured.
 *
 * Starts at {@link unprobedFacts}, which reports every route unsupported. That is the
 * honest starting state rather than a pessimistic one: nothing has been asked yet, and a
 * picker that offered four routes before any of them answered would be offering a guess.
 */
const facts = ref<ChunkerRouteFacts>(props.facts ?? unprobedFacts());
const probing = ref(false);
const chosen = ref<ChunkerRouteId>(props.route === undefined ? "local" : props.route.kind);

const ICONS: Readonly<Record<ChunkerRouteId, string>> = {
    local: mdiLaptop,
    docker: mdiCubeOutline,
    "github-actions": mdiCloudUploadOutline,
    ssh: mdiServerNetwork,
};

/** One row per route, in offer order, each carrying everything its row renders. */
const rows = computed(() =>
    CHUNKER_ROUTE_IDS.map((id) => {
        const route = props.route !== undefined && props.route.kind === id
            ? props.route
            : defaultRouteFor(id);
        const description = describeRoute(route);
        const readiness = checkRoute(id, facts.value);
        return {
            id,
            icon: ICONS[id],
            label: t(description.labelKey, description.labelFallback),
            summary: t(description.summaryKey, description.summaryFallback),
            // The route's own concrete identifier when it has one; otherwise whatever the
            // readiness carried, which for a working Docker is the image and for a broken
            // one is Docker's own words.
            detail: description.detail ?? readiness.detail,
            readiness,
            reason: readiness.ready ? null : t(reasonCopyKey(readiness.reason), readiness.reason),
            fix: readiness.ready ? null : readiness.fix,
        };
    }),
);

const FIX_LABELS: Readonly<Record<ChunkerRouteFix, { labelKey: string; fallback: string }>> = {
    "install-chunker": { labelKey: "chunkerRoute.fix.installChunker", fallback: "Get Chunker" },
    "install-docker": { labelKey: "chunkerRoute.fix.installDocker", fallback: "Install Docker" },
    "start-docker": { labelKey: "chunkerRoute.fix.startDocker", fallback: "Open Docker Desktop" },
    "sign-in-github": { labelKey: "chunkerRoute.fix.signInGithub", fallback: "Sign in to GitHub" },
    "add-ssh-host": { labelKey: "chunkerRoute.fix.addSshHost", fallback: "Add a machine" },
};

function fixLabel(fix: ChunkerRouteFix): string {
    const entry = FIX_LABELS[fix];
    return t(entry.labelKey, entry.fallback);
}

async function probe(): Promise<void> {
    if (host === null || props.facts !== undefined) return;
    probing.value = true;
    try {
        facts.value = await host.probe();
    } catch {
        // `probe` promises never to reject, so this is a broken host rather than a broken
        // machine. Everything stays unmeasured, which reads as "this build could not look"
        // rather than as "you have nothing installed".
        facts.value = unprobedFacts();
    } finally {
        probing.value = false;
    }
    const ready = firstReadyRoute(facts.value);
    // Only move the selection when nothing usable is selected. Somebody who has already
    // chosen a route should not have it taken away by a background probe finishing.
    if (ready !== null && !checkRoute(chosen.value, facts.value).ready) {
        select(ready);
    }
}

function select(id: ChunkerRouteId): void {
    if (!checkRoute(id, facts.value).ready) return;
    chosen.value = id;
    emit(
        "update:route",
        props.route !== undefined && props.route.kind === id ? props.route : defaultRouteFor(id),
    );
}

onMounted(() => {
    if (props.autoProbe) void probe();
});
</script>

<template>
    <VCard data-test="chunker-route-picker">
        <VCardTitle>{{ t("chunkerRoute.title", "Where should this conversion run?") }}</VCardTitle>
        <VCardText>
            <p class="text-body-2 mb-3" data-test="chunker-route-intro">
                {{
                    t(
                        "chunkerRoute.intro",
                        "Converting a world is a long job on a lot of files, so it matters which machine does it.",
                    )
                }}
            </p>

            <VProgressLinear v-if="probing" indeterminate data-test="chunker-route-probing" />

            <p v-if="host === null" class="text-body-2 mb-3" data-test="chunker-route-no-host">
                {{ routeHostMissingReason() }}
            </p>

            <VRadioGroup :model-value="chosen" hide-details>
                <div
                    v-for="row in rows"
                    :key="row.id"
                    class="mb-4"
                    :data-test="`chunker-route-row-${row.id}`"
                >
                    <VRadio
                        :value="row.id"
                        :disabled="!row.readiness.ready"
                        @update:model-value="select(row.id)"
                    >
                        <template #label>
                            <span class="d-inline-flex align-center ga-2">
                                <VIcon :icon="row.icon" size="small" />
                                <span>{{ row.label }}</span>
                            </span>
                        </template>
                    </VRadio>
                    <div class="text-body-2 ms-8">{{ row.summary }}</div>
                    <div
                        v-if="row.detail !== null"
                        class="text-caption ms-8"
                        :data-test="`chunker-route-detail-${row.id}`"
                    >
                        {{ row.detail }}
                    </div>
                    <div
                        v-if="row.reason !== null"
                        class="text-body-2 ms-8"
                        :data-test="`chunker-route-reason-${row.id}`"
                    >
                        {{ row.reason }}
                    </div>
                    <VBtn
                        v-if="row.fix !== null"
                        class="ms-8 mt-1"
                        variant="tonal"
                        size="small"
                        :data-test="`chunker-route-fix-${row.id}`"
                        @click="emit('fix', row.fix)"
                    >
                        {{ fixLabel(row.fix) }}
                    </VBtn>
                </div>
            </VRadioGroup>

            <VBtn
                v-if="host !== null"
                class="mt-2"
                variant="text"
                size="small"
                :prepend-icon="mdiRefresh"
                :disabled="probing"
                data-test="chunker-route-recheck"
                @click="probe()"
            >
                {{ t("chunkerRoute.recheck", "Check again") }}
            </VBtn>
        </VCardText>
    </VCard>
</template>
