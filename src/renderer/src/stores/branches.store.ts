import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"

import {API} from "@/api"

import type {Branch} from "@shared/types/storage"

export const useBranchesStore = defineStore("branches", () => {
  const settingsStore = useSettingsStore()

  const isBranchesLoaded = ref(false)
  const branches = ref<Branch[]>([])

  const branchesMap = computed(() => new Map<Branch["id"], Branch>(branches.value.map((branch) => [branch.id, branch])))
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId ?? null)
  const activeBranch = computed(() => (activeBranchId.value ? (branchesMap.value.get(activeBranchId.value) ?? null) : null))
  const orderedBranches = computed(() => {
    return [...branches.value].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
  })

  async function getBranchList() {
    isBranchesLoaded.value = false

    try {
      branches.value = await API.getBranchList()
    } catch (error) {
      console.error("Failed to load branches", error)
    } finally {
      isBranchesLoaded.value = true
    }
  }

  async function createBranch(name: string): Promise<Branch | null> {
    const trimmed = name.trim()
    if (!trimmed) return null

    const created = await API.createBranch({name: trimmed})
    if (!created) return null

    await getBranchList()
    return created
  }

  async function updateBranchName(id: Branch["id"], name: string): Promise<Branch | null> {
    const trimmed = name.trim()
    if (!trimmed) return null

    const updated = await API.updateBranch(id, {name: trimmed})
    if (!updated) return null

    await getBranchList()
    return updated
  }

  async function deleteBranch(id: Branch["id"]): Promise<boolean> {
    const deleted = await API.deleteBranch(id)
    if (!deleted) return false

    await getBranchList()
    await settingsStore.revalidate()
    return true
  }

  async function setActiveBranch(id: Branch["id"]): Promise<boolean> {
    await API.setActiveBranch(id)
    await settingsStore.revalidate()
    return true
  }

  async function revalidate() {
    await getBranchList()
  }

  return {
    isBranchesLoaded,
    branches,
    branchesMap,
    orderedBranches,
    activeBranchId,
    activeBranch,

    getBranchList,
    createBranch,
    updateBranchName,
    deleteBranch,
    setActiveBranch,
    revalidate,
  }
})
