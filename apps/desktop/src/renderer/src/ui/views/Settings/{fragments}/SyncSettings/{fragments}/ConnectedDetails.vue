<script setup lang="ts">
import {toDateLabel} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"

import type {ServerBindingView} from "@daily/protocol"

defineProps<{binding: ServerBindingView}>()
</script>

<template>
  <div class="pt-1.5">
    <div class="flex items-center gap-2.5">
      <BaseIcon name="check-circle" class="text-success size-7 shrink-0" />
      <h3 class="text-base-content text-lg font-semibold">Connected</h3>
    </div>

    <p class="text-base-content/70 mt-1.5 text-xs leading-normal">This Mac syncs with {{ binding.serverName }}.</p>

    <div class="bg-base-300 -mx-6 my-4 h-px" />

    <div class="flex gap-10">
      <div v-if="binding.approvedBy">
        <div class="text-base-content/50 text-xs uppercase tracking-[0.06em]">Approved by</div>
        <div class="text-base-content mt-1 text-sm font-medium">{{ binding.approvedBy }}</div>
        <div class="text-base-content/55 mt-0.5 text-xs">{{ toDateLabel(binding.boundAt, {short: true}) }}</div>
      </div>
      <div>
        <div class="text-base-content/50 text-xs uppercase tracking-[0.06em]">This Mac</div>
        <div class="text-base-content mt-1 text-sm font-medium">{{ binding.deviceName }}</div>
        <div class="text-base-content/55 mt-0.5 text-xs">Managed from the Mac that set up this server</div>
      </div>
    </div>
  </div>
</template>
