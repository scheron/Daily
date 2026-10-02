import {getTime, getTimezone, getToday} from "@daily/std"

import {useBranchesStore} from "@/stores/branches.store"
import {useTagsStore} from "@/stores/tags.store"
import {getUpcomingDays} from "../utils/getUpcomingDays"
import {parseDayMonth} from "../utils/parseDayMonth"
import {parseDuration} from "../utils/parseDuration"

import type {TaskDraft} from "@/types/taskDraft"
import type {NestedCommand, NestedItem, SlashCommandsOptions} from "@/utils/codemirror/extensions"
import type {Task, TaskStatus} from "@daily/protocol"
import type {ComputedRef} from "vue"

/**
 * @param task The task being edited
 * @param patch Applies a partial update to whichever draft owns the task; owns the status/date rules
 */
export function useTaskSlashCommands(task: ComputedRef<Task>, patch: (updates: Partial<TaskDraft>) => void): SlashCommandsOptions {
  const branchesStore = useBranchesStore()
  const tagsStore = useTagsStore()

  const commands: NestedCommand[] = [
    {label: "Status", icon: "fire", getItems: getStatusItems},
    {label: "Date", icon: "calendar", getItems: getDateItems},
    {label: "Project", icon: "project", getItems: getProjectItems},
    {label: "Estimate", icon: "stopwatch", getItems: getEstimateItems},
    {label: "Add Tag", icon: "tags", getItems: (query) => getTagItems(tagsStore.tagsForBranch(task.value.branchId), query, addTag)},
    {
      label: "Remove Tag",
      icon: "tags-off",
      tone: "remove",
      isAvailable: () => task.value.tags.length > 0,
      getItems: (query) => getTagItems(task.value.tags, query, removeTag),
    },
  ]

  function getStatusItems(query: string): NestedItem[] {
    const statuses: {status: TaskStatus; label: string; icon: NestedItem["icon"]}[] = [
      {status: "backlog", label: "Backlog", icon: "bookmark"},
      {status: "active", label: "Active", icon: "fire"},
      {status: "done", label: "Done", icon: "check-check"},
      {status: "discarded", label: "Discarded", icon: "archive"},
    ]

    return statuses
      .filter((item) => matches(item.label, query))
      .map((item) => ({
        label: item.label,
        icon: item.icon,
        apply: () => patch({status: item.status}),
      }))
  }

  function getDateItems(query: string): NestedItem[] {
    const today = getToday()
    const days = [
      {date: today, label: "Today"},
      ...getUpcomingDays(today, 1, 1).map((day) => ({...day, label: "Tomorrow"})),
      ...getUpcomingDays(today, 2, 6),
    ]
    const items = days
      .filter((day) => matches(day.label, query))
      .map((day) => ({label: day.label, icon: "calendar" as const, apply: () => setDate(day.date)}))

    const typed = parseDayMonth(query, today)
    if (typed) items.push({label: query, icon: "calendar", apply: () => setDate(typed)})
    return items
  }

  function getProjectItems(query: string): NestedItem[] {
    return branchesStore.orderedBranches
      .filter((branch) => matches(branch.name, query))
      .map((branch) => ({
        label: branch.name,
        icon: "project",
        apply: () => {
          if (branch.id !== task.value.branchId) patch({branchId: branch.id})
        },
      }))
  }

  function getEstimateItems(query: string): NestedItem[] {
    const presets = [
      {label: "15m", seconds: 15 * 60},
      {label: "30m", seconds: 30 * 60},
      {label: "1h", seconds: 60 * 60},
      {label: "2h", seconds: 2 * 60 * 60},
    ]
    const typed = parseDuration(query)

    const visible = presets.filter((preset) => matches(preset.label, query) || preset.seconds === typed)
    const items = visible.map((preset) => ({
      label: preset.label,
      icon: "stopwatch" as const,
      apply: () => patch({estimatedTime: preset.seconds}),
    }))

    if (typed && !visible.some((preset) => preset.seconds === typed)) {
      items.push({label: query, icon: "stopwatch", apply: () => patch({estimatedTime: typed})})
    }
    return items
  }

  function getTagItems(tags: Task["tags"], query: string, apply: (tag: Task["tags"][number]) => void): NestedItem[] {
    return [...tags]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
      .filter((tag) => matches(tag.name, query))
      .map((tag) => ({label: tag.name, color: tag.color, apply: () => apply(tag)}))
  }

  function setDate(date: string) {
    const scheduled = task.value.scheduled
    if (date === scheduled?.date) return
    patch({scheduled: scheduled ? {...scheduled, date} : {date, time: getTime(), timezone: getTimezone()}})
  }

  function addTag(tag: Task["tags"][number]) {
    if (task.value.tags.some((t) => t.id === tag.id)) return
    patch({tags: [...task.value.tags, tag]})
  }

  function removeTag(tag: Task["tags"][number]) {
    if (!task.value.tags.some((t) => t.id === tag.id)) return
    patch({tags: task.value.tags.filter((t) => t.id !== tag.id)})
  }

  return {commands}
}

function matches(label: string, query: string): boolean {
  return !query || label.toLowerCase().includes(query.toLowerCase())
}
