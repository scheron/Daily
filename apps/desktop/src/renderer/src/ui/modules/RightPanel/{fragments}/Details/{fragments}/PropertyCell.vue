<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"

const props = defineProps<{
  label: string
  isEmpty?: boolean
}>()

const emit = defineEmits<{click: []}>()

const cellVariant = computed(() => (props.isEmpty ? "cell-muted" : "cell"))
</script>

<template>
  <BaseButton :variant="cellVariant" class="w-full min-w-0" @click="emit('click')">
    <slot name="icon" />
    <span class="min-w-0 flex-1 truncate text-left leading-none">{{ label }}</span>
  </BaseButton>
</template>
