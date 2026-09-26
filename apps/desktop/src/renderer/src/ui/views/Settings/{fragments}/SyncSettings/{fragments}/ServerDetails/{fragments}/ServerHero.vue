<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"
import {storeToRefs} from "pinia"

import {SYNC_PROTOCOL_VERSION} from "@daily/protocol"

import {useStorageStore} from "@/stores/storage.store"
import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {ServerBindingView} from "@daily/protocol"

type PillTone = "ok" | "idle" | "warn" | "error"

const props = defineProps<{binding: ServerBindingView}>()

const storageStore = useStorageStore()
const syncServerStore = useSyncServerStore()

const {status} = storeToRefs(storageStore)

const isDisconnecting = ref(false)
const isRetrying = ref(false)
const remoteError = ref<string | null>(null)

const statusTone = computed<PillTone>(() => {
  if (syncServerStore.isRevoked) return "error"
  if (!syncServerStore.isReachable) return "warn"
  if (status.value === "error") return "error"
  return status.value === "inactive" ? "idle" : "ok"
})

const statusLabel = computed(() => {
  if (syncServerStore.isRevoked) return "Access revoked"
  if (!syncServerStore.isReachable) return "Reconnecting…"
  if (status.value === "error") return "Sync error"
  return "Connected"
})

const isStatusBusy = computed(() => status.value === "syncing" || !syncServerStore.isReachable)

const roleLabel = computed(() => {
  if (props.binding.role === "parent") return "This Mac owns it"
  if (props.binding.role === "child" && props.binding.approvedBy) return `Approved by ${props.binding.approvedBy}`
  return null
})

const mismatchMessage = computed(() => {
  const mismatch = syncServerStore.mismatch
  if (!mismatch) return null

  if (mismatch.serverProtocol < mismatch.appProtocol) {
    return `This Mac speaks sync protocol ${mismatch.appProtocol}, but the server still speaks protocol ${mismatch.serverProtocol}. Run "daily-server upgrade" on the server to bring it up to date — edits made here stay on this Mac and go up once the two sides agree.`
  }

  return `The server has moved to sync protocol ${mismatch.serverProtocol}, but this Mac still speaks protocol ${mismatch.appProtocol}. Update Daily on this Mac to sync again — edits made here stay on this Mac and go up once the two sides agree.`
})

async function loadRemoteError() {
  const states = await window.BridgeIPC["storage-sync:get-remote-states"]()
  remoteError.value = states.find((state) => state.id === "daily-server")?.lastError ?? null
}

async function onRetry() {
  isRetrying.value = true
  try {
    await syncServerStore.retry()
  } catch (error) {
    console.error("Failed to retry the Daily Sync Server:", error)
  } finally {
    isRetrying.value = false
  }
}

async function onDisconnect() {
  isDisconnecting.value = true
  try {
    await syncServerStore.disconnect()
  } finally {
    isDisconnecting.value = false
  }
}

function getPillClasses(tone: PillTone) {
  const color = {
    ok: "text-success bg-success/15",
    idle: "text-base-content/55 bg-base-content/8",
    warn: "text-warning bg-warning/15",
    error: "text-error bg-error/15",
  }[tone]
  return cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-medium", color)
}

watch(status, (value) => {
  if (value === "error") loadRemoteError()
})

onMounted(() => {
  if (status.value === "error") loadRemoteError()
})
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-start justify-between gap-6">
      <div class="flex min-w-0 items-start gap-2.5">
        <BaseIcon name="server" class="text-base-content/60 mt-1.5 size-4 shrink-0" />
        <div class="min-w-0">
          <h2 class="text-base-content truncate text-xl leading-tight font-semibold tracking-[-0.01em]">{{ binding.serverName }}</h2>
          <p class="text-base-content/60 mt-1 truncate text-[13px]">{{ binding.baseUrl }}</p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
        <BaseButton variant="error-ghost" icon="cloud-off" :loading="isDisconnecting" @click="onDisconnect">Disconnect</BaseButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <span :class="getPillClasses(statusTone)">
        <BaseIcon v-if="isStatusBusy" name="spinner" class="size-3 animate-spin" />
        <span v-else class="size-2 shrink-0 rounded-full bg-current" />
        {{ statusLabel }}
      </span>
      <span :class="getPillClasses(syncServerStore.mismatch ? 'warn' : 'idle')">Protocol v{{ SYNC_PROTOCOL_VERSION }}</span>
      <span v-if="roleLabel" :class="getPillClasses('idle')">{{ roleLabel }}</span>
    </div>

    <div v-if="binding.insecure" class="text-warning bg-warning/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <BaseIcon name="alert-triangle" class="size-3.5 shrink-0" />
      Insecure connection — traffic is not encrypted
    </div>

    <div v-if="mismatchMessage" class="text-warning bg-warning/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <BaseIcon name="alert-triangle" class="size-3.5 shrink-0" />
      {{ mismatchMessage }}
    </div>

    <div v-if="syncServerStore.isRevoked" class="text-error bg-error/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <BaseIcon name="alert-circle" class="size-3.5 shrink-0" />
      This Mac's access to the server was revoked. Disconnect and reconnect to sync again.
    </div>

    <div v-else-if="!syncServerStore.isReachable" class="text-warning bg-warning/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <BaseIcon name="alert-triangle" class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1">The server is not answering. Daily keeps trying on its own.</span>
      <BaseButton variant="warning-ghost" size="xs" icon="refresh" :loading="isRetrying" @click="onRetry">Try again</BaseButton>
    </div>

    <div v-else-if="status === 'error' && remoteError" class="text-error bg-error/10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <BaseIcon name="alert-circle" class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1">{{ remoteError }}</span>
      <BaseButton variant="error-ghost" size="xs" icon="refresh" :loading="isRetrying" @click="onRetry">Try again</BaseButton>
    </div>
  </div>
</template>
