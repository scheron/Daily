import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {API} from "@/api"
import {sortTagsByName} from "@/utils/tags/sortTagsByName"

import type {Branch, Tag} from "@daily/protocol"

export const useTagsStore = defineStore("tags", () => {
  const tags = ref<Tag[]>([])

  const tagsMap = computed(() => new Map<Tag["id"], Tag>(tags.value.map((tag) => [tag.id, tag])))

  function tagsForBranch(branchId: Branch["id"]): Tag[] {
    return tags.value.filter((tag) => tag.branchId === branchId)
  }

  async function getTagList() {
    try {
      tags.value = await API.getTagList()
    } catch (error) {
      console.error("Error loading tags:", error)
      throw error
    }
  }

  async function createTag(name: string, color: string, branchId: Branch["id"]) {
    const newTag = await API.createTag({branchId, name, color})
    if (!newTag) return null

    tags.value = sortTagsByName(
      tags.value.reduce<Tag[]>(
        (next, tag) => {
          if (tag.id !== newTag.id) next.push(tag)
          return next
        },
        [newTag],
      ),
    )

    return newTag
  }

  async function deleteTag(id: Tag["id"]) {
    const deletedTag = await API.deleteTag(id)
    if (!deletedTag) return false

    tags.value = tags.value.filter((tag) => tag.id !== id)

    return true
  }

  return {
    tags,
    tagsMap,

    tagsForBranch,
    getTagList,
    createTag,
    deleteTag,
  }
})
