<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VSnackbar } from "vuetify/components";
import { mdiClose } from "@mdi/js";
import { resolveDimSumCatalog, type DimSumDish } from "./dimSumCatalog.js";
import { pickDish, shouldShowDimSum, type DimSumEligibilityContext } from "./dimSumSurprise.js";

/**
 * The startup dim sum surprise: a 10% chance, one dish, non-blocking, gone on its own.
 *
 * Mount it once in the shell, the same way `FirstRunSetup` and `TutorialOverlay` are - it
 * decides for itself whether to show anything and stays invisible otherwise. It is *not*
 * routed through the shared notice queue in `stores/notices.ts`: that queue is a persistent,
 * reviewable history, and this is a one-shot flourish that should leave no trace in it - a
 * dim sum surprise sitting unread in the notification centre a week later is not the delight
 * the shared instructions describe.
 *
 * The draw happens once, here, on mount, using a fresh `Math.random()` call - never a value
 * threaded in from anywhere persistent - so "never more than once per launch" falls out of
 * "this component is mounted exactly once per launch" rather than needing its own guard.
 *
 * Eligibility is re-checked at the moment the draw would fire, not only once at mount: the
 * `context` prop is read live, so a caller that flips `errorActive` or `updateFlowActive`
 * true in the same tick this component mounts still suppresses the draw, and a genuinely
 * won draw is simply not shown rather than deferred to a "safer" later moment - deferring it
 * would risk it landing mid-task instead, which is exactly the moment this must not appear.
 *
 * ## The screenshot harness's one escape hatch
 *
 * A 10% chance is, by construction, a surface the capture harness cannot reach by waiting: it
 * would need roughly ten launches on average, and it needs one every run. `readTestOverride`
 * below is the honest way out of that, not a weakening of the chance for anyone else. It reads
 * one `localStorage` key that nothing in the shipped product ever writes, so every real launch
 * finds it absent and draws exactly as the two paragraphs above describe - the same
 * `shouldShowDimSum` call, the same fresh `Math.random()`, the same one-in-ten odds. Only when
 * the harness has deliberately written that key does the draw skip straight to "won", and even
 * then it still renders through this exact template with a real dish record - never a
 * different component, never a screenshot of something else relabelled as this one.
 *
 * It also has to skip {@link resolveDimSumCatalog} entirely rather than merely forcing a win
 * and letting the fetch run: that fetch reaches a public repository over plain HTTPS, and the
 * harness's own offline guard (see `networkGuard.ts`) records any attempt to reach anything but
 * loopback as a violation whether or not the attempt succeeds. So the override carries its own
 * small, harness-supplied dish list, and the real network path is never invoked while it is
 * present.
 */
const props = withDefaults(
    defineProps<{
        firstRun?: boolean;
        updateFlowActive?: boolean;
        errorActive?: boolean;
        schoolModeActive?: boolean;
    }>(),
    { firstRun: false, updateFlowActive: false, errorActive: false, schoolModeActive: false },
);

const { t } = useI18n();

const visible = ref(false);
const dish = ref<DimSumDish | null>(null);
/** True once this launch has drawn, whichever way it came out - the "never twice" guard. */
let drawn = false;

function buildContext(): DimSumEligibilityContext {
    return {
        firstRun: props.firstRun,
        updateFlowActive: props.updateFlowActive,
        errorActive: props.errorActive,
        restrictedModeActive: props.schoolModeActive,
        alreadyShownThisLaunch: drawn,
    };
}

/**
 * The screenshot harness's forced-win payload, or null on every real launch.
 *
 * `worldlens.dimsum.testOverride.v1` is not read, written or referenced anywhere else in this
 * package - see the doc comment above. A malformed or foreign value is treated the same as no
 * override at all rather than thrown, because a broken test fixture must not turn into a
 * broken startup surprise for anybody running a real build with the same key coincidentally
 * present.
 */
