<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VCheckbox, VChip, VDialog, VList, VListItem } from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { lockSearchText, type LockRecord } from "./lockModel.js";
import LockWizard from "./LockWizard.vue";
import { useLockStore } from "./useLocks.js";

/**
 * Every lock on this computer, in one enumerable, searchable, bulk-manageable list.
 *
 * ## Why locks are a list at all
 *
 * Because there is no master credential. A person with fifteen locks has fifteen separate
 * credentials, and the only thing that makes that liveable rather than maddening is being
 * able to see the whole set at once, find one by name, and remove several in a go. A design
 * where each lock is only reachable from the element it guards would be fine right up until
 * somebody forgot which element they locked.
 *
 * ## What this list can and cannot show
 *
 * It shows what each lock guards, how it opens, and whether it is open right now. It cannot
 * show a credential, because no record holds one - see `lockModel.ts`. So there is nothing
 * here to redact and nothing to leak, which is the property that lets this surface exist at
 * all.
 *
 * ## Removing is the one destructive thing here, and it does not go through the two-key gate
 *
 * Deliberately. Removing a toy lock destroys no user content whatsoever - it takes away a
 * speed bump the person put in front of themselves, and the element behind it is untouched.
 * Putting the full destructive-action ceremony in front of that would teach people to click
 * through the gate, which is exactly how the gate stops working for the operations that
 * genuinely need it. The bulk removal still previews its count first, because a person
 * should know they are about to remove nine rather than one.
 */
const { t } = useI18n();
const store = useLockStore();

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const selected = ref(new Set<string>());
const confirming = ref(false);

/**
 * The lock whose credential is being replaced, or null.
 *
 * The list is the management surface for locks made anywhere, including on an element that
 * is not currently on screen - so changing a credential has to be reachable here and not
 * only from the element's own context menu, which needs the element to be visible to open
 * at all.
 */
const changing = ref<LockRecord | null>(null);

async function onChanged(): Promise<void> {
    changing.value = null;
    await store.load();
}

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const listed = computed(() =>
    store.locks.value.filter((lock) => matcher.value.test(lockSearchText(lock))),
);

const sample = computed(() => store.locks.value.map(lockSearchText).join("\n"));

const summary = computed(() =>
    matcher.value.error !== null
        ? t("locks.list.badPattern", "The pattern is not valid, so nothing is listed.")
        : matcher.value.active
          ? t(
                "locks.list.summary",
                { shown: listed.value.length, total: store.locks.value.length },
                "{shown} of {total} locks match.",
            )
          : "",
);

function toggle(id: string): void {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
}

/**
 * Select-all over what is *listed*, and the label says so.
 *
 * "Select all" that silently reaches past an active filter is the bulk-action failure this
 * application refuses everywhere: the count previewed and the set acted on have to be the
 * same set, and the person has to be able to tell which one it is.
 */
function selectAllListed(): void {
    selected.value = new Set(listed.value.map((lock) => lock.id));
}

function selectNone(): void {
    selected.value = new Set();
}

function invertSelection(): void {
    const next = new Set<string>();
    for (const lock of listed.value) if (!selected.value.has(lock.id)) next.add(lock.id);
    selected.value = next;
}

const selectedCount = computed(() => selected.value.size);

async function removeSelected(): Promise<void> {
    for (const id of [...selected.value]) await store.remove(id);
    selected.value = new Set();
    confirming.value = false;
}

function methodLabel(lock: LockRecord): string {
    return lock.method === "password"
        ? t("locks.list.byPassword", "Password")
        : t("locks.list.byAuthenticator", "Authenticator");
}

function durationLabel(lock: LockRecord): string {
    switch (lock.duration.kind) {
        case "surface":
            return t("locks.duration.surface", "This surface only");
        case "session":
            return t("locks.duration.session", "Until the app closes");
        case "minutes":
            return t(
                "locks.list.forMinutes",
                { minutes: lock.duration.minutes },
                "For {minutes} minutes",
            );
    }
}

/** True while this lock is currently open. Read live, so it follows an expiry. */
function isOpen(lock: LockRecord): boolean {
    return store.open.value.includes(lock.id);
}
</script>

