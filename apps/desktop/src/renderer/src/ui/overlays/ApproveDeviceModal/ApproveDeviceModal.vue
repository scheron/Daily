<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import BaseModal from "@/ui/base/BaseModal.vue"
import ModalHeader from "@/ui/common/(headers)/ModalHeader.vue"
import EnrollmentCode from "@/ui/common/(misc)/EnrollmentCode.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {PendingApprovalView} from "@daily/protocol"

const props = defineProps<{
  request: PendingApprovalView
}>()

defineEmits<{
  approve: []
  deny: []
  close: []
}>()

const networkBadgeClass = computed(() =>
  cn("rounded px-2 py-1 text-xs font-medium", [props.request.requestedFrom?.isPrivate ? "text-success bg-success/14" : "text-warning bg-warning/14"]),
)
</script>

<template>
  <BaseModal container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <template #header>
      <ModalHeader title="Approve device" @close="$emit('close')" />
    </template>

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
        <div class="text-base-content/50 text-xs uppercase tracking-[0.06em]">Device</div>
        <div class="text-base-content mt-1 text-sm font-medium">{{ request.deviceName }}</div>
      </div>
      <div v-if="request.requestedFrom" class="text-right">
        <div class="text-base-content/50 text-xs uppercase tracking-[0.06em]">Requested from</div>
        <div class="mt-1 flex items-center justify-end gap-2">
          <span class="text-base-content font-mono text-sm font-medium">{{ request.requestedFrom.address }}</span>
          <span :class="networkBadgeClass">
            {{ request.requestedFrom.isPrivate ? "Your network" : "Outside your network" }}
          </span>
        </div>
      </div>
    </div>

    <div class="mt-[18px] flex gap-2">
      <BaseButton variant="error-ghost" size="sm" class="flex-1" @click="$emit('deny')">Decline</BaseButton>
      <BaseButton variant="primary" size="sm" class="flex-1" @click="$emit('approve')">Approve</BaseButton>
    </div>
  </BaseModal>
</template>
