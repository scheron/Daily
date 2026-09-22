<script setup lang="ts">
import {computed} from "vue"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"

defineProps<{isAddDeviceShown: boolean; isConnectAgentShown: boolean}>()

const syncServerStore = useSyncServerStore()

const isEnrollmentWaiting = computed(() => Boolean(syncServerStore.membership?.enrollmentWindow))

const isAgentWaiting = computed(() => syncServerStore.agentWindow?.isThisMac === true)

async function onAddDevice() {
  try {
    await syncServerStore.openEnrollmentWindow()
  } catch (error) {
    console.error("Failed to open the enrollment window:", error)
  }
}

async function onConnectAgent() {
  try {
    await syncServerStore.openAgentWindow()
  } catch (error) {
    console.error("Failed to open the Agent window:", error)
  }
}
</script>

<template>
  <BaseButton
    v-if="isAddDeviceShown"
    variant="primary-ghost"
    icon="monitor"
    tooltip="Add a device"
    :disabled="isEnrollmentWaiting"
    @click="onAddDevice"
  >
    Device
  </BaseButton>
  <BaseButton
    v-if="isConnectAgentShown"
    variant="primary-ghost"
    icon="ai"
    tooltip="Connect an agent"
    :disabled="isAgentWaiting"
    @click="onConnectAgent"
  >
    Agent
  </BaseButton>
</template>
