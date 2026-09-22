<script setup lang="ts">
import {useVModel} from "@vueuse/core"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"

const props = defineProps<{
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const value = useVModel(props, "modelValue", emit)

function onClear() {
  value.value = ""
}
</script>

<template>
  <div class="relative w-full">
    <BaseInput v-model="value" placeholder="Search..." focus-on-mount />

    <div class="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
      <div v-if="loading" class="flex size-5 items-center">
        <BaseIcon name="spinner" class="text-base-content/50 size-4 animate-spin" />
      </div>

      <BaseButton v-if="modelValue && !loading" variant="ghost" icon="x-mark" size="xs" @click="onClear" />
    </div>
  </div>
</template>
