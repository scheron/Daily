<script setup lang="ts">
import {computed, onMounted, ref} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import SettingRow from "../../SettingRow.vue"
import {useSshNodeModal} from "./useSshNodeModal"

import type {SyncRemoteState} from "@shared/types/storage"
import type {SshNodeConfig} from "./useSshNodeModal"

const settingsStore = useSettingsStore()
const {open: openSshModal} = useSshNodeModal()

const remoteStates = ref<SyncRemoteState[]>([])

const ssh = computed(() => settingsStore.settings?.sync?.ssh ?? null)
const isEnabled = computed(() => ssh.value?.enabled ?? false)
const isConfigured = computed(() => Boolean(ssh.value?.host && ssh.value?.dir))
const sshState = computed(() => remoteStates.value.find((state) => state.id === "ssh") ?? null)

const statusInfo = computed(() => {
  if (sshState.value?.lastError) return {label: "Error", dot: "bg-error", title: sshState.value.lastError}
  if (sshState.value?.lastSyncAt) return {label: "Active", dot: "bg-success", title: `Last sync: ${toLocaleTime(sshState.value.lastSyncAt)}`}
  return {label: "Never synced", dot: "bg-base-content/30", title: ""}
})

onMounted(() => {
  void refreshStates()
})

async function onConfigure() {
  const config = await openSshModal(currentConfig())
  if (!config) return
  saveSsh(isEnabled.value, config)
  await refreshStates()
}

async function onToggle(enabled: boolean) {
  if (!enabled) return saveSsh(false, currentConfig())
  if (isConfigured.value) return saveSsh(true, currentConfig())

  const config = await openSshModal(currentConfig())
  if (!config) return
  saveSsh(true, config)
  await refreshStates()
}

function currentConfig(): SshNodeConfig {
  return {host: ssh.value?.host ?? "", dir: ssh.value?.dir ?? ""}
}

function saveSsh(enabled: boolean, config: SshNodeConfig) {
  if (!settingsStore.settings) return

  settingsStore.updateSettings({
    sync: {
      ...settingsStore.settings.sync,
      ssh: {enabled, host: config.host.trim(), dir: config.dir.trim()},
    },
  })
}

async function refreshStates() {
  remoteStates.value = await window.BridgeIPC["storage-sync:get-remote-states"]()
}
</script>

<template>
  <SettingRow title="SSH Node" description="Sync with an external CLI node over SSH">
    <div class="flex items-center gap-2.5">
      <span v-if="isEnabled" class="text-base-content/60 flex items-center gap-1.5 text-xs" :title="statusInfo.title">
        <span class="size-2 rounded-full" :class="statusInfo.dot" />
        {{ statusInfo.label }}
      </span>

      <BaseButton variant="outline" size="sm" class="text-xs" @click="onConfigure"> Configure </BaseButton>

      <BaseSwitch :modelValue="isEnabled" @update:modelValue="onToggle" />
    </div>
  </SettingRow>
</template>
