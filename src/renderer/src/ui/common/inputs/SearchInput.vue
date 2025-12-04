<script setup lang="ts">
import {useVModel} from "@vueuse/core"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"

const props = withDefaults(
  defineProps<{
    modelValue: string
    loading?: boolean
    placeholder?: string
    focusOnMount?: boolean
  }>(),
  {
    placeholder: "Search...",
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: string]
  clear: [void]
}>()

const value = useVModel(props, "modelValue", emit)

function onClear() {
  value.value = ""
  emit("clear")
}
</script>

<template>
  <div class="relative w-full">
    <BaseInput v-model="value" :placeholder="placeholder" :loading="loading" :focus-on-mount="focusOnMount" @clear="onClear" />

    <div class="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
      <div v-if="loading" class="flex size-5 items-center">
        <BaseIcon name="refresh" class="text-base-content/50 size-4 animate-spin" />
      </div>

      <BaseButton v-if="modelValue && !loading" variant="ghost" icon="x-mark" class="size-5" icon-class="size-4" @click="onClear" />
    </div>
  </div>
</template>
