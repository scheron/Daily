<script setup lang="ts">
import {computed} from "vue"

import {toDayLabel} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{date?: string; milestoneName?: string}>()
const emit = defineEmits<{createTask: []}>()

const subject = computed(() => props.milestoneName ?? (props.date ? toDayLabel(props.date) : null))
</script>

<template>
  <div class="flex size-full flex-1 flex-col items-center justify-center p-8 text-center">
    <div class="bg-accent/20 mb-6 rounded-full p-4">
      <BaseIcon name="empty" class="text-accent size-12" />
    </div>

    <h3 class="text-base-content mb-2 flex flex-col text-xl">
      <b v-if="subject" class="text-accent">{{ subject }}</b>
      <span> No <b v-if="subject" class="text-accent">any</b> tasks </span>
    </h3>

    <BaseButton variant="primary" icon="plus" class="mt-8" @click="emit('createTask')"> Create </BaseButton>
  </div>
</template>
