<script setup lang="ts">
import {computed, watch} from "vue"
import {toasts} from "vue-toasts-lite"
import {useIntervalFn} from "@vueuse/core"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {useWindowCountdown} from "../useWindowCountdown"

const syncServerStore = useSyncServerStore()

const expiresAt = computed(() => (syncServerStore.agentWindow?.isThisMac ? syncServerStore.agentWindow.expiresAt : null))

const isWaiting = computed(() => expiresAt.value !== null)

const agentAddress = computed(() => syncServerStore.agentWindow?.agentAddress ?? "")

const {countdownLabel, countdownClass, isExpired} = useWindowCountdown(expiresAt, syncServerStore.listAgents)

const isPolling = computed(() => isWaiting.value && !isExpired.value)

const {copyToClipboard, isCopied} = useCopyToClipboard({onSuccess: () => toasts.success("Address copied")})

const {pause, resume} = useIntervalFn(syncServerStore.listAgents, 3_000, {immediate: false})

async function onCancel() {
  try {
    await syncServerStore.closeAgentWindow()
  } catch (error) {
    console.error("Failed to close the Agent window:", error)
  }
}

function onCopy() {
  copyToClipboard(agentAddress.value)
}

watch(isPolling, (value) => (value ? resume() : pause()), {immediate: true})
</script>

<template>
  <div v-if="isWaiting" class="border-base-300 bg-base-200 -mx-6 -mt-px flex items-center justify-between gap-6 border-t border-b px-6 py-[13px]">
    <div class="flex min-w-0 flex-col gap-0.5">
      <p class="text-base-content text-sm font-medium">Waiting for an agent to ask</p>
      <p class="text-base-content/60 text-xs">In the agent, add this server, then sign in — the request shows up here.</p>

      <div class="border-base-300 bg-base-100 mt-1.5 inline-flex items-center gap-2 self-start rounded-lg border py-1 pr-1.5 pl-2.5">
        <span class="text-base-content font-mono text-xs">{{ agentAddress }}</span>
        <BaseButton variant="primary" size="xs" :icon="isCopied ? 'check' : 'copy'" @click="onCopy">Copy</BaseButton>
      </div>

      <p class="text-base-content/60 mt-2 text-xs leading-normal">
        <span class="text-base-content/85 font-medium">Claude Code:</span
        ><span class="font-mono"> claude mcp add --transport http daily &lt;address&gt;</span>, then <span class="font-mono">/mcp</span> →
        Authenticate<br /><span class="text-base-content/85 font-medium">Claude app:</span> Settings → Connectors → Add custom connector
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2.5">
      <span :class="countdownClass">
        <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
        {{ countdownLabel }} left
      </span>
      <BaseButton variant="ghost" @click="onCancel">Cancel</BaseButton>
    </div>
  </div>
</template>
