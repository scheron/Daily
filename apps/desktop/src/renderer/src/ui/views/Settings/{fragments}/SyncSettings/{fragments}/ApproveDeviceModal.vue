<script setup lang="ts">
import BaseButton from "../../../../../base/BaseButton"
import BaseIcon from "../../../../../base/BaseIcon"
import {BaseModal} from "../../../../../base/BaseModal"

import type {PendingApprovalView} from "@daily/protocol"

defineProps<{
  request: PendingApprovalView
}>()

defineEmits<{
  approve: []
  deny: []
  close: []
}>()
</script>

<template>
  <BaseModal hide-header container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <div class="mb-2 flex items-center gap-3">
      <BaseIcon name="cloud" class="text-accent size-7" />
      <h2 class="text-base-content text-lg font-semibold">A device wants to sync</h2>
    </div>
    <p class="text-base-content/70 mt-1 text-sm">Compare these with what the other Mac is showing. If either does not match, decline.</p>

    <div class="border-base-300 bg-base-200/40 mt-4 flex flex-col gap-3 rounded-lg border p-4">
      <div class="flex flex-col gap-1">
        <span class="text-base-content/50 text-xs tracking-wide uppercase">Device</span>
        <span class="text-base-content text-xl font-semibold">{{ request.deviceName }}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-base-content/50 text-xs tracking-wide uppercase">Code</span>
        <span class="text-base-content font-mono text-xl font-semibold tracking-widest">{{ request.code }}</span>
      </div>
    </div>

    <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BaseButton variant="ghost" class="text-error hover:bg-error/10 h-8 px-3 text-sm" @click="$emit('deny')">Decline</BaseButton>
      <BaseButton variant="primary" class="h-8 px-3 text-sm" @click="$emit('approve')">Approve</BaseButton>
    </div>
  </BaseModal>
</template>
