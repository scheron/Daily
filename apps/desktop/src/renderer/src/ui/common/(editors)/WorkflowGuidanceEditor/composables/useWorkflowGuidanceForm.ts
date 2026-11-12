import {computed, onScopeDispose, ref, toValue, watch} from "vue"

import type {WorkflowGuidance, WorkflowGuidanceDocument, WorkflowGuidanceUpdate} from "@daily/protocol"
import type {MaybeRefOrGetter} from "vue"

export function useWorkflowGuidanceForm(scope: MaybeRefOrGetter<WorkflowGuidanceUpdate["scope"]>) {
  let generation = 0
  let retry: WorkflowGuidanceUpdate | null = null
  let refreshQueued = false

  const guidance = ref<WorkflowGuidance | null>(null)
  const document = ref<WorkflowGuidanceDocument | null>(null)
  const content = ref("")
  const allowCompletion = ref<boolean | null>(false)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const hasConflict = ref(false)
  const error = ref<string | null>(null)
  const saved = ref(false)
  const refreshNotice = ref<string | null>(null)

  const scopeKey = computed(() => {
    const value = toValue(scope)
    return value.kind === "workspace" ? "workspace" : `project:${value.projectId}`
  })
  const isProject = computed(() => toValue(scope).kind === "project")
  const isDirty = computed(
    () => document.value !== null && (content.value !== document.value.content || allowCompletion.value !== document.value.allowCompletion),
  )
  const completionChoice = computed({
    get: () => (allowCompletion.value === null ? "inherit" : allowCompletion.value ? "allow" : "review"),
    set(value: string) {
      allowCompletion.value = value === "inherit" && isProject.value ? null : value === "allow"
    },
  })
  const effectiveAllowCompletion = computed(() => allowCompletion.value ?? guidance.value?.workspace.allowCompletion ?? false)
  const savedAllowCompletion = computed(
    () => (isProject.value ? guidance.value?.project?.allowCompletion : null) ?? guidance.value?.workspace.allowCompletion ?? false,
  )
  const currentDocument = computed(() => (isProject.value ? guidance.value?.project : guidance.value?.workspace) ?? null)

  async function load(preserveDraft = false) {
    if (isSaving.value) {
      refreshQueued = true
      return
    }
    const request = ++generation
    const currentScope = toValue(scope)
    if (!preserveDraft) {
      isLoading.value = true
      error.value = null
      saved.value = false
    }
    try {
      const result =
        currentScope.kind === "project"
          ? await window.BridgeIPC["workflow:get-guidance"](currentScope.projectId)
          : await window.BridgeIPC["workflow:get-guidance"]()
      if (request !== generation) return
      if (!result.ok) {
        error.value = result.message
        return
      }
      const nextDocument = currentScope.kind === "workspace" ? result.value.workspace : result.value.project
      const documentChanged = document.value?.revision !== nextDocument?.revision
      const workspaceChanged = guidance.value?.workspace.revision !== result.value.workspace.revision
      const keepDraft = preserveDraft && isDirty.value
      guidance.value = result.value
      error.value = null
      if (keepDraft) {
        if (documentChanged) {
          hasConflict.value = true
          refreshNotice.value = "Saved guidance changed while editing. The draft is kept; load saved guidance and review before saving."
        } else if (workspaceChanged) {
          refreshNotice.value =
            "Workspace guidance changed while editing. Current inherited instructions and permission are shown; the draft is kept."
        }
        return
      }
      document.value = nextDocument
      content.value = document.value?.content ?? ""
      allowCompletion.value = document.value?.allowCompletion ?? (currentScope.kind === "project" ? null : false)
      hasConflict.value = false
      if (!preserveDraft) refreshNotice.value = null
      else if (documentChanged || workspaceChanged) refreshNotice.value = "Saved guidance and completion permission refreshed."
      retry = null
    } catch {
      if (request === generation) error.value = "Guidance could not be loaded. Try again."
    } finally {
      if (request === generation) isLoading.value = false
    }
  }

  async function save(): Promise<boolean> {
    if (!document.value || !isDirty.value || isSaving.value || hasConflict.value) return false
    const request = ++generation
    const update: WorkflowGuidanceUpdate = {
      scope: {...toValue(scope)},
      content: content.value,
      allowCompletion: allowCompletion.value,
      expectedRevision: document.value.revision,
      operationId:
        retry?.content === content.value && retry.allowCompletion === allowCompletion.value && retry.expectedRevision === document.value.revision
          ? retry.operationId
          : crypto.randomUUID(),
    }
    retry = update
    isSaving.value = true
    error.value = null
    saved.value = false
    try {
      const result = await window.BridgeIPC["workflow:save-guidance"](update)
      if (request !== generation) return false
      if (!result.ok) {
        error.value = result.message
        hasConflict.value = result.code === "stale_revision" || result.code === "conflict"
        return false
      }
      document.value = result.value
      if (guidance.value) {
        if (update.scope.kind === "workspace") guidance.value.workspace = result.value
        else guidance.value.project = result.value
      }
      saved.value = true
      refreshNotice.value = null
      retry = null
      return true
    } catch {
      if (request === generation) error.value = "The save could not be confirmed. Try saving again; the same change will not be applied twice."
      return false
    } finally {
      if (request === generation) {
        isSaving.value = false
        if (refreshQueued) {
          refreshQueued = false
          void load(true)
        }
      }
    }
  }

  const unsubscribe = window.BridgeIPC.on("storage:changed", () => void load(true))

  watch(
    scopeKey,
    () => {
      document.value = null
      guidance.value = null
      hasConflict.value = false
      refreshNotice.value = null
      isSaving.value = false
      refreshQueued = false
      retry = null
      void load()
    },
    {immediate: true},
  )

  onScopeDispose(() => {
    generation++
    unsubscribe()
  })

  return {
    guidance,
    document,
    content,
    completionChoice,
    effectiveAllowCompletion,
    savedAllowCompletion,
    currentDocument,
    isProject,
    isLoading,
    isSaving,
    hasConflict,
    error,
    saved,
    refreshNotice,
    isDirty,
    load,
    save,
  }
}