function readTestOverride(): readonly DimSumDish[] | null {
    try {
        const raw = globalThis.localStorage?.getItem("worldlens.dimsum.testOverride.v1") ?? null;
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        const list = (parsed as { dishes?: unknown } | null)?.dishes;
        return Array.isArray(list) && list.length > 0 ? (list as DimSumDish[]) : null;
    } catch {
        return null;
    }
}

async function draw(): Promise<void> {
    if (drawn) return;
    const override = readTestOverride();
    const random = Math.random();
    const won = override !== null ? true : shouldShowDimSum(random, buildContext());
    drawn = true;
    if (!won) return;
    // The catalog fetch happens only for a winning draw, so a losing draw - nine times out
    // of ten - never spends a network round trip at all. A harness-forced win skips it too,
    // reading the override's own dishes instead - see readTestOverride's doc comment for why.
    const dishes = override ?? (await resolveDimSumCatalog());
    const picked = pickDish(dishes, Math.random());
    if (picked === null) return;
    // Re-check eligibility after the await: a first-run wizard, an update flow or an error
    // surface can all have opened while the fetch was in flight, and a surprise that was
    // fine to show a moment ago is not automatically fine to show now.
    if (props.firstRun || props.updateFlowActive || props.errorActive || props.schoolModeActive) return;
    dish.value = picked;
    visible.value = true;
}

onMounted(() => {
    void draw();
});

const introText = () => t("dimsum.intro", {}, "A dim sum surprise:");
const dishName = (current: DimSumDish) =>
    t("dimsum.dish.name", { en: current.nameEn, zhHant: current.nameZhHant }, "{en} · {zhHant}");
const altText = (current: DimSumDish) =>
    t("dimsum.alt", { en: current.nameEn, zhHant: current.nameZhHant }, "A photo of {en} ({zhHant})");
const dismissAria = t("dimsum.dismiss.aria", {}, "Dismiss the dim sum surprise");
</script>

<template>
    <v-snackbar
        v-if="dish !== null"
        v-model="visible"
        location="bottom end"
        :timeout="8000"
        variant="elevated"
        class="mb-dimsum-surprise"
        role="status"
        aria-live="polite"
    >
        <div class="mb-dimsum-surprise__body">
            <img
                v-if="dish.imageUrl !== null"
                :src="dish.imageUrl"
                :alt="altText(dish)"
                class="mb-dimsum-surprise__image"
            />
            <div class="mb-dimsum-surprise__text">
                <p class="mb-dimsum-surprise__intro">{{ introText() }}</p>
                <p class="mb-dimsum-surprise__name">{{ dishName(dish) }}</p>
            </div>
        </div>
        <template #actions>
            <v-btn
                :icon="mdiClose"
                variant="text"
                density="comfortable"
                :aria-label="dismissAria"
                @click="visible = false"
            />
        </template>
    </v-snackbar>
</template>

<style>
/*
 * Corner-anchored, non-blocking, auto-dismissing: `v-snackbar` already gives all three, so
 * this sheet is only the dim sum-specific layout - the photo beside the bilingual name -
 * plus `bilingual.css`'s own `.v-snackbar__content` rule (see that file) already turns the
 * intro/name pair's newline-joined bilingual text into two visible lines rather than one
 * run-on sentence, so nothing here duplicates that.
 */
.mb-dimsum-surprise__body {
    display: flex;
    align-items: center;
    gap: 12px;
}

.mb-dimsum-surprise__image {
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--md-sys-shape-corner-medium, 12px);
    object-fit: cover;
    flex-shrink: 0;
}

.mb-dimsum-surprise__text {
    min-width: 0;
}

.mb-dimsum-surprise__intro {
    margin: 0;
    font-size: 0.75rem;
    opacity: 0.85;
}

.mb-dimsum-surprise__name {
    margin: 2px 0 0;
    font-weight: 600;
    text-wrap: pretty;
    overflow-wrap: anywhere;
}
</style>
