import type {TaskStatus} from "@shared/types/storage"

export type TasksFilter = "all" | TaskStatus
export type SettingsPanel = "appearance" | "workspace" | "ai" | "themes" | "sync" | "icons" | "deleted-tasks" | null
