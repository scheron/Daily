<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from "vue"

import {useMcpStore} from "@/stores/mcp.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCard from "@/ui/base/BaseCard.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

const mcpStore = useMcpStore()

const localHost = ref("")
const localPort = ref("")
const showToken = ref(false)
const showClientConfig = ref(false)

const statusConfig = computed(() => {
  const s = mcpStore.status
  switch (s.state) {
    case "running":
      return {label: `Running on ${s.host}:${s.port}`, colorClass: "text-success", dotClass: "bg-success"}
    case "starting":
      return {label: "Starting…", colorClass: "text-warning", dotClass: "bg-warning"}
    case "stopping":
      return {label: "Stopping…", colorClass: "text-warning", dotClass: "bg-warning"}
    case "error":
      return {label: `Error: ${s.message}`, colorClass: "text-error", dotClass: "bg-error"}
    default:
      return {label: "Stopped", colorClass: "text-base-content/50", dotClass: "bg-base-300"}
  }
})

const clientConfigJson = computed(() => {
  const host = mcpStore.config.host || "127.0.0.1"
  const port = mcpStore.config.port || 7878
  const token = mcpStore.config.token || "••••••••"
  return JSON.stringify(
    {
      mcpServers: {
        daily: {
          transport: "http",
          url: `http://${host}:${port}/mcp`,
          headers: {Authorization: `Bearer ${token}`},
        },
      },
    },
    null,
    2,
  )
})

function onHostBlur() {
  const trimmed = localHost.value.trim()
  if (trimmed && trimmed !== mcpStore.config.host) {
    mcpStore.setConfig({host: trimmed})
  }
}

function onPortBlur() {
  const parsed = parseInt(localPort.value, 10)
  if (!isNaN(parsed) && parsed !== mcpStore.config.port) {
    mcpStore.setConfig({port: parsed})
  }
}

async function onCopyToken() {
  await navigator.clipboard.writeText(mcpStore.config.token)
}

async function onCopyClientConfig() {
  await navigator.clipboard.writeText(clientConfigJson.value)
}

onMounted(async () => {
  await mcpStore.init()
  localHost.value = mcpStore.config.host
  localPort.value = String(mcpStore.config.port)
})

onBeforeUnmount(() => {
  mcpStore.dispose()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseCard title="Enable MCP Server" description="Expose Daily tasks to external MCP clients via HTTP">
      <BaseSwitch :model-value="mcpStore.config.enabled" :disabled="mcpStore.loading" @update:model-value="mcpStore.setConfig({enabled: $event})" />
    </BaseCard>

    <BaseAnimation name="dropIn" :duration="250">
      <div v-if="mcpStore.config.enabled" class="overflow-hidden rounded-lg">
        <div class="flex items-center gap-2 py-2.5">
          <span class="size-2 shrink-0 rounded-full" :class="statusConfig.dotClass" />
          <span class="text-sm font-medium" :class="statusConfig.colorClass">{{ statusConfig.label }}</span>
        </div>

        <div class="border-base-300 border-t py-3">
          <span class="text-base-content mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <BaseIcon name="cog" class="-mt-0.5 size-4" />
            Connection
          </span>

          <div class="flex gap-3">
            <div class="flex-1 space-y-1">
              <span class="text-base-content/80 text-xs">Host</span>
              <BaseInput v-model="localHost" placeholder="127.0.0.1" class="mt-1 text-sm" @blur="onHostBlur" />
              <p class="text-base-content/45 text-[10px]">Use <code>0.0.0.0</code> to expose over Tailscale.</p>
            </div>

            <div class="w-28 space-y-1">
              <span class="text-base-content/80 text-xs">Port</span>
              <BaseInput v-model="localPort" placeholder="7878" type="number" class="mt-1 text-sm" @blur="onPortBlur" />
            </div>
          </div>
        </div>

        <div class="border-base-300 border-t py-3">
          <span class="text-base-content mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <BaseIcon name="eye-off" class="-mt-0.5 size-4" />
            Auth Token
          </span>

          <div class="flex items-center gap-2">
            <div
              class="bg-base-100 border-base-300 flex-1 rounded-lg border px-3 py-1.5 font-mono text-sm"
              :class="showToken ? 'text-base-content' : 'text-base-content/60 tracking-widest'"
            >
              {{ showToken ? mcpStore.config.token : "••••••••" }}
            </div>

            <BaseButton variant="ghost" size="sm" class="p-1" :tooltip="showToken ? 'Hide token' : 'Reveal token'" @click="showToken = !showToken">
              <BaseIcon :name="showToken ? 'eye-off' : 'eye'" class="size-4" />
            </BaseButton>

            <BaseButton variant="ghost" size="sm" class="p-1" tooltip="Copy token" @click="onCopyToken">
              <BaseIcon name="copy" class="size-4" />
            </BaseButton>

            <BaseButton variant="ghost" size="sm" class="p-1" tooltip="Rotate token" :disabled="mcpStore.loading" @click="mcpStore.rotateToken()">
              <BaseIcon name="refresh" class="size-4" />
            </BaseButton>
          </div>
        </div>

        <div class="border-base-300 border-t py-3">
          <button
            class="text-base-content/80 flex w-full items-center gap-1.5 text-xs font-semibold outline-none"
            @click="showClientConfig = !showClientConfig"
          >
            <BaseIcon name="code" class="-mt-0.5 size-4" />
            Example client config
            <BaseIcon :name="showClientConfig ? 'chevron-up' : 'chevron-down'" class="ml-auto size-3.5" />
          </button>

          <BaseAnimation name="dropIn" :duration="200">
            <div v-if="showClientConfig" class="mt-2 overflow-hidden">
              <div class="bg-base-100 border-base-300 relative rounded-lg border p-3">
                <pre class="text-base-content/80 overflow-x-auto text-[11px] leading-relaxed">{{ clientConfigJson }}</pre>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-base-content/60 hover:text-base-content absolute top-2 right-2 p-1"
                  tooltip="Copy config"
                  @click="onCopyClientConfig"
                >
                  <BaseIcon name="copy" class="size-3.5" />
                </BaseButton>
              </div>
            </div>
          </BaseAnimation>
        </div>
      </div>
    </BaseAnimation>
  </div>
</template>
