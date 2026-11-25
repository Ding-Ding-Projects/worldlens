<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowExpandAll,
    mdiCheck,
    mdiDelete,
    mdiDockBottom,
    mdiDockLeft,
    mdiDockRight,
    mdiDockTop,
    mdiDockWindow,
    mdiOpenInNew,
    mdiPencil,
    mdiRestore,
    mdiSwapHorizontal,
    mdiViewDashboardOutline,
    mdiWindowRestore,
} from "@mdi/js";
import {
    VBtn,
    VIcon,
    VList,
    VListItem,
    VListSubheader,
    VMenu,
    VTextField,
    VTooltip,
} from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { LayoutCommand } from "./workLayout.js";
import type { WorkLayoutHost } from "./workLayoutHost.js";

/**
 * The Layouts menu on the Work strip: arrange this pane, and save, apply, rename,
 * delete or reset named layouts.
 *
 * Every row here is also reachable without a pointer: this whole menu opens from a
 * button in the strip's control row, the same arrangement commands are in each
 * tab's context menu, and the command palette lists them. The menu carries its own
 * filter wired to the regex builder, like every other menu in the application.
 */
const props = defineProps<{
    host: WorkLayoutHost;
    stripId: string;
    /** The strip's active tab, which a split or a move acts on. */
    tabId: string | null;
    /** How many tabs this pane holds, since a lone tab cannot be split away from itself. */
    tabCount: number;
    jobs?: boolean;
}>();

const { t } = useI18n();

const open = ref(false);
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const draftName = ref("");
const renaming = ref<string | null>(null);
const renameDraft = ref("");

interface Row {
    readonly command: LayoutCommand;
    readonly label: string;
    readonly icon: string;
    /** Why the row cannot act right now, or null when it can. */
    readonly unavailable: string | null;
}

const rows = computed<readonly Row[]>(() => {
    const panes = props.host.paneCount;
    const floating = props.host.isFloating(props.stripId);
    const maximised = props.host.isMaximised(props.stripId);
    const needsTabs = t(
        "workLayout.reason.needsTwoTabs",
        "This pane needs at least two tabs to split one away.",
    );
    const needsPanes = t("workLayout.reason.needsTwoPanes", "There is only one pane.");
    const split = (command: LayoutCommand, label: string, icon: string): Row => ({
        command,
        label,
        icon,
        unavailable: props.tabId === null ? needsTabs : props.tabCount < 2 ? needsTabs : null,
    });
    const rowsList: Row[] = [
        split("split-right", t("workLayout.splitRight", "Split this tab to the right"), mdiDockRight),
        split("split-left", t("workLayout.splitLeft", "Split this tab to the left"), mdiDockLeft),
        split("split-above", t("workLayout.splitAbove", "Split this tab above"), mdiDockTop),
        split("split-below", t("workLayout.splitBelow", "Split this tab below"), mdiDockBottom),
        {
            command: "next-pane",
            label: t("workLayout.nextPane", "Move this tab to the next pane"),
            icon: mdiSwapHorizontal,
            unavailable: panes < 2 ? needsPanes : props.tabId === null ? needsTabs : null,
        },
        {
            command: "previous-pane",
            label: t("workLayout.previousPane", "Move this tab to the previous pane"),
            icon: mdiSwapHorizontal,
            unavailable: panes < 2 ? needsPanes : props.tabId === null ? needsTabs : null,
        },
        floating
            ? {
                  command: "dock",
                  label: t("workLayout.dock", "Dock this floating pane back"),
                  icon: mdiDockWindow,
                  unavailable: null,
              }
            : {
                  command: "float",
                  label: t("workLayout.float", "Float this pane"),
                  icon: mdiOpenInNew,
                  unavailable: panes < 2 ? needsPanes : null,
              },
        {
            command: "maximize",
            label: maximised
                ? t("workLayout.restore", "Restore this pane")
                : t("workLayout.maximize", "Maximise this pane"),
            icon: maximised ? mdiWindowRestore : mdiArrowExpandAll,
            unavailable: null,
        },
    ];
    return rowsList;
});

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const visibleRows = computed(() => rows.value.filter((row) => matcher.value.test(row.label)));
const visibleLayouts = computed(() =>
    props.host.layouts.filter((layout) => matcher.value.test(layout.name)),
);
const sample = computed(() =>
    [...rows.value.map((row) => row.label), ...props.host.layouts.map((l) => l.name)].join("\n"),
);

watch(open, (value) => {
    if (value) return;
    query.value = "";
    regexMode.value = false;
    renaming.value = null;
});

function choose(row: Row): void {
    if (row.unavailable !== null) return;
    open.value = false;
    props.host.run(props.stripId, props.tabId, row.command);
}

function save(): void {
    const result = props.host.save(draftName.value);
    if (result === "saved" || result === "replaced") draftName.value = "";
}

function startRename(id: string, name: string): void {
    renaming.value = id;
    renameDraft.value = name;
}

function commitRename(id: string): void {
    if (props.host.rename(id, renameDraft.value)) renaming.value = null;
}

function apply(id: string): void {
    if (props.host.apply(id)) open.value = false;
}
</script>

