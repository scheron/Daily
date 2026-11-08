import {onMounted, onScopeDispose, ref} from "vue"

import type {WhatsNewRelease} from "@shared/types/update"

export function useWhatsNewRelease() {
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const release = ref<WhatsNewRelease | null>(null)

  async function loadRelease() {
    try {
      const result = await window.BridgeIPC["whats-new:get-release"]()
      if (disposed || !result) return

      if ("retryAt" in result) {
        scheduleRetry(result.retryAt)
        return
      }

      release.value = result
    } catch (error) {
      if (!disposed) console.error("Failed to load What's New:", error)
    }
  }

  function scheduleRetry(retryAt: number) {
    // Browser timers accept delays up to a signed 32-bit integer.
    const delay = Math.min(Math.max(0, retryAt - Date.now()), 2_147_483_647)
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (Date.now() < retryAt) scheduleRetry(retryAt)
      else void loadRelease()
    }, delay)
  }

  onMounted(loadRelease)
  onScopeDispose(() => {
    disposed = true
    if (retryTimer !== null) clearTimeout(retryTimer)
  })

  return release
}
