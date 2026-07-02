import {computed, ref, unref} from "vue"

import type {Ref} from "vue"

type FilterOptions<T, F> = {
  /** Initial filter value */
  initialValue: F
  /** Source items to filter (can be reactive ref or array) */
  items: Ref<T[]> | T[]
  /** Function that determines if an item passes the filter */
  filterFn: (item: T, filter: F) => boolean
  /** Optional function to check if filter is in default/empty state */
  isDefaultFilter?: (filter: F) => boolean
}

/**
 * Composable for managing filter state with reactive filtering
 *
 * @example
 * ```ts
 * const filterState = useFilter({
 *   initialValue: 'all',
 *   items: searchResults,
 *   filterFn: (item, filter) => {
 *     if (filter === 'all') return true
 *     return item.status === filter
 *   },
 *   isDefaultFilter: (filter) => filter === 'all'
 * })
 *
 * // Use in component
 * filterState.setFilter('active')
 * // Access results: filterState.filteredItems
 * // Check status: filterState.hasResults, filterState.isEmpty
 * ```
 */
export function useFilter<T, F>(options: FilterOptions<T, F>) {
  const {initialValue, items, filterFn, isDefaultFilter} = options

  const filter = ref<F>(initialValue) as Ref<F>

  const sourceItems = computed(() => unref(items))
  const filteredItems = computed(() => sourceItems.value.filter((item) => filterFn(item, filter.value)))
  const hasResults = computed(() => filteredItems.value.length > 0)
  const isEmpty = computed(() => filteredItems.value.length === 0)

  const isDefault = computed(() => {
    if (!isDefaultFilter) return false
    return isDefaultFilter(filter.value)
  })

  function setFilter(newFilter: F) {
    filter.value = newFilter
  }

  function resetFilter() {
    filter.value = initialValue
  }

  return {
    filter,
    filteredItems,
    setFilter,
    resetFilter,

    hasResults,
    isEmpty,
    isDefault,
  }
}
