import {isDevMode} from "@/constants/env"

import AiSettings from "../{fragments}/AiSettings"
import DebugSettings from "../{fragments}/DebugSettings"
import GeneralSettings from "../{fragments}/GeneralSettings"
import IcloudSettings from "../{fragments}/IcloudSettings"
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
  {id: "general", icon: "cog", label: "General", component: GeneralSettings},
  {id: "workflow", icon: "monitor", label: "Workflow", component: WorkspaceSettings},
  {id: "icloud", icon: "cloud", label: "iCloud", component: IcloudSettings},
  {id: "ai", icon: "ai", label: "AI", component: AiSettings},
  ...(isDevMode ? [{id: "debug", icon: "code", label: "DEBUG", component: DebugSettings} as SettingsSection] : []),
]

export const SECTION_IDS = new Set<SettingsPanel>(SECTIONS.map((s) => s.id))
