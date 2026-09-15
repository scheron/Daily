<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {BaseModal} from "@/ui/base/BaseModal"
import EnrollmentCode from "@/ui/common/sync/EnrollmentCode.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {PendingApprovalView} from "@daily/protocol"

defineProps<{
  request: PendingApprovalView
}>()

defineEmits<{
  approve: []
  deny: []
  close: []
}>()

function getNetworkBadgeClasses(isPrivate: boolean) {
  return cn("rounded px-2 py-1 text-xs font-medium", isPrivate ? "text-success bg-success/14" : "text-warning bg-warning/14")
}
</script>

<template>
  <BaseModal title="Approve device" container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <div class="flex items-center gap-2.5">
      <BaseIcon name="cloud" class="text-accent size-7 shrink-0" />
      <h3 class="text-base-content text-lg font-semibold">A device wants to sync</h3>
    </div>
    <p class="text-base-content/70 mt-1.5 text-xs leading-normal">
      Compare these with what the other Mac is showing. If anything does not match, decline.
    </p>

    <div class="-mx-5 my-[18px]">
      <EnrollmentCode :code="request.code" hint="Match this on the other Mac" />
    </div>

    <div class="flex justify-between gap-10">
      <div>
        <div class="text-base-content/50 text-xs tracking-[0.06em] uppercase">Device</div>
        <div class="text-base-content mt-1 text-sm font-medium">{{ request.deviceName }}</div>
      </div>
      <div v-if="request.requestedFrom" class="text-right">
        <div class="text-base-content/50 text-xs tracking-[0.06em] uppercase">Requested from</div>
        <div class="mt-1 flex items-center justify-end gap-2">
          <span class="text-base-content font-mono text-sm font-medium">{{ request.requestedFrom.address }}</span>
          <span :class="getNetworkBadgeClasses(request.requestedFrom.isPrivate)">
            {{ request.requestedFrom.isPrivate ? "Your network" : "Outside your network" }}
          </span>
        </div>
      </div>
    </div>

    <div class="mt-[18px] flex gap-2">
      <BaseButton variant="ghost" class="text-error hover:bg-error/10 h-8 flex-1 text-sm" @click="$emit('deny')">Decline</BaseButton>
      <BaseButton variant="primary" class="h-8 flex-1 text-sm" @click="$emit('approve')">Approve</BaseButton>
    </div>
  </BaseModal>
</template>
