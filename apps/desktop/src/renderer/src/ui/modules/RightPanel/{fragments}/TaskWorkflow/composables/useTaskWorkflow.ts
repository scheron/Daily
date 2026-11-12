import {onScopeDispose, ref, toValue, watch} from "vue"
import {useIntervalFn} from "@vueuse/core"

import type {TaskWorkflowResolution, TaskWorkflowState} from "@daily/protocol"
import type {MaybeRefOrGetter} from "vue"

export function useTaskWorkflow(taskId: MaybeRefOrGetter<string>) {
  let generation = 0
  let retry: TaskWorkflowResolution | null = null

  const state = ref<TaskWorkflowState | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const isStale = ref(false)
  const resolvingId = ref<string | null>(null)
  const notice = ref<string | null>(null)

  async function load(quiet = false) {
    if (resolvingId.value !== null) return
    const request = ++generation
    const id = toValue(taskId)
    if (!quiet) {
      isLoading.value = true
      error.value = null
    }
    try {
      const result = await window.BridgeIPC["workflow:get-task"](id)
      if (request !== generation) return
      isStale.value = !result.ok
      if (result.ok) {
        state.value = result.value
        error.value = null
      } else error.value = result.message
    } catch {
      if (request === generation) {
        isStale.value = true
        error.value = "Agent activity could not be refreshed. Try again."
      }
    } finally {
      if (request === generation) isLoading.value = false
    }
  }

  async function review(proposalId: string, decision: TaskWorkflowResolution["decision"]): Promise<boolean> {
    if (!state.value || resolvingId.value !== null) return false
    const proposal = state.value.proposals.find((value) => value.id === proposalId)
    if (!proposal || proposal.status !== "pending" || (decision === "accepted" && proposal.conflict)) return false
    const request = ++generation
    const resolution: TaskWorkflowResolution = {
      taskId: toValue(taskId),
      proposalId,
      decision,
      expectedRevision: state.value.revision,
      operationId:
        retry?.proposalId === proposalId && retry.decision === decision && retry.expectedRevision === state.value.revision
          ? retry.operationId
          : crypto.randomUUID(),
    }
    retry = resolution
    resolvingId.value = proposalId
    error.value = null
    notice.value = null
    try {
      const result = await window.BridgeIPC["workflow:resolve-proposal"](resolution)
      if (request !== generation) return false
      if (!result.ok) {
        if (result.current) state.value = result.current
        error.value = result.message
        return false
      }
      state.value = result.value
      isStale.value = false
      notice.value = decision === "accepted" ? "Proposal accepted. Task values updated together." : "Proposal rejected. Task values kept."
      retry = null
      return true
    } catch {
      if (request === generation) error.value = "The decision could not be confirmed. Retry to check whether it was saved."
      return false
    } finally {
      resolvingId.value = null
      isLoading.value = false
    }
  }

  const unsubscribe = window.BridgeIPC.on("storage:changed", () => void load(true))
  useIntervalFn(() => void load(true), 5000)

  watch(
    () => toValue(taskId),
    () => {
      state.value = null
      isStale.value = false
      notice.value = null
      retry = null
      void load()
    },
    {immediate: true},
  )

  onScopeDispose(() => {
    generation++
    unsubscribe()
  })

  return {state, error, isLoading, isStale, resolvingId, notice, load, review}
}
