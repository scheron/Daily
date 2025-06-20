import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {API} from "@/api"

import type {Tag} from "@/types/tasks"

export const useTagsStore = defineStore("tags", () => {
  const isTagsLoaded = ref(false)
  const tags = ref<Tag[]>([])

  const tagsMap = computed(() => new Map<Tag["id"], Tag>(tags.value.map((tag) => [tag.id, tag])))

  async function loadTags() {
    try {
      const loadedTags = await API.getTags()
      tags.value = loadedTags
    } catch (error) {
      console.error("Error loading tags:", error)
    } finally {
      isTagsLoaded.value = true
    }
  }

  async function createTag(name: string, color: string, emoji?: string) {
    const newTag = await API.createTag(name, color, emoji)
    if (!newTag) return null

    tags.value.push(newTag)

    return newTag
  }

  async function deleteTag(id: string) {
    const deletedTag = await API.deleteTag(id)
    if (!deletedTag) return false

    tags.value = tags.value.filter((tag) => tag.id !== id)

    return true
  }

  return {
    isTagsLoaded,
    tags,
    tagsMap,

    loadTags,
    createTag,
    deleteTag,
  }
})
