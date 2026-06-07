import {isDevMode} from "@/constants/env"

import AiSettings from "../{fragments}/AiSettings"
import AppearanceSettings from "../{fragments}/AppearanceSettings"
import DeletedTasks from "../{fragments}/DeletedTasks"
import IconsList from "../{fragments}/IconsList.vue"
import SyncSettings from "../{fragments}/SyncSettings.vue"
import WorkspaceSettings from "../{fragments}/WorkspaceSettings"

import type {SettingsPanel} from "@/types/common"
import type {IconName} from "@/ui/base/BaseIcon"
import type {ComponentInstance} from "vue"

type SettingsSection = {
  id: Exclude<SettingsPanel, null>
  icon: IconName
  label: string
  component: ComponentInstance<any>
}

export const SECTIONS: SettingsSection[] = [
  {id: "appearance", icon: "appearance", label: "Appearance", component: AppearanceSettings},
  {id: "workspace", icon: "monitor", label: "Workspace", component: WorkspaceSettings},
  {id: "ai", icon: "ai", label: "AI ", component: AiSettings},
  {id: "sync", icon: "cloud", label: "iCloud Sync", component: SyncSettings},
  {id: "deleted-tasks", icon: "trash", label: "Deleted Tasks", component: DeletedTasks},
  ...(isDevMode ? [{id: "icons" as const, icon: "heading" as const, label: "Icons", component: IconsList}] : []),
]

export const SECTION_IDS = new Set<SettingsPanel>(SECTIONS.map((s) => s.id))
