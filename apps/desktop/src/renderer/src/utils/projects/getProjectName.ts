import {NO_PROJECT_ID} from "@daily/protocol"

import type {Branch} from "@daily/protocol"

/** The name a project is shown under. `main` and a project that is not loaded both read as "No project"; the stored name "Main" is never shown. */
export function getProjectName(project: Branch | null | undefined): string {
  return !project || project.id === NO_PROJECT_ID ? "No project" : project.name
}
