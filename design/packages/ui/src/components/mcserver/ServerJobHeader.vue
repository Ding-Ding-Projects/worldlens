<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDns } from "@mdi/js";
import { VIcon } from "vuetify/components";
import { useServerStore } from "./useServers.js";

/**
 * The Minecraft servers job's own page header: the icon tile, the title, the live count line
 * and the lede, exactly as `Worldlens.dc.html` draws it above both the list and an opened
 * server. The list and the server panel are separate mounts in the shell, so the header is
 * one component both of them render rather than two copies that drift apart.
 *
 * Actions are a slot: the list offers Refresh, Adopt and New server, an opened server offers
 * only what it can actually do from there. A button that would emit to nobody is not drawn.
 */
const { t } = useI18n();
const store = useServerStore();

const countLabel = computed(() =>
    t(
        "mcserver.list.count",
        { n: store.servers.value.length, running: store.runningCount.value },
        "{n} servers · {running} running · asked of the machine every time this is shown",
    ),
);
</script>

<template>
    <div class="wl-mcserver-job-header">
        <header class="wl-mcserver-job-header__row">
            <div class="mb-icon-tile wl-mcserver-job-header__tile" aria-hidden="true">
                <VIcon :icon="mdiDns" size="24" />
            </div>
            <div class="wl-mcserver-job-header__titles">
                <h1
                    class="wl-mcserver-job-header__title"
                    data-test="mcserver-list-heading"
                    tabindex="-1"
                >
                    {{ t("mcserver.list.title", "Minecraft servers") }}
                </h1>
                <div
                    v-if="store.canList && store.loaded.value"
                    class="wl-mcserver-job-header__count"
                >
                    {{ countLabel }}
                </div>
            </div>
            <div class="wl-mcserver-job-header__actions">
                <slot name="actions" />
            </div>
        </header>
        <p class="mb-lede wl-mcserver-job-header__lede">
            {{
                t(
                    "mcserver.list.lede",
                    "Real Minecraft servers, wherever they run: a Java process on this computer, a container on the local Docker daemon, one reached over SSH, or an EC2 host this application provisions. Nothing here is configured by typing; every setting a server has is a real typed control.",
                )
            }}
        </p>
    </div>
</template>

<style scoped>
.wl-mcserver-job-header__row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
}
.wl-mcserver-job-header .wl-mcserver-job-header__tile {
    inline-size: 44px;
    block-size: 44px;
    flex-basis: 44px;
    background: rgb(var(--v-theme-surface-container));
    border: 1px solid rgb(var(--v-theme-outline-variant));
}
.wl-mcserver-job-header__titles {
    flex: 1 1 auto;
    min-inline-size: 0;
}
.wl-mcserver-job-header .wl-mcserver-job-header__title {
    margin: 0;
    font-size: var(--md-sys-typescale-headline-small-size);
    font-weight: 400;
    line-height: 32px;
}
.wl-mcserver-job-header__title:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
    border-radius: var(--md-sys-shape-corner-extra-small);
}
.wl-mcserver-job-header__count {
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: 16px;
    color: rgb(var(--v-theme-outline));
}
.wl-mcserver-job-header__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.wl-mcserver-job-header .wl-mcserver-job-header__lede {
    margin: 16px 0 22px;
    max-inline-size: 68ch;
}
</style>
