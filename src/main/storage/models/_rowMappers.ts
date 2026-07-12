import {WINDOWS_CONFIG} from "@shared/config/windows"
import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {DEFAULT_ACCENT_ID, DEFAULT_BASE_ID} from "@shared/constants/theme"
import {deepMerge} from "@shared/utils/common/deepMerge"
import {isNumber, notNull} from "@shared/utils/common/validators"

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
        tags = parsed.filter((t: any) => notNull(t) && notNull(t.id))
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
        attachments = parsed.filter((a: any) => notNull(a))
      }
    } catch {
      /* empty */
    }
  }

  const orderIndex = isNumber(row.order_index) && Number.isFinite(row.order_index) ? row.order_index : Date.parse(row.created_at)

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
    appearance: {
      mode: "system",
      accent: DEFAULT_ACCENT_ID,
      base: DEFAULT_BASE_ID,
    },
    sync: {enabled: false},
    ai: null,
    branch: {activeId: MAIN_BRANCH_ID},
    layout: {
      sectionsHideEmpty: false,
      sectionsAutoCollapseEmpty: false,
      sectionsCollapsed: {active: false, discarded: false, done: false},
      leftPanel: {visible: true},
    },
    window: {
      main: {
        width: WINDOWS_CONFIG.main.width,
        height: WINDOWS_CONFIG.main.height,
        isMaximized: false,
        isFullScreen: false,
      },
    },
    updates: {skippedReleaseId: null, cached: null, installed: null},
  }
}

/**
 * Migrates a persisted settings blob from the old `themes` shape to `appearance`.
 * No-op (returns the input) when the blob already has `appearance` or has no `themes`.
 * @example migrateSettingsShape({themes: {current: "aurora", useSystem: false}})
 */
export function migrateSettingsShape(parsed: any): any {
  if (!parsed || typeof parsed !== "object") return parsed
  if (parsed.appearance || !parsed.themes) return parsed

  const old = parsed.themes
  const mode = old.useSystem ? "system" : (OLD_THEME_TYPE[old.current] ?? "dark")
  const accent = OLD_THEME_ACCENT[old.current] ?? DEFAULT_ACCENT_ID

  const {themes: _themes, ...rest} = parsed
  return {...rest, appearance: {mode, accent}}
}

export function rowToSettings(row: SettingsRow): Settings {
  const defaults = getDefaultSettings()
  try {
    const parsed = migrateSettingsShape(JSON.parse(row.data))
    return deepMerge<Settings>(defaults, parsed)
  } catch {
    return defaults
  }
}

export type {TaskRow, TagRow, BranchRow, FileRow, SettingsRow}

const OLD_THEME_TYPE: Record<string, "light" | "dark"> = {
  "github-light": "light",
  lofi: "light",
  "aurora-light": "light",
  "tokyo-light": "light",
  "bamboo-grove": "light",
  "ayu-light": "light",
  night: "dark",
  "github-dark": "dark",
  luxury: "dark",
  aurora: "dark",
  "tokyo-dark": "dark",
  "lofi-dark": "dark",
  neon: "dark",
  "ayu-dark": "dark",
}

const OLD_THEME_ACCENT: Record<string, string> = {
  "github-light": "blue",
  lofi: "teal",
  "aurora-light": "teal",
  "tokyo-light": "indigo",
  "bamboo-grove": "amber",
  "ayu-light": "orange",
  night: "blue",
  "github-dark": "blue",
  luxury: "teal",
  aurora: "teal",
  "tokyo-dark": "indigo",
  "lofi-dark": "teal",
  neon: "pink",
  "ayu-dark": "amber",
}
