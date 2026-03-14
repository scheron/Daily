import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {deepMerge} from "@shared/utils/common/deepMerge"

import {APP_CONFIG} from "@/config"

import type {Branch, File, Settings, Tag, Task} from "@shared/types/storage"

type TaskRow = {
  id: string
  status: string
  content: string
  minimized: number
  order_index: number
  scheduled_date: string
  scheduled_time: string
  scheduled_timezone: string
  estimated_time: number
  spent_time: number
  branch_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  tags_json: string | null
  attachments_json: string | null
}

type TagRow = {
  id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type BranchRow = {
  id: string
  name: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type FileRow = {
  id: string
  name: string
  mime_type: string
  size: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type SettingsRow = {
  id: string
  version: string
  data: string
  created_at: string
  updated_at: string
}

export function rowToTask(row: TaskRow): Task {
  let tags: Tag[] = []
  if (row.tags_json) {
    try {
      const parsed = JSON.parse(row.tags_json)
      if (Array.isArray(parsed)) {
        tags = parsed.filter((t: any) => t !== null && t.id !== null)
      }
    } catch {
      /* empty */
    }
  }

  let attachments: string[] = []
  if (row.attachments_json) {
    try {
      const parsed = JSON.parse(row.attachments_json)
      if (Array.isArray(parsed)) {
        attachments = parsed.filter((a: any) => a !== null)
      }
    } catch {
      /* empty */
    }
  }

  const orderIndex = typeof row.order_index === "number" && Number.isFinite(row.order_index) ? row.order_index : Date.parse(row.created_at)

  return {
    id: row.id,
    status: row.status as Task["status"],
    content: row.content,
    minimized: row.minimized === 1,
    orderIndex,
    scheduled: {
      date: row.scheduled_date,
      time: row.scheduled_time,
      timezone: row.scheduled_timezone,
    },
    estimatedTime: row.estimated_time,
    spentTime: row.spent_time,
    branchId: row.branch_id || MAIN_BRANCH_ID,
    tags,
    attachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function rowToBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function rowToFile(row: FileRow): File {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function getDefaultSettings(): Settings {
  return {
    version: "",
    themes: {
      current: "github-light",
      preferredLight: "github-light",
      preferredDark: "github-dark",
      useSystem: true,
      glassUI: false,
    },
    sidebar: {collapsed: false},
    sync: {enabled: false},
    ai: null,
    branch: {activeId: MAIN_BRANCH_ID},
    layout: {
      type: "list",
      columnsHideEmpty: false,
      columnsAutoCollapseEmpty: false,
      columnsCollapsed: {active: false, discarded: false, done: false},
    },
    window: {
      main: {
        width: APP_CONFIG.window.main.width,
        height: APP_CONFIG.window.main.height,
        isMaximized: false,
        isFullScreen: false,
      },
    },
    updates: {skippedReleaseId: null, cached: null, installed: null},
  }
}

export function rowToSettings(row: SettingsRow): Settings {
  const defaults = getDefaultSettings()
  try {
    const parsed = JSON.parse(row.data)
    return deepMerge<Settings>(defaults, parsed)
  } catch {
    return defaults
  }
}

export type {TaskRow, TagRow, BranchRow, FileRow, SettingsRow}
