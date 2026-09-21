import {computed, onBeforeUnmount, ref, watch} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {ComputedRef, Ref} from "vue"

export function useWindowCountdown(
  expiresAt: Ref<string | null>,
  onExpired: () => Promise<void>,
): {countdownLabel: ComputedRef<string>; countdownClass: ComputedRef<string>; isExpired: ComputedRef<boolean>} {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const now = ref(Date.now())

  const remainingMs = computed(() => {
    if (!expiresAt.value) return 0
    return Math.max(0, Date.parse(expiresAt.value) - now.value)
  })

  const countdownLabel = computed(() => {
    const totalSeconds = Math.ceil(remainingMs.value / 1_000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
  })

  const countdownClass = computed(() =>
    cn("flex items-center gap-1.5 text-[13px] tabular-nums", remainingMs.value <= 60_000 ? "text-warning" : "text-base-content/50"),
  )

  const isExpired = computed(() => expiresAt.value !== null && remainingMs.value === 0)

  function startTicking() {
    stopTicking()
    tickTimer = setInterval(onTick, 1_000)
  }

  function stopTicking() {
    if (tickTimer) clearInterval(tickTimer)
    tickTimer = null
  }

  async function onTick() {
    now.value = Date.now()
    if (remainingMs.value > 0) return

    stopTicking()
    await onExpired()
    if (expiresAt.value) startTicking()
  }

  watch(
    expiresAt,
    (value) => {
      now.value = Date.now()
      if (value) startTicking()
      else stopTicking()
    },
    {immediate: true},
  )

  onBeforeUnmount(() => stopTicking())

  return {countdownLabel, countdownClass, isExpired}
}
