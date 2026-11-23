<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCubeOutline, mdiDocker, mdiRobotOutline } from "@mdi/js";
import { VIcon } from "vuetify/components";

/**
 * The three ways to share a render that just finished.
 *
 * Each card is one click into its own guided dialog: hosting the map in a container,
 * building a bootable appliance image, or hosting a live 3D viewer with a bot. The
 * cards only choose a route; every setting lives in the dialog that opens.
 */
import type { ShareRoute } from "./shareRoute.js";

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ share: [route: ShareRoute] }>();
const { t } = useI18n();

const routes = computed(() => [
    {
        id: "host" as const,
        icon: mdiDocker,
        kicker: t("world.share.host.kicker", "Container"),
        title: t("world.share.host.title", "Host the map"),
        body: t(
            "world.share.host.body",
            "Runs the map in a container on this PC or on an SSH host. You get a link to open and share on your network.",
        ),
        targets: t("world.share.host.targets", "This PC · SSH host"),
    },
    {
        id: "appliance" as const,
        icon: mdiCubeOutline,
        kicker: t("world.share.appliance.kicker", "Appliance"),
        title: t("world.share.appliance.title", "Build an appliance"),
        body: t(
            "world.share.appliance.body",
            "Builds a small operating system that boots straight into the map. Starts in VMware or VirtualBox, writes a USB stick, or saves an image to install yourself.",
        ),
        targets: t("world.share.appliance.targets", "VMware · VirtualBox · USB · Export"),
    },
    {
        id: "live" as const,
        icon: mdiRobotOutline,
        kicker: t("world.share.live.kicker", "Live 3D"),
        title: t("world.share.live.title", "Live viewer and bot"),
        body: t(
            "world.share.live.body",
            "Hosts Prismarine Viewer or Prismarine Web Client with a mineflayer bot on your server, so people watch the world in 3D.",
        ),
        targets: t("world.share.live.targets", "This PC · SSH host"),
    },
]);
</script>

<template>
    <section class="mb-share" :aria-label="t('world.share.heading', 'Share this map')">
        <h3 class="mb-share__heading">{{ t("world.share.heading", "Share this map") }}</h3>
        <p class="mb-share__lede">
            {{
                t(
                    "world.share.lede",
                    "One click each. Every part ships inside Worldlens, so nothing is downloaded while you wait.",
                )
            }}
        </p>
        <div class="mb-share__grid">
            <button
                v-for="route in routes"
                :key="route.id"
                type="button"
                class="mb-share__card"
                :disabled="disabled"
                :data-route="route.id"
                @click="emit('share', route.id)"
            >
                <span class="mb-share__kicker">
                    <v-icon :icon="route.icon" size="18" aria-hidden="true" />
                    {{ route.kicker }}
                </span>
                <span class="mb-share__title">{{ route.title }}</span>
                <span class="mb-share__body">{{ route.body }}</span>
                <span class="mb-share__targets">{{ route.targets }}</span>
            </button>
        </div>
    </section>
</template>

<style scoped>
.mb-share {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
}
.mb-share__heading {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
}
.mb-share__lede {
    margin: 0;
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
.mb-share__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}
.mb-share__card {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 160px;
    padding: 16px;
    border-radius: 16px;
    border: 1px solid rgb(var(--v-theme-outline-variant));
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
    font: inherit;
    cursor: pointer;
    transition:
        transform 0.22s cubic-bezier(0.2, 0, 0, 1),
        box-shadow 0.22s cubic-bezier(0.2, 0, 0, 1),
        border-color 0.22s;
}
.mb-share__card:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    border-color: rgb(var(--v-theme-primary));
}
.mb-share__card:focus-visible {
    outline: 3px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}
.mb-share__card:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.mb-share__kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}
.mb-share__title {
    font-size: 1.0625rem;
    font-weight: 500;
}
.mb-share__body {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: rgb(var(--v-theme-on-surface-variant));
}
.mb-share__targets {
    margin-top: auto;
    font-family: "Roboto Mono", monospace;
    font-size: 0.6875rem;
    color: rgb(var(--v-theme-on-surface-variant));
}
@media (prefers-reduced-motion: reduce) {
    .mb-share__card {
        transition: none;
    }
    .mb-share__card:hover:not(:disabled) {
        transform: none;
    }
}
</style>
