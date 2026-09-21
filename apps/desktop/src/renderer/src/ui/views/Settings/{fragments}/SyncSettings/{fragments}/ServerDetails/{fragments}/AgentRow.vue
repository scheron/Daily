<script setup lang="ts">
import {toDateLabel, toRelativeTime} from "@daily/std"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {toAgentIconName} from "@/utils/agents/toAgentIconName"

import type {ServerAgentView} from "@daily/protocol"

const props = defineProps<{agent: ServerAgentView}>()

const syncServerStore = useSyncServerStore()

async function onRevoke() {
  try {
    await syncServerStore.revokeAgent(props.agent.id)
  } catch (error) {
    console.error("Failed to revoke the agent:", error)
  }
}
</script>

<template>
  <tr>
    <td class="border-base-300/45 border-t py-[5px] pr-2.5 pl-[22px] text-[13px]">
      <div class="flex items-center gap-2">
        <span class="text-base-content/30">↳</span>
        <BaseIcon :name="toAgentIconName(agent.name)" class="size-4 shrink-0" />
        <span class="text-base-content/85">{{ agent.name }}</span>
      </div>
    </td>
    <td class="border-base-300/45 text-base-content/60 border-t py-[5px] pr-2.5 text-xs">
      {{ agent.lastUsedAt ? toRelativeTime(agent.lastUsedAt) : "—" }}
    </td>
    <td class="border-base-300/45 text-base-content/60 border-t py-[5px] pr-2.5 text-xs">{{ toDateLabel(agent.connectedAt, {short: true}) }}</td>
    <td class="border-base-300/45 border-t py-[5px] pr-0 text-right">
      <div class="flex h-8 items-center justify-end">
        <ConfirmPopup
          title="Revoke this agent?"
          message="It will lose access to Daily until it is connected again."
          confirm-text="Revoke"
          cancel-text="Cancel"
          position="end"
          @confirm="onRevoke"
        >
          <template #trigger="{show}">
            <BaseButton variant="error-ghost" @click="show">Revoke</BaseButton>
          </template>
        </ConfirmPopup>
      </div>
    </td>
  </tr>
</template>
