import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import type {Task} from "@daily/protocol"
import type {FocusCommand, FocusSession} from "@shared/types/focus"

/** Mirrors the focus session main holds. It follows `focus:on-changed` from creation, and a broadcast that lands before the first load wins over it. */
export const useFocusStore = defineStore("focus", () => {
  const session = ref<FocusSession | null>(null)

  window.BridgeIPC["focus:on-changed"]((next) => {
    session.value = next
  })

  async function dispatch(command: FocusCommand): Promise<void> {
    session.value = await window.BridgeIPC["focus:dispatch"](command)
  }

  /** Whether the task is in the session and not done, while the session is not at its summary. */
  function isInSession(taskId: Task["id"]): boolean {
    if (!session.value || session.value.phase === "summary") return false
    return session.value.tasks.some((task) => task.taskId === taskId && !task.isDone)
  }

  async function loadSession(): Promise<void> {
    const loaded = await window.BridgeIPC["focus:get"]()
    session.value ??= loaded
  }

  invoke(loadSession)

  return {
    session,

    dispatch,
    isInSession,
  }
})
