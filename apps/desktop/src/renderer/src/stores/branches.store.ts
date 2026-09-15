import {computed, ref} from "vue"
import {sort} from "fast-sort"
import {defineStore} from "pinia"

import {MAIN_BRANCH_ID} from "@daily/protocol"

import {API} from "@/api"
import {useSettingsStore} from "./settings.store"

import type {Branch} from "@daily/protocol"

export const useBranchesStore = defineStore("branches", () => {
  const settingsStore = useSettingsStore()

  const branches = ref<Branch[]>([])

  const branchesMap = computed(() => new Map<Branch["id"], Branch>(branches.value.map((branch) => [branch.id, branch])))
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId ?? null)
  const activeBranch = computed(() => (activeBranchId.value ? (branchesMap.value.get(activeBranchId.value) ?? null) : null))
  const orderedBranches = computed(() => {
    return sort(branches.value).by([{desc: (b) => b.id === MAIN_BRANCH_ID}, {asc: (b) => b.name.toLowerCase()}])
  })

  async function getBranchList() {
    try {
      branches.value = await API.getBranchList()
    } catch (error) {
      console.error("Failed to load branches", error)
      throw error
    }
  }

  async function createBranch(name: string): Promise<Branch | null> {
    const trimmed = name.trim()
    if (!trimmed) return null

    return await API.createBranch({name: trimmed, description: ""})
  }

  async function updateBranchName(id: Branch["id"], name: string): Promise<Branch | null> {
    const trimmed = name.trim()
    if (!trimmed) return null

    return await API.updateBranch(id, {name: trimmed})
  }

  async function updateBranchDescription(id: Branch["id"], description: string): Promise<Branch | null> {
    return await API.updateBranch(id, {description})
  }

  async function deleteBranch(id: Branch["id"]): Promise<boolean> {
    const deleted = await API.deleteBranch(id)
    if (!deleted) return false

    await settingsStore.revalidate()
    return true
  }

  async function setActiveBranch(id: Branch["id"]): Promise<boolean> {
    await API.setActiveBranch(id)
    await settingsStore.revalidate()
    return true
  }

  return {
    branches,
    branchesMap,
    orderedBranches,
    activeBranchId,
    activeBranch,

    getBranchList,
    createBranch,
    updateBranchName,
    updateBranchDescription,
    deleteBranch,
    setActiveBranch,
  }
})