<template>
    <v-btn
        :icon="mdiViewDashboardOutline"
        :aria-label="t('workLayout.menu', 'Arrange panes and layouts')"
        :aria-expanded="open ? 'true' : 'false'"
        class="mb-tabs-strip__layouts"
        data-tutorial-anchor="work-layouts"
        :color="props.jobs ? 'on-surface-variant' : undefined"
        variant="text"
        size="small"
        density="comfortable"
    >
        <v-icon :icon="mdiViewDashboardOutline" />
        <v-tooltip
            activator="parent"
            location="bottom"
            :text="t('workLayout.menu', 'Arrange panes and layouts')"
        />
        <v-menu
            v-model="open"
            activator="parent"
            :close-on-content-click="false"
            location="bottom end"
            offset="4"
        >
            <div class="mb-tabs-strip__sheet mb-work-layouts">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('workLayout.filter', 'Filter layouts and arrangement commands')"
                    :sample="sample"
                    class="mb-tabs-strip__menu-filter"
                />

                <v-list
                    density="compact"
                    :aria-label="t('workLayout.arrange', 'Arrange this pane')"
                >
                    <v-list-subheader>{{ t("workLayout.arrange", "Arrange this pane") }}</v-list-subheader>
                    <v-list-item
                        v-for="row in visibleRows"
                        :key="row.command"
                        :data-layout-command="row.command"
                        :disabled="row.unavailable !== null"
                        :subtitle="row.unavailable ?? undefined"
                        @click="choose(row)"
                    >
                        <template #prepend>
                            <v-icon :icon="row.icon" size="18" aria-hidden="true" />
                        </template>
                        {{ row.label }}
                    </v-list-item>
                    <p
                        v-if="visibleRows.length === 0 && visibleLayouts.length === 0"
                        class="mb-tabs-strip__menu-empty"
                        role="status"
                    >
                        {{
                            t(
                                "tabs.menu.noMatch",
                                "No command here matches that. Clearing the filter brings them all back.",
                            )
                        }}
                    </p>
                </v-list>

                <v-list
                    density="compact"
                    :aria-label="t('workLayout.saved', 'Saved layouts')"
                >
                    <v-list-subheader>{{ t("workLayout.saved", "Saved layouts") }}</v-list-subheader>
                    <p
                        v-if="props.host.layouts.length === 0"
                        class="mb-tabs-strip__menu-empty"
                        role="status"
                    >
                        {{
                            t(
                                "workLayout.noneSaved",
                                "No layout is saved yet. Arrange the panes, name the arrangement below and save it to bring it back later.",
                            )
                        }}
                    </p>
                    <v-list-item
                        v-for="layout in visibleLayouts"
                        :key="layout.id"
                        :data-layout-id="layout.id"
                    >
                        <template v-if="renaming === layout.id">
                            <v-text-field
                                v-model="renameDraft"
                                density="compact"
                                hide-details
                                :label="t('workLayout.renameLabel', 'New name for this layout')"
                                @keydown.enter.prevent="commitRename(layout.id)"
                                @keydown.esc.stop.prevent="renaming = null"
                            >
                                <template #append-inner>
                                    <v-btn
                                        :icon="mdiCheck"
                                        size="x-small"
                                        variant="text"
                                        :aria-label="t('workLayout.renameCommit', 'Rename')"
                                        @click="commitRename(layout.id)"
                                    />
                                </template>
                            </v-text-field>
                        </template>
                        <template v-else>
                            <v-btn
                                variant="text"
                                class="mb-work-layouts__apply"
                                :aria-label="
                                    t(
                                        'workLayout.apply',
                                        { name: layout.name },
                                        'Apply the layout {name}',
                                    )
                                "
                                @click="apply(layout.id)"
                            >
                                {{ layout.name }}
                            </v-btn>
                            <template #append>
                                <v-btn
                                    :icon="mdiPencil"
                                    size="x-small"
                                    variant="text"
                                    :aria-label="
                                        t(
                                            'workLayout.rename',
                                            { name: layout.name },
                                            'Rename the layout {name}',
                                        )
                                    "
                                    @click="startRename(layout.id, layout.name)"
                                />
                                <ConfigSuperConfirm
                                    :title="
                                        t(
                                            'workLayout.deleteTitle',
                                            { name: layout.name },
                                            'Delete the layout {name}?',
                                        )
                                    "
                                    :action="
                                        t(
                                            'workLayout.deleteAction',
                                            'Removes this saved layout. Your open tabs are not closed.',
                                        )
                                    "
                                    :affected="[layout.name]"
                                    :confirm-label="t('workLayout.deleteGo', 'Delete layout')"
                                    @confirm="props.host.remove(layout.id)"
                                >
                                    <template #activator="{ props: activator }">
                                        <v-btn
                                            v-bind="activator"
                                            :icon="mdiDelete"
                                            size="x-small"
                                            variant="text"
                                            color="error"
                                            :aria-label="
                                                t(
                                                    'workLayout.delete',
                                                    { name: layout.name },
                                                    'Delete the layout {name}',
                                                )
                                            "
                                        />
                                    </template>
                                </ConfigSuperConfirm>
                            </template>
                        </template>
                    </v-list-item>
                </v-list>

                <div class="mb-work-layouts__save">
                    <v-text-field
                        v-model="draftName"
                        density="compact"
                        hide-details
                        :label="t('workLayout.nameLabel', 'Name for this layout')"
                        @keydown.enter.prevent="save"
                    />
                    <v-btn variant="tonal" size="small" @click="save">
                        {{ t("workLayout.save", "Save layout") }}
                    </v-btn>
                    <v-btn
                        variant="text"
                        size="small"
                        :prepend-icon="mdiRestore"
                        @click="props.host.reset()"
                    >
                        {{ t("workLayout.reset", "Reset layout") }}
                    </v-btn>
                </div>
            </div>
        </v-menu>
    </v-btn>
</template>

<style>
.mb-work-layouts {
    min-width: 280px;
    max-width: min(420px, 92vw);
    max-height: min(70vh, 640px);
    overflow: auto;
}

.mb-work-layouts__save {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 12px 12px;
}

.mb-work-layouts__save > .v-input {
    flex: 1 1 140px;
}

.mb-work-layouts__apply {
    max-width: 100%;
    justify-content: flex-start;
    text-transform: none;
}
</style>