<template>
    <section class="mb-lock-list" data-test="lock-list">
        <h2 class="mb-page-title">{{ t("locks.list.title", "Locks") }}</h2>
        <p class="mb-lede">
            {{
                t(
                    "locks.list.lede",
                    "Every lock you have put on this computer. Each one has its own credential and opens nothing else; there is no master password. All of them are for fun, and all of them are cleared at once by deleting this application's local data folder.",
                )
            }}
        </p>

        <VAlert
            v-if="!store.canList"
            type="info"
            variant="tonal"
            density="compact"
            data-test="lock-list-unsupported"
        >
            {{
                t(
                    "locks.list.unsupported",
                    "This build cannot keep locks, so there is no list to show. The desktop application is what stores them.",
                )
            }}
        </VAlert>

        <VAlert
            v-else-if="store.failure.value !== null"
            type="warning"
            variant="tonal"
            density="compact"
            data-test="lock-list-failure"
            role="alert"
        >
            {{
                t(
                    "locks.list.failed",
                    { message: store.failure.value },
                    "The list of locks could not be read, so this is not an empty list - it is an unknown one: {message}",
                )
            }}
        </VAlert>

        <template v-else>
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('locks.list.search', 'Search locks')"
                :sample="sample"
                :summary="summary"
            />

            <p
                v-if="store.locks.value.length === 0"
                class="text-medium-emphasis mt-3"
                data-test="lock-list-empty"
            >
                {{ t("locks.list.empty", "Nothing on this computer is locked.") }}
            </p>

            <template v-else>
                <div class="d-flex ga-2 flex-wrap align-center mt-3">
                    <VBtn
                        size="small"
                        variant="text"
                        data-test="lock-select-all"
                        @click="selectAllListed"
                    >
                        {{
                            t(
                                "locks.list.selectListed",
                                { count: listed.length },
                                "Select the {count} shown",
                            )
                        }}
                    </VBtn>
                    <VBtn
                        size="small"
                        variant="text"
                        data-test="lock-select-invert"
                        @click="invertSelection"
                    >
                        {{ t("locks.list.invert", "Invert within those shown") }}
                    </VBtn>
                    <VBtn
                        v-if="selectedCount > 0"
                        size="small"
                        variant="text"
                        data-test="lock-select-none"
                        @click="selectNone"
                    >
                        {{ t("locks.list.selectNone", "Select none") }}
                    </VBtn>
                    <VBtn
                        v-if="selectedCount > 0"
                        size="small"
                        color="error"
                        variant="tonal"
                        data-test="lock-remove-selected"
                        @click="confirming = true"
                    >
                        {{
                            t(
                                "locks.list.removeSelected",
                                { count: selectedCount },
                                "Remove {count} locks",
                            )
                        }}
                    </VBtn>
                </div>

                <!--
                    The count is previewed before anything is removed. Not the two-key gate:
                    removing a toy lock destroys no content, and putting full ceremony in
                    front of it teaches people to click through the gate that guards the
                    operations which genuinely need it.
                -->
                <VAlert
                    v-if="confirming"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-2"
                    data-test="lock-remove-confirm"
                >
                    {{
                        t(
                            "locks.list.confirmRemove",
                            { count: selectedCount },
                            "Remove {count} locks? The elements behind them are not touched - only the locks go.",
                        )
                    }}
                    <div class="d-flex ga-2 mt-2">
                        <VBtn
                            size="small"
                            color="error"
                            data-test="lock-remove-go"
                            @click="removeSelected"
                        >
                            {{ t("locks.list.confirmYes", "Remove them") }}
                        </VBtn>
                        <VBtn size="small" variant="text" @click="confirming = false">
                            {{ t("locks.list.confirmNo", "Keep them") }}
                        </VBtn>
                    </div>
                </VAlert>

                <VList density="compact" class="mt-2">
                    <VListItem v-for="lock in listed" :key="lock.id" data-test="lock-row">
                        <template #prepend>
                            <VCheckbox
                                :model-value="selected.has(lock.id)"
                                :aria-label="
                                    t(
                                        'locks.list.selectOne',
                                        { label: lock.target.label },
                                        'Select the lock on {label}',
                                    )
                                "
                                density="compact"
                                hide-details
                                data-test="lock-row-select"
                                @update:model-value="toggle(lock.id)"
                            />
                        </template>
                        <VListItem-title>{{ lock.target.label }}</VListItem-title>
                        <VListItem-subtitle>
                            {{ lock.target.surface }} · {{ lock.target.path }}
                        </VListItem-subtitle>
                        <template #append>
                            <div class="d-flex ga-2 align-center flex-wrap">
                                <VChip size="x-small" variant="outlined">{{
                                    methodLabel(lock)
                                }}</VChip>
                                <VChip size="x-small" variant="outlined">{{
                                    durationLabel(lock)
                                }}</VChip>
                                <VChip
                                    size="x-small"
                                    :color="isOpen(lock) ? 'success' : undefined"
                                    variant="tonal"
                                    data-test="lock-row-state"
                                >
                                    {{
                                        isOpen(lock)
                                            ? t("locks.list.open", "Open now")
                                            : t("locks.list.closed", "Locked")
                                    }}
                                </VChip>
                                <VBtn
                                    v-if="isOpen(lock)"
                                    size="small"
                                    variant="text"
                                    data-test="lock-row-relock"
                                    @click="store.relock(lock.id)"
                                >
                                    {{ t("locks.list.relock", "Lock again") }}
                                </VBtn>
                                <VBtn
                                    size="small"
                                    variant="text"
                                    data-test="lock-row-change"
                                    @click="changing = lock"
                                >
                                    {{ t("locks.list.change", "Change") }}
                                </VBtn>
                                <VBtn
                                    size="small"
                                    variant="text"
                                    data-test="lock-row-remove"
                                    @click="store.remove(lock.id)"
                                >
                                    {{ t("locks.list.remove", "Remove") }}
                                </VBtn>
                            </div>
                        </template>
                    </VListItem>
                </VList>

                <p
                    v-if="listed.length === 0"
                    class="text-medium-emphasis mt-2"
                    data-test="lock-list-no-match"
                >
                    {{ t("locks.list.noMatch", "No lock matches that search.") }}
                </p>
            </template>
        </template>

        <!--
            The change wizard, in a dialog rather than anchored, because this surface is a
            list of locks on elements that are mostly somewhere else entirely - there is no
            element on this screen for it to sit beside.
        -->
        <VDialog
            :model-value="changing !== null"
            max-width="520"
            @update:model-value="(open: boolean) => !open && (changing = null)"
        >
            <LockWizard
                v-if="changing !== null"
                :target="changing.target"
                :changing="changing.id"
                @created="onChanged"
                @cancel="changing = null"
            />
        </VDialog>
    </section>
</template>

<style scoped>
.mb-lock-list {
    padding: 1rem;
}
</style>
