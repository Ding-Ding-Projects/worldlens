<script setup lang="ts">
import { computed, ref } from "vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";

const props = defineProps<{
    modelValue: string;
    label: string;
    options: readonly { id: string; label: string }[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const query = ref("");
const regex = ref(false);
const flags = ref("im");
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const visible = computed(() =>
    props.options.filter(
        (option) => !matcher.value.active || matcher.value.test(`${option.id}\n${option.label}`),
    ),
);
</script>
<template>
    <div class="mb-runtime-picker">
        <ConfigSearchField
            v-model="query"
            v-model:regex="regex"
            v-model:flags="flags"
            :label="`Find ${props.label}`"
            :sample="props.options.map((option) => `${option.id} ${option.label}`).join('\n')"
            :summary="matcher.error === null ? `${visible.length} option(s)` : 'Invalid pattern'"
        />
        <label
            >{{ props.label }}
            <select
                :value="props.modelValue"
                @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
            >
                <option v-for="option in visible" :key="option.id" :value="option.id">
                    {{ option.label }}
                </option>
                <option v-if="visible.length === 0" value="" disabled>No matching option</option>
            </select>
        </label>
    </div>
</template>
