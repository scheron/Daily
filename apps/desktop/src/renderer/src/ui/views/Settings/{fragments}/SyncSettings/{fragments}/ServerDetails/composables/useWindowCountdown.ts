import {computed, onBeforeUnmount, ref, toValue, watch} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {ComputedRef, MaybeRefOrGetter} from "vue"

export function useWindowCountdown(
  expiresAt: MaybeRefOrGetter<string | null>,
  onExpired: () => Promise<void>,
): {countdownLabel: ComputedRef<string>; countdownClass: ComputedRef<string>; isExpired: ComputedRef<boolean>} {
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const now = ref(Date.now())

  const remainingMs = computed(() => {
    const expiry = toValue(expiresAt)
    return expiry ? Math.max(0, Date.parse(expiry) - now.value) : 0
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

  const isExpired = computed(() => toValue(expiresAt) !== null && remainingMs.value === 0)

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
    if (toValue(expiresAt)) startTicking()
  }

  watch(
    () => toValue(expiresAt),
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
