import {computed, reactive, ref, shallowRef, watch} from "vue"
import {tryOnScopeDispose, useIntervalFn} from "@vueuse/core"
import {defineStore} from "pinia"

import {toasts} from "@/composables/useToasts"

import type {TaskTimer, TaskTimerCommand} from "@shared/types/taskTimer"

export const useTaskTimersStore = defineStore("task-timers", () => {
  let hasBroadcast = false
  let disposed = false
  let receivedAt = performance.now()

  const timers = shallowRef<TaskTimer[]>([])
  const pendingTaskIds = reactive(new Set<TaskTimer["taskId"]>())
  const now = ref(receivedAt)

  const hasRunningTimer = computed(() => timers.value.some((timer) => timer.isRunning))

  const {pause: stopClock, resume: startClock} = useIntervalFn(() => (now.value = performance.now()), 250, {immediate: false})

  function elapsedSeconds(timer: TaskTimer) {
    const runningMs = timer.isRunning ? Math.max(0, now.value - receivedAt) : 0
    return Math.floor((timer.elapsedMs + runningMs) / 1000)
  }

  function isPending(taskId: TaskTimer["taskId"]) {
    return pendingTaskIds.has(taskId)
  }

  async function dispatch(command: TaskTimerCommand): Promise<boolean> {
    const changesClock = command.type !== "promote"
    if (changesClock && isPending(command.taskId)) return false

    if (changesClock) pendingTaskIds.add(command.taskId)
    try {
      return await window.BridgeIPC["task-timers:dispatch"](command)
    } catch {
      toasts.error("Couldn't update the timer. Try again.")
      return false
    } finally {
      if (changesClock) pendingTaskIds.delete(command.taskId)
    }
  }

  async function load() {
    try {
      const initialTimers = await window.BridgeIPC["task-timers:get"]()
      if (!disposed && !hasBroadcast) setTimers(initialTimers)
    } catch {
      if (!disposed && !hasBroadcast) toasts.error("Couldn't load task timers.")
    }
  }

  function setTimers(next: TaskTimer[]) {
    receivedAt = performance.now()
    now.value = receivedAt
    timers.value = next
  }

  watch(hasRunningTimer, (running) => {
    if (running) startClock()
    else stopClock()
  })

  const unsubscribe = window.BridgeIPC["task-timers:on-changed"]((next) => {
    hasBroadcast = true
    setTimers(next)
  })
  void load()

  tryOnScopeDispose(() => {
    disposed = true
    unsubscribe()
  })

  return {timers, elapsedSeconds, isPending, dispatch}
})
