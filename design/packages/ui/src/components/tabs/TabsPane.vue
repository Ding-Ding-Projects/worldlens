<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VIcon } from "vuetify/components";
import TabStrip from "./TabStrip.vue";
import type { PaneModel } from "./paneModel.js";

/**
 * One pane of the tabbed workspace: a strip and the one panel it selects.
 *
 * This is the markup `TabbedNavigation` always drew, lifted out so it can be drawn once
 * per pane. The strip's props and listeners arrive as one object (`stripBindings`) built by
 * the host, because they are the host's state and a pane has none of its own. Only the active
 * page is rendered in the panel: a hidden panel per tab would keep every page alive, and one of
 * them owns a map renderer.
 */
const props = defineProps<{
    pane: PaneModel;
    /** Set only in a dockable workspace, where the layout engine finds panes by it. */
    dockId?: string | undefined;
}>();

const emit = defineEmits<{
    "open-page": [pageId: string];
    focus: [];
}>();

const { t } = useI18n();

/** The host builds these against `TabStrip`'s own props and listeners; the object is opaque here. */
const stripBindings = computed(
    () => props.pane.stripBindings as unknown as InstanceType<typeof TabStrip>["$props"],
);
</script>

<template>
    <div
        class="mb-tabs"
        :class="`mb-tabs--${props.pane.placement}`"
        :data-tab-placement="props.pane.placement"
        :data-strip-id="props.dockId"
        @focusin="emit('focus')"
    >
        <TabStrip v-bind="stripBindings" />

        <!--
            The arrival is animated through `styles/motion.scss`'s `mb-page` class family - a
            short fade with a small rise on the decelerate curve, on the incoming panel only.
            `mode="out-in"` keeps the "only the active page is rendered" promise literally true,
            there is no leave animation so nothing is delayed, and the key is the page rather
            than the tab, so switching between two tabs that name the same page does not tear
            the page down and build it again.
        -->
        <Transition name="mb-page" mode="out-in">
            <div
                v-if="props.pane.activeTab !== null && props.pane.page !== null"
                :key="props.pane.page.id"
                :id="props.pane.panelDomId"
                class="mb-tabs__panel"
                :class="{ 'mb-tabs__panel--pointer-passthrough': props.pane.panelPassThrough }"
                :style="{ pointerEvents: props.pane.panelPassThrough ? 'none' : 'auto' }"
                role="tabpanel"
                :aria-labelledby="props.pane.labelledBy ?? undefined"
                tabindex="0"
            >
                <slot name="page" :tab="props.pane.activeTab" :page="props.pane.page">
                    <!-- A page with no slot says so rather than showing an empty rectangle. -->
                    <p class="mb-tabs__missing">
                        {{
                            t(
                                "tabs.panel.missing",
                                { page: props.pane.page.label },
                                "This build has no content for the page {page}.",
                            )
                        }}
                    </p>
                </slot>
            </div>

            <!--
                Every tab closed. An honest empty state with the one action that leaves it,
                rather than a blank area or a tab conjured up to keep the strip looking populated.
            -->
            <div
                v-else
                key="mb-tabs-empty"
                class="mb-tabs__empty"
                :class="{ 'mb-tabs__empty--pointer-interactive': props.pane.panelPassThrough }"
                :style="{ pointerEvents: 'auto' }"
                role="status"
            >
                <p class="mb-tabs__empty-line">
                    {{ t("tabs.panel.empty", "Every tab is closed.") }}
                </p>
                <div class="mb-tabs__empty-actions">
                    <v-btn
                        v-for="candidate in props.pane.pages"
                        :key="candidate.id"
                        variant="tonal"
                        size="small"
                        @click="emit('open-page', candidate.id)"
                    >
                        <v-icon
                            v-if="candidate.icon"
                            :icon="candidate.icon"
                            size="18"
                            start
                            aria-hidden="true"
                        />
                        {{ candidate.label }}
                    </v-btn>
                </div>
            </div>
        </Transition>
    </div>
</template>
