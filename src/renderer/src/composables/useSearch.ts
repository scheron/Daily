import {computed, readonly, ref, watch} from "vue"
import {useDebounceFn} from "@vueuse/core"

import {useLoadingState} from "./useLoadingState"

type SearchOptions<T> = {
  /** Initial search query value @default "" */
  initialValue?: string
  /** Debounce delay in milliseconds @default 300 */
  debounce?: number
  /** Function that performs the search and returns results */
  searchFn: (query: string) => Promise<T[]>
  /** Minimum query length before triggering search @default 1 */
  minQueryLength?: number
}

/**
 * Composable for managing search state with debouncing and loading states
 *
 * @example
 * ```ts
 * const searchState = useSearch({
 *   searchFn: async (query) => {
 *     return await API.searchTasks(query)
 *   },
 *   debounce: 300,
 *   minQueryLength: 2
 * })
 *
 * // Use in component
 * searchState.search("my query")
 * // Access results: searchState.items
 * // Check status: searchState.isSearching, searchState.hasResults
 * ```
 */
export function useSearch<T>(options: SearchOptions<T>) {
  const {initialValue = "", debounce = 500, searchFn, minQueryLength = 1} = options

  const searchState = useLoadingState()
  const query = ref<string>(initialValue)
  const items = ref<T[]>([])
  const isSearching = ref(false)
  let requestId = 0

  const isEmpty = computed(() => searchState.isLoaded && !query.value.trim())
  const hasResults = computed(() => searchState.isLoaded && items.value.length > 0)
  const isQueryTooShort = computed(() => query.value.trim().length < minQueryLength)

  async function search(searchQuery: string) {
    if (!searchQuery.trim() || searchQuery.trim().length < minQueryLength) {
      items.value = []
      searchState.setState("IDLE")
      isSearching.value = false
      return
    }

    const currentRequestId = ++requestId
    isSearching.value = true

    if (!searchState.isLoaded.value) {
      searchState.setState("LOADING")
    }

    try {
      const results = await searchFn(searchQuery)
      if (currentRequestId !== requestId) return
      items.value = results
      searchState.setState("LOADED")
    } catch (error) {
      if (currentRequestId !== requestId) return
      console.error("Search failed:", error)
      items.value = []
      searchState.setState("ERROR")
    } finally {
      if (currentRequestId === requestId) {
        isSearching.value = false
      }
    }
  }

  const debouncedSearch = useDebounceFn(search, debounce)

  watch(query, (value) => debouncedSearch(value))

  if (initialValue && initialValue.trim().length >= minQueryLength) {
    search(initialValue)
  }

  return {
    query,
    items,
    search,

    isSearching: readonly(isSearching),
    isLoaded: searchState.isLoaded,
    isError: searchState.isError,
    isIdle: searchState.isIdle,

    isEmpty,
    hasResults,
    isQueryTooShort,
  }
}
