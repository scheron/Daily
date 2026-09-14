import {toRaw} from "vue"
import {createEventHook} from "@vueuse/core"
import {defineStore, storeToRefs} from "pinia"

import {useBranchesStore} from "./branches.store"
import {useMilestonesStore} from "./milestones.store"
import {useTagsStore} from "./tags.store"
import {useTasksStore} from "./tasks"
import {applyChangeset} from "./tasks/applyChangeset"

import type {Tag} from "@daily/protocol"

/**
 * Applies every `storage:changed` broadcast to the in-memory collections — this window's own
 * writes echoed back, another window's write, and a sync pull all arrive the same way. Created at
 * bootstrap in every window that holds the collections, so a broadcast landing mid-load is not
 * missed.
 */
export const useStorageChangesStore = defineStore("storageChanges", () => {
  const onStorageDataChanged = createEventHook()

  const {tasks} = storeToRefs(useTasksStore())
  const {tags} = storeToRefs(useTagsStore())
  const {branches} = storeToRefs(useBranchesStore())
  const {milestones} = storeToRefs(useMilestonesStore())

  window.BridgeIPC["storage:on-changed"](async (changeset) => {
    const tagsBefore = toRaw(tags.value)
    applyChangeset({tasks, milestones, tags, branches}, changeset)
    if (toRaw(tags.value) !== tagsBefore) tags.value = sortTagsByName(tags.value)

    onStorageDataChanged.trigger()
  })

  return {
    onStorageDataChanged: onStorageDataChanged.on,
  }
})

function sortTagsByName(list: Tag[]): Tag[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
}
