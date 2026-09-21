import {deleteTaskTool} from "./deleteTask"
import {saveMilestoneTool} from "./saveMilestone"
import {saveProjectTool} from "./saveProject"
import {saveTagTool} from "./saveTag"
import {saveTaskTool} from "./saveTask"

import type {AgentTool} from "../types"

export const WRITE_TOOLS: readonly AgentTool[] = [saveTaskTool, deleteTaskTool, saveProjectTool, saveMilestoneTool, saveTagTool]
