import {isDevMode} from "@/constants/env"
import AiSettings from "@/ui/views/Settings/{fragments}/AiSettings"
import DebugSettings from "@/ui/views/Settings/{fragments}/DebugSettings"
import GeneralSettings from "@/ui/views/Settings/{fragments}/GeneralSettings"
import SyncSettings from "@/ui/views/Settings/{fragments}/SyncSettings"
import WorkspaceSettings from "@/ui/views/Settings/{fragments}/WorkspaceSettings"

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
  {id: "general", icon: "cog", label: "General", component: GeneralSettings},
  {id: "workflow", icon: "monitor", label: "Workflow", component: WorkspaceSettings},
  {id: "icloud", icon: "cloud", label: "Remote", component: SyncSettings},
  {id: "ai", icon: "ai", label: "AI", component: AiSettings},
  ...(isDevMode ? [{id: "debug", icon: "code", label: "DEBUG", component: DebugSettings} as SettingsSection] : []),
]

export const SECTION_IDS = new Set<SettingsPanel>(SECTIONS.map((s) => s.id))
