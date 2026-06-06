import {MAIN_BRANCH_ID} from "@shared/constants/storage"

import {formatProject} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const listProjects: RegisteredTool = {
  name: "list_projects",
  description:
    "List all projects with IDs and show which one is currently active. Use before switching, renaming, deleting, or moving tasks between projects.",
  parameters: {
    type: "object",
    properties: {},
  },
  isWrite: false,
  isDestructive: false,
  async execute(_params, ctx) {
    const [projects, settings] = await Promise.all([ctx.storage.getBranchList(), ctx.storage.loadSettings()])
    const activeId = settings.branch?.activeId ?? MAIN_BRANCH_ID

    if (!projects.length) {
      return {success: true, data: "No projects found"}
    }

    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}))
    const rows = sorted.map((project, i) => `${i + 1}. ${formatProject(project, {active: project.id === activeId})}`)
    return {success: true, data: `Projects (${sorted.length} total):\n${rows.join("\n")}`}
  },
}
