import {ref} from "vue"
import {defineStore} from "pinia"

import type {McpStatus} from "@shared/types/mcp"
import type {McpSettings} from "@shared/types/storage"

export const useMcpStore = defineStore("mcp", () => {
  const status = ref<McpStatus>({state: "stopped"})
  const config = ref<McpSettings>({enabled: false, host: "127.0.0.1", port: 7878, token: ""})
  const loading = ref(false)
  let unsubscribe: (() => void) | null = null

  async function init() {
    config.value = await window.BridgeIPC["mcp:get-config"]()
    status.value = await window.BridgeIPC["mcp:get-status"]()
    unsubscribe = window.BridgeIPC["mcp:on-status-changed"]((next) => {
      status.value = next
    })
  }

  function dispose() {
    unsubscribe?.()
    unsubscribe = null
  }

  async function setConfig(partial: Partial<McpSettings>) {
    loading.value = true
    try {
      status.value = await window.BridgeIPC["mcp:set-config"](partial)
      config.value = await window.BridgeIPC["mcp:get-config"]()
    } finally {
      loading.value = false
    }
  }

  async function rotateToken() {
    const {token} = await window.BridgeIPC["mcp:rotate-token"]()
    config.value = {...config.value, token}
  }

  return {status, config, loading, init, dispose, setConfig, rotateToken}
})
