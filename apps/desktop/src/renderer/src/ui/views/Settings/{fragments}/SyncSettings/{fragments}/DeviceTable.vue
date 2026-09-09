<script setup lang="ts">
import {toDateLabel, toRelativeTime} from "@daily/std"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import type {ServerDeviceView} from "@daily/protocol"

defineProps<{devices: ServerDeviceView[]}>()

const syncServerStore = useSyncServerStore()

function lastSeenLabel(device: ServerDeviceView): string {
  if (device.revokedAt || !device.lastSeenAt) return "—"
  return toRelativeTime(device.lastSeenAt)
}

async function onRevoke(deviceId: string) {
  try {
    await syncServerStore.revokeDevice(deviceId)
  } catch (error) {
    console.error("Failed to revoke the device:", error)
  }
}
</script>

<template>
  <table class="mt-1.5 w-full border-collapse">
    <thead>
      <tr>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Device</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Last seen</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Added</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="device in devices" :key="device.id" :class="device.revokedAt ? 'opacity-75' : ''">
        <td class="border-base-300 border-t py-[9px] pr-2.5 text-[13px]">
          <div class="flex items-center gap-2">
            <span class="size-2 shrink-0 rounded-full" :class="device.revokedAt ? 'bg-base-content/30' : 'bg-success'" />
            <span class="text-base-content">{{ device.name }}</span>
            <span v-if="device.isThisMac" class="text-accent bg-accent/14 rounded px-1.5 py-1 text-[10px] font-medium leading-none"> This Mac </span>
          </div>
        </td>
        <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">{{ lastSeenLabel(device) }}</td>
        <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">{{ toDateLabel(device.addedAt, {short: true}) }}</td>
        <td class="border-base-300 border-t py-[9px] pr-0 text-right">
          <div class="flex h-8 items-center justify-end">
            <span
              v-if="device.revokedAt"
              class="text-warning bg-warning/14 inline-flex items-center rounded-full border-2 border-transparent px-3 py-1.5 text-sm"
            >
              Revoked
            </span>

            <ConfirmPopup
              v-else-if="!device.isThisMac"
              title="Revoke this Mac?"
              message="It will stop syncing until it is added again."
              confirm-text="Revoke"
              cancel-text="Cancel"
              position="end"
              @confirm="onRevoke(device.id)"
            >
              <template #trigger="{show}">
                <BaseButton variant="ghost" size="sm" class="text-error hover:bg-error/10" @click="show">Revoke</BaseButton>
              </template>
            </ConfirmPopup>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
