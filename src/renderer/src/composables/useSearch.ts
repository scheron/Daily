import {computed, ref, watch} from "vue"
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
  const {initialValue = "", debounce = 300, searchFn, minQueryLength = 1} = options

  const searchState = useLoadingState()
  const query = ref<string>(initialValue)
  const items = ref<T[]>([])

  const isEmpty = computed(() => searchState.isLoaded && !query.value.trim())
  const hasResults = computed(() => searchState.isLoaded && items.value.length > 0)
  const isQueryTooShort = computed(() => query.value.trim().length < minQueryLength)

  async function search(searchQuery: string) {
    query.value = searchQuery

    if (!searchQuery.trim()) {
      items.value = []
      searchState.setState("IDLE")
      return
    }

    if (searchQuery.trim().length < minQueryLength) {
      items.value = []
      searchState.setState("IDLE")
      return
    }

    try {
      searchState.setState("LOADING")
      const results = await searchFn(searchQuery)
      items.value = results
      searchState.setState("LOADED")
    } catch (error) {
      console.error("Search failed:", error)
      items.value = []
      searchState.setState("ERROR")
    }
  }

  const debouncedSearch = useDebounceFn(search, debounce)

  watch(query, debouncedSearch)

  if (initialValue && initialValue.trim().length >= minQueryLength) {
    search(initialValue)
  }

  return {
    query,
    items,
    search,

    isSearching: searchState.isLoading,
    isLoaded: searchState.isLoaded,
    isError: searchState.isError,
    isIdle: searchState.isIdle,

    isEmpty,
    hasResults,
    isQueryTooShort,
  }
}
