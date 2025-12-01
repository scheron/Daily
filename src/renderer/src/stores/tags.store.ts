import {computed, ref} from "vue"
import {API} from "@/api"
import {defineStore} from "pinia"

import type {Tag} from "@shared/types/storage"

export const useTagsStore = defineStore("tags", () => {
  const isTagsLoaded = ref(false)
  const tags = ref<Tag[]>([])

  const tagsMap = computed(() => new Map<Tag["id"], Tag>(tags.value.map((tag) => [tag.id, tag])))

  async function getTagList() {
    isTagsLoaded.value = false

    try {
      const loadedTags = await API.getTagList()
      console.log("Loaded tags:", loadedTags)
      tags.value = loadedTags
    } catch (error) {
      console.error("Error loading tags:", error)
    } finally {
      isTagsLoaded.value = true
    }
  }

  async function createTag(name: string, color: string) {
    const newTag = await API.createTag({name, color})
    if (!newTag) return null

    tags.value.push(newTag)

    return newTag
  }

  async function deleteTag(id: Tag["id"]) {
    const deletedTag = await API.deleteTag(id)
    if (!deletedTag) return false

    tags.value = tags.value.filter((tag) => tag.id !== id)

    return true
  }

  async function revalidate() {
    try {
      const loadedTags = await API.getTagList()
      console.log("Revalidated tags:", loadedTags)
      tags.value = loadedTags
    } catch (error) {
      console.error("Error revalidating tags:", error)
    }
  }

  return {
    isTagsLoaded,
    tags,
    tagsMap,

    getTagList,
    createTag,
    deleteTag,

    revalidate,
  }
})
