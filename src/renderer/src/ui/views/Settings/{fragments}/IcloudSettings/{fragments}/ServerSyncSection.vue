<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"

import {useStorageStore} from "@/stores/storage.store"
import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {useBaseModal} from "@/ui/base/BaseModal"

import SettingRow from "../../SettingRow.vue"
import ServerConnectModal from "./ServerConnectModal.vue"

const CONNECT_MODAL_ID = "sync-server-connect"
/** `authenticateRequest` on the server throws this code, unchanged, for a revoked device — and
 * for nothing else. `ProtocolError`'s message defaults to the code itself, and the protocol
 * client rethrows the server's code with "no wrapping, no re-coding", so it survives the
 * Electron IPC round trip as a literal substring of the error message the renderer catches. */
const DEVICE_REVOKED_SIGNATURE = "DEVICE_REVOKED"

const storageStore = useStorageStore()
const syncServerStore = useSyncServerStore()

const {show, hide} = useBaseModal(CONNECT_MODAL_ID)

const isDisconnecting = ref(false)
const isRevoked = ref(false)
const remoteError = ref<string | null>(null)

const binding = computed(() => syncServerStore.binding)

const dotClass = computed(() => {
  if (isRevoked.value || storageStore.status === "error") return "bg-error"
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

/**
 * Whether this Mac's own credential still authenticates, checked by making the one
 * already-frozen authenticated read the section otherwise has no reason to make. A network or
 * server failure throws a different error class entirely (`SyncServerError`, not
 * `ProtocolError`), so only the server's own explicit refusal can ever set this true — never a
 * dropped connection, a sleeping laptop or a wrong address.
 */
async function checkRevoked() {
  if (!binding.value) {
    isRevoked.value = false
    return
  }

  try {
    await syncServerStore.getPendingApproval()
    isRevoked.value = false
  } catch (error) {
    isRevoked.value = error instanceof Error && error.message.includes(DEVICE_REVOKED_SIGNATURE)
  }
}

async function loadRemoteError() {
  const states = await window.BridgeIPC["storage-sync:get-remote-states"]()
  remoteError.value = states.find((state) => state.id === "daily-server")?.lastError ?? null
}

function onConnect() {
  show(ServerConnectModal, {onClose: () => hide()})
}

async function onDisconnect() {
  isDisconnecting.value = true
  try {
    await syncServerStore.disconnect()
  } finally {
    isDisconnecting.value = false
  }
}

watch(binding, () => checkRevoked(), {immediate: true})

onMounted(() => {
  if (storageStore.status === "error") loadRemoteError()
})
</script>

<template>
  <SettingRow v-if="!binding" title="Self-hosted Daily" description="Connect this Mac to your own Daily Sync Server">
    <BaseButton variant="primary" size="sm" @click="onConnect">Connect</BaseButton>
  </SettingRow>

  <SettingRow v-else>
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

        <div v-if="isRevoked" class="text-error bg-error/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
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
