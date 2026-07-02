import {ref, watch} from "vue"
import {DateTime} from "luxon"

import {addMonths} from "@shared/utils/date/addMonths"
import {diffDays} from "@shared/utils/date/diffDays"
import {mergeDays, updateDays} from "@/utils/tasks/updateDays"

import {API} from "@/api"

import type {ISODate} from "@shared/types/common"
import type {TaskRangeContext} from "../types"

const INITIAL_RANGE_MONTHS = 6
const EXTEND_RANGE_MONTHS = 3
const EDGE_BUFFER_DAYS = 21

/**
 * Owns the lazily-loaded window of days around the active date: tracks the loaded
 * range, loads/extends/recenters it on demand, and refreshes or revalidates days.
 * @param ctx - Shared task state refs and the active branch id
 */
export function useTaskRange(ctx: TaskRangeContext) {
  const {days, isDaysLoaded, activeBranchId} = ctx

  const loadedRange = ref<{from: ISODate; to: ISODate} | null>(null)
  const pendingExtend = ref<"past" | "future" | null>(null)

  async function getTaskList() {
    await loadRangeAround(DateTime.now().toISODate()!, {markLoaded: true})
  }

  async function ensureRangeForDate(date: ISODate) {
    const range = loadedRange.value
    if (!range) return

    const daysPastStart = diffDays(date, range.from)
    const daysBeforeEnd = diffDays(range.to, date)

    if (daysPastStart < -EDGE_BUFFER_DAYS || daysBeforeEnd < -EDGE_BUFFER_DAYS) {
      await loadRangeAround(date)
      return
    }

    if (daysPastStart < EDGE_BUFFER_DAYS) extendRange("past")
    else if (daysBeforeEnd < EDGE_BUFFER_DAYS) extendRange("future")
  }

  async function extendRange(direction: "past" | "future") {
    if (pendingExtend.value === direction) return

    const range = loadedRange.value
    if (!range) return

    pendingExtend.value = direction

    const from = direction === "past" ? addMonths(range.from, -EXTEND_RANGE_MONTHS) : range.to
    const to = direction === "future" ? addMonths(range.to, EXTEND_RANGE_MONTHS) : range.from

    try {
      const result = await API.getDays({
        from: direction === "past" ? from : range.to,
        to: direction === "future" ? to : range.from,
        branchId: activeBranchId.value,
      })

      days.value = mergeDays(days.value, result)

      const current = loadedRange.value ?? range

      loadedRange.value = {
        from: direction === "past" ? from : current.from,
        to: direction === "future" ? to : current.to,
      }
    } catch (error) {
      console.error("Failed to extend range:", error)
    } finally {
      pendingExtend.value = null
    }
  }

  async function refreshDay(date: ISODate) {
    try {
      const day = await API.getDay(date)
      days.value = day ? updateDays(days.value, day) : days.value.filter((d) => d.date !== date)
    } catch (error) {
      console.error("Failed to refresh day:", error)
    }
  }

  async function refreshDays(dates: ISODate[]) {
    const unique = [...new Set(dates)]
    await Promise.all(unique.map((d) => refreshDay(d)))
  }

  async function loadRangeAround(date: ISODate, options: {markLoaded?: boolean} = {}) {
    if (options.markLoaded) isDaysLoaded.value = false

    const from = addMonths(date, -INITIAL_RANGE_MONTHS)
    const to = addMonths(date, INITIAL_RANGE_MONTHS)

    try {
      const result = await API.getDays({from, to, branchId: activeBranchId.value})
      days.value = result
      loadedRange.value = {from, to}
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      if (options.markLoaded) isDaysLoaded.value = true
    }
  }

  async function revalidate() {
    const range = loadedRange.value
    if (!range) return

    try {
      const result = await API.getDays({from: range.from, to: range.to, branchId: activeBranchId.value})
      days.value = result
    } catch (error) {
      console.error("Error revalidating tasks:", error)
    }
  }

  watch(
    () => activeBranchId.value,
    (newId, oldId) => {
      if (newId !== oldId && isDaysLoaded.value) {
        getTaskList()
      }
    },
  )

  return {
    loadedRange,
    getTaskList,
    ensureRangeForDate,
    extendRange,
    refreshDay,
    refreshDays,
    revalidate,
  }
}
