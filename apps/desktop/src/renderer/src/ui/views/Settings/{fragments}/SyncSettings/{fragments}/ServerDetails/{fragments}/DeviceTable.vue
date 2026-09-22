<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {toDateLabel, toRelativeTime} from "@daily/std"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import AgentRow from "./AgentRow.vue"

import type {ServerAgentView, ServerDeviceView} from "@daily/protocol"

const props = defineProps<{devices: ServerDeviceView[]; agents: ServerAgentView[]}>()

const syncServerStore = useSyncServerStore()

function lastSeenLabel(device: ServerDeviceView): string {
  if (!device.lastSeenAt) return "—"
  return toRelativeTime(device.lastSeenAt)
}

function agentsOf(deviceId: string): ServerAgentView[] {
  return props.agents.filter((agent) => agent.deviceId === deviceId)
}

async function onRevoke(deviceId: string) {
  try {
    await syncServerStore.revokeDevice(deviceId)
  } catch (error) {
    console.error("Failed to revoke the device:", error)
    toasts.error("Failed to revoke device")
  }
}
</script>

<template>
  <table class="w-full border-collapse">
    <thead>
      <tr>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Device · agent</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Last seen</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Added</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="device in devices" :key="device.id">
        <tr>
          <td class="border-base-300 border-t py-[9px] pr-2.5 text-[13px]">
            <div class="flex items-center gap-2">
              <BaseIcon name="desktop" class="text-base-content/45 size-4 shrink-0" />
              <span class="text-base-content">{{ device.name }}</span>
              <span v-if="device.isThisMac" class="text-accent bg-accent/14 rounded px-1.5 py-1 text-[10px] font-medium leading-none">
                This Mac
              </span>
            </div>
          </td>
          <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">{{ lastSeenLabel(device) }}</td>
          <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">{{ toDateLabel(device.addedAt, {short: true}) }}</td>
          <td class="border-base-300 border-t py-[9px] pr-0 text-right">
            <div class="flex h-8 items-center justify-end">
              <ConfirmPopup
                v-if="!device.isThisMac"
                title="Revoke this Mac?"
                message="It will stop syncing until it is added again."
                confirm-text="Revoke"
                cancel-text="Cancel"
                position="end"
                @confirm="onRevoke(device.id)"
              >
                <template #trigger="{show}">
                  <BaseButton variant="error-ghost" @click="show">Revoke</BaseButton>
                </template>
              </ConfirmPopup>
            </div>
          </td>
        </tr>
        <AgentRow v-for="agent in agentsOf(device.id)" :key="agent.id" :agent="agent" />
      </template>
    </tbody>
  </table>
</template>
