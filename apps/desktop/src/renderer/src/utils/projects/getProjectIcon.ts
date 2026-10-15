import {NO_PROJECT_ID} from "@daily/protocol"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Branch} from "@daily/protocol"

export function getProjectIcon(project: Branch | null | undefined): IconName {
  return !project || project.id === NO_PROJECT_ID ? "project-off" : "project"
}
