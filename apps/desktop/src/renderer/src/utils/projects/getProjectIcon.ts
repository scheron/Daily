import {NO_PROJECT_ID} from "@daily/protocol"

import type {IconName} from "@/types/icons"
import type {Branch} from "@daily/protocol"

export function getProjectIcon(project: Pick<Branch, "id"> | null | undefined): IconName {
  return !project || project.id === NO_PROJECT_ID ? "project-off" : "project"
}
