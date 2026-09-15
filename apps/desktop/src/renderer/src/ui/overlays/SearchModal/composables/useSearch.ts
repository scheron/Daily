import {readonly, ref, watch} from "vue"
import {useDebounceFn} from "@vueuse/core"

import {API} from "@/api"
import {useLoadingState} from "@/composables/useLoadingState"

import type {TaskSearchResult} from "@daily/protocol"

export function useSearch() {
  let requestId = 0

  const query = ref("")
  const items = ref<TaskSearchResult[]>([])
  const isSearching = ref(false)

  const {isLoaded, setState} = useLoadingState()
  const debouncedSearch = useDebounceFn(search, 300)

  async function search(searchQuery: string) {
    if (!searchQuery.trim()) {
      items.value = []
      setState("IDLE")
      isSearching.value = false
      return
    }

    const currentRequestId = ++requestId
    isSearching.value = true

    if (!isLoaded.value) {
      setState("LOADING")
    }

    try {
      const results = await API.searchTasks(searchQuery)
      if (currentRequestId !== requestId) return
      items.value = results
      setState("LOADED")
    } catch (error) {
      if (currentRequestId !== requestId) return
      console.error("Search failed:", error)
      items.value = []
      setState("ERROR")
    } finally {
      if (currentRequestId === requestId) {
        isSearching.value = false
      }
    }
  }

  watch(query, (value) => debouncedSearch(value))

  return {
    query,
    items,
    isSearching: readonly(isSearching),
    isLoaded,
  }
}
