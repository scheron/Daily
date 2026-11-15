<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import BaseModal from "@/ui/base/BaseModal.vue"
import ModalHeader from "@/ui/common/(headers)/ModalHeader.vue"
import EnrollmentCode from "@/ui/common/(misc)/EnrollmentCode.vue"

import type {PendingAgentRequestView} from "@daily/protocol"

defineProps<{
  request: PendingAgentRequestView
  deviceName: string
}>()

defineEmits<{
  approve: []
  deny: []
  close: []
}>()
</script>

<template>
  <BaseModal container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <template #header>
      <ModalHeader title="Approve agent" @close="$emit('close')" />
    </template>

    <div class="flex items-center gap-2.5">
      <BaseIcon name="ai" class="text-accent size-7 shrink-0" />
      <h3 class="text-base-content text-lg font-semibold">An agent wants access</h3>
    </div>
    <p class="text-base-content/70 mt-1.5 text-xs leading-normal">
      Compare the code with the browser page that just opened. If it does not match, or you did not start this, decline.
    </p>

    <div class="-mx-5 my-[18px]">
      <EnrollmentCode :code="request.code" hint="Match this on the browser page" />
    </div>

    <div class="flex justify-between gap-10">
      <div class="min-w-0">
        <div class="text-base-content/65 text-xs">Name supplied by the agent</div>
        <bdi class="text-base-content mt-1 block break-words text-sm font-medium">{{ request.agentName }}</bdi>
      </div>
      <div class="min-w-0 text-right">
        <div class="text-base-content/65 text-xs">Browser returns to</div>
        <bdi class="text-base-content mt-1 block break-words font-mono text-sm font-medium">{{ request.returnsTo }}</bdi>
      </div>
    </div>

    <div v-if="request.isLocalProgram" class="text-warning bg-warning/10 mt-3.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-normal">
      <BaseIcon name="alert-triangle" class="mt-0.5 size-3.5 shrink-0" />
      <span>The browser will return to a program on its computer. Approve only if you just started this connection.</span>
    </div>

    <div class="mt-3.5">
      <div class="text-base-content/50 text-xs uppercase tracking-[0.06em]">Belongs to</div>
      <div class="text-base-content mt-1 flex items-center gap-1.5 text-sm font-medium">
        {{ deviceName }}
        <span class="text-accent bg-accent/14 rounded px-1.5 py-1 text-[10px] font-medium leading-none">This Mac</span>
      </div>
    </div>

    <div class="mt-[18px] flex gap-2">
      <BaseButton variant="error-ghost" size="sm" class="flex-1" @click="$emit('deny')">Decline</BaseButton>
      <BaseButton variant="primary" size="sm" class="flex-1" @click="$emit('approve')">Approve</BaseButton>
    </div>
  </BaseModal>
</template>
