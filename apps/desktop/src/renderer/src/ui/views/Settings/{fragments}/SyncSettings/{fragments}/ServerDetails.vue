<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"

import {useStorageStore} from "../../../../../../stores/storage.store"
import {useSyncServerStore} from "../../../../../../stores/syncServer.store"
import BaseButton from "../../../../../base/BaseButton"
import BaseIcon from "../../../../../base/BaseIcon"
import SettingRow from "../../SettingRow.vue"

const storageStore = useStorageStore()
const syncServerStore = useSyncServerStore()

const isDisconnecting = ref(false)
const remoteError = ref<string | null>(null)

const binding = computed(() => syncServerStore.binding)

const dotClass = computed(() => {
  if (syncServerStore.revoked || storageStore.status === "error") return "bg-error"
  if (storageStore.status === "syncing") return "bg-accent"
  if (storageStore.status === "active") return "bg-success"
  return "bg-base-content/30"
})

watch(
  () => storageStore.status,
  (status) => {
    if (status === "error") loadRemoteError()
  },
)

async function loadRemoteError() {
  const states = await window.BridgeIPC["storage-sync:get-remote-states"]()
  remoteError.value = states.find((state) => state.id === "daily-server")?.lastError ?? null
}

async function onDisconnect() {
  isDisconnecting.value = true
  try {
    await syncServerStore.disconnect()
  } finally {
    isDisconnecting.value = false
  }
}

onMounted(() => {
  if (storageStore.status === "error") loadRemoteError()
})
</script>

<template>
  <SettingRow v-if="binding">
    <template #title>
      <div class="flex items-center gap-2">
        <p class="text-base-content text-sm">{{ binding.serverName }}</p>
        <span class="flex size-4 shrink-0 items-center justify-center">
          <BaseIcon v-if="storageStore.status === 'syncing'" name="spinner" class="text-accent size-3.5 animate-spin" />
          <span v-else class="size-2 rounded-full" :class="dotClass" />
        </span>
      </div>
    </template>
    <template #description>
      <p class="text-base-content/60 text-xs">{{ binding.baseUrl }} · connected as {{ binding.deviceName }}</p>
    </template>

    <BaseButton variant="ghost" size="sm" class="text-error hover:bg-error/10" :loading="isDisconnecting" @click="onDisconnect"
      >Disconnect</BaseButton
    >

    <template #below>
      <div class="flex flex-col gap-1.5">
        <div v-if="binding.insecure" class="text-warning bg-warning/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
          <BaseIcon name="alert-triangle" class="size-3.5 shrink-0" />
          Insecure connection — traffic is not encrypted
        </div>

        <div v-if="syncServerStore.revoked" class="text-error bg-error/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
          <BaseIcon name="alert-circle" class="size-3.5 shrink-0" />
          This Mac's access to the server was revoked. Disconnect and reconnect to sync again.
        </div>

        <div
          v-else-if="storageStore.status === 'error' && remoteError"
          class="text-error bg-error/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
        >
          <BaseIcon name="alert-circle" class="size-3.5 shrink-0" />
          {{ remoteError }}
        </div>
      </div>
    </template>
  </SettingRow>
</template>
