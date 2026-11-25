<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { VBtn } from "vuetify/components";
import { requestTutorialLaunch } from "./tutorialLaunch.js";
import { tutorialLaunchTourLabel, tutorialTourName } from "./tutorialCopy.js";
import { TUTORIAL_TOUR_IDS } from "./tutorialSteps.js";

/**
 * Every tour as a button: the overall walk first, then one short tour per destination.
 *
 * Shown in Help (the Info page) and in Settings. Each button only rings the shell's doorbell
 * with the tour it names (see `tutorialLaunch.ts`); `TutorialOverlay.vue`, mounted once at the
 * shell, is what opens it.
 */
const { t } = useI18n();
</script>

<template>
    <section class="mb-tour-list" data-testid="tour-list" aria-labelledby="mb-tour-list-heading">
        <h3 id="mb-tour-list-heading" class="mb-tour-list__heading">
            {{ t("tutorial.tours.heading", "Guided tours") }}
        </h3>
        <ul class="mb-tour-list__items">
            <li v-for="tour in TUTORIAL_TOUR_IDS" :key="tour">
                <VBtn
                    variant="text"
                    size="small"
                    :data-tour-launch="tour"
                    @click="requestTutorialLaunch(tour)"
                >
                    {{
                        tour === "overall"
                            ? t("tutorial.launch.start", "Take a tour")
                            : tutorialLaunchTourLabel(tutorialTourName(tour, t), t)
                    }}
                </VBtn>
            </li>
        </ul>
    </section>
</template>

<style>
.mb-tour-list__heading {
    margin: 0 0 4px;
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: 500;
}

.mb-tour-list__items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
}
</style>
