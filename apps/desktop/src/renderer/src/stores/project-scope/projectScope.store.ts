import {computed} from "vue"
import {defineStore} from "pinia"

import {useBranchesStore} from "@/stores/branches"
import {useSettingsStore} from "@/stores/settings"
import {useUiStore} from "@/stores/ui"

import type {Branch, Settings} from "@daily/protocol"

export const useProjectScopeStore = defineStore("projectScope", () => {
  const settingsStore = useSettingsStore()
  const branchesStore = useBranchesStore()
  const uiStore = useUiStore()

  const isAllProjectsFlag = computed(() => Boolean(settingsStore.settings?.branch?.isAllProjects))

  const selectedIds = computed<Branch["id"][]>(() => settingsStore.settings?.branch.selectedIds ?? [])

  const isAllProjectsMode = computed(() => isAllProjectsFlag.value && uiStore.frame === "day")

  const isMultiProjectMode = computed(() => uiStore.frame === "day" && (isAllProjectsFlag.value || selectedIds.value.length > 1))

  /** The projects the filter shows in the current frame; Milestone always has the one active project. */
  const projectIdsInScope = computed<Branch["id"][]>(() => {
    if (uiStore.frame !== "day") return branchesStore.activeBranchId ? [branchesStore.activeBranchId] : []
    if (isAllProjectsFlag.value) return branchesStore.orderedBranches.map((branch) => branch.id)
    return selectedIds.value
  })

  async function selectProject(id: Branch["id"]): Promise<void> {
    await save({activeId: id, isAllProjects: false, selectedIds: [id]})
  }

  async function selectAllProjects(): Promise<void> {
    if (isAllProjectsFlag.value) return
    await save({isAllProjects: true})
  }

  /** Adds the project to the set or removes it; the last project cannot be removed. */
  async function toggleProject(id: Branch["id"]): Promise<void> {
    const base = isAllProjectsFlag.value ? branchesStore.orderedBranches.map((branch) => branch.id) : selectedIds.value
    const isAdding = !base.includes(id)
    const next = isAdding ? [...base, id] : base.filter((selectedId) => selectedId !== id)
    if (!next.length) return

    const currentActiveId = settingsStore.settings?.branch?.activeId
    const activeId = isAdding ? id : currentActiveId && next.includes(currentActiveId) ? currentActiveId : next[next.length - 1]
    const ordered = [...next.filter((selectedId) => selectedId !== activeId), activeId]
    const isEveryProject = branchesStore.branches.length > 0 && branchesStore.branches.every((branch) => ordered.includes(branch.id))

    await save({activeId, isAllProjects: isEveryProject, selectedIds: ordered})
  }

  /** Makes a project of the Day set the active one, keeping the set; false when it is not in the set. */
  async function activateProjectInSet(id: Branch["id"]): Promise<boolean> {
    if (!isAllProjectsFlag.value && !selectedIds.value.includes(id)) return false

    await save({activeId: id, selectedIds: [...selectedIds.value.filter((selectedId) => selectedId !== id), id]})
    return true
  }

  async function save(changes: Partial<Settings["branch"]>): Promise<void> {
    const branch = settingsStore.settings?.branch
    if (!branch) return

    settingsStore.updateSettings({branch: {...branch, ...changes}})
    await settingsStore.flush()
  }

  return {
    isAllProjectsMode,
    isMultiProjectMode,
    projectIdsInScope,

    selectProject,
    selectAllProjects,
    toggleProject,
    activateProjectInSet,
  }
})
