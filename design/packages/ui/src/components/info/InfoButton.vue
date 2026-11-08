<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiInformationOutline, mdiRestore } from "@mdi/js";
import { VBtn, VIcon, VMenu } from "vuetify/components";

/**
 * The information button beside one control. It opens a small guide anchored to that control:
 * what it is for, the choices, the default, what changing it does, an example, what is checked,
 * and how to recover. A `#playground` slot holds a working example of the control itself, and
 * Reset puts the control back to its default when the host supports it.
 *
 * The button names the control it explains, so a screen reader hears "About Padding" rather
 * than a bare "Information", and the guide is linked to the control with `aria-details`.
 */
export interface ControlGuide {
    readonly purpose: string;
    readonly choices?: string;
    readonly defaultValue?: string;
    readonly effect?: string;
    readonly example?: string;
    readonly validation?: string;
    readonly recovery?: string;
}

const props = defineProps<{
    /** The control's visible name. */
    control: string;
    guide: ControlGuide;
    /** Shows Reset; the host restores its own default on `reset`. */
    resettable?: boolean;
}>();
const emit = defineEmits<{ reset: [] }>();

const { t } = useI18n();
const open = ref(false);
const id = `wl-info-${useId()}`;
const rows = computed(() =>
    [
        { key: "choices", label: t("info.choices", "Choices"), text: props.guide.choices },
        { key: "default", label: t("info.default", "Default"), text: props.guide.defaultValue },
        { key: "effect", label: t("info.effect", "What changing it does"), text: props.guide.effect },
        { key: "example", label: t("info.example", "Example"), text: props.guide.example },
        { key: "validation", label: t("info.validation", "What is checked"), text: props.guide.validation },
        { key: "recovery", label: t("info.recovery", "If something goes wrong"), text: props.guide.recovery },
    ].filter((r) => r.text),
);

function reset(): void {
    emit("reset");
    open.value = false;
}

defineExpose({ id });
</script>

<template>
    <VMenu v-model="open" location="bottom end" :close-on-content-click="false" max-width="380">
        <template #activator="{ props: activator }">
            <VBtn
                v-bind="activator"
                icon
                size="x-small"
                variant="text"
                class="wl-info__button"
                :aria-label="t('info.about', { control }, 'About {control}')"
                :aria-expanded="open"
                :aria-controls="id"
                data-test="info-button"
            >
                <VIcon :icon="mdiInformationOutline" size="18" />
            </VBtn>
        </template>
        <section :id="id" class="wl-info" role="dialog" :aria-label="t('info.about', { control }, 'About {control}')" data-test="info-guide">
            <h3 class="wl-info__title">{{ control }}</h3>
            <p class="wl-info__purpose">{{ guide.purpose }}</p>
            <dl class="wl-info__rows">
                <div v-for="r in rows" :key="r.key">
                    <dt>{{ r.label }}</dt>
                    <dd>{{ r.text }}</dd>
                </div>
            </dl>
            <div v-if="$slots.playground" class="wl-info__playground" :aria-label="t('info.tryIt', 'Try it')">
                <span class="wl-info__label">{{ t("info.tryIt", "Try it") }}</span>
                <slot name="playground" />
            </div>
            <div class="wl-info__actions">
                <VBtn v-if="resettable" size="small" variant="text" :prepend-icon="mdiRestore" @click="reset">{{ t("info.reset", "Reset to default") }}</VBtn>
                <VBtn size="small" variant="text" @click="open = false">{{ t("info.close", "Close") }}</VBtn>
            </div>
        </section>
    </VMenu>
</template>

<style scoped>
.wl-info { padding: 16px; border-radius: 16px; background: rgb(var(--v-theme-surface)); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22); max-height: 70vh; overflow: auto; }
.wl-info__title { margin: 0 0 4px; font-size: 15px; }
.wl-info__purpose { margin: 0 0 8px; }
.wl-info__rows { margin: 0; display: grid; gap: 6px; }
.wl-info__rows dt, .wl-info__label { font-size: 12px; font-weight: 600; color: rgb(var(--v-theme-on-surface-variant)); }
.wl-info__rows dd { margin: 0; font-size: 13px; }
.wl-info__playground { margin-top: 10px; padding: 10px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), 0.05); display: flex; flex-direction: column; gap: 6px; }
.wl-info__actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 8px; }
.wl-info__button { flex: none; }
</style>
