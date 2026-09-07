<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

import type {PendingToolConfirmation} from "@shared/types/ai"

defineProps<{
  confirmation: PendingToolConfirmation
  busy?: boolean
}>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="bg-warning/10 border-warning/40 rounded-lg border px-3 py-2.5">
    <div class="flex items-start gap-2">
      <BaseIcon name="alert-triangle" class="text-warning mt-0.5 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <h4 class="text-base-content text-sm font-medium">{{ confirmation.title }}</h4>
        <p class="text-base-content/70 mt-1 text-xs">{{ confirmation.summary }}</p>
        <ul v-if="confirmation.details && confirmation.details.length" class="text-base-content/50 mt-1.5 space-y-0.5 text-[11px]">
          <li v-for="(detail, idx) in confirmation.details" :key="idx" class="font-mono">{{ detail }}</li>
        </ul>
        <div class="mt-2.5 flex items-center gap-2">
          <BaseButton variant="primary" size="sm" :disabled="busy" @click="$emit('confirm')">Confirm</BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="busy" @click="$emit('cancel')">Cancel</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
