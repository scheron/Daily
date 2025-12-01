<script setup lang="ts">
import {computed} from "vue"
import {useStorageStore} from "@/stores/storage.store"
import {toLocaleTime} from "@shared/utils/date/formatters"

import type {IconName} from "@/ui/base/BaseIcon"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

const storageStore = useStorageStore()

const statusInfo = computed<{
  icon: IconName
  text: string
  tooltip: string
  color: string
}>(() => {
  if (storageStore.status === "syncing") return {icon: "refresh", text: "Syncing...", tooltip: "Syncing...", color: "text-accent/80"}
  if (storageStore.status === "error") return {icon: "cloud-alert", text: "Error", tooltip: "Sync error", color: "text-error"}
  if (storageStore.status === "inactive") return {icon: "cloud-off", text: "iCloud Sync", tooltip: "Sync is inactive", color: "text-base-content/30"}

  return {
    icon: "cloud",
    text: "iCloud Sync",
    tooltip: `Last sync: ${toLocaleTime(storageStore.lastSyncAt!)}`,
    color: "text-success",
  }
})

async function onToggleAutoSync(value: boolean) {
  if (value) {
    await storageStore.activateSync()
  } else {
    await storageStore.deactivateSync()
  }
}

async function onForceSync() {
  await storageStore.forceSync()
}
</script>

<template>
  <BasePopup position="start" hide-header>
    <template #trigger="{toggle}">
      <BaseButton
        v-tooltip="statusInfo.tooltip"
        variant="ghost"
        class="px-1 py-0.5"
        :class="statusInfo.color"
        style="-webkit-app-region: no-drag"
        @click="toggle"
      >
        <BaseIcon :name="statusInfo.icon" class="size-5" :class="{'animate-spin': storageStore.status === 'syncing'}" />
      </BaseButton>
    </template>

    <div class="flex w-56 flex-col gap-2.5 p-2.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <BaseIcon
            :name="statusInfo.icon"
            class="size-4 shrink-0"
            :class="[statusInfo.color, {'animate-spin': storageStore.status === 'syncing'}]"
          />
          <span class="truncate text-xs" :class="statusInfo.color"> {{ statusInfo.text }} </span>
        </div>

        <BaseSwitch
          :modelValue="['active', 'syncing'].includes(storageStore.status)"
          :disabled="storageStore.status === 'syncing'"
          @update:modelValue="onToggleAutoSync"
        />
      </div>

      <template v-if="['active'].includes(storageStore.status)">
        <div class="text-base-content/50 mt-1 flex items-center justify-between gap-1.5 text-xs">
          <span>
            <BaseIcon name="stopwatch" class="size-4 shrink-0" />
            Last sync:
          </span>
          {{ storageStore.lastSyncAt ? toLocaleTime(storageStore.lastSyncAt!) : "-" }}
        </div>

        <BaseButton
          variant="outline"
          size="sm"
          class="border-accent text-accent mt-0.5 w-full text-xs"
          icon-class="size-4"
          icon="refresh"
          @click="onForceSync"
        >
          Sync Now
        </BaseButton>
      </template>
    </div>
  </BasePopup>
</template>
