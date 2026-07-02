import {ref} from "vue"
import {defineStore} from "pinia"

import type {Tag} from "@shared/types/storage"

export const useFilterStore = defineStore("filter", () => {
  const activeTagIds = ref<Set<Tag["id"]>>(new Set())

  function setActiveTags(id: Tag["id"]) {
    if (activeTagIds.value.has(id)) activeTagIds.value.delete(id)
    else activeTagIds.value.add(id)
  }

  function removeActiveTag(id: Tag["id"]) {
    activeTagIds.value.delete(id)
  }

  function clearActiveTags() {
    activeTagIds.value.clear()
  }

  return {
    activeTagIds,

    removeActiveTag,
    setActiveTags,
    clearActiveTags,
  }
})
